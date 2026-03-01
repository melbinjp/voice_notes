// Whisper Web Worker (transformer.js)
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Set environment options
env.allowLocalModels = false;
env.useBrowserCache = true;

// Pipeline instance
class PipelineSingleton {
    static instance = null;
    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
                progress_callback
            });
        }
        return this.instance;
    }
}

// Convert PCM array buffer to float32
function convertPCMToFloat32(buffer) {
    const int16Array = new Int16Array(buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
}

self.onmessage = async (e) => {
    const { action, audioData, sampleRate, id } = e.data;

    if (action === 'transcribe') {
        try {
            // Send loading status
            self.postMessage({ status: 'loading', id });

            const transcriber = await PipelineSingleton.getInstance((data) => {
                // Return progress for model download
                self.postMessage({ status: 'progress', data, id });
            });

            // Send transcribing state
            self.postMessage({ status: 'transcribing', id });

            // Convert raw PCM to float32 array
            let audioArray = audioData;
            if (audioData instanceof ArrayBuffer) {
                audioArray = convertPCMToFloat32(audioData);
            } else if (audioData instanceof Int16Array) {
                audioArray = new Float32Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) audioArray[i] = audioData[i] / 32768.0;
            }

            // Run whisper prediction
            const result = await transcriber(audioArray, {
                chunk_length_s: 30, // Processes in 30s chunks
                stride_length_s: 5, // 5s overlap
                return_timestamps: 'word' // Request word-level timestamps
            });

            // Return success
            self.postMessage({
                status: 'success',
                text: result.text,
                chunks: result.chunks, // This contains {text, timestamp: [start, end]}
                id
            });

        } catch (error) {
            self.postMessage({ status: 'error', error: error.message, id });
        }
    }
};
