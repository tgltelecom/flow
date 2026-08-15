/* ══════════════════════════════════════════════════════
   Flow TGL v2.0 — dashboard.js
   Renderiza: rDashboard (admin/pcp) | rSectorDashboard | rCompradorDashboard
══════════════════════════════════════════════════════ */

function _cnt() { return document.getElementById('acontent'); }

// ─── HELPERS ─────────────────────────────────────────
function _pctColor(p) { return p >= 80 ? 'var(--green)' : p >= 50 ? '#eab308' : '#ef4444'; }
function _dotClass(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.floor((new Date(dateStr + 'T00:00:00') - now) / 86400000);
  if (diff < 0) return 'dot-red';
  if (diff === 0) return 'dot-orange';
  if (diff <= 3) return 'dot-yellow';
  return 'dot-blue';
}
function _diffLabel(dateStr) {
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.floor((new Date(dateStr + 'T00:00:00') - now) / 86400000);
  if (diff < 0) return 'Vencido há ' + Math.abs(diff) + 'd';
  if (diff === 0) return 'Vence HOJE';
  if (diff === 1) return 'Vence amanhã';
  return 'Vence em ' + diff + 'd (' + fdate(dateStr) + ')';
}
function _kCard(val, label, sub, cls, icon) {
  return '<div class="kcard ' + cls + '">' +
    (icon ? '<div class="kcard-icon">' + icon + '</div>' : '') +
    '<div class="kval">' + val + '</div>' +
    '<div class="klabel">' + label + '</div>' +
    '<div class="ksub">' + sub + '</div>' +
    '</div>';
}
function _secBarHTML(s) {
  if (!s.total) return '<div class="dash-empty" style="padding:8px 0;text-align:left">Nenhum item ativo neste setor</div>';
  const pLib = Math.round(s.lib / s.total * 100);
  const pProd = Math.round(s.prod / s.total * 100);
  const pBlk = Math.round(s.blk / s.total * 100);
  const pPend = Math.max(0, 100 - pLib - pProd - pBlk);
  return '<div class="sect-bar">' +
    '<div class="sb-lib" style="width:' + pLib + '%" title="Liberado"></div>' +
    '<div class="sb-prod" style="width:' + pProd + '%" title="Em produção"></div>' +
    '<div class="sb-blk" style="width:' + pBlk + '%" title="Bloqueado"></div>' +
    '<div class="sb-pend" style="width:' + pPend + '%"></div>' +
    '</div>' +
    '<div class="sect-leg">' +
    '<span style="color:var(--green)">■ ' + fnum(s.lib) + ' lib.</span>' +
    '<span style="color:#3b82f6">■ ' + fnum(s.prod) + ' prod.</span>' +
    (s.blk ? '<span style="color:#ef4444">■ ' + fnum(s.blk) + ' bloq.</span>' : '') +
    '<span>' + fnum(s.total - s.lib - s.prod - s.blk) + ' pend.</span></div>';
}

// ─── REFRESH ──────────────────────────────────────────
async function refreshDashboard() {
  const cnt = _cnt();
  const btn = cnt.querySelector('.dash-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Atualizando...'; }
  try {
    const [blobRes, opsRes, stockRes] = await Promise.all([
      _sf('/rest/v1/app_data?key=eq.' + _BLOB_KEY + '&select=data'),
      _sf('/rest/v1/' + _OPS_TABLE + '?select=id,data'),
      _sf('/rest/v1/' + _STOCK_TABLE + '?select=id,data')
    ]);
    if (blobRes.ok) {
      const rows = await blobRes.json();
      if (rows && rows.length) {
        let freshOps = _db.ops || [];
        if (opsRes.ok) { const or = await opsRes.json(); freshOps = or.map(r => r.data); }
        let freshStock = _db.stock || {}, freshRm = _db.rawMaterialStock || {}, freshPk = _db.packagingStock || {}, freshPkAt = _db.packagingStockAt || {};
        if (stockRes.ok) {
          const srows = await stockRes.json(); const ns = {}, nrm = {}, npk = {}, npkAt = {};
          srows.forEach(({ id, data }) => {
            if (id.startsWith('P:')) ns[id.slice(2)] = data;
            else if (id.startsWith('RM:')) nrm[id.slice(3)] = data;
            else if (id.startsWith('PK:')) { const pid = id.slice(3); const qty = data && 'qty' in data ? data.qty : data; npk[pid] = qty; if (data && data.at) npkAt[pid] = data.at; }
          });
          if (!_saveInProgress && !_saveQueue && !_failedPayload) {
            freshStock = ns; freshRm = nrm; freshPk = npk; freshPkAt = npkAt;
          }
        }
        window._db = { ...idb(), ...rows[0].data, products: _db.products || [], clients: _db.clients || [], rawMaterials: _db.rawMaterials || [], packaging: _db.packaging || [], suppliers: _db.suppliers || [], users: _db.users || [], ops: freshOps, stock: freshStock, rawMaterialStock: freshRm, packagingStock: freshPk, packagingStockAt: freshPkAt, rawMaterialMovements: _db.rawMaterialMovements || [], packagingMovements: _db.packagingMovements || [] };
        try { localStorage.setItem('tgl_bk', JSON.stringify(_db)); } catch {}
      }
    }
  } catch {}
  if (btn) { btn.disabled = false; btn.textContent = '↻ Atualizar'; }
  const roles = _roles(S);
  if (isComprador()) rCompradorDashboard();
  else if (roles.every(r => ['preformados', 'estamparia', 'espinar', 'expedicao'].includes(r))) rSectorDashboard(roles[0]);
  else rDashboard();
}
window.refreshDashboard = refreshDashboard;

