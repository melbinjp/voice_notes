import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

// Configure the library to use the Hugging Face Hub
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/{revision}/{path}';

// --- Offline Whisper Class ---
class OfflineWhisper {
  constructor(statusCallback) {
    this.statusCallback = statusCallback;
    this.model = null;
    this.loading = false;
  }

  async load() {
    if (this.model || this.loading) {
      return;
    }

    this.loading = true;
    this.statusCallback('Loading model...');

    try {
      this.model = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      this.statusCallback('Model loaded successfully.');
      updateSettingsUI();
    } catch (error) {
      this.statusCallback(`Error loading model: ${error}`);
    } finally {
      this.loading = false;
    }
  }

  async transcribe(audioBlob) {
    if (!this.model) {
      this.statusCallback('Model not loaded.');
      return;
    }
    this.statusCallback('Transcribing...');
    try {
      // 1. Read the Blob into an ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      // 2. Decode the ArrayBuffer into an AudioBuffer
      const audioContext = new AudioContext({
        sampleRate: 16000,
      });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // 3. Get the Float32Array from the AudioBuffer
      const audioData = audioBuffer.getChannelData(0);

      // 4. Pass the Float32Array to the model
      const output = await this.model(audioData);
      this.statusCallback('Transcription complete.');
      return output.text;
    } catch (error) {
      this.statusCallback(`Transcription error: ${error}`);
    }
  }

  clear() {
    this.model = null;
    updateSettingsUI();
    this.statusCallback('Transcription model cleared. Please reload the page to download it again.');
  }
}

class OfflineSummarizer {
  constructor(statusCallback) {
    this.statusCallback = statusCallback;
    this.model = null;
    this.loading = false;
  }

  async load() {
    if (this.model || this.loading) {
      return;
    }

    this.loading = true;
    this.statusCallback('Loading summarizer...');

    try {
      this.model = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6');
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
      this.statusCallback('Summarizer not loaded.');
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
    this.statusCallback('Summarizer model cleared. Please reload the page to download it again.');
  }
}

// --- Feature 1: Audio Recording & Online Transcription (Web Speech API) ---

const recordBtn = document.getElementById('recordBtn');
const recordingStatus = document.getElementById('recordingStatus');
const transcriptArea = document.getElementById('transcript');
const sendToLLMBtn = document.getElementById('sendToLLMBtn');
const statusBar = document.getElementById('statusBar');
const summary = document.getElementById('summary');
const historyList = document.getElementById('historyList');
let selectedSummaryType = 'standard';
let selectedSummaryLength = 'default';
const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const sessionTitleInput = document.getElementById('sessionTitle');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// --- Modal Elements and Logic ---
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTranscriptionModelStatus = document.getElementById('modalTranscriptionModelStatus');
const downloadTranscriptionModelBtn = document.getElementById('downloadTranscriptionModelBtn');
const clearTranscriptionModelBtnModal = document.getElementById('clearTranscriptionModelBtnModal');
const modalSummarizationModelStatus = document.getElementById('modalSummarizationModelStatus');
const downloadSummarizationModelBtn = document.getElementById('downloadSummarizationModelBtn');
const clearSummarizationModelBtnModal = document.getElementById('clearSummarizationModelBtnModal');

function updateSettingsUI() {
  const whisperLoaded = !!offlineWhisper.model;
  const summarizerLoaded = !!offlineSummarizer.model;

  modalTranscriptionModelStatus.textContent = whisperLoaded ? 'Loaded' : 'Not Loaded';
  downloadTranscriptionModelBtn.style.display = whisperLoaded ? 'none' : 'inline-block';
  clearTranscriptionModelBtnModal.style.display = whisperLoaded ? 'inline-block' : 'none';

  modalSummarizationModelStatus.textContent = summarizerLoaded ? 'Loaded' : 'Not Loaded';
  downloadSummarizationModelBtn.style.display = summarizerLoaded ? 'none' : 'inline-block';
  clearSummarizationModelBtnModal.style.display = summarizerLoaded ? 'inline-block' : 'none';
}

settingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'flex';
});

closeModalBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    settingsModal.style.display = 'none';
  }
});

downloadTranscriptionModelBtn.addEventListener('click', () => {
  downloadTranscriptionModelBtn.textContent = 'Loading...';
  downloadTranscriptionModelBtn.disabled = true;
  offlineWhisper.load().finally(() => {
    downloadTranscriptionModelBtn.textContent = 'Download';
    downloadTranscriptionModelBtn.disabled = false;
  });
});

