// engines/tts-worker.js
// Offline Text-to-Speech via Kokoro-82M (q8 quantised, ~82 MB)
// Uses kokoro-js (built on @huggingface/transformers)

import { KokoroTTS } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';

// ── Voice registry ───────────────────────────────────────────────────────
const VOICES = [
    { id: 'af_heart',    name: '❤️  Heart (US Female)',    lang: 'en-US', shortcut: 'heart' },
    { id: 'af_bella',    name: '🌸 Bella (US Female)',    lang: 'en-US', shortcut: 'bella' },
    { id: 'af_sarah',    name: '☀️  Sarah (US Female)',   lang: 'en-US', shortcut: 'sarah' },
    { id: 'af_nicole',   name: '🎙️ Nicole (US Female)',   lang: 'en-US', shortcut: 'nicole' },
    { id: 'am_adam',     name: '🎤 Adam (US Male)',        lang: 'en-US', shortcut: 'adam' },
    { id: 'am_michael',  name: '🎧 Michael (US Male)',    lang: 'en-US', shortcut: 'michael' },
    { id: 'bf_emma',     name: '🫖 Emma (UK Female)',     lang: 'en-GB', shortcut: 'emma' },
    { id: 'bf_isabella', name: '🌹 Isabella (UK Female)', lang: 'en-GB', shortcut: 'isabella' },
    { id: 'bm_george',   name: '🎩 George (UK Male)',     lang: 'en-GB', shortcut: 'george' },
    { id: 'bm_lewis',    name: '📻 Lewis (UK Male)',      lang: 'en-GB', shortcut: 'lewis' },
];

// Build lookup: shortcut → voice id  (case-insensitive)
const VOICE_SHORTCUTS = {};
for (const v of VOICES) {
    VOICE_SHORTCUTS[v.shortcut.toLowerCase()] = v.id;
    VOICE_SHORTCUTS[v.id.toLowerCase()] = v.id;
    // Also allow the display name (without emoji) e.g. "Heart", "Adam"
    const plainName = v.name.replace(/[^\w\s()]/g, '').trim().split(/\s+/)[0].toLowerCase();
    VOICE_SHORTCUTS[plainName] = v.id;
}

// ── Pipeline singleton ────────────────────────────────────────────────────
class KokoroPipeline {
    static instance = null;

    static async getInstance(onProgress) {
        if (!this.instance) {
            this.instance = KokoroTTS.from_pretrained(
                'onnx-community/Kokoro-82M-v1.0-ONNX',
                {
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback: onProgress,
                }
            );
        }
        return this.instance;
    }
}

// ── Multi-speaker text parsing ─────────────────────────────────────────
// Supports [VoiceName]: text syntax per line/sentence.
// Also supports voice blending: [Heart+Adam]: text
// Unmarked text uses defaultVoice.
function parseMultiSpeaker(text, defaultVoice, customAliases = {}) {
    const lines = text.split('\n');
    const segments = [];
    const tagRe = /^\[([^\]]+)\]\s*:\s*/;

    // Merge custom aliases (case-insensitive lookup)
    const aliasLookup = { ...VOICE_SHORTCUTS };
    for (const [alias, target] of Object.entries(customAliases)) {
        const key = alias.toLowerCase();
        // Resolve target: could be a shortcut name, voice ID, or blend
        if (target.includes('+')) {
            aliasLookup[key] = target.split('+').map(p => {
                const pk = p.trim().toLowerCase();
                return VOICE_SHORTCUTS[pk] || pk;
            }).join('+');
        } else {
            const tk = target.toLowerCase();
            aliasLookup[key] = VOICE_SHORTCUTS[tk] || target;
        }
    }

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(tagRe);
        if (match) {
            const voiceTag = match[1].trim();
            const content = trimmed.slice(match[0].length).trim();
            if (!content) continue;

            let resolvedVoice;
            if (voiceTag.includes('+')) {
                const parts = voiceTag.split('+').map(p => {
                    const key = p.trim().toLowerCase();
                    return aliasLookup[key] || key;
                });
                resolvedVoice = parts.join('+');
            } else {
                const key = voiceTag.toLowerCase();
                resolvedVoice = aliasLookup[key] || defaultVoice;
            }

            segments.push({ text: content, voice: resolvedVoice });
        } else {
            segments.push({ text: trimmed, voice: defaultVoice });
        }
    }

    return segments.length ? segments : [{ text: text.trim(), voice: defaultVoice }];
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

            // Try to refresh voice list from the loaded model
            try {
                const modelVoices = tts.list_voices();
                if (modelVoices && modelVoices.length > 0) {
                    const voices = modelVoices.map(v => {
                        const voiceId = typeof v === 'string' ? v : (v.id || v.name || v);
                        const existing = VOICES.find(dv => dv.id === voiceId);
                        return existing || { id: voiceId, name: voiceId, lang: 'en-US', shortcut: voiceId };
                    });
                    self.postMessage({ status: 'voices', voices, id });
                }
            } catch (_) { /* model may not support list_voices */ }

            self.postMessage({ status: 'ready', id });

            if (action === 'generate') {
                const { text, voice = 'af_heart', speed = 1.0, aliases = {} } = e.data;

                // Parse multi-speaker segments (with custom aliases)
                const segments = parseMultiSpeaker(text.trim(), voice, aliases);

                // Build chunk list: each segment split into sentences, preserving voice
                const chunks = [];
                for (const seg of segments) {
                    const sentences = splitSentences(seg.text);
                    for (const s of sentences) {
                        if (s.trim()) chunks.push({ text: s, voice: seg.voice });
                    }
                }

                const allAudio  = [];
                let   sampleRate = 24000;

                self.postMessage({ status: 'generating', total: chunks.length, id });

                for (let i = 0; i < chunks.length; i++) {
                    const { text: chunkText, voice: chunkVoice } = chunks[i];

                    const out = await tts.generate(chunkText, { voice: chunkVoice, speed });

                    // kokoro-js generate() returns RawAudio with .audio and .sampling_rate
                    let pcm = out.audio;
                    if (pcm && pcm.audio instanceof Float32Array) {
                        pcm = pcm.audio;
                    }
                    sampleRate = out.sampling_rate || 24000;

                    if (pcm instanceof Float32Array) {
                        allAudio.push(pcm);
                    } else {
                        throw new Error('Unexpected audio output format from Kokoro model');
                    }

                    self.postMessage({ status: 'chunk', current: i + 1, total: chunks.length, id });
                }

                // Concatenate all Float32Arrays
                const totalLen  = allAudio.reduce((s, a) => s + a.length, 0);
                const combined  = new Float32Array(totalLen);
                let   offset    = 0;
                for (const a of allAudio) { combined.set(a, offset); offset += a.length; }

                self.postMessage(
                    { status: 'success', audio: combined, sampleRate, id },
                    [combined.buffer]
                );
            }
        } catch (err) {
            KokoroPipeline.instance = null;
            self.postMessage({ status: 'error', error: err.message, id });
        }
    }
};
