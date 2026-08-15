// ═══════════════════════════════════════════════════════════════════════════
// suprimentos.js — Estoque de MP, Embalagens e Produtos de Revenda
// v2.0 TGL Flow
// ═══════════════════════════════════════════════════════════════════════════

// ─── Helpers estoque MP ───
function _rmStockTotal(d,mid){const s=d.rawMaterialStock[mid];if(!s)return 0;return s.total||0;}
function _rmStockBySupp(d,mid,sid){const s=d.rawMaterialStock[mid];if(!s)return 0;return(s.bySupplier||{})[sid]||0;}
function _updateRMStock(d,mid,sid,delta){
  if(!d.rawMaterialStock[mid])d.rawMaterialStock[mid]={total:0,bySupplier:{}};
  const s=d.rawMaterialStock[mid];
  s.bySupplier[sid]=(s.bySupplier[sid]||0)+delta;
  if(s.bySupplier[sid]<0)s.bySupplier[sid]=0;
  s.total=Object.values(s.bySupplier).reduce((a,b)=>a+b,0);
  s.at=Date.now();
}
function _setRMStock(d,mid,sid,qty){
  if(!d.rawMaterialStock[mid])d.rawMaterialStock[mid]={total:0,bySupplier:{}};
  const s=d.rawMaterialStock[mid];
  s.bySupplier[sid]=Math.max(0,qty);
  s.total=Object.values(s.bySupplier).reduce((a,b)=>a+b,0);
  s.at=Date.now();
}
function _updatePackStock(d,pid,delta){
  d.packagingStock[pid]=(d.packagingStock[pid]||0)+delta;
  if(d.packagingStock[pid]<0)d.packagingStock[pid]=0;
  if(!d.packagingStockAt)d.packagingStockAt={};
  d.packagingStockAt[pid]=Date.now();
}
function _setPackStock(d,pid,qty){
  d.packagingStock[pid]=Math.max(0,qty);
  if(!d.packagingStockAt)d.packagingStockAt={};
  d.packagingStockAt[pid]=Date.now();
}
function _rmHasMovements(d,mid){return(d.rawMaterialMovements||[]).some(m=>m.itemId===mid);}
function _packHasMovements(d,pid){return(d.packagingMovements||[]).some(m=>m.itemId===pid);}
function _rmName(d,mid){const m=d.rawMaterials.find(x=>x.id===mid);return m?m.name:mid;}
function _nid(){return'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

// ─── RPCs atômicas ───
async function _rpcPKAdjust(pid,delta){
  const at=Date.now();
  const r=await _sf('/rest/v1/rpc/adjust_pk_stock',{method:'POST',body:JSON.stringify({p_id:'PK:'+pid,p_delta:delta,p_at:at})});
  if(!r.ok)throw new Error((await r.text())||'Erro ao salvar estoque de embalagem');
  const nd=await r.json();
  const d=gdb();d.packagingStock[pid]=nd.qty;
  if(!d.packagingStockAt)d.packagingStockAt={};
  d.packagingStockAt[pid]=nd.at;_pkServerAt[pid]=nd.at;
  _lastSavedStockStr['PK:'+pid]=JSON.stringify({qty:nd.qty});
}
async function _rpcPKSet(pid,qty){
  const at=Date.now();
  const r=await _sf('/rest/v1/rpc/set_pk_stock',{method:'POST',body:JSON.stringify({p_id:'PK:'+pid,p_qty:qty,p_at:at})});
  if(!r.ok)throw new Error((await r.text())||'Erro ao salvar inventário de embalagem');
  const nd=await r.json();
  const d=gdb();d.packagingStock[pid]=nd.qty;
  if(!d.packagingStockAt)d.packagingStockAt={};
  d.packagingStockAt[pid]=nd.at;_pkServerAt[pid]=nd.at;
  _lastSavedStockStr['PK:'+pid]=JSON.stringify({qty:nd.qty});
}
async function _rpcRMAdjust(mid,sid,delta){
  const at=Date.now();
  const r=await _sf('/rest/v1/rpc/adjust_rm_stock',{method:'POST',body:JSON.stringify({p_id:'RM:'+mid,p_supplier_id:sid,p_delta:delta,p_at:at})});
  if(!r.ok)throw new Error((await r.text())||'Erro ao salvar estoque de matéria-prima');
  const nd=await r.json();
  const d=gdb();d.rawMaterialStock[mid]=nd;
  _lastSavedStockStr['RM:'+mid]=JSON.stringify(nd);
}
async function _rpcRMSet(mid,sid,qty){
  const at=Date.now();
  const r=await _sf('/rest/v1/rpc/set_rm_stock',{method:'POST',body:JSON.stringify({p_id:'RM:'+mid,p_supplier_id:sid,p_qty:qty,p_at:at})});
  if(!r.ok)throw new Error((await r.text())||'Erro ao salvar inventário de matéria-prima');
  const nd=await r.json();
  const d=gdb();d.rawMaterialStock[mid]=nd;
  _lastSavedStockStr['RM:'+mid]=JSON.stringify(nd);
}

// ─── Status semáforo ───
function _rmStatus(d,mid){
  const item=d.rawMaterials.find(x=>x.id===mid);if(!item)return'sem_lancamento';
  if(!_rmHasMovements(d,mid))return'sem_lancamento';
  const qty=_rmStockTotal(d,mid);
  const min=item.minStock||0;
  if(qty===0)return'zero';
  if(min>0&&qty<min)return'abaixo';
  if(min>0&&qty<=min*1.2)return'proximo';
  return'ok';
}
function _packStatus(d,pid){
  const item=d.packaging.find(x=>x.id===pid);if(!item)return'sem_lancamento';
  if(!_packHasMovements(d,pid))return'sem_lancamento';
  const qty=d.packagingStock[pid]||0;
  const min=item.minStock||0;
  if(qty===0)return'zero';
  if(min>0&&qty<min)return'abaixo';
  if(min>0&&qty<=min*1.2)return'proximo';
  return'ok';
}
function _stockBadge(status){
  if(status==='sem_lancamento')return'<span class="bs" style="background:rgba(100,116,139,.1);color:var(--muted);font-size:11px">Sem lançamento</span>';
  if(status==='zero')return'<span class="bs" style="background:rgba(239,68,68,.15);color:var(--danger);border:1px solid rgba(239,68,68,.3);font-size:11px">🔴 Zerado</span>';
  if(status==='abaixo')return'<span class="bs" style="background:rgba(245,158,11,.15);color:var(--warn);border:1px solid rgba(245,158,11,.3);font-size:11px">⚠️ Abaixo do mínimo</span>';
  if(status==='proximo')return'<span class="bs" style="background:rgba(245,158,11,.08);color:var(--warn);font-size:11px">⚡ Próximo do mínimo</span>';
  return'<span class="bs" style="background:rgba(34,197,94,.1);color:var(--green);font-size:11px">✅ Ok</span>';
}

// ─── Helpers fornecedor autocomplete ───
function _suppDl(d){
  return'<datalist id="mv-supp-dl">'+d.suppliers.map(s=>'<option value="'+esc(s.name)+'">').join('')+'</datalist>';
}
function _suppAutoHtml(label){
  return'<div class="fg"><label>'+label+'</label>'+
    '<input type="text" id="mv-supp-txt" list="mv-supp-dl" autocomplete="off" placeholder="Digite para buscar..." oninput="_resolveSuppInput()">'+
    '<input type="hidden" id="mv-supp">'+
    '</div>';
}
function _resolveSuppInput(){
  const txt=el('mv-supp-txt'),hid=el('mv-supp');if(!txt||!hid)return;
  const q=txt.value.trim().toLowerCase();
  const s=gdb().suppliers.find(x=>x.name.toLowerCase()===q);
  hid.value=s?s.id:'';
}
function _getSuppId(required){
  _resolveSuppInput();
  const sid=v('mv-supp');
  if(required&&!sid){toast('Fornecedor não encontrado. Selecione um fornecedor cadastrado.','err');return null;}
  return sid||null;
}
window._resolveSuppInput=_resolveSuppInput;

// ─── Helpers setor/tipo ───
const _SETORES=[{v:'preformados',l:'🧵 Preformados'},{v:'estamparia',l:'🔩 Estamparia'},{v:'espinar',l:'🔌 Espinar/Fita'},{v:'expedicao',l:'🚚 Expedição'},{v:'outros',l:'🔖 Outros'}];
function _setorLabel(setor,setorCustom){if(!setor)return'—';const s=_SETORES.find(x=>x.v===setor);return s?(setor==='outros'&&setorCustom?setorCustom:s.l.split(' ').slice(1).join(' ')):setor;}
function _setorBadge(setor,setorCustom){
  if(!setor)return'<span style="color:var(--muted)">—</span>';
  const cls={preformados:'bs-setor-pref',estamparia:'bs-setor-est',espinar:'bs-setor-esp',expedicao:'bs-setor-exp'}[setor]||'bs-setor-out';
  return'<span class="bs '+cls+'" style="font-size:11px">'+esc(_setorLabel(setor,setorCustom))+'</span>';
}
function _setorOpts(sel){return _SETORES.map(s=>'<option value="'+s.v+'"'+(sel===s.v?' selected':'')+'>'+s.l+'</option>').join('');}
function _setorCustomField(prefixId,sel){return'<div class="fg" id="fg-setor-custom-'+prefixId+'" style="display:'+(sel==='outros'?'block':'none')+'"><label>Especifique o setor *</label><input type="text" id="'+prefixId+'-setor-custom" placeholder="Nome do setor"></div>';}
function _toggleSetorCustom(prefix){
  const sel=el(prefix+'-setor');const fg=el('fg-setor-custom-'+prefix);
  if(fg)fg.style.display=sel&&sel.value==='outros'?'block':'none';
}
window._toggleSetorCustom=_toggleSetorCustom;

// ═══════════════════════════════════════════════════════════════════════════
// ── TELA PRINCIPAL: rSuprimentos ──
// ═══════════════════════════════════════════════════════════════════════════
function rSuprimentos(cnt){
  const roles=S?_roles(S):[];
  const isCmp=roles.includes('comprador');
  const _activeSst=(document.querySelector('.stab.on[id^="sst-"]')||{}).id;
  const _curSst=_activeSst?_activeSst.replace('sst-',''):null;
  const tabs=isCmp
    ?'<button class="stab on" id="sst-mp" onclick="sstab(\'mp\')">🌿 Matéria Prima</button><button class="stab" id="sst-emb" onclick="sstab(\'emb\')">📦 Embalagens</button><button class="stab" id="sst-est" onclick="sstab(\'est\')">🏷️ Estoque Produtos</button><button class="stab" id="sst-pref" onclick="sstab(\'pref\')">🧵 Preformados</button>'
    :'<button class="stab on" id="sst-est" onclick="sstab(\'est\')">🏷️ Estoque</button><button class="stab" id="sst-mp" onclick="sstab(\'mp\')">🌿 Matéria Prima</button><button class="stab" id="sst-emb" onclick="sstab(\'emb\')">📦 Embalagens</button><button class="stab" id="sst-pref" onclick="sstab(\'pref\')">🧵 Preformados</button><button class="stab" id="sst-req" onclick="sstab(\'req\')">📝 Requisições</button><button class="stab" id="sst-nf" onclick="sstab(\'nf\')">🧾 Entradas NF</button>';
  cnt.innerHTML='<div class="ptitle">📦 Suprimentos</div><div class="stabs">'+tabs+'</div><div id="sup-tabs-c"></div>';
  const def=isCmp?'mp':'est';
  sstab((_curSst&&el('sst-'+_curSst))?_curSst:def);
}
function sstab(t){
  document.querySelectorAll('.stab[id^="sst-"]').forEach(b=>b.classList.remove('on'));
  if(el('sst-'+t))el('sst-'+t).classList.add('on');
  const c=el('sup-tabs-c');c.innerHTML='<div id="sup-c"></div>';
  if(t==='est')renderEstoque();
  else if(t==='mp')renderSupMP();
  else if(t==='emb')renderSupEmb();
  else if(t==='pref')renderSupPref();
  else if(t==='req')renderRequisicoes();
  else if(t==='nf')renderEntradasNF();
}
window.sstab=sstab;

// ═══════════════════════════════════════════════════════════════════════════
// ── ESTOQUE DE PRODUTOS DE REVENDA ──
// ═══════════════════════════════════════════════════════════════════════════
let _supSort={col:'name',dir:1},_supFilter='';
function setSupFilter(f){_supFilter=f;renderEstoque();}
function setSupSort(col){if(_supSort.col===col)_supSort.dir*=-1;else{_supSort.col=col;_supSort.dir=1;}renderEstoque();}
function supArrow(col){return _supSort.col===col?(_supSort.dir===1?' ▲':' ▼'):'<span style="opacity:.3"> ⇅</span>';}
let _opTipData={};

function renderEstoque(){
  const d=gdb(),el2=el('sup-c');
  if(!el2)return;
  const demands={};
  _opTipData={};
  d.ops.filter(o=>o.status==='ativo'&&!o.archived).forEach(op=>{
    op.items.forEach(i=>{
      const iqty=Math.round(_itemQtyLeft(i)||0);
      if(iqty<=0)return;
      demands[i.pid]=(demands[i.pid]||0)+iqty;
      if(!_opTipData[i.pid])_opTipData[i.pid]=[];
      _opTipData[i.pid].push({num:op.opNum||op.id,client:(op.clientName||'—'),qty:iqty});
    });
  });
  const qSaved=(el('srch-est')?el('srch-est').value:'');
  el2.innerHTML='<div class="card">'+
    '<div class="card-header"><div class="card-title">Controle de Estoque</div>'+
    '<button class="btn btn-green btn-sm" onclick="openLancamento()">➕ Lançamento</button></div>'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'+
    '<input class="sinput" id="srch-est" placeholder="🔍 Buscar produto..." oninput="renderEstoque()" value="'+esc(qSaved)+'" style="flex:1;min-width:200px">'+
    '<div style="display:flex;gap:4px;flex-wrap:wrap">'+
    '<button class="btn btn-sm '+(_supFilter===''?'btn-outline':'btn-ghost')+'" onclick="setSupFilter(\'\')">Todos</button>'+
    '<button class="btn btn-sm '+(_supFilter==='g'?'btn-outline':'btn-ghost')+'" onclick="setSupFilter(\'g\')">✅ Atende</button>'+
    '<button class="btn btn-sm '+(_supFilter==='r'?'btn-outline':'btn-ghost')+'" style="color:var(--danger)" onclick="setSupFilter(\'r\')">⚠️ Insuficiente</button>'+
    '<button class="btn btn-sm '+(_supFilter==='y'?'btn-outline':'btn-ghost')+'" style="color:var(--muted)" onclick="setSupFilter(\'y\')">— Sem lançamento</button>'+
    '</div></div>'+
    '<div class="tw" id="est-tbl"></div></div>';
  const q=(el('srch-est')?el('srch-est').value.toLowerCase():'');
  let prods=d.products.filter(p=>{
    if(!p.isStock)return false;
    if(q&&!p.name.toLowerCase().includes(q)&&!(p.sku||'').toLowerCase().includes(q))return false;
    if(_supFilter){
      const st2=d.stock[p.id];const qty2=st2?st2.qty:null;const av=qty2!==null?qty2-(demands[p.id]||0):null;
      if(_supFilter==='g'&&!(qty2!==null&&av>=0))return false;
      if(_supFilter==='r'&&!(qty2!==null&&av<0))return false;
      if(_supFilter==='y'&&qty2!==null)return false;
    }
    return true;
  });
  prods.sort((a,b)=>{
    const st2=d.stock;let va,vb;
    if(_supSort.col==='name'){va=a.name.toLowerCase();vb=b.name.toLowerCase();}
    else if(_supSort.col==='sku'){va=(a.sku||'').toLowerCase();vb=(b.sku||'').toLowerCase();}
    else if(_supSort.col==='qty'){va=st2[a.id]?st2[a.id].qty:-1;vb=st2[b.id]?st2[b.id].qty:-1;}
    else if(_supSort.col==='dem'){va=demands[a.id]||0;vb=demands[b.id]||0;}
    else if(_supSort.col==='avail'){
      const qa=st2[a.id]?st2[a.id].qty:null,qb=st2[b.id]?st2[b.id].qty:null;
      va=qa!==null?qa-(demands[a.id]||0):-999;vb=qb!==null?qb-(demands[b.id]||0):-999;
    }else{va='';vb='';}
    return va<vb?-_supSort.dir:va>vb?_supSort.dir:0;
  });
  if(!prods.length){el('est-tbl').innerHTML='<div class="empty"><div class="ei">📦</div><p>Nenhum produto encontrado</p></div>';return;}
  el('est-tbl').innerHTML='<table><thead><tr>'+
    '<th style="cursor:pointer" onclick="setSupSort(\'name\')">Produto'+supArrow('name')+'</th>'+
    '<th style="cursor:pointer" onclick="setSupSort(\'sku\')">SKU'+supArrow('sku')+'</th>'+
    '<th style="cursor:pointer;text-align:center" onclick="setSupSort(\'qty\')">📦 Estoque'+supArrow('qty')+'</th>'+
    '<th style="cursor:pointer;text-align:center" onclick="setSupSort(\'dem\')">🔒 Reservado'+supArrow('dem')+'</th>'+
    '<th style="cursor:pointer;text-align:center" onclick="setSupSort(\'avail\')">✅ Livre'+supArrow('avail')+'</th>'+
    '<th>Status</th><th></th></tr></thead><tbody>'+
    prods.map(p=>{
      const st3=d.stock[p.id];const qty=st3?st3.qty:null;
      const dem=demands[p.id]||0;const avail=qty!==null?qty-dem:null;
      let semCls,semLabel;
      if(qty===null){semCls='sem sem-y';semLabel='Sem lançamento';}
      else if(avail>=0){semCls='sem sem-g';semLabel='Atende';}
      else{semCls='sem sem-r';semLabel='Insuficiente';}
      return'<tr><td><strong>'+esc(p.name)+'</strong></td>'+
        '<td><span class="sku">'+esc(p.sku||'—')+'</span></td>'+
        '<td style="text-align:center">'+(qty!==null?'<strong style="font-size:16px">'+fnum(qty)+'</strong>':'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td style="text-align:center">'+(dem>0?'<span onmouseenter="showOpTip(event,\''+p.id+'\')" onmouseleave="hideOpTip()" style="background:rgba(245,158,11,.15);color:var(--warn);border:1px solid rgba(245,158,11,.25);border-radius:4px;padding:2px 8px;font-size:13px;font-weight:600;cursor:default">🔒 '+fnum(dem)+'</span>':'<span style="color:var(--muted);font-size:12px">—</span>')+'</td>'+
        '<td style="text-align:center">'+(avail===null?'—':avail>=0?'<span style="color:var(--green);font-weight:700;font-size:16px">+'+fnum(avail)+'</span>':'<span style="color:var(--danger);font-weight:700;font-size:14px">⚠️ Falta '+fnum(Math.abs(avail))+'</span>')+'</td>'+
        '<td><span class="'+semCls+'"><span class="sem-dot"></span>'+semLabel+'</span></td>'+
        '<td style="white-space:nowrap">'+
          '<button class="btn btn-ghost btn-sm" onclick="openLancamento(\''+p.id+'\')">➕ Lançar</button> '+
          '<button class="btn btn-ghost btn-sm" onclick="openInventario(\''+p.id+'\')">📋 Inventário</button> '+
          '<button class="btn btn-ghost btn-sm" onclick="openHistoricoEstoque(\''+p.id+'\')">🕐 Histórico</button>'+
        '</td></tr>';
    }).join('')+'</tbody></table>';
  if(qSaved&&el('srch-est')){const inp=el('srch-est');inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}
  // OP tooltip overlay
  if(!el('op-tip')){
    const tip=document.createElement('div');
    tip.id='op-tip';
    tip.style.cssText='display:none;position:fixed;z-index:9999;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;min-width:220px;box-shadow:0 4px 20px rgba(0,0,0,.4)';
    document.body.appendChild(tip);
  }
}
function showOpTip(evt,pid){
  const tip=el('op-tip');if(!tip)return;
  const rows=(_opTipData[pid]||[]);
  if(!rows.length){tip.style.display='none';return;}
  tip.innerHTML='<div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">OPs reservando este produto</div>'+
    rows.map(r=>'<div style="display:flex;gap:8px;align-items:center;padding:3px 0">'+
      '<span style="font-weight:700;min-width:55px">#'+esc(String(r.num))+'</span>'+
      '<span style="color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(r.client)+'">'+esc(r.client)+'</span>'+
      '<span style="color:var(--warn);font-weight:600">'+fnum(r.qty)+' un.</span>'+
    '</div>').join('');
  tip.style.display='block';
  const x=evt.clientX,y=evt.clientY,tw=tip.offsetWidth||280,th=tip.offsetHeight||100;
  const vw=window.innerWidth,vh=window.innerHeight;
  tip.style.left=(x+16+tw>vw?x-tw-8:x+16)+'px';
  tip.style.top=(y+16+th>vh?y-th-8:y+16)+'px';
}
function hideOpTip(){const tip=el('op-tip');if(tip)tip.style.display='none';}
window.showOpTip=showOpTip;window.hideOpTip=hideOpTip;
window.setSupFilter=setSupFilter;window.setSupSort=setSupSort;window.renderEstoque=renderEstoque;

function openLancamento(pid){
  const d=gdb();
  let prodSel;
  if(pid){
    const p=d.products.find(x=>x.id===pid);
    prodSel='<input type="hidden" id="ae-prod" value="'+pid+'"><div style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);border-radius:8px;padding:12px;margin-bottom:12px"><strong>'+esc(p?p.name:'')+'</strong>'+(d.stock[pid]?'<br><span style="font-size:13px;color:var(--muted)">Estoque atual: <strong>'+fnum(d.stock[pid].qty)+'</strong> un.</span>':'<br><em style="color:var(--muted);font-size:12px">Sem estoque cadastrado</em>')+'</div>';
  }else{
    const prods2=d.products.filter(p=>p.isStock);
    if(!prods2.length){toast('Nenhum produto de revenda cadastrado','info');return;}
    prodSel='<div class="fg"><label>Produto</label><select id="ae-prod">'+prods2.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></div>';
  }
  Mopen('📦 Lançamento de Estoque',
    prodSel+
    '<div class="fg"><label>Tipo de Lançamento *</label>'+
    '<div class="ck-group" style="flex-direction:row;gap:16px">'+
    '<label class="ck-row"><input type="radio" name="ae-tipo" value="entrada" checked onchange="_aeLancTipoChange()"> <span style="color:var(--green)">➕ Entrada (adicionar)</span></label>'+
    '<label class="ck-row"><input type="radio" name="ae-tipo" value="saida" onchange="_aeLancTipoChange()"> <span style="color:var(--danger)">➖ Saída (retirar)</span></label>'+
    '</div></div>'+
    '<div class="fg"><label id="ae-qty-lbl">Quantidade a adicionar *</label><input type="number" id="ae-qty" min="1" placeholder="Ex: 500"></div>'+
    '<div class="fg"><label>Motivo (opcional)</label><input type="text" id="ae-mot" placeholder="Ex: Compra NF 1234 / Perda / Ajuste"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button><button class="btn btn-green" id="ae-btn-save" onclick="saveLancEst()">Salvar Entrada</button>'
  );
}
function _aeLancTipoChange(){
  const tipo=(document.querySelector('input[name="ae-tipo"]:checked')||{}).value;
  const lbl=el('ae-qty-lbl'),btn=el('ae-btn-save');
  if(tipo==='saida'){if(lbl)lbl.textContent='Quantidade a retirar *';if(btn){btn.textContent='Salvar Saída';btn.className='btn btn-danger';}}
  else{if(lbl)lbl.textContent='Quantidade a adicionar *';if(btn){btn.textContent='Salvar Entrada';btn.className='btn btn-green';}}
}
function saveLancEst(){
  const pid=v('ae-prod'),qty=parseInt(v('ae-qty'));
  const tipo=(document.querySelector('input[name="ae-tipo"]:checked')||{}).value||'entrada';
  if(!pid){toast('Selecione um produto','err');return;}
  if(isNaN(qty)||qty<=0){toast('Quantidade deve ser > 0','err');return;}
  const d=gdb();const _lp=d.products.find(x=>x.id===pid);
  const prev=(d.stock[pid]||{}).qty||0;
  if(tipo==='saida'){
    if(qty>prev&&!confirm('⚠️ A retirada de '+qty+' un. é maior que o saldo atual ('+prev+' un.).\nO estoque ficará negativo. Confirmar mesmo assim?'))return;
    const novoQty=prev-qty;
    d.stock[pid]={qty:novoQty,at:Date.now()};
    logAction(d,'Saída de estoque',(_lp?_lp.name:'pid:'+pid)+': -'+qty+' → total '+novoQty);
    sdb(d);Mclose();toast('Saída: -'+qty+' un. (total: '+novoQty+')','ok');renderEstoque();
  }else{
    const novoQty=prev+qty;
    d.stock[pid]={qty:novoQty,at:Date.now()};
    logAction(d,'Estoque lançado',(_lp?_lp.name:'pid:'+pid)+': +'+qty+' → total '+novoQty);
    sdb(d);Mclose();toast('Entrada: +'+qty+' un. (total: '+novoQty+')','ok');renderEstoque();
  }
}
function openInventario(pid){
  const d=gdb();
  let prodSel;
  if(pid){const p=d.products.find(x=>x.id===pid);const st2=d.stock[pid];prodSel='<input type="hidden" id="inv-prod" value="'+pid+'"><div style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);border-radius:8px;padding:12px;margin-bottom:12px"><strong>'+esc(p?p.name:'')+'</strong>'+(st2?'<br><span style="font-size:13px;color:var(--muted)">Estoque atual: <strong>'+fnum(st2.qty)+'</strong> un.</span>':'')+'</div>';}
  else{const prods2=d.products.filter(p=>p.isStock);if(!prods2.length){toast('Nenhum produto de revenda cadastrado','info');return;}prodSel='<div class="fg"><label>Produto</label><select id="inv-prod">'+prods2.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></div>';}
  const st2=pid&&d.stock[pid];
  Mopen('📋 Inventário — Definir Quantidade Total',
    '<div class="alert alert-warn" style="margin-bottom:14px">⚠️ O inventário <strong>substitui</strong> o estoque atual pelo valor informado (não soma).</div>'+
    prodSel+'<div class="fg"><label>Quantidade total em estoque (físico) *</label><input type="number" id="inv-qty" min="0" placeholder="Ex: 1250" value="'+(st2?st2.qty:0)+'"></div>'+
    '<div class="fg"><label>Motivo (opcional)</label><input type="text" id="inv-mot" placeholder="Ex: Contagem mensal"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button><button class="btn btn-green" onclick="saveInventario()">Salvar Inventário</button>'
  );
}
function saveInventario(){
  const pid=v('inv-prod'),qty=parseInt(v('inv-qty'));
  if(!pid){toast('Selecione um produto','err');return;}
  if(isNaN(qty)||qty<0){toast('Quantidade inválida','err');return;}
  const d=gdb();const _ip=d.products.find(x=>x.id===pid);
  const prev=(d.stock[pid]||{}).qty;
  d.stock[pid]={qty,at:Date.now()};
  logAction(d,'Inventário',(_ip?_ip.name:'pid:'+pid)+': '+(prev!=null?prev+'→':'')+qty+' un.');
  sdb(d);Mclose();toast('Inventário: estoque definido para '+qty+' un.','ok');renderEstoque();
}
window.openLancamento=openLancamento;window._aeLancTipoChange=_aeLancTipoChange;
window.saveLancEst=saveLancEst;window.openInventario=openInventario;window.saveInventario=saveInventario;

async function openHistoricoEstoque(pid){
  const d=gdb();
  const p=d.products.find(x=>x.id===pid);
  if(!p){toast('Produto não encontrado','err');return;}
  const pname=p.name;
  const stockNow=d.stock[pid];
  Mopen('📋 Histórico de Estoque — '+esc(pname),
    '<div id="hist-body" style="min-height:120px"><div style="text-align:center;padding:40px;color:var(--muted)">🔄 Carregando histórico...</div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
  try{
    const nameQ=encodeURIComponent('*'+pname+'*');
    const r=await _sf('/rest/v1/'+_AUDIT_TABLE+'?select=*&details=ilike.'+nameQ+'&order=at.desc&limit=300');
    if(!r.ok)throw new Error(await r.text());
    const rows=await r.json();
    const stockActions=new Set(['Estoque lançado','Saída de estoque','Inventário','Inventário inicial registrado']);
    const filtered=rows.filter(row=>stockActions.has(row.action));
    let totalEnt=0,totalSai=0;
    let html='';
    if(!filtered.length){
      html='<div class="empty"><div class="ei">📋</div><p>Nenhum histórico encontrado para este produto</p></div>';
    }else{
      const trs=filtered.map(row=>{
        const dt=new Date(row.at);
        const dtStr=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        const det=row.details||'';
        let tipo='',deltaStr='—',cls='color:var(--muted)';
        if(row.action==='Estoque lançado'){const m=det.match(/[:\s]\+(\d+)/);const qty=m?+m[1]:null;if(qty!=null)totalEnt+=qty;tipo='Entrada';cls='color:var(--green)';deltaStr=qty!=null?'<span style="'+cls+';font-weight:700">+'+fnum(qty)+'</span>':'—';}
        else if(row.action==='Saída de estoque'){const m=det.match(/[:\s]-(\d+)/);const qty=m?+m[1]:null;if(qty!=null)totalSai+=qty;tipo='Saída';cls='color:var(--danger)';deltaStr=qty!=null?'<span style="'+cls+';font-weight:700">-'+fnum(qty)+'</span>':'—';}
        else if(row.action==='Inventário'){const m=det.match(/→(\d+)\s*un/);const qty=m?+m[1]:null;tipo='Inventário';cls='color:var(--accent)';deltaStr=qty!=null?'<span style="'+cls+'">'+fnum(qty)+'</span>':'—';}
        else{tipo='Inv. inicial';cls='color:var(--accent)';deltaStr='—';}
        return'<tr><td style="font-size:12px;white-space:nowrap;color:var(--muted)">'+dtStr+'</td><td><span style="'+cls+'">'+tipo+'</span></td><td style="text-align:center">'+deltaStr+'</td><td style="font-size:12px;color:var(--muted)">'+esc(row.uname||'—')+'</td></tr>';
      }).join('');
      html=_histKpiBar(totalEnt,totalSai,stockNow?stockNow.qty:null,'un')+
        '<div class="tw" style="max-height:360px;overflow-y:auto"><table><thead><tr><th>Data/Hora</th><th>Tipo</th><th style="text-align:center">Qtd</th><th>Usuário</th></tr></thead><tbody>'+trs+'</tbody></table></div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:8px">'+filtered.length+' registro(s)</div>';
    }
    const bodyEl=el('hist-body');if(bodyEl)bodyEl.innerHTML=html;
  }catch(e2){const bodyEl=el('hist-body');if(bodyEl)bodyEl.innerHTML='<div style="color:var(--danger);padding:20px">Erro: '+esc(String(e2))+'</div>';}
}
window.openHistoricoEstoque=openHistoricoEstoque;

function _histKpiBar(totalEnt,totalSai,stockNow,unit){
  return'<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">'+
    '<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:8px;padding:10px 16px;min-width:100px">'+
    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total entradas</div>'+
    '<div style="font-size:22px;font-weight:700;color:var(--green)">+'+fnum(totalEnt)+' '+(unit||'')+'</div></div>'+
    '<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:10px 16px;min-width:100px">'+
    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total saídas</div>'+
    '<div style="font-size:22px;font-weight:700;color:var(--danger)">-'+fnum(totalSai)+' '+(unit||'')+'</div></div>'+
    (stockNow!=null?'<div style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.25);border-radius:8px;padding:10px 16px;min-width:100px">'+
    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Saldo atual</div>'+
    '<div style="font-size:22px;font-weight:700;color:var(--accent)">'+fnum(stockNow)+' '+(unit||'')+'</div></div>':'')+'</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// ── ESTOQUE DE MATÉRIA PRIMA ──
// ═══════════════════════════════════════════════════════════════════════════
let _supMPExpanded=null,_supMPFilter='';
function renderSupMP(){
  const c=el('sup-c');if(!c)return;
  _supMPFilter='';
  c.innerHTML='<div class="card">'+
    '<div class="card-header"><div class="card-title">🌿 Estoque de Matéria-Prima</div>'+
    '<div style="display:flex;gap:6px">'+
    '<button class="btn btn-green btn-sm" onclick="openEntradaMP()">➕ Entrada</button>'+
    '<button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:rgba(239,68,68,.3)" onclick="openSaidaMP()">➖ Saída</button>'+
    '</div></div>'+
    '<div style="padding:8px 0 0"><input type="text" placeholder="🔍 Buscar matéria-prima..." class="sinput" style="width:100%;box-sizing:border-box" value="" oninput="_supMPFilter=this.value;_renderSupMPRows(gdb())"></div>'+
    '<div class="tw" id="sup-mp-tbl"></div></div>';
  _renderSupMPTable();
}
function _renderSupMPTable(){
  const t=el('sup-mp-tbl');if(!t)return;
  const d=gdb();
  if(!d.rawMaterials.length){t.innerHTML='<div class="empty"><div class="ei">🌿</div><p>Nenhuma matéria-prima cadastrada</p></div>';return;}
  t.innerHTML='<table><thead><tr>'+
    '<th>Código</th><th>Matéria-Prima</th>'+
    '<th style="text-align:center">Estoque Total</th><th style="text-align:center">Estoque Mínimo</th>'+
    '<th>Status</th><th></th>'+
    '</tr></thead><tbody id="sup-mp-rows"></tbody></table>';
  _renderSupMPRows(d);
}
function _renderSupMPRows(d){
  const t=el('sup-mp-rows');if(!t)return;
  const _flt=(_supMPFilter||'').toLowerCase().trim();
  const mats=_flt?d.rawMaterials.filter(m=>(m.name||'').toLowerCase().includes(_flt)||(m.code||'').toLowerCase().includes(_flt)):d.rawMaterials;
  if(!mats.length){t.innerHTML='<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Nenhuma matéria-prima encontrada</td></tr>';return;}
  t.innerHTML=mats.map(m=>{
    const qty=_rmStockTotal(d,m.id);
    const status=_rmStatus(d,m.id);
    const badge=_stockBadge(status);
    const isExp=_supMPExpanded===m.id;
    const _munit=m.unit||'KG';
    let rows='<tr style="cursor:pointer" onclick="_toggleMPDrill(\''+m.id+'\')">'+
      '<td><span class="sku">'+esc(m.code)+'</span></td>'+
      '<td><strong>'+esc(m.name)+'</strong></td>'+
      '<td style="text-align:center"><strong style="font-size:15px">'+fqty(qty,_munit)+'</strong> '+_munit+'</td>'+
      '<td style="text-align:center">'+(m.minStock?fqty(m.minStock,_munit)+' '+_munit:'<span style="color:var(--muted)">—</span>')+'</td>'+
      '<td>'+badge+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" title="Entrada" onclick="event.stopPropagation();openEntradaMP(\''+m.id+'\')">➕</button> '+
        '<button class="btn btn-ghost btn-sm" style="color:var(--danger)" title="Saída" onclick="event.stopPropagation();openSaidaMP(\''+m.id+'\')">➖</button> '+
        '<button class="btn btn-ghost btn-sm" title="Inventário" onclick="event.stopPropagation();openInventarioMP(\''+m.id+'\')">📋</button> '+
        '<button class="btn btn-ghost btn-sm" title="Histórico" onclick="event.stopPropagation();openHistoricoMP(\''+m.id+'\')">🕐</button>'+
      '</td></tr>';
    if(isExp){
      const st=d.rawMaterialStock[m.id]||{total:0,bySupplier:{}};
      const suppRows=d.suppliers.filter(s=>(st.bySupplier||{})[s.id]>0).map(s=>{
        const q=(st.bySupplier||{})[s.id]||0;
        return'<tr style="background:rgba(255,255,255,.03)">'+
          '<td colspan="2" style="padding-left:32px;font-size:13px;color:var(--muted)">↳ '+esc(s.name)+'</td>'+
          '<td style="text-align:center;font-size:13px">'+fqty(q,_munit)+' '+_munit+'</td>'+
          '<td colspan="3" style="font-size:12px;color:var(--muted)">'+
          '<a href="#" style="color:var(--info);font-size:11px" onclick="event.preventDefault();openSaidaMP(\''+m.id+'\')">saída</a>'+
          '</td></tr>';
      });
      const moves=(d.rawMaterialMovements||[]).filter(mv=>mv.itemId===m.id).slice(-5).reverse();
      const movRows=moves.map(mv=>{
        const sup=d.suppliers.find(x=>x.id===mv.supplierId);
        const typeLabel=mv.type==='entrada'?'<span style="color:var(--green)">➕ Entrada</span>':mv.type==='saida'?'<span style="color:var(--danger)">➖ Saída</span>':'<span style="color:var(--info)">📋 Inventário</span>';
        const ref=mv.nfNum?'NF: '+mv.nfNum:mv.reqNum?'REQ: '+mv.reqNum:'';
        return'<tr style="background:rgba(255,255,255,.02);font-size:12px">'+
          '<td colspan="2" style="padding-left:32px;color:var(--muted)">'+typeLabel+' '+fdate(mv.date)+(ref?' — '+ref:'')+(sup?' ('+esc(sup.name)+')':'')+'</td>'+
          '<td style="text-align:center">'+(mv.type==='entrada'?'<span style="color:var(--green)">+'+fqty(mv.qty,_munit)+' '+_munit+'</span>':mv.type==='saida'?'<span style="color:var(--danger)">-'+fqty(mv.qty,_munit)+' '+_munit+'</span>':'<span style="color:var(--info)">'+(mv.delta>=0?'+':'')+fqty(mv.delta,_munit)+' '+_munit+'</span>')+'</td>'+
          '<td colspan="3" style="color:var(--muted)">'+esc(mv.obs||'')+'</td></tr>';
      });
      if(suppRows.length)rows+=suppRows.join('');
      if(movRows.length)rows+='<tr><td colspan="6" style="padding:8px 16px 4px 32px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Últimas movimentações</td></tr>'+movRows.join('');
    }
    return rows;
  }).join('');
}
function _toggleMPDrill(mid){_supMPExpanded=(_supMPExpanded===mid)?null:mid;_renderSupMPRows(gdb());}
window._toggleMPDrill=_toggleMPDrill;window._renderSupMPRows=_renderSupMPRows;
window.renderSupMP=renderSupMP;

// ─── Entrada / Saída / Inventário MP ───
function openEntradaMP(mid){
  const d=gdb();
  const rmOpts=d.rawMaterials.map(m=>'<option value="'+m.id+'"'+(mid&&m.id===mid?' selected':'')+'>'+esc(m.code)+' — '+esc(m.name)+'</option>').join('');
  Mopen('➕ Entrada de Matéria-Prima',
    _suppDl(d)+
    '<div class="fgrid"><div class="fg"><label>Produto *</label><select id="mv-item">'+rmOpts+'</select></div>'+
    _suppAutoHtml('Fornecedor *')+'</div>'+
    '<div class="fgrid"><div class="fg"><label>Quantidade *</label><input type="number" id="mv-qty" min="0.0001" step="0.0001" placeholder="0"></div>'+
    '<div class="fg"><label>Nº da Nota Fiscal *</label><input type="text" id="mv-nf" placeholder="Ex: 000123456"></div></div>'+
    '<div class="fg"><label>Data de Entrada *</label><input type="date" id="mv-date" value="'+today8601()+'"></div>'+
    '<div class="fg"><label>Observação</label><input type="text" id="mv-obs" placeholder="(opcional)"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitEntradaMP()">✅ Confirmar Entrada</button>'
  );
}
async function submitEntradaMP(){
  const mid=v('mv-item'),nf=v('mv-nf').trim(),date=v('mv-date'),obs=v('mv-obs').trim();
  const d=gdb();
  const sid=_getSuppId(true);if(sid===null)return;
  const _rm=d.rawMaterials.find(x=>x.id===mid);const _unit=_rm?_rm.unit||'KG':'KG';
  const qty=_parseQty(v('mv-qty'),_unit);
  if(!mid){toast('Selecione o produto','err');return;}
  if(qty<=0){toast('Quantidade deve ser maior que zero','err');return;}
  if(!nf){toast('Informe o número da nota fiscal','err');return;}
  if(!date){toast('Informe a data','err');return;}
  Mclose();
  try{
    await _rpcRMAdjust(mid,sid,qty);
    const d2=gdb();
    if(!d2.rawMaterialMovements)d2.rawMaterialMovements=[];
    d2.rawMaterialMovements.push({id:_nid(),type:'entrada',itemId:mid,supplierId:sid,qty,nfNum:nf,date,obs,createdAt:Date.now(),createdBy:S?S.name:''});
    logAction(d2,'Entrada MP',_rmName(d2,mid)+' +'+fqty(qty,_unit)+' '+_unit);
    sdb(d2);toast('Entrada registrada!','ok');
    if(el('sup-mp-tbl'))_renderSupMPTable();
  }catch(e){toast('Erro ao registrar entrada: '+e.message,'err');}
}
function openSaidaMP(mid){
  const d=gdb();
  const rmOpts=d.rawMaterials.map(m=>'<option value="'+m.id+'"'+(mid&&m.id===mid?' selected':'')+'>'+esc(m.code)+' — '+esc(m.name)+'</option>').join('');
  Mopen('➖ Saída de Matéria-Prima',
    '<div class="fg"><label>Produto *</label><select id="mv-item" onchange="_updateSuppSaida()">'+rmOpts+'</select></div>'+
    '<div class="fg"><label>Fornecedor *</label><select id="mv-supp"><option value="">Selecione o produto primeiro...</option></select></div>'+
    '<div class="fgrid"><div class="fg"><label>Quantidade *</label><input type="number" id="mv-qty" min="0.0001" step="0.0001" placeholder="0"></div>'+
    '<div class="fg"><label>Nº da Requisição *</label><input type="text" id="mv-req" placeholder="Ex: REQ-001"></div></div>'+
    '<div class="fg"><label>Data de Saída *</label><input type="date" id="mv-date" value="'+today8601()+'"></div>'+
    '<div class="fg"><label>Observação</label><input type="text" id="mv-obs" placeholder="(opcional)"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="submitSaidaMP()">✅ Confirmar Saída</button>'
  );
  setTimeout(()=>_updateSuppSaida(mid),100);
}
function _updateSuppSaida(forceMid){
  const d=gdb();const mid=forceMid||v('mv-item');if(!mid)return;
  const st=d.rawMaterialStock[mid];
  const _rm=d.rawMaterials.find(x=>x.id===mid);const _unit=_rm?_rm.unit||'KG':'KG';
  const suppSel=el('mv-supp');if(!suppSel)return;
  if(!st||!Object.keys(st.bySupplier||{}).length){suppSel.innerHTML='<option value="">Sem estoque por fornecedor</option>';return;}
  suppSel.innerHTML='<option value="">Selecione o fornecedor...</option>'+
    Object.entries(st.bySupplier).filter(([,q])=>q>0).map(([sid,q])=>{
      const sup=d.suppliers.find(x=>x.id===sid);
      return'<option value="'+sid+'">'+esc(sup?sup.name:sid)+' ('+fqty(q,_unit)+' '+_unit+')</option>';
    }).join('');
}
async function submitSaidaMP(){
  const mid=v('mv-item'),sid=v('mv-supp'),req=v('mv-req').trim(),date=v('mv-date'),obs=v('mv-obs').trim();
  const d=gdb();
  const _rm=d.rawMaterials.find(x=>x.id===mid);const _unit=_rm?_rm.unit||'KG':'KG';
  const qty=_parseQty(v('mv-qty'),_unit);
  if(!mid){toast('Selecione o produto','err');return;}
  if(!sid){toast('Selecione o fornecedor','err');return;}
  if(qty<=0){toast('Quantidade deve ser maior que zero','err');return;}
  if(!req){toast('Informe o número da requisição','err');return;}
  const disp=_rmStockBySupp(d,mid,sid);
  if(qty>disp){toast('Estoque insuficiente para este fornecedor ('+fqty(disp,_unit)+' '+_unit+' disponíveis)','err');return;}
  Mclose();
  try{
    await _rpcRMAdjust(mid,sid,-qty);
    const d2=gdb();
    if(!d2.rawMaterialMovements)d2.rawMaterialMovements=[];
    d2.rawMaterialMovements.push({id:_nid(),type:'saida',itemId:mid,supplierId:sid,qty,reqNum:req,date,obs,createdAt:Date.now(),createdBy:S?S.name:''});
    logAction(d2,'Saída MP',_rmName(d2,mid)+' -'+fqty(qty,_unit)+' '+_unit);
    sdb(d2);toast('Saída registrada!','ok');
    if(el('sup-mp-tbl'))_renderSupMPTable();
  }catch(e){toast('Erro ao registrar saída: '+e.message,'err');}
}
function openInventarioMP(mid){
  const d=gdb();
  const m=d.rawMaterials.find(x=>x.id===mid);if(!m)return;
  const _unit=m.unit||'KG';
  const st=d.rawMaterialStock[mid]||{total:0,bySupplier:{}};
  const suppDlWithStock='<datalist id="mv-supp-dl">'+d.suppliers.map(s=>{
    const qAtu=(st.bySupplier||{})[s.id]||0;
    return'<option value="'+esc(s.name)+'">'+(qAtu>0?' (atual: '+fqty(qAtu,_unit)+' '+_unit+')':'');
  }).join('')+'</datalist>';
  Mopen('📋 Inventário — '+esc(m.name),
    '<div class="alert alert-info" style="font-size:13px;margin-bottom:12px">Informe a quantidade <strong>real contada</strong>. O sistema calculará o ajuste automaticamente.</div>'+
    suppDlWithStock+
    _suppAutoHtml('Fornecedor *')+
    '<div class="fgrid"><div class="fg"><label>Quantidade Contada *</label><input type="number" id="mv-qty" min="0" step="0.0001" placeholder="0"></div>'+
    '<div class="fg"><label>Data do Inventário *</label><input type="date" id="mv-date" value="'+today8601()+'"></div></div>'+
    '<div class="fg"><label>Observação</label><input type="text" id="mv-obs" placeholder="Ex: Contagem física"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitInventarioMP(\''+mid+'\')">✅ Confirmar Inventário</button>'
  );
}
async function submitInventarioMP(mid){
  const d=gdb();
  const _rm=d.rawMaterials.find(x=>x.id===mid);const _unit=_rm?_rm.unit||'KG':'KG';
  const sid=_getSuppId(true);if(sid===null)return;
  const qty=_parseQty(v('mv-qty'),_unit);
  const date=v('mv-date'),obs=v('mv-obs').trim();
  if(isNaN(qty)||qty<0){toast('Quantidade inválida','err');return;}
  const antes=_rmStockBySupp(d,mid,sid);
  const delta=qty-antes;
  Mclose();
  try{
    await _rpcRMSet(mid,sid,qty);
    const d2=gdb();
    if(!d2.rawMaterialMovements)d2.rawMaterialMovements=[];
    d2.rawMaterialMovements.push({id:_nid(),type:'inventario',itemId:mid,supplierId:sid,qty,delta,date,obs,createdAt:Date.now(),createdBy:S?S.name:''});
    logAction(d2,'Inventário MP',_rmName(d2,mid)+' ajuste: '+(delta>=0?'+':'')+fqty(delta,_unit)+' '+_unit);
    sdb(d2);toast('Inventário registrado (ajuste '+(delta>=0?'+':'')+fqty(delta,_unit)+' '+_unit+')','ok');
    if(el('sup-mp-tbl'))_renderSupMPTable();
  }catch(e){toast('Erro ao registrar inventário: '+e.message,'err');}
}
async function openHistoricoMP(mid){
  const d=gdb();
  const m=d.rawMaterials.find(x=>x.id===mid);
  if(!m){toast('Matéria-prima não encontrada','err');return;}
  const mname=m.name;
  const _munit=m.unit||'KG';
  const stockNow=_rmStockTotal(d,mid);
  Mopen('🕐 Histórico — '+esc(mname),
    '<div id="hist-mp-body" style="min-height:120px"><div style="text-align:center;padding:40px;color:var(--muted)">🔄 Carregando histórico...</div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
  try{
    const nameQ=encodeURIComponent('*'+mname+'*');
    const r=await _sf('/rest/v1/'+_AUDIT_TABLE+'?select=*&details=ilike.'+nameQ+'&order=at.desc&limit=300');
    if(!r.ok)throw new Error(await r.text());
    const rows=await r.json();
    const mpActions=new Set(['Entrada MP','Saída MP','Inventário MP']);
    const filtered=rows.filter(row=>mpActions.has(row.action));
    let totalEnt=0,totalSai=0;
    let html='';
    if(!filtered.length){
      html='<div class="empty"><div class="ei">🕐</div><p>Nenhum histórico encontrado para esta matéria-prima</p></div>';
    }else{
      const trs=filtered.map(row=>{
        const dt=new Date(row.at);
        const dtStr=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        const det=row.details||'';
        let tipo='',deltaStr='—',cls='color:var(--muted)';
        if(row.action==='Entrada MP'){const m2=det.match(/\+([0-9.,]+)/);const qty=m2?parseFloat(m2[1].replace(',','.')):null;if(qty!=null)totalEnt+=qty;tipo='Entrada';cls='color:var(--green)';deltaStr=qty!=null?'<span style="'+cls+';font-weight:700">+'+fnum(qty)+' '+_munit+'</span>':'—';}
        else if(row.action==='Saída MP'){const m2=det.match(/-([0-9.,]+)/);const qty=m2?parseFloat(m2[1].replace(',','.')):null;if(qty!=null)totalSai+=qty;tipo='Saída';cls='color:var(--danger)';deltaStr=qty!=null?'<span style="'+cls+';font-weight:700">-'+fnum(qty)+' '+_munit+'</span>':'—';}
        else{const m2=det.match(/([+-][0-9.,]+)/);const qty=m2?parseFloat(m2[1].replace(',','.')):null;tipo='Inventário';cls='color:var(--accent)';deltaStr=qty!=null?'<span style="'+cls+'">'+(qty>=0?'+':'')+fnum(qty)+' '+_munit+'</span>':'—';}
        return'<tr><td style="font-size:12px;white-space:nowrap;color:var(--muted)">'+dtStr+'</td><td><span style="'+cls+'">'+tipo+'</span></td><td style="text-align:center">'+deltaStr+'</td><td style="font-size:12px;color:var(--muted)">'+esc(row.uname||'—')+'</td></tr>';
      }).join('');
      html=_histKpiBar(totalEnt,totalSai,stockNow,_munit)+
        '<div class="tw" style="max-height:360px;overflow-y:auto"><table><thead><tr><th>Data/Hora</th><th>Tipo</th><th style="text-align:center">Qtd</th><th>Usuário</th></tr></thead><tbody>'+trs+'</tbody></table></div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:8px">'+filtered.length+' registro(s)</div>';
    }
    const bodyEl=el('hist-mp-body');if(bodyEl)bodyEl.innerHTML=html;
  }catch(e2){const bodyEl=el('hist-mp-body');if(bodyEl)bodyEl.innerHTML='<div style="color:var(--danger);padding:20px">Erro: '+esc(String(e2))+'</div>';}
}

window.openEntradaMP=openEntradaMP;window.submitEntradaMP=submitEntradaMP;
window.openSaidaMP=openSaidaMP;window._updateSuppSaida=_updateSuppSaida;window.submitSaidaMP=submitSaidaMP;
window.openInventarioMP=openInventarioMP;window.submitInventarioMP=submitInventarioMP;
window.openHistoricoMP=openHistoricoMP;

// ═══════════════════════════════════════════════════════════════════════════
// ── ESTOQUE DE EMBALAGENS ──
// ═══════════════════════════════════════════════════════════════════════════
let _supEmbExpanded=null,_supEmbFilter='';
function renderSupEmb(){
  const c=el('sup-c');if(!c)return;
  _supEmbFilter='';
  c.innerHTML='<div class="card">'+
    '<div class="card-header"><div class="card-title">📦 Estoque de Embalagens</div>'+
    '<div style="display:flex;gap:6px">'+
    '<button class="btn btn-green btn-sm" onclick="openEntradaEmb()">➕ Entrada</button>'+
    '<button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:rgba(239,68,68,.3)" onclick="openSaidaEmb()">➖ Saída</button>'+
    '</div></div>'+
    '<div style="padding:8px 0 0"><input type="text" placeholder="🔍 Buscar embalagem..." class="sinput" style="width:100%;box-sizing:border-box" value="" oninput="_supEmbFilter=this.value;_renderSupEmbRows(gdb())"></div>'+
    '<div class="tw" id="sup-emb-tbl"></div></div>';
  _renderSupEmbTable();
}
function _renderSupEmbTable(){
  const t=el('sup-emb-tbl');if(!t)return;
  const d=gdb();
  if(!d.packaging.length){t.innerHTML='<div class="empty"><div class="ei">📦</div><p>Nenhuma embalagem cadastrada</p></div>';return;}
  t.innerHTML='<table><thead><tr>'+
    '<th>Código</th><th>Embalagem</th>'+
    '<th style="text-align:center">Estoque</th><th style="text-align:center">Estoque Mínimo</th>'+
    '<th>Status</th><th></th>'+
    '</tr></thead><tbody id="sup-emb-rows"></tbody></table>';
  _renderSupEmbRows(d);
}
function _renderSupEmbRows(d){
  const t=el('sup-emb-rows');if(!t)return;
  const _flt=(_supEmbFilter||'').toLowerCase().trim();
  const packs=_flt?d.packaging.filter(p=>(p.name||'').toLowerCase().includes(_flt)||(p.code||'').toLowerCase().includes(_flt)):d.packaging;
  if(!packs.length){t.innerHTML='<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Nenhuma embalagem encontrada</td></tr>';return;}
  t.innerHTML=packs.map(p=>{
    const qty=d.packagingStock[p.id]||0;
    const status=_packStatus(d,p.id);
    const badge=_stockBadge(status);
    const isExp=_supEmbExpanded===p.id;
    const _eunit=p.unit||'UN';
    let rows='<tr style="cursor:pointer" onclick="_toggleEmbDrill(\''+p.id+'\')">'+
      '<td><span class="sku">'+esc(p.code)+'</span></td>'+
      '<td><strong>'+esc(p.name)+'</strong></td>'+
      '<td style="text-align:center"><strong style="font-size:15px">'+fqty(qty,_eunit)+'</strong> '+_eunit+'</td>'+
      '<td style="text-align:center">'+(p.minStock?fqty(p.minStock,_eunit)+' '+_eunit:'<span style="color:var(--muted)">—</span>')+'</td>'+
      '<td>'+badge+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" title="Entrada" onclick="event.stopPropagation();openEntradaEmb(\''+p.id+'\')">➕</button> '+
        '<button class="btn btn-ghost btn-sm" style="color:var(--danger)" title="Saída" onclick="event.stopPropagation();openSaidaEmb(\''+p.id+'\')">➖</button> '+
        '<button class="btn btn-ghost btn-sm" title="Inventário" onclick="event.stopPropagation();openInventarioEmb(\''+p.id+'\')">📋</button> '+
        '<button class="btn btn-ghost btn-sm" title="Histórico" onclick="event.stopPropagation();openHistoricoEmb(\''+p.id+'\')">🕐</button>'+
      '</td></tr>';
    if(isExp){
      const moves=(d.packagingMovements||[]).filter(mv=>mv.itemId===p.id).slice(-5).reverse();
      const movRows=moves.map(mv=>{
        const typeLabel=mv.type==='entrada'?'<span style="color:var(--green)">➕ Entrada</span>':mv.type==='saida'?'<span style="color:var(--danger)">➖ Saída</span>':'<span style="color:var(--info)">📋 Inventário</span>';
        const ref=mv.nfNum?'NF: '+mv.nfNum:mv.reqNum?'REQ: '+mv.reqNum:'';
        return'<tr style="background:rgba(255,255,255,.02);font-size:12px">'+
          '<td colspan="2" style="padding-left:32px;color:var(--muted)">'+typeLabel+' '+fdate(mv.date)+(ref?' — '+ref:'')+'</td>'+
          '<td style="text-align:center">'+(mv.type==='entrada'?'<span style="color:var(--green)">+'+fqty(mv.qty,_eunit)+' '+_eunit+'</span>':mv.type==='saida'?'<span style="color:var(--danger)">-'+fqty(mv.qty,_eunit)+' '+_eunit+'</span>':'<span style="color:var(--info)">'+(mv.delta>=0?'+':'')+fqty(mv.delta,_eunit)+' '+_eunit+'</span>')+'</td>'+
          '<td colspan="3" style="color:var(--muted)">'+esc(mv.obs||'')+'</td></tr>';
      });
      if(movRows.length)rows+='<tr><td colspan="6" style="padding:8px 16px 4px 32px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Últimas movimentações</td></tr>'+movRows.join('');
    }
    return rows;
  }).join('');
}
function _toggleEmbDrill(pid){_supEmbExpanded=(_supEmbExpanded===pid)?null:pid;_renderSupEmbRows(gdb());}
window._toggleEmbDrill=_toggleEmbDrill;window._renderSupEmbRows=_renderSupEmbRows;
window.renderSupEmb=renderSupEmb;

function openEntradaEmb(pid){
  const d=gdb();
  const opts=d.packaging.map(p=>'<option value="'+p.id+'"'+(pid&&p.id===pid?' selected':'')+'>'+esc(p.code)+' — '+esc(p.name)+'</option>').join('');
  Mopen('➕ Entrada de Embalagem',
    _suppDl(d)+
    '<div class="fgrid"><div class="fg"><label>Embalagem *</label><select id="mv-item">'+opts+'</select></div>'+
    _suppAutoHtml('Fornecedor')+'</div>'+
    '<div class="fgrid"><div class="fg"><label>Quantidade *</label><input type="number" id="mv-qty" min="0.0001" step="0.0001" placeholder="0"></div>'+
    '<div class="fg"><label>Nº da Nota Fiscal *</label><input type="text" id="mv-nf" placeholder="Ex: 000123456"></div></div>'+
    '<div class="fg"><label>Data de Entrada *</label><input type="date" id="mv-date" value="'+today8601()+'"></div>'+
    '<div class="fg"><label>Observação</label><input type="text" id="mv-obs" placeholder="(opcional)"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitEntradaEmb()">✅ Confirmar Entrada</button>'
  );
}
async function submitEntradaEmb(){
  const pid=v('mv-item'),nf=v('mv-nf').trim(),date=v('mv-date'),obs=v('mv-obs').trim();
  const d=gdb();
  const sid=_getSuppId(false);
  const _emb=d.packaging.find(x=>x.id===pid);const _unit=_emb?_emb.unit||'UN':'UN';
  const qty=_parseQty(v('mv-qty'),_unit);
  if(!pid){toast('Selecione a embalagem','err');return;}
  if(qty<=0){toast('Quantidade deve ser maior que zero','err');return;}
  if(!nf){toast('Informe o número da nota fiscal','err');return;}
  Mclose();
  try{
    await _rpcPKAdjust(pid,qty);
    const d2=gdb();
    if(!d2.packagingMovements)d2.packagingMovements=[];
    d2.packagingMovements.push({id:_nid(),type:'entrada',itemId:pid,supplierId:sid||null,qty,nfNum:nf,date,obs,createdAt:Date.now(),createdBy:S?S.name:''});
    logAction(d2,'Entrada Embalagem',(_emb?_emb.name:pid)+' +'+fqty(qty,_unit)+' '+_unit);
    sdb(d2);toast('Entrada registrada!','ok');
    if(el('sup-emb-tbl'))_renderSupEmbTable();
  }catch(e){toast('Erro ao registrar entrada: '+e.message,'err');}
}
function openSaidaEmb(pid){
  const d=gdb();
  const opts=d.packaging.map(p=>{
    const _unit=p.unit||'UN';const qAtu=d.packagingStock[p.id]||0;
    return'<option value="'+p.id+'"'+(pid&&p.id===pid?' selected':'')+'>'+esc(p.code)+' — '+esc(p.name)+' ('+fqty(qAtu,_unit)+' '+_unit+')</option>';
  }).join('');
  Mopen('➖ Saída de Embalagem',
    '<div class="fg"><label>Embalagem *</label><select id="mv-item">'+opts+'</select></div>'+
    '<div class="fgrid"><div class="fg"><label>Quantidade *</label><input type="number" id="mv-qty" min="0.0001" step="0.0001" placeholder="0"></div>'+
    '<div class="fg"><label>Nº da Requisição *</label><input type="text" id="mv-req" placeholder="Ex: REQ-001"></div></div>'+
    '<div class="fg"><label>Data de Saída *</label><input type="date" id="mv-date" value="'+today8601()+'"></div>'+
    '<div class="fg"><label>Observação</label><input type="text" id="mv-obs" placeholder="(opcional)"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="submitSaidaEmb()">✅ Confirmar Saída</button>'
  );
}
async function submitSaidaEmb(){
  const pid=v('mv-item'),req=v('mv-req').trim(),date=v('mv-date'),obs=v('mv-obs').trim();
  const d=gdb();
  const _emb=d.packaging.find(x=>x.id===pid);const _unit=_emb?_emb.unit||'UN':'UN';
  const qty=_parseQty(v('mv-qty'),_unit);
  if(!pid){toast('Selecione a embalagem','err');return;}
  if(qty<=0){toast('Quantidade deve ser maior que zero','err');return;}
  if(!req){toast('Informe o número da requisição','err');return;}
  const disp=d.packagingStock[pid]||0;
  if(qty>disp){toast('Estoque insuficiente ('+fqty(disp,_unit)+' '+_unit+' disponíveis)','err');return;}
  Mclose();
  try{
    await _rpcPKAdjust(pid,-qty);
    const d2=gdb();
    if(!d2.packagingMovements)d2.packagingMovements=[];
    d2.packagingMovements.push({id:_nid(),type:'saida',itemId:pid,qty,reqNum:req,date,obs,createdAt:Date.now(),createdBy:S?S.name:''});
    logAction(d2,'Saída Embalagem',(_emb?_emb.name:pid)+' -'+fqty(qty,_unit)+' '+_unit);
    sdb(d2);toast('Saída registrada!','ok');
    if(el('sup-emb-tbl'))_renderSupEmbTable();
  }catch(e){toast('Erro ao registrar saída: '+e.message,'err');}
}
function openInventarioEmb(pid){
  const d=gdb();
  const p=d.packaging.find(x=>x.id===pid);if(!p)return;
  const _unit=p.unit||'UN';
  const qAtu=d.packagingStock[pid]||0;
  Mopen('📋 Inventário — '+esc(p.name),
    '<div class="alert alert-info" style="font-size:13px;margin-bottom:12px">Quantidade atual no sistema: <strong>'+fqty(qAtu,_unit)+' '+_unit+'</strong>. Informe a quantidade real contada.</div>'+
    '<div class="fgrid"><div class="fg"><label>Quantidade Contada *</label><input type="number" id="mv-qty" min="0" step="0.0001" placeholder="0"></div>'+
    '<div class="fg"><label>Data do Inventário *</label><input type="date" id="mv-date" value="'+today8601()+'"></div></div>'+
    '<div class="fg"><label>Observação</label><input type="text" id="mv-obs" placeholder="Ex: Contagem física realizada"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitInventarioEmb(\''+pid+'\')">✅ Confirmar Inventário</button>'
  );
}
async function submitInventarioEmb(pid){
  const d=gdb();
  const _emb=d.packaging.find(x=>x.id===pid);const _unit=_emb?_emb.unit||'UN':'UN';
  const qty=_parseQty(v('mv-qty'),_unit);
  const date=v('mv-date'),obs=v('mv-obs').trim();
  if(isNaN(qty)||qty<0){toast('Quantidade inválida','err');return;}
  const antes=d.packagingStock[pid]||0;
  const delta=qty-antes;
  Mclose();
  try{
    await _rpcPKSet(pid,qty);
    const d2=gdb();
    if(!d2.packagingMovements)d2.packagingMovements=[];
    d2.packagingMovements.push({id:_nid(),type:'inventario',itemId:pid,qty,delta,date,obs,createdAt:Date.now(),createdBy:S?S.name:''});
    logAction(d2,'Inventário Embalagem',(_emb?_emb.name:pid)+' ajuste: '+(delta>=0?'+':'')+fqty(delta,_unit)+' '+_unit);
    sdb(d2);toast('Inventário registrado (ajuste '+(delta>=0?'+':'')+fqty(delta,_unit)+' '+_unit+')','ok');
    if(el('sup-emb-tbl'))_renderSupEmbTable();
  }catch(e){toast('Erro ao registrar inventário: '+e.message,'err');}
}
async function openHistoricoEmb(pid){
  const d=gdb();
  const p=d.packaging.find(x=>x.id===pid);
  if(!p){toast('Embalagem não encontrada','err');return;}
  const pname=p.name;
  const _eunit=p.unit||'UN';
  const stockNow=d.packagingStock[pid]||0;
  Mopen('🕐 Histórico — '+esc(pname),
    '<div id="hist-emb-body" style="min-height:120px"><div style="text-align:center;padding:40px;color:var(--muted)">🔄 Carregando histórico...</div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
  try{
    const nameQ=encodeURIComponent('*'+pname+'*');
    const r=await _sf('/rest/v1/'+_AUDIT_TABLE+'?select=*&details=ilike.'+nameQ+'&order=at.desc&limit=300');
    if(!r.ok)throw new Error(await r.text());
    const rows=await r.json();
    const embActions=new Set(['Entrada Embalagem','Saída Embalagem','Inventário Embalagem']);
    const filtered=rows.filter(row=>embActions.has(row.action));
    let totalEnt=0,totalSai=0;
    let html='';
    if(!filtered.length){
      html='<div class="empty"><div class="ei">🕐</div><p>Nenhum histórico encontrado para esta embalagem</p></div>';
    }else{
      const trs=filtered.map(row=>{
        const dt=new Date(row.at);
        const dtStr=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        const det=row.details||'';
        let tipo='',deltaStr='—',cls='color:var(--muted)';
        if(row.action==='Entrada Embalagem'){const m2=det.match(/\+([0-9.,]+)/);const qty=m2?parseFloat(m2[1].replace(',','.')):null;if(qty!=null)totalEnt+=qty;tipo='Entrada';cls='color:var(--green)';deltaStr=qty!=null?'<span style="'+cls+';font-weight:700">+'+fnum(qty)+' '+_eunit+'</span>':'—';}
        else if(row.action==='Saída Embalagem'){const m2=det.match(/-([0-9.,]+)/);const qty=m2?parseFloat(m2[1].replace(',','.')):null;if(qty!=null)totalSai+=qty;tipo='Saída';cls='color:var(--danger)';deltaStr=qty!=null?'<span style="'+cls+';font-weight:700">-'+fnum(qty)+' '+_eunit+'</span>':'—';}
        else{const m2=det.match(/([+-][0-9.,]+)/);const qty=m2?parseFloat(m2[1].replace(',','.')):null;tipo='Inventário';cls='color:var(--accent)';deltaStr=qty!=null?'<span style="'+cls+'">'+(qty>=0?'+':'')+fnum(qty)+' '+_eunit+'</span>':'—';}
        return'<tr><td style="font-size:12px;white-space:nowrap;color:var(--muted)">'+dtStr+'</td><td><span style="'+cls+'">'+tipo+'</span></td><td style="text-align:center">'+deltaStr+'</td><td style="font-size:12px;color:var(--muted)">'+esc(row.uname||'—')+'</td></tr>';
      }).join('');
      html=_histKpiBar(totalEnt,totalSai,stockNow,_eunit)+
        '<div class="tw" style="max-height:360px;overflow-y:auto"><table><thead><tr><th>Data/Hora</th><th>Tipo</th><th style="text-align:center">Qtd</th><th>Usuário</th></tr></thead><tbody>'+trs+'</tbody></table></div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:8px">'+filtered.length+' registro(s)</div>';
    }
    const bodyEl=el('hist-emb-body');if(bodyEl)bodyEl.innerHTML=html;
  }catch(e2){const bodyEl=el('hist-emb-body');if(bodyEl)bodyEl.innerHTML='<div style="color:var(--danger);padding:20px">Erro: '+esc(String(e2))+'</div>';}
}

window.openEntradaEmb=openEntradaEmb;window.submitEntradaEmb=submitEntradaEmb;
window.openSaidaEmb=openSaidaEmb;window.submitSaidaEmb=submitSaidaEmb;
window.openInventarioEmb=openInventarioEmb;window.submitInventarioEmb=submitInventarioEmb;
window.openHistoricoEmb=openHistoricoEmb;

// ═══════════════════════════════════════════════════════════════════════════
// ── REQUISIÇÕES DE MATERIAL ──
// ═══════════════════════════════════════════════════════════════════════════
function _nextReqNum(d){
  const reqs=d.requisicoes||[];
  const nums=reqs.map(r=>parseInt((r.num||'').replace(/\D/g,''))||0);
  return'REQ-'+String((Math.max(0,...nums)+1)).padStart(3,'0');
}

function renderRequisicoes(){
  const c=el('sup-c');if(!c)return;
  const d=gdb();
  const reqs=(d.requisicoes||[]).slice().sort((a,b)=>b.createdAt-a.createdAt);
  c.innerHTML=
    '<div class="card"><div class="card-header">'+
    '<div><div class="card-title">📝 Requisições de Material</div>'+
    '<div style="font-size:13px;color:var(--muted)">Retiradas de MP e Embalagens com múltiplos itens</div></div>'+
    '<button class="btn btn-green btn-sm" onclick="openNovaRequisicao()">+ Nova Requisição</button>'+
    '</div>'+
    (reqs.length?
      '<div class="tw"><table><thead><tr><th>Nº</th><th>Data/Hora</th><th>Responsável</th><th>OP Vinculada</th><th>Itens</th><th></th></tr></thead><tbody>'+
      reqs.map(r=>{
        const dt=new Date(r.createdAt);
        return'<tr>'+
          '<td><strong>'+esc(r.num)+'</strong></td>'+
          '<td style="font-size:12px;color:var(--muted)">'+dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</td>'+
          '<td>'+esc(r.createdBy||'—')+'</td>'+
          '<td>'+(r.opNum?'<span class="bs bs-pendente" style="font-size:11px">'+esc(r.opNum)+'</span>':'<span style="color:var(--muted);font-size:12px">—</span>')+'</td>'+
          '<td style="text-align:center">'+(r.items||[]).length+' item(s)</td>'+
          '<td><button class="btn btn-ghost btn-sm" onclick="viewRequisicao(\''+r.id+'\')">Ver</button></td>'+
        '</tr>';
      }).join('')+
      '</tbody></table></div>'
    :'<div class="empty"><div class="ei">📝</div><p>Nenhuma requisição registrada ainda</p></div>')+
    '</div>';
}
window.renderRequisicoes=renderRequisicoes;

// Estado global da nova requisição
window._reqItems=[];

function openNovaRequisicao(){
  const d=gdb();
  window._reqItems=[];
  const num=_nextReqNum(d);
  const now=new Date();
  const dtStr=now.toLocaleString('pt-BR');
  const ops=d.ops.filter(o=>!o.archived&&o.status==='ativo').map(o=>'<option value="'+o.id+'" data-num="'+esc(o.opNum||o.id)+'">OP-'+esc(o.opNum||o.id)+(o.clientName?' — '+esc(o.clientName):'')+'</option>').join('');
  Mopen('📝 Nova Requisição de Material','mwd',
    '<div class="fgrid" style="margin-bottom:12px">'+
    '<div class="fg"><label>Número</label><input type="text" class="sinput" value="'+num+'" readonly style="background:var(--bg2);color:var(--muted)"></div>'+
    '<div class="fg"><label>Data/Hora</label><input type="text" class="sinput" value="'+dtStr+'" readonly style="background:var(--bg2);color:var(--muted)"></div>'+
    '<div class="fg"><label>Responsável</label><input type="text" class="sinput" value="'+esc(S?S.name:'')+'" readonly style="background:var(--bg2);color:var(--muted)"></div>'+
    '</div>'+
    '<div class="fg"><label>Vincular a OP (opcional)</label><select class="sselect" id="req-op"><option value="">Nenhuma (requisição avulsa)</option>'+ops+'</select></div>'+
    '<div style="margin-top:16px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
    '<label style="font-size:14px;font-weight:600">Itens da Requisição</label>'+
    '<button class="btn btn-ghost btn-sm" onclick="_reqAddItem()">+ Adicionar Item</button>'+
    '</div>'+
    '<div id="req-items-list"></div>'+
    '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitNovaRequisicao(\''+num+'\')">✅ Confirmar Requisição</button>',
    'mwd'
  );
  _reqAddItem();
}
window.openNovaRequisicao=openNovaRequisicao;

function _reqRenderItems(){
  const d=gdb();const t=el('req-items-list');if(!t)return;
  if(!window._reqItems.length){
    t.innerHTML='<div style="padding:12px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed var(--border);border-radius:6px">Nenhum item adicionado</div>';
    return;
  }
  const mpOpts=d.rawMaterials.map(m=>'<option value="RM:'+m.id+'">'+esc(m.code||m.name)+' — '+esc(m.name)+'</option>').join('');
  const pkOpts=d.packaging.map(p=>'<option value="PK:'+p.id+'">'+esc(p.code||p.name)+' — '+esc(p.name)+'</option>').join('');
  t.innerHTML='<div style="display:flex;flex-direction:column;gap:8px">'+
    window._reqItems.map((it,i)=>{
      const isMP=it.type==='MP';
      const typeOpts='<option value="MP"'+(isMP?' selected':'')+'>🌿 Matéria-Prima</option><option value="PK"'+(!isMP?' selected':'')+'>📦 Embalagem</option>';
      const itemOpts=isMP?mpOpts:pkOpts;
      const selVal=it.itemId||'';
      const unit=it.unit||'KG';
      return'<div style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;display:flex;gap:8px;align-items:flex-end">'+
        '<div class="fg" style="min-width:100px;margin:0">'+
        '<label style="font-size:11px;color:var(--muted)">Tipo</label>'+
        '<select class="sselect" onchange="window._reqItems['+i+'].type=this.value;window._reqItems['+i+'].itemId=\'\';_reqRenderItems()">'+typeOpts+'</select>'+
        '</div>'+
        '<div class="fg" style="flex:1;margin:0">'+
        '<label style="font-size:11px;color:var(--muted)">Item</label>'+
        '<select class="sselect" onchange="_reqPickItem('+i+',this.value)"><option value="">Selecione...</option>'+itemOpts+'</select>'+
        '</div>'+
        '<div class="fg" style="min-width:80px;margin:0">'+
        '<label style="font-size:11px;color:var(--muted)">Qtd ('+unit+')</label>'+
        '<input type="number" class="sinput" min="0.001" step="0.001" value="'+it.qty+'" oninput="window._reqItems['+i+'].qty=+this.value||0">'+
        '</div>'+
        '<button class="btn btn-danger btn-sm" onclick="window._reqItems.splice('+i+',1);_reqRenderItems()" style="margin-bottom:1px">🗑️</button>'+
      '</div>';
    }).join('')+'</div>';
  // Restore selected values
  window._reqItems.forEach((it,i)=>{
    const sel=t.querySelectorAll('select')[i*2+1];
    if(sel&&it.itemId)sel.value=it.itemId;
  });
}
function _reqAddItem(){
  window._reqItems.push({type:'MP',itemId:'',qty:1,unit:'KG'});
  _reqRenderItems();
}
window._reqAddItem=_reqAddItem;
function _reqPickItem(i,val){
  window._reqItems[i].itemId=val;
  const d=gdb();
  if(val.startsWith('RM:')){const m=d.rawMaterials.find(x=>x.id===val.slice(3));if(m)window._reqItems[i].unit=m.unit||'KG';}
  else if(val.startsWith('PK:')){const p=d.packaging.find(x=>x.id===val.slice(3));if(p)window._reqItems[i].unit=p.unit||'UN';}
  _reqRenderItems();
}
window._reqPickItem=_reqPickItem;

async function submitNovaRequisicao(num){
  const items=window._reqItems.filter(it=>it.itemId&&it.qty>0);
  if(!items.length){toast('Adicione ao menos 1 item com quantidade','err');return;}
  const d=gdb();
  const opSel=el('req-op');
  const opId=opSel?opSel.value:'';
  const opNum=opId?(d.ops.find(o=>o.id===opId)||{}).opNum||opId:'';
  const req={id:_nid(),num,createdAt:Date.now(),createdBy:S?S.name:'',opId,opNum,status:'confirmada',items};
  if(!d.requisicoes)d.requisicoes=[];
  d.requisicoes.push(req);
  // Debitar estoque de cada item
  let errs=[];
  for(const it of items){
    try{
      if(it.type==='MP'){
        const mid=it.itemId.slice(3);
        const st=d.rawMaterialStock[mid]||{total:0,bySupplier:{}};
        // Saída sem fornecedor específico: débita do primeiro disponível
        const sid=Object.keys(st.bySupplier||{}).find(k=>(st.bySupplier[k]||0)>=it.qty)||Object.keys(st.bySupplier||{})[0]||'';
        await _rpcRMAdjust(mid,sid,-it.qty);
        d.rawMaterialMovements.push({id:_nid(),type:'saida',itemId:mid,supplierId:sid,qty:it.qty,reqNum:num,date:new Date().toISOString().slice(0,10),obs:'REQ: '+num+(opNum?' / '+opNum:''),createdAt:Date.now(),createdBy:S?S.name:''});
        logAction(d,'Saída MP (Req)',_rmName(d,mid)+' -'+it.qty+' '+it.unit+' ['+num+']');
      }else{
        const pid=it.itemId.slice(3);
        await _rpcPKAdjust(pid,-it.qty);
        d.packagingMovements.push({id:_nid(),type:'saida',itemId:pid,qty:it.qty,reqNum:num,date:new Date().toISOString().slice(0,10),obs:'REQ: '+num+(opNum?' / '+opNum:''),createdAt:Date.now(),createdBy:S?S.name:''});
        logAction(d,'Saída Embalagem (Req)',_embName(d,pid)+' -'+it.qty+' '+it.unit+' ['+num+']');
      }
    }catch(e){errs.push(it.itemId+': '+e.message);}
  }
  sdb(d);Mclose();
  if(errs.length)toast('Requisição salva com erros em '+errs.length+' item(s). Verifique o estoque.','warn');
  else toast('Requisição '+num+' confirmada!','ok');
  renderRequisicoes();
}
window.submitNovaRequisicao=submitNovaRequisicao;

function viewRequisicao(id){
  const d=gdb();const r=(d.requisicoes||[]).find(x=>x.id===id);if(!r)return;
  const dt=new Date(r.createdAt);
  Mopen('📝 '+r.num,
    '<div class="fgrid" style="margin-bottom:12px">'+
    '<div class="fg"><label>Data/Hora</label><div class="fg-val">'+dt.toLocaleString('pt-BR')+'</div></div>'+
    '<div class="fg"><label>Responsável</label><div class="fg-val">'+esc(r.createdBy||'—')+'</div></div>'+
    (r.opNum?'<div class="fg"><label>OP Vinculada</label><div class="fg-val">'+esc(r.opNum)+'</div></div>':'')+'</div>'+
    '<div class="tw"><table><thead><tr><th>Tipo</th><th>Item</th><th>Qtd</th><th>Un.</th></tr></thead><tbody>'+
    (r.items||[]).map(it=>{
      let name='';
      if(it.type==='MP'){const m=d.rawMaterials.find(x=>x.id===it.itemId.slice(3));name=m?m.name:it.itemId;}
      else{const p=d.packaging.find(x=>x.id===it.itemId.slice(3));name=p?p.name:it.itemId;}
      return'<tr>'+
        '<td>'+_tipoBadge(it.type==='PK'?'emb':'mp')+'</td>'+
        '<td>'+esc(name)+'</td>'+
        '<td style="text-align:center">'+fnum(it.qty)+'</td>'+
        '<td style="color:var(--muted)">'+esc(it.unit||'')+'</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
}
window.viewRequisicao=viewRequisicao;

// ═══════════════════════════════════════════════════════════════════════════
// ── ENTRADAS DE NF (REGISTRO DE COMPRA) ──
// ═══════════════════════════════════════════════════════════════════════════
function renderEntradasNF(){
  const c=el('sup-c');if(!c)return;
  const d=gdb();
  const compras=(d.compras||[]).slice().sort((a,b)=>b.createdAt-a.createdAt);
  c.innerHTML=
    '<div class="card"><div class="card-header">'+
    '<div><div class="card-title">🧾 Entradas de Nota Fiscal</div>'+
    '<div style="font-size:13px;color:var(--muted)">Registro de entrada de estoque por nota fiscal</div></div>'+
    '<button class="btn btn-green btn-sm" onclick="openNovaEntradaNF()">+ Nova Entrada de NF</button>'+
    '</div>'+
    (compras.length?
      '<div class="tw"><table><thead><tr><th>Nº NF</th><th>Data/Hora</th><th>Fornecedor</th><th>Responsável</th><th>Itens</th><th></th></tr></thead><tbody>'+
      compras.map(c2=>{
        const dt=new Date(c2.createdAt);
        return'<tr>'+
          '<td><strong>'+esc(c2.nfe||'—')+'</strong>'+(c2.ocNum?'<br><span style="font-size:11px;color:var(--muted)">OC: '+esc(c2.ocNum)+'</span>':'')+'</td>'+
          '<td style="font-size:12px;color:var(--muted)">'+dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</td>'+
          '<td>'+esc(c2.supplierName||'—')+'</td>'+
          '<td>'+esc(c2.createdBy||'—')+'</td>'+
          '<td style="text-align:center">'+(c2.items||[]).length+' item(s)</td>'+
          '<td><button class="btn btn-ghost btn-sm" onclick="viewEntradaNF(\''+c2.id+'\')">Ver</button></td>'+
        '</tr>';
      }).join('')+
      '</tbody></table></div>'
    :'<div class="empty"><div class="ei">🧾</div><p>Nenhuma entrada de NF registrada ainda</p></div>')+
    '</div>';
}
window.renderEntradasNF=renderEntradasNF;

window._nfItems=[];

function openNovaEntradaNF(){
  const d=gdb();
  window._nfItems=[];
  const suppOpts=d.suppliers.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');
  Mopen('🧾 Nova Entrada de Nota Fiscal',
    '<div class="fgrid">'+
    '<div class="fg"><label>Nº da Nota Fiscal *</label><input type="text" class="sinput" id="nf-num" placeholder="Ex: 000123456"></div>'+
    '<div class="fg"><label>Nº Pedido de Compra</label><input type="text" class="sinput" id="nf-oc" placeholder="Ex: OC-001 (opcional)"></div>'+
    '</div>'+
    '<div class="fg"><label>Fornecedor *</label><select class="sselect" id="nf-supp"><option value="">Selecione o fornecedor...</option>'+suppOpts+'</select></div>'+
    '<div style="margin-top:16px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
    '<label style="font-size:14px;font-weight:600">Itens da NF</label>'+
    '<button class="btn btn-ghost btn-sm" onclick="_nfAddItem()">+ Adicionar Item</button>'+
    '</div>'+
    '<div id="nf-items-list"></div>'+
    '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitNovaEntradaNF()">✅ Confirmar Entrada</button>',
    'mwd'
  );
  _nfAddItem();
}
window.openNovaEntradaNF=openNovaEntradaNF;

function _nfRenderItems(){
  const d=gdb();const t=el('nf-items-list');if(!t)return;
  if(!window._nfItems.length){
    t.innerHTML='<div style="padding:12px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed var(--border);border-radius:6px">Nenhum item adicionado</div>';
    return;
  }
  const mpOpts=d.rawMaterials.map(m=>'<option value="RM:'+m.id+'">'+esc(m.code||'')+' '+esc(m.name)+'</option>').join('');
  const pkOpts=d.packaging.map(p=>'<option value="PK:'+p.id+'">'+esc(p.code||'')+' '+esc(p.name)+'</option>').join('');
  t.innerHTML='<div style="display:flex;flex-direction:column;gap:8px">'+
    window._nfItems.map((it,i)=>{
      const isMP=it.type==='MP';
      const typeOpts='<option value="MP"'+(isMP?' selected':'')+'>🌿 MP</option><option value="PK"'+(!isMP?' selected':'')+'>📦 Embalagem</option>';
      return'<div style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;display:flex;gap:8px;align-items:flex-end">'+
        '<div class="fg" style="min-width:90px;margin:0"><label style="font-size:11px;color:var(--muted)">Tipo</label>'+
        '<select class="sselect" onchange="window._nfItems['+i+'].type=this.value;window._nfItems['+i+'].itemId=\'\';_nfRenderItems()">'+typeOpts+'</select></div>'+
        '<div class="fg" style="flex:1;margin:0"><label style="font-size:11px;color:var(--muted)">Item</label>'+
        '<select class="sselect" onchange="_nfPickItem('+i+',this.value)"><option value="">Selecione...</option>'+(isMP?mpOpts:pkOpts)+'</select></div>'+
        '<div class="fg" style="min-width:80px;margin:0"><label style="font-size:11px;color:var(--muted)">Qtd ('+esc(it.unit||'KG')+')</label>'+
        '<input type="number" class="sinput" min="0.001" step="0.001" value="'+it.qty+'" oninput="window._nfItems['+i+'].qty=+this.value||0"></div>'+
        '<button class="btn btn-danger btn-sm" onclick="window._nfItems.splice('+i+',1);_nfRenderItems()" style="margin-bottom:1px">🗑️</button>'+
      '</div>';
    }).join('')+'</div>';
  window._nfItems.forEach((it,i)=>{
    const sel=t.querySelectorAll('select')[i*2+1];
    if(sel&&it.itemId)sel.value=it.itemId;
  });
}
function _nfAddItem(){
  window._nfItems.push({type:'MP',itemId:'',qty:1,unit:'KG'});
  _nfRenderItems();
}
window._nfAddItem=_nfAddItem;
function _nfPickItem(i,val){
  window._nfItems[i].itemId=val;
  const d=gdb();
  if(val.startsWith('RM:')){const m=d.rawMaterials.find(x=>x.id===val.slice(3));if(m)window._nfItems[i].unit=m.unit||'KG';}
  else if(val.startsWith('PK:')){const p=d.packaging.find(x=>x.id===val.slice(3));if(p)window._nfItems[i].unit=p.unit||'UN';}
  _nfRenderItems();
}
window._nfPickItem=_nfPickItem;

async function submitNovaEntradaNF(){
  const nfe=v('nf-num').trim(),ocNum=v('nf-oc').trim(),sid=v('nf-supp');
  if(!nfe){toast('Informe o número da NF','err');return;}
  if(!sid){toast('Selecione o fornecedor','err');return;}
  const items=window._nfItems.filter(it=>it.itemId&&it.qty>0);
  if(!items.length){toast('Adicione ao menos 1 item','err');return;}
  const d=gdb();
  const sup=d.suppliers.find(x=>x.id===sid);
  const compra={id:_nid(),nfe,ocNum,supplierId:sid,supplierName:sup?sup.name:'',createdAt:Date.now(),createdBy:S?S.name:'',items};
  if(!d.compras)d.compras=[];
  d.compras.push(compra);
  let errs=[];
  for(const it of items){
    try{
      if(it.type==='MP'){
        const mid=it.itemId.slice(3);
        await _rpcRMAdjust(mid,sid,it.qty);
        d.rawMaterialMovements.push({id:_nid(),type:'entrada',itemId:mid,supplierId:sid,qty:it.qty,nfNum:nfe,date:new Date().toISOString().slice(0,10),obs:'NF: '+nfe+(ocNum?' / '+ocNum:''),createdAt:Date.now(),createdBy:S?S.name:''});
        logAction(d,'Entrada MP (NF)',_rmName(d,mid)+' +'+it.qty+' '+it.unit+' [NF '+nfe+']');
      }else{
        const pid=it.itemId.slice(3);
        await _rpcPKAdjust(pid,it.qty);
        d.packagingMovements.push({id:_nid(),type:'entrada',itemId:pid,qty:it.qty,nfNum:nfe,date:new Date().toISOString().slice(0,10),obs:'NF: '+nfe+(ocNum?' / '+ocNum:''),createdAt:Date.now(),createdBy:S?S.name:''});
        logAction(d,'Entrada Embalagem (NF)',_embName(d,pid)+' +'+it.qty+' '+it.unit+' [NF '+nfe+']');
      }
    }catch(e){errs.push(it.itemId+': '+e.message);}
  }
  sdb(d);Mclose();
  if(errs.length)toast('Entrada salva com erros em '+errs.length+' item(s).','warn');
  else toast('Entrada NF '+nfe+' registrada!','ok');
  renderEntradasNF();
}
window.submitNovaEntradaNF=submitNovaEntradaNF;

function viewEntradaNF(id){
  const d=gdb();const c=(d.compras||[]).find(x=>x.id===id);if(!c)return;
  const dt=new Date(c.createdAt);
  Mopen('🧾 NF '+esc(c.nfe),
    '<div class="fgrid" style="margin-bottom:12px">'+
    '<div class="fg"><label>Fornecedor</label><div class="fg-val">'+esc(c.supplierName||'—')+'</div></div>'+
    '<div class="fg"><label>Data/Hora</label><div class="fg-val">'+dt.toLocaleString('pt-BR')+'</div></div>'+
    (c.ocNum?'<div class="fg"><label>Pedido de Compra</label><div class="fg-val">'+esc(c.ocNum)+'</div></div>':'')+
    '<div class="fg"><label>Registrado por</label><div class="fg-val">'+esc(c.createdBy||'—')+'</div></div>'+
    '</div>'+
    '<div class="tw"><table><thead><tr><th>Tipo</th><th>Item</th><th>Qtd</th><th>Un.</th></tr></thead><tbody>'+
    (c.items||[]).map(it=>{
      let name='';
      if(it.type==='MP'){const m=d.rawMaterials.find(x=>x.id===it.itemId.slice(3));name=m?m.name:it.itemId;}
      else{const p=d.packaging.find(x=>x.id===it.itemId.slice(3));name=p?p.name:it.itemId;}
      return'<tr>'+
        '<td>'+_tipoBadge(it.type==='PK'?'emb':'mp')+'</td>'+
        '<td>'+esc(name)+'</td>'+
        '<td style="text-align:center">'+fnum(it.qty)+'</td>'+
        '<td style="color:var(--muted)">'+esc(it.unit||'')+'</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
  );
}
window.viewEntradaNF=viewEntradaNF;

// ═══════════════════════════════════════════════════════════════════════════
// ── ESTOQUE DE PREFORMADOS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
function renderSupPref(){
  const c=el('sup-c');if(!c)return;
  c.innerHTML=
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">'+
    '<input class="sinput" id="pref-sup-srch" placeholder="🔍 Buscar preformado..." oninput="_renderPrefSupRows()" style="flex:1">'+
    '<button class="btn btn-green btn-sm" onclick="openEntradaPref()">➕ Registrar Entrada</button>'+
    '</div>'+
    '<div id="pref-sup-table"></div>';
  _renderPrefSupRows();
}
window.renderSupPref=renderSupPref;

function _renderPrefSupRows(){
  const q=(v('pref-sup-srch')||'').toLowerCase();
  const d=gdb();const prefs=(d.preformados||[]).filter(p=>!q||(p.name||'').toLowerCase().includes(q));
  const stock=d.preformadosStock||{};
  const t=el('pref-sup-table');if(!t)return;
  if(!prefs.length){
    t.innerHTML='<div class="empty"><div class="ei">🧵</div><div>Nenhum preformado cadastrado<br><span style="font-size:12px;color:var(--muted)">Cadastre em Cadastros → Preformados</span></div></div>';
    return;
  }
  t.innerHTML='<table><thead><tr><th>Nome</th><th>Em estoque</th><th>Local</th><th>Prateleira</th><th></th></tr></thead><tbody>'+
    prefs.map(p=>{
      const s=stock[p.id]||{qty:0};
      const cl=s.qty>0?'color:var(--green)':'color:var(--danger)';
      return'<tr>'+
        '<td style="font-size:13px;font-weight:600">'+esc(p.name)+'</td>'+
        '<td style="font-weight:700;'+cl+'">'+fnum(s.qty||0)+' un.</td>'+
        '<td style="font-size:12px;color:var(--muted)">'+esc(s.local||'—')+'</td>'+
        '<td style="font-size:12px;color:var(--muted)">'+esc(s.prateleira||'—')+'</td>'+
        '<td style="white-space:nowrap">'+
          '<button class="btn btn-ghost btn-sm" onclick="openEntradaPref(\''+p.id+'\')">➕ Entrada</button> '+
          '<button class="btn btn-ghost btn-sm" onclick="openSaidaPref(\''+p.id+'\')">➖ Saída</button> '+
          '<button class="btn btn-ghost btn-sm" onclick="openHistoricoPref(\''+p.id+'\')">🕐</button>'+
        '</td>'+
      '</tr>';
    }).join('')+'</tbody></table>';
}
window._renderPrefSupRows=_renderPrefSupRows;

function openEntradaPref(prefId){
  const d=gdb();const prefs=d.preformados||[];
  const prefOpts=prefs.map(p=>'<option value="'+p.id+'"'+(prefId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  const s=prefId?(d.preformadosStock||{})[prefId]||{}:{};
  Mopen('➕ Entrada de Preformado',
    '<div class="fg"><label>Preformado *</label><select id="prf-ent-id" class="sinput"><option value="">Selecionar...</option>'+prefOpts+'</select></div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Quantidade *</label><input type="number" id="prf-ent-qty" min="1" class="sinput" placeholder="Ex: 10"></div>'+
    '<div class="fg"><label>Local</label><input type="text" id="prf-ent-local" class="sinput" value="'+esc(s.local||'')+'" placeholder="Ex: Galpão A"></div>'+
    '<div class="fg"><label>Prateleira</label><input type="text" id="prf-ent-prat" class="sinput" value="'+esc(s.prateleira||'')+'" placeholder="Ex: 3.2.1"></div>'+
    '</div>'+
    '<div class="fg"><label>Obs / Origem (ex: Sobra OP-1234)</label><input type="text" id="prf-ent-obs" class="sinput" placeholder="Opcional"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitEntradaPref()">✅ Registrar</button>');
}
window.openEntradaPref=openEntradaPref;

function submitEntradaPref(){
  const pid=v('prf-ent-id');const qty=parseInt(v('prf-ent-qty')||0);
  if(!pid){toast('Selecione um preformado','err');return;}
  if(!qty||qty<1){toast('Quantidade inválida','err');return;}
  const local=(v('prf-ent-local')||'').trim();const prat=(v('prf-ent-prat')||'').trim();
  const obs=(v('prf-ent-obs')||'').trim();
  Mclose();
  const d=gdb();if(!d.preformadosStock)d.preformadosStock={};
  const prev=d.preformadosStock[pid]||{qty:0};
  d.preformadosStock[pid]={qty:(prev.qty||0)+qty,local:local||prev.local||'',prateleira:prat||prev.prateleira||'',updatedAt:Date.now()};
  const prf=(d.preformados||[]).find(x=>x.id===pid);
  logAction(d,'Entrada Preformado',(prf?prf.name:pid)+' +'+qty+' un.'+(obs?' · '+obs:''));
  sdb(d);toast('Entrada registrada: +'+qty+' un.','ok');_renderPrefSupRows();
}
window.submitEntradaPref=submitEntradaPref;

function openSaidaPref(prefId){
  const d=gdb();const s=(d.preformadosStock||{})[prefId]||{qty:0};
  const prf=(d.preformados||[]).find(x=>x.id===prefId);
  if(!prf){toast('Preformado não encontrado','err');return;}
  Mopen('➖ Saída de Preformado',
    '<div class="fg"><label>Preformado</label><div style="font-size:13px;font-weight:600;padding:8px 0">'+esc(prf.name)+'</div></div>'+
    '<div class="fg"><label>Disponível: <strong>'+fnum(s.qty||0)+' un.</strong></label></div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Quantidade *</label><input type="number" id="prf-sai-qty" min="1" max="'+fnum(s.qty||0)+'" class="sinput" placeholder="Ex: 5"></div>'+
    '<div class="fg"><label>Obs / Destino (ex: OP-1234)</label><input type="text" id="prf-sai-obs" class="sinput" placeholder="Opcional"></div>'+
    '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="submitSaidaPref(\''+prefId+'\')">✅ Registrar Saída</button>');
}
window.openSaidaPref=openSaidaPref;

function submitSaidaPref(prefId){
  const qty=parseInt(v('prf-sai-qty')||0);const obs=(v('prf-sai-obs')||'').trim();
  if(!qty||qty<1){toast('Quantidade inválida','err');return;}
  const d=gdb();if(!d.preformadosStock)d.preformadosStock={};
  const prev=d.preformadosStock[prefId]||{qty:0};
  if(qty>(prev.qty||0)){toast('Quantidade maior que o estoque disponível','err');return;}
  d.preformadosStock[prefId]={...prev,qty:(prev.qty||0)-qty,updatedAt:Date.now()};
  const prf=(d.preformados||[]).find(x=>x.id===prefId);
  logAction(d,'Saída Preformado',(prf?prf.name:prefId)+' -'+qty+' un.'+(obs?' · '+obs:''));
  Mclose();sdb(d);toast('Saída registrada: -'+qty+' un.','ok');_renderPrefSupRows();
}
window.submitSaidaPref=submitSaidaPref;

async function openHistoricoPref(prefId){
  const d=gdb();const prf=(d.preformados||[]).find(x=>x.id===prefId);if(!prf)return;
  const s=(d.preformadosStock||{})[prefId]||{qty:0};
  Mopen('🕐 Histórico — '+esc(prf.name),
    '<div id="hist-pref-body" style="min-height:120px"><div style="text-align:center;padding:40px;color:var(--muted)">🔄 Carregando...</div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>');
  try{
    const nameQ=encodeURIComponent('*'+prf.name+'*');
    const r=await _sf('/rest/v1/'+_AUDIT_TABLE+'?select=*&details=ilike.'+nameQ+'&order=at.desc&limit=200');
    if(!r.ok)throw new Error(await r.text());
    const rows=await r.json();
    const filtered=rows.filter(row=>row.action&&row.action.includes('Preformado'));
    let totalEnt=0,totalSai=0;
    const trs=filtered.map(row=>{
      const dt=new Date(row.at);
      const dtStr=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const det=row.details||'';
      let tipo='',cl='color:var(--muted)',delta='—';
      if(row.action==='Entrada Preformado'){const m=det.match(/\+(\d+)/);const q=m?+m[1]:null;if(q)totalEnt+=q;tipo='Entrada';cl='color:var(--green)';delta=q!=null?'<span style="'+cl+';font-weight:700">+'+q+' un.</span>':'—';}
      else if(row.action==='Saída Preformado'||row.action.includes('Parcial')){const m=det.match(/-(\d+)/);const q=m?+m[1]:null;if(q)totalSai+=q;tipo='Saída';cl='color:var(--danger)';delta=q!=null?'<span style="'+cl+';font-weight:700">-'+q+' un.</span>':'—';}
      else{tipo=row.action;delta=det;}
      return'<tr><td style="font-size:12px;white-space:nowrap;color:var(--muted)">'+dtStr+'</td>'+
        '<td><span style="'+cl+'">'+tipo+'</span></td>'+
        '<td style="text-align:center">'+delta+'</td>'+
        '<td style="font-size:12px;color:var(--muted)">'+esc(row.uname||'—')+'</td>'+
        '<td style="font-size:11px;color:var(--muted)">'+esc(det)+'</td></tr>';
    }).join('');
    const kpi='<div style="display:flex;gap:20px;margin-bottom:14px;flex-wrap:wrap">'+
      '<div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--green)">'+fnum(totalEnt)+'</div><div style="font-size:11px;color:var(--muted)">Total entradas</div></div>'+
      '<div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--danger)">'+fnum(totalSai)+'</div><div style="font-size:11px;color:var(--muted)">Total saídas</div></div>'+
      '<div style="text-align:center"><div style="font-size:20px;font-weight:700">'+fnum(s.qty||0)+'</div><div style="font-size:11px;color:var(--muted)">Estoque atual</div></div>'+
      (s.local?'<div style="text-align:center"><div style="font-size:13px;font-weight:600">'+esc(s.local)+'</div><div style="font-size:11px;color:var(--muted)">Local · Prat. '+esc(s.prateleira||'—')+'</div></div>':'')+
      '</div>';
    const bodyEl=el('hist-pref-body');
    if(bodyEl)bodyEl.innerHTML=kpi+(filtered.length
      ?'<div class="tw" style="max-height:320px;overflow-y:auto"><table><thead><tr><th>Data/Hora</th><th>Tipo</th><th>Qtd</th><th>Usuário</th><th>Detalhe</th></tr></thead><tbody>'+trs+'</tbody></table></div>'
      :'<div class="empty" style="margin:0"><div class="ei" style="font-size:24px">🕐</div><div>Nenhum movimento registrado</div></div>');
  }catch(e2){const b=el('hist-pref-body');if(b)b.innerHTML='<div style="color:var(--danger);padding:20px">Erro: '+esc(String(e2))+'</div>';}
}
window.openHistoricoPref=openHistoricoPref;
