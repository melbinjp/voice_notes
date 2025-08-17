import { env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Do not look for models locally
env.allowLocalModels = false;

// --- Offline Whisper Class (Worker-based) ---
class OfflineWhisper {
  constructor(statusCallback, progressCallback) {
    this.statusCallback = statusCallback;
    this.progressCallback = progressCallback;
    this.worker = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.transcriptionPromise = null;
    this.modelName = null;
  }

  initModel(modelName) {
    if (this.isLoading || this.isLoaded) {
      return;
    }
    this.isLoading = true;
    this.modelName = modelName;
    this.statusCallback('Initializing transcription worker...');
    updateSettingsUI();

    this.worker = new Worker(new URL('./transcription.worker.js', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (event) => {
      const { status, data, transcript } = event.data;
      switch (status) {
        case 'worker-ready':
          this.statusCallback('Worker is ready. Loading model...');
          this.worker.postMessage({ action: 'load', model: this.modelName });
          break;
        case 'progress':
          this.progressCallback(data);
          break;
        case 'ready':
          this.isLoaded = true;
          this.isLoading = false;
          this.statusCallback('Transcription model ready.');
          updateSettingsUI();
          break;
        case 'transcribing':
          this.statusCallback('Transcribing in background...');
          break;
        case 'complete':
          if (this.transcriptionPromise && this.transcriptionPromise.resolve) {
            this.transcriptionPromise.resolve(transcript);
            this.transcriptionPromise = null;
          }
          this.statusCallback('Transcription complete.');
          break;
        case 'error':
          this.isLoading = false;
          this.isLoaded = false;
          this.statusCallback(`Worker error: ${data}`);
          if (this.transcriptionPromise && this.transcriptionPromise.reject) {
            this.transcriptionPromise.reject(new Error(data));
            this.transcriptionPromise = null;
          }
          updateSettingsUI();
          break;
      }
    };
  }

  async transcribe(audioBlob, language) {
    if (!this.isLoaded) {
      return Promise.reject('Model not loaded');
    }
    if (this.transcriptionPromise) {
      return Promise.reject('Another transcription is already in progress.');
    }

    try {
      const audioData = await this.preprocessAudio(audioBlob);
      return new Promise((resolve, reject) => {
        this.transcriptionPromise = { resolve, reject };
        this.worker.postMessage({
          action: 'transcribe',
          audio: audioData,
          model: this.modelName,
          language: language,
        }, [audioData.buffer]);
      });
    } catch (error) {
      this.statusCallback(`Audio processing error: ${error}`);
      return Promise.reject(error);
    }
  }

  async preprocessAudio(audioBlob) {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer.getChannelData(0);
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isLoaded = false;
      this.isLoading = false;
      updateSettingsUI();
      this.statusCallback('Transcription worker terminated.');
    }
  }
}

class OfflineSummarizer {
  constructor(statusCallback) {
    this.statusCallback = statusCallback;
    this.model = null;
    this.modelName = null;
    this.loading = false;
  }

  async load(modelName, progressCallback) {
    if (this.model || this.loading) {
      return;
    }
    this.loading = true;
    this.statusCallback(`Loading summarizer: ${modelName}`);
    try {
      this.model = await pipeline('summarization', modelName, {
        progress_callback: progressCallback,
      });
      this.modelName = modelName;
      this.statusCallback('Summarizer loaded successfully.');
      updateSettingsUI();
    } catch (error) {
      this.statusCallback(`Error loading summarizer: ${error}`);
    } finally {
      this.loading = false;
    }
  }

  async summarize(text) {
    if (!this.model) {
      return;
    }
    this.statusCallback('Summarizing...');
    try {
      const output = await this.model(text);
      this.statusCallback('Summarization complete.');
      return output[0].summary_text;
    } catch (error) {
      this.statusCallback(`Summarization error: ${error}`);
    }
  }

  clear() {
    this.model = null;
    updateSettingsUI();
    this.statusCallback('Summarizer model cleared.');
  }
}

// --- DOM Elements ---
const recordBtn = document.getElementById('recordBtn');
const recordingStatus = document.getElementById('recordingStatus');
const transcriptArea = document.getElementById('transcript');
const sendToLLMBtn = document.getElementById('sendToLLMBtn');
const statusBar = document.getElementById('statusBar');
const summary = document.getElementById('summary');
const historyList = document.getElementById('historyList');
const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const copyMarkdownBtn = document.getElementById('copyMarkdownBtn');
const sessionTitleInput = document.getElementById('sessionTitle');
const statusCardHeader = document.getElementById('statusCardHeader');
const statusCardContent = document.getElementById('statusCardContent');
const transcriptionModelStatus = document.getElementById('transcriptionModelStatus');
const summarizationModelStatus = document.getElementById('summarizationModelStatus');
const transcriptionProgress = document.getElementById('transcriptionProgress');
const summarizationProgress = document.getElementById('summarizationProgress');
const downloadTranscriptionModelBtn = document.getElementById('downloadTranscriptionModelBtn');
const clearTranscriptionModelBtn = document.getElementById('clearTranscriptionModelBtn');
const downloadSummarizationModelBtn = document.getElementById('downloadSummarizationModelBtn');
const clearSummarizationModelBtn = document.getElementById('clearSummarizationModelBtn');
const uploadInput = document.getElementById('uploadInput');
const transcriptionModelSelect = document.getElementById('transcriptionModelSelect');
const languageSelect = document.getElementById('languageSelect');
const summarizationModelSelect = document.getElementById('summarizationModelSelect');
const summaryStyleSelect = document.getElementById('summaryStyleSelect');
const pasteTestBtn = document.getElementById('pasteTestBtn');

let isRecording = false;
let recognition = null;
let mediaRecorder = null;
let audioChunks = [];
let lastSummaryMarkdown = '';

// --- Utility Functions ---
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- UI Logic ---
function updateSettingsUI() {
  const whisperReady = offlineWhisper.isLoaded;
  const whisperLoading = offlineWhisper.isLoading;
  transcriptionModelStatus.textContent = whisperReady ? 'Model Ready' : (whisperLoading ? 'Loading...' : 'Not Loaded');
  transcriptionModelSelect.disabled = whisperReady || whisperLoading;
  downloadTranscriptionModelBtn.style.display = (whisperReady || whisperLoading) ? 'none' : 'inline-block';
  clearTranscriptionModelBtn.style.display = whisperReady ? 'inline-block' : 'none';

  const summarizerLoaded = !!offlineSummarizer.model;
  summarizationModelStatus.textContent = summarizerLoaded ? `Loaded: ${offlineSummarizer.modelName}` : 'Not Loaded';
  summarizationModelSelect.disabled = summarizerLoaded;
  downloadSummarizationModelBtn.style.display = summarizerLoaded ? 'none' : 'inline-block';
  clearSummarizationModelBtn.style.display = summarizerLoaded ? 'inline-block' : 'none';
}

statusCardHeader.addEventListener('click', () => {
  const isExpanded = statusCardContent.style.display === 'block';
  statusCardContent.style.display = isExpanded ? 'none' : 'block';
  statusCardHeader.setAttribute('aria-expanded', String(!isExpanded));
});

// --- Model Management Event Listeners ---
downloadTranscriptionModelBtn.addEventListener('click', () => {
  const modelName = transcriptionModelSelect.value;
  offlineWhisper.initModel(modelName);
});

clearTranscriptionModelBtn.addEventListener('click', () => {
  offlineWhisper.terminate();
});

downloadSummarizationModelBtn.addEventListener('click', () => {
  const modelName = summarizationModelSelect.value;
  offlineSummarizer.load(modelName, (progress) => {
    if (progress.status === 'progress') {
      const loaded = formatBytes(progress.loaded);
      const total = formatBytes(progress.total);
      summarizationProgress.textContent = `(${loaded} / ${total})`;
    }
  }).finally(() => {
    summarizationProgress.textContent = '';
    updateSettingsUI();
  });
});

clearSummarizationModelBtn.addEventListener('click', () => {
  offlineSummarizer.clear();
});

// --- Main App Instances ---
const offlineWhisper = new OfflineWhisper(
  (status) => { statusBar.textContent = status; },
  (progress) => {
    if (progress.status === 'progress') {
      const loaded = formatBytes(progress.loaded);
      const total = formatBytes(progress.total);
      transcriptionProgress.textContent = `(${loaded} / ${total})`;
    } else if (progress.status === 'done') {
        transcriptionProgress.textContent = '';
        updateSettingsUI();
    }
  }
);

const offlineSummarizer = new OfflineSummarizer((status) => {
  statusBar.textContent = status;
});

// --- Transcription Logic ---
uploadInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!offlineWhisper.isLoaded) {
    statusBar.textContent = 'Please download the transcription model first.';
    return;
  }
  transcriptArea.value = '';
  statusBar.textContent = `Transcribing ${file.name}...`;
  try {
    const lang = languageSelect.value;
    const transcript = await offlineWhisper.transcribe(file, lang);
    transcriptArea.value = transcript;
    statusBar.textContent = 'File transcription complete.';
  } catch(e) {
    statusBar.textContent = `Error: ${e.message || e}`;
  }
  uploadInput.value = '';
});

