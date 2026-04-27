#!/bin/bash
set -e

# Rename
mv engines/tts-worker.js engines/mms-tts-worker.js

# Patch index.html
patch -p1 << 'PATCH'
--- a/index.html
+++ b/index.html
@@ -119,11 +119,17 @@
           <div class="model-card-header">
             <div class="model-card-icon">🔊</div>
             <div class="model-card-info">
-              <div class="model-card-name">MMS TTS (English)</div>
-              <div class="model-card-desc">Text-to-speech · <code>Xenova/mms-tts-eng</code></div>
+              <div class="model-card-name">Text-to-Speech Engine</div>
+              <div class="model-card-desc">Offline Text-to-speech AI</div>
             </div>
             <div class="model-readiness-badge" id="kokoroReadiness" data-state="idle">Not loaded</div>
           </div>
+          <div style="margin-top: 8px;">
+            <select id="ttsEngineSelect" aria-label="Select TTS engine" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-body); color: var(--text-color); font-size: 0.8rem;">
+              <option value="kokoro">Kokoro (High Quality, Voices, Speed, ~80MB)</option>
+              <option value="mms">MMS (Fast, Single Voice, ~60MB)</option>
+            </select>
+          </div>
           <div class="model-progress-area" id="kokoroProgressArea" style="display:none;">
             <div class="model-progress-file" id="kokoroProgressFile">Downloading…</div>
             <div class="progress-track"><div id="kokoroProgressBar" class="progress-fill"></div></div>
@@ -174,7 +180,7 @@
       <!-- TTS Panel -->
       <div class="tts-panel" id="ttsPanel">
         <div class="tts-controls">
-          <button id="ttsSpeakBtn" class="btn-ghost tts-speak-btn" aria-label="Speak transcript aloud" title="Read transcript aloud with Kokoro AI">
+          <button id="ttsSpeakBtn" class="btn-ghost tts-speak-btn" aria-label="Speak transcript aloud" title="Read transcript aloud with Offline AI">
             <span id="ttsSpeakIcon">🔊</span>
             <span id="ttsSpeakLabel">Speak</span>
           </button>
@@ -183,7 +189,7 @@
           <select id="ttsVoiceSelect" class="tts-voice-select" aria-label="TTS voice" style="display:none;">
             <option value="af_heart">❤️ Heart (US Female)</option>
           </select>
-          <div class="tts-speed-wrap" title="Speech speed" style="display:none;">
+          <div class="tts-speed-wrap" title="Speech speed" id="ttsSpeedWrap" style="display:none;">
             <span class="tts-speed-label">🐢</span>
             <input type="range" id="ttsSpeedSlider" min="0.5" max="2" step="0.1" value="1" aria-label="Speech speed" />
             <span class="tts-speed-label">🐇</span>
@@ -194,7 +200,7 @@
           <div class="tts-progress-bar-wrap">
             <div id="ttsProgressFill" class="progress-fill tts-progress-fill"></div>
           </div>
-          <span id="ttsProgressLabel" class="tts-progress-label">Loading Kokoro…</span>
+          <span id="ttsProgressLabel" class="tts-progress-label">Loading TTS…</span>
         </div>
       </div>

PATCH

# Patch app.js
patch -p1 << 'PATCH'
--- a/app.js
+++ b/app.js
@@ -163,6 +163,9 @@
     ttsProgress: document.getElementById('ttsProgress'),
     ttsProgressFill: document.getElementById('ttsProgressFill'),
     ttsProgressLabel: document.getElementById('ttsProgressLabel'),
+    // TTS Engine Settings
+    ttsEngineSelect: document.getElementById('ttsEngineSelect'),
+    ttsSpeedWrap: document.getElementById('ttsSpeedWrap'),
     // Kokoro model card
     kokoroReadiness: document.getElementById('kokoroReadiness'),
     kokoroProgressArea: document.getElementById('kokoroProgressArea'),
