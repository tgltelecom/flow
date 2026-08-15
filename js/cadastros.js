// ═══════════════════════════════════════════════════════════════════════════
// cadastros.js — Produtos, Clientes, Fornecedores, MP, Embalagens
// v2.0 TGL Flow
// ═══════════════════════════════════════════════════════════════════════════

const _SETORES=[
  {v:'preformados',l:'🧵 Preformados'},
  {v:'estamparia',l:'🔩 Estamparia'},
  {v:'espinar',l:'🔌 Espinar/Fita'},
  {v:'outros',l:'📦 Outros'}
];

function _setorOpts(sel){
  return _SETORES.map(s=>'<option value="'+s.v+'" '+(sel===s.v?'selected':'')+'>'+s.l+'</option>').join('');
}
function _setorBadge(setor,custom){
  if(!setor)return'<span style="color:var(--muted);font-size:12px">—</span>';
  if(setor==='outros')return'<span class="bs bs-pendente" style="font-size:11px">'+esc(custom||'Outros')+'</span>';
  const s=_SETORES.find(x=>x.v===setor);
  return s?'<span class="bs bs-pendente" style="font-size:11px">'+s.l+'</span>':'';
}
function _tipoBadge(t){
  if(t==='emb')return'<span class="bs" style="background:rgba(168,85,247,.15);color:#a855f7;border:1px solid rgba(168,85,247,.3);font-size:11px">📦 Emb.</span>';
  return'<span class="bs bs-producao" style="font-size:11px">🌿 MP</span>';
}
function _setorCustomField(pfx,sel){
  return'<div class="fg" id="fg-setor-custom-'+pfx+'" style="display:'+(sel==='outros'?'block':'none')+'">'+
    '<label>Especifique o setor *</label>'+
    '<input type="text" id="'+pfx+'-setor-custom" placeholder="Nome do setor"></div>';
}
function _toggleSetorCustom(prefix){
  const sel=el(prefix+'-setor');const fg=el('fg-setor-custom-'+prefix);
  if(fg)fg.style.display=sel&&sel.value==='outros'?'block':'none';
}
window._toggleSetorCustom=_toggleSetorCustom;

let _prodSort={col:'name',dir:1};

function rCadastros(cnt){
  cnt.innerHTML='<div class="ptitle">📂 Cadastros</div>'+
    '<div class="stabs">'+
    '<button class="stab on" id="st-prod" onclick="cadTab(\'prod\')">📦 Produtos</button>'+
    '<button class="stab" id="st-cli" onclick="cadTab(\'cli\')">👤 Clientes</button>'+
    '<button class="stab" id="st-forn" onclick="cadTab(\'forn\')">🏭 Fornecedores</button>'+
    '<button class="stab" id="st-mp" onclick="cadTab(\'mp\')">🌿 Matéria-Prima</button>'+
    '<button class="stab" id="st-emb" onclick="cadTab(\'emb\')">📦 Embalagens</button>'+
    '<button class="stab" id="st-pref" onclick="cadTab(\'pref\')">🧵 Preformados</button>'+
    '</div>'+
    '<div id="stcontent"></div>';
  cadTab('prod');
}
window.rCadastros=rCadastros;

function cadTab(t){
  document.querySelectorAll('.stab[id^="st-"]').forEach(b=>b.classList.remove('on'));
  const bt=el('st-'+t);if(bt)bt.classList.add('on');
  if(t==='prod')tabProd();
  else if(t==='cli')tabCli();
  else if(t==='forn')tabCadForn();
  else if(t==='mp')tabCadMP();
  else if(t==='emb')tabCadEmb();
  else if(t==='pref')tabCadPref();
}
window.cadTab=cadTab;

// ═══════════════════════════════════════════════
// ── PRODUTOS ─────────────────────────────────
// ═══════════════════════════════════════════════
function tabProd(){
  const sc=el('stcontent');
  sc.innerHTML='<div class="card">'+
    '<div class="card-header">'+
    '<div><div class="card-title">Produtos Cadastrados</div></div>'+
    '<div style="display:flex;gap:6px">'+
    (S&&_roles(S).includes('admin')?'<button class="btn btn-ghost btn-sm" onclick="openMergeDuplicates()">🔀 Duplicatas</button>':'')+
    '<button class="btn btn-green btn-sm" onclick="openProdForm()">+ Novo Produto</button>'+
    '</div></div>'+
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">'+
    '<input class="sinput" id="srch-p" placeholder="🔍 Buscar por código ou nome..." oninput="filterProd()" style="flex:1;min-width:200px;max-width:360px">'+
    '<select class="sselect" id="filt-tipo" onchange="filterProd()"><option value="">Todos os tipos</option><option value="revenda">Revenda</option><option value="producao">Produção</option></select>'+
    '<select class="sselect" id="filt-setor" onchange="filterProd()"><option value="">Todos os setores</option><option value="preformados">Preformados</option><option value="estamparia">Estamparia</option><option value="espinar">Espinar/Fita</option></select>'+
    '</div>'+
    '<div class="tw" id="prod-tbl"></div></div>';
  filterProd();
}
window.tabProd=tabProd;

