// ═══════════════════════════════════════════════════════════════════════════
// admin.js — Gestão de usuários + log de auditoria
// v2.0 TGL Flow
// ═══════════════════════════════════════════════════════════════════════════

function rAdmin(cnt){
  if(!S||!_roles(S).includes('admin')){
    cnt.innerHTML='<div class="empty"><div class="ei">🔒</div><p>Acesso restrito a administradores.</p></div>';return;
  }
  cnt.innerHTML='<div class="ptitle">🔧 Administração</div>'+
    '<div class="stabs">'+
    '<button class="stab on" id="adm-st-users" onclick="admTab(\'users\')">👥 Usuários</button>'+
    '<button class="stab" id="adm-st-audit" onclick="admTab(\'audit\')">📋 Auditoria</button>'+
    '</div>'+
    '<div id="adm-c"></div>'+
    '<div id="adm-danger" style="margin-top:20px"></div>';
  admTab('users');
}
window.rAdmin=rAdmin;

function admTab(t){
  document.querySelectorAll('.stab[id^="adm-st-"]').forEach(b=>b.classList.remove('on'));
  const bt=el('adm-st-'+t);if(bt)bt.classList.add('on');
  el('adm-danger').innerHTML='';
  if(t==='users'){
    renderUsers();
    el('adm-danger').innerHTML=
      '<div class="card" style="border-color:rgba(239,68,68,.3)">'+
      '<div class="card-header"><div class="card-title" style="color:var(--danger)">⚠️ Zona Perigosa</div></div>'+
      '<div class="alert alert-warn" style="margin-bottom:16px;font-size:13px">'+
      'Use apenas antes de colocar o sistema em operação real. Ação <strong>irreversível</strong>.</div>'+
      '<button class="btn btn-danger" onclick="clearAllData()">🗑️ Limpar Banco de Dados</button>'+
      '</div>';
  }else{
    tabAudit();
  }
}
window.admTab=admTab;

// ─── USUÁRIOS ─────────────────────────────────────────────────────────────────
function renderUsers(){
  const d=gdb();
  const alerts=d.alerts||{};
  el('adm-c').innerHTML=
    '<div class="card"><div class="card-header"><div class="card-title">Gestão de Usuários</div>'+
    '<div style="display:flex;gap:8px;align-items:center">'+
    '<button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:rgba(239,68,68,.4)" onclick="forceLogoutAll()">🔴 Deslogar Todos</button>'+
    '<button class="btn btn-green btn-sm" onclick="openUserForm()">+ Novo Usuário</button></div></div>'+
    '<div class="tw"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Alerta</th><th></th></tr></thead><tbody>'+
    d.users.map(u=>{
      const hasAlert=alerts[u.id]&&!alerts[u.id].read;
      return'<tr>'+
        '<td><strong>'+esc(u.name)+'</strong></td>'+
        '<td>'+esc(u.email)+'</td>'+
        '<td>'+rlabelUser(u)+'</td>'+
        '<td>'+(u.pending?'<span class="bs bs-aguardando">Aguardando</span>':u.firstAccess?'<span class="bs bs-pendente">1º Acesso Pendente</span>':'<span class="bs bs-liberado">Ativo</span>')+'</td>'+
        '<td>'+(hasAlert?'<span class="bs bs-warn" style="font-size:11px">📢 Pendente</span>':'<span style="color:var(--muted);font-size:12px">—</span>')+'</td>'+
        '<td style="white-space:nowrap">'+
          '<button class="btn btn-ghost btn-sm" onclick="openUserForm(\''+u.id+'\')">✏️ Editar</button> '+
          '<button class="btn btn-ghost btn-sm" style="color:#f59e0b;border-color:rgba(245,158,11,.4)" onclick="openAlertForm(\''+u.id+'\')">📢 Alerta</button> '+
          (u.id!==S.id?'<button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:rgba(239,68,68,.4)" onclick="forceLogoutUser(\''+u.id+'\')">⏏ Deslogar</button> ':'  ')+
          (u.id!==S.id?'<button class="btn btn-danger btn-sm" onclick="delUser(\''+u.id+'\')">🗑️</button>':'')+' '+
          (u.pending?'<button class="btn btn-outline btn-sm" onclick="approveUser(\''+u.id+'\')">✅ Aprovar</button>':'')+
        '</td></tr>';
    }).join('')+
    '</tbody></table></div></div>';
}
window.renderUsers=renderUsers;