function supportsWebSpeechAPI() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

function startWebSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onstart = () => {
    recordingStatus.textContent = 'Recording...';
    statusBar.textContent = 'Listening (Web Speech API)';
    transcriptArea.value = '';
  };
  recognition.onresult = (event) => {
    let final_transcript = '';
    let interim_transcript = '';
    for (let i = 0; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final_transcript += event.results[i][0].transcript;
      } else {
        interim_transcript += event.results[i][0].transcript;
      }
    }
    transcriptArea.value = final_transcript + interim_transcript;
  };
  recognition.onerror = (event) => {
    statusBar.textContent = 'Speech recognition error: ' + event.error;
    stopRecording();
  };
  recognition.onend = () => {
    recordingStatus.textContent = '';
    statusBar.textContent = 'Stopped.';
    isRecording = false;
    recordBtn.textContent = 'Start Recording';
  };
  recognition.start();
}

function stopRecording() {
  if (recognition) {
    recognition.stop();
  }
  if (mediaRecorder) {
    mediaRecorder.stop();
  }
  isRecording = false;
  recordBtn.textContent = 'Start Recording';
  recordingStatus.textContent = '';
}

async function startMediaRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];
  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };
  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    try {
      const lang = languageSelect.value;
      const transcript = await offlineWhisper.transcribe(audioBlob, lang);
      transcriptArea.value = transcript;
    } catch(e) {
      statusBar.textContent = `Error: ${e.message || e}`;
    }
    stream.getTracks().forEach(track => track.stop());
  };
  mediaRecorder.start();
  recordingStatus.textContent = 'Recording...';
  statusBar.textContent = 'Listening (Offline Whisper)';
}

