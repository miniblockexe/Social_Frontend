// Service Worker — Social PWA
const CACHE_NAME = 'social-v1';

// Chỉ cache shell tĩnh, không cache API calls
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bỏ qua API calls và SignalR — luôn đi thẳng lên mạng
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/hubs')) {
    return;
  }

  // Navigation requests (SPA) — trả về index.html từ cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
