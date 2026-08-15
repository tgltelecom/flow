// ═══════════════════════════════════════════════════════════════════════════
// expedicao.js — Expedição, despacho e finalização de OPs
// v2.0 TGL Flow
// ═══════════════════════════════════════════════════════════════════════════

let _expSort={col:'deliveryDate',dir:1};
let _expColeta='';
function _setExpSort(col){
  if(_expSort.col===col)_expSort.dir*=-1;else{_expSort.col=col;_expSort.dir=1;}
  renderExp();
}
function _itemFullyDisp(item){return(item.partiallyDispatched&&!item.qtyDispatched)||(item.qtyDispatched||0)>=item.qty;}
function _itemQtyLeft(item){if(item.partiallyDispatched&&!item.qtyDispatched)return 0;return Math.max(0,item.qty-(item.qtyDispatched||0));}
window._setExpSort=_setExpSort;window._itemFullyDisp=_itemFullyDisp;window._itemQtyLeft=_itemQtyLeft;

function rExpedicao(cnt){
  autoArchive();
  cnt.innerHTML='<div class="ptitle">Expedição</div><div id="exp-c"></div>';
  renderExp();
}

function renderExp(){
  const d=gdb();
  const qSavedExp=(el('srch-exp')?el('srch-exp').value:'').toLowerCase();
  const stFiltExp=(el('filt-exp-st')?el('filt-exp-st').value:'');
  const coletaFilt=(el('filt-exp-col')?el('filt-exp-col').value:_expColeta)||'';
  if(coletaFilt)_expColeta=coletaFilt;
  let ops=d.ops.filter(o=>!o.archived);
  if(qSavedExp)ops=ops.filter(o=>o.opNum.toLowerCase().includes(qSavedExp)||(o.clientName||'').toLowerCase().includes(qSavedExp)||(o.transporter||'').toLowerCase().includes(qSavedExp));
  if(stFiltExp==='ativo')ops=ops.filter(o=>o.status!=='finalizado');
  if(stFiltExp==='finalizado')ops=ops.filter(o=>o.status==='finalizado');
  if(stFiltExp==='pronto')ops=ops.filter(o=>{
    if(o.status==='finalizado')return false;
    const lib=o.items.filter(i=>i.status==='liberado'&&!_itemFullyDisp(i)&&_itemQtyLeft(i)>0).length;
    const disp=o.items.filter(i=>_itemFullyDisp(i)).length;
    return(lib+disp)===o.items.length&&o.items.length>0;
  });
  if(stFiltExp==='antecipado')ops=ops.filter(o=>!!o.anticipatedBilling&&o.status!=='finalizado');
  if(coletaFilt)ops=ops.filter(o=>o.coleta===coletaFilt);
  ops.sort((a,b)=>{
    const fin=(x)=>x.status==='finalizado'?1:0;
    const col=_expSort.col,dir=_expSort.dir;
    if(col==='deliveryDate'){if(fin(a)!==fin(b))return fin(a)-fin(b);return dir*(new Date(a.deliveryDate)-new Date(b.deliveryDate));}
    if(col==='opNum')return dir*(a.opNum||'').localeCompare(b.opNum||'');
    if(col==='clientName')return dir*(a.clientName||'').localeCompare(b.clientName||'');
    if(col==='coleta')return dir*((a.coleta||'').localeCompare(b.coleta||''));
    if(col==='status'){if(fin(a)!==fin(b))return fin(a)-fin(b);return 0;}
    return dir*(new Date(a.deliveryDate)-new Date(b.deliveryDate));
  });
  const _sArr2=(col)=>_expSort.col===col?(_expSort.dir===1?' ▲':' ▼'):'<span style="opacity:.3"> ⇅</span>';
  const filtersHtml=
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
    '<input class="sinput" id="srch-exp" placeholder="🔍 Pedido, cliente ou transportadora..." oninput="renderExp()" value="'+esc(qSavedExp)+'" style="flex:1;min-width:200px">'+
    '<select class="sselect" id="filt-exp-st" onchange="renderExp()">'+
    '<option value="">Todos</option>'+
    '<option value="ativo" '+(stFiltExp==='ativo'?'selected':'')+'>Ativos</option>'+
    '<option value="finalizado" '+(stFiltExp==='finalizado'?'selected':'')+'>Finalizados</option>'+
    '<option value="pronto" '+(stFiltExp==='pronto'?'selected':'')+'>✅ Prontos p/ Expedição</option>'+
    '<option value="antecipado" '+(stFiltExp==='antecipado'?'selected':'')+'>🔴 Faturados Antecipadamente</option>'+
    '</select>'+
    '<select class="sselect" id="filt-exp-col" onchange="_expColeta=(this.value);renderExp()">'+
    '<option value="">Todas logísticas</option>'+
    '<option value="redespacho_sp" '+(_expColeta==='redespacho_sp'?'selected':'')+'>🚛 Redespacho SP</option>'+
    '<option value="coleta_sorocaba" '+(_expColeta==='coleta_sorocaba'?'selected':'')+'>📍 Coleta Sorocaba</option>'+
    '<option value="retirar" '+(_expColeta==='retirar'?'selected':'')+'>🚶 Retirar</option>'+
    '<option value="transportadora" '+(_expColeta==='transportadora'?'selected':'')+'>🚚 Transportadora</option>'+
    '</select></div>';
  const ec=el('exp-c');
  if(!ops.length){
    const isEmpty=!d.ops.filter(o=>!o.archived).length;
    ec.innerHTML='<div class="card"><div class="card-header">'+filtersHtml+'</div>'+
      '<div class="empty"><div class="ei">🚚</div><p>'+(isEmpty?'Nenhum pedido em expedição':'Nenhum resultado para essa busca')+'</p></div></div>';
    return;
  }
  ec.innerHTML='<div class="card"><div class="card-header">'+filtersHtml+'</div>'+
    '<div class="tw"><table><thead><tr>'+
    '<th style="width:42px"></th>'+
    '<th style="cursor:pointer" onclick="_setExpSort(\'opNum\')">Pedido '+_sArr2('opNum')+'</th>'+
    '<th style="cursor:pointer" onclick="_setExpSort(\'clientName\')">Cliente '+_sArr2('clientName')+'</th>'+
    '<th style="cursor:pointer" onclick="_setExpSort(\'deliveryDate\')">Prazo '+_sArr2('deliveryDate')+'</th>'+
    '<th style="cursor:pointer" onclick="_setExpSort(\'coleta\')">Transportadora '+_sArr2('coleta')+'</th>'+
    '<th style="cursor:pointer" onclick="_setExpSort(\'status\')">Status '+_sArr2('status')+'</th>'+
    '<th></th>'+
    '</tr></thead><tbody id="exp-tb"></tbody></table></div></div>';
  if(qSavedExp&&el('srch-exp')){const inp=el('srch-exp');inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}
  const tb=el('exp-tb');let html='';
  ops.forEach(op=>{
    const lib=op.items.filter(i=>i.status==='liberado'&&!_itemFullyDisp(i)&&_itemQtyLeft(i)>0).length;
    const dispatched=op.items.filter(i=>_itemFullyDisp(i)).length;
    const hasAnyDisp=op.items.some(i=>_itemFullyDisp(i)||(i.qtyDispatched||0)>0);
    const tot=op.items.length;
    const allLib=(lib+dispatched)===tot&&tot>0;
    const isFin=op.status==='finalizado';
    const coletaLabel={redespacho_sp:'🚛 Redespacho SP',coleta_sorocaba:'📍 Coleta Sorocaba',retirar:'🚶 Retirar',transportadora:'🚚 Transportadora'}[op.coleta]||op.coleta;
    const expandId='ex-'+op.id;
    const partialBadge=hasAnyDisp&&!isFin?'<span class="bs bs-warn" style="margin-left:4px;font-size:11px">⚠️ Parcial</span>':'';
    const statusCell=(()=>{
      if(isFin)return'<span class="bs bs-finalizado">✅ Finalizado</span>'+(op.partialDispatches&&op.partialDispatches.length?'<span class="bs bs-warn" style="margin-left:4px;font-size:10px">+parciais</span>':'');
      if(allLib)return'<span class="bs bs-liberado">Pronto p/ Expedição</span>'+partialBadge;
      const libDisp=lib+dispatched;
      return'<span class="bs bs-producao">'+fnum(libDisp)+'/'+fnum(tot)+' prontos'+(hasAnyDisp?' · '+fnum(dispatched)+' despach.':'')+'</span>';
    })();
    const canAntecip=S&&_roles(S).some(r=>r==='admin'||r==='pcp');
    const hasAntecip=!!op.anticipatedBilling;
    const btnCell=(()=>{
      let btns='';
      if(!isFin&&allLib)btns+='<button class="btn btn-green btn-sm" onclick="finalizarOP(\''+op.id+'\')">✅ Finalizar</button>';
      if(!isFin&&lib>0)btns+='<button class="btn btn-outline btn-sm" style="margin-left:4px" onclick="dispatchParcial(\''+op.id+'\')">📦 Despachar</button>';
      if(!isFin&&!allLib&&lib===0&&hasAnyDisp)btns+='<span style="font-size:11px;color:var(--muted);display:inline-block;margin-left:4px">⏳ Aguard. produção</span>';
      if(!isFin&&canAntecip&&!hasAntecip)btns+='<button class="btn btn-sm" style="margin-left:4px;background:rgba(239,68,68,.15);color:var(--danger);border:1px solid rgba(239,68,68,.3);font-size:10px;padding:2px 6px;line-height:1.3;white-space:normal;max-width:72px;text-align:center" onclick="antecipBilling(\''+op.id+'\')">🔴 Faturar Antecip.</button>';
      if(!isFin&&hasAntecip)btns+='<span class="bs" style="margin-left:4px;background:rgba(239,68,68,.15);color:var(--danger);border:1px solid rgba(239,68,68,.3);font-size:11px;white-space:nowrap">✅ Pedido já faturado</span>';
      return btns;
    })();
    const rowCls=hasAntecip&&!isFin?'tr-billing':(isFin?'tr-final':'');
    const antecipBadge=hasAntecip&&!isFin?'<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--danger);font-weight:700;margin-left:6px;white-space:nowrap">🔴 FAT. ANTECIPADO</span>':'';
    html+=
      '<tr class="'+rowCls+'">'+
      '<td><button class="xbtn" id="xbe-'+op.id+'" onclick="togExpand(\''+expandId+'\',\'xbe-'+op.id+'\')">▶</button></td>'+
      '<td><strong>#'+esc(op.opNum)+'</strong>'+antecipBadge+'</td>'+
      '<td>'+esc(op.clientName)+'</td>'+
      '<td>'+fdate(op.deliveryDate)+' '+diasChip(op.deliveryDate,op.status)+'</td>'+
      '<td><div style="font-size:13px">'+esc(op.transporter||'—')+'</div><div style="font-size:11px;color:var(--muted)">'+esc(coletaLabel||'—')+'</div></td>'+
      '<td>'+statusCell+'</td>'+
      '<td style="white-space:nowrap">'+btnCell+'</td>'+
      '</tr>'+
      '<tr class="tr-expand '+rowCls+'" id="'+expandId+'" style="display:none">'+
      '<td colspan="7"><div class="expand-inner">'+
        '<table style="width:100%"><thead><tr>'+
          '<th style="padding:8px 10px;font-size:11px;text-align:left;color:var(--muted)">Produto</th>'+
          '<th>SKU</th><th>Qtd Pedida</th><th>Despachado</th><th>Recontagem</th><th>Status</th><th>Liberado em</th><th>Person.</th>'+
        '</tr></thead><tbody>'+
        op.items.map((item,idx)=>{
          const p=d.products.find(x=>x.id===item.pid);
          const fl=[item.etiqueta?'🏷️':'',item.caixa?'📦':'',item.gravacao?'✏️':''].filter(Boolean).join(' ');
          const isFD=_itemFullyDisp(item);const qDisp=item.qtyDispatched||0;const hasPartDisp=qDisp>0;
          const libLog=(item.stageLog||[]).filter(l=>l.status==='liberado');
          const libAt=libLog.length?new Date(libLog[libLog.length-1].at):null;
          const libStr=libAt?libAt.toLocaleDateString('pt-BR')+' '+libAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—';
          const dispBadge=isFD?'<span class="bs bs-finalizado">📦 Despachado'+(item.qtyDispatched?'  '+fnum(item.qtyDispatched):'')+'/'+fnum(item.qty)+'</span>':
            hasPartDisp?'<span class="bs bs-warn">📦 Parcial '+fnum(qDisp)+'/'+fnum(item.qty)+'</span>':
            '<span class="bs '+stclass(item.status)+'">'+stlabel(item.status)+'</span>';
          return'<tr style="border-bottom:1px solid rgba(255,255,255,.04)">'+
            '<td style="padding:10px">'+esc(p?p.name:item.productName)+'</td>'+
            '<td style="padding:10px"><span class="sku">'+esc(item.sku||'—')+'</span></td>'+
            '<td style="padding:10px">'+fnum(item.qty)+'</td>'+
            '<td style="padding:10px;font-size:13px">'+(hasPartDisp?'<strong>'+fnum(qDisp)+'</strong> <span style="color:var(--muted);font-size:11px">/ '+fnum(item.qty)+'</span>':'—')+'</td>'+
            '<td style="padding:10px"><input type="number" min="0" value="'+(item.recount!=null?item.recount:item.qty)+'" style="width:80px;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text)" onchange="saveRecount(\''+op.id+'\','+idx+',this.value)"></td>'+
            '<td style="padding:10px">'+dispBadge+'</td>'+
            '<td style="padding:10px;font-size:11px;color:var(--muted)">'+libStr+'</td>'+
            '<td style="padding:10px;font-size:13px">'+(fl||'—')+'</td></tr>';
        }).join('')+
        '</tbody></table>'+
        (op.partialDispatches&&op.partialDispatches.length
          ?'<div style="margin-top:10px;padding:10px;background:var(--bg-input);border-radius:8px;font-size:12px"><strong style="color:var(--muted)">Histórico de despachos parciais:</strong>'+
            op.partialDispatches.map((pd,pi)=>'<div style="margin-top:6px;color:var(--sub)">📦 Despacho '+(pi+1)+': '+fdate(pd.dispatchDate)+(pd.nfeNumber?' · NF '+esc(pd.nfeNumber):'')+(pd.itemIndices?' · '+pd.itemIndices.length+' item(s)':'')+'</div>').join('')+'</div>'
          :'')+
        (op.obs?'<div style="margin-top:10px;font-size:13px;color:var(--muted)"><strong>Obs:</strong> '+esc(op.obs)+'</div>':'')+
      '</div></td></tr>';
  });
  tb.innerHTML=html;
}
window.renderExp=renderExp;window.rExpedicao=rExpedicao;