// ─── DASHBOARD ADMIN / PCP ─────────────────────────────
function rDashboard() {
  const cnt = _cnt(); const d = gdb();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const activeOps = d.ops.filter(o => !o.archived && o.status === 'ativo');

  // KPIs
  const vencidos = activeOps.filter(o => o.deliveryDate && new Date(o.deliveryDate + 'T00:00:00') < now);
  const d7 = new Date(now); d7.setDate(d7.getDate() + 7);
  const aVencer7 = activeOps.filter(o => { if (!o.deliveryDate) return false; const dt = new Date(o.deliveryDate + 'T00:00:00'); return dt >= now && dt <= d7; });
  let bloqueados = 0;
  activeOps.forEach(o => o.items.forEach(i => { if (i.status === 'materia_falta' || i.status === 'aguardando_mp') bloqueados++; }));
  const ago30 = Date.now() - 30 * 24 * 3600 * 1000;
  const recFin = d.ops.filter(o => o.status === 'finalizado' && o.finalAt && o.finalAt >= ago30);
  const onTime = recFin.filter(o => { if (!o.deliveryDate || !o.finalAt) return false; const fd = new Date(o.finalAt); fd.setHours(0,0,0,0); return fd <= new Date(o.deliveryDate + 'T00:00:00'); });
  const effPct = recFin.length ? Math.round(onTime.length / recFin.length * 100) : null;
  const prontos = activeOps.filter(o => { const tot = o.items.length; const ready = o.items.filter(i => i.status === 'liberado' || i.partiallyDispatched).length; return tot > 0 && ready === tot; });
  const parciais = activeOps.filter(o => (o.partialDispatches || []).length > 0);
  const mesAtual = new Date(); mesAtual.setDate(1); mesAtual.setHours(0,0,0,0);
  const finMes = d.ops.filter(o => o.status === 'finalizado' && o.finalAt && o.finalAt >= mesAtual.getTime()).length;
  const cicloOps = recFin.filter(o => o.createdAt && o.finalAt);
  const cicloMedio = cicloOps.length ? Math.round(cicloOps.reduce((a, o) => a + (o.finalAt - o.createdAt), 0) / cicloOps.length / 86400000) : null;
  const ago7 = Date.now() - 7 * 86400000, ago14 = Date.now() - 14 * 86400000;
  const fin7 = d.ops.filter(o => o.status === 'finalizado' && o.finalAt && o.finalAt >= ago7).length;
  const fin7prev = d.ops.filter(o => o.status === 'finalizado' && o.finalAt && o.finalAt >= ago14 && o.finalAt < ago7).length;
  const throughputTrend = fin7 > fin7prev ? '↑' : fin7 < fin7prev ? '↓' : '→';
  const throughputCls = fin7 > fin7prev ? 'kgreen' : fin7 < fin7prev ? 'korange' : 'kblue';
  const semPrazo = activeOps.filter(o => !o.deliveryDate).length;

  // Sector pipeline
  const secs = { preformados: { label: '🧵 Preformados', total: 0, lib: 0, prod: 0, blk: 0 }, estamparia: { label: '🔩 Estamparia', total: 0, lib: 0, prod: 0, blk: 0 }, espinar: { label: '🔌 Espinar/Fita', total: 0, lib: 0, prod: 0, blk: 0 } };
  activeOps.forEach(op => op.items.forEach(it => {
    const p = d.products.find(x => x.id === it.pid); if (!p || p.isStock) return;
    (p.sectors || []).forEach(sec => {
      if (!secs[sec]) return; secs[sec].total++;
      const st = it.status || 'pendente';
      if (st === 'liberado' || st === 'revisao_qualidade') secs[sec].lib++;
      else if (st === 'materia_falta' || st === 'aguardando_mp' || st === 'pref_ficha_falta') secs[sec].blk++;
      else if (st !== 'pendente' && st !== 'aguardando_producao') secs[sec].prod++;
    });
  }));

  // Risk list
  const riskOps = activeOps.filter(o => { if (!o.deliveryDate) return false; const diff = Math.floor((new Date(o.deliveryDate + 'T00:00:00') - now) / 86400000); return diff <= 5; }).sort((a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate));

  // Stock alerts
  const stockAlerts = [];
  d.products.filter(p => p.isStock).forEach(p => {
    const demand = activeOps.reduce((a, op) => { const it = op.items.find(i => i.pid === p.id); return a + (it ? it.qty : 0); }, 0);
    if (!demand) return;
    const st = d.stock[p.id];
    if (!st) stockAlerts.push({ name: p.name, sku: p.sku, cls: 'dot-orange', label: 'Sem registro — ' + demand + ' demandados' });
    else { const avail = st.qty - demand; if (avail < 0) stockAlerts.push({ name: p.name, sku: p.sku, cls: 'dot-red', label: 'Crítico: faltam ' + Math.abs(avail) + ' un.' }); else if (avail < demand * 0.3) stockAlerts.push({ name: p.name, sku: p.sku, cls: 'dot-yellow', label: 'Baixo: ' + avail + ' disp. / ' + demand + ' demandados' }); }
  });

  // Sector efficiency in overdue OPs
  const secEff = { preformados: { label: '🧵 Preformados', lib: 0, total: 0 }, estamparia: { label: '🔩 Estamparia', lib: 0, total: 0 }, espinar: { label: '🔌 Espinar/Fita', lib: 0, total: 0 } };
  vencidos.forEach(op => op.items.forEach(it => { const p = d.products.find(x => x.id === it.pid); if (!p || p.isStock) return; (p.sectors || []).forEach(sec => { if (!secEff[sec]) return; secEff[sec].total++; if (it.status === 'liberado' || it.status === 'revisao_qualidade') secEff[sec].lib++; }); }));

  // Online users (admin only)
  let onlineHTML = '';
  if (_roles(S).some(r => r === 'admin' || r === 'pcp')) {
    const now2 = Date.now(); const users2 = d.users.filter(u => !u.pending);
    const inactive2 = users2.filter(u => { const ts2 = (d.presence || {})[u.id] || u.lastSeen || 0; return !ts2 || (now2 - ts2) > 7 * 24 * 3600 * 1000; });
    onlineHTML = '<div class="dash-row"><div class="dash-panel" style="grid-column:1/-1">' +
      '<div class="dpanel-title">👥 Usuários do Sistema</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      users2.map(u => {
        const ts = (d.presence || {})[u.id] || u.lastSeen || 0;
        const isOnline = ts && (now2 - ts) < 5 * 60 * 1000;
        const isIdle = ts && (now2 - ts) >= 5 * 60 * 1000 && (now2 - ts) < 30 * 60 * 1000;
        const dot = isOnline ? '🟢' : isIdle ? '🟡' : '⚫';
        const status = isOnline ? 'Online' : isIdle ? 'Ocioso' : 'Offline';
        const m = Math.floor((now2 - (ts || 0)) / 60000);
        const since = !ts ? 'Nunca' : m < 1 ? 'agora mesmo' : m < 60 ? m + 'min atrás' : Math.floor(m / 60) + 'h atrás';
        const warn = !ts || (now2 - ts) > 7 * 24 * 3600 * 1000;
        return '<div style="background:var(--bg-card2);border:1px solid ' + (warn ? 'rgba(239,68,68,.3)' : 'var(--border)') + ';border-radius:var(--r);padding:8px 12px;display:flex;align-items:center;gap:8px;min-width:160px">' +
          '<span>' + dot + '</span><div><div style="font-weight:600;font-size:12px">' + esc(u.name) + '</div>' +
          '<div style="font-size:10px;color:' + (isOnline ? 'var(--green)' : warn ? 'var(--danger)' : 'var(--muted)') + '">' + status + ' · ' + since + '</div></div></div>';
      }).join('') + '</div>' +
      (inactive2.length ? '<div style="margin-top:8px;font-size:11px;color:var(--danger)">⚠️ ' + inactive2.length + ' usuário(s) sem acesso nos últimos 7 dias</div>' : '') +
      '</div></div>';
  }

  // Build HTML
  const riskHTML = !riskOps.length ? '<div class="dash-empty">Nenhuma OP com prazo próximo</div>' :
    riskOps.map(op => {
      const lib = op.items.filter(i => i.status === 'liberado').length;
      const tot = op.items.length; const pct = tot ? Math.round(lib / tot * 100) : 0;
      return '<div class="risk-row">' +
        '<div class="risk-dot ' + _dotClass(op.deliveryDate) + '"></div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">#' + esc(op.opNum) + ' · ' + esc(op.clientName) + '</div>' +
        '<div style="font-size:11px;color:var(--muted)">' + _diffLabel(op.deliveryDate) + '</div></div>' +
        '<div style="text-align:right;flex-shrink:0"><div style="font-size:12px;font-weight:700;color:' + _pctColor(pct) + '">' + pct + '%</div><div style="font-size:10px;color:var(--muted)">liberado</div></div>' +
        '</div>';
    }).join('');

  const pipeHTML = Object.entries(secs).map(([, s]) =>
    '<div class="sect-wrap"><div class="sect-top"><span>' + s.label + '</span><span>' + fnum(s.total) + ' item(s)</span></div>' + _secBarHTML(s) + '</div>').join('');

  const stockHTML = !stockAlerts.length ? '<div class="dash-empty">Estoque dentro do esperado ✓</div>' :
    stockAlerts.slice(0, 6).map(a => '<div class="stock-row"><div class="risk-dot ' + a.cls + '"></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.name) + '</div><div style="font-size:11px;color:var(--muted)">' + esc(a.sku || '—') + ' · ' + a.label + '</div></div></div>').join('') +
    (stockAlerts.length > 6 ? '<div style="font-size:11px;color:var(--muted);margin-top:8px">+' + (stockAlerts.length - 6) + ' outros → veja em Suprimentos</div>' : '');

  const anyEff = Object.values(secEff).some(s => s.total > 0);
  const effHTML = !vencidos.length ? '<div class="dash-empty">Sem OPs vencidas ✓</div>' :
    !anyEff ? '<div class="dash-empty">Sem itens de produção nas OPs vencidas</div>' :
    Object.entries(secEff).map(([, s]) => {
      if (!s.total) return '<div class="eff-row"><span style="font-size:13px;color:var(--muted)">' + s.label + ' — sem itens em atraso</span></div>';
      const pct = Math.round(s.lib / s.total * 100);
      return '<div class="eff-row"><div><div style="font-size:13px;font-weight:600">' + s.label + '</div><div style="font-size:11px;color:var(--muted)">' + s.lib + '/' + s.total + ' liberados</div></div><div style="font-size:15px;font-weight:800;color:' + _pctColor(pct) + '">' + pct + '%</div></div>';
    }).join('') +
    (recFin.length ? '<div class="perf-strip"><div><div class="perf-num" style="color:var(--green)">' + onTime.length + '</div><div class="perf-lbl">No Prazo (30d)</div></div><div><div class="perf-num" style="color:#ef4444">' + (recFin.length - onTime.length) + '</div><div class="perf-lbl">Atrasadas</div></div><div><div class="perf-num">' + recFin.length + '</div><div class="perf-lbl">Total Finalizadas</div></div></div>' : '');

  cnt.innerHTML =
    '<div class="ptitle">📊 Dashboard</div>' +
    '<div class="psub">Visão gerencial em tempo real · ' + new Date().toLocaleString('pt-BR') + '</div>' +
    onlineHTML +
    '<div class="dash-kpi">' + [
      _kCard(fnum(vencidos.length), 'OPs Vencidas', vencidos.length ? 'Requer atenção imediata' : 'Nenhuma OP atrasada ✓', vencidos.length ? 'kred' : 'kgreen', '⏰'),
      _kCard(fnum(aVencer7.length), 'Vencem em 7 dias', fnum(activeOps.length) + ' OPs ativas no total', aVencer7.length > 2 ? 'korange' : aVencer7.length > 0 ? 'kyellow' : 'kgreen', '📅'),
      _kCard(fnum(bloqueados), 'Itens Bloqueados', bloqueados ? 'Aguardando MP / material' : 'Sem bloqueios ✓', bloqueados ? 'kred' : 'kgreen', '🔒'),
      _kCard(effPct === null ? '—' : effPct + '%', 'No Prazo (30d)', recFin.length ? fnum(recFin.length) + ' OPs finalizadas' : 'Sem OPs finalizadas', effPct === null ? 'kgray' : effPct >= 85 ? 'kgreen' : effPct >= 70 ? 'kyellow' : 'kred', '🎯'),
      _kCard(fnum(prontos.length), 'Prontos p/ Expedição', parciais.length ? fnum(parciais.length) + ' despacho(s) parcial' : prontos.length ? 'Aguardando despacho' : 'Tudo em produção ✓', prontos.length ? 'kyellow' : 'kgreen', '🚚'),
      _kCard(fnum(activeOps.length), 'OPs Ativas', finMes ? fnum(finMes) + ' finalizadas este mês' : 'Nenhuma finalizada este mês', 'kblue', '📋'),
      _kCard(cicloMedio === null ? '—' : cicloMedio + 'd', 'Ciclo Médio', cicloOps.length ? 'Baseado em ' + fnum(cicloOps.length) + ' OPs' : 'Sem dados', cicloMedio === null ? 'kgray' : cicloMedio <= 7 ? 'kgreen' : cicloMedio <= 14 ? 'kyellow' : 'kred', '⏱️'),
      _kCard(throughputTrend + ' ' + fnum(fin7), 'Finalizadas (7d)', fin7prev ? 'Semana anterior: ' + fnum(fin7prev) : 'Primeiro dado', throughputCls, '🏭'),
      _kCard(fnum(semPrazo), 'Sem Prazo Definido', semPrazo ? 'OPs ativas sem data de entrega' : 'Todas com prazo ✓', semPrazo > 0 ? 'korange' : 'kgreen', '⚠️'),
    ].join('') + '</div>' +
    '<div class="dash-row">' +
      '<div class="dash-panel"><div class="dpanel-title">🚨 OPs em Risco por Prazo</div><div class="dash-panel-body">' + riskHTML + '</div></div>' +
      '<div class="dash-panel"><div class="dpanel-title">⚙️ Pipeline por Setor</div><div class="dash-panel-body">' + pipeHTML + '</div></div>' +
    '</div>' +
    '<div class="dash-row">' +
      '<div class="dash-panel"><div class="dpanel-title">📦 Alertas de Estoque</div><div class="dash-panel-body">' + stockHTML + '</div></div>' +
      '<div class="dash-panel"><div class="dpanel-title">📊 Eficiência por Setor</div><div class="dash-panel-body">' + effHTML + '</div></div>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--sub);text-align:right;margin-top:4px"><button class="btn btn-ghost btn-sm dash-refresh-btn" onclick="refreshDashboard()">↻ Atualizar</button></div>';
}