@@ -928,10 +931,45 @@
     if (pct != null) { el.ttsProgressFill.style.width = pct + '%'; el.ttsProgressFill.style.animation = 'none'; }
     else if (show) { el.ttsProgressFill.style.width = '100%'; el.ttsProgressFill.style.animation = 'pulse 1.5s infinite'; }
   }
+
+  function getSelectedTTSEngine() {
+    return el.ttsEngineSelect ? el.ttsEngineSelect.value : 'kokoro';
+  }
+
+  if (el.ttsEngineSelect) {
+    el.ttsEngineSelect.addEventListener('change', () => {
+      // Re-initialize worker if it changes
+      if (ttsWorker) {
+        ttsWorker.terminate();
+        ttsWorker = null;
+      }
+      const engine = getSelectedTTSEngine();
+      if (engine === 'mms') {
+        if (el.ttsSpeedWrap) el.ttsSpeedWrap.style.display = 'none';
+      } else {
+        if (el.ttsSpeedWrap) el.ttsSpeedWrap.style.display = 'flex';
+      }
+      // Reset statuses
+      if (el.kokoroReadiness) {
+        el.kokoroReadiness.textContent = 'Not loaded';
+        el.kokoroReadiness.dataset.state = 'idle';
+      }
+      el.ttsVoiceSelect.innerHTML = '';
+      initTTSWorker();
+    });
+    // Trigger initial state
+    if (el.ttsEngineSelect.value === 'mms' && el.ttsSpeedWrap) {
+      el.ttsSpeedWrap.style.display = 'none';
+    }
+  }

   function initTTSWorker() {
     if (ttsWorker) return;
-    ttsWorker = new Worker('engines/tts-worker.js', { type: 'module' });
+
+    const engine = getSelectedTTSEngine();
+    const workerFile = engine === 'mms' ? 'engines/mms-tts-worker.js' : 'engines/kokoro-tts-worker.js';
+
+    ttsWorker = new Worker(workerFile, { type: 'module' });
     ttsWorker.postMessage({ action: 'list_voices', id: 'voices' });
     ttsWorker.onmessage = e => {
       const { status, id } = e.data;
@@ -939,12 +977,13 @@
         el.ttsVoiceSelect.innerHTML = e.data.voices.map(v =>
           `<option value="${v.id}">${v.name}</option>`
         ).join('');
+        el.ttsVoiceSelect.style.display = e.data.voices.length > 1 ? 'inline-block' : 'none';
         return;
       }
-      if (status === 'loading') { setTTSProgress(true, 'Loading Kokoro model…'); updateKokoroStatus('loading'); }
+      if (status === 'loading') { setTTSProgress(true, `Loading ${engine} model…`); updateKokoroStatus('loading'); }
       else if (status === 'progress') {
         const d = e.data.data || {};
-        setTTSProgress(true, `Downloading: ${d.file || 'kokoro'} (${Math.round(d.progress || 0)}%)`, d.progress);
+        setTTSProgress(true, `Downloading: ${d.file || engine} (${Math.round(d.progress || 0)}%)`, d.progress);
         updateKokoroStatus('progress', d);
       } else if (status === 'ready') { setTTSProgress(false); updateKokoroStatus('ready'); }
       else if (status === 'generating') { setTTSProgress(true, 'Generating speech…'); }
@@ -1060,10 +1099,10 @@
     if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); el.ttsSpeakBtn.click(); }
   });

-  // "Preload All" also warms up the Kokoro TTS model
+  // "Preload All" also warms up the TTS model
   el.preloadModelsBtn.addEventListener('click', () => {
     initTTSWorker();
-    ttsWorker.postMessage({ action: 'preload', id: 'kokoro-preload-' + Date.now() });
+    ttsWorker.postMessage({ action: 'preload', id: 'tts-preload-' + Date.now() });
   });
 }

PATCH