function openUserForm(id){
  const d=gdb(),u=id?d.users.find(x=>x.id===id):null;
  const roleOpts=[
    {v:'admin',l:'👑 Administrador'},
    {v:'pcp',l:'📋 PCP'},
    {v:'preformados',l:'🧵 Preformados'},
    {v:'estamparia',l:'🔩 Estamparia'},
    {v:'espinar',l:'🔌 Espinar/Fita'},
    {v:'expedicao',l:'🚚 Expedição'},
    {v:'comprador',l:'🛒 Comprador'}
  ];
  const userRoles=_roles(u||{role:'preformados'});
  Mopen(u?'Editar Usuário':'Novo Usuário',
    '<div class="fg"><label>Nome *</label><input type="text" id="uf-name" value="'+esc(u?u.name:'')+'"></div>'+
    '<div class="fg"><label>E-mail *</label><input type="email" id="uf-email" value="'+esc(u?u.email:'')+'"></div>'+
    '<div class="fg"><label>Perfil(s) * <span style="font-size:11px;color:var(--muted);font-weight:400">— pode marcar mais de um</span></label>'+
    '<div class="ck-group">'+roleOpts.map(r=>'<label class="ck-row"><input type="checkbox" name="uf-roles" value="'+r.v+'" '+(userRoles.includes(r.v)?'checked':'')+'>  '+r.l+'</label>').join('')+'</div></div>'+
    '<div class="fg"><label>'+(u?'Nova Senha (deixe vazio p/ manter)':'Senha Inicial *')+'</label><input type="password" id="uf-pw" placeholder="••••••••"></div>'+
    '<div class="fg"><label class="ck-row"><input type="checkbox" id="uf-fa" '+(!u||u.firstAccess?'checked':'')+'>  Exigir troca de senha no 1º acesso</label></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="saveUser(\''+( id||'')+'\')">💾 Salvar</button>'
  );
}
window.openUserForm=openUserForm;

async function saveUser(id){
  const name=v('uf-name').trim(),email=v('uf-email').trim(),pw=v('uf-pw'),fa=el('uf-fa').checked;
  if(!name||!email){toast('Nome e e-mail obrigatórios','err');return;}
  const selectedRoles=Array.from(document.querySelectorAll('input[name="uf-roles"]:checked')).map(c=>c.value);
  if(!selectedRoles.length){toast('Selecione ao menos um perfil','err');return;}
  const role=selectedRoles[0];
  let hashed=null;
  if(pw)hashed=await hashPw(pw);
  else if(!id){toast('Senha obrigatória','err');return;}
  const d=gdb();
  if(id){
    const i=d.users.findIndex(x=>x.id===id);
    if(i<0){toast('Usuário não encontrado — recarregue a tela','err');return;}
    d.users[i]={...d.users[i],name,email,role,roles:selectedRoles,firstAccess:fa,pending:false};
    if(hashed)d.users[i].password=hashed;
  }else{
    d.users.push({id:uid(),name,email,password:hashed,role,roles:selectedRoles,firstAccess:fa,pending:false});
  }
  logAction(d,id?'Usuário editado':'Usuário criado',name+' ('+selectedRoles.map(r=>rlabel(r)).join(', ')+')');
  sdb(d);Mclose();toast('Usuário salvo!','ok');renderUsers();
}
window.saveUser=saveUser;

function delUser(id){
  if(!confirm('Excluir usuário permanentemente?'))return;
  const d=gdb();
  const _du=d.users.find(x=>x.id===id);
  logAction(d,'Usuário excluído',_du?_du.name:'id:'+id);
  d.users=d.users.filter(u=>u.id!==id);
  sdb(d);toast('Excluído','ok');renderUsers();
}
window.delUser=delUser;

async function approveUser(id){
  const tmp=Math.random().toString(36).slice(2,10);
  const hashed=await hashPw(tmp);
  const d=gdb(),i=d.users.findIndex(x=>x.id===id);if(i<0)return;
  d.users[i].pending=false;d.users[i].firstAccess=true;d.users[i].password=hashed;
  const _au=d.users[i];
  logAction(d,'Usuário aprovado',_au?_au.name+' ('+rlabel(_au.role)+')':'id:'+id);
  sdb(d);
  Mopen('✅ Usuário Aprovado',
    '<div class="alert alert-info">Senha temporária para o novo usuário:<br><strong style="font-size:18px;letter-spacing:2px">'+tmp+'</strong><br><br>Anote e envie ao usuário. Ele deverá trocar no primeiro acesso.</div>',
    '<button class="btn btn-green" onclick="Mclose()">Ok, anotei</button>'
  );
  renderUsers();
}
window.approveUser=approveUser;

function forceLogoutUser(uid){
  if(!confirm('Deslogar este usuário?'))return;
  const d=gdb();
  if(!d.forceLogout)d.forceLogout={};
  d.forceLogout[uid]=Date.now();
  logAction(d,'Forçar logout',d.users.find(u=>u.id===uid)?.name||uid);
  sdb(d);toast('Usuário será deslogado na próxima sincronização.','ok');
}
window.forceLogoutUser=forceLogoutUser;

function forceLogoutAll(){
  if(!confirm('Deslogar TODOS os usuários (exceto você)?'))return;
  const d=gdb();
  if(!d.forceLogout)d.forceLogout={};
  d.forceLogout._all=Date.now();
  logAction(d,'Forçar logout de todos','');
  sdb(d);toast('Todos serão deslogados na próxima sincronização.','ok');
}
window.forceLogoutAll=forceLogoutAll;

