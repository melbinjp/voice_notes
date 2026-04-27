// engines/tts-worker.js
// Offline Text-to-Speech via Xenova/mms-tts-eng
// Model: Xenova/mms-tts-eng

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels  = false;
env.useBrowserCache   = true;
env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);

// ── Available voices ──────────────────────────────────────────────────────
// MMS only has one voice natively. We provide this array for API compatibility with the UI.
const VOICES = [
    { id: 'default',   name: '🎤 Default Voice',    lang: 'en-US' },
];

// ── Pipeline singleton ────────────────────────────────────────────────────
class MMSPipeline {
    static instance = null;

    static async getInstance(onProgress) {
        if (!this.instance) {
            const opts = {
                quantized: true,
                progress_callback: onProgress,
            };
            this.instance = pipeline('text-to-speech', 'Xenova/mms-tts-eng', opts)
                .catch(() => {
                    this.instance = null;
                    return pipeline('text-to-speech', 'Xenova/mms-tts-eng', {
                        quantized: true,
                        progress_callback: onProgress,
                    });
                });
        }
        return this.instance;
    }
}

// ── Split long text into sentence chunks ───────────
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

            const tts = await MMSPipeline.getInstance((data) => {
                if (data.status === 'progress') {
                    self.postMessage({
                        status: 'progress',
                        data: {
                            file: data.file || data.name || 'mms-model',
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
                const { text } = e.data; // MMS doesn't support voices/speed natively
                const sentences = splitSentences(text.trim());
                const allAudio  = [];
                let   sampleRate = 16000;

                self.postMessage({ status: 'generating', total: sentences.length, id });

                for (let i = 0; i < sentences.length; i++) {
                    const chunk = sentences[i];
                    if (!chunk) continue;
                    const out = await tts(chunk);
                    sampleRate = out.sampling_rate || 16000;
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
            MMSPipeline.instance = null; // reset on error so next attempt retries
            self.postMessage({ status: 'error', error: err.message, id });
        }
    }
};
