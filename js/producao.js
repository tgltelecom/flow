// ═══════════════════════════════════════════════════════════════════════════
// producao.js — Produção por setor + Separação de Estoque
// v2.0 TGL Flow
// ═══════════════════════════════════════════════════════════════════════════

const STOPS=[
  {v:'pendente',l:'⏳ Pendente'},
  {v:'materia_falta',l:'🚫 Mat.-prima em falta'},
  {v:'aguardando_mp',l:'⏸️ Aguardando MP'},
  {v:'em_producao',l:'🔄 Em produção'},
  {v:'revisao_qualidade',l:'🔍 Revisão de qualidade'},
  {v:'liberado',l:'✅ Liberado'},
];
const STOPS_PREFORMADOS=[
  {v:'pendente',l:'⏳ Aguardando produção'},
  {v:'producao_iniciada',l:'🟢 Produção iniciada'},
  {v:'pref_formadeira',l:'🔧 Formadeira/Montadeira'},
  {v:'pref_coladeira',l:'🪄 Coladeira'},
  {v:'pref_pulverizadeira',l:'💨 Pulverizadeira'},
  {v:'pref_torcedeira',l:'🌀 Torcedeira'},
  {v:'pref_dobradeira',l:'📦 Dobradeira/Embalagem'},
  {v:'revisao_qualidade',l:'🔍 Teste de qualidade'},
  {v:'liberado',l:'✅ Liberado'},
  {v:'aguardando_mp',l:'⏸️ Aguardando MP'},
  {v:'materia_falta',l:'🚫 MP em falta'},
  {v:'pref_ficha_falta',l:'📄 Ficha de produção em falta'},
];
const STOPS_ESTAMPARIA=[
  {v:'pendente',l:'⏳ Pendente'},
  {v:'em_producao',l:'🔄 Em produção'},
  {v:'galvanizacao_externa',l:'⚗️ Em galvanização externo'},
  {v:'revisao_qualidade',l:'🔍 Revisão de qualidade'},
  {v:'liberado',l:'✅ Liberado'},
  {v:'materia_falta',l:'🚫 Mat.-prima em falta'},
  {v:'aguardando_mp',l:'⏸️ Aguardando MP'},
];
const SEP_STOPS=[
  {v:'pendente',l:'⏳ Pendente'},
  {v:'em_producao',l:'📤 Em separação'},
  {v:'liberado',l:'✅ Liberado'},
];

let _prodSort={},_prodSearch={};
function _setProdSort(sec,col){
  if(!_prodSort[sec])_prodSort[sec]={col:'deliveryDate',dir:1};
  if(_prodSort[sec].col===col)_prodSort[sec].dir*=-1;
  else{_prodSort[sec].col=col;_prodSort[sec].dir=1;}
  goProducao(sec);
}
function _sArr(col,s){return s.col===col?(s.dir===1?' ▲':' ▼'):'<span style="opacity:.3"> ⇅</span>';}
window._setProdSort=_setProdSort;

async function _tabletRefresh(){
  const btn=el('tablet-refresh-btn');
  if(btn){btn.disabled=true;btn.innerHTML='🔄 Atualizando...';}
  try{await _syncFromServer();}catch(e){console.warn('[TGL] tablet refresh:',e);}
  const onTab=document.querySelector('.stab.on[id^="pst-"]');
  const sec=onTab?onTab.id.replace('pst-',''):'preformados';
  goProducao(sec);
  if(btn){btn.disabled=false;btn.innerHTML='🔄 Atualizar';}
}
window._tabletRefresh=_tabletRefresh;

