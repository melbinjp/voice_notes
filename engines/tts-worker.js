// engines/tts-worker.js
// Offline Text-to-Speech via Kokoro-82M (q8 quantised, ~82 MB)
// Model: onnx-community/Kokoro-82M-v1.0-ONNX
// Uses @huggingface/transformers v3 (successor to @xenova/transformers)

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/dist/transformers.min.js';

env.allowLocalModels  = false;
env.useBrowserCache   = true;
env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);

// ── Available voices ──────────────────────────────────────────────────────
const VOICES = [
    { id: 'af_heart',   name: '❤️  Heart (US Female)',    lang: 'en-US' },
    { id: 'af_bella',   name: '🌸 Bella (US Female)',    lang: 'en-US' },
    { id: 'af_sarah',   name: '☀️  Sarah (US Female)',   lang: 'en-US' },
    { id: 'af_nicole',  name: '🎙️ Nicole (US Female)',   lang: 'en-US' },
    { id: 'am_adam',    name: '🎤 Adam (US Male)',        lang: 'en-US' },
    { id: 'am_michael', name: '🎧 Michael (US Male)',    lang: 'en-US' },
    { id: 'bf_emma',    name: '🫖 Emma (UK Female)',     lang: 'en-GB' },
    { id: 'bf_isabella',name: '🌹 Isabella (UK Female)', lang: 'en-GB' },
    { id: 'bm_george',  name: '🎩 George (UK Male)',     lang: 'en-GB' },
    { id: 'bm_lewis',   name: '📻 Lewis (UK Male)',      lang: 'en-GB' },
];

// ── Pipeline singleton ────────────────────────────────────────────────────
class KokoroPipeline {
    static instance = null;

    static async getInstance(onProgress) {
        if (!this.instance) {
            const opts = {
                dtype: 'q8',
                device: navigator.gpu ? 'webgpu' : 'wasm',
                progress_callback: onProgress,
            };
            this.instance = pipeline('text-to-speech', 'onnx-community/Kokoro-82M-v1.0-ONNX', opts)
                .catch(() => {
                    // WebGPU failed → retry with WASM
                    this.instance = null;
                    return pipeline('text-to-speech', 'onnx-community/Kokoro-82M-v1.0-ONNX', {
                        dtype: 'q8',
                        progress_callback: onProgress,
                    });
                });
        }
        return this.instance;
    }
}

// ── Split long text into sentence chunks (Kokoro cap ~500 chars) ───────────
function splitSentences(text, maxLen = 400) {
    const raw = text.match(/[^.!?]+[.!?]*/g) || [text];
    const chunks = [];
    let current = '';
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

// ── Message handler ───────────────────────────────────────────────────────
self.onmessage = async (e) => {
    const { action, id } = e.data;

    if (action === 'list_voices') {
        self.postMessage({ status: 'voices', voices: VOICES, id });
        return;
    }

    if (action === 'preload' || action === 'generate') {
        try {
            self.postMessage({ status: 'loading', id });

            const tts = await KokoroPipeline.getInstance((data) => {
                if (data.status === 'progress') {
                    self.postMessage({
                        status: 'progress',
                        data: {
                            file: data.file || data.name || 'kokoro-model',
                            progress: typeof data.progress === 'number' ? Math.round(data.progress) : null,
                            loaded: data.loaded || 0,
                            total:  data.total  || 0,
                        },
                        id,
                    });
                } else if (data.status === 'ready') {
                    self.postMessage({ status: 'progress', data: { status: 'ready' }, id });
                }
            });

            self.postMessage({ status: 'ready', id });

            if (action === 'generate') {
                const { text, voice = 'af_heart', speed = 1.0 } = e.data;
                const sentences = splitSentences(text.trim());
                const allAudio  = [];
                let   sampleRate = 24000;

                self.postMessage({ status: 'generating', total: sentences.length, id });

                for (let i = 0; i < sentences.length; i++) {
                    const chunk = sentences[i];
                    if (!chunk) continue;
                    const out = await tts(chunk, { voice, speed });
                    sampleRate = out.sampling_rate || 24000;
                    allAudio.push(out.audio); // Float32Array per chunk
                    self.postMessage({ status: 'chunk', current: i + 1, total: sentences.length, id });
                }

                // Concatenate all Float32Arrays
                const totalLen  = allAudio.reduce((s, a) => s + a.length, 0);
                const combined  = new Float32Array(totalLen);
                let   offset    = 0;
                for (const a of allAudio) { combined.set(a, offset); offset += a.length; }

                self.postMessage(
                    { status: 'success', audio: combined, sampleRate, id },
                    [combined.buffer]  // transfer ownership — zero-copy
                );
            }
        } catch (err) {
            KokoroPipeline.instance = null; // reset on error so next attempt retries
            self.postMessage({ status: 'error', error: err.message, id });
        }
    }
};
