/* ══════════════════════════════════════════════════════
   Flow TGL v2.0 — core.js
   Supabase | Auth (v2: signInWithPassword + RLS) | DB | Sync | Utils
   Carregado em todas as páginas antes de qualquer JS de módulo.
══════════════════════════════════════════════════════ */

'use strict';

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
const SUPA_URL = 'https://bobzfvyqqxapvoabtejl.supabase.co';
const SUPA_KEY = 'sb_publishable_yyFwUYtK5D24yeAsd6jkjQ_UuizdNAA';
const APP_VERSION = '2.0.0';

// ─── TABELAS (gerar_producao.py substitui _dev → '' em produção) ─────────────
const _BLOB_KEY     = 'tgl_v3';
const _AUDIT_TABLE  = 'tgl_audit_log';
const _OPS_TABLE    = 'tgl_ops';
const _STOCK_TABLE  = 'tgl_stock';
const _MOV_TABLE    = 'tgl_movements';
const _PROD_TABLE   = 'tgl_products';
const _CLI_TABLE    = 'tgl_clients';
const _RM_TABLE     = 'tgl_rawmaterials';
const _PACK_TABLE   = 'tgl_packaging';
const _SUPP_TABLE   = 'tgl_suppliers';
const _USERS_TABLE    = 'tgl_users';
const _CHAT_TABLE     = 'tgl_messages';   // gerar_producao_v2.py: → tgl_messages
const _PRESENCE_TABLE = 'tgl_presence';   // gerar_producao_v2.py: → tgl_presence

// RPCs de estoque (gerar_producao.py também substitui _dev → '' nas 4 abaixo)
const _RPC_DEDUCT   = 'deduct_stock';
const _RPC_SET_RM   = 'set_rm_stock';
const _RPC_ADJ_RM   = 'adjust_rm_stock';
const _RPC_SET_PK   = 'set_pk_stock';
const _RPC_ADJ_PK   = 'adjust_pk_stock';

// ─── ESTADO GLOBAL ───────────────────────────────────────────────────────────
let _db   = null;
let S     = null;   // usuário logado
let _loginAt = 0;
let _faUser  = null;

// Baselines para detecção de mudança
let _lastSavedOpsStr   = {};
let _lastSavedStockStr = {};
let _pkServerAt        = {};
let _lastSavedMovIds   = new Set();
let _lastSavedProdStr  = {};
let _lastSavedCliStr   = {};
let _lastSavedRMStr    = {};
let _lastSavedPackStr  = {};
let _lastSavedSuppStr  = {};
let _lastSavedUsersStr = {};

// Save pipeline
let _saveInProgress = false;
let _saveQueue      = null;
let _failedPayload  = null;
let _lastSaveAt     = 0;

// Audit log (em memória)
let _auditLog = [];

// ─── JWT PERSISTENCE (sessão entre páginas) ───────────────────────────────────
// Restaura JWT do sessionStorage no carregamento de cada página
(function() {
  const stored = sessionStorage.getItem('tgl_jwt');
  if (stored) window._supaJwt = stored;
})();

// ─── FETCH HELPER ─────────────────────────────────────────────────────────────
async function _sf(path, opts = {}) {
  const token = window._supaJwt || SUPA_KEY;
  return fetch(SUPA_URL + path, {
    ...opts,
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
}

// ─── OPS TABLE ───────────────────────────────────────────────────────────────
async function _loadOps() {
  const r = await _sf('/rest/v1/' + _OPS_TABLE + '?select=id,data&order=updated_at.asc');
  if (!r.ok) return null;
  const rows = await r.json();
  _lastSavedOpsStr = {};
  rows.forEach(row => { _lastSavedOpsStr[row.id] = JSON.stringify(row.data); });
  return rows.map(row => row.data);
}

async function _saveOpsToTable(ops) {
  const changed = (ops || []).filter(op => JSON.stringify(op) !== _lastSavedOpsStr[op.id]);
  if (!changed.length) return;
  const rows = changed.map(op => ({ id: op.id, data: op, status: op.status || 'pendente', updated_at: new Date().toISOString() }));
  const r = await _sf('/rest/v1/' + _OPS_TABLE, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error('[TGL] ops upsert HTTP ' + r.status);
  changed.forEach(op => { _lastSavedOpsStr[op.id] = JSON.stringify(op); });
}

// ─── STOCK TABLE ─────────────────────────────────────────────────────────────
async function _loadStock() {
  const r = await _sf('/rest/v1/' + _STOCK_TABLE + '?select=id,data');
  if (!r.ok) return null;
  const rows = await r.json();
  _lastSavedStockStr = {};
  _pkServerAt = {};
  const stock = {}, rmStock = {}, pkStock = {}, pkStockAt = {};
  rows.forEach(({ id, data }) => {
    if (id.startsWith('P:')) {
      stock[id.slice(2)] = data;
      _lastSavedStockStr[id] = JSON.stringify(data);
    } else if (id.startsWith('RM:')) {
      rmStock[id.slice(3)] = data;
      _lastSavedStockStr[id] = JSON.stringify(data);
    } else if (id.startsWith('PK:')) {
      const pid = id.slice(3);
      const qty = data && typeof data === 'object' && 'qty' in data ? data.qty : data;
      pkStock[pid] = qty;
      if (data && data.at) { pkStockAt[pid] = data.at; _pkServerAt[pid] = data.at; }
      _lastSavedStockStr[id] = JSON.stringify({ qty });
    }
  });
  return { stock, rawMaterialStock: rmStock, packagingStock: pkStock, packagingStockAt: pkStockAt };
}

async function _saveStockToTable(d) {
  const rows = [];
  Object.entries(d.stock || {}).forEach(([pid, val]) => {
    const id = 'P:' + pid;
    if (JSON.stringify(val) !== _lastSavedStockStr[id]) rows.push({ id, data: val, updated_at: new Date().toISOString() });
  });
  Object.entries(d.rawMaterialStock || {}).forEach(([mid, val]) => {
    const id = 'RM:' + mid;
    if (JSON.stringify(val) !== _lastSavedStockStr[id]) rows.push({ id, data: val, updated_at: new Date().toISOString() });
  });
  Object.entries(d.packagingStock || {}).forEach(([pid, val]) => {
    const id = 'PK:' + pid;
    if (JSON.stringify({ qty: val }) === _lastSavedStockStr[id]) return;
    const at = (d.packagingStockAt || {})[pid] || _pkServerAt[pid] || null;
    const data = at ? { qty: val, at } : { qty: val };
    rows.push({ id, data, updated_at: new Date().toISOString() });
  });
  if (!rows.length) return;
  await _sf('/rest/v1/' + _STOCK_TABLE, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows)
  }).then(r => {
    if (!r.ok) throw new Error('[TGL] stock upsert HTTP ' + r.status);
    rows.forEach(row => {
      _lastSavedStockStr[row.id] = row.id.startsWith('PK:') ? JSON.stringify({ qty: row.data.qty }) : JSON.stringify(row.data);
      if (row.id.startsWith('PK:') && row.data.at) _pkServerAt[row.id.slice(3)] = row.data.at;
    });
  });
}

// ─── STOCK RPCs ──────────────────────────────────────────────────────────────
async function _rpcDeductStock(stockId, qty) {
  const r = await _sf('/rest/v1/rpc/' + _RPC_DEDUCT, {
    method: 'POST', body: JSON.stringify({ p_stock_id: stockId, p_qty: qty, p_at: Date.now() })
  });
  if (!r.ok) { const t = await r.text(); throw new Error('[TGL] deduct_stock ' + r.status + ': ' + t); }
  return r.json();
}
async function _rpcSetRM(rmId, qty, supplierId) {
  const r = await _sf('/rest/v1/rpc/' + _RPC_SET_RM, {
    method: 'POST', body: JSON.stringify({ p_rm_id: rmId, p_supplier_id: supplierId, p_qty: qty, p_at: Date.now() })
  });
  if (!r.ok) { const t = await r.text(); throw new Error('[TGL] set_rm_stock ' + r.status + ': ' + t); }
  return r.json();
}
async function _rpcAdjRM(rmId, qty, supplierId) {
  const r = await _sf('/rest/v1/rpc/' + _RPC_ADJ_RM, {
    method: 'POST', body: JSON.stringify({ p_rm_id: rmId, p_supplier_id: supplierId, p_delta: qty, p_at: Date.now() })
  });
  if (!r.ok) { const t = await r.text(); throw new Error('[TGL] adjust_rm_stock ' + r.status + ': ' + t); }
  return r.json();
}
async function _rpcSetPK(pkId, qty) {
  const r = await _sf('/rest/v1/rpc/' + _RPC_SET_PK, {
    method: 'POST', body: JSON.stringify({ p_pk_id: pkId, p_qty: qty, p_at: Date.now() })
  });
  if (!r.ok) { const t = await r.text(); throw new Error('[TGL] set_pk_stock ' + r.status + ': ' + t); }
  return r.json();
}
async function _rpcAdjPK(pkId, qty) {
  const r = await _sf('/rest/v1/rpc/' + _RPC_ADJ_PK, {
    method: 'POST', body: JSON.stringify({ p_pk_id: pkId, p_delta: qty, p_at: Date.now() })
  });
  if (!r.ok) { const t = await r.text(); throw new Error('[TGL] adjust_pk_stock ' + r.status + ': ' + t); }
  return r.json();
}

// ─── MOVEMENTS TABLE ─────────────────────────────────────────────────────────
async function _loadMovements() {
  const r = await _sf('/rest/v1/' + _MOV_TABLE + '?select=id,data,category&order=updated_at.asc');
  if (!r.ok) return null;
  const rows = await r.json();
  _lastSavedMovIds = new Set(rows.map(r => r.id));
  return {
    rawMaterialMovements: rows.filter(r => r.category === 'raw').map(r => r.data),
    packagingMovements: rows.filter(r => r.category === 'pack').map(r => r.data)
  };
}

async function _saveMovementsToTable(d) {
  const toInsert = [
    ...(d.rawMaterialMovements || []).filter(m => !_lastSavedMovIds.has(m.id)).map(m => ({ id: m.id, data: m, category: 'raw', updated_at: new Date().toISOString() })),
    ...(d.packagingMovements || []).filter(m => !_lastSavedMovIds.has(m.id)).map(m => ({ id: m.id, data: m, category: 'pack', updated_at: new Date().toISOString() }))
  ];
  if (!toInsert.length) return;
  const r = await _sf('/rest/v1/' + _MOV_TABLE, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(toInsert)
  });
  if (!r.ok) throw new Error('[TGL] movements insert HTTP ' + r.status);
  toInsert.forEach(row => _lastSavedMovIds.add(row.id));
}

