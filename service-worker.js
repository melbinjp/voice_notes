const CACHE = 'voice-notes-v13';
const SHELL = [
  './', './index.html', './app.js', './app-utils.js', './style.css',
  './manifest.json', './icon-192.png', './icon-512.png',
  './modular-recognition-manager.js', './module-registry.js', './module-loader.js',
  './engines/webspeech-engine.js', './engines/whisper-engine.js',
  './engines/base-engine.js',
  './engines/offline-summarizer-worker.js',
  './engines/whisper-worker.js',
  './engines/transcription-queue.js',
  './engines/tts-worker.js',
  './engines/audio-analytics.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only cache GET requests
  if (e.request.method !== 'GET') {
    return;
  }

  const url = new URL(e.request.url);

  // CDN & external — network first with cache fallback
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r && r.ok && r.type !== 'opaque') {
            const c = r.clone();
            caches.open(CACHE).then(ca => ca.put(e.request, c).catch(() => {}));
          }
          return r;
        })
        .catch(async () => {
          const cached = await caches.match(e.request);
          if (cached) return cached;
          return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }

  // App shell — cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r && r.ok && r.type !== 'opaque') {
          const c = r.clone();
          caches.open(CACHE).then(ca => ca.put(e.request, c).catch(() => {}));
        }
        return r;
      }).catch(async () => {
         const fallback = await caches.match('./index.html');
         return fallback || new Response('Offline', { status: 503 });
      });
    })
  );
});