downloadSummarizationModelBtn.addEventListener('click', () => {
  downloadSummarizationModelBtn.textContent = 'Loading...';
  downloadSummarizationModelBtn.disabled = true;
  offlineSummarizer.load().finally(() => {
    downloadSummarizationModelBtn.textContent = 'Download';
    downloadSummarizationModelBtn.disabled = false;
  });
});

clearTranscriptionModelBtnModal.addEventListener('click', () => {
  offlineWhisper.clear();
});

clearSummarizationModelBtnModal.addEventListener('click', () => {
  offlineSummarizer.clear();
});

// Remove summary style/length controls from UI
const summarizeControls = document.getElementById('summarizeControls');
if (summarizeControls) {
  summarizeControls.remove();
}

const pasteTestBtn = document.getElementById('pasteTestBtn');
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

const offlineWhisper = new OfflineWhisper((status) => {
  statusBar.textContent = status;
});

const offlineSummarizer = new OfflineSummarizer((status) => {
  statusBar.textContent = status;
});

window.addEventListener('DOMContentLoaded', () => {
  updateSettingsUI();
});

let isRecording = false;
let recognition = null;
let mediaRecorder = null;
let audioChunks = [];

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
    recognition = null;
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
    const transcript = await offlineWhisper.transcribe(audioBlob);
    if (transcript) {
      transcriptArea.value = transcript;
    }
    stream.getTracks().forEach(track => track.stop());
  };

  mediaRecorder.start();
  recordingStatus.textContent = 'Recording...';
  statusBar.textContent = 'Listening (Offline Whisper)';
}

function stopMediaRecorder() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
  isRecording = false;
  recordBtn.textContent = 'Start Recording';
  recordingStatus.textContent = '';
}

// Update recordBtn event to support Web Speech API fallback
recordBtn.addEventListener('click', async () => {
  if (isRecording) {
    if (recognition) {
      stopRecording();
    } else if (mediaRecorder) {
      stopMediaRecorder();
    }
  } else {
    isRecording = true;
    recordBtn.textContent = 'Stop Recording';
    if (offlineWhisper.model) {
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

// Scroll transcript to bottom as new text is added
if (transcriptArea) {
  transcriptArea.addEventListener('input', () => {
    transcriptArea.scrollTop = transcriptArea.scrollHeight;
  });
}

// Copy transcript
if (copyTranscriptBtn) {
  copyTranscriptBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(transcriptArea.value);
    statusBar.textContent = 'Transcript copied!';
  });
}
// Copy summary
if (copySummaryBtn) {
  copySummaryBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(summary.textContent || summary.innerText);
    statusBar.textContent = 'Summary copied!';
  });
}
// Clear history
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', async () => {
    const db = await openDB();
    const tx = db.transaction('history', 'readwrite');
    tx.objectStore('history').clear();
    tx.oncomplete = () => {
      db.close();
      renderHistory();
      statusBar.textContent = 'History cleared.';
    };
  });
}

// Add clear all logic to the hr line
const clearHistoryHr = document.querySelector('.clear-history-hr');
if (clearHistoryHr) {
  clearHistoryHr.style.cursor = 'pointer';
  clearHistoryHr.title = 'Clear all history';
  clearHistoryHr.addEventListener('click', async () => {
    if (confirm('Clear all history?')) {
      const db = await openDB();
      const tx = db.transaction('history', 'readwrite');
      tx.objectStore('history').clear();
      tx.oncomplete = () => {
        db.close();
        renderHistory();
        statusBar.textContent = 'History cleared.';
      };
    }
  });
}

// --- Feature 3: Send Transcript to Backend (Gemini API via Cloudflare Worker) ---