// ─── ENTITY TABLE HELPERS ────────────────────────────────────────────────────
async function _loadEntityTable(table, lastSavedRef) {
  const r = await _sf('/rest/v1/' + table + '?select=id,data&order=updated_at.asc');
  if (!r.ok) return null;
  const rows = await r.json();
  rows.forEach(row => { lastSavedRef[row.id] = JSON.stringify(row.data); });
  return rows.map(row => row.data);
}

async function _saveEntityTable(table, items, lastSavedRef) {
  const currentIds = new Set((items || []).map(x => x.id));
  const changed = (items || []).filter(x => JSON.stringify(x) !== lastSavedRef[x.id]);
  const toDelete = Object.keys(lastSavedRef).filter(id => !currentIds.has(id));
  if (currentIds.size === 0 && toDelete.length > 0) {
    console.warn('[TGL] _saveEntityTable(' + table + '): bloqueado mass-delete');
    return;
  }
  const ps = [];
  if (changed.length) {
    const rows = changed.map(x => ({ id: x.id, data: x, updated_at: new Date().toISOString() }));
    ps.push(_sf('/rest/v1/' + table, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows)
    }).then(r => {
      if (!r.ok) throw new Error('[TGL] ' + table + ' upsert HTTP ' + r.status);
      changed.forEach(x => { lastSavedRef[x.id] = JSON.stringify(x); });
    }));
  }
  if (toDelete.length) {
    const idsParam = toDelete.map(id => '"' + id.replace(/"/g, '\\"') + '"').join(',');
    ps.push(_sf('/rest/v1/' + table + '?id=in.(' + idsParam + ')', { method: 'DELETE' })
      .then(r => { if (r.ok) toDelete.forEach(id => delete lastSavedRef[id]); }));
  }
  if (ps.length) await Promise.all(ps);
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
async function _loadAuditLog() {
  try {
    const r = await _sf('/rest/v1/' + _AUDIT_TABLE + '?select=*&order=at.desc&limit=500');
    if (!r.ok) return;
    const rows = await r.json();
    if (rows && rows.length > 0) _auditLog = rows;
  } catch (e) { console.warn('[TGL] audit load:', e); }
}

function logAction(actionOrDb, actionOrDetails, details) {
  // Suporta logAction(action, details) e logAction(d, action, details)
  const action  = details !== undefined ? actionOrDetails : actionOrDb;
  const det     = details !== undefined ? details : actionOrDetails;
  if (!S) return;
  const entry = { id: uid(), at: Date.now(), uid: S.id, uname: S.name, action, details: det || '' };
  _auditLog.unshift(entry);
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  _auditLog = _auditLog.filter(e => e.at >= cutoff);
  _sf('/rest/v1/' + _AUDIT_TABLE, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(entry)
  }).catch(e => console.warn('[TGL] audit insert:', e));
}

// ─── LOAD DB ──────────────────────────────────────────────────────────────────
async function loadDB() {
  try {
    const [blobRes, opsLoaded, stockLoaded, movsLoaded, prodsLoaded, clisLoaded, rmsLoaded, packsLoaded, suppsLoaded, usersLoaded] = await Promise.all([
      _sf('/rest/v1/app_data?key=eq.' + _BLOB_KEY + '&select=data'),
      _loadOps().catch(e => { console.warn('[TGL] ops load:', e); return null; }),
      _loadStock().catch(e => { console.warn('[TGL] stock load:', e); return null; }),
      _loadMovements().catch(e => { console.warn('[TGL] movements load:', e); return null; }),
      _loadEntityTable(_PROD_TABLE, _lastSavedProdStr).catch(e => { console.warn('[TGL] products load:', e); return null; }),
      _loadEntityTable(_CLI_TABLE, _lastSavedCliStr).catch(e => { console.warn('[TGL] clients load:', e); return null; }),
      _loadEntityTable(_RM_TABLE, _lastSavedRMStr).catch(e => { console.warn('[TGL] rawMaterials load:', e); return null; }),
      _loadEntityTable(_PACK_TABLE, _lastSavedPackStr).catch(e => { console.warn('[TGL] packaging load:', e); return null; }),
      _loadEntityTable(_SUPP_TABLE, _lastSavedSuppStr).catch(e => { console.warn('[TGL] suppliers load:', e); return null; }),
      _loadEntityTable(_USERS_TABLE, _lastSavedUsersStr).catch(e => { console.warn('[TGL] users load:', e); return null; })
    ]);

    if (!blobRes.ok) throw new Error('HTTP ' + blobRes.status);
    const rows = await blobRes.json();
    if (rows && rows.length > 0) {
      _db = { ...idb(), ...rows[0].data };
    } else {
      _db = idb();
      const { ops: _o, auditLog: _a, ...blobOnly } = _db;
      await _sf('/rest/v1/app_data', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: _BLOB_KEY, data: { ...blobOnly, ops: [], stock: {}, rawMaterialStock: {}, packagingStock: {}, rawMaterialMovements: [], packagingMovements: [], products: [], clients: [], rawMaterials: [], packaging: [], suppliers: [], users: [] }, updated_at: new Date().toISOString() })
      });
    }

    // OPs
    if (opsLoaded !== null && opsLoaded.length > 0) { _db.ops = opsLoaded; }
    else if (_db.ops && _db.ops.length > 0) { await _saveOpsToTable(_db.ops); }
    else { _db.ops = _db.ops || []; }

    // Estoque
    const _stockHasData = stockLoaded && (Object.keys(stockLoaded.stock).length || Object.keys(stockLoaded.rawMaterialStock).length || Object.keys(stockLoaded.packagingStock).length);
    if (_stockHasData) {
      _db.stock = stockLoaded.stock; _db.rawMaterialStock = stockLoaded.rawMaterialStock;
      _db.packagingStock = stockLoaded.packagingStock; _db.packagingStockAt = stockLoaded.packagingStockAt || {};
    } else if (stockLoaded !== null) {
      const _has = Object.keys(_db.stock || {}).length || Object.keys(_db.rawMaterialStock || {}).length || Object.keys(_db.packagingStock || {}).length;
      if (_has) await _saveStockToTable(_db);
    }

    // Movimentos
    const _movsHasData = movsLoaded && ((movsLoaded.rawMaterialMovements || []).length || (movsLoaded.packagingMovements || []).length);
    if (_movsHasData) { _db.rawMaterialMovements = movsLoaded.rawMaterialMovements; _db.packagingMovements = movsLoaded.packagingMovements; }
    else if (movsLoaded !== null) {
      const _has = (_db.rawMaterialMovements || []).length || (_db.packagingMovements || []).length;
      if (_has) await _saveMovementsToTable(_db);
    }

    // Entidades
    function _migrateEntity(loaded, key, table, ref) {
      if (loaded !== null && loaded.length > 0) { _db[key] = loaded; }
      else {
        if ((_db[key] || []).length > 0) { _saveEntityTable(table, _db[key], ref).catch(e => console.warn('[TGL]', key, 'migrate:', e)); }
        else { _db[key] = _db[key] || []; }
      }
    }
    _migrateEntity(prodsLoaded, 'products', _PROD_TABLE, _lastSavedProdStr);
    _migrateEntity(clisLoaded, 'clients', _CLI_TABLE, _lastSavedCliStr);
    _migrateEntity(rmsLoaded, 'rawMaterials', _RM_TABLE, _lastSavedRMStr);
    _migrateEntity(packsLoaded, 'packaging', _PACK_TABLE, _lastSavedPackStr);
    _migrateEntity(suppsLoaded, 'suppliers', _SUPP_TABLE, _lastSavedSuppStr);
    _migrateEntity(usersLoaded, 'users', _USERS_TABLE, _lastSavedUsersStr);

    _loadAuditLog();
    setSyncBadge(true);
  } catch (e) {
    console.error('[TGL] loadDB:', e);
    try { const bk = localStorage.getItem('tgl_bk'); if (bk) _db = JSON.parse(bk); } catch {}
    if (!_db) _db = idb();
    setSyncBadge(false);
  }
}

