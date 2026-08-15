// ══════════════════════════════════════════════════════════════════
// chat.js — Flow TGL v2.0
// Chat interno entre usuários via Supabase REST (polling + presence)
// Carregado dinamicamente pelo _shell.js após autenticação
// ══════════════════════════════════════════════════════════════════

// ─── Estado ───────────────────────────────────────────────────────
let _chatOpen            = false;
let _chatWin             = null;       // { userId, userName } conversa ativa
let _chatMessages        = [];
let _chatUnread          = 0;
let _chatUnreadByUser    = {};
let _chatPollInterval    = null;
let _presenceIntervalId  = null;     // guarda ID p/ evitar duplicatas
let _pollUnreadIntervalId= null;     // guarda ID p/ evitar duplicatas
let _presenceData        = {};       // { userId: { userName, lastSeen } }

const _CHAT_ONLINE_TTL = 2 * 60 * 1000;   // 2 min = online

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
function initChat() {
  if (!S || !S.id) return;
  _injectChatStyles();
  _injectChatWidget();
  _updatePresence();
  _pollUnread();
  // Guarda IDs para evitar intervalos duplicados se initChat() for chamado novamente
  if (!_presenceIntervalId)   _presenceIntervalId   = setInterval(_updatePresence, 30000);
  if (!_pollUnreadIntervalId) _pollUnreadIntervalId = setInterval(_pollUnread, 20000);
  // Nota: sendBeacon só suporta POST — não é possível fazer PATCH de presença via beforeunload.
  // O status offline será detectado naturalmente pelo TTL de 2 minutos (_CHAT_ONLINE_TTL).
}
window.initChat = initChat;