function rProducao(cnt){
  const roles=S?_roles(S):[];
  const sectors=['preformados','estamparia','espinar'];
  const canSee=s=>roles.some(r=>r==='admin'||r==='pcp'||r===s);
  const canSep=roles.some(r=>r==='admin'||r==='pcp'||r==='expedicao');
  const isExpOnly=roles.every(r=>r==='expedicao');
  const defaultSec=isExpOnly?'separacao':(sectors.find(s=>roles.includes(s))||'separacao');
  const isSingleSectorUser=roles.length===1&&sectors.includes(roles[0]);
  const secTabs=sectors.filter(canSee).map(s=>'<button class="stab '+(s===defaultSec?'on':'')+'" id="pst-'+s+'" onclick="goProducao(\''+s+'\')">'+{preformados:'🧬 Preformados',estamparia:'🔨 Estamparia',espinar:'🌀 Espinar/Fita'}[s]+'</button>').join('');
  const sepTab=canSep?'<button class="stab '+(defaultSec==='separacao'?'on':'')+'" id="pst-separacao" onclick="goProducao(\'separacao\')">🏷️ Itens de Revenda</button>':'';
  const refreshBtn=isSingleSectorUser?'<button id="tablet-refresh-btn" class="btn btn-green" onclick="_tabletRefresh()" style="font-size:15px;padding:10px 20px;border-radius:10px">🔄 Atualizar</button>':'';
  const _activePst=(document.querySelector('.stab.on[id^="pst-"]')||{}).id;
  const _curPst=_activePst?_activePst.replace('pst-',''):null;
  cnt.innerHTML='<div class="ptitle">Produção</div>'+
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'+
    '<div class="stabs" style="margin-bottom:0">'+secTabs+sepTab+'</div>'+
    '<div style="display:flex;gap:8px;align-items:center">'+refreshBtn+'</div></div>'+
    '<div id="prod-c"></div>';
  goProducao((_curPst&&el('pst-'+_curPst))?_curPst:defaultSec);
}