// ─── SAVE DB REMOTE ───────────────────────────────────────────────────────────
async function saveDBRemote(d) {
  if (window._blockAllSaves) return;
  _saveQueue = d;
  if (_saveInProgress) return;
  _saveInProgress = true;
  setSyncBadge(null);
  while (_saveQueue) {
    const { auditLog: _al, ops: _opsArr, stock: _stk, rawMaterialStock: _rmStk, packagingStock: _pkStk, packagingStockAt: _pkStockAt, rawMaterialMovements: _rmMovs, packagingMovements: _pkMovs, products: _prods, clients: _clis, rawMaterials: _rms, packaging: _packs, suppliers: _supps, users: _usrs, ...blobPayload } = _saveQueue;
    const opsToSave = _opsArr || [];
    _saveQueue = null;
    let attempt = 0, success = false;
    while (attempt < 3 && !success) {
      attempt++;
      try {
        const [blobRes] = await Promise.all([
          _sf('/rest/v1/rpc/merge_app_data', { method: 'POST', body: JSON.stringify({ p_key: _BLOB_KEY, p_local: { ...blobPayload, ops: [], stock: {}, rawMaterialStock: {}, packagingStock: {}, rawMaterialMovements: [], packagingMovements: [], products: [], clients: [], rawMaterials: [], packaging: [], suppliers: [], users: [] } }) }),
          _saveOpsToTable(opsToSave).catch(e => console.warn('[TGL] ops save:', e)),
          _saveStockToTable({ stock: _stk || {}, rawMaterialStock: _rmStk || {}, packagingStock: _pkStk || {}, packagingStockAt: _pkStockAt || {} }).catch(e => console.warn('[TGL] stock save:', e)),
          _saveMovementsToTable({ rawMaterialMovements: _rmMovs || [], packagingMovements: _pkMovs || [] }).catch(e => console.warn('[TGL] movements save:', e)),
          _saveEntityTable(_PROD_TABLE, _prods || [], _lastSavedProdStr).catch(e => console.warn('[TGL] products save:', e)),
          _saveEntityTable(_CLI_TABLE, _clis || [], _lastSavedCliStr).catch(e => console.warn('[TGL] clients save:', e)),
          _saveEntityTable(_RM_TABLE, _rms || [], _lastSavedRMStr).catch(e => console.warn('[TGL] rawMaterials save:', e)),
          _saveEntityTable(_PACK_TABLE, _packs || [], _lastSavedPackStr).catch(e => console.warn('[TGL] packaging save:', e)),
          _saveEntityTable(_SUPP_TABLE, _supps || [], _lastSavedSuppStr).catch(e => console.warn('[TGL] suppliers save:', e)),
          _saveEntityTable(_USERS_TABLE, _usrs || [], _lastSavedUsersStr).catch(e => console.warn('[TGL] users save:', e))
        ]);
        if (!blobRes.ok) throw new Error('HTTP ' + blobRes.status);
        const merged = await blobRes.json();
        if (merged && typeof merged === 'object') {
          merged.ops = _db.ops; merged.stock = _db.stock; merged.rawMaterialStock = _db.rawMaterialStock;
          merged.packagingStock = _db.packagingStock; merged.packagingStockAt = _db.packagingStockAt;
          merged.rawMaterialMovements = _db.rawMaterialMovements; merged.packagingMovements = _db.packagingMovements;
          merged.products = _db.products; merged.clients = _db.clients; merged.rawMaterials = _db.rawMaterials;
          merged.packaging = _db.packaging; merged.suppliers = _db.suppliers; merged.users = _db.users;
          if (_saveQueue === null) { _db = merged; }
          try { localStorage.setItem('tgl_bk', JSON.stringify(merged)); } catch {}
          _checkForceLogout(merged);
        }
        _failedPayload = null; _lastSaveAt = Date.now();
        const _eb = document.getElementById('save-err-bar'); if (_eb) _eb.remove();
        success = true;
      } catch (e) {
        console.error('[TGL] save attempt ' + attempt + ':', e);
        if (attempt < 3) await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }
    if (!success) { _failedPayload = blobPayload; setSyncBadge(false); _showSaveError(); }
    else { setSyncBadge(true); }
  }
  _saveInProgress = false;
}

function _showSaveError() {
  let bar = document.getElementById('save-err-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'save-err-bar';
    bar.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:8px;padding:10px 16px;font-size:13px;z-index:9999;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.5)';
    document.body.appendChild(bar);
  }
  bar.innerHTML = '⚠️ Falha ao salvar. <button class="btn btn-sm" style="background:#991b1b;color:#fca5a5;border:1px solid #b91c1c;padding:4px 10px" onclick="_retrySave()">Tentar novamente</button>';
}
window._retrySave = function() { _failedPayload = null; document.getElementById('save-err-bar')?.remove(); saveDBRemote(_db); };

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
function gdb() { return _db || idb(); }
function sdb(d) { _db = d; try { localStorage.setItem('tgl_bk', JSON.stringify(d)); } catch {} saveDBRemote(d); }
function idb() {
  return {
    users: [{ id: 'u1', name: 'Administrador', email: 'admin@tgltelecom.com.br', password: 'admin123', role: 'admin', firstAccess: false, pending: false }],
    clients: [], products: [], ops: [], stock: {}, seq: 1000, presence: {}, auditLog: [],
    alerts: {}, forceLogout: {}, rawMaterials: [], packaging: [], suppliers: [],
    rawMaterialStock: {}, packagingStock: {}, rawMaterialMovements: [], packagingMovements: [],
    purchaseOrders: [], notifications: [], requisicoes: [], compras: []
  };
}
function uid() { return '_' + Math.random().toString(36).substr(2, 9); }

