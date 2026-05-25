// ── ZapFome Service Worker v2 ─────────────────────────────────
// Strategy:
//   - App shell (JS/CSS/HTML) → stale-while-revalidate
//   - API calls              → network-only (never cache)
//   - Images/fonts           → cache-first (long TTL)
//   - Offline order queue    → localStorage managed by the app

const CACHE_VERSION = 'zapfome-v2';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;
const ALL_CACHES    = [STATIC_CACHE, IMAGE_CACHE];

// Assets to pre-cache on install
const PRECACHE_URLS = ['/', '/index.html'];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // 1. Skip non-GET and cross-origin
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !url.hostname.includes('fonts.')) return;

  // 2. API — network-only, no cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  // 3. Images — cache-first (30-day TTL enforced by the app)
  if (/\.(png|jpg|jpeg|webp|svg|gif|ico)$/i.test(url.pathname) || url.pathname.startsWith('/uploads/')) {
    e.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request).catch(() => null);
        if (fresh?.ok) cache.put(request, fresh.clone());
        return fresh ?? new Response('', { status: 503 });
      })
    );
    return;
  }

  // 4. App shell — stale-while-revalidate
  e.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((fresh) => {
          if (fresh?.ok) cache.put(request, fresh.clone());
          return fresh;
        })
        .catch(() => null);

      return cached ?? fetchPromise ?? new Response('Offline', { status: 503 });
    })
  );
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? '🍽️ Novo Pedido!', {
      body:              data.body ?? 'Um novo pedido chegou.',
      icon:              '/favicon.ico',
      badge:             '/favicon.ico',
      tag:               data.tag ?? 'zapfome-alert',
      renotify:          true,
      requireInteraction: data.requireInteraction ?? true,
      data:              data,
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? '/'));
});

// ── Background sync: flush offline order queue ────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-offline-orders') {
    e.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'SYNC_OFFLINE_ORDERS' }));
      })
    );
  }
});
