// ══════════════════════════════════════════════════════════════════
// agenda.js — Flow TGL v2.0
// Calendário visual de OPs por data de entrega
// Navegação mensal, cores por status, modal de detalhes ao clicar
// ══════════════════════════════════════════════════════════════════

// ─── Estado ───────────────────────────────────────────────────────
let _agYear  = 0;
let _agMonth = 0; // 0-indexed
let _agFilter = ''; // '' = todos | 'pendente' | 'em_producao' | 'liberado' | 'finalizado'

// Cores e labels de status
const _AG_STATUS = {
  pendente:    { label: 'Pendente',    bg: '#fbbf24', text: '#fff' },
  em_producao: { label: 'Em Produção', bg: '#3b82f6', text: '#fff' },
  liberado:    { label: 'Liberado',    bg: '#8b5cf6', text: '#fff' },
  finalizado:  { label: 'Finalizado',  bg: '#10b981', text: '#fff' },
};
const _AG_STATUS_KEYS = Object.keys(_AG_STATUS);

// ─── INIT ─────────────────────────────────────────────────────────
function rAgenda() {
  const cnt = document.getElementById('acontent'); if (!cnt) return;
  const now = new Date();
  if (!_agYear) {
    _agYear  = now.getFullYear();
    _agMonth = now.getMonth();
  }

  cnt.innerHTML =
    '<div class="ptitle">📅 Agenda de Produção</div>' +
    '<div class="psub">Visualize as OPs por data de entrega. Clique em qualquer dia com OPs para ver os detalhes.</div>' +
    '<div id="agenda-wrap"></div>';

  _renderAgenda();
}
window.rAgenda = rAgenda;

