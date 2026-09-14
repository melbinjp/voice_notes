export const STUDIO_VOICES = [
  { id: "af_heart", name: "Heart", gender: "female", lang: "en-US", hint: "Warm, closest" },
  { id: "af_bella", name: "Bella", gender: "female", lang: "en-US", hint: "Clear, bright" },
  { id: "af_nicole", name: "Nicole", gender: "female", lang: "en-US", hint: "Soft, close-mic" },
  { id: "af_sarah", name: "Sarah", gender: "female", lang: "en-US", hint: "Measured" },
  { id: "am_fenrir", name: "Fenrir", gender: "male", lang: "en-US", hint: "Low, natural" },
  { id: "am_michael", name: "Michael", gender: "male", lang: "en-US", hint: "Even baritone" },
  { id: "am_puck", name: "Puck", gender: "male", lang: "en-US", hint: "Light, quick" },
  { id: "bf_emma", name: "Emma", gender: "female", lang: "en-GB", hint: "Bright UK" },
  { id: "bm_george", name: "George", gender: "male", lang: "en-GB", hint: "Round UK" },
  { id: "bm_fable", name: "Fable", gender: "male", lang: "en-GB", hint: "Soft UK" },
];

export const CONVO_VOICE_CYCLE = ["am_fenrir", "af_heart", "am_michael", "af_bella"];
export const CONVO_NAMES = ["Alex", "Maya", "Sam", "Jordan"];

const VOICE_PACE = {
  af_heart: 0.94,
  af_bella: 0.96,
  af_nicole: 0.93,
  af_sarah: 0.95,
  am_fenrir: 0.91,
  am_michael: 0.93,
  am_puck: 0.97,
  am_adam: 0.91,
  bf_emma: 0.96,
  bm_george: 0.92,
  bm_fable: 0.94,
  bm_lewis: 0.94,
};

const BACKCHANNEL =
  /^(yeah|yep|yup|yes|no|nah|ok|okay|right|sure|mm+|uh-huh|got it|thanks|hey|hi|oh|ah|huh)\b/i;

const FEMALE =
  /female|woman|samantha|victoria|karen|moira|zira|susan|fiona|tessa|veena|heera|serena|kate|siri|google us english/i;
const MALE =
  /male|man|daniel|david|alex(?!a)|fred|tom|rishi|google uk english male|microsoft david|microsoft mark|microsoft george/i;

export function resolveStudioVoice(id) {
  const legacy = {
    am_adam: "am_fenrir",
    bm_lewis: "bm_fable",
    bf_isabella: "bf_emma",
    af_isabella: "bf_emma",
  };
  return legacy[id] || id;
}

export function naturalSpeed(voiceId, userRate = 1, turnIndex = 0) {
  const base = VOICE_PACE[resolveStudioVoice(voiceId)] ?? 0.95;
  const jitter = 1 + ((turnIndex * 7) % 5 - 2) * 0.008;
  return Math.min(1.22, Math.max(0.72, base * userRate * jitter));
}

export function conversationalGap(prev, next, speakerChanged) {
  const p = String(prev || "").trim();
  const n = String(next || "").trim();
  if (speakerChanged && BACKCHANNEL.test(n)) return 0.11;
  if (/\?["']?$/.test(p)) return speakerChanged ? 0.48 : 0.22;
  if (/!["']?$/.test(p)) return speakerChanged ? 0.32 : 0.15;
  if (speakerChanged) return 0.34;
  return 0.12;
}

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function listVoices() {
  return ttsSupported() ? window.speechSynthesis.getVoices() : [];
}

async function waitForVoices() {
  const have = listVoices();
  if (have.length) return have;
  return new Promise((resolve) => {
    const finish = () => resolve(listVoices());
    if (!ttsSupported()) return finish();
    window.speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, 700);
  });
}

export async function resolveSystemVoice(voiceId) {
  const voices = await waitForVoices();
  if (!voices.length) return null;
  const spec = STUDIO_VOICES.find((v) => v.id === voiceId);
  const lang = spec?.lang || "en-US";
  const gender = spec?.gender || "female";
  const langPool = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const pool = langPool.length ? langPool : voices;
  const gendered = pool.filter((v) => (gender === "female" ? FEMALE.test(v.name) : MALE.test(v.name)));
  const named = pool.find((v) => spec && v.name.toLowerCase().includes(spec.name.toLowerCase()));
  const premium = (gendered.length ? gendered : pool).find((v) =>
    /premium|enhanced|neural|natural|samantha|daniel|karen|moira|rishi/i.test(v.name),
  );
  return named || premium || gendered[0] || pool.find((v) => v.default) || pool[0] || null;
}

export function speakText(text, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!ttsSupported()) {
      reject(new Error("Speech synthesis is not available in this browser."));
      return;
    }
    if (opts.cancel !== false) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.min(1.15, Math.max(0.75, (opts.rate ?? 1) * 0.96));
    u.pitch = 1;
    u.lang = opts.lang || "en-US";
    u.onend = () => resolve();
    u.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") resolve();
      else reject(new Error(e.error || "TTS error"));
    };
    const go = () => window.speechSynthesis.speak(u);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function speakTurns(turns, opts = {}) {
  if (!ttsSupported()) throw new Error("Speech synthesis is not available in this browser.");
  window.speechSynthesis.cancel();
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn?.text.trim()) continue;
    opts.onTurn?.(i);
    await speakText(turn.text, { rate: opts.rate, voiceId: turn.voiceId, cancel: false });
    const next = turns[i + 1];
    if (next) {
      const gap = conversationalGap(turn.text, next.text, next.voiceId !== turn.voiceId);
      await sleep(gap * 1000);
    }
  }
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
  neuralGen += 1;
  stopNeuralPlayback();
}

