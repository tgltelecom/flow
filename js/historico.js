// ═══════════════════════════════════════════════════════════════════════════
// historico.js — Histórico de OPs, visualização e cancelamento
// v2.0 TGL Flow
// ═══════════════════════════════════════════════════════════════════════════

// Helpers de despacho (replicados de expedicao.js para uso em modal de visualização)
function _itemFullyDisp(item){return(item.partiallyDispatched&&!item.qtyDispatched)||(item.qtyDispatched||0)>=item.qty;}

let _histSort={col:'deliveryDate',dir:1};
const HIST_LIMIT=20;

function _setHistSort(col){
  if(_histSort.col===col)_histSort.dir*=-1;else{_histSort.col=col;_histSort.dir=1;}
  _refreshHistTable();
}
function _sArrH(col){return _histSort.col===col?(_histSort.dir===1?' ▲':' ▼'):'<span style="opacity:.3"> ⇅</span>';}
window._setHistSort=_setHistSort;

function rHistorico(cnt){
  autoArchive();
  cnt.innerHTML='<div class="ptitle">📋 Histórico de OPs</div><div id="hist-shell"></div>';
  _buildHistShell();
  _refreshHistTable();
}

function _buildHistShell(){
  const s=el('hist-shell');if(!s)return;
  if(el('hist-tbl'))return;
  s.innerHTML='<div class="card">'+
    '<div class="card-header">'+
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:1">'+
    '<input type="text" class="sinput" id="hf-q" placeholder="🔍 Buscar pedido ou cliente..." style="flex:1;min-width:200px" oninput="_refreshHistTable()">'+
    '<select class="sselect" id="hf-status" onchange="_refreshHistTable()">'+
    '<option value="">Todos</option>'+
    '<option value="ativo">Ativas</option>'+
    '<option value="finalizado">Finalizadas</option>'+
    '<option value="cancelado">Canceladas</option>'+
    '<option value="archived">Arquivadas</option>'+
    '</select></div></div>'+
    '<div class="tw" id="hist-tbl"></div></div>';
}