function saveRecount(opId,idx,val){
  const d=gdb();const oi=d.ops.findIndex(o=>o.id===opId);
  if(oi>=0){d.ops[oi].items[idx].recount=parseInt(val)||0;sdb(d);}
}
window.saveRecount=saveRecount;

function antecipBilling(id){
  const d=gdb(),op=d.ops.find(o=>o.id===id);if(!op)return;
  Mopen('🔴 Faturamento Antecipado — #'+esc(op.opNum),
    '<div class="alert alert-warn" style="margin-bottom:16px">⚠️ Pedido faturado antecipadamente?<br>A linha ficará em vermelho e as informações serão pré-preenchidas na expedição.</div>'+
    '<div class="fg"><label>Número da NF *</label><input type="text" id="ab-nf" placeholder="Ex: 001234" style="font-size:15px;font-weight:600"></div>'+
    '<div class="fg"><label>Empresa emissora</label>'+
    '<div class="ck-group">'+
    '<label class="ck-row"><input type="checkbox" name="ab-co" value="tgl" checked> TGL TELECOM</label>'+
    '<label class="ck-row"><input type="checkbox" name="ab-co" value="b3"> B3 TELECOM</label>'+
    '</div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="confirmAntecipBilling(\''+id+'\')">✅ Confirmar Faturamento</button>'
  );
}
function confirmAntecipBilling(id){
  const nf=v('ab-nf').trim();
  if(!nf){toast('Número da NF obrigatório','err');return;}
  const company=Array.from(document.querySelectorAll('input[name="ab-co"]:checked')).map(c=>c.value);
  Mclose();
  const d=gdb();const i=d.ops.findIndex(o=>o.id===id);if(i<0)return;
  d.ops[i].anticipatedBilling={nf,company,at:Date.now(),by:S?S.name:''};
  logAction(d,'Faturamento antecipado registrado','Pedido #'+d.ops[i].opNum+' — NF: '+nf+' · '+(company.join('/')||'—'));
  sdb(d);toast('Faturamento antecipado registrado!','ok');renderExp();
}
window.antecipBilling=antecipBilling;window.confirmAntecipBilling=confirmAntecipBilling;