function goProducao(sec){
  document.querySelectorAll('.stab[id^="pst-"]').forEach(b=>b.classList.toggle('on',b.id==='pst-'+sec));
  if(sec==='separacao'){renderSeparacao();return;}
  const d=gdb();
  const labels={preformados:'🧵 Preformados',estamparia:'🔩 Estamparia (Ferragens)',espinar:'🔌 Espinar/Fita'};
  if(!_prodSort[sec])_prodSort[sec]={col:'deliveryDate',dir:1};
  const _ps=_prodSort[sec];
  const q=(_prodSearch[sec]||'').toLowerCase().trim();
  const allOps=d.ops.filter(o=>!o.archived&&o.status==='ativo').filter(op=>
    op.items.some(i=>{const p=d.products.find(x=>x.id===i.pid);return p&&!p.isStock&&(p.sectors||[]).includes(sec);})
  );
  const opsMeta=allOps.map(op=>{
    const secItems=op.items.filter(i=>{const p=d.products.find(x=>x.id===i.pid);return p&&!p.isStock&&(p.sectors||[]).includes(sec);});
    const lib=secItems.filter(i=>i.status==='liberado'&&(!i.qtyReleased||i.qtyReleased>=i.qty)).length;
    const libParcial=secItems.filter(i=>i.status==='liberado'&&i.qtyReleased&&i.qtyReleased<i.qty).length;
    const tot=secItems.length;
    const pct=tot?Math.round(lib/tot*100):0;
    return{op,secItems,lib,libParcial,tot,pct};
  }).filter(({op})=>!q||(op.opNum||'').toLowerCase().includes(q)||(op.clientName||'').toLowerCase().includes(q))
  .sort((a,b)=>{
    const col=_ps.col,dir=_ps.dir;
    if(col==='opNum')return dir*(a.op.opNum||'').localeCompare(b.op.opNum||'');
    if(col==='clientName')return dir*(a.op.clientName||'').localeCompare(b.op.clientName||'');
    if(col==='items')return dir*(a.tot-b.tot);
    if(col==='pct')return dir*(a.pct-b.pct);
    return dir*(new Date(a.op.deliveryDate)-new Date(b.op.deliveryDate));
  });

  const ec=el('prod-c');
  const _sort=_prodSort[sec]||{col:'deliveryDate',dir:1};
  ec.innerHTML='<div class="card"><div class="card-header">'+
    '<div><div class="card-title">'+labels[sec]+'</div><div class="card-sub">'+opsMeta.length+' ordem(ns)</div></div>'+
    '<input type="text" class="sinput" placeholder="🔍 Buscar pedido ou cliente..." value="'+esc(q)+'" oninput="_prodSearch[\''+sec+'\']=this.value;goProducao(\''+sec+'\')" style="width:220px;padding:6px 10px;font-size:13px">'+
    '</div>'+
    (opsMeta.length
      ?'<div class="tw"><table><thead><tr>'+
        '<th style="width:42px"></th>'+
        '<th style="cursor:pointer" onclick="_setProdSort(\''+sec+'\',\'opNum\')">Pedido '+_sArr('opNum',_sort)+'</th>'+
        '<th style="cursor:pointer" onclick="_setProdSort(\''+sec+'\',\'clientName\')">Cliente '+_sArr('clientName',_sort)+'</th>'+
        '<th style="cursor:pointer" onclick="_setProdSort(\''+sec+'\',\'deliveryDate\')">Prazo '+_sArr('deliveryDate',_sort)+'</th>'+
        '<th style="cursor:pointer" onclick="_setProdSort(\''+sec+'\',\'items\')">Itens '+_sArr('items',_sort)+'</th>'+
        '<th style="cursor:pointer" onclick="_setProdSort(\''+sec+'\',\'pct\')">Progresso '+_sArr('pct',_sort)+'</th>'+
        '</tr></thead><tbody id="prod-tb-'+sec+'"></tbody></table></div>'
      :'<div class="empty"><div class="ei">✅</div><p>'+(q?'Nenhuma OP encontrada para "'+esc(q)+'"':'Nenhuma OP pendente para este setor')+'</p></div>')+'</div>';

  if(!opsMeta.length)return;
  const tb=el('prod-tb-'+sec);
  let html='';
  opsMeta.forEach(({op,secItems,lib,libParcial,tot,pct})=>{
    const expandId='px-'+op.id+'-'+sec;
    html+=
      '<tr>'+
      '<td><button class="xbtn" id="xb-'+op.id+'-'+sec+'" onclick="togExpand(\''+expandId+'\',\'xb-'+op.id+'-'+sec+'\')">▶</button></td>'+
      '<td><strong>#'+esc(op.opNum)+'</strong></td>'+
      '<td>'+esc(op.clientName)+'</td>'+
      '<td>'+fdate(op.deliveryDate)+' '+diasChip(op.deliveryDate,op.status)+'</td>'+
      '<td style="color:var(--muted);font-size:13px">'+fnum(tot)+' item(s)</td>'+
      '<td>'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:4px">'+fnum(lib)+'/'+fnum(tot)+' lib'+(libParcial?' &bull; <span style="color:var(--warn)">'+libParcial+' parcial</span>':'')+'</div>'+
        '<div class="pbar-wrap" style="width:120px"><div class="pbar" style="width:'+pct+'%"></div></div>'+
      '</td>'+
      '</tr>'+
      '<tr class="tr-expand" id="'+expandId+'" style="display:none">'+
      '<td colspan="6"><div class="expand-inner">'+
        '<table style="width:100%"><thead><tr>'+
        '<th style="padding:8px 10px;font-size:11px;text-align:left;color:var(--muted)">Produto</th>'+
        '<th>SKU</th><th>Qtd</th><th>Personalização</th><th>Obs</th><th style="min-width:220px">Status</th>'+
        '</tr></thead><tbody>'+
        secItems.map(item=>{
          const p=d.products.find(x=>x.id===item.pid);
          const globalIdx=op.items.indexOf(item);
          const fl=[item.etiqueta?'🏷️ Etiqueta c/ logo':'',item.caixa?'📦 Caixa':'',item.gravacao?'✏️ Gravação':''].filter(Boolean).join(' ');
          const stopsForSec=sec==='preformados'?STOPS_PREFORMADOS:sec==='estamparia'?STOPS_ESTAMPARIA:STOPS;
          const opts=stopsForSec.map(s=>'<option value="'+s.v+'" '+(item.status===s.v?'selected':'')+'>'+s.l+'</option>').join('');
          const qRel=item.qtyReleased||0;
          const isPartialRel=item.status==='liberado'&&qRel>0&&qRel<item.qty;
          const qRestante=item.qty-qRel;
          const qtyLabel=qRel>0&&qRel<item.qty
            ?fnum(item.qty)+' <span style="font-size:11px;color:var(--warn)">● '+fnum(qRel)+' lib. / '+fnum(qRestante)+' rest.</span>'
            :fnum(item.qty);
          const rowBg=isPartialRel?'background:rgba(234,179,8,.07);':'';
          const canLibParcial=(item.status!=='liberado')||(qRel>0&&qRestante>0);
          // ── Alerta de estoque de preformados ──
          const itemName=p?p.name:item.productName;
          const isPrefItem=sec==='preformados'&&itemName&&itemName.includes('PRF');
          const prfAlert=isPrefItem?_prfStockAlert(d,itemName,item.qty):'';
          return'<tr style="border-bottom:1px solid rgba(255,255,255,.04);'+rowBg+'">'+
            '<td style="padding:10px">'+esc(itemName)+(prfAlert?'<div style="margin-top:6px">'+prfAlert+'</div>':'')+'</td>'+
            '<td style="padding:10px"><span class="sku">'+esc(item.sku||'—')+'</span></td>'+
            '<td style="padding:10px">'+qtyLabel+'</td>'+
            '<td style="padding:10px;font-size:12px;color:var(--sub)">'+(fl||'—')+'</td>'+
            '<td style="padding:10px;font-size:12px;color:var(--sub)">'+esc(item.obs||'—')+'</td>'+
            '<td style="padding:10px">'+
              '<select class="rt-input" onchange="updSt(\''+op.id+'\','+globalIdx+',this.value,\''+sec+'\')">'+opts+'</select>'+
              (canLibParcial&&qRestante>0?'<button class="btn btn-outline btn-sm" style="margin-top:6px;font-size:11px;display:block;width:100%" onclick="liberarParcial(\''+op.id+'\','+globalIdx+',\''+sec+'\')">📦 Liberar Parcial</button>':'')+
            '</td></tr>';
        }).join('')+
        '</tbody></table>'+
        (op.obs?'<div style="margin-top:10px;font-size:13px;color:var(--muted)"><strong>Obs geral:</strong> '+esc(op.obs)+'</div>':'')+
      '</div></td></tr>';
  });
  tb.innerHTML=html;
}
window.goProducao=goProducao;window.rProducao=rProducao;

