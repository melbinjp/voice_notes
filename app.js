// --- Feature 1: Audio Recording & Offline Transcription (Vosk, default) ---
import { startVoskRecognition, stopVoskRecognition, loadVosk } from './vosk-integration.js';
import { startWebSpeechRecognition, stopWebSpeechRecognition } from './webspeech-integration.js';

const recordBtn = document.getElementById('recordBtn');
const recordingStatus = document.getElementById('recordingStatus');
const transcriptArea = document.getElementById('transcript');
const statusBar = document.getElementById('statusBar');
const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');
const transcriptSection = document.querySelector('.transcript-section');
const sendToLLMBtn = document.getElementById('sendToLLMBtn');
const modeSwitch = document.getElementById('modeSwitch');
const historyList = document.getElementById('historyList');
const summaryDiv = document.getElementById('summary');
const sessionTitleInput = document.getElementById('sessionTitle');
let isRecording = false;
let transcriptText = '';
let lastSummary = '';

// Helper to start the correct mode, with overlap support
let overlapTimeout = null;
let activeRecognizer = null; // 'online' or 'offline'
let pendingRecognizer = null; // 'online' or 'offline'

async function startTranscription(overlap = false) {
  if (!isRecording) return;
  transcriptText = transcriptArea.value || '';
  const dedupeAppend = (text) => {
    // Only append if not duplicate of last 20 chars
    if (!transcriptText.endsWith(text)) {
      transcriptText += text;
      transcriptArea.value = transcriptText;
    }
  };

  if (!modeSwitch.checked) {
    // Offline
    try {
      await loadVosk();
      await startVoskRecognition((text, isFinal) => {
        if (isFinal) {
          dedupeAppend(text + ' ');
        } else {
          transcriptArea.value = transcriptText + text;
        }
        transcriptArea.dispatchEvent(new Event('input'));
      });
      recordingStatus.textContent = 'Recording...';
      statusBar.textContent = 'Transcribing offline...';
      if (overlap) {
        pendingRecognizer = 'offline';
        setTimeout(() => {
          if (activeRecognizer === 'online') stopWebSpeechRecognition();
          activeRecognizer = 'offline';
          pendingRecognizer = null;
        }, 5000); // 5 seconds overlap
      } else {
        activeRecognizer = 'offline';
      }
    } catch (err) {
      modeSwitch.checked = true;
      statusBar.textContent = 'Offline mode failed, switched to Online.';
      startTranscription();
    }
  } else {
    // Online
    try {
      startWebSpeechRecognition({
        transcriptArea,
        recordingStatus,
        statusBar,
        transcriptText,
        onResult: (text, isFinal) => {
          if (isFinal) {
            dedupeAppend(text);
          } else {
            transcriptArea.value = text;
          }
          transcriptArea.dispatchEvent(new Event('input'));
        },
        onError: (event) => {
          if (event.error === 'network' || event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            stopRecording();
            modeSwitch.checked = false;
            statusBar.textContent = 'Network error, switching to offline mode...';
            isRecording = true;
            recordBtn.textContent = 'Stop Recording';
            startTranscription();
            return;
          }
          statusBar.textContent = 'Speech recognition error: ' + event.error;
          stopRecording();
        },
        onEnd: (reason) => {
          if (reason === 'stopped') {
            isRecording = false;
            recordBtn.textContent = 'Start Recording';
            recordingStatus.textContent = '';
            statusBar.textContent = 'Ready.';
            return;
          }
          recordingStatus.textContent = '';
          statusBar.textContent = 'Stopped.';
          isRecording = false;
          recordBtn.textContent = 'Start Recording';
        }
      });
      recordingStatus.textContent = 'Recording...';
      statusBar.textContent = 'Transcribing online...';
      if (overlap) {
        pendingRecognizer = 'online';
        setTimeout(() => {
          if (activeRecognizer === 'offline') stopVoskRecognition();
          activeRecognizer = 'online';
          pendingRecognizer = null;
        }, 5000); // 5 seconds overlap
      } else {
        activeRecognizer = 'online';
      }
    } catch (err) {
      modeSwitch.checked = false;
      statusBar.textContent = 'Online mode failed, switched to Offline.';
      startTranscription();
    }
  }
}