// ─── AUTH — v2.0: supabase.auth.signInWithPassword + RLS ─────────────────────
async function hashPw(pw) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(pw + 'TGL_SALT_v1'));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function isHashed(pw) { return typeof pw === 'string' && pw.length === 64 && /^[0-9a-f]+$/.test(pw); }

async function doLogin() {
  const em = val('l-email').trim(), pw = val('l-pw');
  if (!em || !pw) { lerr('Preencha e-mail e senha.'); return; }

  // 1. Verificar credenciais no tgl_users
  let u = gdb().users.find(x => x.email.toLowerCase() === em.toLowerCase() && !x.pending);
  if (!u) { lerr('Usuário não encontrado ou aguardando aprovação.'); return; }

  let valid = false;
  if (isHashed(u.password)) {
    valid = (await hashPw(pw)) === u.password;
  } else {
    valid = u.password === pw;
    if (valid) {
      const hashed = await hashPw(pw);
      const d2 = gdb(); const i = d2.users.findIndex(x => x.id === u.id);
      if (i >= 0) { d2.users[i].password = hashed; sdb(d2); }
    }
  }
  if (!valid) { lerr('Senha incorreta.'); return; }
  u = gdb().users.find(x => x.email.toLowerCase() === em.toLowerCase() && !x.pending) || u;

  // 2. Autenticar no Supabase Auth para obter JWT (RLS)
  try {
    const authRes = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: em, password: pw })
    });
    if (authRes.ok) {
      const authData = await authRes.json();
      window._supaJwt = authData.access_token;
      sessionStorage.setItem('tgl_jwt', authData.access_token);
    }
    // Se o auth.signInWithPassword falhar (usuário não existe no Supabase Auth ainda),
    // continua com a anon key — RLS virá na v2.0 após migração completa
  } catch (e) { console.warn('[TGL] Supabase Auth:', e); }

  if (u.firstAccess) { _faUser = u; showLF('first'); return; }
  startApp(u);
}

async function doFirstAccess() {
  const p1 = val('fa-p1'), p2 = val('fa-p2');
  if (!p1 || p1.length < 6) { faerr('Mínimo 6 caracteres.'); return; }
  if (p1 !== p2) { faerr('As senhas não conferem.'); return; }

  const btn = document.querySelector('#lf-first .btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  // 1. Atualizar senha no Supabase Auth (para que o JWT continue funcionando)
  try {
    if (window._supaJwt) {
      await fetch(SUPA_URL + '/auth/v1/user', {
        method: 'PUT',
        headers: { apikey: SUPA_KEY, 'Authorization': 'Bearer ' + window._supaJwt, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p1 })
      });
    }
  } catch (e) { console.warn('[TGL] Auth password update:', e); }

  // 2. Atualizar hash em tgl_users
  const hashed = await hashPw(p1);
  const d = gdb(); const i = d.users.findIndex(x => x.id === _faUser.id);
  if (i < 0) { faerr('Usuário não encontrado. Recarregue a página.'); if (btn) { btn.disabled = false; btn.textContent = 'Definir senha'; } return; }
  d.users[i].password = hashed; d.users[i].firstAccess = false;
  sdb(d); _faUser = null; showLF('login');
  toast('Senha definida! Faça login com a nova senha.', 'ok');
}

function doRegister() {
  const name = val('reg-name').trim(), email = val('reg-email').trim();
  if (!name || !email) { regerr('Preencha todos os campos.'); return; }
  const d = gdb();
  if (d.users.find(x => x.email.toLowerCase() === email.toLowerCase())) { regerr('E-mail já cadastrado.'); return; }
  d.users.push({ id: uid(), name, email, password: '', role: 'preformados', firstAccess: true, pending: true });
  sdb(d); toast('Solicitação enviada! Aguarde aprovação.', 'ok'); showLF('login');
}