// ─── DASHBOARD SETOR (preformados, estamparia, espinar, expedicao) ─────────────
function rSectorDashboard(role) {
  const cnt = _cnt(); const d = gdb();
  const secKey = { preformados: 'preformados', estamparia: 'estamparia', espinar: 'espinar' };
  const secLabel = { preformados: '🧵 Preformados', estamparia: '🔩 Estamparia', espinar: '🔌 Espinar/Fita', expedicao: '🚚 Expedição' };
  const activeOps = d.ops.filter(o => !o.archived && o.status === 'ativo');
  const now = new Date(); now.setHours(0,0,0,0);

  if (role === 'expedicao') {
    const prontos = activeOps.filter(o => { const tot = o.items.length; const ready = o.items.filter(i => i.status === 'liberado' || i.partiallyDispatched).length; return tot > 0 && ready === tot; });
    const parciais = activeOps.filter(o => (o.partialDispatches || []).length > 0);
    const venc = activeOps.filter(o => o.deliveryDate && new Date(o.deliveryDate + 'T00:00:00') < now);
    cnt.innerHTML = '<div class="ptitle">' + secLabel[role] + '</div><div class="psub">Painel da Expedição · ' + new Date().toLocaleString('pt-BR') + '</div>' +
      '<div class="dash-kpi">' +
        _kCard(fnum(prontos.length), 'Prontos p/ Despacho', 'Aguardando embarque', 'kyellow', '🚚') +
        _kCard(fnum(parciais.length), 'Despachos Parciais', 'OPs com partes despachadas', parciais.length ? 'korange' : 'kgreen', '📦') +
        _kCard(fnum(venc.length), 'OPs Vencidas', venc.length ? 'Requer atenção' : 'Tudo em dia ✓', venc.length ? 'kred' : 'kgreen', '⏰') +
        _kCard(fnum(activeOps.length), 'OPs Ativas', 'Em andamento', 'kblue', '📋') +
      '</div>' +
      '<div class="dash-panel">' +
        '<div class="dpanel-title">📦 OPs Prontas para Embarque</div>' +
        '<div class="dash-panel-body">' + (!prontos.length ? '<div class="dash-empty">Nenhuma OP pronta para despacho</div>' :
          prontos.map(op => '<div class="risk-row"><div class="risk-dot dot-green"></div>' +
            '<div style="flex:1"><div style="font-size:13px;font-weight:600">#' + esc(op.opNum) + ' · ' + esc(op.clientName) + '</div>' +
            '<div style="font-size:11px;color:var(--muted)">' + (op.deliveryDate ? fdate(op.deliveryDate) : 'Sem prazo') + ' · ' + op.items.length + ' iten(s)</div></div>' +
            '<a href="expedicao.html" class="btn btn-green btn-sm">Despachar</a></div>').join('')) +
        '</div>' +
      '</div>' +
      '<div style="text-align:right;margin-top:10px"><button class="btn btn-ghost btn-sm dash-refresh-btn" onclick="refreshDashboard()">↻ Atualizar</button></div>';
    return;
  }

  const sec = secKey[role];
  if (sec) {
    const myItems = [];
    activeOps.forEach(op => op.items.forEach(it => {
      const p = d.products.find(x => x.id === it.pid);
      if (p && !p.isStock && (p.sectors || []).includes(sec)) myItems.push({ op, it, p });
    }));
    const total = myItems.length;
    const emProd = myItems.filter(x => x.it.status === 'em_producao' || x.it.status === 'galvanizacao_externa' || (x.it.status || '').startsWith('pref_')).length;
    const liberados = myItems.filter(x => x.it.status === 'liberado' || x.it.status === 'revisao_qualidade').length;
    const bloq = myItems.filter(x => x.it.status === 'materia_falta' || x.it.status === 'aguardando_mp').length;
    const opIds = [...new Set(myItems.map(x => x.op.id))];
    const myOps = activeOps.filter(o => opIds.includes(o.id)).sort((a, b) => new Date(a.deliveryDate || '9999') - new Date(b.deliveryDate || '9999'));

    cnt.innerHTML = '<div class="ptitle">' + secLabel[sec] + '</div><div class="psub">Painel do Setor · ' + new Date().toLocaleString('pt-BR') + '</div>' +
      '<div class="dash-kpi">' +
        _kCard(fnum(total), 'Itens Ativos', 'Neste setor', 'kblue', '📋') +
        _kCard(fnum(total - emProd - liberados - bloq), 'Aguardando', 'Não iniciados', total - emProd - liberados - bloq > 0 ? 'kyellow' : 'kgreen', '⏳') +
        _kCard(fnum(emProd), 'Em Produção', 'Em andamento', emProd > 0 ? 'kblue' : 'kgray', '⚙️') +
        _kCard(fnum(bloq), 'Bloqueados', 'Falta material', bloq > 0 ? 'kred' : 'kgreen', '🔒') +
        _kCard(fnum(liberados), 'Liberados', 'Prontos ✓', 'kgreen', '✅') +
      '</div>' +
      '<div class="dash-panel">' +
        '<div class="dpanel-title">📋 Ordens de Produção · ' + secLabel[sec] + '</div>' +
        '<div class="dash-panel-body">' + (!myOps.length ? '<div class="dash-empty">Nenhuma OP ativa neste setor</div>' :
          myOps.map(op => {
            const itsHere = myItems.filter(x => x.op.id === op.id);
            const lib = itsHere.filter(x => x.it.status === 'liberado').length;
            const pct = itsHere.length ? Math.round(lib / itsHere.length * 100) : 0;
            const overdue = op.deliveryDate && new Date(op.deliveryDate + 'T00:00:00') < now;
            return '<div class="risk-row">' +
              '<div class="risk-dot ' + (overdue ? 'dot-red' : pct === 100 ? 'dot-green' : 'dot-blue') + '"></div>' +
              '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">#' + esc(op.opNum) + ' · ' + esc(op.clientName) + '</div>' +
              '<div style="font-size:11px;color:var(--muted)">' + (op.deliveryDate ? 'Prazo: ' + fdate(op.deliveryDate) + (overdue ? ' ⚠️' : '') : 'Sem prazo') + '</div></div>' +
              '<div style="font-size:12px;font-weight:700;color:' + _pctColor(pct) + '">' + pct + '%<div style="font-size:10px;font-weight:400;color:var(--muted)">lib.</div></div>' +
              '</div>';
          }).join('')) +
        '</div>' +
      '</div>' +
      '<div style="text-align:right;margin-top:10px"><button class="btn btn-ghost btn-sm dash-refresh-btn" onclick="refreshDashboard()">↻ Atualizar</button></div>';
  }
}