# Patch mms-tts-worker.js
patch -p1 << 'PATCH'
--- a/engines/mms-tts-worker.js
+++ b/engines/mms-tts-worker.js
@@ -9,21 +9,13 @@
 env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);

 // ── Available voices ──────────────────────────────────────────────────────
+// MMS only has one voice natively. We provide this array for API compatibility with the UI.
 const VOICES = [
-    { id: 'af_heart',   name: '❤️  Heart (US Female)',    lang: 'en-US' },
-    { id: 'af_bella',   name: '🌸 Bella (US Female)',    lang: 'en-US' },
-    { id: 'af_sarah',   name: '☀️  Sarah (US Female)',   lang: 'en-US' },
-    { id: 'af_nicole',  name: '🎙️ Nicole (US Female)',   lang: 'en-US' },
-    { id: 'am_adam',    name: '🎤 Adam (US Male)',        lang: 'en-US' },
-    { id: 'am_michael', name: '🎧 Michael (US Male)',    lang: 'en-US' },
-    { id: 'bf_emma',    name: '🫖 Emma (UK Female)',     lang: 'en-GB' },
-    { id: 'bf_isabella',name: '🌹 Isabella (UK Female)', lang: 'en-GB' },
-    { id: 'bm_george',  name: '🎩 George (UK Male)',     lang: 'en-GB' },
-    { id: 'bm_lewis',   name: '📻 Lewis (UK Male)',      lang: 'en-GB' },
+    { id: 'default',   name: '🎤 Default Voice',    lang: 'en-US' },
 ];

 // ── Pipeline singleton ────────────────────────────────────────────────────
-class KokoroPipeline {
+class MMSPipeline {
     static instance = null;

     static async getInstance(onProgress) {
@@ -45,7 +37,7 @@
     }
 }

-// ── Split long text into sentence chunks (Kokoro cap ~500 chars) ───────────
+// ── Split long text into sentence chunks ───────────
 function splitSentences(text, maxLen = 400) {
     const raw = text.match(/[^.!?]+[.!?]*/g) || [text];
     const chunks = [];
@@ -75,12 +67,12 @@
         try {
             self.postMessage({ status: 'loading', id });

-            const tts = await KokoroPipeline.getInstance((data) => {
+            const tts = await MMSPipeline.getInstance((data) => {
                 if (data.status === 'progress') {
                     self.postMessage({
                         status: 'progress',
                         data: {
-                            file: data.file || data.name || 'kokoro-model',
+                            file: data.file || data.name || 'mms-model',
                             progress: typeof data.progress === 'number' ? Math.round(data.progress) : null,
                             loaded: data.loaded || 0,
                             total:  data.total  || 0,
@@ -95,10 +87,10 @@
             self.postMessage({ status: 'ready', id });

             if (action === 'generate') {
-                const { text, voice = 'af_heart', speed = 1.0 } = e.data;
+                const { text } = e.data; // MMS doesn't support voices/speed natively
                 const sentences = splitSentences(text.trim());
                 const allAudio  = [];
-                let   sampleRate = 24000;
+                let   sampleRate = 16000;

                 self.postMessage({ status: 'generating', total: sentences.length, id });

@@ -123,7 +115,7 @@
                 );
             }
         } catch (err) {
-            KokoroPipeline.instance = null; // reset on error so next attempt retries
+            MMSPipeline.instance = null; // reset on error so next attempt retries
             self.postMessage({ status: 'error', error: err.message, id });
         }
     }
PATCH

# Patch service-worker.js
patch -p1 << 'PATCH'
--- a/service-worker.js
+++ b/service-worker.js
@@ -8,7 +8,8 @@
   './engines/offline-summarizer-worker.js',
   './engines/whisper-worker.js',
   './engines/transcription-queue.js',
-  './engines/tts-worker.js',
+  './engines/mms-tts-worker.js',
+  './engines/kokoro-tts-worker.js',
 ];

 self.addEventListener('install', e => {
PATCH