function startApp(u) {
  S = u; _loginAt = Date.now();
  // Registra presença e last login
  const _ld = gdb(); const _lui = _ld.users.findIndex(x => x.id === u.id);
  if (_lui >= 0) {
    _ld.users[_lui].lastLogin = Date.now(); _ld.users[_lui].lastSeen = Date.now();
    if (!_ld.presence) _ld.presence = {};
    _ld.presence[u.id] = Date.now();
    sdb(_ld);
  }
  // Salva sessão no sessionStorage para outras páginas
  sessionStorage.setItem('tgl_s', JSON.stringify({ id: u.id, name: u.name, role: u.role, roles: u.roles || [u.role], email: u.email }));
  // Redireciona para a página inicial do perfil
  window.location.href = _getFirstPage(u);
}

function _getFirstPage(u) {
  const roles = _roles(u);
  if (roles.some(r => r === 'admin' || r === 'pcp' || r === 'comprador')) return 'dashboard.html';
  if (roles.some(r => ['preformados', 'estamparia', 'espinar'].includes(r))) return 'producao.html';
  return 'expedicao.html';
}

function doLogout() {
  S = null; _loginAt = 0; window._supaJwt = null;
  sessionStorage.removeItem('tgl_s');
  sessionStorage.removeItem('tgl_jwt');
  window.location.href = 'index.html';
}

// Verifica sessão salva no sessionStorage — chamado no topo de cada página autenticada
function checkSession() {
  const raw = sessionStorage.getItem('tgl_s');
  if (!raw) { window.location.href = 'index.html'; return null; }
  try {
    const u = JSON.parse(raw); S = u; return u;
  } catch {
    window.location.href = 'index.html'; return null;
  }
}

// ─── FORCE LOGOUT ─────────────────────────────────────────────────────────────
function _checkForceLogout(nd) {
  if (!S || !nd.forceLogout) return;
  const fl = nd.forceLogout;
  const myFL = fl[S.id] || 0;
  const allFL = fl._all || 0;
  const allFLActive = allFL && (Date.now() - allFL) < 24 * 60 * 60 * 1000 ? allFL : 0;
  const skipTs = fl['_skip_' + S.id] || 0;
  const trigger = Math.max(myFL, allFLActive);
  if (trigger > _loginAt && trigger > skipTs) { doLogout(); }
}

function forceLogoutUser(uid) {
  if (!confirm('Deslogar este usuário?')) return;
  const d = gdb(); if (!d.forceLogout) d.forceLogout = {};
  d.forceLogout[uid] = Date.now();
  logAction('Forçar logout', d.users.find(u => u.id === uid)?.name || uid);
  sdb(d); toast('Usuário será deslogado na próxima sincronização.', 'ok');
}
function forceLogoutAll() {
  if (!confirm('Deslogar TODOS os usuários (exceto você)?')) return;
  const d = gdb(); if (!d.forceLogout) d.forceLogout = {};
  d.forceLogout._all = Date.now();
  logAction('Forçar logout de todos', '');
  sdb(d); toast('Todos serão deslogados na próxima sincronização.', 'ok');
}

// ─── VERSION GATE ─────────────────────────────────────────────────────────────
function _versionLt(a, b) {
  const pa = (a || '0').split('.').map(Number), pb = (b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false;
}
function _showVersionBlock(minV) {
  window._blockAllSaves = true;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,14,24,.97);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999999;gap:20px;';
  ov.innerHTML = `<div style="font-size:52px">⚠️</div>
<h2 style="color:#ef4444;font-size:20px;font-family:sans-serif;text-align:center;margin:0">App desatualizado</h2>
<p style="color:#8ea8c0;font-family:sans-serif;text-align:center;max-width:360px;line-height:1.7;margin:0">
  Você está na versão <strong style="color:#f59e0b">v${APP_VERSION}</strong> mas a mínima exigida é <strong style="color:#22c55e">v${minV}</strong>.<br>
  Pressione <kbd style="background:#1a3048;padding:2px 8px;border-radius:4px;color:#22c55e;font-family:monospace">Ctrl+Shift+R</kbd> para atualizar.
</p>
<button onclick="location.reload(true)" style="background:#22c55e;color:#080e18;border:none;padding:13px 32px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer">🔄 Atualizar agora</button>`;
  document.body.appendChild(ov);
}

// ─── SYNC BACKGROUND (heartbeat 60s) ─────────────────────────────────────────
let _syncTimer = null;
let _gracePassed = false;
let _pendingStockBase = null;

function startSync() {
  if (_syncTimer) return;
  setTimeout(() => { _gracePassed = true; }, 5000);
  _syncTimer = setInterval(_syncFromServer, 60000);
}

async function _syncFromServer() {
  if (!S || _saveInProgress) return;
  try {
    const [blobRes, opsRes, stockRes] = await Promise.all([
      _sf('/rest/v1/app_data?key=eq.' + _BLOB_KEY + '&select=data'),
      _sf('/rest/v1/' + _OPS_TABLE + '?select=id,data,updated_at&order=updated_at.desc&limit=200'),
      _sf('/rest/v1/' + _STOCK_TABLE + '?select=id,data,updated_at')
    ]);
    if (!blobRes.ok || !opsRes.ok || !stockRes.ok) return;
    const [blobRows, opsRows, stockRows] = await Promise.all([blobRes.json(), opsRes.json(), stockRes.json()]);

    const nd = (blobRows && blobRows.length) ? { ...(_db || idb()), ...blobRows[0].data } : _db;
    if (!nd) return;

    // Merge OPs
    const serverOpsMap = Object.fromEntries(opsRows.map(r => [r.id, r.data]));
    const localOpsMap  = Object.fromEntries((_db.ops || []).map(o => [o.id, o]));
    const mergedOps    = Object.values({ ...serverOpsMap, ...Object.fromEntries((_db.ops || []).filter(o => {
      const sv = serverOpsMap[o.id];
      if (!sv) return true; // local-only (ainda não salvo)
      if (o.status === 'finalizado' && sv.status !== 'finalizado') return true; // local finalizado vence
      return false;
    }).map(o => [o.id, o])) });
    nd.ops = mergedOps;

    // Merge estoque produto
    const ns = {}, nrm = {}, npk = {}, npkAt = {};
    stockRows.forEach(({ id, data }) => {
      if (id.startsWith('P:'))  ns[id.slice(2)]  = data;
      else if (id.startsWith('RM:')) nrm[id.slice(3)] = data;
      else if (id.startsWith('PK:')) {
        const pid = id.slice(3);
        const qty = data && typeof data === 'object' && 'qty' in data ? data.qty : data;
        npk[pid] = qty;
        if (data && data.at) npkAt[pid] = data.at;
      }
    });

    // P: — local vence se tem mudança pendente
    const mergedP = { ...ns };
    Object.entries(_db.stock || {}).forEach(([pid, localVal]) => {
      if (localVal === undefined) return;
      const baseline = _lastSavedStockStr['P:' + pid];
      const localWins = JSON.stringify(localVal) !== baseline;
      if (localWins) mergedP[pid] = localVal;
    });

    // RM: — local vence se tem mudança pendente
    const mergedRM = { ...nrm };
    Object.entries(_db.rawMaterialStock || {}).forEach(([mid, localVal]) => {
      if (localVal === undefined) return;
      const baseline = _lastSavedStockStr['RM:' + mid];
      const localWins = JSON.stringify(localVal) !== baseline;
      if (localWins) mergedRM[mid] = localVal;
    });

    // PK: — local vence se tem mudança pendente
    const mergedPk = { ...npk };
    const mergedPkAt = { ..._db.packagingStockAt, ...npkAt };
    Object.entries(_db.packagingStock || {}).forEach(([pid, localVal]) => {
      if (localVal === undefined) return;
      const baseline = _lastSavedStockStr['PK:' + pid];
      const localWins = JSON.stringify({ qty: localVal }) !== baseline;
      if (localWins) { mergedPk[pid] = localVal; }
      else { _pkServerAt[pid] = npkAt[pid] || _pkServerAt[pid]; }
    });

    nd.stock = mergedP; nd.rawMaterialStock = mergedRM;
    nd.packagingStock = mergedPk; nd.packagingStockAt = mergedPkAt;

    // Check version gate e force reload
    if (nd.sysMinVersion && _versionLt(APP_VERSION, nd.sysMinVersion)) { _showVersionBlock(nd.sysMinVersion); }
    if (nd.sysForceReload && nd.sysForceReload !== Number(localStorage.getItem('tgl_fr'))) {
      localStorage.setItem('tgl_fr', nd.sysForceReload); location.reload(true); return;
    }

    _checkForceLogout(nd);
    _db = nd;
    try { localStorage.setItem('tgl_bk', JSON.stringify(nd)); } catch {}
    if (window._onSyncUpdate) window._onSyncUpdate(nd);
  } catch (e) { console.warn('[TGL] sync:', e); }
}

