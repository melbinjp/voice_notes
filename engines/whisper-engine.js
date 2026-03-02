// Whisper Engine Module - Offline speech recognition via Transformers.js
import moduleRegistry from '../module-registry.js';

class WhisperEngine {
    constructor() {
        this.name = 'Whisper (Transformers.js)';
        this.id = 'whisper';
        this.isInitialized = false;
        this.worker = null;
        this.callbacks = {};

        // Quality management
        this.lastResult = '';
        this.lastResultTime = 0;
        this.deduplicationWindow = 2000;
        this.similarityThreshold = 0.8;
    }

    // Metadata for module registry
    static getMetadata() {
        return {
            id: 'whisper',
            name: 'Whisper (Xenova)',
            description: 'High-accuracy offline speech recognition using Transformers.js Whisper tiny.en',
            version: '1.0.0',
            author: 'Xenova',
            icon: '🧠',
            priority: 9,
            isOffline: true,
            isOnline: false,
            features: [
                'file_transcription',
                'offline_processing',
                'high_accuracy',
                'quality_management'
            ],
            requirements: [
                'transformers.js library',
                'web workers support'
            ],
            supportedFormats: [
                'audio/wav',
                'audio/mp3',
                'audio/m4a',
                'audio/ogg',
                'audio/webm'
            ],
            maxFileSize: 100 * 1024 * 1024, // 100MB
            languages: [
                { code: 'en', name: 'English', model: 'Xenova/whisper-tiny.en' }
            ]
        };
    }

    async isAvailable() {
        return !!window.Worker; // Available if Web Workers are supported
    }

    async initialize() {
        if (this.isInitialized) return true;

        try {
            console.log('Initializing Whisper engine...');

            this.worker = new Worker('engines/whisper-worker.js', { type: 'module' });

            this.isInitialized = true;
            console.log('Whisper engine initialized successfully (Worker created)');
            return true;
        } catch (error) {
            console.error('Whisper initialization failed:', error);
            throw error;
        }
    }

    // File transcription
    async transcribeFile(file, onProgress) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            console.log('Transcribing file with Whisper:', file.name);
            const startTime = Date.now();

            // We need to decode the audio file to raw PCM for Whisper
            let audioData;

            // Update progress
            if (onProgress) onProgress({ percent: 10, status: 'Decoding audio...' });

            const arrayBuffer = await file.arrayBuffer();

            // Use Web Audio API to decode
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const decodedData = await audioContext.decodeAudioData(arrayBuffer);
            audioData = decodedData.getChannelData(0); // Get mono float32 array

            if (onProgress) onProgress({ percent: 20, status: 'Initializing Whisper parameters...' });

            return new Promise((resolve, reject) => {
                const messageId = Date.now().toString();

                // Listen to worker
                const messageHandler = (e) => {
                    if (e.data.id !== messageId) return;

                    if (e.data.status === 'progress' && onProgress) {
                        // Transformers.js progress callback
                        // e.data.data = { status: "progress", name: "...", progress: 50 }
                        if (e.data.data && e.data.data.status === 'progress') {
                            // Model downloading
                            onProgress({ percent: e.data.data.progress, status: `Downloading Model: ${e.data.data.file}...` });
                        } else if (e.data.data && e.data.data.status === 'ready') {
                            onProgress({ percent: 100, status: 'Model ready. Starting transcription...' });
                        }
                    } else if (e.data.status === 'transcribing' && onProgress) {
                        onProgress({ percent: null, status: 'Whisper is transcribing audio... (This may take a while)' });
                    } else if (e.data.status === 'success') {
                        this.worker.removeEventListener('message', messageHandler);

                        const duration = (Date.now() - startTime) / 1000;
                        console.log(`Whisper file transcription completed in ${duration}s`);

                        // Map timestamps to word array for app.js
                        let words = [];
                        if (e.data.chunks) {
                            e.data.chunks.forEach(chunk => {
                                words.push({
                                    word: chunk.text,
                                    start: chunk.timestamp[0],
                                    end: chunk.timestamp[1]
                                });
                            });
                        }

                        resolve({
                            text: e.data.text,
                            words: words,
                            duration,
                            engine: 'whisper',
                            confidence: 0.95,
                            language: 'en'
                        });
                    } else if (e.data.status === 'error') {
                        this.worker.removeEventListener('message', messageHandler);
                        reject(new Error(e.data.error));
                    }
                };

                this.worker.addEventListener('message', messageHandler);

                // Send to worker
                this.worker.postMessage({
                    action: 'transcribe',
                    audioData: audioData,
                    sampleRate: 16000,
                    id: messageId
                });
            });

        } catch (error) {
            console.error('Whisper file transcription failed:', error);
            throw error;
        }
    }

    // Not implementing real-time for Whisper yet due to processing latency in browser
    async start(onResult, onError, onStatus) {
        throw new Error("Real-time microphone transcription is not yet supported for Whisper in browser.");
    }
    async stop() { }

    // Get engine information
    getInfo() {
        return WhisperEngine.getMetadata();
    }

    // Get status
    getStatus() {
        if (!this.isInitialized) return 'not_initialized';
        return 'ready';
    }

    // Cleanup
    async cleanup() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isInitialized = false;
    }

    // Dummy functions for quality interface
    checkQuality() {
        return { quality: 'high', issues: [], engine: 'whisper', status: this.getStatus() };
    }
}

// Auto-register with module registry
moduleRegistry.registerModule('whisper', WhisperEngine, WhisperEngine.getMetadata());

export { WhisperEngine };