// Toggle handler: switch mode instantly if recording, with overlap
modeSwitch.addEventListener('change', async () => {
  if (isRecording) {
    // Start new recognizer before stopping the old one
    await startTranscription(true); // overlap=true
    // Old recognizer will be stopped after 5s overlap
  }
});

recordBtn.addEventListener('click', async () => {
  if (isRecording) {
    await stopRecording();
    return;
  }
  isRecording = true;
  recordBtn.textContent = 'Stop Recording';
  transcriptText = transcriptArea.value || '';
  await startTranscription();
});

// --- Upload Audio Button (Vosk default) ---
const uploadAudioBtn = document.createElement('button');
uploadAudioBtn.id = 'uploadAudioBtn';
uploadAudioBtn.textContent = 'Upload Audio';
uploadAudioBtn.title = 'Upload an audio file to transcribe';
uploadAudioBtn.className = 'main-action';
if (transcriptSection) {
  transcriptSection.insertBefore(uploadAudioBtn, transcriptSection.querySelector('#copyTranscriptBtn'));
}

uploadAudioBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      transcriptText = await transcribeAudioFileWithVosk(file, transcriptArea, statusBar);
    }
  };
  input.click();
});

// Remove the transcribe online button if it exists
const transcribeOnlineBtn = document.getElementById('transcribeOnlineBtn');
if (transcribeOnlineBtn) transcribeOnlineBtn.remove();

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

// --- History Save/Load Logic ---
function saveNoteToHistory({ title, transcript, summary }) {
  const notes = JSON.parse(localStorage.getItem('voiceNotesHistory') || '[]');
  notes.unshift({
    title: title || `Note ${new Date().toLocaleString()}`,
    transcript,
    summary,
    timestamp: Date.now()
  });
  localStorage.setItem('voiceNotesHistory', JSON.stringify(notes));
  renderHistory();
}

function renderHistory() {
  const notes = JSON.parse(localStorage.getItem('voiceNotesHistory') || '[]');
  historyList.innerHTML = '';
  notes.forEach((note, idx) => {
    const li = document.createElement('li');
    li.className = 'history-dropdown';
    li.innerHTML = `
      <div class="history-title-row">
        <button class="history-title-btn" data-idx="${idx}">
          <span class="history-title-text">${note.title || 'Untitled'}</span>
        </button>
        <div class="history-actions-inline">
          <button class="export-note-btn" title="Copy Transcript" data-idx="${idx}">📋</button>
          <button class="delete-note-btn" title="Delete Note" data-idx="${idx}">🗑️</button>
        </div>
      </div>
      <div class="history-details" style="display:none;"></div>
    `;
    historyList.appendChild(li);
  });
}

// Expand/collapse and actions
historyList.addEventListener('click', (e) => {
  const btn = e.target.closest('.history-title-btn');
  const copyBtn = e.target.closest('.export-note-btn');
  const delBtn = e.target.closest('.delete-note-btn');
  const notes = JSON.parse(localStorage.getItem('voiceNotesHistory') || '[]');
  if (btn) {
    const idx = btn.dataset.idx;
    const li = btn.closest('li');
    const details = li.querySelector('.history-details');
    if (details.style.display === 'none') {
      const note = notes[idx];
      details.innerHTML = `<b>Transcript:</b><br><pre>${note.transcript}</pre><b>Summary:</b><br><pre>${note.summary || ''}</pre>`;
      details.style.display = 'block';
    } else {
      details.style.display = 'none';
    }
  } else if (copyBtn) {
    const idx = copyBtn.dataset.idx;
    navigator.clipboard.writeText(notes[idx].transcript + '\n\n' + (notes[idx].summary || ''));
    statusBar.textContent = 'Note copied!';
  } else if (delBtn) {
    const idx = delBtn.dataset.idx;
    notes.splice(idx, 1);
    localStorage.setItem('voiceNotesHistory', JSON.stringify(notes));
    renderHistory();
    statusBar.textContent = 'Note deleted.';
  }
});

