const CACHE = 'voice-notes-v5';
const SHELL = [
  './', './index.html', './app.js', './app-utils.js', './style.css',
  './manifest.json', './icon-192.png', './icon-512.png',
  './modular-recognition-manager.js', './module-registry.js', './module-loader.js',
  './engines/webspeech-engine.js', './engines/whisper-engine.js',
  './engines/base-engine.js',
  './engines/offline-summarizer-worker.js',
  './engines/whisper-worker.js',
  './engines/transcription-queue.js',
  './engines/mms-tts-worker.js',
  './engines/kokoro-tts-worker.js',
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
  const url = new URL(e.request.url);

  // CDN & external — network first with cache fallback
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell — cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r.ok) {
          const c = r.clone();
          caches.open(CACHE).then(ca => ca.put(e.request, c));
        }
        return r;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
