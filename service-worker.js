// Service Worker for PWA offline support
const CACHE_NAME = 'voice-notes-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  // Add vosk model files here later
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Always try to fetch from network first for HTML files (to get updates)
      if (event.request.mode === 'navigate' ||
          (event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html'))) {
        return fetch(event.request)
          .then(networkResponse => {
            // Update cache with latest HTML
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
            return networkResponse;
          })
          .catch(() => response || caches.match('/index.html'));
      }
      // For other requests, use cache first, then network
      return response || fetch(event.request).then(networkResponse => {
        // Optionally update cache for other assets
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      });
    })
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