function togExpand(rowId,btnId){
  const row=el(rowId),btn=el(btnId);if(!row)return;
  const open=row.style.display!=='none';
  row.style.display=open?'none':'table-row';
  if(btn)btn.classList.toggle('open',!open);
}
window.togExpand=togExpand;

function liberarParcial(opId,idx,sec){
  const d=gdb(),op=d.ops.find(o=>o.id===opId);if(!op)return;
  const item=op.items[idx];const p=d.products.find(x=>x.id===item.pid);
  Mopen('📦 Liberar Parcialmente',
    '<div style="font-size:13px;margin-bottom:10px">Produto: <strong>'+esc(p?p.name:item.productName)+'</strong></div>'+
    '<div style="font-size:13px;margin-bottom:14px;color:var(--muted)">Qtd pedida: <strong>'+fnum(item.qty)+'</strong> '+esc(item.unit||'PC')+(item.qtyReleased?'  ·  Já liberado: <strong style="color:var(--warn)">'+fnum(item.qtyReleased)+'</strong>':'')+'</div>'+
    '<div class="fg"><label>Quantidade a liberar agora *</label><input type="number" id="lp-qty" class="sinput" min="1" max="'+item.qty+'" value="'+item.qty+'"></div>'+
    '<div class="alert alert-warn" style="margin-top:12px;font-size:12px">O item ficará marcado como <strong>Liberado</strong> com a quantidade informada.</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="confirmLiberarParcial(\''+opId+'\','+idx+',\''+sec+'\')">✅ Liberar</button>'
  );
}
function confirmLiberarParcial(opId,idx,sec){
  const qty=parseInt((el('lp-qty')||{}).value)||0;
  if(qty<=0){toast('Informe uma quantidade válida','err');return;}
  Mclose();
  const d=gdb();const oi=d.ops.findIndex(o=>o.id===opId);if(oi<0)return;
  const item=d.ops[oi].items[idx];
  item.qtyReleased=qty;item.status='liberado';item.statusAt=Date.now();
  if(!item.stageLog)item.stageLog=[];
  item.stageLog.push({status:'liberado',at:Date.now(),qty});
  const p2=d.products.find(x=>x.id===item.pid);
  logAction(d,'Liberação parcial','OP #'+d.ops[oi].opNum+' — '+(p2?p2.name:item.productName)+': '+qty+'/'+item.qty+' un.');
  sdb(d);toast('Liberado '+qty+' un.','ok');
  goProducao(sec);
  setTimeout(()=>{
    const row=el('px-'+opId+'-'+sec);if(row)row.style.display='table-row';
    const btn=el('xb-'+opId+'-'+sec);if(btn)btn.classList.add('open');
  },80);
}
window.liberarParcial=liberarParcial;window.confirmLiberarParcial=confirmLiberarParcial;