sendToLLMBtn.addEventListener('click', async () => {
  const transcript = transcriptArea.value.trim();
  if (!transcript) {
    statusBar.textContent = 'No transcript to summarize.';
    return;
  }

  sendToLLMBtn.disabled = true;

  if (offlineSummarizer.model) {
    // Offline summarization
    const summaryText = await offlineSummarizer.summarize(transcript);
    if (summaryText) {
      let sessionTitle = sessionTitleInput.value.trim();
      if (!sessionTitle) {
        sessionTitle = new Date().toLocaleString();
        sessionTitleInput.value = sessionTitle;
      }
      let html = `<h3>${sessionTitle}</h3><p><b>Transcript:</b> ${transcript}</p><p><b>Summary:</b> ${summaryText}</p>`;
      summary.innerHTML = html;
      saveToHistory(transcript, summaryText, null, sessionTitle);
      renderHistory();
    }
  } else {
    // Online summarization
    statusBar.textContent = 'Sending transcript to backend for summarization...';
    try {
      const endpoint = 'https://llm.melbinjpaulose.workers.dev/';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcript,
          summaryLength: 'default',
          summaryType: 'standard',
          language: 'English',
          title: sessionTitleInput.value.trim() || undefined
        })
      });
      if (!res.ok) throw new Error('Backend error: ' + res.status);
      const data = await res.json();
      let sessionTitle = sessionTitleInput.value.trim();
      if (!sessionTitle) {
        const now = new Date();
        sessionTitle = now.toLocaleString();
        if (data.summary) {
          const firstSentence = data.summary.split(/[.!?]/)[0].trim();
          if (firstSentence && firstSentence.length > 5) {
            sessionTitle = firstSentence;
          }
        }
        sessionTitleInput.value = sessionTitle;
      }
      let html = '';
      if (sessionTitle) html += `<h3>${sessionTitle}</h3>`;
      if (transcript) html += `<p><b>Transcript:</b> ${transcript}</p>`;
      if (data.summary) html += `<p><b>Summary:</b> ${data.summary}</p>`;
      const points = data.keyPoints || data.bullets;
      if (points && Array.isArray(points)) {
        html += '<ul>' + points.map(pt => `<li>${pt}</li>`).join('') + '</ul>';
      }
      summary.innerHTML = html;
      statusBar.textContent = 'Summary received.';
      saveToHistory(transcript, data.summary, points, sessionTitle);
      renderHistory();
    } catch (e) {
      summary.innerHTML = '';
      statusBar.textContent = 'Error: ' + e.message;
    }
  }

  sendToLLMBtn.disabled = false;
});