function finalizarOP(id){
  const today=new Date().toISOString().split('T')[0];
  const d2=gdb(),op2=d2.ops.find(o=>o.id===id);
  const ab=op2&&op2.anticipatedBilling;
  const abBanner=ab?'<div class="alert" style="margin-bottom:16px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--danger)">🔴 <strong>Faturado Antecipadamente</strong> — NF '+esc(ab.nf)+' emitida por '+esc(ab.by||'—')+' em '+new Date(ab.at).toLocaleDateString('pt-BR')+'. Campos pré-preenchidos.</div>':'';
  Mopen('🚚 Confirmar Despacho Final — Expedição',
    abBanner+
    '<div class="alert alert-warn" style="margin-bottom:16px">⚠️ Após confirmar, a OP será marcada como Finalizada e arquivada automaticamente em 24h.</div>'+
    '<div class="fg"><label>Data do Despacho *</label><input type="date" id="disp-date" value="'+today+'"></div>'+
    '<div class="fg"><label>Número da NF</label><input type="text" id="disp-nf" placeholder="Ex: 001234" value="'+(ab?esc(ab.nf):'') +'" '+(ab?'readonly style="opacity:.7;cursor:not-allowed"':'')+' ></div>'+
    '<div class="fg"><label>Tipo de NF emitida</label>'+
    '<div class="ck-group">'+
    '<label class="ck-row"><input type="checkbox" name="disp-tipo" value="tgl" '+(ab&&ab.company.includes('tgl')?'checked':'')+' '+(ab?'disabled':'')+' > TGL TELECOM</label>'+
    '<label class="ck-row"><input type="checkbox" name="disp-tipo" value="b3" '+(ab&&ab.company.includes('b3')?'checked':'')+' '+(ab?'disabled':'')+' > B3 TELECOM</label>'+
    (!ab?'<label class="ck-row"><input type="checkbox" name="disp-tipo" value="cliente"> NF DO CLIENTE</label>':'')+
    '</div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="confirmDispatch(\''+id+'\')">✅ Confirmar Despacho</button>'
  );
}
async function confirmDispatch(id){
  const dispDate=v('disp-date');
  if(!dispDate){toast('Data de despacho obrigatória','err');return;}
  const d=gdb();const i=d.ops.findIndex(o=>o.id===id);if(i<0)return;
  const ab=d.ops[i].anticipatedBilling;
  const nfeNumber=ab?ab.nf:(v('disp-nf').trim());
  const nfeType=ab?ab.company:Array.from(document.querySelectorAll('input[name="disp-tipo"]:checked')).map(c=>c.value);
  Mclose();
  d.ops[i].status='finalizado';d.ops[i].finalAt=Date.now();d.ops[i].dispatchDate=dispDate;
  d.ops[i].nfeNumber=nfeNumber;d.ops[i].nfeType=nfeType;
  logAction(d,'OP despachada','Pedido #'+d.ops[i].opNum+' — NF: '+(nfeNumber||'—')+' · '+dispDate);
  const deductions=[];
  d.ops[i].items.forEach(it=>{
    const p=d.products.find(x=>x.id===it.pid);
    if(p&&p.isStock&&d.stock[it.pid]){
      const remaining=_itemQtyLeft(it);
      if(remaining>0)deductions.push({stockId:'P:'+it.pid,qty:remaining,pid:it.pid});
    }
  });
  if(deductions.length>0){
    try{
      const results=await Promise.all(deductions.map(dc=>_rpcDeductStock(dc.stockId,dc.qty)));
      results.forEach((res,ri)=>{
        if(res&&res.ok){
          const pid=deductions[ri].pid;
          const p=d.products.find(x=>x.id===pid);
          const it=d.ops[i].items.find(x=>x.pid===pid);
          logAction(d,'Saída Revenda (OP)',(p?p.name:pid)+' -'+deductions[ri].qty+' '+(it?it.unit||'PC':'PC')+' · OP #'+d.ops[i].opNum);
          const stockData={...(d.stock[pid]||{}),qty:res.new_qty,at:Date.now()};
          d.stock[pid]=stockData;
          _lastSavedStockStr['P:'+pid]=JSON.stringify(stockData);
        }
      });
    }catch(e){console.error('[TGL] stock RPC failed:',e);toast('Aviso: erro ao baixar estoque — verifique manualmente','warn');}
  }
  sdb(d);toast('OP despachada e finalizada!','ok');showTruckAnim();renderExp();
}
window.finalizarOP=finalizarOP;window.confirmDispatch=confirmDispatch;