function updSt(opId,idx,status,sec){
  const d=gdb();const oi=d.ops.findIndex(o=>o.id===opId);if(oi<0)return;
  d.ops[oi].items[idx].status=status;d.ops[oi].items[idx].statusAt=Date.now();
  if(!d.ops[oi].items[idx].stageLog)d.ops[oi].items[idx].stageLog=[];
  d.ops[oi].items[idx].stageLog.push({status,at:Date.now()});
  const _op=d.ops[oi];const _it=_op.items[idx];const _pr=d.products.find(x=>x.id===_it.pid);
  logAction(d,'Status alterado','OP #'+_op.opNum+' — '+(_pr?_pr.name:_it.productName)+': '+stlabel(status));
  sdb(d);toast('Status atualizado','ok',1500);
  goProducao(sec);
  setTimeout(()=>{
    const row=el('px-'+opId+'-'+sec);if(row)row.style.display='table-row';
    const btn=el('xb-'+opId+'-'+sec);if(btn)btn.classList.add('open');
  },80);
}
window.updSt=updSt;

// ─── SEPARAÇÃO DE ESTOQUE ───
function renderSeparacao(){
  const d=gdb();
  const ops=d.ops.filter(o=>!o.archived&&o.status==='ativo').filter(op=>
    op.items.some(i=>{const p=d.products.find(x=>x.id===i.pid);return p&&p.isStock;})
  ).sort((a,b)=>new Date(a.deliveryDate)-new Date(b.deliveryDate));
  const ec=el('prod-c');
  ec.innerHTML='<div class="card">'+
    '<div class="card-header">'+
    '<div><div class="card-title">Produção / Separação de Estoque</div>'+
    '<div class="card-sub">Confira e libere os itens de estoque de cada OP</div></div>'+
    '<div style="font-size:12px;color:var(--muted)">'+ops.length+' OP(s) com itens de estoque</div>'+
    '</div>'+
    (ops.length
      ?'<div class="tw"><table><thead><tr><th style="width:42px"></th><th>Pedido</th><th>Cliente</th><th>Prazo</th><th>Itens Estoque</th><th>Progresso</th></tr></thead><tbody id="sep-tb"></tbody></table></div>'
      :'<div class="empty"><div class="ei">✅</div><p>Nenhuma OP com itens de estoque pendentes</p></div>')+
    '</div>';
  if(!ops.length)return;
  const tb=el('sep-tb');let html='';
  ops.forEach(op=>{
    const stItems=op.items.filter(i=>{const p=d.products.find(x=>x.id===i.pid);return p&&p.isStock;});
    const lib=stItems.filter(i=>i.status==='liberado').length;
    const tot=stItems.length;const pct=tot?Math.round(lib/tot*100):0;
    const expandId='sep-x-'+op.id;
    html+=
      '<tr>'+
      '<td><button class="xbtn" id="xbsep-'+op.id+'" onclick="togExpand(\''+expandId+'\',\'xbsep-'+op.id+'\')">▶</button></td>'+
      '<td><strong>#'+esc(op.opNum)+'</strong></td>'+
      '<td>'+esc(op.clientName)+'</td>'+
      '<td>'+fdate(op.deliveryDate)+' '+diasChip(op.deliveryDate,op.status)+'</td>'+
      '<td style="color:var(--muted);font-size:13px">'+fnum(tot)+' item(s)</td>'+
      '<td>'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:4px">'+fnum(lib)+'/'+fnum(tot)+' liberados</div>'+
        '<div class="pbar-wrap" style="width:120px"><div class="pbar" style="width:'+pct+'%"></div></div>'+
      '</td></tr>'+
      '<tr class="tr-expand" id="'+expandId+'" style="display:none"><td colspan="6"><div class="expand-inner">'+
        '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">'+
          '<button class="btn btn-green btn-sm" onclick="liberarTodosEstoque(\''+op.id+'\')">✅ Liberar todos</button></div>'+
        '<table style="width:100%"><thead><tr>'+
          '<th style="padding:8px 10px;font-size:11px;text-align:left;color:var(--muted)">Produto</th>'+
          '<th>SKU</th><th>Qtd Pedida</th><th>Obs</th><th style="min-width:180px">Status</th>'+
        '</tr></thead><tbody>'+
        stItems.map(item=>{
          const p=d.products.find(x=>x.id===item.pid);
          const globalIdx=op.items.indexOf(item);
          const opts=SEP_STOPS.map(s=>'<option value="'+s.v+'" '+(item.status===s.v?'selected':'')+'>'+s.l+'</option>').join('');
          const qRel=item.qtyReleased||0;const isPartialRel=item.status==='liberado'&&qRel>0&&qRel<item.qty;
          const qRestante=item.qty-qRel;const canLibParcial=(item.status!=='liberado')||(qRel>0&&qRestante>0);
          const qtyLabel=isPartialRel?fnum(item.qty)+' <span style="font-size:11px;color:var(--warn)">● '+fnum(qRel)+' lib. / '+fnum(qRestante)+' rest.</span>':fnum(item.qty);
          return'<tr style="border-bottom:1px solid rgba(255,255,255,.04)'+(isPartialRel?';background:rgba(234,179,8,.07)':'')+'">'
            +'<td style="padding:10px"><strong>'+esc(p?p.name:item.productName)+'</strong></td>'
            +'<td style="padding:10px"><span class="sku">'+esc(item.sku||'—')+'</span></td>'
            +'<td style="padding:10px">'+qtyLabel+'</td>'
            +'<td style="padding:10px;font-size:12px;color:var(--sub)">'+esc(item.obs||'—')+'</td>'
            +'<td style="padding:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
            +'<select class="rt-input" onchange="updStSep(\''+op.id+'\','+globalIdx+',this.value)">'+opts+'</select>'
            +(canLibParcial&&qRestante>0?'<button class="btn btn-warn btn-sm" style="font-size:11px;padding:3px 8px" onclick="liberarParcial(\''+op.id+'\','+globalIdx+',\'separacao\')">⚡ Liberar Parcial</button>':'')
            +'</td></tr>';
        }).join('')+
        '</tbody></table>'+(op.obs?'<div style="margin-top:10px;font-size:13px;color:var(--muted)"><strong>Obs geral:</strong> '+esc(op.obs)+'</div>':'')+
      '</div></td></tr>';
  });
  tb.innerHTML=html;
}
window.renderSeparacao=renderSeparacao;

