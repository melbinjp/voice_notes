import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

env.allowLocalModels = false;
env.useBrowserCache = true;

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

class KokoroPipeline {
    static instance = null;

    static async getInstance(onProgress) {
        if (!this.instance) {
            // Using a v3-compatible Kokoro model fallback since `onnx-community/Kokoro-82M-v1.0-ONNX`
            // uses the `style_text_to_speech_2` task missing from older transformers versions
            // or switch to a version that's definitively supported with custom pipeline loading.
            // Currently, the Kokoro web model runs reliably using `onnx-community/Kokoro-82M-v1.0-ONNX` via
            // @huggingface/transformers >= 3.2.0 when initialized correctly, but sometimes encounters missing
            // class errors based on the exact build.
            // The `text-to-speech` task internally maps to specific model classes. If a model class like
            // `style_text_to_speech_2` throws an error, it's a version/build issue.

            // We use the known working `onnx-community/Kokoro-82M-v1.0-ONNX` via text-to-audio.
            this.instance = pipeline('text-to-audio', 'onnx-community/Kokoro-82M-v1.0-ONNX', {
                dtype: 'fp32',
                progress_callback: onProgress,
            }).catch(err => {
                console.error("Kokoro Pipeline initialization failed, trying 'text-to-speech':", err);
                return pipeline('text-to-speech', 'onnx-community/Kokoro-82M-v1.0-ONNX', {
                    dtype: 'fp32',
                    progress_callback: onProgress,
                }).catch(innerErr => {
                     this.instance = null;
                     throw innerErr;
                });
            });
        }
        return this.instance;
    }
}

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
                if (data.status === 'progress' || data.status === 'download') {
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
            KokoroPipeline.instance = null;
            self.postMessage({ status: 'error', error: err.message, id });
        }
    }
};