function _refreshHistTable(){
  _buildHistShell();
  const d=gdb();
  const flt=(el('hf-status')||{value:''}).value;
  const q=(el('hf-q')||{value:''}).value.trim().toLowerCase();
  let ops=[...d.ops].filter(o=>{
    if(flt==='archived'&&!(o.archived&&o.status!=='cancelado'))return false;
    if(flt==='ativo'&&!(o.status==='ativo'&&!o.archived))return false;
    if(flt==='finalizado'&&!(o.status==='finalizado'&&!o.archived))return false;
    if(flt==='cancelado'&&o.status!=='cancelado')return false;
    if(q&&!(o.opNum.toLowerCase().includes(q)||(o.clientName||'').toLowerCase().includes(q)))return false;
    return true;
  });
  ops.sort((a,b)=>{
    const col=_histSort.col,dir=_histSort.dir;
    if(col==='opNum')return dir*(a.opNum||'').localeCompare(b.opNum||'');
    if(col==='clientName')return dir*(a.clientName||'').localeCompare(b.clientName||'');
    if(col==='createdAt')return dir*((a.createdAt||0)-(b.createdAt||0));
    if(col==='status'){const sv=x=>x.archived?2:x.status==='finalizado'?1:0;return dir*(sv(a)-sv(b));}
    return dir*(new Date(a.deliveryDate)-new Date(b.deliveryDate));
  });
  let histLimited=false;
  if(!q){
    const byDate=[...ops].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const ids=new Set(byDate.slice(0,HIST_LIMIT).map(o=>o.id));
    if(ops.length>HIST_LIMIT){histLimited=true;ops=ops.filter(o=>ids.has(o.id));}
  }
  const tbl=el('hist-tbl');if(!tbl)return;
  if(!ops.length){tbl.innerHTML='<div class="empty"><div class="ei">📋</div><p>Nenhuma OP encontrada</p></div>';return;}
  tbl.innerHTML=(histLimited?'<div style="font-size:12px;color:var(--muted);padding:8px 4px 4px">📋 Exibindo as '+HIST_LIMIT+' OPs mais recentes. Use a busca acima para encontrar OPs anteriores.</div>':'')+
  '<table><thead><tr>'+
    '<th style="cursor:pointer" onclick="_setHistSort(\'opNum\')">Pedido '+_sArrH('opNum')+'</th>'+
    '<th style="cursor:pointer" onclick="_setHistSort(\'clientName\')">Cliente '+_sArrH('clientName')+'</th>'+
    '<th style="cursor:pointer" onclick="_setHistSort(\'deliveryDate\')">Entrega Prevista '+_sArrH('deliveryDate')+'</th>'+
    '<th>Última Liberação</th><th>Despacho</th>'+
    '<th style="cursor:pointer" onclick="_setHistSort(\'status\')">Status '+_sArrH('status')+'</th>'+
    '<th>Pontualidade</th>'+
    '<th style="cursor:pointer" onclick="_setHistSort(\'createdAt\')">Lançado '+_sArrH('createdAt')+'</th>'+
    '<th></th>'+
    '</tr></thead><tbody>'+
    ops.map(op=>{
      const stcls=op.archived?(op.status==='cancelado'?'bs-cancelado':'bs-arquivado'):op.status==='finalizado'?'bs-finalizado':'bs-ativo';
      const stlb=op.archived?(op.status==='cancelado'?'Cancelada':'Arquivada'):op.status==='finalizado'?'Finalizada':'Ativa';
      let lastLibAt=null;
      op.items.forEach(item=>{(item.stageLog||[]).forEach(l=>{if(l.status==='liberado'&&(!lastLibAt||l.at>lastLibAt))lastLibAt=l.at;});});
      const lastLibStr=lastLibAt?new Date(lastLibAt).toLocaleDateString('pt-BR'):'—';
      const dispStr=op.dispatchDate?fdate(op.dispatchDate):(op.finalAt?new Date(op.finalAt).toLocaleDateString('pt-BR'):'—');
      let pontBadge='<span style="color:var(--muted);font-size:12px">Em produção</span>';
      if(op.status==='finalizado'||op.archived){
        const planDate=op.deliveryDate?new Date(op.deliveryDate+'T23:59:59'):null;
        const dispD=op.dispatchDate?new Date(op.dispatchDate+'T23:59:59'):(op.finalAt?new Date(op.finalAt):null);
        if(planDate&&dispD){pontBadge=dispD<=planDate?'<span class="bs bs-liberado">✅ No prazo</span>':'<span class="bs" style="background:rgba(239,68,68,.15);color:var(--danger);border:1px solid rgba(239,68,68,.3)">⚠️ Atrasada</span>';}
      }else if(op.status==='ativo'&&op.deliveryDate){
        const nowD=new Date();nowD.setHours(0,0,0,0);const dl=new Date(op.deliveryDate+'T00:00:00');
        if(dl<nowD)pontBadge='<span class="bs" style="background:rgba(239,68,68,.15);color:var(--danger);border:1px solid rgba(239,68,68,.3)">🔴 Atrasada</span>';
        else pontBadge='<span style="color:var(--muted);font-size:12px">Em andamento</span>';
      }
      const partialTag=(op.partialDispatches&&op.partialDispatches.length?'<span class="bs bs-warn" style="margin-left:4px;font-size:10px">⚠️Parcial</span>':'');
      const crBy=op.createdByName
        ?('<strong style="font-size:12px">'+esc(op.createdByName)+'</strong>'+(op.createdAt?'<br><span style="font-size:10px;color:var(--muted)">'+new Date(op.createdAt).toLocaleDateString('pt-BR')+' '+new Date(op.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</span>':''))
        :'<span style="color:var(--muted);font-size:12px">—</span>';
      return'<tr><td><strong>#'+esc(op.opNum)+'</strong></td>'+
        '<td>'+esc(op.clientName)+'</td>'+
        '<td>'+fdate(op.deliveryDate)+' '+diasChip(op.deliveryDate,op.status)+'</td>'+
        '<td style="font-size:12px;color:var(--muted)">'+lastLibStr+'</td>'+
        '<td style="font-size:12px;color:var(--muted)">'+dispStr+'</td>'+
        '<td><span class="bs '+stcls+'">'+stlb+'</span>'+partialTag+'</td>'+
        '<td>'+pontBadge+'</td>'+
        '<td style="line-height:1.4">'+crBy+'</td>'+
        '<td><button class="btn btn-ghost btn-sm" onclick="viewOP(\''+op.id+'\')">Ver</button> '+
        (!op.archived&&op.status!=='finalizado'?'<button class="btn btn-danger btn-sm" onclick="cancelOP(\''+op.id+'\')">Cancelar</button>':'')+
        '</td></tr>';
    }).join('')+'</tbody></table>';
}
window._refreshHistTable=_refreshHistTable;window.rHistorico=rHistorico;

function viewOP(id){
  const d=gdb(),op=d.ops.find(o=>o.id===id);if(!op)return;
  const coletaLabel={redespacho_sp:'🚛 Redespacho SP',coleta_sorocaba:'📍 Coleta Sorocaba',retirar:'🚶 Retirar pessoalmente',transportadora:'🚚 Transportadora'}[op.coleta]||op.coleta;
  const finalDispStr=op.dispatchDate?fdate(op.dispatchDate)+(op.finalAt?' às '+new Date(op.finalAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''):(op.finalAt?new Date(op.finalAt).toLocaleDateString('pt-BR')+' às '+new Date(op.finalAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—');
  const crInfo=op.createdByName?('<span style="color:var(--muted);font-size:12px">Lançado por <strong>'+esc(op.createdByName)+'</strong>'+(op.createdAt?' em '+new Date(op.createdAt).toLocaleDateString('pt-BR')+' às '+new Date(op.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</span>'):'';
  const pdHtml=(op.partialDispatches&&op.partialDispatches.length)?
    '<div style="margin-bottom:14px;padding:10px 14px;background:var(--bg-input);border-radius:8px;font-size:12px">'+
    '<strong style="color:var(--muted)">Despachos parciais:</strong>'+
    op.partialDispatches.map((pd,pi)=>{const dt=new Date(pd.at);return'<div style="margin-top:5px;color:var(--sub)">📦 <strong>#'+(pi+1)+'</strong> '+fdate(pd.dispatchDate)+' às '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+(pd.nfeNumber?' · NF '+esc(pd.nfeNumber):'')+'</div>';}).join('')+'</div>':'';
  const isActiveOP=op.status==='ativo'&&!op.archived;
  const rows=op.items.map((i,idx)=>{
    const p=d.products.find(x=>x.id===i.pid);
    const fl=[i.etiqueta?'🏷️ Etiqueta c/ logo':'',i.caixa?'📦 Caixa':'',i.gravacao?'✏️ Gravação':''].filter(Boolean).join(' ');
    let itemDispStr='—';
    if(op.partialDispatches){
      const matches=[];
      op.partialDispatches.forEach(pd=>{
        if(pd.itemQtys){pd.itemQtys.forEach(q2=>{if(q2.idx===idx)matches.push(pd);});}
        else if(pd.itemIndices&&pd.itemIndices.includes(idx))matches.push(pd);
      });
      if(matches.length){const last=matches[matches.length-1];const dt=new Date(last.at);itemDispStr=fdate(last.dispatchDate)+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
    }
    if(itemDispStr==='—'&&op.finalAt&&(i.partiallyDispatched||_itemFullyDisp(i)))itemDispStr=new Date(op.finalAt).toLocaleDateString('pt-BR')+' '+new Date(op.finalAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const qDisp=i.qtyDispatched||0;
    const qDispStr=qDisp>0?'<span style="font-size:11px;color:var(--warn)">'+fnum(qDisp)+'/'+fnum(i.qty)+'</span>':fnum(i.qty);
    const actionBtns=isActiveOP
      ?'<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 7px;margin-right:4px" onclick="openEditOPItemQty(\''+op.id+'\','+idx+')" title="Editar quantidade">✏️</button>'+
        '<button class="btn btn-danger btn-sm" style="font-size:11px;padding:3px 7px" onclick="removeOPItem(\''+op.id+'\','+idx+')" title="Remover item">🗑️</button>'+
        '</td>'
      :'<td></td>';
    return'<tr><td>'+esc(p?p.name:i.productName)+'</td><td><span class="sku">'+esc(i.sku||'—')+'</span></td>'+
      '<td>'+qDispStr+'</td>'+
      '<td><span class="bs '+stclass(i.status)+'">'+stlabel(i.status)+'</span></td>'+
      '<td style="font-size:12px">'+esc(i.obs||'—')+'</td>'+
      '<td style="font-size:12px">'+(fl||'—')+'</td>'+
      '<td style="font-size:11px;color:var(--muted);white-space:nowrap">'+itemDispStr+'</td>'+actionBtns+'</tr>';
  }).join('');
  const editBlock=isActiveOP
    ?'<div style="margin-bottom:14px;padding:12px 14px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border2)">'+
      '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:600">✏️ Editar dados logísticos</div>'+
      '<div class="fgrid">'+
      '<div class="fg"><label style="font-size:12px">Data Prevista de Entrega</label>'+
        '<input type="date" id="vop-dt" class="sinput" value="'+esc(op.deliveryDate||'')+'"></div>'+
      '<div class="fg"><label style="font-size:12px">Transportadora</label>'+
        '<input type="text" id="vop-tr" class="sinput" placeholder="Nome da transportadora" value="'+esc(op.transporter||'')+'"></div>'+
      '</div>'+
      '<div style="font-size:12px;color:var(--muted);margin-top:8px;margin-bottom:6px">Tipo de coleta:</div>'+
      '<div style="display:flex;gap:12px;flex-wrap:wrap">'+
        '<label class="ck-row"><input type="radio" name="vop-col" value="redespacho_sp" '+(op.coleta==='redespacho_sp'?'checked':'')+'>🚛 Redespacho SP</label>'+
        '<label class="ck-row"><input type="radio" name="vop-col" value="coleta_sorocaba" '+(op.coleta==='coleta_sorocaba'||op.coleta==='transportadora'?'checked':'')+'>📍 Coleta Sorocaba</label>'+
        '<label class="ck-row"><input type="radio" name="vop-col" value="retirar" '+(op.coleta==='retirar'?'checked':'')+'>🚶 Retirar</label>'+
      '</div>'+
      '<div style="margin-top:10px;text-align:right">'+
        '<button class="btn btn-green btn-sm" onclick="saveOPLogistica(\''+op.id+'\')">💾 Salvar alterações</button>'+
      '</div>'+
    '</div>'
    :'';
  const addItemBtn=isActiveOP?'<div style="margin-top:10px;text-align:right"><button class="btn btn-green btn-sm" onclick="openAddItemToOP(\''+op.id+'\')">➕ Adicionar Item</button></div>':'';
  Mopen('Pedido #'+op.opNum,
    '<div class="fgrid" style="margin-bottom:14px">'+
    '<div style="font-size:13px"><span style="color:var(--muted)">Cliente:</span> '+esc(op.clientName)+'</div>'+
    '<div style="font-size:13px"><span style="color:var(--muted)">Entrega prevista:</span> '+fdate(op.deliveryDate)+'</div>'+
    '<div style="font-size:13px"><span style="color:var(--muted)">Despacho final:</span> <strong>'+finalDispStr+'</strong></div>'+
    '<div style="font-size:13px"><span style="color:var(--muted)">Transportadora:</span> '+esc(op.transporter||'—')+'</div>'+
    '<div style="font-size:13px"><span style="color:var(--muted)">Coleta:</span> '+(coletaLabel||'—')+'</div>'+
    (op.nfeNumber?'<div style="font-size:13px"><span style="color:var(--muted)">NF:</span> '+esc(op.nfeNumber)+'</div>':'')+
    (op.obs?'<div class="s2" style="font-size:13px"><span style="color:var(--muted)">Obs:</span> '+esc(op.obs)+'</div>':'')+
    (crInfo?'<div class="s2">'+crInfo+'</div>':'')+
    '</div>'+editBlock+pdHtml+
    '<table><thead><tr><th>Produto</th><th>SKU</th><th>Qtd</th><th>Status</th><th>Obs</th><th>Person.</th><th>Despacho</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'+addItemBtn,
    '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>','xl');
}
window.viewOP=viewOP;

function removeOPItem(opId,idx){
  const d=gdb(),op=d.ops.find(o=>o.id===opId);if(!op)return;
  if(op.items.length<=1){toast('A OP deve ter ao menos 1 item','err');return;}
  const item=op.items[idx];
  if(!confirm('Remover o item "'+esc(item.productName||item.sku||'item')+'" da OP #'+op.opNum+'?'))return;
  op.items.splice(idx,1);
  logAction(d,'Item removido da OP','OP #'+op.opNum+' — '+esc(item.productName||item.sku));
  sdb(d);toast('Item removido','ok');Mclose();setTimeout(()=>viewOP(opId),50);
}
function openEditOPItemQty(opId,idx){
  const d=gdb(),op=d.ops.find(o=>o.id===opId);if(!op)return;
  const item=op.items[idx];const unit=item.unit||'PC';const qDisp=item.qtyDispatched||0;
  const minNote=qDisp>0?'<div class="alert alert-warn" style="margin-top:8px">⚠️ Já foram despachadas '+fnum(qDisp)+' unidades.</div>':'';
  Mopen('✏️ Editar Quantidade',
    '<div class="alert alert-info"><strong>'+esc(item.productName||item.sku||'—')+'</strong></div>'+
    '<div class="fg" style="margin-top:12px"><label>Nova quantidade ('+unit+')</label>'+
    '<input type="number" id="eq-qty" min="'+(qDisp||1)+'" step="1" value="'+Math.round(item.qty||0)+'" style="width:100%"></div>'+minNote,
    '<button class="btn btn-ghost" onclick="Mclose();setTimeout(()=>viewOP(\''+opId+'\'),50)">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitEditOPItemQty(\''+opId+'\','+idx+')">💾 Salvar</button>'
  );
  setTimeout(()=>{const inp=el('eq-qty');if(inp){inp.focus();inp.select();}},60);
}
function submitEditOPItemQty(opId,idx){
  const d=gdb(),op=d.ops.find(o=>o.id===opId);if(!op)return;
  const item=op.items[idx];const unit=item.unit||'PC';
  const newQty=_parseQty(v('eq-qty'),unit);const qDisp=item.qtyDispatched||0;
  if(isNaN(newQty)||newQty<=0){toast('Quantidade inválida','err');return;}
  if(newQty<qDisp){toast('Quantidade não pode ser menor que o já despachado ('+fnum(qDisp)+')','err');return;}
  const oldQty=item.qty;item.qty=newQty;
  logAction(d,'Qtd alterada na OP','OP #'+op.opNum+' — '+esc(item.productName||item.sku)+': '+oldQty+' → '+newQty);
  sdb(d);toast('Quantidade atualizada','ok');Mclose();setTimeout(()=>viewOP(opId),50);
}
window.removeOPItem=removeOPItem;window.openEditOPItemQty=openEditOPItemQty;window.submitEditOPItemQty=submitEditOPItemQty;

function openAddItemToOP(opId){
  const d=gdb();const prods=d.products;
  const opts=prods.map(p=>'<div class="ac-opt" data-pid="'+p.id+'">'+(p.sku?'<span class="sku">'+esc(p.sku)+'</span> ':'')+esc(p.name)+'</div>').join('');
  Mopen('➕ Adicionar Item à OP',
    '<div class="fg"><label>Produto *</label>'+
    '<div class="ac-wrap">'+
      '<input type="text" id="ai-inp" placeholder="🔍 SKU ou nome do produto..." autocomplete="off" data-pid=""'+
        ' oninput="aiACFilter()" onfocus="aiACFilter()" onblur="setTimeout(()=>aiACClose(),220)" style="width:100%">'+
      '<div class="ac-drop" id="ai-drop" style="display:none">'+opts+
        '<div class="ac-opt" id="ai-new" style="display:none;color:var(--green);font-style:italic" data-new="1">➕ Cadastrar novo produto...</div>'+
      '</div></div></div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Quantidade *</label><input type="number" id="ai-qty" min="1" step="1" placeholder="1"></div>'+
    '<div class="fg"><label>Observação</label><input type="text" id="ai-obs" placeholder="(opcional)"></div></div>'+
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">'+
    '<label class="ck-row"><input type="checkbox" id="ai-etq"> 🏷️ Etiqueta c/ logo</label>'+
    '<label class="ck-row"><input type="checkbox" id="ai-cx"> 📦 Caixa</label>'+
    '<label class="ck-row"><input type="checkbox" id="ai-grav"> ✏️ Gravação</label>'+
    '</div>',
    '<button class="btn btn-ghost" onclick="Mclose();setTimeout(()=>viewOP(\''+opId+'\'),50)">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitAddItemToOP(\''+opId+'\')">✅ Adicionar</button>'
  );
  setTimeout(()=>{
    const drop=el('ai-drop');if(!drop)return;
    drop.querySelectorAll('.ac-opt:not([data-new])').forEach(opt=>{
      opt.addEventListener('mousedown',e=>{
        e.preventDefault();const p=gdb().products.find(x=>x.id===opt.dataset.pid);if(!p)return;
        const inp=el('ai-inp');inp.value=(p.sku?p.sku+' | ':'')+p.name;inp.dataset.pid=p.id;aiACClose();
      });
    });
    const newBtn=el('ai-new');
    if(newBtn){newBtn.addEventListener('mousedown',e=>{e.preventDefault();Mclose();window.location.href='cadastros.html';});}
  },60);
}
function submitAddItemToOP(opId){
  const d=gdb(),op=d.ops.find(o=>o.id===opId);if(!op)return;
  const inp=el('ai-inp');let pid=inp?inp.dataset.pid:'';
  if(!pid&&inp&&inp.value.trim()){
    const val=inp.value.trim();const skuPart=val.split('|')[0].trim().toUpperCase();
    const found=d.products.find(p=>p.sku&&p.sku.toUpperCase()===skuPart)||d.products.find(p=>p.name.toLowerCase()===val.toLowerCase());
    if(found)pid=found.id;
  }
  const obs=v('ai-obs').trim();
  if(!pid){toast('Selecione o produto','err');return;}
  const p=d.products.find(x=>x.id===pid);if(!p)return;
  const unit=p.unit||'UN';const qty=_parseQty(v('ai-qty'),unit);
  if(qty<=0){toast('Quantidade deve ser maior que zero','err');return;}
  const etq=el('ai-etq')&&el('ai-etq').checked;const cx=el('ai-cx')&&el('ai-cx').checked;const grav=el('ai-grav')&&el('ai-grav').checked;
  op.items.push({pid,sku:p.sku,productName:p.name,qty,unit,status:'pendente',obs,etiqueta:etq,caixa:cx,gravacao:grav,stageLog:[{status:'pendente',by:S?S.name:'',at:Date.now()}]});
  logAction(d,'Item adicionado à OP','OP #'+op.opNum+' — '+esc(p.name)+' x'+fnum(qty));
  sdb(d);toast('Item adicionado','ok');Mclose();setTimeout(()=>viewOP(opId),50);
}
function aiACFilter(){
  const inp=el('ai-inp'),drop=el('ai-drop');if(!inp||!drop)return;
  const q=inp.value.toLowerCase().trim();inp.dataset.pid='';let matchCount=0;
  drop.querySelectorAll('.ac-opt:not([data-new])').forEach(opt=>{const show=!q||opt.textContent.toLowerCase().includes(q);opt.style.display=show?'':'none';if(show)matchCount++;});
  const newBtn=el('ai-new');if(newBtn)newBtn.style.display=q&&matchCount===0?'':'none';
  if(matchCount>0||(q&&newBtn&&matchCount===0)){
    const rect=inp.getBoundingClientRect();
    Object.assign(drop.style,{position:'fixed',left:rect.left+'px',top:(rect.bottom+2)+'px',width:rect.width+'px',zIndex:'9999',right:'auto'});
    drop.style.display='block';
  }else{drop.style.display='none';}
}
function aiACClose(){const d=el('ai-drop');if(d)d.style.display='none';}
window.openAddItemToOP=openAddItemToOP;window.submitAddItemToOP=submitAddItemToOP;
window.aiACFilter=aiACFilter;window.aiACClose=aiACClose;

function saveOPLogistica(opId){
  const dt=(el('vop-dt')||{}).value||'';const tr=(el('vop-tr')||{}).value||'';
  const colEl=document.querySelector('input[name="vop-col"]:checked');const col=colEl?colEl.value:'';
  if(!dt){toast('Informe a data de entrega','err');return;}
  if(!tr){toast('Transportadora obrigatória','err');return;}
  const d=gdb();const oi=d.ops.findIndex(o=>o.id===opId);if(oi<0)return;
  d.ops[oi].deliveryDate=dt;d.ops[oi].transporter=tr;if(col)d.ops[oi].coleta=col;
  logAction(d,'Logística editada','OP #'+d.ops[oi].opNum+' — Data: '+fdate(dt)+' / Trans: '+tr);
  sdb(d);toast('Logística atualizada','ok');Mclose();_refreshHistTable();
}
window.saveOPLogistica=saveOPLogistica;

function cancelOP(id){
  const d=gdb(),op=d.ops.find(o=>o.id===id);if(!op)return;
  Mopen('❌ Cancelar OP #'+esc(op.opNum),
    '<div class="alert alert-warn" style="margin-bottom:12px">Tem certeza que deseja cancelar este pedido?</div>'+
    '<div style="font-size:14px;line-height:1.7;color:var(--text)">'+
    '<strong>Pedido:</strong> #'+esc(op.opNum)+'<br>'+
    '<strong>Cliente:</strong> '+esc(op.clientName)+'<br>'+
    '<strong>Itens:</strong> '+op.items.length+' item(s)'+
    '</div>'+
    '<div style="font-size:12px;color:var(--muted);margin-top:10px">A OP será marcada como Cancelada e ficará visível no histórico.</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Voltar</button>'+
    '<button class="btn btn-danger" onclick="confirmCancelOP(\''+id+'\')">❌ Confirmar Cancelamento</button>'
  );
}
function confirmCancelOP(id){
  const d=gdb(),idx=d.ops.findIndex(o=>o.id===id);if(idx<0)return;
  const op=d.ops[idx];
  logAction(d,'OP cancelada','Pedido #'+op.opNum+' — '+op.clientName);
  d.ops[idx]={...op,status:'cancelado',archived:true,canceledAt:Date.now(),canceledBy:S?S.name:''};
  sdb(d);Mclose();toast('OP #'+op.opNum+' cancelada','ok');
  setTimeout(()=>_refreshHistTable(),100);
}
window.cancelOP=cancelOP;window.confirmCancelOP=confirmCancelOP;
