// iFood2 Service Worker — Push Notifications
const CACHE_NAME = "ifood2-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/static/js/main.js",
  "/static/css/main.css",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Push: show notification
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "iFood2", body: "Nova notificação" };
  }

  const title = payload.title || "iFood2";
  const options = {
    body: payload.body || "Você recebeu uma nova notificação.",
    icon: payload.icon || "/logo192.png",
    badge: payload.badge || "/badge72.png",
    tag: payload.tag || "ifood2",
    requireInteraction: payload.requireInteraction ?? true,
    data: payload.data || {},
    actions: [
      { action: "open", title: "Ver pedido" },
      { action: "close", title: "Fechar" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: open app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = "/";
  if (data.pedidoId) {
    url = `/pedido/${data.pedidoId}`;
  } else if (data.restauranteId) {
    url = `/restaurante/pedidos`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// Fetch: network-first strategy for API, cache-first for static
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.url.includes("/api/")) {
    // Network-first for API
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  } else {
    // Cache-first for static assets
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});