// ─── ALERTAS DE ESTOQUE ───────────────────────────────────────────────────────
function _checkStockAlerts() {
  if (!S) return;
  const d = gdb();
  // Alertas visíveis apenas para comprador, pcp e admin
  if (!_roles(S).some(r => ['comprador', 'admin', 'pcp'].includes(r))) return;
  const baixo = [];
  (d.rawMaterials || []).forEach(rm => {
    if (!rm.minStock) return;
    const stk = d.rawMaterialStock[rm.id] || {};
    const total = Object.values(stk).reduce((a, v) => a + (v.qty || 0), 0);
    if (total < rm.minStock) baixo.push(rm.name);
  });
  (d.packaging || []).forEach(pk => {
    if (!pk.minStock) return;
    const qty = d.packagingStock[pk.id] || 0;
    if (qty < pk.minStock) baixo.push(pk.name);
  });
  if (!baixo.length) return;
  _createNotif('stock_low', ['comprador', 'admin', 'pcp'],
    '⚠️ ' + baixo.length + ' iten(s) abaixo do estoque mínimo',
    baixo.slice(0, 8).join('\n') + (baixo.length > 8 ? '\n...e mais ' + (baixo.length - 8) : ''));
}

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────
function _roles(u) { return Array.isArray(u && u.roles) ? u.roles : [(u && u.role) || '']; }

function can(sec) {
  if (!S) return false;
  const roles = _roles(S);
  if (roles.includes('admin')) return true;
  if (roles.includes('pcp')) return ['dashboard', 'cadastros', 'pedidos', 'suprimentos', 'producao', 'expedicao', 'historico', 'relatorios', 'agenda'].includes(sec);
  if (roles.includes('comprador')) return ['dashboard', 'cadastros', 'suprimentos'].includes(sec);
  const allowed = new Set();
  roles.forEach(r => {
    if (['preformados', 'estamparia', 'espinar'].includes(r)) allowed.add('producao');
    if (r === 'expedicao') { allowed.add('expedicao'); allowed.add('producao'); allowed.add('cadastros'); allowed.add('suprimentos'); }
  });
  return allowed.has(sec);
}

function isComprador() { return S && _roles(S).some(r => r === 'comprador') && !_roles(S).includes('admin') && !_roles(S).includes('pcp'); }
function rlabel(r) { return { admin: '👑 Administrador', pcp: '📋 PCP', preformados: '🧵 Preformados', estamparia: '🔩 Estamparia', espinar: '🔌 Espinar/Fita', expedicao: '🚚 Expedição', comprador: '🛒 Comprador', pending: '⏳ Aguardando' }[r] || r; }
function rlabelUser(u) { return _roles(u).map(r => rlabel(r)).join(' + '); }

// ─── NOTIFICAÇÕES ─────────────────────────────────────────────────────────────
const NOTIF_TTL = 4 * 60 * 60 * 1000;

function _createNotif(type, targetRoles, message, detail) {
  const d = gdb(); if (!d.notifications) d.notifications = [];
  const now = Date.now();
  d.notifications = d.notifications.filter(n => (now - n.createdAt) < NOTIF_TTL);
  d.notifications.push({ id: uid(), type, targetRoles, message, detail, createdAt: now, readBy: {} });
  sdb(d); renderBell();
}

function _getMyNotifs() {
  if (!S) return [];
  const d = gdb(); if (!d.notifications) return [];
  const now = Date.now(); const myRoles = _roles(S) || [];
  return (d.notifications || [])
    .filter(n => { const ttl = n.ttl || NOTIF_TTL; return n.targetRoles && n.targetRoles.some(r => myRoles.includes(r)) && (now - n.createdAt) < ttl; })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function renderBell() {
  const badge = document.getElementById('bell-badge'); if (!badge || !S) return;
  const notifs = _getMyNotifs();
  if (!notifs.length) { badge.style.display = 'none'; return; }
  const unread = notifs.filter(n => !n.readBy || !n.readBy[S.id]);
  if (unread.length > 0) { badge.textContent = unread.length > 99 ? '99+' : String(unread.length); badge.style.display = 'inline-block'; }
  else { badge.style.display = 'none'; }
}

function _bellTimeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'agora mesmo';
  if (m < 60) return m + 'min atrás';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h atrás';
  return Math.floor(h / 24) + 'd atrás';
}

function toggleBell() {
  const drop = document.getElementById('notif-drop'); if (!drop) return;
  if (drop.classList.contains('open')) { drop.classList.remove('open'); return; }
  _renderNotifDrop(); drop.classList.add('open');
  setTimeout(() => document.addEventListener('click', _closeBellOutside, { once: true, capture: true }), 0);
}

function _closeBellOutside(e) {
  const wrap = document.getElementById('bell-wrap');
  if (wrap && wrap.contains(e.target)) { setTimeout(() => document.addEventListener('click', _closeBellOutside, { once: true, capture: true }), 0); return; }
  const drop = document.getElementById('notif-drop'); if (drop) drop.classList.remove('open');
}

