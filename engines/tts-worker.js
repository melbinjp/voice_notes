// Multi-voice neural TTS. Prefers Kokoro (10 studio voices),
// falls back to Xenova/mms-tts-eng if Kokoro cannot load.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);

const VOICES = [
  { id: "af_heart", name: "Heart (US Female)", lang: "en-US" },
  { id: "af_bella", name: "Bella (US Female)", lang: "en-US" },
  { id: "af_sarah", name: "Sarah (US Female)", lang: "en-US" },
  { id: "af_nicole", name: "Nicole (US Female)", lang: "en-US" },
  { id: "am_adam", name: "Adam (US Male)", lang: "en-US" },
  { id: "am_michael", name: "Michael (US Male)", lang: "en-US" },
  { id: "bf_emma", name: "Emma (UK Female)", lang: "en-GB" },
  { id: "bf_isabella", name: "Isabella (UK Female)", lang: "en-GB" },
  { id: "bm_george", name: "George (UK Male)", lang: "en-GB" },
  { id: "bm_lewis", name: "Lewis (UK Male)", lang: "en-GB" },
];

class NeuralTts {
  static kokoro = null;
  static mms = null;
  static mode = "none";

  static async getInstance(onProgress) {
    if (this.kokoro || this.mms) return this.mode;

    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm");
      const KokoroTTS = mod.KokoroTTS || mod.default?.KokoroTTS || mod.default;
      this.kokoro = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: "wasm",
        progress_callback: onProgress,
      });
      this.mode = "kokoro";
      return this.mode;
    } catch (err) {
      console.warn("[TTS] Kokoro unavailable, using MMS English", err);
    }

    this.mms = await pipeline("text-to-speech", "Xenova/mms-tts-eng", {
      quantized: true,
      progress_callback: onProgress,
    });
    this.mode = "mms";
    return this.mode;
  }
}

function splitSentences(text, maxLen = 400) {
  const raw = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = [];
  let current = "";
  for (const s of raw) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
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

function pitchShift(audio, steps) {
  if (!steps) return audio;
  const ratio = Math.pow(2, steps / 12);
  const outLen = Math.max(1, Math.floor(audio.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(audio.length - 1, i0 + 1);
    const t = x - i0;
    out[i] = (audio[i0] || 0) * (1 - t) + (audio[i1] || 0) * t;
  }
  return out;
}

const MMS_SHIFT = {
  af_heart: 0,
  af_bella: 0.4,
  af_sarah: -0.3,
  af_nicole: 0.8,
  am_adam: -3.5,
  am_michael: -4.2,
  bf_emma: 0.2,
  bf_isabella: 0.6,
  bm_george: -3.2,
  bm_lewis: -3.8,
};

self.onmessage = async (e) => {
  const { action, id } = e.data;

  if (action === "list_voices") {
    self.postMessage({ status: "voices", voices: VOICES, id });
    return;
  }

  if (action === "preload" || action === "generate") {
    try {
      self.postMessage({ status: "loading", id });
      const mode = await NeuralTts.getInstance((data) => {
        if (data && data.status === "progress") {
          self.postMessage({
            status: "progress",
            data: {
              file: data.file || data.name || "voice-model",
              progress: typeof data.progress === "number" ? Math.round(data.progress) : null,
              loaded: data.loaded || 0,
              total: data.total || 0,
            },
            id,
          });
        }
      });
      self.postMessage({ status: "ready", id });

      if (action === "preload") {
        self.postMessage({ status: "preload_done", id, mode });
        return;
      }

      const { text, voice = "af_heart", speed = 1.0 } = e.data;
      const sentences = splitSentences(String(text || "").trim());
      const all = [];
      let sampleRate = 24000;
      self.postMessage({ status: "generating", total: sentences.length, id });

      for (let i = 0; i < sentences.length; i++) {
        const chunk = sentences[i];
        if (!chunk) continue;
        if (mode === "kokoro" && NeuralTts.kokoro) {
          const out = await NeuralTts.kokoro.generate(chunk, { voice, speed });
          sampleRate = out.sampling_rate || out.sample_rate || 24000;
          all.push(out.audio);
        } else {
          const out = await NeuralTts.mms(chunk);
          sampleRate = out.sampling_rate || 16000;
          all.push(pitchShift(out.audio, MMS_SHIFT[voice] || 0));
        }
        self.postMessage({ status: "chunk", current: i + 1, total: sentences.length, id });
      }

      const combined = concat(all);
      self.postMessage({ status: "success", audio: combined, sampleRate, id }, [combined.buffer]);
    } catch (err) {
      NeuralTts.kokoro = null;
      NeuralTts.mms = null;
      NeuralTts.mode = "none";
      self.postMessage({ status: "error", error: err.message || String(err), id });
    }
  }
};