function openAlertForm(uid){
  const d=gdb(),u=d.users.find(x=>x.id===uid);if(!u)return;
  Mopen('📢 Enviar Alerta para '+esc(u.name),
    '<div class="fg"><label>Mensagem *</label>'+
    '<textarea id="al-msg" style="width:100%;height:90px;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;resize:vertical" placeholder="Ex: Fulano, favor fazer lançamento de estoque do item X..."></textarea></div>'+
    '<div class="alert alert-info" style="margin-top:8px;font-size:12px">O alerta aparecerá na próxima vez que o usuário entrar, ou imediatamente se já estiver logado.</div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-green" onclick="sendAlert(\''+uid+'\')">📢 Enviar</button>'
  );
}
window.openAlertForm=openAlertForm;

function sendAlert(uid){
  const msg=(el('al-msg')||{}).value&&el('al-msg').value.trim();
  if(!msg){toast('Digite a mensagem','err');return;}
  const d=gdb();
  if(!d.alerts)d.alerts={};
  d.alerts[uid]={msg,sentAt:Date.now(),sentBy:S?S.name:'Admin',read:false};
  sdb(d);Mclose();toast('Alerta enviado!','ok');renderUsers();
}
window.sendAlert=sendAlert;

// ─── AUDITORIA ────────────────────────────────────────────────────────────────
function tabAudit(){
  el('adm-c').innerHTML=
    '<div class="card"><div class="card-header"><div class="card-title">📋 Log de Auditoria</div>'+
    '<div style="display:flex;gap:8px;align-items:center">'+
    '<input class="sinput" id="audit-q" placeholder="🔍 Filtrar..." oninput="renderAuditTable()" style="width:200px">'+
    '<button class="btn btn-ghost btn-sm" onclick="_loadAuditLog().then(renderAuditTable)">🔄</button>'+
    '</div></div>'+
    '<div id="audit-tbl"></div></div>';
  _loadAuditLog().then(()=>renderAuditTable());
}
window.tabAudit=tabAudit;

function renderAuditTable(){
  const q=(v('audit-q')||'').toLowerCase();
  const log=(_auditLog||[]).filter(e=>!q||
    (e.uname&&e.uname.toLowerCase().includes(q))||
    (e.action&&e.action.toLowerCase().includes(q))||
    (e.details&&e.details.toLowerCase().includes(q))
  );
  const tbl=el('audit-tbl');if(!tbl)return;
  if(!log.length){tbl.innerHTML='<div class="empty"><div class="ei">📋</div><p>Nenhum registro de auditoria</p></div>';return;}
  tbl.innerHTML='<div class="tw"><table><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>'+
    log.slice(0,200).map(e=>{
      const dt=new Date(e.at);
      const dts=dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      return'<tr>'+
        '<td style="font-size:12px;color:var(--muted);white-space:nowrap">'+dts+'</td>'+
        '<td style="font-size:13px;font-weight:600">'+esc(e.uname||'—')+'</td>'+
        '<td><span style="font-size:12px;padding:2px 8px;background:var(--green-dim);color:var(--green);border-radius:4px;white-space:nowrap">'+esc(e.action||'—')+'</span></td>'+
        '<td style="font-size:12px;color:var(--sub)">'+esc(e.details||'—')+'</td>'+
      '</tr>';
    }).join('')+
  '</tbody></table></div>'+(log.length>200?'<div style="font-size:11px;color:var(--muted);padding:8px 16px">Mostrando 200 de '+log.length+' registros</div>':'');
}
window.renderAuditTable=renderAuditTable;

// ─── LIMPAR BD ────────────────────────────────────────────────────────────────
function clearAllData(){
  Mopen('⚠️ Limpar Banco de Dados',
    '<div class="alert alert-danger" style="margin-bottom:16px"><strong>ATENÇÃO: Esta ação é IRREVERSÍVEL!</strong><br>Todos os clientes, produtos, ordens de produção e dados de estoque serão permanentemente excluídos. Os usuários serão mantidos.</div>'+
    '<div class="fg"><label>Digite <strong>CONFIRMAR</strong> para prosseguir:</label><input type="text" id="clear-confirm-input" placeholder="CONFIRMAR" style="margin-top:8px"></div>',
    '<button class="btn btn-ghost" onclick="Mclose()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="executeClearData()">🗑️ Limpar TUDO</button>'
  );
}
function executeClearData(){
  const val=(el('clear-confirm-input')||{value:''}).value.trim();
  if(val!=='CONFIRMAR'){toast('Digite CONFIRMAR para prosseguir','err');return;}
  const d=gdb();
  d.clients=[];d.products=[];d.ops=[];d.stock={};d.rawMaterialStock={};d.packagingStock={};d.seq=1000;
  sdb(d);Mclose();
  toast('Banco de dados limpo com sucesso!','ok');
  renderUsers();
}
window.clearAllData=clearAllData;window.executeClearData=executeClearData;

// ─── HELPER LOCAL ─────────────────────────────────────────────────────────────
// Override rlabelUser de core.js para renderizar como badges HTML na tabela
function rlabelUser(u){
  const rs=_roles(u);
  return rs.map(r=>'<span class="bs bs-pendente" style="font-size:11px;margin-right:3px">'+esc(rlabel(r))+'</span>').join('');
}