function updStSep(opId,idx,status){
  const d=gdb();const oi=d.ops.findIndex(o=>o.id===opId);if(oi<0)return;
  d.ops[oi].items[idx].status=status;d.ops[oi].items[idx].statusAt=Date.now();
  if(!d.ops[oi].items[idx].stageLog)d.ops[oi].items[idx].stageLog=[];
  d.ops[oi].items[idx].stageLog.push({status,at:Date.now()});
  const _opp=d.ops[oi];const _itp=_opp.items[idx];const _prp=d.products.find(x=>x.id===_itp.pid);
  logAction(d,'Status separação','OP #'+_opp.opNum+' — '+(_prp?_prp.name:_itp.productName)+': '+stlabel(status));
  sdb(d);toast('Status atualizado','ok',1500);
  renderSeparacao();
  setTimeout(()=>{
    const row=el('sep-x-'+opId);if(row)row.style.display='table-row';
    const btn=el('xbsep-'+opId);if(btn)btn.classList.add('open');
  },80);
}
window.updStSep=updStSep;

function liberarTodosEstoque(opId){
  if(!confirm('Liberar todos os itens de estoque desta OP?'))return;
  const d=gdb();const oi=d.ops.findIndex(o=>o.id===opId);if(oi<0)return;
  const _nowTs=Date.now();
  d.ops[oi].items.forEach((item,idx)=>{
    const p=d.products.find(x=>x.id===item.pid);
    if(p&&p.isStock){
      d.ops[oi].items[idx].status='liberado';d.ops[oi].items[idx].statusAt=_nowTs;
      if(!d.ops[oi].items[idx].stageLog)d.ops[oi].items[idx].stageLog=[];
      d.ops[oi].items[idx].stageLog.push({status:'liberado',at:_nowTs});
    }
  });
  const _lop=d.ops[oi];logAction(d,'Separação liberada','OP #'+_lop.opNum+' — todos os itens de estoque');
  sdb(d);toast('Todos os itens de estoque liberados!','ok');renderSeparacao();
}
window.liberarTodosEstoque=liberarTodosEstoque;

