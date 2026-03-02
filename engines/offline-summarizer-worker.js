// Offline Summarizer Web Worker (transformer.js)
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Set environment options
env.allowLocalModels = false;
env.useBrowserCache = true;

// Pipeline instance
class SummaryPipelineSingleton {
    static instance = null;
    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            // Using a fine-tuned DistilBART model that is performant inside the browser
            this.instance = pipeline('summarization', 'Xenova/distilbart-cnn-6-6', {
                progress_callback
            });
        }
        return this.instance;
    }
}

self.onmessage = async (e) => {
    const { action, text, id, max_length = 150, min_length = 30 } = e.data;

    if (action === 'summarize') {
        try {
            // Send loading status
            self.postMessage({ status: 'loading', id });

            const summarizer = await SummaryPipelineSingleton.getInstance((data) => {
                // Return progress for model download
                self.postMessage({ status: 'progress', data, id });
            });

            // Send processing state
            self.postMessage({ status: 'processing', id });

            // Run summarization
            const result = await summarizer(text, {
                max_length: max_length,
                min_length: min_length,
                temperature: 0.7,
                repetition_penalty: 1.2
            });

            // Return success
            self.postMessage({
                status: 'success',
                summary: result[0].summary_text,
                id
            });

        } catch (error) {
            self.postMessage({ status: 'error', error: error.message, id });
        }
    }
};
