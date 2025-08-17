// transcription.worker.js

self.onerror = function(message, source, lineno, colno, error) {
    self.postMessage({ status: 'error', data: `Worker error: ${message}` });
    return true;
};

try {
    const transformersModule = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    const { pipeline, env } = transformersModule;

    env.allowLocalModels = false;
    env.backends.onnx.wasm.numThreads = 1;

    let model = null;
    let modelName = null;

    self.addEventListener('message', async (event) => {
        const data = event.data;

        if (data.action === 'load') {
            if (model !== null && modelName === data.model) {
                self.postMessage({ status: 'ready' });
                return;
            }

            try {
                self.postMessage({ status: 'model-loading', data: data.model });
                modelName = data.model;
                model = await pipeline('automatic-speech-recognition', modelName, {
                    progress_callback: (progress) => {
                        self.postMessage({ status: 'progress', data: progress });
                    },
                });
                self.postMessage({ status: 'ready' });
            } catch (error) {
                self.postMessage({ status: 'error', data: `Model loading failed: ${error.toString()}` });
            }

        } else if (data.action === 'transcribe') {
            if (!model) {
                self.postMessage({ status: 'error', data: 'Model not loaded.' });
                return;
            }
            if (!data.audio) {
                self.postMessage({ status: 'error', data: 'No audio data received.' });
                return;
            }

            try {
                self.postMessage({ status: 'transcribing' });

                const lang = data.language === 'auto' ? null : data.language;

                const output = await model(data.audio, {
                    chunk_length_s: 30,
                    stride_length_s: 5,
                    language: lang,
                    task: 'transcribe',
                });

                self.postMessage({
                    status: 'complete',
                    transcript: output.text,
                });

            } catch (error) {
                self.postMessage({ status: 'error', data: `Transcription failed: ${error.toString()}` });
            }
        }
    });

    self.postMessage({ status: 'worker-ready' });

} catch (e) {
    self.postMessage({
        status: 'error',
        data: `Failed to load transformers.js library: ${e.toString()}`
    });
}