// --- Feature 4: IndexedDB Storage for History ---
// Simple IndexedDB wrapper
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('voiceNotesDB', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToHistory(transcript, summary, keyPoints, title) {
  const db = await openDB();
  const tx = db.transaction('history', 'readwrite');
  const store = tx.objectStore('history');
  await store.add({
    date: new Date().toISOString(),
    transcript,
    summary,
    keyPoints,
    title
  });
  tx.oncomplete = () => db.close();
}

async function loadHistory() {
  const db = await openDB();
  const tx = db.transaction('history', 'readonly');
  const store = tx.objectStore('history');
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      db.close();
      resolve(req.result.sort((a, b) => b.date.localeCompare(a.date)));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

// --- Show history in the UI with per-note export, delete, and dropdown expansion ---
async function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const items = await loadHistory();
  list.innerHTML = items.map((item, idx) => {
    const safeTitle = item.title ? item.title.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Untitled';
    const transcript = item.transcript ? item.transcript.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const summary = item.summary ? item.summary.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const keyPoints = item.keyPoints && Array.isArray(item.keyPoints) && item.keyPoints.length
      ? '<ul>' + item.keyPoints.map(pt => `<li>${pt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('') + '</ul>'
      : '';
    return `
      <li data-id="${item.id}" class="history-dropdown">
        <div class="history-title-row">
          <button class="history-title-btn" aria-expanded="false" aria-controls="history-details-${item.id}">
            <span class="history-arrow" aria-hidden="true">▶</span>
            <span class="sidebar-session-label history-title-text" title="${safeTitle}">${safeTitle}</span>
          </button>
          <div class="history-actions-inline">
            <button class="export-note-btn" data-id="${item.id}" title="Export" aria-label="Export">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m0 0l-6-6m6 6l6-6"/></svg>
            </button>
            <button class="delete-note-btn" data-id="${item.id}" title="Delete" aria-label="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>
        </div>
        <div class="history-details" id="history-details-${item.id}" hidden>
          <div class="history-meta"><b>Date:</b> ${new Date(item.date).toLocaleString()}</div>
          <div class="history-transcript"><b>Transcript:</b><br>${transcript}</div>
          <div class="history-summary"><b>Summary:</b><br>${summary}</div>
          ${keyPoints ? `<div class="history-keypoints"><b>Key Points:</b>${keyPoints}</div>` : ''}
          <div class="history-actions-expanded">
            <button class="export-note-btn" data-id="${item.id}" title="Export" aria-label="Export">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m0 0l-6-6m6 6l6-6"/></svg>
            </button>
            <button class="delete-note-btn" data-id="${item.id}" title="Delete" aria-label="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>
        </div>
      </li>
    `;
  }).join('');

  // Dropdown expand/collapse logic with arrow
  list.querySelectorAll('.history-title-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const details = btn.parentElement.parentElement.querySelector('.history-details');
      const arrow = btn.querySelector('.history-arrow');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      if (expanded) {
        details.hidden = true;
        if (arrow) arrow.textContent = '▶';
      } else {
        details.hidden = false;
        if (arrow) arrow.textContent = '▼';
      }
    });
  });

  // Export (download) logic
  list.querySelectorAll('.export-note-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      const note = (await loadHistory()).find(n => n.id === id);
      if (!note) return;
      const content =
        `${note.title ? 'Title: ' + note.title + '\n' : ''}` +
        `Date: ${new Date(note.date).toLocaleString()}\n` +
        `Transcript:\n${note.transcript}\n\nSummary:\n${note.summary}\n` +
        (note.keyPoints && note.keyPoints.length ? `\nKey Points:\n- ${note.keyPoints.join('\n- ')}` : '');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (note.title ? note.title.replace(/[^a-z0-9]/gi, '_') : 'note') + '.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    });
  });

  // Delete logic
  list.querySelectorAll('.delete-note-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      const db = await openDB();
      const tx = db.transaction('history', 'readwrite');
      tx.objectStore('history').delete(id);
      tx.oncomplete = () => {
        db.close();
        renderHistory();
        statusBar.textContent = 'Note deleted.';
      };
    });
  });
}

// --- Clear All History Button ---
function ensureClearAllBtn() {
  let clearBtn = document.getElementById('clearHistoryBtn');
  if (!clearBtn) {
    clearBtn = document.createElement('button');
    clearBtn.id = 'clearHistoryBtn';
    clearBtn.textContent = 'Clear All';
    clearBtn.title = 'Clear all history';
    clearBtn.style.margin = '8px 0 8px 16px';
    clearBtn.style.background = '#fff';
    clearBtn.style.color = '#d32f2f';
    clearBtn.style.border = '1.5px solid #d32f2f';
    clearBtn.style.borderRadius = '18px';
    clearBtn.style.fontSize = '1rem';
    clearBtn.style.fontWeight = '500';
    clearBtn.style.padding = '7px 18px';
    clearBtn.style.cursor = 'pointer';
    clearBtn.addEventListener('click', async () => {
      if (confirm('Clear all history?')) {
        const db = await openDB();
        const tx = db.transaction('history', 'readwrite');
        tx.objectStore('history').clear();
        tx.oncomplete = () => {
          db.close();
          renderHistory();
          statusBar.textContent = 'History cleared.';
        };
      }
    });
    // Insert at the top of the history section
    const historySection = document.querySelector('.history-section-bottom');
    if (historySection && !document.getElementById('clearHistoryBtn')) {
      historySection.insertBefore(clearBtn, historySection.firstChild);
    }
  }
}

// Ensure clear all button is present after rendering history
window.addEventListener('DOMContentLoaded', ensureClearAllBtn);
const origRenderHistory = renderHistory;
renderHistory = async function() {
  await origRenderHistory.apply(this, arguments);
  ensureClearAllBtn();
};

// --- Feature 6: PWA Install Prompt ---
let deferredPrompt = null;

// Create and insert the install button
const installBtn = document.createElement('button');
installBtn.id = 'installBtn';
installBtn.textContent = 'Install App';
installBtn.style.display = 'none';
installBtn.style.margin = '10px auto';
installBtn.style.padding = '10px 20px';
installBtn.style.fontSize = '1rem';
installBtn.style.cursor = 'pointer';

// Insert the button into the DOM (e.g., after the statusBar)
window.addEventListener('DOMContentLoaded', () => {
  const statusBar = document.getElementById('statusBar');
  if (statusBar && !document.getElementById('installBtn')) {
    statusBar.parentNode.insertBefore(installBtn, statusBar.nextSibling);
  }
  renderHistory();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  installBtn.disabled = true;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    statusBar.textContent = 'App installed!';
  } else {
    statusBar.textContent = 'Install dismissed.';
  }
  installBtn.style.display = 'none';
  deferredPrompt = null;
  installBtn.disabled = false;
});

// --- Service Worker update notification logic ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(reg => {
    // Listen for updates
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker, reg);
          }
        });
      }
    });
    // Also check if there's already a waiting SW
    if (reg.waiting) {
      showUpdateBanner(reg.waiting, reg);
    }
  });
}

function showUpdateBanner(worker, reg) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.style.display = 'block';
  banner.onclick = () => {
    worker.postMessage({ action: 'skipWaiting' });
    banner.textContent = 'Updating...';
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };
}
// Listen for controllerchange to reload after update
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// On page load, show history
window.addEventListener('DOMContentLoaded', renderHistory);

window.addEventListener('online', () => {
  statusBar.textContent = 'You are back online.';
});

window.addEventListener('offline', () => {
  statusBar.textContent = 'You are offline. Some features may not be available.';
});

// This file will handle:
// - Audio recording (MediaRecorder)
// - Online transcription (Web Speech API)
// - UI updates
// - Sending to backend
// - IndexedDB storage
// - PWA install prompt
// - Sidebar toggle logic
// - Service Worker update notification logic

// We'll implement each feature in order.
