// Service Worker for Voice Notes PWA
const CACHE_NAME = 'voice-notes-v8';
const STATIC_CACHE = 'voice-notes-static-v8';

// Files to cache
const STATIC_FILES = [
  './',
  './index.html',
  './app.js?v=7',
  './modular-recognition-manager.js?v=7',
  './module-registry.js?v=7',
  './module-loader.js?v=7',
  './engines/vosk-engine.js?v=7',
  './engines/webspeech-engine.js?v=7',
  './vosk.js?v=7',
  './vosk-latest.js?v=7',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install event
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Caching static files...');
        return cache.addAll(STATIC_FILES);
      })
      .catch(error => {
        console.error('Cache addAll failed:', error);
        // Fallback: cache files individually
        return caches.open(STATIC_CACHE).then(cache => {
          const cachePromises = STATIC_FILES.map(url => 
            cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              return null;
            })
          );
          return Promise.all(cachePromises);
        });
      })
      .then(() => {
        console.log('Service Worker installed successfully');
        return self.skipWaiting();
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches
          if (cacheName !== STATIC_CACHE && cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated successfully');
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Handle static files
  if (STATIC_FILES.some(file => request.url.includes(file.replace('?v=7', '')))) {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            return response;
          }
          
          // If not in cache, fetch from network
          return fetch(request)
            .then(networkResponse => {
              // Cache the response for future use
              if (networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(STATIC_CACHE).then(cache => {
                  cache.put(request, responseClone);
                });
              }
              return networkResponse;
            });
        })
        .catch(error => {
          console.error('Fetch failed:', error);
          // Return offline page or fallback
          return caches.match('./index.html');
        })
    );
    return;
  }
  
  // Handle dynamic content (API calls, etc.)
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(error => {
        console.error('Network fetch failed:', error);
        // Try to serve from cache
        return caches.match(request);
      })
  );
});

// Message event for cache management
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            console.log('Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
    );
  }
});
