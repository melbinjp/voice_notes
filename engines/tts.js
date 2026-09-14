export const STUDIO_VOICES = [
  { id: "af_heart", name: "Heart", gender: "female", lang: "en-US", hint: "Warm, close" },
  { id: "af_bella", name: "Bella", gender: "female", lang: "en-US", hint: "Clear" },
  { id: "af_sarah", name: "Sarah", gender: "female", lang: "en-US", hint: "Measured" },
  { id: "af_nicole", name: "Nicole", gender: "female", lang: "en-US", hint: "Soft" },
  { id: "am_adam", name: "Adam", gender: "male", lang: "en-US", hint: "Even" },
  { id: "am_michael", name: "Michael", gender: "male", lang: "en-US", hint: "Low" },
  { id: "bf_emma", name: "Emma", gender: "female", lang: "en-GB", hint: "Bright" },
  { id: "bf_isabella", name: "Isabella", gender: "female", lang: "en-GB", hint: "Soft" },
  { id: "bm_george", name: "George", gender: "male", lang: "en-GB", hint: "Round" },
  { id: "bm_lewis", name: "Lewis", gender: "male", lang: "en-GB", hint: "Dry" },
];

const FEMALE = /female|woman|samantha|victoria|karen|moira|zira|susan|fiona|tessa|veena|heera|serena|kate/i;
const MALE = /male|man|daniel|david|alex(?!a)|fred|tom|rishi|google uk english male|microsoft david|microsoft mark|microsoft george/i;

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function listVoices() {
  return ttsSupported() ? window.speechSynthesis.getVoices() : [];
}

export async function resolveSystemVoice(voiceId) {
  const voices = listVoices();
  if (!voices.length) {
    await new Promise((resolve) => {
      if (!ttsSupported()) return resolve();
      window.speechSynthesis.addEventListener("voiceschanged", resolve, { once: true });
      setTimeout(resolve, 700);
    });
  }
  const have = listVoices();
  const spec = STUDIO_VOICES.find((v) => v.id === voiceId);
  const lang = spec?.lang || "en-US";
  const gender = spec?.gender || "female";
  const langPool = have.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const pool = langPool.length ? langPool : have;
  const gendered = pool.filter((v) => (gender === "female" ? FEMALE.test(v.name) : MALE.test(v.name)));
  const named = pool.find((v) => spec && v.name.toLowerCase().includes(spec.name.toLowerCase()));
  return named || gendered[0] || pool.find((v) => v.default) || pool[0] || null;
}

export function speakText(text, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!ttsSupported()) {
      reject(new Error("Speech synthesis is not available in this browser."));
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 1;
    u.lang = opts.lang || "en-US";
    const go = () => window.speechSynthesis.speak(u);
    u.onend = () => resolve();
    u.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") resolve();
      else reject(new Error(e.error || "TTS error"));
    };
    if (opts.voiceId) {
      resolveSystemVoice(opts.voiceId).then((v) => {
        if (v) {
          u.voice = v;
          u.lang = v.lang;
        }
        go();
      });
      return;
    }
    go();
  });
}

export async function speakTurns(turns, opts = {}) {
  if (!ttsSupported()) throw new Error("Speech synthesis is not available in this browser.");
  window.speechSynthesis.cancel();
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn?.text.trim()) continue;
    opts.onTurn?.(i);
    await speakText(turn.text, { rate: opts.rate, voiceId: turn.voiceId });
  }
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker("engines/tts-worker.js", { type: "module" });
    worker.onmessage = (e) => {
      const d = e.data;
      const cb = pending.get(d.id);
      if (!cb) return;
      if (d.status === "progress") {
        cb({ status: "progress", file: d.data?.file || d.file, progress: d.data?.progress ?? d.progress ?? 0 });
        return;
      }
      if (d.status === "success") {
        cb({ status: "done", audio: d.audio, sampleRate: d.sampleRate });
        pending.delete(d.id);
        return;
      }
      if (d.status === "preload_done") {
        cb({ status: "ready" });
        pending.delete(d.id);
        return;
      }
      if (d.status === "error") {
        cb({ status: "error", error: d.error });
        pending.delete(d.id);
        return;
      }
      cb(d);
    };
  }
  return worker;
}

export function preloadNeuralTts(onProgress) {
  return new Promise((resolve, reject) => {
    const id = `preload-${++seq}`;
    pending.set(id, (p) => {
      onProgress?.(p);
      if (p.status === "ready") resolve();
      if (p.status === "error") reject(new Error(p.error));
    });
    getWorker().postMessage({ action: "preload", id });
  });
}

function generateOne(text, voice, speed, onProgress) {
  return new Promise((resolve, reject) => {
    const id = `gen-${++seq}`;
    pending.set(id, (p) => {
      onProgress?.(p);
      if (p.status === "done" && p.audio) resolve({ audio: p.audio, sampleRate: p.sampleRate || 24000 });
      if (p.status === "error") reject(new Error(p.error || "TTS failed"));
    });
    getWorker().postMessage({ action: "generate", id, text, voice, speed });
  });
}

function silence(seconds, sampleRate) {
  return new Float32Array(Math.max(0, Math.round(seconds * sampleRate)));
}

function concatFloat32(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function generateNeuralSpeech(turns, opts = {}) {
  const chunks = [];
  let sampleRate = 24000;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn?.text.trim()) continue;
    opts.onProgress?.({ status: "generating", current: i + 1, total: turns.length });
    const part = await generateOne(turn.text, turn.voiceId, opts.speed ?? 1, opts.onProgress);
    sampleRate = part.sampleRate;
    chunks.push(part.audio);
    if (i < turns.length - 1) chunks.push(silence(0.28, sampleRate));
  }
  if (!chunks.length) throw new Error("Nothing to speak");
  return encodeWav(concatFloat32(chunks), sampleRate);
}