// ═══════════════════════════════════════════════════════════════════════════
// ── ALERTA DE ESTOQUE DE PREFORMADOS ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Parseia o nome de um preformado em seus campos estruturados
function _parsePrfName(name){
  if(!name)return null;
  // Ex: "ALCA PRF AC CCE 10,00 - 10,80mm VERDE 3V 480mm"
  const m=name.match(/^(\w+)\s+PRF\s+(AC CCE|AL CABO OPTICO)\s+([\d,\.]+)\s*-\s*([\d,\.]+)mm\s+(\S+)\s+(\d+)V\s+(\d+)mm/i);
  if(!m)return null;
  return{
    tipo:m[1].toUpperCase(),material:m[2].toUpperCase(),
    rangeMin:parseFloat(m[3].replace(',','.')),rangeMax:parseFloat(m[4].replace(',','.')),
    cor:m[5].toUpperCase(),varetas:parseInt(m[6]),comprimento:parseInt(m[7])
  };
}

// Retorna sugestões de preformados compatíveis em estoque
function _prfSuggestions(d,pedido){
  const sugs=[];
  (d.preformados||[]).forEach(prf=>{
    const s=(d.preformadosStock||{})[prf.id];
    if(!s||!(s.qty>0))return;
    const materialOk=prf.material===pedido.material;
    if(!materialOk)return;
    const comprimentoOk=prf.comprimento>=pedido.comprimento;
    const rangeOk=prf.rangeMin<=pedido.rangeMin&&prf.rangeMax>=pedido.rangeMax;
    const varetasOk=prf.varetas>=pedido.varetas;
    const isExato=prf.comprimento===pedido.comprimento&&rangeOk&&prf.varetas===pedido.varetas;
    if(!comprimentoOk&&!rangeOk&&!varetasOk)return;
    let motivos=[];
    if(comprimentoOk&&prf.comprimento>pedido.comprimento)motivos.push('Comprimento maior ('+prf.comprimento+'mm ≥ '+pedido.comprimento+'mm)');
    if(rangeOk)motivos.push('Intervalo compatível ('+prf.rangeMin.toFixed(2)+'–'+prf.rangeMax.toFixed(2)+'mm)');
    if(varetasOk&&prf.varetas>pedido.varetas)motivos.push(prf.varetas+'V (maior que os '+pedido.varetas+'V pedidos)');
    sugs.push({prf,s,motivos,isExato,score:(isExato?100:0)+(comprimentoOk?3:0)+(rangeOk?2:0)+(varetasOk?1:0)});
  });
  return sugs.sort((a,b)=>b.score-a.score);
}

