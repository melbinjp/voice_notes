export function resolveTheme(stored) {
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function getStoredTheme() {
  return localStorage.getItem("vn:theme") || localStorage.getItem("vn-theme") || "system";
}
export function applyTheme(theme) {
  localStorage.setItem("vn:theme", theme);
  document.documentElement.dataset.theme = resolveTheme(theme);
  const sel = document.getElementById("themeSelect");
  if (sel) sel.value = theme;
}
export function toggleTheme() {
  const resolved = document.documentElement.dataset.theme || resolveTheme("system");
  applyTheme(resolved === "dark" ? "light" : "dark");
}
export function applyFontScale(v) {
  localStorage.setItem("vn:fontScale", String(v));
  document.documentElement.style.setProperty("--vn-font-scale", String(Number(v) / 100));
  const label = document.getElementById("fontSizeLabel");
  if (label) label.textContent = v + "%";
}

export function showToast(msg) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

export function uid(prefix = "n") {
  return `${prefix}_${crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8)}`;
}
export function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}
export function titleFromTranscript(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "Untitled note";
  const words = clean.split(" ").slice(0, 8).join(" ");
  const clipped = words.length > 56 ? words.slice(0, 53).trim() + "…" : words;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}
export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
export function dateGroup(ts) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const that = new Date(ts);
  const day = Math.round((start - new Date(that.getFullYear(), that.getMonth(), that.getDate()).getTime()) / 86400000);
  if (day === 0) return "Today";
  if (day === 1) return "Yesterday";
  if (day < 7) return "This week";
  return "Earlier";
}

const STOP = new Set("a,an,the,and,or,but,if,in,on,at,to,for,of,as,is,it,be,by,this,that,with,from,are,was,were,been,have,has,had,do,does,did,will,would,can,could,should,not,no,so,than,then,there,here,when,what,which,who,into,after,before,about,just,also,very,more,most,some,any,your,you,i,we,they,he,she,them,his,her,our,their,my,me".split(","));
function sentences(text) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
}
function tokenize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}
export function summarizeLocal(text) {
  const raw = (text || "").trim();
  if (!raw) return "";
  const sents = sentences(raw);
  if (sents.length <= 2) return raw;
  const freq = new Map();
  for (const s of sents) for (const w of tokenize(s)) freq.set(w, (freq.get(w) || 0) + 1);
  const max = Math.max(...freq.values(), 1);
  const scored = sents.map((s, i) => {
    const words = tokenize(s);
    const tf = words.reduce((a, w) => a + (freq.get(w) || 0) / max, 0);
    const pos = 1 - i / Math.max(sents.length - 1, 1);
    return { s, i, score: tf / Math.max(words.length, 1) + pos * 0.35 };
  });
  scored.sort((a, b) => b.score - a.score);
  const take = Math.min(4, Math.max(2, Math.ceil(sents.length * 0.28)));
  const picked = scored.slice(0, take).sort((a, b) => a.i - b.i).map((x) => x.s);
  const actions = raw.split(/[\n.]+/).map((l) => l.trim()).filter((l) => /\b(todo|remember to|need to|should|must|follow up|schedule)\b/i.test(l)).slice(0, 6);
  let out = picked.join(" ");
  if (actions.length) out += "\n\nActions\n" + actions.map((a) => "• " + a).join("\n");
  return out;
}
export function applyDictationPunctuation(chunk) {
  let t = ` ${chunk} `;
  [[/\speriod\s/gi, ". "], [/\scomma\s/gi, ", "], [/\squestion mark\s/gi, "? "], [/\snew paragraph\s/gi, "\n\n"]].forEach(([re, to]) => { t = t.replace(re, to); });
  return t.replace(/\s{3,}/g, " ").trim();
}

export function downloadFile(filename, content, mime) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
export function exportNote(note, format) {
  const safe = (note.title || "voice-note").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const date = new Date(note.createdAt || note.date).toLocaleString();
  if (format === "txt") {
    downloadFile(`${safe}.txt`, `${note.title}\n${date}\n\n${note.transcript || ""}\n\n${note.summary || ""}`, "text/plain");
  } else if (format === "md") {
    downloadFile(`${safe}.md`, `# ${note.title}\n\n_${date}_\n\n## Transcript\n\n${note.transcript || ""}\n\n## Summary\n\n${note.summary || ""}`, "text/markdown");
  } else {
    downloadFile(`${safe}.json`, JSON.stringify(note, null, 2), "application/json");
  }
}