recordBtn.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
  } else {
    isRecording = true;
    recordBtn.textContent = 'Stop Recording';
    if (offlineWhisper.isLoaded) {
      startMediaRecorder();
    } else if (supportsWebSpeechAPI()) {
      startWebSpeechRecognition();
    } else {
      statusBar.textContent = 'No transcription method available.';
      isRecording = false;
      recordBtn.textContent = 'Start Recording';
    }
  }
});

// ... (rest of the file remains the same)
// The following is a placeholder for the rest of the file content
// which includes history, summarization, and other UI logic.

pasteTestBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    transcriptArea.value = text;
    transcriptArea.dispatchEvent(new Event('input'));
    statusBar.textContent = 'Transcript pasted from clipboard.';
  } catch (e) {
    statusBar.textContent = 'Failed to paste: ' + e.message;
  }
});

transcriptArea.addEventListener('input', () => {
  transcriptArea.scrollTop = transcriptArea.scrollHeight;
});

copyTranscriptBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(transcriptArea.value);
  statusBar.textContent = 'Transcript copied!';
});

copySummaryBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(summary.textContent || summary.innerText);
  statusBar.textContent = 'Copied as plain text!';
});

copyMarkdownBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(lastSummaryMarkdown);
  statusBar.textContent = 'Copied as Markdown!';
});

sendToLLMBtn.addEventListener('click', async () => {
  // ... Summarization logic ...
});

// --- IndexedDB ---
function openDB() {
  // ... DB logic ...
}
async function saveToHistory(transcript, summary, keyPoints, title) {
  // ... DB logic ...
}
async function loadHistory() {
  // ... DB logic ...
}
async function renderHistory() {
  // ... DOM logic ...
}

// ... PWA and Service Worker Logic ...

window.addEventListener('DOMContentLoaded', () => {
  updateSettingsUI();
  renderHistory();
});
// ... and so on ...