// ═══════════════════════════════════════════════════════════════════
// ESTILOS
// ═══════════════════════════════════════════════════════════════════
function _injectChatStyles() {
  if (document.getElementById('chat-style')) return;
  const s = document.createElement('style');
  s.id = 'chat-style';
  s.textContent = `
/* ── Chat FAB ── */
.chat-fab{position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:var(--green,#22c55e);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 20px rgba(0,0,0,.45);z-index:1200;transition:transform .15s}
.chat-fab:hover{transform:scale(1.08)}
.chat-fab-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:10px;font-size:11px;font-weight:700;min-width:18px;height:18px;padding:0 4px;display:flex;align-items:center;justify-content:center;pointer-events:none}
/* ── Sidebar ── */
.chat-sidebar{position:fixed;bottom:86px;right:24px;width:256px;max-height:400px;background:var(--bg-card,#1e293b);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:1200;display:flex;flex-direction:column;overflow:hidden;animation:chatFadeIn .15s ease}
@keyframes chatFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.chat-sb-hdr{padding:10px 14px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.chat-sb-close{background:none;border:none;cursor:pointer;font-size:18px;color:var(--muted);padding:0 4px;line-height:1}
.chat-sb-close:hover{color:var(--text)}
.chat-users{overflow-y:auto;flex:1}
.chat-user-row{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--border,rgba(255,255,255,.04))}
.chat-user-row:hover{background:var(--bg,rgba(255,255,255,.04))}
.chat-avatar{width:34px;height:34px;border-radius:50%;background:var(--accent,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;position:relative}
.chat-dot{position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;border:2px solid var(--bg-card,#1e293b)}
.chat-user-info{flex:1;min-width:0}
.chat-user-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-user-sub{font-size:11px;color:var(--muted)}
.chat-unread-badge{background:#ef4444;color:#fff;border-radius:10px;font-size:10px;font-weight:700;min-width:16px;height:16px;padding:0 4px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
/* ── Chat window ── */
.chat-window{position:fixed;bottom:86px;right:292px;width:316px;height:400px;background:var(--bg-card,#1e293b);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:1201;display:flex;flex-direction:column;overflow:hidden;animation:chatFadeIn .15s ease}
.chat-win-hdr{padding:9px 12px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));display:flex;align-items:center;gap:8px;flex-shrink:0}
.chat-win-title{flex:1;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-win-close{background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted);padding:2px 6px;line-height:1}
.chat-win-close:hover{color:var(--text)}
.chat-msgs{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:5px;scroll-behavior:smooth}
.chat-bubble{max-width:78%;padding:7px 11px;border-radius:12px;font-size:13px;line-height:1.4;word-break:break-word;position:relative}
.chat-bubble.mine{align-self:flex-end;background:var(--green,#22c55e);color:#fff;border-bottom-right-radius:3px}
.chat-bubble.theirs{align-self:flex-start;background:rgba(255,255,255,.09);color:var(--text);border-bottom-left-radius:3px}
.chat-bubble-time{font-size:9px;opacity:.55;margin-top:3px;text-align:right}
.chat-input-row{display:flex;gap:6px;padding:9px 10px;border-top:1px solid var(--border,rgba(255,255,255,.08));flex-shrink:0}
.chat-inp{flex:1;background:var(--bg,rgba(255,255,255,.06));border:1px solid var(--border,rgba(255,255,255,.12));border-radius:20px;padding:7px 14px;font-size:13px;color:var(--text);outline:none;min-width:0}
.chat-inp:focus{border-color:var(--green,#22c55e)}
.chat-send{width:34px;height:34px;border-radius:50%;background:var(--green,#22c55e);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;opacity:1;transition:opacity .12s}
.chat-send:hover{opacity:.82}
.chat-empty-msg{color:var(--muted);font-size:12px;text-align:center;padding:24px 12px}
  `;
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════════════
// WIDGET HTML
// ═══════════════════════════════════════════════════════════════════
function _injectChatWidget() {
  if (document.getElementById('chat-root')) return;
  const root = document.createElement('div');
  root.id = 'chat-root';
  root.innerHTML =
    // FAB
    '<button class="chat-fab" onclick="toggleChat()" title="Chat interno" aria-label="Abrir chat">💬' +
    '<span class="chat-fab-badge" id="chat-fab-badge" style="display:none">0</span></button>' +
    // Sidebar usuários
    '<div class="chat-sidebar" id="chat-sidebar" style="display:none">' +
    '<div class="chat-sb-hdr"><span>👥 Equipe</span>' +
    '<button class="chat-sb-close" onclick="toggleChat()" title="Fechar">✕</button></div>' +
    '<div class="chat-users" id="chat-users"><div class="chat-empty-msg">Carregando...</div></div>' +
    '</div>' +
    // Janela de conversa
    '<div class="chat-window" id="chat-window" style="display:none">' +
    '<div class="chat-win-hdr">' +
    '<div class="chat-avatar" id="cwAvatar" style="width:28px;height:28px;font-size:11px">?</div>' +
    '<span class="chat-win-title" id="cwTitle">—</span>' +
    '<button class="chat-win-close" onclick="closeChatWin()" title="Fechar">✕</button></div>' +
    '<div class="chat-msgs" id="chat-msgs"></div>' +
    '<div class="chat-input-row">' +
    '<input class="chat-inp" id="chat-inp" placeholder="Mensagem..." maxlength="500"' +
    ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendChat()}">' +
    '<button class="chat-send" onclick="sendChat()" title="Enviar">➤</button>' +
    '</div></div>';
  document.body.appendChild(root);
}

// ═══════════════════════════════════════════════════════════════════
// PRESENÇA
// ═══════════════════════════════════════════════════════════════════
async function _updatePresence() {
  if (!S) return;
  try {
    await _sf('/rest/v1/' + _PRESENCE_TABLE, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: S.id, user_name: S.name, last_seen: new Date().toISOString() })
    });
    // Lê presença de todos
    const r = await _sf('/rest/v1/' + _PRESENCE_TABLE + '?select=*');
    if (!r.ok) return;
    const rows = await r.json();
    _presenceData = {};
    rows.forEach(row => {
      _presenceData[row.user_id] = { userName: row.user_name, lastSeen: new Date(row.last_seen).getTime() };
    });
    _renderUsersList();
  } catch {}
}

function _isOnline(uid) {
  const p = _presenceData[uid];
  return p && (Date.now() - p.lastSeen < _CHAT_ONLINE_TTL);
}