function _renderNotifDrop() {
  const drop = document.getElementById('notif-drop'); if (!drop || !S) return;
  const notifs = _getMyNotifs();
  if (!notifs.length) { drop.innerHTML = '<div class="notif-empty">Sem notificações</div>'; return; }
  drop.innerHTML = notifs.map(n => {
    const isUnread = !n.readBy || !n.readBy[S.id];
    return '<div class="notif-item' + (isUnread ? ' unread' : '') + '" onclick="openNotif(\'' + n.id + '\')">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:3px">' + esc(n.message) + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">' + _bellTimeAgo(n.createdAt) + (isUnread ? ' · <strong style="color:var(--green)">Nova</strong>' : '') + '</div>' +
      '</div>';
  }).join('');
}

window.openNotif = function(id) {
  const d = gdb(); if (!d.notifications) return;
  const ni = d.notifications.findIndex(n => n.id === id); if (ni < 0) return;
  const n = d.notifications[ni];
  if (!n.readBy) n.readBy = {};
  n.readBy[S.id] = Date.now();
  sdb(d); renderBell();
  const drop = document.getElementById('notif-drop'); if (drop) drop.classList.remove('open');
  Mopen('🔔 Notificação',
    '<div style="font-size:14px;font-weight:600;margin-bottom:12px">' + esc(n.message) + '</div>' +
    '<div style="font-size:13px;line-height:1.7;white-space:pre-wrap;color:var(--sub)">' + esc(n.detail) + '</div>' +
    '<div style="margin-top:14px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);padding-top:10px">' + _bellTimeAgo(n.createdAt) + '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
};

// ─── NAV BUILDER (header compartilhado) ──────────────────────────────────────
const PAGES = [
  { id: 'dashboard',  label: '📊 Dashboard',   file: 'dashboard.html'  },
  { id: 'cadastros',  label: '🏪 Cadastros',    file: 'cadastros.html'  },
  { id: 'pedidos',    label: '📋 Pedidos',      file: 'pedidos.html'    },
  { id: 'suprimentos',label: '📦 Suprimentos',  file: 'suprimentos.html'},
  { id: 'producao',   label: '⚙️ Produção',     file: 'producao.html'   },
  { id: 'expedicao',  label: '🚚 Expedição',    file: 'expedicao.html'  },
  { id: 'historico',  label: '🕐 Histórico',    file: 'historico.html'  },
  { id: 'relatorios', label: '📈 Relatórios',   file: 'relatorios.html' },
  { id: 'agenda',     label: '📅 Agenda',       file: 'agenda.html'     },
  { id: 'admin',      label: '🔧 Admin',        file: 'admin.html'      },
];

function buildNav(activePage) {
  const nav = document.getElementById('hnav'); if (!nav) return;
  nav.innerHTML = PAGES
    .filter(p => can(p.id))
    .map(p => `<a href="${p.file}" class="nav-btn${p.file === activePage ? ' on' : ''}">${p.label}</a>`)
    .join('');
  // Atualiza chip do usuário
  const uc = document.getElementById('huser'); if (uc && S) uc.textContent = S.name + ' · ' + rlabelUser(S);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
let _modalLocked = false;
function Mopen(title, body, foot, size) {
  const M = document.getElementById('M'); if (!M) return;
  document.getElementById('Mtitle').textContent = title;
  document.getElementById('Mbody').innerHTML = body;
  document.getElementById('Mfoot').innerHTML = foot || '';
  document.getElementById('Mbox').className = 'mbox' + (size ? ' ' + size : '');
  M.classList.add('open');
}
function Mclose() { const M = document.getElementById('M'); if (M && !_modalLocked) M.classList.remove('open'); }
window.Mclose = Mclose;
window.Mopen  = Mopen;

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(msg, type, dur) {
  const cls = { ok: 'toast-ok', err: 'toast-err', info: 'toast-info', warn: 'toast-warn' };
  const wrap = document.getElementById('toasts');
  if (!wrap) { console.log('[TOAST]', msg); return; }
  const t = document.createElement('div');
  t.className = 'toast ' + (cls[type] || 'toast-info'); t.textContent = msg;
  wrap.appendChild(t); setTimeout(() => t.remove(), dur || 3500);
}
window.toast = toast;

// ─── SYNC BADGE ───────────────────────────────────────────────────────────────
function setSyncBadge(ok) {
  const b = document.getElementById('sync-badge'); if (!b) return;
  b.style.display = 'inline-block';
  if (ok === null) { b.style.background = 'rgba(234,179,8,.15)'; b.style.color = '#eab308'; b.textContent = '● Salvando...'; }
  else if (ok) { b.style.background = 'rgba(34,197,94,.15)'; b.style.color = '#22c55e'; b.textContent = '● Online'; }
  else { b.style.background = 'rgba(239,68,68,.15)'; b.style.color = '#ef4444'; b.textContent = '● Offline'; }
}

// ─── INATIVIDADE — logout automático após 30 min ─────────────────────────────
let _lastActivityAt = Date.now();
['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { _lastActivityAt = Date.now(); }, { passive: true })
);
setInterval(() => {
  if (!S) return;
  if (Date.now() - _lastActivityAt > 30 * 60 * 1000) { toast('Sessão encerrada por inatividade (30 min).', 'info'); doLogout(); }
}, 60000);

// ─── UTILS ────────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function val(id) { return (document.getElementById(id) || { value: '' }).value; }
function v(id) { return (document.getElementById(id) || { value: '' }).value; }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fdate(d) { if (!d) return '—'; const p = d.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; }
function fnum(n) { const v = parseInt(n) || 0; return v.toLocaleString('pt-BR'); }
function fqty(n, unit) {
  if (['KG', 'MT'].includes(unit || 'UN')) { const v = parseFloat(n) || 0; return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 }); }
  return fnum(n);
}
function _parseQty(v, unit) { return ['KG', 'MT'].includes(unit || 'UN') ? (parseFloat(v) || 0) : (parseInt(v) || 0); }
function today8601() { return new Date().toISOString().split('T')[0]; }

function diasChip(dateStr, status) {
  if (!dateStr || status === 'finalizado') return '';
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const tgt = new Date(dateStr + 'T00:00:00');
  const d = Math.round((tgt - now) / 86400000);
  if (d < 0) return '<span class="dc dc-late">⚠ ' + Math.abs(d) + 'd atraso</span>';
  if (d === 0) return '<span class="dc dc-late">⚠ Hoje</span>';
  if (d <= 3) return '<span class="dc dc-warn">📅 faltam ' + d + ' dias</span>';
  return '<span class="dc dc-ok">📅 faltam ' + d + ' dias</span>';
}