// ─── DASHBOARD COMPRADOR (v2.0) ───────────────────────
function rCompradorDashboard() {
  const cnt = _cnt(); const d = gdb();
  const activeOps = d.ops.filter(o => !o.archived && o.status === 'ativo');

  // Coleta itens abaixo do mínimo
  const mpBaixo = [], embBaixo = [], revendaUrgente = [], revendaBaixo = [];

  (d.rawMaterials || []).forEach(rm => {
    if (!rm.minStock) return;
    const stk = d.rawMaterialStock[rm.id] || {};
    const total = Object.values(stk).reduce((a, v) => a + (v.qty || 0), 0);
    if (total < rm.minStock) mpBaixo.push({ ...rm, qty: total, deficit: rm.minStock - total, type: 'MP' });
  });

  (d.packaging || []).forEach(pk => {
    if (!pk.minStock) return;
    const qty = d.packagingStock[pk.id] || 0;
    if (qty < pk.minStock) embBaixo.push({ ...pk, qty, deficit: pk.minStock - qty, type: 'PK' });
  });

  d.products.filter(p => p.isStock).forEach(p => {
    const demand = activeOps.reduce((a, op) => { const it = op.items.find(i => i.pid === p.id); return a + (it ? _itemQtyLeft(it) : 0); }, 0);
    if (demand <= 0) return;
    const st = d.stock[p.id]; const avail = st ? st.qty : 0;
    if (avail < demand) revendaUrgente.push({ ...p, qty: avail, deficit: demand - avail, demand, type: 'revenda' });
    else if (p.minStock && avail < p.minStock) revendaBaixo.push({ ...p, qty: avail, deficit: p.minStock - avail, type: 'revenda' });
  });

  function _itemRow(item, section) {
    const po = (d.purchaseOrders || []).find(o => o.itemId === item.id && o.status === 'pedido_realizado');
    const badgeStyle = 'padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;';
    let badge = '';
    if (po) {
      const overdue = po.expectedAt && Date.now() > po.expectedAt;
      badge = overdue
        ? '<span style="' + badgeStyle + 'background:rgba(239,68,68,.12);color:#ef4444">⚠️ Atrasado · esperado ' + fdate(new Date(po.expectedAt).toISOString().split('T')[0]) + '</span>'
        : '<span style="' + badgeStyle + 'background:rgba(34,197,94,.10);color:var(--green)">📦 Pedido · entrega ' + fdate(new Date(po.expectedAt).toISOString().split('T')[0]) + '</span>';
    }
    const qtyLabel = item.qty != null ? fqty(item.qty, item.unit) + ' ' + (item.unit || 'UN') + ' em estoque' : '';
    const defLabel = 'Falta: ' + fqty(item.deficit, item.unit) + ' ' + (item.unit || 'UN');
    return '<div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:10px">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(item.name) + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + (item.sku ? '<span class="sku">' + esc(item.sku) + '</span> · ' : '') + qtyLabel + (qtyLabel && defLabel ? ' · ' : '') + defLabel + '</div>' +
        (badge ? '<div style="margin-top:5px">' + badge + '</div>' : '') +
      '</div>' +
      (!po ? '<button class="btn btn-green btn-sm" onclick="openConfirmarPedido(\'' + item.id + '\',\'' + section + '\',\'' + esc(item.name) + '\',\'' + (item.unit || 'UN') + '\')" style="flex-shrink:0">✅ Confirmar Pedido</button>' : '') +
    '</div>';
  }

  function _section(title, color, items, section) {
    if (!items.length) return '';
    return '<div class="card" style="border-top:3px solid ' + color + ';margin-bottom:14px">' +
      '<div class="card-header"><div class="card-title">' + title + ' <span style="font-size:12px;font-weight:400;color:var(--muted)">(' + items.length + ' iten(s))</span></div></div>' +
      items.sort((a, b) => b.deficit - a.deficit).map(i => _itemRow(i, section)).join('') +
    '</div>';
  }

  const totalAlerts = mpBaixo.length + embBaixo.length + revendaUrgente.length + revendaBaixo.length;
  cnt.innerHTML =
    '<div class="ptitle">🛒 Dashboard do Comprador</div>' +
    '<div class="psub">' + (totalAlerts ? totalAlerts + ' iten(s) precisam de atenção' : 'Tudo dentro do estoque mínimo ✓') + '</div>' +
    (totalAlerts === 0 ? '<div class="empty"><div class="ei">✅</div><div>Estoque dentro do mínimo</div></div>' : '') +
    _section('🌿 Matéria-Prima abaixo do mínimo', '#22c55e', mpBaixo, 'MP') +
    _section('📦 Embalagens abaixo do mínimo', '#3b82f6', embBaixo, 'PK') +
    _section('🚨 Revenda Urgente (reservado sem estoque)', '#ef4444', revendaUrgente, 'REV') +
    _section('🛒 Revenda abaixo do mínimo', '#f59e0b', revendaBaixo, 'REV') +
    '<div style="text-align:right;margin-top:4px"><button class="btn btn-ghost btn-sm dash-refresh-btn" onclick="refreshDashboard()">↻ Atualizar</button></div>';
}
window.rCompradorDashboard = rCompradorDashboard;

