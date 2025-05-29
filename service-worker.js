// Service Worker for PWA offline support
const CACHE_NAME = 'voice-notes-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/vosk.js',
  '/vosk-integration.js',
  // Explicitly cache all model files for offline use
  './vosk-model-small-en-us-0.15/README',
  './vosk-model-small-en-us-0.15/am/final.mdl',
  './vosk-model-small-en-us-0.15/conf/mfcc.conf',
  './vosk-model-small-en-us-0.15/conf/model.conf',
  './vosk-model-small-en-us-0.15/graph/disambig_tid.int',
  './vosk-model-small-en-us-0.15/graph/Gr.fst',
  './vosk-model-small-en-us-0.15/graph/HCLr.fst',
  './vosk-model-small-en-us-0.15/graph/phones/word_boundary.int',
  './vosk-model-small-en-us-0.15/ivector/final.dubm',
  './vosk-model-small-en-us-0.15/ivector/final.ie',
  './vosk-model-small-en-us-0.15/ivector/final.mat',
  './vosk-model-small-en-us-0.15/ivector/global_cmvn.stats',
  './vosk-model-small-en-us-0.15/ivector/online_cmvn.conf',
  './vosk-model-small-en-us-0.15/ivector/splice.conf'
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
            // Clone the response for cache and for return
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          })
          .catch(() => response || caches.match('/index.html'));
      }
      // For app.js and index.html, always try to update cache in background (cache-busting)
      if (event.request.url.endsWith('app.js') || event.request.url.endsWith('index.html')) {
        return fetch(event.request)
          .then(networkResponse => {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          })
          .catch(() => response);
      }
      // For other requests, use cache first, then network
      return response || fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
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