// Gera o HTML do alerta de preformados para a tela de produção
function _prfStockAlert(d,itemName,qtyPedida){
  const pedido=_parsePrfName(itemName);if(!pedido)return'';
  const stock=d.preformadosStock||{};
  // Estoque exato
  const exato=(d.preformados||[]).find(prf=>prf.name&&prf.name.toUpperCase()===itemName.toUpperCase());
  const exatoStock=exato?(stock[exato.id]||{qty:0}):{qty:0};
  // Sugestões
  const sugs=_prfSuggestions(d,pedido).filter(x=>!x.isExato);
  let html='';
  if(exato&&exatoStock.qty>0){
    const cor=exatoStock.qty>=qtyPedida?'var(--green)':'var(--warn)';
    html+='<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:4px">'+
      '⚠️ <strong style="color:'+cor+'">Estoque disponível: '+fnum(exatoStock.qty)+' un.</strong>'+
      (exatoStock.local?' · '+esc(exatoStock.local)+(exatoStock.prateleira?' / '+esc(exatoStock.prateleira):''):'')+'<br>'+
      '<button class="btn btn-green btn-sm" style="margin-top:5px;font-size:11px" onclick="usarEstoquePref(\''+exato.id+'\','+qtyPedida+')">Usar do estoque</button>'+
      ' <button class="btn btn-ghost btn-sm" style="font-size:11px">Produzir quantidade total</button>'+
    '</div>';
  }
  sugs.slice(0,3).forEach(({prf,s,motivos})=>{
    html+='<div style="background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:6px;padding:7px 10px;font-size:12px;margin-top:4px">'+
      '💡 <strong>Sugestão:</strong> '+esc(prf.name)+' — <span style="color:var(--green)">'+fnum(s.qty)+' un.</span>'+(s.local?' · '+esc(s.local):'')+'<br>'+
      '<span style="font-size:11px;color:var(--muted)">'+motivos.join(' · ')+'</span>'+
    '</div>';
  });
  return html;
}

// Registra saída do estoque de preformados ao usar do estoque
function usarEstoquePref(prefId,qtyNecessaria){
  const d=gdb();const s=(d.preformadosStock||{})[prefId]||{qty:0};
  const prf=(d.preformados||[]).find(x=>x.id===prefId);
  const usarQty=Math.min(qtyNecessaria,s.qty);
  if(!confirm('Usar '+usarQty+' un. do estoque de '+(prf?prf.name:prefId)+'?'))return;
  if(!d.preformadosStock)d.preformadosStock={};
  d.preformadosStock[prefId]={...s,qty:s.qty-usarQty,updatedAt:Date.now()};
  logAction(d,'Saída Preformado',(prf?prf.name:prefId)+' -'+usarQty+' un. (usado na produção)');
  sdb(d);toast('Saída registrada: -'+usarQty+' un.','ok');rProducao(el('main-content'));
}
window.usarEstoquePref=usarEstoquePref;
