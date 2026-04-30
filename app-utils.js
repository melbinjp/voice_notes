// ── Theme ──────────────────────────────────────────────────────────────
// Resolves what theme is actually active (light or dark)
export function resolveTheme(stored) {
  if (stored === 'dark' || stored === 'light') return stored;
  // 'system' or undefined → follow OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme() {
  return localStorage.getItem('vn-theme') || 'system';
}

export function applyTheme(theme) {
  localStorage.setItem('vn-theme', theme);
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', resolved);

  // Toggle button shows CURRENT state and hints at what clicking will do
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.textContent = resolved === 'dark' ? '☀️' : '🌙';
    btn.title = resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }

  // Settings dropdown stays in sync
  const sel = document.getElementById('themeSelect');
  if (sel) sel.value = theme;
}

export function toggleTheme() {
  // Always flip the currently-resolved theme to the opposite
  const resolved = document.documentElement.getAttribute('data-theme') || resolveTheme('system');
  // Store the explicit choice (not 'system') so the toggle is sticky
  applyTheme(resolved === 'dark' ? 'light' : 'dark');
}

// ── Toast ───────────────────────────────────────────────────────────────
export function showToast(msg, type = 'info', duration = 3200) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

// ── Waveform Visualizer ─────────────────────────────────────────────────
export class WaveformVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.analyser = null;
    this.raf = null;
    this.active = false;
  }

  start(stream) {
    if (!this.ctx) return;
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(stream);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.active = true;
    this.canvas.classList.remove('hidden');
    this._draw();
  }

  _draw() {
    if (!this.active) return;
    this.raf = requestAnimationFrame(() => this._draw());
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(buf);
    const W = this.canvas.width, H = this.canvas.height;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this.ctx.clearRect(0, 0, W, H);
    this.ctx.beginPath();
    this.ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#6366f1';
    this.ctx.lineWidth = 2;
    const sliceWidth = W / buf.length;
    let x = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] / 128.0;
      const y = (v * H) / 2;
      i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
      x += sliceWidth;
    }
    this.ctx.lineTo(W, H / 2);
    this.ctx.stroke();
  }

  stop() {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.canvas.classList.add('hidden');
  }
}

// ── Recording Timer ─────────────────────────────────────────────────────
export class RecordingTimer {
  constructor(displayId) {
    this.el = document.getElementById(displayId);
    this.interval = null;
    this.seconds = 0;
  }

  start() {
    this.seconds = 0;
    if (this.el) this.el.style.display = 'inline';
    this._tick();
    this.interval = setInterval(() => this._tick(), 1000);
  }

  _tick() {
    if (!this.el) return;
    const m = String(Math.floor(this.seconds / 60)).padStart(2, '0');
    const s = String(this.seconds % 60).padStart(2, '0');
    this.el.textContent = `${m}:${s}`;
    this.seconds++;
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
    if (this.el) this.el.style.display = 'none';
  }
}