const DB = "voice-notes-studio";
const VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function txDone(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function loadAllNotes() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction("notes").objectStore("notes").getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
export async function loadFolders() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction("folders").objectStore("folders").getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
export async function saveNote(note) {
  const db = await openDB();
  const tx = db.transaction("notes", "readwrite");
  tx.objectStore("notes").put(note);
  await txDone(tx);
}
export async function saveFolder(folder) {
  const db = await openDB();
  const tx = db.transaction("folders", "readwrite");
  tx.objectStore("folders").put(folder);
  await txDone(tx);
}
export async function deleteNote(id) {
  const db = await openDB();
  const tx = db.transaction(["notes", "audio"], "readwrite");
  tx.objectStore("notes").delete(id);
  tx.objectStore("audio").delete(id);
  await txDone(tx);
}
export async function putAudio(id, blob, mime) {
  const db = await openDB();
  const tx = db.transaction("audio", "readwrite");
  tx.objectStore("audio").put({ id, blob, mime });
  await txDone(tx);
}
export async function getAudio(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction("audio").objectStore("audio").get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function getFlag(key) {
  const db = await openDB();
  return new Promise((res) => {
    const r = db.transaction("meta").objectStore("meta").get(key);
    r.onsuccess = () => res(Boolean(r.result?.value));
    r.onerror = () => res(false);
  });
}
export async function setFlag(key, value) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  await txDone(tx);
}
export async function importLegacyNotes() {
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === "voiceNotesDB")) return [];
    }
  } catch { return []; }
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve([]), 1500);
    const req = indexedDB.open("voiceNotesDB");
    req.onerror = () => { clearTimeout(t); resolve([]); };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("history")) { db.close(); clearTimeout(t); resolve([]); return; }
      const r = db.transaction("history").objectStore("history").getAll();
      r.onsuccess = () => {
        clearTimeout(t);
        const notes = (r.result || []).map((row) => ({
          id: "legacy_" + (row.id ?? Date.now()),
          title: row.title || "Untitled note",
          transcript: row.transcript || "",
          summary: row.summary || "",
          tags: [], folderId: null, pinned: false, archived: false,
          createdAt: row.date ? Date.parse(row.date) || Date.now() : Date.now(),
          updatedAt: Date.now(), durationMs: 0, engine: row.engine || "manual",
          language: "en-US", timedWords: [], audioId: null, audioMime: null,
        }));
        db.close();
        resolve(notes);
      };
      r.onerror = () => { db.close(); clearTimeout(t); resolve([]); };
    };
  });
}

export class WaveformVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
  }
  start(stream) {
    if (!this.canvas) return;
    this.ac = new AudioContext();
    const src = this.ac.createMediaStreamSource(stream);
    this.analyser = this.ac.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.active = true;
    this.canvas.classList.remove("hidden");
    const draw = () => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(draw);
      const buf = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(buf);
      const ctx = this.canvas.getContext("2d");
      const w = this.canvas.width, h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ece7dc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const slice = w / buf.length;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const y = (buf[i] / 128) * h / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += slice;
      }
      ctx.stroke();
    };
    draw();
  }
  stop() {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.ac?.close();
    if (this.canvas) {
      this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.classList.add("hidden");
    }
  }
}

export const LANGUAGES = [
  { code: "en-US", name: "English (US)" }, { code: "en-GB", name: "English (UK)" },
  { code: "es-ES", name: "Spanish" }, { code: "fr-FR", name: "French" },
  { code: "de-DE", name: "German" }, { code: "it-IT", name: "Italian" },
  { code: "pt-BR", name: "Portuguese" }, { code: "hi-IN", name: "Hindi" },
  { code: "ja-JP", name: "Japanese" }, { code: "zh-CN", name: "Chinese" },
];

export function seedLibrary() {
  const now = Date.now();
  const folders = [
    { id: "folder_guides", name: "Guides", createdAt: now },
    { id: "folder_meetings", name: "Meetings", createdAt: now },
    { id: "folder_ideas", name: "Ideas", createdAt: now },
  ];
  const notes = [
    {
      id: uid(), title: "Welcome to Voice Notes",
      transcript: "This is your private studio. Record with the space bar, pause mid-thought, and everything stays on this device. Transcripts, audio, and summaries never leave the browser.",
      summary: "Voice Notes is a fully private, on-device studio. Record with Space and keep audio locally.",
      tags: ["guide", "start-here"], folderId: "folder_guides", pinned: true, archived: false,
      createdAt: now - 3600000, updatedAt: now - 3600000, durationMs: 0, engine: "manual",
      language: "en-US", timedWords: [], audioId: null, audioMime: null,
    },
  ];
  return { notes, folders };
}
