// ═══════════════════════════════════════════════════════════════════════════
// pedidos.js — Upload de OP (PDF + Manual), Parser Olist, OP Review
// v2.0 TGL Flow
// ═══════════════════════════════════════════════════════════════════════════

let _draft=null,_newProds=[];

function rPedidos(cnt){
  cnt.innerHTML='<div class="ptitle">📤 Pedidos</div>'+
    '<div class="stabs">'+
    '<button class="stab on" id="st-up" onclick="pstab(\'up\')">Upload de OP</button>'+
    '</div>'+
    '<div id="stcontent"></div>';
  tabUpload();
}
window.rPedidos=rPedidos;

function pstab(t){
  document.querySelectorAll('.stab[id^="st-"]').forEach(b=>b.classList.remove('on'));
  const bt=el('st-'+t);if(bt)bt.classList.add('on');
  if(t==='up')tabUpload();
}
window.pstab=pstab;

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
function tabUpload(){
  const sc=el('stcontent');
  sc.innerHTML=`<div class="card">
    <div class="card-title" style="margin-bottom:4px">📤 Upload de Ordem de Produção</div>
    <div class="card-sub" style="margin-bottom:20px">Envie o PDF de Separação gerado pelo ERP Olist</div>
    <div class="upzone" id="upzone" onclick="el('ufile').click()"
      ondragover="event.preventDefault();this.classList.add('drag')"
      ondragleave="this.classList.remove('drag')"
      ondrop="dropFile(event)">
      <div class="upicon">📄</div>
      <p><strong>Clique para selecionar</strong> ou arraste o PDF aqui</p>
      <p style="margin-top:6px;font-size:12px">Formato: ERP Olist – Separação de mercadorias</p>
      <input type="file" id="ufile" accept=".pdf" style="display:none" onchange="pickFile(event)">
    </div>
    <div style="text-align:center;margin-top:18px">
      <span style="color:var(--muted);font-size:13px">— ou —</span><br>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-outline btn-sm" onclick="openManualOP()">✏️ Inserir manualmente</button>
        <button class="btn btn-outline btn-sm" onclick="importarOlist()">🔄 Importar do Olist</button>
      </div>
    </div>
  </div>`;
}
window.tabUpload=tabUpload;

function dropFile(e){
  e.preventDefault();el('upzone').classList.remove('drag');
  const f=e.dataTransfer.files[0];
  if(f&&f.type==='application/pdf')processFile(f);
  else toast('Envie um arquivo PDF','err');
}
function pickFile(e){const f=e.target.files[0];if(f)processFile(f);}
window.dropFile=dropFile;window.pickFile=pickFile;

async function processFile(file){
  el('upzone').innerHTML='<div class="loading"><span class="spin"></span> Lendo PDF...</div>';
  try{
    // Carrega pdf.js da CDN se ainda não carregado
    if(typeof pdfjsLib==='undefined'){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload=res;s.onerror=rej;document.head.appendChild(s);
      });
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let txt='';
    for(let i=1;i<=pdf.numPages;i++){
      const pg=await pdf.getPage(i);
      const ct=await pg.getTextContent();
      txt+=ct.items.map(x=>x.str).join(' ')+'\n';
    }
    const parsed=parseOlist(txt);
    openOPReview(parsed,file.name);
  }catch(err){
    console.error(err);
    toast('Erro ao ler PDF – use entrada manual','warn');
    tabUpload();
    setTimeout(()=>openManualOP(),200);
  }
}
window.processFile=processFile;

