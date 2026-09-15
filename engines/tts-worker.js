// Kokoro-82M on-device TTS. WebGPU fp32 when available, WASM q8 otherwise.
// WebGPU must run fp32: at fp16 or q8 the GPU kernels return noise instead of speech, which is
// the unintelligible audio that shipped on 2026-09-14.
// No MMS fallback — that voice is robotic. The page uses system speech if this fails.
import { env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);

const VOICES = [
  { id: "af_heart", name: "Heart (US Female)", lang: "en-US" },
  { id: "af_bella", name: "Bella (US Female)", lang: "en-US" },
  { id: "af_nicole", name: "Nicole (US Female)", lang: "en-US" },
  { id: "af_sarah", name: "Sarah (US Female)", lang: "en-US" },
  { id: "am_fenrir", name: "Fenrir (US Male)", lang: "en-US" },
  { id: "am_michael", name: "Michael (US Male)", lang: "en-US" },
  { id: "am_puck", name: "Puck (US Male)", lang: "en-US" },
  { id: "bf_emma", name: "Emma (UK Female)", lang: "en-GB" },
  { id: "bm_george", name: "George (UK Male)", lang: "en-GB" },
  { id: "bm_fable", name: "Fable (UK Male)", lang: "en-GB" },
];

const VOICE_ALIAS = {
  am_adam: "am_fenrir",
  bm_lewis: "bm_fable",
  bf_isabella: "bf_emma",
  af_isabella: "bf_emma",
};

class NeuralTts {
  static kokoro = null;
  static device = "wasm";
  static dtype = "q8";

  static async pickRuntime() {
    try {
      if (typeof navigator !== "undefined" && navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) return { device: "webgpu", dtype: "fp32" };
      }
    } catch {
      /* wasm */
    }
    return { device: "wasm", dtype: "q8" };
  }

  static async getInstance(onProgress) {
    if (this.kokoro) return "kokoro";
    const runtime = await this.pickRuntime();
    this.device = runtime.device;
    this.dtype = runtime.dtype;
    const mod = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm");
    const KokoroTTS = mod.KokoroTTS || mod.default?.KokoroTTS || mod.default;
    const load = (device, dtype) =>
      KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype,
        device,
        progress_callback: onProgress,
      });
    try {
      this.kokoro = await load(runtime.device, runtime.dtype);
    } catch (err) {
      // No quantized WebGPU retry: it loads, then speaks noise. WASM q8 is the fallback.
      if (runtime.device !== "wasm") {
        this.device = "wasm";
        this.dtype = "q8";
        this.kokoro = await load("wasm", "q8");
      } else {
        throw err;
      }
    }
    return "kokoro";
  }
}

function resolveVoice(id) {
  const mapped = VOICE_ALIAS[id] || id;
  return VOICES.some((v) => v.id === mapped) ? mapped : "af_heart";
}

function prep(text) {
  let s = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[—–]/g, ", ")
    .replace(/\.{3,}/g, ".")
    .replace(/\s+,/g, ",")
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .trim();
  if (s && !/[.!?…"')\]]$/.test(s)) s += ".";
  return s;
}

function splitForProsody(text, maxLen = 420) {
  const clean = prep(text);
  if (clean.length <= maxLen) return clean ? [clean] : [];
  const raw = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const chunks = [];
  let current = "";
  for (const s of raw) {
    const piece = s.trim();
    if (!piece) continue;
    if ((current + " " + piece).trim().length > maxLen && current) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function silence(n) {
  return new Float32Array(Math.max(0, n));
}

function peakNormalize(audio, target = 0.86) {
  if (!audio?.length) return audio;
  let peak = 0;
  for (let i = 0; i < audio.length; i++) peak = Math.max(peak, Math.abs(audio[i]));
  if (peak < 0.05 || Math.abs(peak - target) < 0.06) return audio;
  const g = target / peak;
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) out[i] = audio[i] * g;
  return out;
}

function trimAndFade(audio, sampleRate) {
  if (!audio?.length) return audio;
  const thresh = 0.006;
  let a = 0;
  let b = audio.length - 1;
  while (a < b && Math.abs(audio[a]) < thresh) a++;
  while (b > a && Math.abs(audio[b]) < thresh) b--;
  const pad = Math.floor(sampleRate * 0.028);
  a = Math.max(0, a - pad);
  b = Math.min(audio.length - 1, b + pad);
  const slice = audio.subarray(a, b + 1);
  const fade = Math.min(Math.floor(sampleRate * 0.01), Math.floor(slice.length / 8));
  const out = new Float32Array(slice.length);
  out.set(slice);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return peakNormalize(out);
}

self.onmessage = async (e) => {
  const { action, id } = e.data;

  if (action === "list_voices") {
    self.postMessage({ status: "voices", voices: VOICES, id });
    return;
  }

  if (action === "preload" || action === "generate") {
    try {
      self.postMessage({ status: "loading", id });
      await NeuralTts.getInstance((data) => {
        if (data && data.status === "progress") {
          self.postMessage({
            status: "progress",
            data: {
              file: data.file || data.name || "kokoro",
              progress: typeof data.progress === "number" ? Math.round(data.progress) : null,
              loaded: data.loaded || 0,
              total: data.total || 0,
            },
            id,
          });
        }
      });
      self.postMessage({
        status: "ready",
        id,
        device: NeuralTts.device,
        dtype: NeuralTts.dtype,
      });

      if (action === "preload") {
        self.postMessage({
          status: "preload_done",
          id,
          mode: "kokoro",
          device: NeuralTts.device,
          dtype: NeuralTts.dtype,
        });
        return;
      }

      const { text, voice = "af_heart", speed = 0.95 } = e.data;
      const chunks = splitForProsody(String(text || ""));
      if (!chunks.length) throw new Error("Nothing to speak");
      const all = [];
      let sampleRate = 24000;
      self.postMessage({ status: "generating", total: chunks.length, id });
      const voiceId = resolveVoice(voice);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const out = await NeuralTts.kokoro.generate(chunk, {
          voice: voiceId,
          speed: Math.min(1.2, Math.max(0.72, Number(speed) || 0.95)),
        });
        sampleRate = out.sampling_rate || out.sample_rate || 24000;
        const audio = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
        all.push(trimAndFade(audio, sampleRate));
        if (i < chunks.length - 1) all.push(silence(Math.round(sampleRate * 0.16)));
        self.postMessage({ status: "chunk", current: i + 1, total: chunks.length, id });
      }

      const combined = trimAndFade(concat(all), sampleRate);
      self.postMessage({ status: "success", audio: combined, sampleRate, id }, [combined.buffer]);
    } catch (err) {
      NeuralTts.kokoro = null;
      self.postMessage({ status: "error", error: err.message || String(err), id });
    }
  }
};
