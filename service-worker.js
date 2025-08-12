// Service Worker for PWA offline support
const CACHE_NAME = 'voice-notes-cache-v1';
const urlsToCache = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Strategy: Network-first for navigation requests, to ensure users get the latest HTML.
      if (event.request.mode === 'navigate') {
        return fetch(event.request)
          .then((networkResponse) => {
            // Clone the response to put it in the cache.
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          })
          .catch(() => {
            // If the network fails, serve the cached version if available.
            return cachedResponse || caches.match('index.html');
          });
      }

      // Strategy: Cache-first for all other requests (CSS, JS, images, models).
      // This provides the best performance and offline capability.
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, fetch from the network.
      return fetch(event.request).then((networkResponse) => {
        // Don't cache opaque responses (e.g., from some CDNs without CORS) or errors.
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }

        // Clone the response to put it in the cache.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    }),
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Optional: Clean up old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
});
