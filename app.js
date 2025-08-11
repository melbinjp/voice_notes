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

// Remove summary style/length controls from UI
const summarizeControls = document.getElementById('summarizeControls');
if (summarizeControls) {
  summarizeControls.remove();
}

// Add a paste button for testing
const pasteTestBtn = document.createElement('button');
pasteTestBtn.id = 'pasteTestBtn';
pasteTestBtn.textContent = 'Paste Text';
pasteTestBtn.title = 'Paste clipboard text into transcript';
pasteTestBtn.style.marginRight = '8px';

const transcriptSection = document.querySelector('.transcript-section');
if (transcriptSection) {
  transcriptSection.insertBefore(pasteTestBtn, transcriptSection.querySelector('#copyTranscriptBtn'));
}

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

// --- New Vosk-based Transcription ---
let isRecording = false;
let recognizer = null;
let model = null;
let audioContext = null;
let source = null;
let processor = null;

const VOSK_MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip';

async function loadVoskModel() {
  if (model) return model;
  statusBar.textContent = 'Loading offline model (40MB)... This may take a minute.';
  try {
    model = await Vosk.createModel(VOSK_MODEL_URL);
    statusBar.textContent = 'Model loaded. Ready to record.';
    return model;
  } catch (e) {
    statusBar.textContent = 'Failed to load model. Please check your internet connection for the first-time setup.';
    console.error(e);
    return null;
  }
}

async function startVoskRecognition() {
  if (!model) {
    model = await loadVoskModel();
    if (!model) return;
  }

  isRecording = true;
  recordBtn.textContent = 'Stop Recording';
  recordingStatus.textContent = 'Recording...';
  statusBar.textContent = 'Listening (Offline)...';

  recognizer = new model.KaldiRecognizer(16000);
  let finalTranscript = '';
  transcriptArea.value = '';

  recognizer.on("result", (message) => {
    finalTranscript += message.result.text + ' ';
    transcriptArea.value = finalTranscript;
  });

  recognizer.on("partialresult", (message) => {
    transcriptArea.value = finalTranscript + message.result.partial;
  });

  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: 16000
      },
    });

    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!isRecording) return;
      try {
        recognizer.acceptWaveform(event.inputBuffer);
      } catch (error) {
        console.error('acceptWaveform failed', error);
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

  } catch (error) {
    console.error('Error getting media stream:', error);
    statusBar.textContent = 'Error: Could not access microphone.';
    stopVoskRecognition();
  }
}

function stopVoskRecognition() {
  if (recognizer) {
    recognizer.remove();
    recognizer = null;
  }
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (source) {
    source.disconnect();
    source = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  isRecording = false;
  recordBtn.textContent = 'Start Recording';
  recordingStatus.textContent = '';
  statusBar.textContent = 'Stopped.';
}

recordBtn.addEventListener('click', async () => {
  if (isRecording) {
    stopVoskRecognition();
  } else {
    await startVoskRecognition();
  }
});

// Pre-load the model when the page is idle
window.addEventListener('DOMContentLoaded', () => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadVoskModel, { timeout: 3000 });
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
  summary.innerHTML = '';

  // Progressive Enhancement for Summarization
  if ('Summarizer' in window && typeof Summarizer.availability === 'function') {
    const availability = await Summarizer.availability();
    if (availability.state === 'readily-available') {
      statusBar.textContent = 'Summarizing with built-in AI...';
      try {
        const summarizer = await Summarizer.create({
          type: 'tldr',
          length: 'short',
          format: 'plain_text'
        });
        const summaryText = await summarizer.summarize(transcript);
        handleSuccessfulSummary(transcript, { summary: summaryText });
      } catch (e) {
        statusBar.textContent = 'Built-in AI failed. Trying fallback...';
        console.error('Summarizer API error:', e);
        await fallbackSummarize(transcript);
      }
    } else {
      await fallbackSummarize(transcript);
    }
  } else {
    await fallbackSummarize(transcript);
  }

  sendToLLMBtn.disabled = false;
});

async function fallbackSummarize(transcript) {
  if (!navigator.onLine) {
    statusBar.textContent = 'Summarization requires an internet connection.';
    return;
  }
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
    handleSuccessfulSummary(transcript, data);
  } catch (e) {
    summary.innerHTML = '';
    statusBar.textContent = 'Error: ' + e.message;
  }
}

function handleSuccessfulSummary(transcript, summaryData) {
  const { summary: summaryText, keyPoints } = summaryData;
  let sessionTitle = sessionTitleInput.value.trim();
  if (!sessionTitle) {
    const now = new Date();
    sessionTitle = now.toLocaleString();
    if (summaryText) {
      const firstSentence = summaryText.split(/[.!?]/)[0].trim();
      if (firstSentence && firstSentence.length > 5) {
        sessionTitle = firstSentence;
      }
    }
    sessionTitleInput.value = sessionTitle;
  }

  let html = '';
  if (sessionTitle) html += `<h3>${sessionTitle}</h3>`;
  if (transcript) html += `<p><b>Transcript:</b> ${transcript}</p>`;
  if (summaryText) html += `<p><b>Summary:</b> ${summaryText}</p>`;
  if (keyPoints && Array.isArray(keyPoints)) {
    html += '<ul>' + keyPoints.map(pt => `<li>${pt}</li>`).join('') + '</ul>';
  }
  summary.innerHTML = html;
  statusBar.textContent = 'Summary received.';
  saveToHistory(transcript, summaryText, keyPoints, sessionTitle);
  renderHistory();
}

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

// Sidebar toggle logic
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const appMain = document.getElementById('app');

function setHamburgerState(open) {
  if (open) {
    sidebarToggle.classList.add('open');
    sidebarToggle.setAttribute('aria-label', 'Hide sidebar');
  } else {
    sidebarToggle.classList.remove('open');
    sidebarToggle.setAttribute('aria-label', 'Show sidebar');
  }
}

function closeSidebar() {
  sidebar.classList.remove('open');
  appMain.classList.remove('with-sidebar');
  setHamburgerState(false);
}
function openSidebar() {
  sidebar.classList.add('open');
  appMain.classList.add('with-sidebar');
  setHamburgerState(true);
}
if (sidebarToggle && sidebar && appMain) {
  sidebarToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
  // Close sidebar on click outside (desktop and mobile)
  window.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        closeSidebar();
      }
    }
  });
  // Close sidebar on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });
}
window.addEventListener('DOMContentLoaded', () => {
  closeSidebar();
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
