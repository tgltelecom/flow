// ══════════════════════════════════════════════════════════════════
// sw.js — Flow TGL v2.0 Service Worker
// Estratégia: Network-first para tudo (app online-first com Supabase)
// Cache shell (HTML/CSS/JS) para offline básico e carregamento rápido
// ══════════════════════════════════════════════════════════════════

const CACHE_NAME = 'flow-tgl-v2-2';

// Recursos do shell do app que cachear no install
const SHELL_URLS = [
  '/flow/',
  '/flow/index.html',
  '/flow/dashboard.html',
  '/flow/pedidos.html',
  '/flow/producao.html',
  '/flow/suprimentos.html',
  '/flow/expedicao.html',
  '/flow/historico.html',
  '/flow/admin.html',
  '/flow/cadastros.html',
  '/flow/relatorios.html',
  '/flow/agenda.html',
  '/flow/css/app.css',
  '/flow/js/core.js',
  '/flow/js/_shell.js',
  '/flow/js/dashboard.js',
  '/flow/js/pedidos.js',
  '/flow/js/producao.js',
  '/flow/js/suprimentos.js',
  '/flow/js/expedicao.js',
  '/flow/js/historico.js',
  '/flow/js/admin.js',
  '/flow/js/cadastros.js',
  '/flow/js/relatorios.js',
  '/flow/js/agenda.js',
  '/flow/js/chat.js',
  '/flow/manifest.json',
];

// ── Install: pré-cachear shell ───────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Cacheia cada URL individualmente — falha em uma não descarta as outras
      Promise.all(
        SHELL_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Falha ao cachear:', url, err))
        )
      )
    )
  );
});

// ── Activate: limpa caches antigos ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first com fallback de cache ──────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Passa requisições ao Supabase direto (sem cache — dados em tempo real)
  if (url.hostname.includes('supabase.co')) return;

  // Passa requisições a CDNs de terceiros direto
  if (url.hostname.includes('cdnjs.cloudflare.com')) return;

  // Para arquivos do app: Network-first, fallback para cache
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cacheia resposta bem-sucedida (somente GET, status 200)
        if (request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        // Offline: retorna do cache
        caches.match(request).then(cached => {
          if (cached) return cached;
          // Para navegação offline, retorna index.html como fallback
          if (request.mode === 'navigate') return caches.match('/flow/index.html');
          return new Response('Offline', { status: 503 });
        })
      )
  );
});