function stclass(s) {
  return { pendente: 'bs-pendente', materia_falta: 'bs-falta', aguardando_mp: 'bs-aguardando', em_producao: 'bs-producao', producao_iniciada: 'bs-iniciada', revisao_qualidade: 'bs-revisao', galvanizacao_externa: 'bs-galv', liberado: 'bs-liberado', finalizado: 'bs-finalizado', pref_formadeira: 'bs-producao', pref_coladeira: 'bs-producao', pref_pulverizadeira: 'bs-producao', pref_torcedeira: 'bs-producao', pref_dobradeira: 'bs-producao', pref_ficha_falta: 'bs-falta' }[s] || 'bs-pendente';
}
function stlabel(s) {
  return { pendente: '⏳ Pendente', materia_falta: '🚫 Mat.-prima em falta', aguardando_mp: '⏸️ Aguardando MP', producao_iniciada: '🟢 Produção iniciada', em_producao: '🔄 Em produção', revisao_qualidade: '🔍 Revisão de qualidade', galvanizacao_externa: '⚗️ Em galvanização externo', liberado: '✅ Liberado', finalizado: '🏁 Finalizado', pref_formadeira: '🔧 Formadeira/Montadeira', pref_coladeira: '🪄 Coladeira', pref_pulverizadeira: '💨 Pulverizadeira', pref_torcedeira: '🌀 Torcedeira', pref_dobradeira: '📦 Dobradeira/Embalagem', pref_ficha_falta: '📄 Ficha em falta', despachado_parcial: '📦 Despachado (Parcial)' }[s] || s || '—';
}

function autoArchive() {
  const d = gdb(); let ch = false;
  d.ops.forEach(op => { if (op.status === 'finalizado' && !op.archived && op.finalAt && (Date.now() - op.finalAt) >= 86400000) { op.archived = true; ch = true; } });
  if (ch) sdb(d);
}

function getStock(pid, needed) {
  const d = gdb(); const st = d.stock[pid];
  if (!st) return { cls: 'sem sem-y', label: 'Sem lançamento' };
  const committed = d.ops.filter(o => o.status !== 'finalizado' && !o.archived)
    .reduce((a, op) => { const it = op.items.find(i => i.pid === pid); return a + (it ? _itemQtyLeft(it) : 0); }, 0);
  const avail = st.qty - committed;
  if (avail >= needed) return { cls: 'sem sem-g', label: 'Atende (' + avail + ' disp.)' };
  return { cls: 'sem sem-r', label: 'Insuficiente (' + avail + ' disp.)' };
}

function _itemQtyLeft(item) {
  if (item.status === 'liberado' || item.status === 'finalizado') return 0;
  return item.qty - (item.qtyReleased || 0);
}

function sectorBadges(p) {
  if (p.isStock) return '<span class="sb sb-stok">Estoque</span>';
  const m = { preformados: 'sb-pref', estamparia: 'sb-estm', espinar: 'sb-espi' };
  const ml = { preformados: 'Preformados', estamparia: 'Estamparia', espinar: 'Espinar/Fita' };
  return (p.sectors || []).map(s => '<span class="sb ' + m[s] + '">' + ml[s] + '</span>').join('') || '—';
}

// Máscara CNPJ (v2.0)
function maskCNPJ(v) {
  return v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2').slice(0, 18);
}
window.onCnpjInput = function(el) { el.value = maskCNPJ(el.value); };

// Unidade select
function _unitSel(id, val, def) {
  const u = val || def || 'UN';
  return '<div class="fg"><label>Unidade</label><select id="' + id + '">' +
    ['UN', 'KG', 'CJ', 'MT', 'RL'].map(o => '<option value="' + o + '"' + (o === u ? ' selected' : '') + '>' + o + '</option>').join('') +
    '</select></div>';
}

// Sort helpers
function _sArr(col, state) { return state.col === col ? (state.dir === 1 ? '▲' : '▼') : '<span style="opacity:.3">⇅</span>'; }

// Expand/collapse table row (usado em expedição, produção, etc.)
function togExpand(rowId, btnId) {
  const row = el(rowId), btn = el(btnId); if (!row) return;
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : 'table-row';
  if (btn) btn.classList.toggle('open', !open);
}
window.togExpand = togExpand;

// Login form helpers
function showLF(f) {
  ['login', 'first', 'reg', 'forgot'].forEach(x => { const e = document.getElementById('lf-' + x); if (e) e.style.display = 'none'; });
  const t = document.getElementById('lf-' + f); if (t) t.style.display = 'block';
  const le = document.getElementById('lerr'); if (le) le.style.display = 'none';
}
function lerr(m) { const e = document.getElementById('lerr'); if (e) { e.textContent = m; e.style.display = 'block'; } }
function faerr(m) { const e = document.getElementById('fa-err'); if (e) { e.textContent = m; e.style.display = 'block'; } }
function regerr(m) { const e = document.getElementById('reg-err'); if (e) { e.textContent = m; e.style.display = 'block'; } }

// Expor globalmente as funções usadas por onclick no HTML
window.doLogin        = doLogin;
window.doFirstAccess  = doFirstAccess;
window.doRegister     = doRegister;
window.doLogout       = doLogout;
window.showLF         = showLF;
window.toggleBell     = toggleBell;
window.forceLogoutUser = forceLogoutUser;
window.forceLogoutAll  = forceLogoutAll;
window.logAction      = logAction;
window.gdb = gdb; window.sdb = sdb; window.uid = uid;
window._rpcDeductStock = _rpcDeductStock;
window._rpcSetRM  = _rpcSetRM;  window._rpcAdjRM  = _rpcAdjRM;
window._rpcSetPK  = _rpcSetPK;  window._rpcAdjPK  = _rpcAdjPK;
window.esc = esc; window.fdate = fdate; window.fnum = fnum; window.fqty = fqty;
window._parseQty = _parseQty; window.today8601 = today8601; window.diasChip = diasChip;
window.stclass = stclass; window.stlabel = stlabel; window.sectorBadges = sectorBadges;
window.autoArchive = autoArchive; window.getStock = getStock; window._itemQtyLeft = _itemQtyLeft;
window.can = can; window.isComprador = isComprador; window.rlabel = rlabel; window.rlabelUser = rlabelUser;
window._roles = _roles; window.buildNav = buildNav; window.startSync = startSync;
window.renderBell = renderBell; window._createNotif = _createNotif; window.checkSession = checkSession;
window._unitSel = _unitSel; window._sArr = _sArr; window._checkStockAlerts = _checkStockAlerts;
window.maskCNPJ = maskCNPJ; window.setSyncBadge = setSyncBadge;
window.PAGES = PAGES; window.APP_VERSION = APP_VERSION;
window._auditLog = _auditLog;
window._sf = _sf; window.loadDB = loadDB; window.saveDBRemote = saveDBRemote;

// ─── PWA — Registro do Service Worker ────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/flow/sw.js', { scope: '/flow/' })
      .then(reg => {
        // Verifica atualização a cada 60s
        setInterval(() => reg.update(), 60000);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              // Nova versão disponível — notifica usuário sem forçar reload
              toast('🔄 Nova versão disponível — recarregue o app para atualizar', 'info', 6000);
            }
          });
        });
      })
      .catch(e => console.warn('[TGL SW] Registro falhou:', e));
  });
}