// ─── Render principal ──────────────────────────────────────────────
function _renderAgenda() {
  const wrap = document.getElementById('agenda-wrap'); if (!wrap) return;
  const d = gdb();

  // ── Controles ──────────────────────────────────────────────────
  const mes = new Date(_agYear, _agMonth, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const mesLabel = mes.charAt(0).toUpperCase() + mes.slice(1);

  const filterBtns = _AG_STATUS_KEYS.map(s => {
    const on = _agFilter === s ? ' on' : '';
    const st = _AG_STATUS[s];
    return `<button class="stab${on}" onclick="agFilter('${s}')" style="${on ? 'background:'+st.bg+';color:'+st.text+';border-color:'+st.bg : ''}">${st.label}</button>`;
  }).join('');

  const controls =
    '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">' +
    '<button class="btn btn-ghost" onclick="agNav(-1)" style="min-width:36px;padding:6px 10px">‹</button>' +
    '<div style="font-size:17px;font-weight:700;min-width:160px;text-align:center">' + mesLabel + '</div>' +
    '<button class="btn btn-ghost" onclick="agNav(1)"  style="min-width:36px;padding:6px 10px">›</button>' +
    '<button class="btn btn-ghost" onclick="agToday()" style="margin-left:4px">Hoje</button>' +
    '<div style="flex:1"></div>' +
    '<div class="stabs" style="margin:0">' +
    '<button class="stab' + (_agFilter === '' ? ' on' : '') + '" onclick="agFilter(\'\')">Todos</button>' +
    filterBtns +
    '</div></div>';

  // ── Legenda ────────────────────────────────────────────────────
  const legenda = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
    _AG_STATUS_KEYS.map(s => {
      const st = _AG_STATUS[s];
      return '<span style="display:flex;align-items:center;gap:5px;font-size:12px">' +
        '<span style="width:11px;height:11px;border-radius:3px;background:'+st.bg+';display:inline-block"></span>' +
        st.label + '</span>';
    }).join('') +
  '</div>';

  // ── Calendário ─────────────────────────────────────────────────
  const cal = _buildCalendar(d);

  // ── Sidebar: OPs sem data / expiradas ──────────────────────────
  const sidebar = _buildSidebar(d);

  wrap.innerHTML = controls + legenda +
    '<div style="display:flex;gap:16px;align-items:flex-start">' +
    '<div style="flex:1;min-width:0">' + cal + '</div>' +
    '<div style="width:260px;flex-shrink:0">' + sidebar + '</div>' +
    '</div>';
}

// ─── Navegação ─────────────────────────────────────────────────────
function agNav(delta) {
  _agMonth += delta;
  if (_agMonth < 0)  { _agMonth = 11; _agYear--; }
  if (_agMonth > 11) { _agMonth = 0;  _agYear++; }
  _renderAgenda();
}
window.agNav = agNav;

function agToday() {
  const now = new Date();
  _agYear  = now.getFullYear();
  _agMonth = now.getMonth();
  _renderAgenda();
}
window.agToday = agToday;

function agFilter(s) {
  _agFilter = s;
  _renderAgenda();
}
window.agFilter = agFilter;

// ─── Constrói grelha do calendário ────────────────────────────────
function _buildCalendar(d) {
  const firstDay = new Date(_agYear, _agMonth, 1);
  const lastDay  = new Date(_agYear, _agMonth + 1, 0);
  const today    = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Agrupa OPs por data de entrega (YYYY-MM-DD)
  const byDate = {};
  (d.ops || []).forEach(op => {
    if (!op.deliveryDate) return;
    const status = op.status || 'pendente';
    if (_agFilter && status !== _agFilter) return;
    const dd = op.deliveryDate.split('T')[0];
    if (!byDate[dd]) byDate[dd] = [];
    byDate[dd].push(op);
  });

  // Cabeçalho dias da semana
  const DAYS_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';

  // Labels de dia da semana
  DAYS_LABEL.forEach(l => {
    html += '<div style="text-align:center;font-size:11px;font-weight:600;color:var(--muted);padding:4px 0">' + l + '</div>';
  });

  // Células vazias iniciais
  const startDow = firstDay.getDay(); // 0=Dom
  for (let i = 0; i < startDow; i++) {
    html += '<div style="min-height:80px;border-radius:8px"></div>';
  }

  // Dias do mês
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = _agYear + '-' + String(_agMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const isToday = dateStr === todayStr;
    const ops = byDate[dateStr] || [];
    const isPast = dateStr < todayStr;

    const dayBg = isToday ? 'var(--accent-dim,rgba(59,130,246,.12))' : 'var(--bg-card)';
    const dayBorder = isToday ? '2px solid var(--accent,#3b82f6)' : '1px solid var(--border)';
    const dayNumColor = isToday ? 'var(--accent,#3b82f6)' : isPast ? 'var(--muted)' : 'var(--text)';

    // Max 3 chips por célula + "e mais N"
    const visible = ops.slice(0, 3);
    const extra   = ops.length - visible.length;

    const chips = visible.map(op => {
      const st = _AG_STATUS[op.status || 'pendente'] || _AG_STATUS.pendente;
      const label = '#' + (op.opNum || '?') + ' – ' + (op.clientName || '').slice(0, 12);
      return `<div onclick="event.stopPropagation();agOpenOp('${esc(op.id)}')" style="background:${st.bg};color:${st.text};border-radius:4px;font-size:10px;padding:2px 5px;margin-top:2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(op.opNum+' – '+(op.clientName||''))}">${esc(label)}</div>`;
    }).join('');

    const extraChip = extra > 0
      ? `<div onclick="event.stopPropagation();agOpenDay('${dateStr}')" style="font-size:10px;color:var(--muted);padding:2px 5px;cursor:pointer">+${extra} mais...</div>`
      : '';

    const cellClick = ops.length ? `onclick="agOpenDay('${dateStr}')"` : '';
    const cellCursor = ops.length ? 'pointer' : 'default';
    const cellHover = ops.length ? ' class="ag-day-active"' : '';
    html += `<div${cellHover} ${cellClick} style="min-height:80px;background:${dayBg};border:${dayBorder};border-radius:8px;padding:5px 6px;cursor:${cellCursor}">`+
      `<div style="font-size:12px;font-weight:700;color:${dayNumColor};margin-bottom:2px">${day}</div>` +
      chips + extraChip +
      '</div>';
  }

  html += '</div>';
  return html;
}

// ─── Sidebar ───────────────────────────────────────────────────────
function _buildSidebar(d) {
  const today = new Date().toISOString().split('T')[0];

  // OPs sem data de entrega definida
  const semData = (d.ops || []).filter(op => {
    if (op.status === 'finalizado') return false;
    if (_agFilter && op.status !== _agFilter) return false;
    return !op.deliveryDate || op.deliveryDate.trim() === '';
  });

  // OPs com data no mês corrente (para KPIs)
  const mesOps = (d.ops || []).filter(op => {
    if (!op.deliveryDate) return false;
    const dd = op.deliveryDate.split('T')[0];
    const y = parseInt(dd.split('-')[0]);
    const m = parseInt(dd.split('-')[1]) - 1;
    return y === _agYear && m === _agMonth;
  });

  const pending   = mesOps.filter(op => op.status === 'pendente').length;
  const emProd    = mesOps.filter(op => op.status === 'em_producao').length;
  const liberado  = mesOps.filter(op => op.status === 'liberado').length;
  const finaliz   = mesOps.filter(op => op.status === 'finalizado').length;

  // OPs atrasadas (data entrega < hoje e não finalizado)
  const atrasadas = (d.ops || []).filter(op => {
    if (op.status === 'finalizado') return false;
    if (!op.deliveryDate) return false;
    return op.deliveryDate.split('T')[0] < today;
  });

  const kpiBlock =
    '<div class="card" style="margin-bottom:12px">' +
    '<div class="card-header"><div class="card-title" style="font-size:13px">Resumo do mês</div></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
    _agKpi('Pendente', pending, '#fbbf24') +
    _agKpi('Em Prod.', emProd, '#3b82f6') +
    _agKpi('Liberado', liberado, '#8b5cf6') +
    _agKpi('Finaliz.', finaliz, '#10b981') +
    '</div></div>';

  const atrasadasBlock = atrasadas.length
    ? '<div class="card" style="margin-bottom:12px;border-left:3px solid var(--danger,#ef4444)">' +
      '<div class="card-header"><div class="card-title" style="font-size:13px;color:var(--danger,#ef4444)">⚠️ Atrasadas (' + atrasadas.length + ')</div></div>' +
      atrasadas.slice(0, 6).map(op => {
        const st = _AG_STATUS[op.status || 'pendente'] || _AG_STATUS.pendente;
        return `<div onclick="agOpenOp('${esc(op.id)}')" style="padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer">`+
          `<div style="font-size:12px;font-weight:600">#${esc(op.opNum)}</div>`+
          `<div style="font-size:11px;color:var(--muted)">${esc(op.clientName||'—')} · ${esc(fdate(op.deliveryDate)||'—')}</div>`+
          `<span style="font-size:10px;background:${st.bg};color:${st.text};border-radius:3px;padding:1px 5px">${st.label}</span>`+
          '</div>';
      }).join('') +
      (atrasadas.length > 6 ? '<div style="font-size:11px;color:var(--muted);padding-top:4px">+' + (atrasadas.length - 6) + ' mais</div>' : '') +
    '</div>'
    : '';

  const semDataBlock = semData.length
    ? '<div class="card">' +
      '<div class="card-header"><div class="card-title" style="font-size:13px">Sem data definida (' + semData.length + ')</div></div>' +
      semData.slice(0, 5).map(op => `<div style="font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">#${esc(op.opNum)} – ${esc(op.clientName||'—')}</div>`).join('') +
      (semData.length > 5 ? '<div style="font-size:11px;color:var(--muted)">+' + (semData.length - 5) + ' mais</div>' : '') +
    '</div>'
    : '';

  return kpiBlock + atrasadasBlock + semDataBlock;
}

function _agKpi(label, val, color) {
  return '<div style="text-align:center;padding:8px 4px;background:var(--bg);border-radius:6px">' +
    '<div style="font-size:18px;font-weight:700;color:'+color+'">' + val + '</div>' +
    '<div style="font-size:10px;color:var(--muted)">' + label + '</div>' +
    '</div>';
}

// ─── Modal: OPs do dia ─────────────────────────────────────────────
window.agOpenDay = function (dateStr) {
  const d = gdb();
  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const ops = (d.ops || []).filter(op => op.deliveryDate && op.deliveryDate.split('T')[0] === dateStr);
  const rows = ops.map(op => _agOpRow(d, op)).join('');
  Mopen(
    '📅 ' + label.charAt(0).toUpperCase() + label.slice(1),
    '<div>' + (rows || '<div style="color:var(--muted);padding:10px 0">Nenhuma OP neste dia.</div>') + '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
};

// ─── Modal: detalhe de uma OP ─────────────────────────────────────
window.agOpenOp = function (opId) {
  const d = gdb();
  const op = (d.ops || []).find(x => x.id === opId);
  if (!op) return;
  const st = _AG_STATUS[op.status || 'pendente'] || _AG_STATUS.pendente;

  const itensList = (op.items || []).map(it => {
    const p = d.products.find(x => x.id === it.pid);
    return '<tr>' +
      '<td style="font-size:12px">' + esc((p && p.name) || it.productName || '—') + '</td>' +
      '<td style="font-size:12px;text-align:center">' + fnum(it.qty) + ' ' + esc(it.unit || 'PC') + '</td>' +
      '<td><span style="font-size:10px;background:'+_agItemStatusColor(it.status)+';color:#fff;border-radius:3px;padding:1px 5px">' + esc(it.status || 'pendente') + '</span></td>' +
    '</tr>';
  }).join('');

  Mopen(
    'OP #' + esc(op.opNum),
    '<div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
    '<span style="background:'+st.bg+';color:'+st.text+';border-radius:5px;padding:3px 10px;font-size:12px;font-weight:600">'+st.label+'</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
    _agField('Cliente', op.clientName || '—') +
    _agField('Entrega', fdate(op.deliveryDate) || '—') +
    _agField('Transportadora', op.transporter || '—') +
    _agField('NF', op.nfeNumber || '—') +
    '</div>' +
    (itensList
      ? '<div class="tw"><table><thead><tr><th>Item</th><th>Qtd</th><th>Status</th></tr></thead><tbody>' + itensList + '</tbody></table></div>'
      : '') +
    (op.obs ? '<div style="margin-top:10px;font-size:12px;color:var(--muted)">Obs: '+esc(op.obs)+'</div>' : '') +
    '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
};

function _agOpRow(d, op) {
  const st = _AG_STATUS[op.status || 'pendente'] || _AG_STATUS.pendente;
  return `<div onclick="agOpenOp('${esc(op.id)}')" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">` +
    `<div style="display:flex;align-items:center;gap:8px">` +
    `<span style="font-size:12px;font-weight:600">#${esc(op.opNum)}</span>` +
    `<span style="font-size:10px;background:${st.bg};color:${st.text};border-radius:3px;padding:1px 6px">${st.label}</span>` +
    `</div>` +
    `<div style="font-size:12px;color:var(--muted)">${esc(op.clientName||'—')} · ${(op.items||[]).length} iten(s)</div>` +
    `</div>`;
}

function _agField(label, val) {
  return '<div style="background:var(--bg);border-radius:6px;padding:8px 10px">' +
    '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' + label + '</div>' +
    '<div style="font-size:13px;font-weight:600;margin-top:2px">' + esc(val) + '</div>' +
    '</div>';
}

function _agItemStatusColor(s) {
  return { pendente: '#6b7280', em_producao: '#3b82f6', liberado: '#8b5cf6', finalizado: '#10b981' }[s] || '#6b7280';
}