// ─── OLIST PARSER ─────────────────────────────────────────────────────────────
function parseOlist(txt){
  const t=txt.replace(/\s+/g,' ').trim();

  const omatch=t.match(/Pedido\s*(\d+)/i);
  const opNum=omatch?omatch[1]:'';

  const cmatch=t.match(/Pedido\s*\d+\s+(.+?)\s+([\s]*(Transportadora|Retirar\s+pessoalmente))/i);
  const clientRaw=cmatch?cmatch[1].split('')[0]:'';
  const suffixM=clientRaw.match(/^(.+?)\s+(LTDA|EIRELI|EPP|ME|S\.?A\.?|S\/A)\b/i);
  const clientTrunc=suffixM?suffixM[1]+' '+suffixM[2]:clientRaw;
  const clientName=(clientTrunc||clientRaw).replace(/\s+/g,' ').trim().replace(/[^a-zA-ZÀ-ÿ0-9 .\-\/]/g,'').trim();
  const coletaRaw=cmatch?cmatch[3]:'';
  const coleta=coletaRaw.toLowerCase().includes('retirar')?'retirar':'transportadora';

  const hEnd=cmatch?t.indexOf(cmatch[2])+cmatch[2].length:0;
  const bodyRaw=(hEnd>0?t.slice(hEnd).trim():t);
  const anotM=bodyRaw.match(/Anota[çc][oõ]es\s*/i);
  const itemsStart=anotM?anotM.index+anotM[0].length:0;
  const body=bodyRaw.slice(itemsStart).replace(/[-]/g,' ').replace(/\s+/g,' ').trim();
  const itemRx=/([A-ZÁÉÍÓÚÀÂÃÊÔÇÕ][A-ZÁÉÍÓÚÀÂÃÊÔÇÕa-záéíóúàâãêôçõ\s\d\/\.\-\(\)\+,'"]+?)\s+(TGL[A-Z]\d+)\s+([\d.]+),00\s+([A-Z]+)/g;
  const items=[];
  let m;
  while((m=itemRx.exec(body))!==null){
    const rawName=m[1].replace(/\s+/g,' ').trim();
    const name=rawName
      .replace(/^(?:[A-Z]{1,3}\d+\.\d+[A-Z]{0,3}\s+)+/,'')
      .replace(/\s*\(\s*[\d.,]+\s*\)\s*$/,'')
      .replace(/\s+/g,' ').trim();
    if(name.length<3||/^(Produto|Separaç)/i.test(name))continue;
    items.push({productName:name,sku:m[2],qty:parseFloat(m[3].replace(/\./g,''))||0,unit:m[4]});
  }

  return{opNum,clientName,coleta,items};
}
window.parseOlist=parseOlist;

// ─── OP REVIEW ────────────────────────────────────────────────────────────────
async function openOPReview(parsed,fname){
  _draft={...parsed};_newProds=[];
  const d=gdb();

  let cli=d.clients.find(c=>c.name.toLowerCase()===parsed.clientName.toLowerCase());
  if(!cli&&parsed.clientName){
    cli={id:uid(),name:parsed.clientName,contact:'',phone:'',email:'',obs:''};
    d.clients.push(cli);sdb(d);
  }
  _draft.clientId=cli?cli.id:'';
  _draft.clientName=parsed.clientName;

  _draft.items=parsed.items.map(item=>{
    const bySku=d.products.find(x=>x.sku&&x.sku.toUpperCase()===item.sku.toUpperCase());
    if(bySku){
      const diff=item.productName.trim().toLowerCase()!==bySku.name.trim().toLowerCase();
      return{...item,pid:bySku.id,isNew:false,_nmMismatch:diff?{pdfName:item.productName.trim(),regName:bySku.name.trim()}:null};
    }
    const byName=d.products.find(x=>x.name.toLowerCase()===item.productName.toLowerCase());
    if(byName)return{...item,pid:byName.id,isNew:false,_nmMismatch:null};
    return{...item,pid:'',isNew:true,_nmMismatch:null};
  });

  window._nmItems=_draft.items.filter(i=>i._nmMismatch);
  window._nmFname=fname;window._nmIdx=0;

  const newProds=_draft.items.filter(i=>i.isNew);
  if(newProds.length>0){await classifyNewProds(newProds,d,fname);return;}
  _nmContinue();
}
window.openOPReview=openOPReview;

// ─── CLASSIFICAR NOVOS PRODUTOS ───────────────────────────────────────────────
function _openClassifyModal(item,cur,total){
  _modalLocked=true;
  Mopen('🆕 Novo Produto Detectado ('+cur+'/'+total+')',
    '<div class="fg" style="margin-bottom:10px"><label style="font-size:12px;color:var(--muted)">Nome do Produto <em>(confira e edite se necessário)</em></label><input type="text" id="cp-name" class="sinput" value="'+esc(item.productName)+'" style="font-weight:600"></div>'+
    '<div style="margin-bottom:14px;font-size:12px;color:var(--muted)">SKU: <span class="sku">'+esc(item.sku)+'</span></div>'+
    '<div class="fg"><label>Este produto é:</label><div class="ck-group">'+
    '<label class="ck-row"><input type="radio" name="cp-t" value="estoque" onchange="togCP()"> 🏷️ Produto de Revenda (já existe, só separar)</label>'+
    '<label class="ck-row"><input type="radio" name="cp-t" value="producao" checked onchange="togCP()"> 🏭 Produzido Internamente</label>'+
    '</div></div>'+
    '<div id="cp-sec"><div class="fg"><label>Setor(es) *</label><div class="ck-group">'+
    '<label class="ck-row"><input type="checkbox" name="cp-s" value="preformados"> 🧵 Preformados</label>'+
    '<label class="ck-row"><input type="checkbox" name="cp-s" value="estamparia"> 🔩 Ferragens (Estamparia)</label>'+
    '<label class="ck-row"><input type="checkbox" name="cp-s" value="espinar"> 🔌 Espinar/Fita</label>'+
    '</div></div></div>',
    '<button class="btn btn-ghost" onclick="cancelClassify()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveNewProd()">'+(cur<total?'Salvar e Próximo →':'Salvar e Continuar →')+'</button>'
  );
  window._cpReopen=()=>_openClassifyModal(item,cur,total);
}
function togCP(){
  const t=document.querySelector('input[name="cp-t"]:checked');
  if(t)el('cp-sec').style.display=t.value==='estoque'?'none':'block';
}
function cancelClassify(){
  if(!confirm('Cancelar a classificação? O upload será descartado.'))return;
  _modalLocked=false;window._cpItem=null;window._cpNext=null;window._cpReopen=null;
  Mclose();toast('Upload cancelado.','warn');tabUpload();
}
function classifyNewProds(list,d,fname){
  let idx=0;window._cpFname=fname;
  function next(){
    if(idx>=list.length){_modalLocked=false;_nmContinue();return;}
    window._cpItem=list[idx++];
    _openClassifyModal(window._cpItem,idx,list.length);
    window._cpNext=next;
  }
  next();
}
function saveNewProd(){
  const item=window._cpItem;if(!item){toast('Erro interno: item não encontrado','err');return;}
  const name=(el('cp-name')?el('cp-name').value.trim():'')||item.productName,sku=item.sku;
  const tipo=document.querySelector('input[name="cp-t"]:checked').value;
  const isStock=tipo==='estoque';
  const sectors=isStock?[]:Array.from(document.querySelectorAll('input[name="cp-s"]:checked')).map(c=>c.value);
  if(!isStock&&!sectors.length){toast('Selecione ao menos um setor','err');return;}
  const secLabels={preformados:'Preformados',estamparia:'Estamparia',espinar:'Espinar/Fita'};
  const tipoLabel=isStock?'🏷️ Produto de Revenda':'🏭 Produzido Internamente ('+sectors.map(s=>secLabels[s]||s).join(', ')+')';
  window._cpPendingName=name;window._cpPendingIsStock=isStock;window._cpPendingSectors=sectors;
  Mopen('✅ Confirmar Cadastro de Produto',
    '<div style="background:var(--bg-input);border-radius:8px;padding:16px;line-height:2">'+
    '<div><span style="color:var(--muted);font-size:11px">NOME</span><br><strong>'+esc(name)+'</strong></div>'+
    '<div style="margin-top:8px"><span style="color:var(--muted);font-size:11px">SKU</span><br><code style="font-size:13px">'+esc(sku)+'</code></div>'+
    '<div style="margin-top:8px"><span style="color:var(--muted);font-size:11px">TIPO</span><br>'+tipoLabel+'</div>'+
    '</div><p style="margin-top:12px;font-size:13px;color:var(--sub)">Confirma o cadastro deste produto?</p>',
    '<button class="btn btn-ghost" onclick="window._cpReopen&&window._cpReopen()">← Corrigir</button>'+
    '<button class="btn btn-green" onclick="_confirmNewProd()">✅ Confirmar</button>'
  );
}
function _confirmNewProd(){
  const item=window._cpItem;if(!item){toast('Erro interno','err');return;}
  const name=window._cpPendingName,sku=item.sku;
  const isStock=window._cpPendingIsStock,sectors=window._cpPendingSectors;
  const d=gdb();
  const prod={id:uid(),name,sku,isStock,sectors};
  d.products.push(prod);sdb(d);
  const draftItem=_draft.items.find(i=>i.sku===sku||i.productName===name);
  if(draftItem){draftItem.pid=prod.id;draftItem.isNew=false;}
  window._cpItem=null;window._cpPendingName=null;window._cpReopen=null;
  Mclose();
  saveModal('Produto cadastrado!','"<strong>'+esc(name)+'</strong>" foi adicionado ao catálogo.');
  if(window._cpNext)window._cpNext();
}
window.togCP=togCP;window.cancelClassify=cancelClassify;window.saveNewProd=saveNewProd;window._confirmNewProd=_confirmNewProd;

// ─── VERIFICAÇÃO DE NOME (MISMATCH) ───────────────────────────────────────────
function _nmContinue(){
  if(window._nmItems&&window._nmItems.length>0&&window._nmIdx<window._nmItems.length){
    _nmShowStep1();
  }else{
    Mclose();
    showReview(window._nmFname);
  }
}
function _nmShowStep1(){
  const item=window._nmItems[window._nmIdx];const mm=item._nmMismatch;
  const cur=window._nmIdx+1,total=window._nmItems.length;
  Mopen('⚠️ Nome diferente do cadastro ('+cur+'/'+total+')',
    '<div class="alert alert-warn" style="margin-bottom:16px">'+
    '⚠️ O SKU <span class="sku">'+esc(item.sku)+'</span> já está cadastrado, mas o nome no PDF é diferente:</div>'+
    '<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;margin-bottom:16px">'+
    '<tr style="background:var(--bg-input)"><td style="padding:10px 14px;color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;white-space:nowrap;width:120px">No PDF</td><td style="padding:10px 14px;color:var(--warn);font-weight:600">'+esc(mm.pdfName)+'</td></tr>'+
    '<tr style="background:var(--bg-card2)"><td style="padding:10px 14px;color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;white-space:nowrap">Cadastrado</td><td style="padding:10px 14px;color:var(--green);font-weight:600">'+esc(mm.regName)+'</td></tr>'+
    '</table>'+
    '<div style="font-size:13px;color:var(--sub)">O que deseja fazer com o cadastro deste produto?</div>',
    '<button class="btn btn-ghost" onclick="_nmKeep()">Manter "'+esc(mm.regName.length>22?mm.regName.slice(0,22)+'…':mm.regName)+'"</button>'+
    '<button class="btn btn-outline" onclick="_nmShowStep2()">Atualizar cadastro →</button>'
  );
}
function _nmKeep(){
  const item=window._nmItems[window._nmIdx];
  item.productName=item._nmMismatch.regName;
  window._nmIdx++;_nmContinue();
}
function _nmShowStep2(){
  const item=window._nmItems[window._nmIdx];const mm=item._nmMismatch;
  Mopen('Confirmar alteração de nome',
    '<div style="font-size:13px;color:var(--sub);margin-bottom:20px">Esta ação altera o nome permanentemente no cadastro de produtos.</div>'+
    '<div style="display:flex;flex-direction:column;gap:10px">'+
    '<div><div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Nome atual (cadastro)</div>'+
    '<div style="padding:10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--sub)">'+esc(mm.regName)+'</div></div>'+
    '<div style="text-align:center;color:var(--muted);font-size:18px">↓</div>'+
    '<div><div style="font-size:11px;color:var(--green);font-weight:600;text-transform:uppercase;margin-bottom:6px">Novo nome (do PDF)</div>'+
    '<div style="padding:10px 14px;background:var(--success-bg);border:1px solid rgba(34,197,94,.3);border-radius:6px;color:var(--green);font-weight:600">'+esc(mm.pdfName)+'</div></div>'+
    '</div>',
    '<button class="btn btn-ghost" onclick="_nmShowStep1()">← Voltar</button>'+
    '<button class="btn btn-green" onclick="_nmConfirmUpdate()">✅ Confirmar alteração</button>'
  );
}
function _nmConfirmUpdate(){
  const item=window._nmItems[window._nmIdx];const mm=item._nmMismatch;
  const d=gdb();const p=d.products.find(x=>x.id===item.pid);
  if(p){p.name=mm.pdfName;sdb(d);toast('Nome atualizado: "'+esc(mm.pdfName)+'"','ok');}
  item.productName=mm.pdfName;window._nmIdx++;_nmContinue();
}
window._nmContinue=_nmContinue;window._nmShowStep1=_nmShowStep1;window._nmKeep=_nmKeep;
window._nmShowStep2=_nmShowStep2;window._nmConfirmUpdate=_nmConfirmUpdate;

// ─── TELA DE REVISÃO DA OP ────────────────────────────────────────────────────
function showReview(fname){
  const d=gdb();
  const sc=el('stcontent');
  sc.innerHTML=`<div class="card">
    <div class="card-header">
      <div>
        <div class="card-title">Revisão da OP <span style="font-size:13px;color:var(--muted);font-weight:400">${esc(fname||'')}</span></div>
        <div class="card-sub">Verifique e complete as informações antes de salvar</div>
      </div>
    </div>
    <div class="fgrid" style="margin-bottom:20px">
      <div class="fg"><label>Número do Pedido *</label>
        <input type="text" id="rv-num" value="${esc(_draft.opNum)}" placeholder="Ex: 8486">
      </div>
      <div class="fg"><label>Cliente *</label>
        <input type="text" id="rv-cli" value="${esc(_draft.clientName)}" list="rv-cli-dl">
        <datalist id="rv-cli-dl">${d.clients.map(c=>'<option value="'+esc(c.name)+'">').join('')}</datalist>
      </div>
    </div>
    <div class="sdiv">Itens do Pedido</div>
    <div class="tw">
      <table class="rt">
        <thead><tr><th>Produto</th><th>SKU</th><th>Qtd</th><th>Un.</th><th>Estoque</th><th>Obs</th><th>Personalização</th><th></th></tr></thead>
        <tbody id="rv-tbody"></tbody>
      </table>
    </div>
    <button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="addRVItem()">➕ Adicionar item</button>
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px">
      <button class="btn btn-ghost" onclick="if(confirm('Cancelar e descartar a OP?'))tabUpload()">Cancelar</button>
      <button class="btn btn-green" onclick="openSaveModal()">💾 Salvar OP</button>
    </div>
  </div>`;
  renderRV();
}
window.showReview=showReview;

function renderRV(){
  const d=gdb();const tb=el('rv-tbody');if(!tb)return;
  if(!_draft||!_draft.items.length){
    tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Nenhum item. Clique em "+ Adicionar item".</td></tr>';return;
  }
  tb.innerHTML=_draft.items.map((item,i)=>{
    const p=d.products.find(x=>x.id===item.pid);
    const sem=p&&p.isStock?getStock(item.pid,item.qty):{cls:'',label:''};
    const dispVal=item.productName?(item.sku?item.sku+' | '+item.productName:item.productName):'';
    const opts=d.products.map(p2=>'<div class="ac-opt" data-pid="'+p2.id+'" onclick="rvACPick('+i+',this.dataset.pid)">'+
      (p2.sku?'<span class="sku">'+esc(p2.sku)+'</span> ':'')+esc(p2.name)+'</div>').join('');
    const isPref=p&&!p.isStock&&(p.sectors||[]).includes('preformados');
    const isEspin=p&&!p.isStock&&(p.sectors||[]).includes('espinar');
    const hasPersonal=isPref||isEspin;
    const kitBadge=p&&p.isKit?'<span class="bs" style="background:rgba(99,102,241,.15);color:var(--accent);font-size:10px;margin-left:4px">🔗 Kit</span>':'';
    return`<tr>
      <td style="position:relative;min-width:220px">
        <div class="ac-wrap">
          <input class="rt-input" id="rv-ac-${i}" value="${esc(dispVal)}" placeholder="🔍 SKU ou nome..." autocomplete="off"
            oninput="rvACFilter(${i})" onfocus="rvACFilter(${i})" onblur="setTimeout(()=>rvACClose(${i}),220)">
          <div class="ac-drop" id="rv-acd-${i}" style="display:none">${opts}</div>
        </div>
      </td>
      <td><span class="sku" id="rv-sku-${i}">${esc(item.sku||'—')}</span>${kitBadge}</td>
      <td><input type="number" class="rt-input rt-num" value="${item.qty||1}" min="1" onchange="_draft.items[${i}].qty=+this.value"></td>
      <td><input type="text" class="rt-input" style="width:60px" value="${esc(item.unit||'PC')}" onchange="_draft.items[${i}].unit=this.value"></td>
      <td>${p&&p.isStock?'<span class="'+sem.cls+'"><span class="sem-dot"></span>'+sem.label+'</span>':'—'}</td>
      <td><input type="text" class="rt-input" style="min-width:120px" placeholder="Obs do item..." value="${esc(item.obs||'')}" onchange="_draft.items[${i}].obs=this.value"></td>
      <td style="min-width:160px">${hasPersonal?`<div style="display:flex;flex-direction:column;gap:4px;font-size:12px">
        <label style="cursor:pointer"><input type="checkbox" ${item.etiqueta?'checked':''} onchange="_draft.items[${i}].etiqueta=this.checked"> 🏷️ Etiqueta c/ logo</label>
        <label style="cursor:pointer"><input type="checkbox" ${item.caixa?'checked':''} onchange="_draft.items[${i}].caixa=this.checked"> 📦 Caixa c/ logo</label>
        ${isPref?`<label style="cursor:pointer"><input type="checkbox" ${item.gravacao?'checked':''} onchange="_draft.items[${i}].gravacao=this.checked"> ✏️ Gravação</label>`:''}
      </div>`:'<span style="color:var(--muted);font-size:12px">—</span>'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="_draft.items.splice(${i},1);renderRV()">✕</button></td>
    </tr>${p&&p.isKit&&p.kitComponents&&p.kitComponents.length?
      p.kitComponents.map(c=>{
        const cp=d.products.find(x=>x.id===c.productId);
        const cQty=(c.qty||1)*(item.qty||1);
        const cSem=cp&&cp.isStock?getStock(c.productId,cQty):{cls:'',label:''};
        return`<tr style="background:rgba(99,102,241,.04);border-top:none">
          <td colspan="2" style="padding:4px 8px 4px 32px;font-size:12px;color:var(--sub)">
            <span style="color:var(--accent);margin-right:4px">↳</span>${cp?esc(cp.name):'<span style="color:var(--danger)">Produto não encontrado</span>'}
          </td>
          <td style="font-size:12px;text-align:center;color:var(--sub)">${cQty}</td>
          <td style="font-size:12px;color:var(--sub)">${cp?esc(cp.unit||'UN'):''}</td>
          <td>${cp&&cp.isStock?'<span class="'+cSem.cls+'"><span class="sem-dot"></span>'+cSem.label+'</span>':'<span style="font-size:11px;color:var(--muted)">Produção</span>'}</td>
          <td colspan="3"></td></tr>`;
      }).join('')
    :''}`;
  }).join('');
}
window.renderRV=renderRV;

function rvACFilter(i){
  const inp=el('rv-ac-'+i),drop=el('rv-acd-'+i);if(!inp||!drop)return;
  const q=inp.value.toLowerCase();let any=false;
  drop.querySelectorAll('.ac-opt').forEach(opt=>{
    const show=!q||opt.textContent.toLowerCase().includes(q);opt.style.display=show?'':'none';if(show)any=true;
  });
  if(any){const rect=inp.getBoundingClientRect();Object.assign(drop.style,{position:'fixed',left:rect.left+'px',top:(rect.bottom+2)+'px',width:rect.width+'px',zIndex:'9999',right:'auto'});}
  drop.style.display=any?'block':'none';
}
function rvACClose(i){const d=el('rv-acd-'+i);if(d)d.style.display='none';}
function rvACPick(i,pid){
  const d=gdb();const p=d.products.find(x=>x.id===pid);if(!p)return;
  _draft.items[i].pid=p.id;_draft.items[i].productName=p.name;_draft.items[i].sku=p.sku||'';
  const inp=el('rv-ac-'+i);if(inp)inp.value=(p.sku?p.sku+' | ':'')+p.name;
  const skuEl=el('rv-sku-'+i);if(skuEl)skuEl.textContent=p.sku||'—';
  rvACClose(i);renderRV();
}
function addRVItem(){
  _draft.items.push({pid:'',productName:'',sku:'',qty:1,unit:'PC',obs:'',etiqueta:false,caixa:false,gravacao:false,status:'pendente'});
  renderRV();
}
window.rvACFilter=rvACFilter;window.rvACClose=rvACClose;window.rvACPick=rvACPick;window.addRVItem=addRVItem;

// ─── SALVAR OP ────────────────────────────────────────────────────────────────
function openSaveModal(){
  const num=v('rv-num').trim(),cli=v('rv-cli').trim();
  if(!num||!cli){toast('Nº pedido e cliente obrigatórios','err');return;}
  const allItems=_draft.items.filter(i=>i.qty>0);
  const items=allItems.filter(i=>i.pid);
  const missing=allItems.length-items.length;
  if(missing>0){if(!confirm(missing+' item(ns) sem produto selecionado serão descartados. Continuar?'))return;}
  if(!items.length){toast('Adicione ao menos um item válido com produto selecionado','err');return;}
  _draft.opNum=num;_draft.clientName=cli;_draft.items=items;
  Mopen('💾 Salvar Ordem de Produção',
    '<div class="fgrid">'+
    '<div class="fg"><label>Data Limite de Entrega *</label><input type="date" id="sm-dt" value="'+(_draft.deliveryDate||'')+'"></div>'+
    '<div class="fg s2"><label>Transportadora *</label><input type="text" id="sm-tr" placeholder="Nome da transportadora (ou \'Cliente retira\')" value="'+esc(_draft.transporter||'')+'"></div>'+
    '<div class="fg s2"><label>Tipo de Coleta *</label><div class="ck-group">'+
    '<label class="ck-row"><input type="radio" name="sm-col" value="redespacho_sp" '+(_draft.coleta==='redespacho_sp'?'checked':'')+'> 🚛 Redespacho SP</label>'+
    '<label class="ck-row"><input type="radio" name="sm-col" value="coleta_sorocaba" '+(_draft.coleta==='coleta_sorocaba'||_draft.coleta==='transportadora'?'checked':'')+'> 📍 Coleta Sorocaba</label>'+
    '<label class="ck-row"><input type="radio" name="sm-col" value="retirar" '+(_draft.coleta==='retirar'?'checked':'')+'> 🚶 Retirar Pessoalmente</label>'+
    '</div></div>'+
    '<div class="fg s2"><label>Observações Gerais</label><textarea id="sm-obs">'+esc(_draft.obs||'')+'</textarea></div>'+
    '</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Voltar</button>'+
    '<button class="btn btn-green" onclick="confirmSaveOP()">✅ Confirmar e Salvar</button>'
  );
}
window.openSaveModal=openSaveModal;

function confirmSaveOP(){
  const dt=v('sm-dt'),tr=(v('sm-tr')||'').trim();
  const col=(document.querySelector('input[name="sm-col"]:checked')||{}).value;
  const obs=(v('sm-obs')||'').trim();
  if(!dt){toast('Data de entrega obrigatória','err');return;}
  if(!tr){toast('Transportadora obrigatória (ou "Cliente retira")','err');return;}
  if(!col){toast('Tipo de coleta obrigatório','err');return;}
  const d=gdb();
  let cli=d.clients.find(c=>c.name.toLowerCase()===_draft.clientName.toLowerCase());
  if(!cli){cli={id:uid(),name:_draft.clientName,contact:'',phone:'',email:'',obs:''};d.clients.push(cli);}
  const noInit=_draft.items.filter(i=>{const p=d.products.find(x=>x.id===i.pid);return p&&p.isStock&&!d.stock[i.pid];});
  if(noInit.length){Mclose();askInitStock(noInit,d,()=>doSaveOP(dt,tr,col,obs,cli));return;}
  doSaveOP(dt,tr,col,obs,cli);
}
window.confirmSaveOP=confirmSaveOP;

function askInitStock(items,d,cb){
  const rows=items.map(i=>{
    const p=d.products.find(x=>x.id===i.pid);
    return'<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'+
      '<span style="flex:1;font-size:13px">'+esc(p?p.name:i.pid)+'</span>'+
      '<input type="number" min="0" class="isi-inp" data-pid="'+i.pid+'" placeholder="Qtd em estoque" style="width:150px;padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text)">'+
      '</div>';
  }).join('');
  window._isiCB=cb;
  Mopen('📦 Inventário Inicial de Estoque',
    '<div class="alert alert-warn">Informe a quantidade física atual para os novos itens de estoque.</div>'+rows,
    '<button class="btn btn-ghost" onclick="cancelInitStock()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveInitStock()">✅ Confirmar</button>'
  );
}
function cancelInitStock(){Mclose();window._isiCB=null;toast('Salvamento cancelado. A OP não foi criada.','warn');}
function saveInitStock(){
  const d=gdb();let ok=true;const logParts=[];
  document.querySelectorAll('.isi-inp').forEach(inp=>{
    const qty=parseInt(inp.value);if(isNaN(qty)||qty<0){ok=false;return;}
    const pid=inp.dataset.pid;
    d.stock[pid]={qty,at:Date.now()};
    const p=(d.products||[]).find(x=>x.id===pid);
    logParts.push((p?p.name:pid)+': '+qty+' un');
  });
  if(!ok){toast('Informe quantidades válidas','err');return;}
  if(logParts.length>0)logAction(d,'Inventário inicial registrado',logParts.join(' | '));
  sdb(d);Mclose();toast('Estoque registrado!','ok');
  if(window._isiCB)window._isiCB();
}
window.askInitStock=askInitStock;window.cancelInitStock=cancelInitStock;window.saveInitStock=saveInitStock;

function doSaveOP(dt,tr,col,obs,cliObj){
  const d=gdb();
  let cli=d.clients.find(c=>c.id===cliObj.id);
  if(!cli){d.clients.push(cliObj);cli=cliObj;}
  if(d.ops.some(o=>o.opNum===_draft.opNum&&!o.archived)){
    if(!confirm('⚠️ Já existe uma OP com o número '+_draft.opNum+'.\nDeseja importar mesmo assim?'))return;
  }
  d.seq=(d.seq||1000)+1;
  const op={
    id:uid(),opNum:_draft.opNum,clientId:cli.id,clientName:cli.name,
    deliveryDate:dt,transporter:tr,coleta:col,obs,
    items:_draft.items.map(i=>({...i,status:'pendente',stageLog:[{status:'pendente',by:S?S.name:'',at:Date.now()}]})),
    status:'ativo',createdAt:Date.now(),finalAt:null,archived:false,
    createdBy:S?S.id:'',createdByName:S?S.name:''
  };
  d.ops.push(op);
  logAction(d,'OP criada','Pedido #'+op.opNum+' — '+op.clientName+' ('+op.items.length+' item(s))');
  const _semStk=op.items.filter(i=>{
    const _p=d.products&&d.products.find(x=>x.id===i.pid);if(!_p||!_p.isStock)return false;
    const _q=d.stock&&d.stock[i.pid];return _q===undefined||_q===null||(_q.qty||_q)<=0;
  });
  sdb(d);
  if(_semStk.length>0){
    const _iList=_semStk.map(i=>{
      const _p2=d.products&&d.products.find(x=>x.id===i.pid);
      return'• '+(_p2?_p2.name:i.productName||'?')+' — Qtd pedida: '+i.qty+' '+(i.unit||'PC');
    }).join('\n');
    _createNotif&&_createNotif('semestoque',['comprador','expedicao'],
      'Novo pedido com itens sem estoque — OP #'+op.opNum,
      'Pedido: #'+op.opNum+' — '+op.clientName+'\nEntrega: '+fdate(op.deliveryDate)+'\n\nItens sem estoque:\n'+_iList
    );
  }
  Mclose();_draft=null;
  saveModal('OP salva com sucesso!','Pedido <strong>#'+esc(op.opNum)+'</strong> — '+esc(op.clientName)+'<br>'+op.items.length+' item(s) · Entrega: '+fdate(dt));
  setTimeout(()=>{
    if(window.location.pathname.includes('pedidos.html'))tabUpload();
    else window.location.href='historico.html';
  },100);
}
window.doSaveOP=doSaveOP;

// ─── OP MANUAL ────────────────────────────────────────────────────────────────
function openManualOP(){
  _draft={opNum:'',clientName:'',clientId:'',coleta:'',items:[]};_newProds=[];
  const d=gdb();
  Mopen('✏️ Inserir OP Manualmente',
    '<div class="fgrid">'+
    '<div class="fg"><label>Nº do Pedido *</label><input type="text" id="mo-num" placeholder="Ex: 8486"></div>'+
    '<div class="fg"><label>Cliente *</label><input type="text" id="mo-cli" list="mo-cli-dl" placeholder="Nome do cliente">'+
    '<datalist id="mo-cli-dl">'+d.clients.map(c=>'<option value="'+esc(c.name)+'">').join('')+'</datalist></div>'+
    '</div>'+
    '<div class="sdiv" style="margin:14px 0 8px">Itens</div>'+
    '<div id="mo-items"></div>'+
    '<button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="addMOItem()">➕ Adicionar item</button>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="submitManualOP()">Avançar →</button>',
    'lg'
  );
  _renderMOItems();
}
window.openManualOP=openManualOP;

function _renderMOItems(){
  const d=gdb();const ct=el('mo-items');if(!ct)return;
  if(!_draft.items.length){
    ct.innerHTML='<div style="color:var(--muted);font-size:12px;padding:8px 0">Nenhum item. Clique em "+ Adicionar item".</div>';return;
  }
  ct.innerHTML='<table class="rt" style="margin-bottom:4px"><thead><tr><th>Produto</th><th>Qtd</th><th>Un.</th><th>Obs</th><th></th></tr></thead><tbody>'+
    _draft.items.map((item,i)=>{
      const opts=d.products.map(p=>'<div class="ac-opt" data-pid="'+p.id+'" onclick="moACPick('+i+',this.dataset.pid)">'+
        (p.sku?'<span class="sku">'+esc(p.sku)+'</span> ':'')+esc(p.name)+'</div>').join('');
      const dispVal=item.productName?(item.sku?item.sku+' | '+item.productName:item.productName):'';
      return'<tr>'+
        '<td style="position:relative;min-width:180px"><div class="ac-wrap">'+
          '<input class="rt-input" id="mo-ac-'+i+'" value="'+esc(dispVal)+'" placeholder="🔍 SKU ou nome..." autocomplete="off"'+
          ' oninput="moACFilter('+i+')" onfocus="moACFilter('+i+')" onblur="setTimeout(()=>moACClose('+i+'),220)">'+
          '<div class="ac-drop" id="mo-acd-'+i+'" style="display:none">'+opts+'</div></div></td>'+
        '<td><input type="number" class="rt-input rt-num" value="'+(item.qty||1)+'" min="1" onchange="_draft.items['+i+'].qty=+this.value"></td>'+
        '<td><input type="text" class="rt-input" style="width:55px" value="'+esc(item.unit||'PC')+'" onchange="_draft.items['+i+'].unit=this.value"></td>'+
        '<td><input type="text" class="rt-input" style="min-width:100px" placeholder="Obs..." value="'+esc(item.obs||'')+'" onchange="_draft.items['+i+'].obs=this.value"></td>'+
        '<td><button class="btn btn-danger btn-sm" onclick="_draft.items.splice('+i+',1);_renderMOItems()">✕</button></td>'+
      '</tr>';
    }).join('')+'</tbody></table>';
}
function addMOItem(){
  _draft.items.push({pid:'',productName:'',sku:'',qty:1,unit:'PC',obs:'',etiqueta:false,caixa:false,gravacao:false});
  _renderMOItems();
}
function moACFilter(i){
  const inp=el('mo-ac-'+i),drop=el('mo-acd-'+i);if(!inp||!drop)return;
  const q=inp.value.toLowerCase();let any=false;
  drop.querySelectorAll('.ac-opt').forEach(opt=>{const show=!q||opt.textContent.toLowerCase().includes(q);opt.style.display=show?'':'none';if(show)any=true;});
  if(any){const rect=inp.getBoundingClientRect();Object.assign(drop.style,{position:'fixed',left:rect.left+'px',top:(rect.bottom+2)+'px',width:rect.width+'px',zIndex:'9999',right:'auto'});}
  drop.style.display=any?'block':'none';
}
function moACClose(i){const d=el('mo-acd-'+i);if(d)d.style.display='none';}
function moACPick(i,pid){
  const d=gdb();const p=d.products.find(x=>x.id===pid);if(!p)return;
  _draft.items[i].pid=p.id;_draft.items[i].productName=p.name;_draft.items[i].sku=p.sku||'';
  const inp=el('mo-ac-'+i);if(inp)inp.value=(p.sku?p.sku+' | ':'')+p.name;
  moACClose(i);
}
function submitManualOP(){
  const num=(v('mo-num')||'').trim(),cli=(v('mo-cli')||'').trim();
  if(!num||!cli){toast('Nº do pedido e cliente obrigatórios','err');return;}
  const items=_draft.items.filter(i=>i.pid&&i.qty>0);
  if(!items.length){toast('Adicione ao menos um item com produto selecionado','err');return;}
  _draft.opNum=num;_draft.clientName=cli;_draft.items=items;
  const miss=_draft.items.length-items.length;
  if(miss>0&&!confirm(miss+' item(ns) sem produto serão descartados. Continuar?'))return;
  Mclose();
  setTimeout(()=>showReview(null),50);
}
window.addMOItem=addMOItem;window.moACFilter=moACFilter;window.moACClose=moACClose;window.moACPick=moACPick;window.submitManualOP=submitManualOP;

// Helper: exibir modal de sucesso sem fechar imediatamente
function saveModal(title,body){
  Mopen('✅ '+title,'<div class="alert alert-info">'+body+'</div>','<button class="btn btn-green" onclick="Mclose()">Ok</button>');
}
window.saveModal=saveModal;

// ══════════════════════════════════════════════════════════════════
// INTEGRAÇÃO OLIST — Importação via Edge Function Supabase
// ══════════════════════════════════════════════════════════════════

// URL da Edge Function (mesmo domínio Supabase do app)
const _OLIST_FN = SUPA_URL + '/functions/v1/olist-proxy';

// Chama a Edge Function proxy com autenticação JWT
async function _olistCall(action, pedidoId) {
  const jwt = window._supaJwt || SUPA_KEY;
  const body = pedidoId ? { action, pedidoId } : { action };
  const r = await fetch(_OLIST_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt || 'Erro ' + r.status);
  }
  return r.json();
}

// Importar do Olist — abre modal de seleção de pedidos
window.importarOlist = async function () {
  Mopen('🔄 Importar do Olist', '<div style="text-align:center;padding:30px;color:var(--muted)">🔄 Buscando pedidos aprovados no Olist...</div>', '');
  try {
    const data = await _olistCall('list');

    // Resposta da API Olist: { retorno: { pedidos: [...] } } ou { itens: [...] }
    const pedidos = (data.retorno && data.retorno.pedidos) || data.itens || data.pedidos || [];

    if (!pedidos.length) {
      Mopen('🔄 Importar do Olist',
        '<div class="empty"><div class="ei">✅</div><div>Nenhum pedido aprovado pendente de importação no Olist.</div></div>',
        '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
      );
      return;
    }

    const d = gdb();
    // Filtra pedidos já importados — por opNum E por olistPedidoId armazenado
    const jaImportados = new Set([
      ...(d.ops || []).map(op => String(op.opNum)),
      ...(d.ops || []).filter(op => op.olistPedidoId).map(op => String(op.olistPedidoId))
    ]);

    const rows = pedidos.map(p => {
      const num = String(p.numero || p.numeroPedido || p.id || '?');
      const cli = p.cliente ? (p.cliente.nome || p.cliente.nomeFantasia || '') : (p.nomeCliente || '');
      const dt  = p.dataPrevista || p.dataEntrega || '';
      const jaExiste = jaImportados.has(num);
      return '<tr>' +
        '<td><input type="checkbox" class="olist-chk" value="' + esc(String(p.id || num)) + '" data-num="' + esc(num) + '"' + (jaExiste ? ' disabled title="Já importado"' : '') + '></td>' +
        '<td><strong>' + esc(num) + '</strong>' + (jaExiste ? ' <span style="font-size:11px;color:var(--muted)">(já importado)</span>' : '') + '</td>' +
        '<td>' + esc(cli) + '</td>' +
        '<td>' + esc(dt ? fdate(dt) : '—') + '</td>' +
        '<td>' + esc(String(p.situacao || '')) + '</td>' +
      '</tr>';
    }).join('');

    Mopen('🔄 Importar do Olist',
      '<div style="margin-bottom:10px;font-size:13px;color:var(--muted)">' + pedidos.length + ' pedido(s) aprovado(s) encontrado(s). Selecione os que deseja importar:</div>' +
      '<div style="margin-bottom:8px"><label style="font-size:12px;cursor:pointer"><input type="checkbox" id="olist-all" onchange="document.querySelectorAll(\'.olist-chk:not([disabled])\').forEach(c=>c.checked=this.checked)"> Selecionar todos</label></div>' +
      '<div class="tw" style="max-height:320px;overflow-y:auto">' +
      '<table><thead><tr><th></th><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Situação</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>',
      '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>' +
      '<button class="btn btn-green" onclick="_importarSelecionados()">📥 Importar Selecionados</button>'
    );
  } catch (e) {
    const errMsg = String(e.message || e);
    const isNotConfigured = errMsg.includes('OLIST_TOKEN');
    Mopen('🔄 Importar do Olist',
      '<div class="alert" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:14px;color:var(--text)">' +
      '<strong>❌ ' + (isNotConfigured ? 'Token Olist não configurado' : 'Erro ao conectar com o Olist') + '</strong><br><br>' +
      (isNotConfigured
        ? 'Para ativar a importação automática:<br>' +
          '1. Acesse o <strong>Supabase Dashboard</strong> → Edge Functions → olist-proxy → Secrets<br>' +
          '2. Adicione o secret: <code>OLIST_TOKEN</code> = seu Bearer token do Olist ERP<br>' +
          '3. O token é gerado em: Olist ERP → Configurações → Extensões → API v3'
        : '<code>' + esc(errMsg) + '</code><br><br>Verifique se a Edge Function <strong>olist-proxy</strong> foi deployada no Supabase.<br>' +
          'Comando: <code>supabase functions deploy olist-proxy</code>'
      ) + '</div>',
      '<button class="btn btn-ghost" onclick="Mclose()">Fechar</button>'
    );
  }
};

// Importa os pedidos selecionados um a um e abre o OP Review do primeiro
window._importarSelecionados = async function () {
  const checked = [...document.querySelectorAll('.olist-chk:checked')];
  if (!checked.length) { toast('Selecione pelo menos um pedido', 'warn'); return; }

  Mopen('🔄 Importando...', '<div style="text-align:center;padding:30px;color:var(--muted)">🔄 Importando ' + checked.length + ' pedido(s)...</div>', '');

  const drafts = [];
  for (const chk of checked) {
    try {
      const data = await _olistCall('get', chk.value);
      const p = data.retorno || data.pedido || data;
      const draft = _olistToDraft(p);
      if (draft) drafts.push(draft);
    } catch (e) {
      console.warn('[TGL Olist] Erro ao buscar pedido', chk.value, e);
    }
  }

  if (!drafts.length) { toast('Nenhum pedido pôde ser importado', 'err'); return; }

  // Abre OP Review para o primeiro pedido; os demais ficam na fila
  window._olistQueue = drafts.slice(1);
  Mclose();
  _openOPReviewFromDraft(drafts[0]);
  toast('Pedido importado do Olist! Revise e confirme.', 'ok');
};

// Converte dados do Olist para o formato _draft interno
function _olistToDraft(p) {
  if (!p) return null;
  const num = String(p.numero || p.numeroPedido || p.id || '');
  const cliente = p.cliente || {};
  const clientName = cliente.nome || cliente.nomeFantasia || p.nomeCliente || '';
  const deliveryDate = p.dataPrevista || p.dataEntrega || '';
  const transporter = (p.transportador && (p.transportador.nome || p.transportador)) || '';

  const d = gdb();
  const items = (p.itens || p.items || []).map(it => {
    const sku = String(it.codigo || it.sku || '');
    const qty = parseFloat(it.quantidade || it.qty || 1);
    const name = it.descricao || it.nome || it.name || sku;
    const unit = it.unidadeMedida || it.unit || 'PC';
    // Tenta casar com produto cadastrado pelo SKU ou nome
    const prod = d.products.find(x => x.sku && x.sku.toLowerCase() === sku.toLowerCase()) ||
                 d.products.find(x => x.name && x.name.toLowerCase() === name.toLowerCase());
    return {
      pid: prod ? prod.id : null,
      sku,
      productName: prod ? prod.name : name,
      name: prod ? prod.name : name,
      qty,
      unit: prod ? (prod.unit || unit) : unit,
      status: 'pendente',
      olistItemId: String(it.id || '')
    };
  }).filter(it => it.qty > 0);

  if (!items.length) return null;

  return {
    opNum: num,
    clientName,
    clientId: '',
    deliveryDate: deliveryDate ? deliveryDate.split('T')[0] : '',
    transporter,
    coleta: 'coleta_sorocaba',
    obs: p.obs || p.observacoes || '',
    items,
    olistPedidoId: String(p.id || num),
    source: 'olist'
  };
}

// Abre o OP Review pré-preenchido com um draft do Olist
function _openOPReviewFromDraft(draft) {
  _draft = draft;
  _newProds = [];
  _renderOPReview(gdb());
}
window._importarOlist=window.importarOlist;window._importarSelecionados=window._importarSelecionados;
