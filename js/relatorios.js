// ══════════════════════════════════════════════════════════════════
// relatorios.js — Flow TGL v2.0
// Relatórios: OPs por período, produção por setor, evolução de estoque
// Export Excel via SheetJS (CDN carregado sob demanda)
// ══════════════════════════════════════════════════════════════════

// ─── Estado global ────────────────────────────────────────────────
let _relTab = 'ops';
let _relDateFrom = '', _relDateTo = '';
let _relSector = '';

// ─── INIT ─────────────────────────────────────────────────────────
function rRelatorios() {
  const cnt = document.getElementById('acontent'); if (!cnt) return;
  const today = new Date().toISOString().split('T')[0];
  const firstDay = today.slice(0, 7) + '-01';
  _relDateFrom = _relDateFrom || firstDay;
  _relDateTo   = _relDateTo   || today;

  cnt.innerHTML =
    '<div class="ptitle">📈 Relatórios</div>' +
    '<div class="psub">Analise a produção por período e exporte para Excel</div>' +
    '<div class="stabs">' +
    '<button class="stab on" id="rt-ops"     onclick="relTab(\'ops\')">📋 OPs Finalizadas</button>' +
    '<button class="stab"   id="rt-setor"    onclick="relTab(\'setor\')">⚙️ Por Setor</button>' +
    '<button class="stab"   id="rt-estoque"  onclick="relTab(\'estoque\')">📦 Estoque</button>' +
    '<button class="stab"   id="rt-audit"    onclick="relTab(\'audit\')">🕐 Auditoria</button>' +
    '</div>' +
    '<div id="rel-filtros" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:20px;padding:14px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px">' +
    '<div class="fg" style="margin:0;min-width:140px"><label>De</label><input type="date" id="rel-from" value="'+_relDateFrom+'" onchange="_relApplyFilter()"></div>' +
    '<div class="fg" style="margin:0;min-width:140px"><label>Até</label><input type="date" id="rel-to" value="'+_relDateTo+'" onchange="_relApplyFilter()"></div>' +
    '<div class="fg" style="margin:0;min-width:160px"><label>Setor</label>' +
    '<select id="rel-setor" onchange="_relApplyFilter()"><option value="">Todos os setores</option>' +
    '<option value="preformados">🧵 Preformados</option>' +
    '<option value="estamparia">🔩 Estamparia</option>' +
    '<option value="espinar">🔌 Espinar/Fita</option>' +
    '</select></div>' +
    '<button class="btn btn-green" onclick="_relApplyFilter()" style="margin-top:16px">🔍 Filtrar</button>' +
    '<button class="btn btn-ghost" onclick="exportExcel()" style="margin-top:16px">📤 Exportar Excel</button>' +
    '</div>' +
    '<div id="rel-content"></div>';

  relTab('ops');
}
window.rRelatorios = rRelatorios;

function relTab(t) {
  _relTab = t;
  document.querySelectorAll('.stab[id^="rt-"]').forEach(b => b.classList.remove('on'));
  const bt = document.getElementById('rt-' + t); if (bt) bt.classList.add('on');
  _relApplyFilter();
}
window.relTab = relTab;

function _relApplyFilter() {
  _relDateFrom = (document.getElementById('rel-from') || {}).value || _relDateFrom;
  _relDateTo   = (document.getElementById('rel-to')   || {}).value || _relDateTo;
  _relSector   = (document.getElementById('rel-setor') || {}).value || '';
  if (_relTab === 'ops')     _renderRelOps();
  else if (_relTab === 'setor')   _renderRelSetor();
  else if (_relTab === 'estoque') _renderRelEstoque();
  else if (_relTab === 'audit')   _renderRelAudit();
}
window._relApplyFilter = _relApplyFilter;

// ─── helper: filtra OPs finalizadas no período ──────────────────
function _opsNoPeriodo(d) {
  const from = _relDateFrom ? new Date(_relDateFrom).getTime() : 0;
  const to   = _relDateTo   ? new Date(_relDateTo + 'T23:59:59').getTime() : Date.now();
  return (d.ops || []).filter(op => {
    if (op.status !== 'finalizado') return false;
    const at = op.finalAt || op.updatedAt || 0;
    return at >= from && at <= to;
  });
}

