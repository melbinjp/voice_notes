const CACHE = 'voice-notes-v16';
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
  './engines/tts.js',
  './engines/diarize.js',
  './engines/languages.js',
  './engines/timeline.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(SHELL.map(u => c.add(u).catch(() => undefined)))
    ).then(() => self.skipWaiting())
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
  if (e.request.method !== 'GET') return;
  const modelHost = /jsdelivr\.net|huggingface\.co|hf\.co/.test(url.hostname);
  if (url.origin !== location.origin && !modelHost) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(r => {
        if (r && r.ok) {
          const c = r.clone();
          caches.open(CACHE).then(ca => ca.put(e.request, c));
        }
        return r;
      }).catch(() => cached || (url.origin === location.origin ? caches.match('./index.html') : undefined));
      if (modelHost) return cached || fetched;
      return fetched.then(r => r || cached);
    })
  );
});
