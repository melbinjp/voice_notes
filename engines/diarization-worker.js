// engines/diarization-worker.js
// Uses Transformers.js v3 for Pyannote Speaker Diarization
import { 
    AutoProcessor, 
    AutoModelForAudioFrameClassification, 
    env 
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.1';

// Set environment options
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 1) - 1);

const MODEL_ID = 'onnx-community/pyannote-segmentation-3.0';

class DiarizationPipeline {
    static model = null;
    static processor = null;

    static async getInstance(onProgress) {
        if (!this.model || !this.processor) {
            console.log(`[Diarization Worker] Loading ${MODEL_ID}...`);
            this.processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: onProgress });
            this.model = await AutoModelForAudioFrameClassification.from_pretrained(MODEL_ID, {
                progress_callback: onProgress,
                device: 'wasm' // Enforce wasm for broad compatibility, webgpu can be tricky with some audio models
            });
        }
        return { model: this.model, processor: this.processor };
    }
}

// Convert ArrayBuffer/Int16 to Float32 array for Transformers.js
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

    if (action === 'diarize') {
        try {
            self.postMessage({ status: 'loading', id });

            const { model, processor } = await DiarizationPipeline.getInstance((data) => {
                // Forward progress events
                if (data.status === 'progress') {
                    const pct = typeof data.progress === 'number' ? Math.round(data.progress) : null;
                    self.postMessage({ status: 'progress', data: { file: data.file || 'model', progress: pct }, id });
                }
            });

            self.postMessage({ status: 'analyzing', id });

            // Process audio format
            let audioArray = audioData;
            if (audioData instanceof ArrayBuffer) {
                audioArray = convertPCMToFloat32(audioData);
            } else if (audioData instanceof Int16Array) {
                audioArray = new Float32Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) audioArray[i] = audioData[i] / 32768.0;
            }

            // Pyannote expects 16kHz audio. Whisper already ensures we pass 16kHz audio!
            // Create inputs for the model
            const inputs = await processor(audioArray);

            // Run inference
            const { logits } = await model(inputs);

            // Post-process to get diarization segments
            // Output format: Array of { start, end, id: 'SPEAKER_00', confidence }
            const segments = processor.post_process_speaker_diarization(logits, audioArray.length)[0];

            self.postMessage({ status: 'success', segments, id });

        } catch (error) {
            console.error("Diarization error:", error);
            self.postMessage({ status: 'error', error: error.message, id });
        }
    }
};