// ─── KPI card ─────────────────────────────────────────────────────
function _kpi(label, value, sub, color) {
  return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px 20px;min-width:130px;flex:1">' +
    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">' + label + '</div>' +
    '<div style="font-size:24px;font-weight:700;color:' + (color || 'var(--text)') + '">' + value + '</div>' +
    (sub ? '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + sub + '</div>' : '') +
    '</div>';
}

// ═══════════════════════════════════════════════════════════════════
// ABA 1 — OPs Finalizadas
// ═══════════════════════════════════════════════════════════════════
function _renderRelOps() {
  const cnt = document.getElementById('rel-content'); if (!cnt) return;
  const d = gdb();
  const ops = _opsNoPeriodo(d);
  const totalItens = ops.reduce((s, op) => s + (op.items || []).length, 0);
  const totalQty   = ops.reduce((s, op) => s + (op.items || []).reduce((a, it) => a + (it.qty || 0), 0), 0);

  // KPIs
  const kpis = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">' +
    _kpi('OPs Finalizadas', ops.length, 'no período', 'var(--green)') +
    _kpi('Total de Itens', totalItens, 'linhas de OP') +
    _kpi('Total de Unidades', fnum(totalQty), 'peças produzidas') +
    '</div>';

  if (!ops.length) {
    cnt.innerHTML = kpis + '<div class="empty"><div class="ei">📋</div><div>Nenhuma OP finalizada no período selecionado</div></div>';
    return;
  }

  const rows = ops
    .sort((a, b) => (b.finalAt || 0) - (a.finalAt || 0))
    .map(op => {
      const dt = op.finalAt ? new Date(op.finalAt).toLocaleDateString('pt-BR') : '—';
      const itens = (op.items || []).length;
      const qty   = (op.items || []).reduce((s, it) => s + (it.qty || 0), 0);
      return '<tr>' +
        '<td><strong>#' + esc(op.opNum) + '</strong></td>' +
        '<td>' + esc(op.clientName || '—') + '</td>' +
        '<td>' + esc(fdate(op.deliveryDate) || '—') + '</td>' +
        '<td>' + dt + '</td>' +
        '<td style="text-align:center">' + itens + '</td>' +
        '<td style="text-align:center">' + fnum(qty) + '</td>' +
        '<td>' + esc(op.transporter || '—') + '</td>' +
        '<td>' + esc(op.nfeNumber || '—') + '</td>' +
      '</tr>';
    }).join('');

  cnt.innerHTML = kpis +
    '<div class="tw" style="max-height:480px;overflow-y:auto">' +
    '<table><thead><tr>' +
    '<th>OP</th><th>Cliente</th><th>Entrega</th><th>Finalizada em</th>' +
    '<th>Itens</th><th>Qtd</th><th>Transportadora</th><th>NF</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:8px">' + ops.length + ' OP(s) · ' + fnum(totalQty) + ' unidades no período</div>';
}

// ═══════════════════════════════════════════════════════════════════
// ABA 2 — Produção por Setor
// ═══════════════════════════════════════════════════════════════════
function _renderRelSetor() {
  const cnt = document.getElementById('rel-content'); if (!cnt) return;
  const d = gdb();
  const ops = _opsNoPeriodo(d);
  const sectors = ['preformados', 'estamparia', 'espinar'];
  const secLabel = { preformados: '🧵 Preformados', estamparia: '🔩 Estamparia', espinar: '🔌 Espinar/Fita' };

  if (!ops.length) {
    cnt.innerHTML = '<div class="empty"><div class="ei">⚙️</div><div>Nenhuma OP finalizada no período</div></div>';
    return;
  }

  // Contagem por setor
  const stats = {};
  sectors.forEach(sec => { stats[sec] = { ops: 0, itens: 0, qty: 0, produtos: {} }; });

  ops.forEach(op => {
    sectors.forEach(sec => {
      const secItems = (op.items || []).filter(it => {
        const p = d.products.find(x => x.id === it.pid);
        return p && (p.sectors || []).includes(sec);
      });
      if (!secItems.length) return;
      stats[sec].ops++;
      stats[sec].itens += secItems.length;
      secItems.forEach(it => {
        stats[sec].qty += it.qty || 0;
        const pname = (d.products.find(x => x.id === it.pid) || {}).name || it.productName || '—';
        if (!stats[sec].produtos[pname]) stats[sec].produtos[pname] = 0;
        stats[sec].produtos[pname] += it.qty || 0;
      });
    });
  });

  const cards = sectors
    .filter(sec => !_relSector || sec === _relSector)
    .map(sec => {
      const s = stats[sec];
      const topProds = Object.entries(s.produtos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([n, q]) => '<tr><td style="font-size:12px">'+esc(n)+'</td><td style="text-align:right;font-size:12px;font-weight:600">'+fnum(q)+'</td></tr>')
        .join('');
      return '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-header"><div class="card-title">' + secLabel[sec] + '</div></div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
        _kpi('OPs', s.ops, '') + _kpi('Itens', s.itens, '') + _kpi('Unidades', fnum(s.qty), '') +
        '</div>' +
        (topProds ? '<div class="tw"><table><thead><tr><th style="text-align:left">Produto</th><th style="text-align:right">Qtd</th></tr></thead><tbody>' + topProds + '</tbody></table></div>' : '') +
      '</div>';
    }).join('');

  cnt.innerHTML = cards || '<div class="empty"><div class="ei">⚙️</div><div>Nenhum dado para o setor selecionado</div></div>';
}

// ═══════════════════════════════════════════════════════════════════
// ABA 3 — Estoque (snapshot atual)
// ═══════════════════════════════════════════════════════════════════
function _renderRelEstoque() {
  const cnt = document.getElementById('rel-content'); if (!cnt) return;
  const d = gdb();

  // MP
  const mpRows = (d.rawMaterials || []).map(rm => {
    const total = Object.values(d.rawMaterialStock[rm.id] || {}).reduce((s, v) => s + (v.qty || 0), 0);
    const status = rm.minStock ? (total === 0 ? '🔴 Zerado' : total < rm.minStock ? '🟡 Baixo' : '🟢 OK') : '—';
    return { name: rm.name, unit: rm.unit || 'KG', qty: total, min: rm.minStock || 0, status };
  });

  // Embalagens
  const embRows = (d.packaging || []).map(pk => {
    const qty = d.packagingStock[pk.id] || 0;
    const status = pk.minStock ? (qty === 0 ? '🔴 Zerado' : qty < pk.minStock ? '🟡 Baixo' : '🟢 OK') : '—';
    return { name: pk.name, unit: pk.unit || 'UN', qty, min: pk.minStock || 0, status };
  });

  // Revenda
  const revRows = (d.products || []).filter(p => p.isStock).map(p => {
    const qty = (d.stock[p.id] || {}).qty || 0;
    const status = p.minStock ? (qty === 0 ? '🔴 Zerado' : qty < p.minStock ? '🟡 Baixo' : '🟢 OK') : '—';
    return { name: p.name, sku: p.sku || '', unit: p.unit || 'UN', qty, min: p.minStock || 0, status };
  });

  function _tbl(title, rows, cols) {
    if (!rows.length) return '';
    return '<div class="card" style="margin-bottom:16px">' +
      '<div class="card-header"><div class="card-title">' + title + ' <span style="font-size:12px;font-weight:400;color:var(--muted)">(' + rows.length + ')</span></div></div>' +
      '<div class="tw" style="max-height:320px;overflow-y:auto"><table><thead><tr>' +
      cols.map(c => '<th>' + c + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows.map(r => '<tr>' +
        '<td>' + esc(r.name) + (r.sku ? ' <span class="sku">' + esc(r.sku) + '</span>' : '') + '</td>' +
        '<td style="text-align:center;font-weight:600">' + fnum(r.qty) + '</td>' +
        '<td style="text-align:center;color:var(--muted)">' + esc(r.unit) + '</td>' +
        '<td style="text-align:center;color:var(--muted)">' + (r.min ? fnum(r.min) : '—') + '</td>' +
        '<td>' + r.status + '</td>' +
      '</tr>').join('') +
      '</tbody></table></div></div>';
  }

  const cols = ['Nome', 'Qtd', 'Un.', 'Mínimo', 'Status'];
  cnt.innerHTML = _tbl('🌿 Matéria-Prima', mpRows, cols) + _tbl('📦 Embalagens', embRows, cols) + _tbl('🏷️ Produtos de Revenda', revRows, cols);
}

// ═══════════════════════════════════════════════════════════════════
// ABA 4 — Auditoria
// ═══════════════════════════════════════════════════════════════════
async function _renderRelAudit() {
  const cnt = document.getElementById('rel-content'); if (!cnt) return;
  cnt.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">🔄 Carregando histórico de auditoria...</div>';
  try {
    const from = _relDateFrom ? new Date(_relDateFrom).toISOString() : '';
    const to   = _relDateTo   ? new Date(_relDateTo + 'T23:59:59').toISOString() : '';
    let url = '/rest/v1/' + _AUDIT_TABLE + '?select=*&order=at.desc&limit=500';
    if (from) url += '&at=gte.' + encodeURIComponent(from);
    if (to)   url += '&at=lte.' + encodeURIComponent(to);
    const r = await _sf(url);
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    if (!rows.length) { cnt.innerHTML = '<div class="empty"><div class="ei">🕐</div><div>Nenhum registro no período</div></div>'; return; }
    const trs = rows.map(row => {
      const dt = new Date(row.at);
      const dtStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return '<tr><td style="font-size:12px;white-space:nowrap;color:var(--muted)">' + dtStr + '</td>' +
        '<td style="font-size:12px">' + esc(row.uname || '—') + '</td>' +
        '<td><span class="bs bs-info" style="font-size:11px">' + esc(row.action || '—') + '</span></td>' +
        '<td style="font-size:12px;color:var(--sub)">' + esc(row.details || '') + '</td></tr>';
    }).join('');
    cnt.innerHTML = '<div class="tw" style="max-height:520px;overflow-y:auto">' +
      '<table><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:8px">' + rows.length + ' registro(s)</div>';
  } catch (e) {
    cnt.innerHTML = '<div style="color:var(--danger);padding:20px">Erro ao carregar auditoria: ' + esc(String(e)) + '</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT EXCEL
// ═══════════════════════════════════════════════════════════════════
window.exportExcel = async function () {
  try {
  // Carrega SheetJS sob demanda
  if (!window.XLSX) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('Falha ao carregar biblioteca de Excel. Verifique sua conexão.'));
      document.head.appendChild(s);
    });
  }
  const d = gdb();
  const wb = XLSX.utils.book_new();

  // Aba 1 — OPs finalizadas
  const ops = _opsNoPeriodo(d);
  const opRows = [['OP', 'Cliente', 'Data Entrega', 'Finalizada em', 'Itens', 'Total Qtd', 'Transportadora', 'NF']];
  ops.forEach(op => {
    const qty = (op.items || []).reduce((s, it) => s + (it.qty || 0), 0);
    const dt  = op.finalAt ? new Date(op.finalAt).toLocaleDateString('pt-BR') : '';
    opRows.push([op.opNum, op.clientName || '', fdate(op.deliveryDate) || '', dt, (op.items || []).length, qty, op.transporter || '', op.nfeNumber || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opRows), 'OPs Finalizadas');

  // Aba 2 — Estoque MP
  const mpRows = [['Nome', 'Unidade', 'Quantidade', 'Mínimo']];
  (d.rawMaterials || []).forEach(rm => {
    const total = Object.values(d.rawMaterialStock[rm.id] || {}).reduce((s, v) => s + (v.qty || 0), 0);
    mpRows.push([rm.name, rm.unit || 'KG', total, rm.minStock || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mpRows), 'Estoque MP');

  // Aba 3 — Estoque Embalagens
  const embRows = [['Nome', 'Unidade', 'Quantidade', 'Mínimo']];
  (d.packaging || []).forEach(pk => {
    embRows.push([pk.name, pk.unit || 'UN', d.packagingStock[pk.id] || 0, pk.minStock || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(embRows), 'Estoque Embalagens');

  // Aba 4 — Revenda
  const revRows = [['Nome', 'SKU', 'Unidade', 'Quantidade', 'Mínimo']];
  (d.products || []).filter(p => p.isStock).forEach(p => {
    revRows.push([p.name, p.sku || '', p.unit || 'UN', (d.stock[p.id] || {}).qty || 0, p.minStock || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revRows), 'Revenda');

  // Gera arquivo
  const periodo = (_relDateFrom + '_' + _relDateTo).replace(/-/g, '');
  XLSX.writeFile(wb, 'FlowTGL_Relatorio_' + periodo + '.xlsx');
  toast('Excel exportado!', 'ok');
  } catch (e) {
    toast('Erro ao exportar Excel: ' + (e.message || String(e)), 'err');
  }
};
