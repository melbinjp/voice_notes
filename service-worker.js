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
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((response) => {
        // Return cached response if found.
        // Otherwise, fetch from network, cache it, and return the response.
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // We need to clone the response to cache it and return it.
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });

        // Return the cached response or the network promise.
        return response || fetchPromise;
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
