const CACHE_NAME = 'reflexduel-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './cps-test.html',
  './spacebar-test.html',
  './aim-reflex.html',
  './styles.css',
  './app.js',
  './site.webmanifest',
  './assets/favicon.svg',
  './assets/logo.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => { })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-First Strategy with offline support for ?duel= query strings and cleanUrls
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => { });
        }
        return networkResponse;
      })
      .catch(async () => {
        const directMatch = await caches.match(request, { ignoreSearch: true });
        if (directMatch) return directMatch;

        if (request.mode === 'navigate') {
          const cleanPath = url.pathname.replace(/\/+$/, '');
          if (cleanPath && !cleanPath.endsWith('.html')) {
            const htmlMatch = await caches.match(`.${cleanPath}.html`, { ignoreSearch: true });
            if (htmlMatch) return htmlMatch;
          }
          return caches.match('./index.html');
        }
        return undefined;
      })
  );
});