// ── Export ──────────────────────────────────────────────────────────────
function downloadFile(filename, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportNote(note, format) {
  const safe = (note.title || 'voice-note').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const date = new Date(note.date).toLocaleString();
  if (format === 'txt') {
    downloadFile(`${safe}.txt`,
      `${note.title || 'Voice Note'}\n${date}\n\n${note.transcript || ''}\n\n--- Summary ---\n${note.summary || ''}`,
      'text/plain');
  } else if (format === 'md') {
    downloadFile(`${safe}.md`,
      `# ${note.title || 'Voice Note'}\n\n_${date}_\n\n## Transcript\n\n${note.transcript || ''}\n\n## Summary\n\n${note.summary || ''}`,
      'text/markdown');
  } else if (format === 'json') {
    downloadFile(`${safe}.json`, JSON.stringify(note, null, 2), 'application/json');
  } else if (format === 'srt') {
    let srtContent = '';
    if (note.chunks && note.chunks.length > 0) {
      const formatTime = (secs) => {
        const d = new Date(Math.max(0, secs) * 1000);
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        const ss = String(d.getUTCSeconds()).padStart(2, '0');
        const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss},${ms}`;
      };
      
      let index = 1;
      for (const chunk of note.chunks) {
        // Handle both Whisper native format and normalized interactive format
        const text = chunk.text || chunk.word || '';
        const start = chunk.timestamp ? chunk.timestamp[0] : (chunk.start || 0);
        const end = chunk.timestamp ? chunk.timestamp[1] : (chunk.end || 0);
        
        // Skip chunks with no end time (sometimes happens at the end of audio)
        if (end === null || end === undefined) continue;

        srtContent += `${index}\n`;
        srtContent += `${formatTime(start)} --> ${formatTime(end)}\n`;
        srtContent += `${text.trim()}\n\n`;
        index++;
      }
    } else {
      srtContent = "1\n00:00:00,000 --> 00:00:05,000\nNo timing data available for this transcript.\n\n";
    }
    downloadFile(`${safe}.srt`, srtContent, 'text/plain');
  }
}

// ── IndexedDB ───────────────────────────────────────────────────────────
const DB_NAME = 'voiceNotesDB', DB_VER = 4, STORE = 'history', AUDIO_STORE = 'audioCache';

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        const audioStore = db.createObjectStore(AUDIO_STORE, { keyPath: 'noteId' });
        audioStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveNote(note) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const id = await new Promise((res, rej) => {
    const r = tx.objectStore(STORE).add(note);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return id;
}

export async function loadAllNotes() {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const all = await new Promise((res, rej) => {
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return all;
}

export async function deleteNote(id) {
  const db = await openDB();
  const tx = db.transaction([STORE, AUDIO_STORE], 'readwrite');
  await new Promise((res, rej) => {
    const r = tx.objectStore(STORE).delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  // Also clean up cached audio blob for this note
  try { tx.objectStore(AUDIO_STORE).delete(id); } catch (_) {}
  db.close();
}

export async function updateNote(id, updates) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const existing = await new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  if (!existing) { db.close(); return; }
  const updated = { ...existing, ...updates };
  await new Promise((res, rej) => {
    const r = store.put(updated);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  db.close();
}

// Batch-save multiple notes in one transaction (efficient for bulk import)
export async function saveBatchNotes(notes) {
  if (!notes || !notes.length) return [];
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const ids = await Promise.all(notes.map(note =>
    new Promise((res, rej) => {
      const r = store.add(note);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    })
  ));
  db.close();
  return ids;
}

export async function clearAllNotes() {
  const db = await openDB();
  const tx = db.transaction([STORE, AUDIO_STORE], 'readwrite');
  await new Promise((res, rej) => {
    const r = tx.objectStore(STORE).clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  try { tx.objectStore(AUDIO_STORE).clear(); } catch (_) {}
  db.close();
}

// ── Audio Blob Cache (with TTL) ─────────────────────────────────────────
// Default TTL: 24 hours. Audio blobs are stored temporarily for interactive
// playback and auto-deleted after expiry to save storage.

const AUDIO_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function saveAudioBlob(noteId, blob, sourceName = '', ttlMs = AUDIO_TTL_MS) {
  const db = await openDB();
  const tx = db.transaction(AUDIO_STORE, 'readwrite');
  await new Promise((res, rej) => {
    const r = tx.objectStore(AUDIO_STORE).put({
      noteId,
      blob,
      sourceName,
      savedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  db.close();
}

export async function getAudioBlob(noteId) {
  const db = await openDB();
  const tx = db.transaction(AUDIO_STORE, 'readonly');
  const entry = await new Promise((res, rej) => {
    const r = tx.objectStore(AUDIO_STORE).get(noteId);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  if (!entry) return null;
  // Check if expired
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    deleteAudioBlob(noteId).catch(() => {});
    return null;
  }
  return entry;
}

export async function deleteAudioBlob(noteId) {
  const db = await openDB();
  const tx = db.transaction(AUDIO_STORE, 'readwrite');
  await new Promise((res, rej) => {
    const r = tx.objectStore(AUDIO_STORE).delete(noteId);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  db.close();
}

export async function cleanExpiredAudioBlobs() {
  const db = await openDB();
  const tx = db.transaction(AUDIO_STORE, 'readwrite');
  const store = tx.objectStore(AUDIO_STORE);
  const now = Date.now();
  const all = await new Promise((res, rej) => {
    const r = store.getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  let cleaned = 0;
  for (const entry of all) {
    if (entry.expiresAt && entry.expiresAt < now) {
      store.delete(entry.noteId);
      cleaned++;
    }
  }
  db.close();
  return cleaned;
}