function filterProd(){
  const d=gdb();
  const q=(v('srch-p')||'').toLowerCase();
  const tipo=el('filt-tipo')?el('filt-tipo').value:'';
  const setor=el('filt-setor')?el('filt-setor').value:'';
  let prods=[...d.products];
  if(q)prods=prods.filter(p=>p.name.toLowerCase().includes(q)||((p.sku||'').toLowerCase().includes(q)));
  if(tipo==='revenda')prods=prods.filter(p=>p.isStock);
  else if(tipo==='producao')prods=prods.filter(p=>!p.isStock);
  if(setor)prods=prods.filter(p=>!p.isStock&&(p.sectors||[]).includes(setor));
  prods.sort((a,b)=>{
    let va,vb;
    if(_prodSort.col==='tipo'){va=a.isStock?'revenda':'producao';vb=b.isStock?'revenda':'producao';}
    else if(_prodSort.col==='setor'){va=(a.sectors||[]).join(',').toLowerCase();vb=(b.sectors||[]).join(',').toLowerCase();}
    else{va=(a[_prodSort.col]||'').toString().toLowerCase();vb=(b[_prodSort.col]||'').toString().toLowerCase();}
    return va<vb?-_prodSort.dir:va>vb?_prodSort.dir:0;
  });
  const t=el('prod-tbl');if(!t)return;
  if(!prods.length){t.innerHTML='<div class="empty"><div class="ei">📦</div><p>Nenhum produto encontrado</p></div>';return;}
  const arrow=col=>_prodSort.col===col?(_prodSort.dir>0?' ▲':' ▼'):'<span style="opacity:.3"> ⇅</span>';
  t.innerHTML='<table><thead><tr>'+
    '<th style="cursor:pointer" onclick="sortProd(\'name\')">Produto'+arrow('name')+'</th>'+
    '<th style="cursor:pointer" onclick="sortProd(\'sku\')">SKU'+arrow('sku')+'</th>'+
    '<th>Un.</th>'+
    '<th style="cursor:pointer" onclick="sortProd(\'tipo\')">Tipo'+arrow('tipo')+'</th>'+
    '<th style="cursor:pointer" onclick="sortProd(\'setor\')">Setores'+arrow('setor')+'</th>'+
    '<th></th>'+
    '</tr></thead><tbody>'+
    prods.map(p=>'<tr>'+
      '<td><strong>'+esc(p.name)+'</strong>'+(p.isKit?' <span class="bs" style="background:rgba(99,102,241,.15);color:var(--accent);font-size:10px">🔗 Kit</span>':'')+'</td>'+
      '<td><span class="sku">'+esc(p.sku||'—')+'</span></td>'+
      '<td><span class="bs bs-pendente" style="font-size:11px">'+esc(p.unit||'UN')+'</span></td>'+
      '<td>'+(p.isKit?'<span class="bs" style="background:rgba(99,102,241,.15);color:var(--accent);font-size:10px">🔗 Kit</span> ':'' )+(p.isStock?'<span class="bs bs-liberado">Revenda</span>':'<span class="bs bs-producao">Produção</span>')+'</td>'+
      '<td>'+sectorBadges(p)+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" onclick="openProdForm(\''+p.id+'\')">✏️</button>'+
        (S&&_roles(S).includes('admin')?' <button class="btn btn-danger btn-sm" onclick="delProd(\''+p.id+'\')">🗑️</button>':'')+
      '</td></tr>'
    ).join('')+
  '</tbody></table>';
}
window.filterProd=filterProd;

function sortProd(col){
  if(_prodSort.col===col)_prodSort.dir*=-1;else{_prodSort.col=col;_prodSort.dir=1;}
  filterProd();
}
window.sortProd=sortProd;

// ─── KIT — estado global durante edição ──────────────────────────────────────
window._kitComps = [];

// ─── PREFORMADOS — Parser de nome ─────────────────────────────────────────────
function _parsePRFName(name){
  const n=(name||'').toUpperCase().trim();
  const tipo=['DERIVACAO','ALCA','LACO'].find(t=>n.startsWith(t))||'';
  const material=['AL CABO OPTICO','AC CCE'].find(m=>n.includes(m))||'';
  const rangeM=n.match(/([\d]+[,.][\d]+|[\d]+)\s*-\s*([\d]+[,.][\d]+|[\d]+)\s*mm/);
  const rangeMin=rangeM?parseFloat(rangeM[1].replace(',','.')):0;
  const rangeMax=rangeM?parseFloat(rangeM[2].replace(',','.')):0;
  let cor='',varetas=0,comprimento=0;
  if(rangeM){
    const afterRange=n.slice(n.indexOf(rangeM[0])+rangeM[0].length).trim();
    const varetasM=afterRange.match(/(\d+)\s*V\b/);
    varetas=varetasM?parseInt(varetasM[1]):0;
    const varetasIdx=varetasM?afterRange.indexOf(varetasM[0]):afterRange.length;
    cor=afterRange.slice(0,varetasIdx).trim();
    const comprM=afterRange.match(/(\d+)\s*mm\s*$/);
    comprimento=comprM?parseInt(comprM[1]):0;
  }
  return{tipo,material,rangeMin,rangeMax,cor,varetas,comprimento};
}
function _renderPRFPreview(parsed){
  const f=(l,v)=>'<div style="background:var(--bg);border-radius:6px;padding:8px 10px">'+
    '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">'+l+'</div>'+
    '<div style="font-size:14px;font-weight:600;margin-top:2px">'+(v||'<span style="color:var(--muted)">—</span>')+'</div></div>';
  return '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 14px">'+
    f('Tipo',parsed.tipo)+f('Material',parsed.material)+
    f('Range',parsed.rangeMin?parsed.rangeMin.toFixed(2)+' – '+parsed.rangeMax.toFixed(2)+'mm':'')+
    f('Cor',parsed.cor)+f('Varetas',parsed.varetas?parsed.varetas+'V':'')+
    f('Comprimento',parsed.comprimento?parsed.comprimento+'mm':'')+'</div>';
}
window._prf_parsePreview=function(val){
  const p=el('prf-preview');if(p)p.innerHTML=_renderPRFPreview(_parsePRFName(val));
};
function _openPRFProdForm(p,id){
  const parsed=_parsePRFName(p.name);
  Mopen('🧵 Editar Preformado',
    '<div style="background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--sub)">'+
    '🧵 Preformado — edite o <strong>nome completo</strong> e os campos estruturais serão extraídos automaticamente.</div>'+
    '<div class="fg"><label>Nome completo *</label>'+
    '<input class="sinput" type="text" id="pf-name" value="'+esc(p.name)+'" oninput="_prf_parsePreview(this.value)" placeholder="Ex: ALCA PRF AC CCE 10,00 - 10,80mm VERDE 3V 480mm"></div>'+
    '<div id="prf-preview">'+_renderPRFPreview(parsed)+'</div>'+
    '<div class="fg"><label>SKU / Código</label><input class="sinput" type="text" id="pf-sku" value="'+esc(p.sku||'')+'" placeholder="Ex: PRF096"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveProd(\''+( id||'')+'\')">💾 Salvar</button>'
  );
}

function openProdForm(id){
  const d=gdb(),p=id?d.products.find(x=>x.id===id):null;
  // PRF product: different form (parse name → show fields)
  if(p&&/\bPRF\b/i.test(p.name)){_openPRFProdForm(p,id);return;}
  window._kitComps=p&&p.isKit&&p.kitComponents?p.kitComponents.map(c=>({...c})):[];
  const isKitNow=!!(p&&p.isKit);
  Mopen(p?'Editar Produto':'Novo Produto',
    '<div class="fg"><label>Nome do Produto *</label><input type="text" id="pf-name" value="'+esc(p?p.name:'')+'" placeholder="Ex: ALCA PRF AC CCE 6,80mm"></div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>SKU / Código</label><input type="text" id="pf-sku" value="'+esc(p?p.sku||'':'')+'" placeholder="Ex: TGLP096"></div>'+
    _unitSel('pf-unit',p?p.unit:'','UN')+
    '</div>'+
    '<div class="fg"><label>Tipo *</label><div class="ck-group">'+
    '<label class="ck-row"><input type="radio" name="pf-tipo" value="estoque" '+(p&&p.isStock?'checked':'')+' onchange="togSectors()"> 🏷️ Produto de Revenda</label>'+
    '<label class="ck-row"><input type="radio" name="pf-tipo" value="producao" '+(!p||!p.isStock?'checked':'')+' onchange="togSectors()"> 🏭 Produzido Internamente</label>'+
    '</div></div>'+
    '<div id="pf-sectors" style="'+(p&&p.isStock?'display:none':'')+'"><div class="fg"><label>Setor(es) *</label><div class="ck-group">'+
    '<label class="ck-row"><input type="checkbox" name="pf-sec" value="preformados" '+(p&&(p.sectors||[]).includes('preformados')?'checked':'')+'>  🧵 Preformados</label>'+
    '<label class="ck-row"><input type="checkbox" name="pf-sec" value="estamparia" '+(p&&(p.sectors||[]).includes('estamparia')?'checked':'')+'>  🔩 Ferragens (Estamparia)</label>'+
    '<label class="ck-row"><input type="checkbox" name="pf-sec" value="espinar" '+(p&&(p.sectors||[]).includes('espinar')?'checked':'')+'>  🔌 Espinar/Fita</label>'+
    '</div></div></div>'+
    '<div class="fg" style="margin-top:8px">'+
    '<label class="ck-row" style="font-size:14px"><input type="checkbox" id="pf-kit" '+(isKitNow?'checked':'')+' onchange="togKit()"> 🔗 É um Kit/Conjunto <span style="font-size:12px;color:var(--muted)">(composto por outros produtos)</span></label></div>'+
    '<div id="pf-kit-sec" style="'+(isKitNow?'':'display:none')+'">'+
    '<div class="fg">'+
    '<label>Componentes do Kit * <span style="font-size:12px;color:var(--muted)">(mínimo 1)</span></label>'+
    '<div style="position:relative;margin-bottom:6px">'+
    '<input type="text" class="sinput" id="pf-kit-q" placeholder="🔍 Buscar produto para adicionar..." style="width:100%;box-sizing:border-box" oninput="_kitSearch(this.value)">'+
    '<div id="pf-kit-results" style="display:none;position:absolute;z-index:999;width:100%;background:var(--card);border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.4);max-height:200px;overflow-y:auto"></div></div>'+
    '<div id="pf-kit-list"></div></div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveProd(\''+(id||'')+'\')">💾 Salvar</button>'
  );
  _renderKitList();
}
function togSectors(){
  const t=document.querySelector('input[name="pf-tipo"]:checked');
  if(t)el('pf-sectors').style.display=t.value==='estoque'?'none':'block';
}
window.togSectors=togSectors;
function togKit(){
  const chk=el('pf-kit'),sec=el('pf-kit-sec');
  if(sec)sec.style.display=chk&&chk.checked?'block':'none';
}
window.togKit=togKit;
function _kitSearch(q){
  const d=gdb();const res=el('pf-kit-results');if(!res)return;
  if(!q.trim()){res.style.display='none';return;}
  const ql=q.toLowerCase();
  const existing=new Set(window._kitComps.map(c=>c.productId));
  const matches=d.products.filter(p=>!existing.has(p.id)&&(p.name.toLowerCase().includes(ql)||(p.sku||''). toLowerCase().includes(ql))).slice(0,8);
  if(!matches.length){res.style.display='block';res.innerHTML='<div style="padding:8px 12px;color:var(--muted);font-size:13px">Nenhum produto encontrado</div>';return;}
  res.style.display='block';
  res.innerHTML=matches.map(p=>'<div onclick="_kitAddComp(\''+ p.id+'\')" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)" onmouseover="this.style.background=\'var(--hover)\'" onmouseout="this.style.background=\'\'">'+(p.sku?'<span class="sku" style="font-size:11px;margin-right:6px">'+esc(p.sku)+'</span>':'')+esc(p.name)+'</div>').join('');
}
window._kitSearch=_kitSearch;
function _kitAddComp(pid){
  const d=gdb();const p=d.products.find(x=>x.id===pid);if(!p)return;
  if(window._kitComps.some(c=>c.productId===pid)){toast('Componente já adicionado','info');return;}
  window._kitComps.push({productId:pid,qty:1});
  const si=el('pf-kit-q');if(si)si.value='';
  const res=el('pf-kit-results');if(res)res.style.display='none';
  _renderKitList();
}
window._kitAddComp=_kitAddComp;
function _kitRemComp(idx){window._kitComps.splice(idx,1);_renderKitList();}
window._kitRemComp=_kitRemComp;
function _renderKitList(){
  const d=gdb();const t=el('pf-kit-list');if(!t)return;
  if(!window._kitComps.length){
    t.innerHTML='<div style="padding:12px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed var(--border);border-radius:6px;margin-top:6px">Adicione produtos usando a busca acima.</div>';return;
  }
  t.innerHTML='<div style="margin-top:8px;max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">'+
    window._kitComps.map((c,i)=>{
      const p=d.products.find(x=>x.id===c.productId);
      return'<div style="display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 12px">'+
        '<div style="flex:1;font-size:13px">'+(p?(p.sku?'<span class="sku" style="font-size:11px;margin-right:6px">'+esc(p.sku)+'</span>':'')+esc(p.name):'<span style="color:var(--danger)">Produto não encontrado</span>')+'</div>'+
        '<div style="display:flex;align-items:center;gap:4px"><span style="font-size:12px;color:var(--muted)">Qtd:</span>'+
        '<input type="number" class="sinput" style="width:60px;padding:4px 8px;font-size:13px;text-align:center" min="1" value="'+c.qty+'" oninput="window._kitComps['+i+'].qty=Math.max(1,+this.value||1)"></div>'+
        '<button class="btn btn-danger btn-sm" onclick="_kitRemComp('+i+')" title="Remover">🗑️</button></div>';
    }).join('')+'</div>';
}
window._renderKitList=_renderKitList;

function saveProd(id){
  const name=v('pf-name').trim(),sku=v('pf-sku').trim();
  if(!name){toast('Nome obrigatório','err');return;}
  // PRF: save with parsed prfData, setor=preformados, tipo=producao
  if(/\bPRF\b/i.test(name)){
    const prfData=_parsePRFName(name);
    const d=gdb();
    const dup=d.products.find(x=>x.name.trim().toLowerCase()===name.toLowerCase()&&x.id!==id);
    if(dup){toast('Já existe um produto com esse nome','err');return;}
    const obj={name,sku,unit:'UN',isStock:false,sectors:['preformados'],isKit:false,kitComponents:[],prfData};
    if(id){const i=d.products.findIndex(x=>x.id===id);if(i>=0)d.products[i]={...d.products[i],...obj};}
    else d.products.push({id:uid(),...obj});
    logAction(d,id?'Produto editado':'Produto criado','['+sku+'] '+name);
    sdb(d);Mclose();toast('Preformado salvo!','ok');filterProd();return;
  }
  const unit=v('pf-unit')||'UN';
  const tipo=document.querySelector('input[name="pf-tipo"]:checked').value;
  const isStock=tipo==='estoque';
  const sectors=isStock?[]:Array.from(document.querySelectorAll('input[name="pf-sec"]:checked')).map(c=>c.value);
  if(!isStock&&!sectors.length){toast('Selecione ao menos um setor','err');return;}
  const isKit=!!(el('pf-kit')&&el('pf-kit').checked);
  const kitComponents=isKit?window._kitComps.filter(c=>c.productId&&c.qty>=1):[];
  if(isKit&&!kitComponents.length){toast('Adicione ao menos 1 componente ao kit','err');return;}
  const d=gdb();
  if(sku){const dupSku=d.products.find(x=>x.sku&&x.sku.toUpperCase()===sku.toUpperCase()&&x.id!==id);if(dupSku){toast('SKU "'+sku+'" já está em uso por "'+dupSku.name+'"','err');return;}}
  const dupName=d.products.find(x=>x.name.trim().toLowerCase()===name.toLowerCase()&&x.id!==id);
  if(dupName){toast('Já existe um produto com esse nome','err');return;}
  if(id){const i=d.products.findIndex(x=>x.id===id);d.products[i]={...d.products[i],name,sku,unit,isStock,sectors,isKit,kitComponents};}
  else d.products.push({id:uid(),name,sku,unit,isStock,sectors,isKit,kitComponents});
  logAction(d,id?'Produto editado':'Produto criado','['+sku+'] '+name+(isKit?' (Kit, '+kitComponents.length+' comp.)':'')); 
  sdb(d);Mclose();toast('Produto salvo!','ok');filterProd();
}
function delProd(id){
  if(!confirm('Excluir produto?'))return;
  const d=gdb();
  const inUse=d.ops.some(o=>!o.archived&&o.status==='ativo'&&o.items.some(i=>i.pid===id));
  if(inUse){toast('Produto está em uso em OPs ativas. Finalize-as antes de excluir.','err');return;}
  const _dp=d.products.find(x=>x.id===id);
  logAction(d,'Produto excluído',_dp?'['+(_dp.sku||'—')+'] '+_dp.name:'id:'+id);
  d.products=d.products.filter(p=>p.id!==id);
  sdb(d);toast('Produto excluído','ok');filterProd();
}
window.openProdForm=openProdForm;window.saveProd=saveProd;window.delProd=delProd;

// ─── MESCLAR DUPLICATAS ───────────────────────────────────────────────────────
function _findDuplicateGroups(d){
  const groups=[];const seen=new Set();
  const bySku={};
  d.products.forEach(p=>{if(p.sku&&p.sku.trim()){const k=p.sku.trim().toUpperCase();(bySku[k]=bySku[k]||[]).push(p);}});
  Object.values(bySku).filter(g=>g.length>1).forEach(g=>{g.forEach(p=>seen.add(p.id));groups.push({key:'SKU: '+g[0].sku,prods:g});});
  const byName={};
  d.products.filter(p=>!seen.has(p.id)).forEach(p=>{const k=p.name.trim().toLowerCase();(byName[k]=byName[k]||[]).push(p);});
  Object.values(byName).filter(g=>g.length>1).forEach(g=>{groups.push({key:'Nome: '+g[0].name,prods:g});});
  return groups;
}
function openMergeDuplicates(){
  const d=gdb();
  const groups=_findDuplicateGroups(d);
  if(!groups.length){toast('Nenhuma duplicata encontrada!','ok');return;}
  const opCount=pid=>d.ops.filter(o=>o.items&&o.items.some(i=>i.pid===pid)).length;
  const stockQty=pid=>{const s=d.stock[pid];return s!=null?fnum(s.qty||s)+' un.':'Sem estoque';};
  let body='<p style="color:var(--muted);margin-bottom:16px">'+groups.length+' grupo(s) encontrado(s). Escolha qual manter — o outro será removido e suas referências transferidas.</p>';
  groups.forEach((g,gi)=>{
    body+='<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">'+
      '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">'+esc(g.key)+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">'+
      g.prods.map(p=>{
        const ops=opCount(p.id);const stk=stockQty(p.id);
        return'<div style="background:var(--bg-card2);border:1px solid var(--border);border-radius:6px;padding:12px">'+
          '<div style="font-weight:600;margin-bottom:4px;font-size:13px">'+esc(p.name)+'</div>'+
          '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">'+
          (p.sku?'<span class="sku" style="margin-right:6px">'+esc(p.sku)+'</span>':'<span style="color:var(--muted)">Sem SKU</span> ')+
          ' · '+ops+' OP(s) · '+stk+'</div>'+
          '<button class="btn btn-green btn-sm" onclick="executeMerge(\''+p.id+'\',\''+gi+'\')" style="width:100%">✅ Manter este</button>'+
          '</div>';
      }).join('')+'</div></div>';
  });
  window._mergeGroups=groups;
  Mopen('🔀 Mesclar Produtos Duplicados',body,'<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>');
}
function executeMerge(primaryId,groupIdx){
  const g=window._mergeGroups&&window._mergeGroups[+groupIdx];if(!g)return;
  const secondaryIds=g.prods.map(p=>p.id).filter(id=>id!==primaryId);if(!secondaryIds.length)return;
  const d=gdb();const primary=d.products.find(p=>p.id===primaryId);if(!primary){toast('Produto não encontrado','err');return;}
  let totalOpsUpdated=0;
  secondaryIds.forEach(secId=>{
    const secondary=d.products.find(p=>p.id===secId);if(!secondary)return;
    d.ops.forEach(op=>{(op.items||[]).forEach(item=>{if(item.pid===secId){item.pid=primaryId;item.productName=primary.name;item.sku=primary.sku||item.sku;totalOpsUpdated++;}});});
    const ps=d.stock[primaryId],ss=d.stock[secId];
    if(!ps&&ss){d.stock[primaryId]=ss;}else if(ps&&ss&&(ss.qty||ss)>(ps.qty||ps)){d.stock[primaryId]=ss;}
    delete d.stock[secId];
    d.products=d.products.filter(p=>p.id!==secId);
    logAction(d,'Produto mesclado','['+( secondary.sku||'—')+'] '+secondary.name+' → '+primary.name);
  });
  sdb(d);toast('Mesclado! '+totalOpsUpdated+' referência(s) de OP atualizadas.','ok');
  setTimeout(()=>{const remaining=_findDuplicateGroups(gdb());if(remaining.length){openMergeDuplicates();}else{Mclose();toast('Todas as duplicatas resolvidas!','ok');filterProd();}},200);
}
window.openMergeDuplicates=openMergeDuplicates;window.executeMerge=executeMerge;

// ═══════════════════════════════════════════════
// ── CLIENTES ─────────────────────────────────
// ═══════════════════════════════════════════════
function tabCli(){
  const sc=el('stcontent');
  sc.innerHTML='<div class="card">'+
    '<div class="card-header"><div class="card-title">Clientes</div><button class="btn btn-green btn-sm" onclick="openCliForm()">+ Novo Cliente</button></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:16px">'+
    '<input class="sinput" id="srch-c" placeholder="🔍 Buscar por nome do cliente..." oninput="filterCli()" style="flex:1;max-width:380px">'+
    '</div>'+
    '<div class="tw" id="cli-tbl"></div></div>';
  filterCli();
}
window.tabCli=tabCli;

function filterCli(){
  const d=gdb();
  const q=(v('srch-c')||'').toLowerCase();
  const cls=d.clients.filter(c=>!q||c.name.toLowerCase().includes(q));
  const t=el('cli-tbl');if(!t)return;
  if(!cls.length){t.innerHTML='<div class="empty"><div class="ei">👤</div><p>Nenhum cliente encontrado</p></div>';return;}
  t.innerHTML='<table><thead><tr><th>Nome</th><th>Contato</th><th>Telefone</th><th>OPs</th><th></th></tr></thead><tbody>'+
    cls.map(c=>{
      const opCount=d.ops.filter(o=>o.clientId===c.id).length;
      const delBtn=opCount>0
        ?'<span style="font-size:12px;color:var(--muted)">'+opCount+' OP(s) vinculada(s)</span>'
        :'<button class="btn btn-danger btn-sm" onclick="delCli(\''+c.id+'\')">🗑️</button>';
      return'<tr>'+
        '<td><strong>'+esc(c.name)+'</strong></td>'+
        '<td>'+esc(c.contact||'—')+'</td>'+
        '<td>'+esc(c.phone||'—')+'</td>'+
        '<td style="font-size:13px">'+opCount+'</td>'+
        '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="openCliForm(\''+c.id+'\')">✏️</button> '+delBtn+'</td></tr>';
    }).join('')+
  '</tbody></table>';
}
window.filterCli=filterCli;

function openCliForm(id){
  const d=gdb(),c=id?d.clients.find(x=>x.id===id):null;
  Mopen(c?'Editar Cliente':'Novo Cliente',
    '<div class="fgrid"><div class="fg s2"><label>Nome *</label><input type="text" id="cf-name" value="'+esc(c?c.name:'')+'" placeholder="Razão social completa"></div>'+
    '<div class="fg"><label>Contato</label><input type="text" id="cf-contact" value="'+esc(c&&c.contact?c.contact:'')+'"></div>'+
    '<div class="fg"><label>Telefone</label><input type="text" id="cf-phone" value="'+esc(c&&c.phone?c.phone:'')+'"></div>'+
    '<div class="fg s2"><label>E-mail</label><input type="email" id="cf-email" value="'+esc(c&&c.email?c.email:'')+'"></div>'+
    '<div class="fg s2"><label>Observações</label><textarea id="cf-obs">'+esc(c&&c.obs?c.obs:'')+'</textarea></div></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button><button class="btn btn-green" onclick="saveCli(\''+( id||'')+'\')">💾 Salvar</button>'
  );
}
function saveCli(id){
  const name=v('cf-name').trim();
  if(!name){toast('Nome obrigatório','err');return;}
  const d=gdb();
  const obj={name,contact:v('cf-contact'),phone:v('cf-phone'),email:v('cf-email'),obs:v('cf-obs')};
  if(id){const i=d.clients.findIndex(x=>x.id===id);d.clients[i]={...d.clients[i],...obj};}
  else d.clients.push({id:uid(),...obj});
  logAction(d,id?'Cliente editado':'Cliente criado',obj.name);
  sdb(d);Mclose();toast('Cliente salvo!','ok');filterCli();
}
function delCli(id){
  const d=gdb();
  if(d.ops.some(o=>o.clientId===id)){toast('Não é possível excluir um cliente com OPs vinculadas.','err');return;}
  if(!confirm('Excluir cliente permanentemente?'))return;
  d.clients=d.clients.filter(c=>c.id!==id);
  sdb(d);toast('Cliente excluído','ok');filterCli();
}
window.openCliForm=openCliForm;window.saveCli=saveCli;window.delCli=delCli;

// ═══════════════════════════════════════════════
// ── FORNECEDORES ──────────────────────────────
// ═══════════════════════════════════════════════
function tabCadForn(){
  const sc=el('stcontent');
  sc.innerHTML='<div class="card">'+
    '<div class="card-header"><div class="card-title">🏭 Fornecedores Cadastrados</div>'+
    '<button class="btn btn-green btn-sm" onclick="openFornForm()">+ Novo Fornecedor</button></div>'+
    '<div style="display:flex;gap:8px;margin-bottom:16px">'+
    '<input class="sinput" id="forn-srch" placeholder="🔍 Buscar por nome ou CNPJ..." oninput="_renderFornTable()" style="flex:1;max-width:380px">'+
    '</div>'+
    '<div class="tw" id="forn-tbl"></div></div>';
  _renderFornTable();
}
window.tabCadForn=tabCadForn;

function _renderFornTable(){
  const d=gdb(),t=el('forn-tbl');if(!t)return;
  const q=(v('forn-srch')||'').toLowerCase();
  let items=[...d.suppliers];
  if(q)items=items.filter(s=>s.name.toLowerCase().includes(q)||(s.cnpj||'').includes(q));
  if(!items.length){t.innerHTML='<div class="empty"><div class="ei">🏭</div><p>Nenhum fornecedor encontrado</p></div>';return;}
  t.innerHTML='<table><thead><tr><th>Nome</th><th>CNPJ</th><th></th></tr></thead><tbody>'+
    items.map(s=>'<tr>'+
      '<td><strong>'+esc(s.name)+'</strong></td>'+
      '<td><span class="sku">'+esc(s.cnpj||'—')+'</span></td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" onclick="openFornForm(\''+s.id+'\')">✏️</button> '+
        (S&&_roles(S).includes('admin')?'<button class="btn btn-danger btn-sm" onclick="delForn(\''+s.id+'\')">🗑️</button>':'')+
      '</td></tr>'
    ).join('')+'</tbody></table>';
}
window._renderFornTable=_renderFornTable;

function openFornForm(id){
  const d=gdb(),s=id?d.suppliers.find(x=>x.id===id):null;
  Mopen(s?'Editar Fornecedor':'Novo Fornecedor',
    '<div class="fg"><label>Nome *</label><input type="text" id="fn-name" value="'+esc(s?s.name:'')+'" placeholder="Razão social ou nome fantasia"></div>'+
    '<div class="fg"><label>CNPJ</label><input class="sinput" type="text" id="fn-cnpj" value="'+esc(s?maskCNPJ(s.cnpj||''):'')+'" placeholder="00.000.000/0000-00" maxlength="18" oninput="this.value=maskCNPJ(this.value)"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveForn(\''+( id||'')+'\')">💾 Salvar</button>'
  );
}
function saveForn(id){
  const name=v('fn-name').trim(),cnpj=v('fn-cnpj').trim();
  if(!name){toast('Nome obrigatório','err');return;}
  const d=gdb();
  if(id){const idx=d.suppliers.findIndex(x=>x.id===id);if(idx>=0)d.suppliers[idx]={...d.suppliers[idx],name,cnpj};}
  else{d.suppliers.push({id:_nid(),name,cnpj,createdAt:Date.now()});}
  sdb(d);Mclose();toast(id?'Fornecedor atualizado':'Fornecedor cadastrado','ok');_renderFornTable();
}
function delForn(id){
  if(!confirm('Excluir este fornecedor?'))return;
  const d=gdb();d.suppliers=d.suppliers.filter(x=>x.id!==id);
  sdb(d);toast('Excluído','ok');_renderFornTable();
}
window.openFornForm=openFornForm;window.saveForn=saveForn;window.delForn=delForn;

// ═══════════════════════════════════════════════
// ── MATÉRIA-PRIMA ─────────────────────────────
// ═══════════════════════════════════════════════
function tabCadMP(){
  const sc=el('stcontent');
  sc.innerHTML='<div class="card">'+
    '<div class="card-header"><div class="card-title">🌿 Matérias-Primas Cadastradas</div>'+
    '<button class="btn btn-green btn-sm" onclick="openRMForm()">+ Nova Matéria-Prima</button></div>'+
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">'+
    '<input class="sinput" id="rm-srch" placeholder="🔍 Buscar por código ou nome..." oninput="_filterRMTable()" style="flex:1;min-width:180px;max-width:320px">'+
    '<select class="sselect" id="rm-flt-setor" onchange="_filterRMTable()"><option value="">Todos os setores</option>'+_SETORES.map(s=>'<option value="'+s.v+'">'+s.l+'</option>').join('')+'</select>'+
    '</div>'+
    '<div class="tw" id="rm-tbl"></div></div>';
  _filterRMTable();
}
window.tabCadMP=tabCadMP;

function _filterRMTable(){
  const d=gdb(),t=el('rm-tbl');if(!t)return;
  const q=(el('rm-srch')?el('rm-srch').value.trim().toLowerCase():'');
  const fSetor=el('rm-flt-setor')?el('rm-flt-setor').value:'';
  let items=[...d.rawMaterials];
  if(q)items=items.filter(m=>m.name.toLowerCase().includes(q)||(m.code||'').toLowerCase().includes(q));
  if(fSetor)items=items.filter(m=>m.setor===fSetor);
  if(!items.length){t.innerHTML='<div class="empty"><div class="ei">🌿</div><p>Nenhuma matéria-prima encontrada</p></div>';return;}
  t.innerHTML='<table><thead><tr><th>Código</th><th>Nome</th><th>Un.</th><th>Tipo</th><th>Setor</th><th>Est. Mínimo</th><th></th></tr></thead><tbody>'+
    items.map(m=>'<tr>'+
      '<td><span class="sku">'+esc(m.code)+'</span></td>'+
      '<td><strong>'+esc(m.name)+'</strong></td>'+
      '<td><span class="bs bs-pendente" style="font-size:11px">'+esc(m.unit||'KG')+'</span></td>'+
      '<td>'+_tipoBadge(m.tipo||'mp')+'</td>'+
      '<td>'+_setorBadge(m.setor,m.setorCustom)+'</td>'+
      '<td>'+(m.minStock?fqty(m.minStock,m.unit||'KG')+' '+(m.unit||'KG'):'<span style="color:var(--muted)">—</span>')+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" onclick="openRMForm(\''+m.id+'\')">✏️</button> '+
        (S&&_roles(S).includes('admin')?'<button class="btn btn-danger btn-sm" onclick="delRM(\''+m.id+'\')">🗑️</button>':'')+
      '</td></tr>'
    ).join('')+'</tbody></table>';
}
window._filterRMTable=_filterRMTable;

function openRMForm(id){
  const d=gdb(),m=id?d.rawMaterials.find(x=>x.id===id):null;
  const setorSel=m?m.setor:'';const rmUnit=m?m.unit||'KG':'KG';
  Mopen(m?'Editar Matéria-Prima':'Nova Matéria-Prima',
    '<div class="fgrid">'+
    '<div class="fg"><label>Código *</label><input type="text" id="rm-code" value="'+esc(m?m.code:'')+'" placeholder="Ex: MP-001"></div>'+
    _unitSel('rm-unit',rmUnit,'KG')+
    '</div>'+
    '<div class="fg"><label>Nome *</label><input type="text" id="rm-name" value="'+esc(m?m.name:'')+'" placeholder="Ex: Arame Galvanizado"></div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Estoque Mínimo</label><input type="number" id="rm-min" value="'+(m&&m.minStock?m.minStock:'')+'" placeholder="0" min="0" step="0.0001"></div>'+
    '<div class="fg"><label>Setor</label><select id="rm-setor" onchange="_toggleSetorCustom(\'rm\')"><option value="">Selecione...</option>'+_setorOpts(setorSel)+'</select></div>'+
    '</div>'+
    _setorCustomField('rm',setorSel).replace('id="rm-setor-custom"','id="rm-setor-custom" value="'+esc(m?m.setorCustom||'':'')+'\"'),
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveRM(\''+( id||'')+'\')">💾 Salvar</button>'
  );
}
function saveRM(id){
  const code=v('rm-code').trim(),name=v('rm-name').trim(),unit=v('rm-unit')||'KG';
  const min=_parseQty(v('rm-min'),unit);
  const setor=v('rm-setor')||'';
  const setorCustom=setor==='outros'?(v('rm-setor-custom')||'').trim():'';
  if(!code||!name){toast('Código e nome obrigatórios','err');return;}
  if(setor==='outros'&&!setorCustom){toast('Especifique o setor','err');return;}
  const d=gdb();
  const obj={code,name,unit,minStock:min||undefined,tipo:'mp',setor:setor||undefined,setorCustom:setorCustom||undefined};
  if(id){const idx=d.rawMaterials.findIndex(x=>x.id===id);if(idx>=0)d.rawMaterials[idx]={...d.rawMaterials[idx],...obj};}
  else{
    if(d.rawMaterials.some(x=>x.code.toLowerCase()===code.toLowerCase())){toast('Código já cadastrado','err');return;}
    d.rawMaterials.push({id:_nid(),createdAt:Date.now(),...obj});
  }
  sdb(d);Mclose();toast(id?'Matéria-prima atualizada':'Matéria-prima cadastrada','ok');_filterRMTable();
}
function delRM(id){
  if(!confirm('Excluir esta matéria-prima?'))return;
  const d=gdb();d.rawMaterials=d.rawMaterials.filter(x=>x.id!==id);
  delete d.rawMaterialStock[id];
  d.rawMaterialMovements=(d.rawMaterialMovements||[]).filter(m=>m.itemId!==id);
  sdb(d);toast('Excluída','ok');_filterRMTable();
}
window.openRMForm=openRMForm;window.saveRM=saveRM;window.delRM=delRM;

// ═══════════════════════════════════════════════
// ── EMBALAGENS ────────────────────────────────
// ═══════════════════════════════════════════════
function tabCadEmb(){
  const sc=el('stcontent');
  sc.innerHTML='<div class="card">'+
    '<div class="card-header"><div class="card-title">📦 Embalagens Cadastradas</div>'+
    '<button class="btn btn-green btn-sm" onclick="openEmbForm()">+ Nova Embalagem</button></div>'+
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">'+
    '<input class="sinput" id="emb-srch" placeholder="🔍 Buscar por código ou nome..." oninput="_filterEmbTable()" style="flex:1;min-width:180px;max-width:320px">'+
    '<select class="sselect" id="emb-flt-setor" onchange="_filterEmbTable()"><option value="">Todos os setores</option>'+_SETORES.map(s=>'<option value="'+s.v+'">'+s.l+'</option>').join('')+'</select>'+
    '</div>'+
    '<div class="tw" id="emb-tbl"></div></div>';
  _filterEmbTable();
}
window.tabCadEmb=tabCadEmb;

function _filterEmbTable(){
  const d=gdb(),t=el('emb-tbl');if(!t)return;
  const q=(el('emb-srch')?el('emb-srch').value.trim().toLowerCase():'');
  const fSetor=el('emb-flt-setor')?el('emb-flt-setor').value:'';
  let items=[...d.packaging];
  if(q)items=items.filter(p=>p.name.toLowerCase().includes(q)||(p.code||'').toLowerCase().includes(q));
  if(fSetor)items=items.filter(p=>p.setor===fSetor);
  if(!items.length){t.innerHTML='<div class="empty"><div class="ei">📦</div><p>Nenhuma embalagem encontrada</p></div>';return;}
  t.innerHTML='<table><thead><tr><th>Código</th><th>Nome</th><th>Un.</th><th>Tipo</th><th>Setor</th><th>Est. Mínimo</th><th></th></tr></thead><tbody>'+
    items.map(p=>'<tr>'+
      '<td><span class="sku">'+esc(p.code)+'</span></td>'+
      '<td><strong>'+esc(p.name)+'</strong></td>'+
      '<td><span class="bs bs-pendente" style="font-size:11px">'+esc(p.unit||'UN')+'</span></td>'+
      '<td>'+_tipoBadge('emb')+'</td>'+
      '<td>'+_setorBadge(p.setor,p.setorCustom)+'</td>'+
      '<td>'+(p.minStock?fqty(p.minStock,p.unit||'UN')+' '+(p.unit||'UN'):'<span style="color:var(--muted)">—</span>')+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" onclick="openEmbForm(\''+p.id+'\')">✏️</button> '+
        (S&&_roles(S).includes('admin')?'<button class="btn btn-danger btn-sm" onclick="delEmb(\''+p.id+'\')">🗑️</button>':'')+
      '</td></tr>'
    ).join('')+'</tbody></table>';
}
window._filterEmbTable=_filterEmbTable;

function openEmbForm(id){
  const d=gdb(),p=id?d.packaging.find(x=>x.id===id):null;
  const setorSel=p?p.setor:'';
  Mopen(p?'Editar Embalagem':'Nova Embalagem',
    '<div class="fgrid">'+
    '<div class="fg"><label>Código *</label><input type="text" id="emb-code" value="'+esc(p?p.code:'')+'" placeholder="Ex: EMB-001"></div>'+
    _unitSel('emb-unit',p?p.unit:'','UN')+
    '</div>'+
    '<div class="fg"><label>Nome *</label><input type="text" id="emb-name" value="'+esc(p?p.name:'')+'" placeholder="Ex: Caixa Papelão 30x20x10"></div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Estoque Mínimo</label><input type="number" id="emb-min" value="'+(p&&p.minStock?p.minStock:'')+'" placeholder="0" min="0" step="0.0001"></div>'+
    '<div class="fg"><label>Setor</label><select id="emb-setor" onchange="_toggleSetorCustom(\'emb\')"><option value="">Selecione...</option>'+_setorOpts(setorSel)+'</select></div>'+
    '</div>'+
    _setorCustomField('emb',setorSel).replace('id="emb-setor-custom"','id="emb-setor-custom" value="'+esc(p?p.setorCustom||'':'')+'\"'),
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveEmb(\''+( id||'')+'\')">💾 Salvar</button>'
  );
}
function saveEmb(id){
  const code=v('emb-code').trim(),name=v('emb-name').trim(),unit=v('emb-unit')||'UN';
  const min=_parseQty(v('emb-min'),unit);
  const setor=v('emb-setor')||'';
  const setorCustom=setor==='outros'?(v('emb-setor-custom')||'').trim():'';
  if(!code||!name){toast('Código e nome obrigatórios','err');return;}
  if(setor==='outros'&&!setorCustom){toast('Especifique o setor','err');return;}
  const d=gdb();
  const obj={code,name,unit,minStock:min||undefined,tipo:'emb',setor:setor||undefined,setorCustom:setorCustom||undefined};
  if(id){const idx=d.packaging.findIndex(x=>x.id===id);if(idx>=0)d.packaging[idx]={...d.packaging[idx],...obj};}
  else{
    if(d.packaging.some(x=>x.code.toLowerCase()===code.toLowerCase())){toast('Código já cadastrado','err');return;}
    d.packaging.push({id:_nid(),createdAt:Date.now(),...obj});
  }
  sdb(d);Mclose();toast(id?'Embalagem atualizada':'Embalagem cadastrada','ok');_filterEmbTable();
}
function delEmb(id){
  if(!confirm('Excluir esta embalagem?'))return;
  const d=gdb();d.packaging=d.packaging.filter(x=>x.id!==id);
  delete d.packagingStock[id];
  if(d.packagingStockAt)delete d.packagingStockAt[id];
  d.packagingMovements=(d.packagingMovements||[]).filter(m=>m.itemId!==id);
  sdb(d);toast('Excluída','ok');_filterEmbTable();
}
window.openEmbForm=openEmbForm;window.saveEmb=saveEmb;window.delEmb=delEmb;

// Helper para ID sequencial de MPs e Embalagens (sem - UUID)
function _nid(){return 'M'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}

// ═══════════════════════════════════════════════════════════════════════════
// ── ABA PREFORMADOS ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
const _PRF_TIPOS=['ALCA','LACO','DERIVACAO'];
const _PRF_MATS=['AC CCE','AL CABO OPTICO'];

function _prfGenName(tipo,mat,rmin,rmax,cor,varetas,compr){
  return tipo+' PRF '+mat+' '+parseFloat(rmin).toFixed(2)+' - '+parseFloat(rmax).toFixed(2)+'mm '+cor.trim().toUpperCase()+' '+varetas+'V '+compr+'mm';
}

function tabCadPref(){
  const c=el('stcontent');if(!c)return;
  c.innerHTML=
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">'+
    '<input class="sinput" id="pref-srch" placeholder="🔍 Buscar preformado..." oninput="_filterPrefTable()" style="flex:1">'+
    '<button class="btn btn-green btn-sm" onclick="openPrefForm()">➕ Novo Preformado</button>'+
    '</div>'+
    '<div id="pref-table"></div>';
  _filterPrefTable();
}
window.tabCadPref=tabCadPref;

function _filterPrefTable(){
  const q=(v('pref-srch')||'').toLowerCase();
  const d=gdb();
  const items=(d.preformados||[]).filter(p=>!q||(p.name||'').toLowerCase().includes(q)||(p.cor||'').toLowerCase().includes(q));
  const t=el('pref-table');if(!t)return;
  if(!items.length){t.innerHTML='<div class="empty"><div class="ei">🧵</div><div>Nenhum preformado cadastrado</div></div>';return;}
  t.innerHTML='<table><thead><tr><th>Nome</th><th>Tipo</th><th>Material</th><th>Range (mm)</th><th>Varetas</th><th>Compr.</th><th></th></tr></thead><tbody>'+
    items.map(p=>'<tr>'+
      '<td style="font-size:13px;font-weight:600">'+esc(p.name)+'</td>'+
      '<td><span class="bs bs-info">'+esc(p.tipo)+'</span></td>'+
      '<td style="font-size:12px;color:var(--muted)">'+esc(p.material)+'</td>'+
      '<td style="font-size:12px">'+parseFloat(p.rangeMin).toFixed(2)+' – '+parseFloat(p.rangeMax).toFixed(2)+'</td>'+
      '<td style="text-align:center">'+esc(p.varetas)+'V</td>'+
      '<td style="text-align:center">'+esc(p.comprimento)+'mm</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" onclick="openPrefForm(\''+p.id+'\')">✏️</button> '+
        '<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="delPref(\''+p.id+'\')">🗑️</button>'+
      '</td>'+
    '</tr>').join('')+'</tbody></table>';
}
window._filterPrefTable=_filterPrefTable;

function _prfFormHtml(p){
  const tipoOpts=_PRF_TIPOS.map(t=>'<option value="'+t+'"'+(p&&p.tipo===t?' selected':'')+'>'+t+'</option>').join('');
  const matOpts=_PRF_MATS.map(m=>'<option value="'+m+'"'+(p&&p.material===m?' selected':'')+'>'+m+'</option>').join('');
  return '<div class="fgrid">'+
    '<div class="fg"><label>Tipo *</label><select id="prf-tipo" class="sinput" onchange="_prfUpdateName()">'+tipoOpts+'</select></div>'+
    '<div class="fg"><label>Material *</label><select id="prf-mat" class="sinput" onchange="_prfUpdateName()">'+matOpts+'</select></div>'+
    '</div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Range Min (mm) *</label><input type="number" id="prf-rmin" step="0.01" class="sinput" value="'+(p?p.rangeMin:'')+'" oninput="_prfUpdateName()"></div>'+
    '<div class="fg"><label>Range Max (mm) *</label><input type="number" id="prf-rmax" step="0.01" class="sinput" value="'+(p?p.rangeMax:'')+'" oninput="_prfUpdateName()"></div>'+
    '</div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Cor *</label><input type="text" id="prf-cor" class="sinput" value="'+(p?esc(p.cor):'')+'" placeholder="Ex: VERDE" oninput="_prfUpdateName()"></div>'+
    '<div class="fg"><label>Varetas *</label><input type="number" id="prf-var" min="1" class="sinput" value="'+(p?p.varetas:'')+'" oninput="_prfUpdateName()"></div>'+
    '<div class="fg"><label>Comprimento (mm) *</label><input type="number" id="prf-compr" class="sinput" value="'+(p?p.comprimento:'')+'" oninput="_prfUpdateName()"></div>'+
    '</div>'+
    '<div class="fg" style="margin-top:8px">'+
      '<label style="font-size:11px;color:var(--muted)">Nome gerado automaticamente:</label>'+
      '<div id="prf-name-preview" style="font-size:13px;font-weight:600;color:var(--green);padding:8px 10px;background:rgba(34,197,94,.08);border-radius:6px;margin-top:4px;min-height:32px">'+(p?esc(p.name):'—')+'</div>'+
    '</div>'+
    '<div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px">'+
    '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Dados opcionais (preenchidos após formação):</div>'+
    '<div class="fgrid">'+
    '<div class="fg"><label>Peso varetas (kg)</label><input type="number" id="prf-pv" step="0.001" class="sinput" value="'+(p&&p.pesoVarietas?p.pesoVarietas:'')+'" placeholder="0,000"></div>'+
    '<div class="fg"><label>Peso total unit. (kg)</label><input type="number" id="prf-pt" step="0.001" class="sinput" value="'+(p&&p.pesoTotal?p.pesoTotal:'')+'" placeholder="0,000"></div>'+
    '<div class="fg"><label>Qtd por caixa</label><input type="number" id="prf-qcx" min="1" class="sinput" value="'+(p&&p.qtdPorCaixa?p.qtdPorCaixa:'')+'" placeholder="Ex: 10"></div>'+
    '</div></div>';
}

function _prfUpdateName(){
  const tipo=v('prf-tipo'),mat=v('prf-mat');
  const rmin=parseFloat(v('prf-rmin')),rmax=parseFloat(v('prf-rmax'));
  const cor=(v('prf-cor')||'').trim();const varetas=parseInt(v('prf-var')||0),compr=parseInt(v('prf-compr')||0);
  const prev=el('prf-name-preview');if(!prev)return;
  if(!tipo||!mat||isNaN(rmin)||isNaN(rmax)||!cor||!varetas||!compr){prev.textContent='— (preencha todos os campos obrigatórios)';return;}
  prev.textContent=_prfGenName(tipo,mat,rmin,rmax,cor,varetas,compr);
}
window._prfUpdateName=_prfUpdateName;

let _editPrfId=null;
function openPrefForm(id){
  const d=gdb();const p=id?(d.preformados||[]).find(x=>x.id===id):null;
  _editPrfId=id||null;
  Mopen((p?'Editar':'Novo')+' Preformado',_prfFormHtml(p),
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="savePref()">💾 Salvar</button>');
}
window.openPrefForm=openPrefForm;

function savePref(){
  const tipo=v('prf-tipo'),mat=v('prf-mat');
  const rmin=parseFloat(v('prf-rmin')),rmax=parseFloat(v('prf-rmax'));
  const cor=(v('prf-cor')||'').trim().toUpperCase();
  const varetas=parseInt(v('prf-var')||0),compr=parseInt(v('prf-compr')||0);
  if(!tipo||!mat||isNaN(rmin)||isNaN(rmax)||!cor||!varetas||!compr){toast('Preencha todos os campos obrigatórios','err');return;}
  const pesoVarietas=parseFloat(v('prf-pv'))||null;
  const pesoTotal=parseFloat(v('prf-pt'))||null;
  const qtdPorCaixa=parseInt(v('prf-qcx'))||null;
  const name=_prfGenName(tipo,mat,rmin,rmax,cor,varetas,compr);
  const d=gdb();if(!d.preformados)d.preformados=[];
  const obj={tipo,material:mat,rangeMin:rmin,rangeMax:rmax,cor,varetas,comprimento:compr,pesoVarietas,pesoTotal,qtdPorCaixa,name};
  if(_editPrfId){
    const i=d.preformados.findIndex(x=>x.id===_editPrfId);
    if(i>=0)d.preformados[i]={...d.preformados[i],...obj};
  }else{
    d.preformados.push({id:'PRF'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),...obj});
  }
  sdb(d);Mclose();toast('Preformado salvo','ok');_filterPrefTable();
}
window.savePref=savePref;

function delPref(id){
  if(!confirm('Excluir este preformado? O estoque associado também será removido.'))return;
  const d=gdb();
  d.preformados=(d.preformados||[]).filter(x=>x.id!==id);
  if(d.preformadosStock)delete d.preformadosStock[id];
  sdb(d);toast('Excluído','ok');_filterPrefTable();
}
window.delPref=delPref;