function dispatchParcial(id){
  const d=gdb(),op=d.ops.find(o=>o.id===id);if(!op)return;
  const libItems=op.items.map((item,idx)=>({item,idx})).filter(({item})=>
    item.status==='liberado'&&!_itemFullyDisp(item)&&_itemQtyLeft(item)>0
  );
  if(!libItems.length){toast('Nenhum item disponível para despacho','err');return;}
  const today=new Date().toISOString().split('T')[0];
  const itemRows=libItems.map(({item,idx})=>{
    const p=d.products.find(x=>x.id===item.pid);const qLeft=_itemQtyLeft(item);const qDisp=item.qtyDispatched||0;
    return'<div style="display:grid;grid-template-columns:20px 1fr auto;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.06)">'+
      '<input type="checkbox" name="dp-item" value="'+idx+'" checked style="width:16px;height:16px;cursor:pointer">'+
      '<div style="min-width:0">'+
        '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p?p.name:item.productName)+'</div>'+
        '<div style="font-size:11px;color:var(--muted)">'+esc(item.sku||'')+(qDisp>0?' · <span style="color:var(--warn)">'+qDisp+' já despach.</span>':'')+'</div>'+
      '</div>'+
      '<div style="font-size:12px;white-space:nowrap;text-align:right">'+
        '<input type="number" name="dp-qty" data-idx="'+idx+'" min="1" max="'+qLeft+'" value="'+qLeft+'" style="width:65px;padding:4px 6px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:center">'+
        '<span style="color:var(--muted);margin-left:4px">/ '+qLeft+' '+esc(item.unit||'PC')+'</span>'+
      '</div>'+
    '</div>';
  }).join('');
  Mopen('📦 Despacho Parcial — #'+op.opNum,
    '<div class="alert alert-warn" style="margin-bottom:16px"><strong>⚠️ DESPACHO PARCIAL</strong><br>Os itens não despachados continuarão em produção e a OP permanecerá ativa.</div>'+
    '<div class="fg"><label>Itens e quantidades a despachar agora:</label>'+
    '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 12px">'+itemRows+'</div></div>'+
    '<div class="fgrid"><div class="fg"><label>Data do Despacho *</label><input type="date" id="dp-date" value="'+today+'"></div>'+
    '<div class="fg"><label>Número da NF</label><input type="text" id="dp-nf" placeholder="Ex: 001234"></div></div>'+
    '<div class="fg"><label>Tipo de NF</label><div class="ck-group">'+
    '<label class="ck-row"><input type="checkbox" name="dp-tipo" value="tgl"> TGL TELECOM</label>'+
    '<label class="ck-row"><input type="checkbox" name="dp-tipo" value="b3"> B3 TELECOM</label>'+
    '<label class="ck-row"><input type="checkbox" name="dp-tipo" value="cliente"> NF DO CLIENTE</label>'+
    '</div></div>'+
    '<div style="margin-top:12px;padding:12px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.3);border-radius:8px">'+
    '<label class="ck-row"><input type="checkbox" id="dp-confirm"> <strong style="color:var(--danger)">Confirmo que este é um despacho PARCIAL e que a OP continuará ativa para os itens restantes.</strong></label>'+
    '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="confirmParcial(\''+id+'\')">📦 Registrar Despacho Parcial</button>',
    'lg'
  );
}
async function confirmParcial(id){
  if(!el('dp-confirm').checked){toast('Marque a caixa de confirmação antes de prosseguir','err');return;}
  const selectedItems=Array.from(document.querySelectorAll('input[name="dp-item"]:checked')).map(cb=>{
    const idx=parseInt(cb.value);
    const qIn=document.querySelector('input[name="dp-qty"][data-idx="'+idx+'"]');
    return{idx,qty:qIn?parseInt(qIn.value)||0:0};
  }).filter(x=>x.qty>0);
  if(!selectedItems.length){toast('Selecione ao menos um item com quantidade > 0','err');return;}
  const dispDate=v('dp-date');if(!dispDate){toast('Data de despacho obrigatória','err');return;}
  const nfeNumber=v('dp-nf').trim();
  const nfeType=Array.from(document.querySelectorAll('input[name="dp-tipo"]:checked')).map(c=>c.value);
  const selectedIdx=selectedItems.map(x=>x.idx);
  Mclose();
  const d=gdb();const oi=d.ops.findIndex(o=>o.id===id);if(oi<0)return;
  if(!d.ops[oi].partialDispatches)d.ops[oi].partialDispatches=[];
  d.ops[oi].partialDispatches.push({at:Date.now(),dispatchDate:dispDate,nfeNumber,nfeType,itemIndices:selectedIdx,itemQtys:selectedItems.map(x=>({idx:x.idx,qty:x.qty}))});
  const deductions=[];
  selectedItems.forEach(({idx,qty})=>{
    const item=d.ops[oi].items[idx];
    item.qtyDispatched=(item.qtyDispatched||0)+qty;item.partiallyDispatched=true;
    if(!item.stageLog)item.stageLog=[];
    item.stageLog.push({status:'despachado_parcial',at:Date.now(),qty});
    const p=d.products.find(x=>x.id===item.pid);
    if(p&&p.isStock&&d.stock[item.pid])deductions.push({stockId:'P:'+item.pid,qty,pid:item.pid});
  });
  const totalQty=selectedItems.reduce((s,x)=>s+x.qty,0);
  logAction(d,'Despacho parcial',d.ops[oi].opNum+' — '+selectedItems.length+' item(s) · '+totalQty+' un. · NF: '+(nfeNumber||'—'));
  if(deductions.length>0){
    try{
      const results=await Promise.all(deductions.map(dc=>_rpcDeductStock(dc.stockId,dc.qty)));
      results.forEach((res,ri)=>{
        if(res&&res.ok){
          const pid=deductions[ri].pid;
          const p=d.products.find(x=>x.id===pid);
          const it=d.ops[oi].items.find(x=>x.pid===pid);
          logAction(d,'Saída Revenda (OP Parcial)',(p?p.name:pid)+' -'+deductions[ri].qty+' '+(it?it.unit||'PC':'PC')+' · OP #'+d.ops[oi].opNum);
          const stockData={...(d.stock[pid]||{}),qty:res.new_qty,at:Date.now()};
          d.stock[pid]=stockData;_lastSavedStockStr['P:'+pid]=JSON.stringify(stockData);
        }
      });
    }catch(e){console.error('[TGL] stock RPC failed:',e);toast('Aviso: erro ao baixar estoque — verifique manualmente','warn');}
  }
  sdb(d);toast('Despacho parcial: '+selectedItems.length+' item(s), '+totalQty+' un.','warn');showTruckAnim();renderExp();
}
window.dispatchParcial=dispatchParcial;window.confirmParcial=confirmParcial;