// ─── CONFIRMAR PEDIDO (comprador) ─────────────────────
window.openConfirmarPedido = function(itemId, section, itemName, unit) {
  const d = gdb();
  const fornecedores = (d.suppliers || []).map(s => '<option value="' + s.id + '" data-name="' + esc(s.name) + '">' + esc(s.name) + '</option>').join('');
  const today = today8601();
  Mopen('✅ Confirmar Pedido — ' + itemName,
    '<div class="fg"><label>Fornecedor</label><select id="po-supp" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)"><option value="">Selecionar fornecedor...</option>' + fornecedores + '</select></div>' +
    '<div class="fgrid">' +
      '<div class="fg"><label>Quantidade Pedida (' + unit + ')</label><input type="number" id="po-qty" min="0.001" step="any" placeholder="0" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)"></div>' +
      '<div class="fg"><label>Prazo de Entrega</label><input type="date" id="po-date" min="' + today + '" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)"></div>' +
    '</div>' +
    '<div class="fg"><label>Observação (opcional)</label><input type="text" id="po-obs" placeholder="Ex: urgente, confirmar disponibilidade..." style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text)"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>' +
    '<button class="btn btn-green" onclick="_salvarPedido(\'' + itemId + '\',\'' + section + '\',\'' + unit + '\')">✅ Confirmar Pedido</button>'
  );
};