window.addEventListener('DOMContentLoaded', () => {
  statusBar.textContent = 'Ready.';
  renderHistory();
});

// On page load, initialize
window.addEventListener('DOMContentLoaded', () => {
  statusBar.textContent = 'Ready.';
});

// Listen for browser offline event to auto-switch to offline mode if recording online
window.addEventListener('offline', () => {
  if (isRecording && modeSwitch.checked) { // Only if in online mode
    stopRecording();
    modeSwitch.checked = false;
    statusBar.textContent = 'Internet lost, switching to offline mode...';
    isRecording = true;
    recordBtn.textContent = 'Stop Recording';
    startTranscription();
  }
});

async function stopRecording() {
  // Stop offline (Vosk) recognition
  if (typeof stopVoskRecognition === 'function') {
    await stopVoskRecognition();
  }
  // Stop online (Web Speech API) recognition
  if (typeof stopWebSpeechRecognition === 'function') {
    stopWebSpeechRecognition();
  }
  // Stop microphone stream if active
  if (window.voskMicStream && typeof window.voskMicStream.getTracks === 'function') {
    window.voskMicStream.getTracks().forEach(track => track.stop());
    window.voskMicStream = null;
  }
  isRecording = false;
  recordBtn.textContent = 'Start Recording';
  recordingStatus.textContent = '';
  statusBar.textContent = 'Ready.';
}

// --- Implement transcribeAudioFileWithVosk for upload ---
async function transcribeAudioFileWithVosk(file, transcriptArea, statusBar) {
  await loadVosk();
  statusBar.textContent = 'Transcribing offline...';
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const pcm = audioBuffer.getChannelData(0);
  const int16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, pcm[i] * 32767));
  }
  const recognizer = new Vosk.Recognizer(voskModel, audioBuffer.sampleRate);
  recognizer.acceptWaveform(int16);
  const res = recognizer.finalResult();
  recognizer.free();
  audioCtx.close();
  const text = res.text || '';
  transcriptArea.value = text;
  transcriptArea.dispatchEvent(new Event('input'));
  statusBar.textContent = 'Offline transcription complete.';
  return text;
}

// --- Fix summarize button logic and error handling ---
sendToLLMBtn.addEventListener('click', async () => {
  const transcript = transcriptArea.value.trim();
  if (!transcript) {
    statusBar.textContent = 'No transcript to summarize.';
    return;
  }
  statusBar.textContent = 'Sending transcript to backend for summarization...';
  sendToLLMBtn.disabled = true;
  try {
    const endpoint = 'https://llm.melbinjpaulose.workers.dev/';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript })
    });
    if (!res.ok) throw new Error('Backend error: ' + res.status);
    const data = await res.json();
    let html = '';
    if (data.summary) html += `<p><b>Summary:</b> ${data.summary}</p>`;
    const points = data.keyPoints || data.bullets;
    if (points && Array.isArray(points)) {
      html += '<ul>' + points.map(pt => `<li>${pt}</li>`).join('') + '</ul>';
    }
    summary.innerHTML = html;
    lastSummary = data.summary || '';
    // Save to history
    saveNoteToHistory({
      title: sessionTitleInput.value,
      transcript: transcriptArea.value,
      summary: lastSummary
    });
    statusBar.textContent = 'Summary received and note saved.';
  } catch (e) {
    summary.innerHTML = '';
    statusBar.textContent = 'Error: ' + e.message;
  }
  sendToLLMBtn.disabled = false;
});
