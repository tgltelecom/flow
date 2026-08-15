/* ══════════════════════════════════════════════════════
   Flow TGL v2.0 — _shell.js
   Injeta o header + modal + toast em cada página autenticada.
   Chamar initShell(currentFile, onReady) após carregar core.js.
══════════════════════════════════════════════════════ */

function initShell(currentFile, onReady) {
  // ── Injetar estrutura da página ──────────────────────
  const shell = document.getElementById('shell');
  if (!shell) return console.error('[TGL] div#shell não encontrado');

  shell.innerHTML = `
    <!-- HEADER -->
    <header class="app-header">
      <div class="header-top">
        <a href="dashboard.html" class="header-logo">
          <div class="logo-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="12" fill="#0b1117"/>
              <rect x="1" y="1" width="46" height="46" rx="11" stroke="#22c55e" stroke-opacity=".25" stroke-width="1"/>
              <path d="M14 34V14l10 10 10-10v20" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="24" cy="24" r="3" fill="#22c55e"/>
            </svg>
          </div>
          <span class="logo-text">Flow <span>TGL</span></span>
        </a>
        <div class="header-right">
          <div class="sync-badge" id="sync-badge" style="display:none">● Online</div>
          <div class="bell-wrap" id="bell-wrap">
            <button class="bell-btn" onclick="toggleBell()" title="Notificações">🔔</button>
            <span class="bell-badge" id="bell-badge" style="display:none">0</span>
            <div class="notif-drop" id="notif-drop"></div>
          </div>
          <div class="user-chip" id="huser"></div>
          <button class="btn-logout" onclick="doLogout()">Sair</button>
        </div>
      </div>
      <nav class="header-nav" id="hnav"></nav>
    </header>

    <!-- CONTENT -->
    <main class="app-content" id="acontent"></main>

    <!-- MODAL -->
    <div class="mo" id="M" onclick="if(event.target===this&&!window._modalLocked)Mclose()">
      <div class="mbox" id="Mbox">
        <div class="mh"><h2 id="Mtitle"></h2><button class="mclose" onclick="Mclose()">✕</button></div>
        <div class="mc" id="Mbody"></div>
        <div class="mf" id="Mfoot"></div>
      </div>
    </div>

    <!-- TOAST -->
    <div class="toast-wrap" id="toasts"></div>
  `;

  // ── Verificar sessão ─────────────────────────────────
  const u = checkSession();
  if (!u) return; // redireciona para index.html

  // ── Carregar DB ──────────────────────────────────────
  (async () => {
    // Cache localStorage enquanto carrega do servidor
    try {
      const bkStr = localStorage.getItem('tgl_bk');
      if (bkStr) window._db = JSON.parse(bkStr);
    } catch {}

    setSyncBadge(null);
    await loadDB();

    // Montar nav com página ativa
    buildNav(currentFile);
    renderBell();

    // Iniciar sync background
    startSync();

    // Autoarquivar OPs finalizadas há mais de 24h
    autoArchive();

    // Chamar callback da página
    if (typeof onReady === 'function') onReady();

    // Verificar alertas e estoque após render
    setTimeout(() => {
      _checkAlert();
      setTimeout(() => { if (!document.getElementById('M')?.classList.contains('open')) _checkStockAlerts(); }, 800);
    }, 400);

    // Changelog
    setTimeout(() => _checkChangelog(S), 300);

    // Chat interno — carregado dinamicamente (evita incluir em cada HTML)
    if (!document.getElementById('chat-style')) {
      const chatScript = document.createElement('script');
      chatScript.src = 'js/chat.js';
      chatScript.onload = () => { if (typeof initChat === 'function') initChat(); };
      document.head.appendChild(chatScript);
    } else if (typeof initChat === 'function') {
      initChat();
    }
  })();
}

// ─── CHANGELOG ───────────────────────────────────────
const APP_CHANGELOG = {
  '2.0.0': [
    'Nova arquitetura multi-página — navegação mais rápida e modular',
    'Novo design clean: paleta renovada, hierarquia visual clara, botões sem gradiente',
    'Login integrado com Supabase Auth — preparação para RLS',
    'Barra de busca e filtros padronizados em todas as telas',
    'Dashboard do Comprador: painel dedicado com ações de pedido e controle de prazo',
    'Requisição de Material: formulário de saída de MP/Embalagem com múltiplos itens',
    'Registro de Entrada de NF: entrada de estoque por nota fiscal',
    'Kit/Conjunto: produtos compostos por N componentes (mínimo 1)',
    'Máscara automática de CNPJ no cadastro de fornecedores',
    'Transportadora obrigatória em todas as OPs',
    'Histórico de estoque com saídas vinculadas a OPs',
    'Ícones padronizados: 🕐 histórico, 📋 inventário em todas as telas',
  ]
};

function _checkChangelog(u) {
  const d = gdb();
  const ui = d.users.findIndex(x => x.id === u.id);
  const lastV = ui >= 0 ? d.users[ui].lastSeenVersion : '';
  if (lastV === APP_VERSION) return;
  const changes = APP_CHANGELOG[APP_VERSION] || [];
  if (!changes.length) return;
  if (ui >= 0) { d.users[ui].lastSeenVersion = APP_VERSION; sdb(d); }
  Mopen('🎉 Novidades · Flow v' + APP_VERSION,
    '<p style="margin-bottom:12px;color:var(--sub)">Atualizações desta versão:</p>' +
    '<ul style="margin:0;padding-left:20px;line-height:1.8;color:var(--text)">' +
    changes.map(ch => '<li>' + esc(ch) + '</li>').join('') + '</ul>',
    '<button class="btn btn-green" onclick="Mclose()">Entendi · Continuar</button>'
  );
}

// ─── ALERTS ──────────────────────────────────────────
function _checkAlert() {
  if (!S) return;
  const d = gdb();
  const al = (d.alerts || {})[S.id];
  if (!al || al.read) return;
  window._modalLocked = true;
  const mc = document.getElementById('M')?.querySelector('.mclose');
  if (mc) mc.style.display = 'none';
  Mopen('📢 Alerta do Administrador',
    '<div style="font-size:15px;line-height:1.8;white-space:pre-wrap;word-break:break-word">' + esc(al.msg) + '</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">Enviado por ' + esc(al.sentBy || 'Admin') + ' em ' + new Date(al.sentAt).toLocaleString('pt-BR') + '</div>',
    '<button class="btn btn-green" style="min-width:120px" onclick="_confirmAlert()">OK</button>'
  );
  const mc2 = document.getElementById('M')?.querySelector('.mclose');
  if (mc2) mc2.style.display = 'none';
}

window._confirmAlert = function() {
  if (!S) return;
  const d = gdb(); if (!d.alerts) d.alerts = {};
  if (d.alerts[S.id]) d.alerts[S.id].read = true;
  window._modalLocked = false;
  const mc = document.getElementById('M')?.querySelector('.mclose');
  if (mc) mc.style.display = '';
  sdb(d); Mclose();
};

window.initShell = initShell;
window._checkChangelog = _checkChangelog;
window._checkAlert = _checkAlert;