window._salvarPedido = function(itemId, section, unit) {
  const suppEl = document.getElementById('po-supp');
  const suppId = suppEl?.value; const suppName = suppEl?.options[suppEl.selectedIndex]?.dataset?.name || '';
  const qty = parseFloat(document.getElementById('po-qty')?.value || 0);
  const dateStr = document.getElementById('po-date')?.value;
  const obs = document.getElementById('po-obs')?.value?.trim() || '';
  if (!qty || qty <= 0) { toast('Informe a quantidade', 'err'); return; }
  if (!dateStr) { toast('Informe o prazo de entrega', 'err'); return; }
  const d = gdb();
  const item = [...(d.rawMaterials || []), ...(d.packaging || []), ...(d.products || [])].find(x => x.id === itemId);
  if (!d.purchaseOrders) d.purchaseOrders = [];
  // Remove pedido anterior pendente do mesmo item (se houver)
  d.purchaseOrders = d.purchaseOrders.filter(o => !(o.itemId === itemId && o.status === 'pedido_realizado'));
  d.purchaseOrders.push({
    id: uid(), itemId, itemType: section, itemName: item?.name || itemId, supplierId: suppId, supplierName: suppName,
    qtyOrdered: qty, unit, expectedAt: new Date(dateStr + 'T00:00:00').getTime(),
    confirmedAt: Date.now(), confirmedBy: S.id, status: 'pedido_realizado', obs
  });
  logAction('Pedido de compra confirmado', item?.name || itemId);
  sdb(d); Mclose(); toast('Pedido confirmado! Prazo: ' + fdate(dateStr), 'ok');
  setTimeout(rCompradorDashboard, 300);
};

window.rDashboard = rDashboard;
window.rSectorDashboard = rSectorDashboard;