// ═══════════════════════════════════════════════════════════════════
// LISTA DE USUÁRIOS
// ═══════════════════════════════════════════════════════════════════
function _renderUsersList() {
  const el = document.getElementById('chat-users'); if (!el) return;
  const d = gdb();
  const users = (d.users || []).filter(u => u.id !== S.id && u.active !== false && u.status !== 'pending');
  if (!users.length) { el.innerHTML = '<div class="chat-empty-msg">Nenhum outro usuário</div>'; return; }

  users.sort((a, b) => {
    const ao = _isOnline(a.id), bo = _isOnline(b.id);
    if (ao !== bo) return ao ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  el.innerHTML = users.map(u => {
    const online = _isOnline(u.id);
    const initials = _initials(u.name || '?');
    const unread = _chatUnreadByUser[u.id] || 0;
    const sub = online ? '🟢 Online' : (_presenceData[u.id] ? _timeSince(_presenceData[u.id].lastSeen) : 'Offline');
    return '<div class="chat-user-row" onclick="openChatWin(\'' + esc(u.id) + '\',\'' + esc(u.name || u.id) + '\')">' +
      '<div class="chat-avatar">' + initials +
      '<span class="chat-dot" style="background:' + (online ? '#22c55e' : '#475569') + '"></span></div>' +
      '<div class="chat-user-info">' +
      '<div class="chat-user-name">' + esc(u.name || u.id) + '</div>' +
      '<div class="chat-user-sub">' + sub + '</div></div>' +
      (unread ? '<span class="chat-unread-badge">' + unread + '</span>' : '') +
      '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// TOGGLE SIDEBAR
// ═══════════════════════════════════════════════════════════════════
window.toggleChat = function () {
  _chatOpen = !_chatOpen;
  const sb = document.getElementById('chat-sidebar');
  if (sb) sb.style.display = _chatOpen ? 'flex' : 'none';
  if (_chatOpen) { _updatePresence(); _pollUnreadByUser(); }
};

// ═══════════════════════════════════════════════════════════════════
// UNREAD COUNT
// ═══════════════════════════════════════════════════════════════════
async function _pollUnread() {
  if (!S) return;
  try {
    const r = await _sf('/rest/v1/' + _CHAT_TABLE + '?receiver_id=eq.' + encodeURIComponent(S.id) + '&read_at=is.null&select=id');
    if (!r.ok) return;
    const rows = await r.json();
    _chatUnread = rows.length;
    _updateFabBadge();
  } catch {}
}

async function _pollUnreadByUser() {
  if (!S) return;
  try {
    const r = await _sf('/rest/v1/' + _CHAT_TABLE + '?receiver_id=eq.' + encodeURIComponent(S.id) + '&read_at=is.null&select=sender_id');
    if (!r.ok) return;
    const rows = await r.json();
    _chatUnreadByUser = {};
    rows.forEach(row => { _chatUnreadByUser[row.sender_id] = (_chatUnreadByUser[row.sender_id] || 0) + 1; });
    _renderUsersList();
  } catch {}
}

function _updateFabBadge() {
  const b = document.getElementById('chat-fab-badge'); if (!b) return;
  if (_chatUnread > 0) { b.textContent = _chatUnread > 99 ? '99+' : _chatUnread; b.style.display = 'flex'; }
  else { b.style.display = 'none'; }
}

// ═══════════════════════════════════════════════════════════════════
// JANELA DE CONVERSA
// ═══════════════════════════════════════════════════════════════════
window.openChatWin = async function (userId, userName) {
  _chatWin = { userId, userName };

  const win = document.getElementById('chat-window'); if (!win) return;
  win.style.display = 'flex';

  const avEl = document.getElementById('cwAvatar');
  const titEl = document.getElementById('cwTitle');
  if (avEl) avEl.textContent = _initials(userName);
  if (titEl) titEl.textContent = userName;

  _chatMessages = [];
  await _loadMessages();
  _scrollBottom();
  _markRead(userId);

  if (_chatPollInterval) clearInterval(_chatPollInterval);
  _chatPollInterval = setInterval(async () => {
    const before = _chatMessages.length;
    await _loadMessages();
    if (_chatMessages.length > before) { _scrollBottom(); _markRead(userId); }
  }, 4000);
};

window.closeChatWin = function () {
  if (_chatPollInterval) { clearInterval(_chatPollInterval); _chatPollInterval = null; }
  _chatWin = null;
  _chatMessages = [];
  const win = document.getElementById('chat-window'); if (win) win.style.display = 'none';
  _pollUnread();
};

// ═══════════════════════════════════════════════════════════════════
// MENSAGENS
// ═══════════════════════════════════════════════════════════════════
async function _loadMessages() {
  if (!_chatWin || !S) return;
  const me = encodeURIComponent(S.id);
  const them = encodeURIComponent(_chatWin.userId);
  try {
    // Duas queries separadas (REST API não suporta OR+AND aninhado sem JS client)
    const [r1, r2] = await Promise.all([
      _sf('/rest/v1/' + _CHAT_TABLE + '?sender_id=eq.' + me + '&receiver_id=eq.' + them + '&order=created_at.asc&limit=60'),
      _sf('/rest/v1/' + _CHAT_TABLE + '?sender_id=eq.' + them + '&receiver_id=eq.' + me + '&order=created_at.asc&limit=60')
    ]);
    if (!r1.ok || !r2.ok) return;
    const [a, b] = await Promise.all([r1.json(), r2.json()]);
    const all = [...a, ...b].sort((x, y) => x.created_at.localeCompare(y.created_at)).slice(-60);
    _chatMessages = all;
    _renderMessages();
  } catch {}
}

function _renderMessages() {
  const el = document.getElementById('chat-msgs'); if (!el) return;
  if (!_chatMessages.length) {
    el.innerHTML = '<div class="chat-empty-msg">Nenhuma mensagem ainda.<br>Diga olá! 👋</div>';
    return;
  }
  el.innerHTML = _chatMessages.map(msg => {
    const mine = msg.sender_id === S.id;
    const dt = new Date(msg.created_at);
    const time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return '<div class="chat-bubble ' + (mine ? 'mine' : 'theirs') + '">' +
      esc(msg.content) +
      '<div class="chat-bubble-time">' + time + '</div></div>';
  }).join('');
}

function _scrollBottom() {
  const el = document.getElementById('chat-msgs');
  if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

// ═══════════════════════════════════════════════════════════════════
// ENVIO
// ═══════════════════════════════════════════════════════════════════
window.sendChat = async function () {
  const inp = document.getElementById('chat-inp'); if (!inp) return;
  const content = inp.value.trim();
  if (!content || !_chatWin || !S) return;
  inp.value = '';
  try {
    const r = await _sf('/rest/v1/' + _CHAT_TABLE, {
      method: 'POST',
      body: JSON.stringify({
        sender_id: S.id, sender_name: S.name,
        receiver_id: _chatWin.userId,
        content,
        created_at: new Date().toISOString()
      })
    });
    if (!r.ok) throw new Error(await r.text());
    await _loadMessages();
    _scrollBottom();
  } catch { toast('Erro ao enviar mensagem', 'err'); }
};

// ═══════════════════════════════════════════════════════════════════
// MARCAR COMO LIDO
// ═══════════════════════════════════════════════════════════════════
async function _markRead(senderId) {
  if (!S) return;
  try {
    await _sf(
      '/rest/v1/' + _CHAT_TABLE +
      '?sender_id=eq.' + encodeURIComponent(senderId) +
      '&receiver_id=eq.' + encodeURIComponent(S.id) +
      '&read_at=is.null',
      { method: 'PATCH', body: JSON.stringify({ read_at: new Date().toISOString() }) }
    );
    const _unreadCount = _chatUnreadByUser[senderId] || 0;
    delete _chatUnreadByUser[senderId];
    _chatUnread = Math.max(0, _chatUnread - _unreadCount);
    _updateFabBadge();
    _renderUsersList();
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function _initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function _timeSince(ts) {
  const d = Date.now() - ts;
  if (d < 60000)     return 'Há pouco';
  if (d < 3600000)   return 'Há ' + Math.floor(d / 60000) + 'min';
  if (d < 86400000)  return 'Há ' + Math.floor(d / 3600000) + 'h';
  return 'Há ' + Math.floor(d / 86400000) + 'd';
}
