// engines/transcription-queue.js
// Adaptive worker pool for async, parallel Whisper transcription.
// Pool size: min(3, max(1, floor(hardwareConcurrency / 2)))

export const MAX_WORKERS = Math.min(3, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)));

class TranscriptionQueue extends EventTarget {
    constructor() {
        super();
        this.items   = [];   // all queue items (historical + active)
        this._pool   = [];   // [{worker, busy}]
        this._started = false;
        this._nextId  = 1;
        this._language = 'auto';
    }

    // ── Pool ──────────────────────────────────────────────────────────────
    _initPool() {
        if (this._started) return;
        this._started = true;
        for (let i = 0; i < MAX_WORKERS; i++) {
            this._pool.push({
                worker: new Worker('engines/whisper-worker.js', { type: 'module' }),
                busy: false,
            });
        }
    }

    setLanguage(lang) { this._language = lang || 'auto'; }

    // ── Public API ────────────────────────────────────────────────────────
    enqueue(blob, name = 'Recording', meta = {}) {
        this._initPool();
        const id = this._nextId++;
        const item = {
            id, name, blob, meta,
            status: 'queued',   // queued|decoding|loading|transcribing|done|error
            progress: 0,
            progressLabel: 'Queued',
            transcript: '',
            chunks: [],
            error: null,
            addedAt: Date.now(),
            doneAt: null,
        };
        this.items.push(item);
        this._notify();
        this._dispatch();
        return id;
    }

    remove(id) {
        const item = this.items.find(i => i.id === id);
        if (!item) return;
        // Only remove if not actively processing
        if (item.status === 'decoding' || item.status === 'loading' || item.status === 'transcribing') return;
        this.items = this.items.filter(i => i.id !== id);
        this._notify();
    }

    clearDone() {
        this.items = this.items.filter(i => i.status !== 'done' && i.status !== 'error');
        this._notify();
    }

    getItem(id) { return this.items.find(i => i.id === id); }
    getAll()    { return [...this.items]; }

    get pendingCount() {
        return this.items.filter(i => ['queued','decoding','loading','transcribing'].includes(i.status)).length;
    }

    // ── Internals ─────────────────────────────────────────────────────────
    _dispatch() {
        for (const slot of this._pool) {
            if (slot.busy) continue;
            const next = this.items.find(i => i.status === 'queued');
            if (!next) break;
            slot.busy = true;
            next.status = 'decoding';
            next.progressLabel = 'Decoding audio…';
            this._notify();
            this._runJob(slot, next);
        }
    }

    async _runJob(slot, item) {
        try {
            // 1. Decode blob → PCM Float32
            const arrayBuffer = await item.blob.arrayBuffer();
            const audioCtx   = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const decoded    = await audioCtx.decodeAudioData(arrayBuffer);
            audioCtx.close();
            const audioData  = decoded.getChannelData(0);

            item.status = 'transcribing';
            item.progressLabel = 'Waiting for Whisper…';
            this._notify();

            // 2. Send to Whisper worker
            const msgId = `q-${item.id}-${Date.now()}`;
            await new Promise((resolve, reject) => {
                const handler = (e) => {
                    if (e.data.id !== msgId) return;
                    const { status, data } = e.data;

                    if (status === 'loading') {
                        item.status = 'loading';
                        item.progressLabel = 'Loading Whisper model…';
                        item.progress = 0;
                        this._notify();
                    } else if (status === 'progress') {
                        item.status = 'loading';
                        if (data?.progress !== undefined) {
                            item.progress = data.progress;
                            item.progressLabel = `Downloading: ${data.file || 'model'} (${Math.round(data.progress)}%)`;
                        } else if (data?.status === 'ready') {
                            item.status = 'transcribing';
                            item.progressLabel = 'Transcribing…';
                            item.progress = 50;
                        }
                        this._notify();
                    } else if (status === 'transcribing') {
                        item.status = 'transcribing';
                        item.progressLabel = 'Transcribing…';
                        item.progress = 50;
                        this._notify();
                    } else if (status === 'success') {
                        slot.worker.removeEventListener('message', handler);
                        item.status   = 'done';
                        item.transcript = (e.data.text || '').trim();
                        item.chunks     = e.data.chunks || [];
                        item.progress   = 100;
                        item.progressLabel = 'Done';
                        item.doneAt    = Date.now();
                        this._notify();
                        this.dispatchEvent(new CustomEvent('itemdone', { detail: item }));
                        resolve();
                    } else if (status === 'error') {
                        slot.worker.removeEventListener('message', handler);
                        item.status = 'error';
                        item.error  = e.data.error || 'Unknown error';
                        item.progressLabel = 'Error';
                        this._notify();
                        this.dispatchEvent(new CustomEvent('itemerror', { detail: item }));
                        reject(new Error(item.error));
                    }
                };
                slot.worker.addEventListener('message', handler);
                slot.worker.postMessage({
                    action: 'transcribe',
                    audioData,
                    sampleRate: 16000,
                    language: this._language,
                    id: msgId,
                });
            });
        } catch (err) {
            if (item.status !== 'error') {
                item.status = 'error';
                item.error  = err.message;
                item.progressLabel = 'Error';
                this._notify();
                this.dispatchEvent(new CustomEvent('itemerror', { detail: item }));
            }
        } finally {
            slot.busy = false;
            this._dispatch(); // pick up next queued item
        }
    }

    _notify() {
        this.dispatchEvent(new CustomEvent('change', { detail: [...this.items] }));
    }

    terminate() {
        this._pool.forEach(s => s.worker.terminate());
        this._pool   = [];
        this._started = false;
    }
}

// Singleton — shared by the whole app
const transcriptionQueue = new TranscriptionQueue();
export default transcriptionQueue;