let worker = null;
let seq = 0;
let neuralGen = 0;
let playCtx = null;
const playSources = [];
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
    getWorker().postMessage({ action: "generate", id, text, voice: resolveStudioVoice(voice), speed });
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
  const ticket = ++neuralGen;
  const chunks = [];
  let sampleRate = 24000;
  for (let i = 0; i < turns.length; i++) {
    if (ticket !== neuralGen) throw new Error("canceled");
    const turn = turns[i];
    if (!turn?.text.trim()) continue;
    opts.onProgress?.({ status: "generating", current: i + 1, total: turns.length });
    const part = await generateOne(turn.text, turn.voiceId, naturalSpeed(turn.voiceId, opts.speed ?? 1, i), opts.onProgress);
    if (ticket !== neuralGen) throw new Error("canceled");
    sampleRate = part.sampleRate;
    chunks.push(part.audio);
    const next = turns[i + 1];
    if (next) chunks.push(silence(conversationalGap(turn.text, next.text, next.voiceId !== turn.voiceId), sampleRate));
  }
  if (!chunks.length) throw new Error("Nothing to speak");
  return encodeWav(concatFloat32(chunks), sampleRate);
}

function stopNeuralPlayback() {
  for (const src of playSources) {
    try { src.stop(); } catch { /* already stopped */ }
  }
  playSources.length = 0;
  if (playCtx) {
    playCtx.close().catch(() => undefined);
    playCtx = null;
  }
}

export async function playNeuralTurns(turns, opts = {}) {
  const ticket = opts.ticket ?? ++neuralGen;
  const items = turns.map((t, index) => ({ ...t, index })).filter((t) => t.text.trim());
  if (!items.length) throw new Error("Nothing to speak");

  const ctx = new AudioContext();
  playCtx = ctx;
  if (ctx.state === "suspended") await ctx.resume();

  const gen = (item) =>
    generateOne(item.text, item.voiceId, naturalSpeed(item.voiceId, opts.speed ?? 1, item.index), opts.onProgress);

  let nextPart = await gen(items[0]);
  if (ticket !== neuralGen) throw new Error("canceled");
  let nextStart = ctx.currentTime + 0.03;

  for (let i = 0; i < items.length; i++) {
    if (ticket !== neuralGen) throw new Error("canceled");
    if (playCtx !== ctx) throw new Error("canceled");
    const item = items[i];
    const part = nextPart;
    const following = items[i + 1];
    const prefetch = following ? gen(following) : null;

    opts.onTurn?.(item.index);

    const buffer = ctx.createBuffer(1, part.audio.length, part.sampleRate);
    buffer.getChannelData(0).set(part.audio);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.015, nextStart);
    src.start(startAt);
    playSources.push(src);
    const dur = part.audio.length / part.sampleRate;
    const gap = following ? conversationalGap(item.text, following.text, following.voiceId !== item.voiceId) : 0;
    nextStart = startAt + dur + gap;

    if (prefetch) {
      nextPart = await prefetch;
      if (ticket !== neuralGen) throw new Error("canceled");
    }
  }

  const remaining = Math.max(0, (nextStart - ctx.currentTime) * 1000);
  if (remaining > 0) await sleep(remaining + 40);
  if (ticket === neuralGen && playCtx === ctx) stopNeuralPlayback();
}
