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

// Helper to start the correct mode
let activeRecognizer = null; // 'online' or 'offline'
let pendingRecognizer = null; // 'online' or 'offline'

// Helper to compare if two texts are similar (by words, ignoring case and punctuation)
function areTranscriptsSimilar(a, b) {
  if (!a || !b) return false;
  const clean = s => s.trim().replace(/[^\w\s]/g, '').toLowerCase();
  const aWords = clean(a).split(/\s+/).slice(-10).join(' ');
  const bWords = clean(b).split(/\s+/).slice(0, 10).join(' ');
  return aWords && bWords && aWords === bWords;
}

// Helper to compare if two texts have at least 2-5 similar words (for overlap switching)
function areTranscriptsSimilarFewWords(a, b) {
  if (!a || !b) return false;
  const clean = s => s.trim().replace(/[^\w\s]/g, '').toLowerCase();
  const aWords = clean(a).split(/\s+/);
  const bWords = clean(b).split(/\s+/);
  let matchCount = 0;
  for (let i = 0; i < Math.min(5, aWords.length, bWords.length); i++) {
    if (aWords[aWords.length - 1 - i] === bWords[i]) matchCount++;
    else break;
  }
  return matchCount >= 2; // 2 to 5 similar words
}

// Deduplication: only dedupe if the new text's first 30 characters overlap with the end of the current transcript
// Always add a space before appending new model's transcript after switch
function dedupeAppendWithSpace(text, isSwitch) {
  if (!text) return;
  if (isSwitch && transcriptText && !transcriptText.endsWith(' ')) transcriptText += ' ';
  // Check for overlap in the last 30 characters
  const overlapWindow = 30;
  const endOfTranscript = transcriptText.slice(-overlapWindow);
  const startOfText = text.slice(0, overlapWindow);
  if (endOfTranscript && startOfText && endOfTranscript.includes(startOfText.trim())) {
    let deduped = text;
    for (let i = overlapWindow; i > 0; i--) {
      if (endOfTranscript.endsWith(text.slice(0, i))) {
        deduped = text.slice(i);
        break;
      }
    }
    transcriptText += deduped;
  } else {
    transcriptText += text;
  }
  transcriptArea.value = transcriptText;
}

// Unified overlap switch handler for both directions (improved symmetry and handler signatures)
async function handleRecognizerOverlap({
  prevType, newType, startPrev, stopPrev, startNew, stopNew, dedupeAppend, transcriptArea, recordingStatus, statusBar
}) {
  let switchPending = false;
  let lastPrevModelText = '';
  let lastNewModelText = '';
  let prevModelStopped = false;
  let newModelStarted = false;
  let newModelTranscript = '';

  // Handler for previous recognizer
  let prevHandler;
  if (prevType === 'online') {
    prevHandler = {
      transcriptArea,
      recordingStatus,
      statusBar,
      transcriptText,
      onResult: (text, isFinal) => {
        if (isFinal) {
          dedupeAppend(text + ' ', false);
          lastPrevModelText = text;
        } else {
          transcriptArea.value = transcriptText + text;
        }
        transcriptArea.dispatchEvent(new Event('input'));
      },
      onError: () => {},
      onEnd: () => {}
    };
  } else {
    prevHandler = (text, isFinal) => {
      if (isFinal) {
        dedupeAppend(text + ' ', false);
        lastPrevModelText = text;
      } else {
        transcriptArea.value = transcriptText + text;
      }
      transcriptArea.dispatchEvent(new Event('input'));
    };
  }

  // Handler for new recognizer (object for webspeech, callback for vosk)
  let newHandler;
  if (newType === 'online') {
    newHandler = {
      transcriptArea,
      recordingStatus,
      statusBar,
      transcriptText,
      onResult: (text, isFinal) => {
        if (!newModelStarted && isFinal) newModelStarted = true;
        if (isFinal) {
          dedupeAppend(text, switchPending);
          lastNewModelText = text;
          newModelTranscript += text;
          if (!switchPending && areTranscriptsSimilarFewWords(lastPrevModelText, lastNewModelText)) {
            switchPending = true;
            setTimeout(() => {
              if (!prevModelStopped) {
                stopPrev();
                activeRecognizer = newType;
                pendingRecognizer = null;
                prevModelStopped = true;
                if (transcriptText && !transcriptText.endsWith(' ')) transcriptText += ' ';
              }
            }, 3000);
          }
        }
      },
      onError: (event) => {},
      onEnd: () => {
        if (pendingRecognizer === prevType && isRecording) {
          stopPrev();
          activeRecognizer = newType;
          pendingRecognizer = null;
          recordingStatus.textContent = 'Recording...';
          statusBar.textContent = `Transcribing ${newType}...`;
          if (!window.recognition || window.recognition.state !== 'running') {
            startNew(newHandler);
          }
        }
      }
    };
  } else {
    newHandler = (text, isFinal) => {
      if (!newModelStarted && isFinal) newModelStarted = true;
      if (isFinal) {
        dedupeAppend(text, switchPending);
        lastNewModelText = text;
        newModelTranscript += text;
        if (!switchPending && areTranscriptsSimilarFewWords(lastPrevModelText, lastNewModelText)) {
          switchPending = true;
          setTimeout(() => {
            if (!prevModelStopped) {
              stopPrev();
              activeRecognizer = newType;
              pendingRecognizer = null;
              prevModelStopped = true;
              if (transcriptText && !transcriptText.endsWith(' ')) transcriptText += ' ';
            }
          }, 3000);
        }
      } else {
        transcriptArea.value = transcriptText + text;
      }
      transcriptArea.dispatchEvent(new Event('input'));
    };
  }

  // Start previous recognizer
  if (prevType === 'online') {
    startPrev(prevHandler);
  } else {
    await startPrev(prevHandler);
  }
  recordingStatus.textContent = 'Recording...';
  statusBar.textContent = `Transcribing ${prevType}...`;
  pendingRecognizer = prevType;

  // Start new recognizer in parallel
  if (newType === 'online') {
    startNew(newHandler);
  } else {
    await startNew(newHandler);
  }

  setTimeout(() => {
    if (!switchPending) {
      stopPrev();
      activeRecognizer = newType;
      pendingRecognizer = null;
      prevModelStopped = true;
      if (transcriptText && !transcriptText.endsWith(' ')) transcriptText += ' ';
    }
  }, 10000);
}

async function startTranscription(overlap = false) {
  if (!isRecording) return;
  transcriptText = transcriptArea.value || '';

  if (overlap) {
    if (!modeSwitch.checked) {
      // Switching to offline (online -> offline)
      await handleRecognizerOverlap({
        prevType: 'online',
        newType: 'offline',
        startPrev: (cb) => startWebSpeechRecognition({
          transcriptArea,
          recordingStatus,
          statusBar,
          transcriptText,
          onResult: cb,
          onError: () => {},
          onEnd: () => {}
        }),
        stopPrev: stopWebSpeechRecognition,
        startNew: (cb) => loadVosk().then(() => startVoskRecognition(cb)),
        stopNew: stopVoskRecognition,
        dedupeAppend: dedupeAppendWithSpace,
        transcriptArea,
        recordingStatus,
        statusBar
      });
    } else {
      // Switching to online (offline -> online)
      await handleRecognizerOverlap({
        prevType: 'offline',
        newType: 'online',
        startPrev: (cb) => loadVosk().then(() => startVoskRecognition(cb)),
        stopPrev: stopVoskRecognition,
        startNew: (cb) => startWebSpeechRecognition({
          transcriptArea,
          recordingStatus,
          statusBar,
          transcriptText,
          onResult: cb,
          onError: () => {},
          onEnd: () => {}
        }),
        stopNew: stopWebSpeechRecognition,
        dedupeAppend: dedupeAppendWithSpace,
        transcriptArea,
        recordingStatus,
        statusBar
      });
    }
    return;
  }

  // Non-overlap (single recognizer) mode
  if (!modeSwitch.checked) {
    // Offline only
    try {
      await loadVosk();
      await startVoskRecognition((text, isFinal) => {
        if (isFinal) {
          dedupeAppendWithSpace(text + ' ', false);
        } else {
          transcriptArea.value = transcriptText + text;
        }
        transcriptArea.dispatchEvent(new Event('input'));
      });
      recordingStatus.textContent = 'Recording...';
      statusBar.textContent = 'Transcribing offline...';
      activeRecognizer = 'offline';
    } catch (err) {
      modeSwitch.checked = true;
      statusBar.textContent = 'Offline mode failed, switched to Online.';
      startTranscription();
    }
  } else {
    // Online only
    try {
      startWebSpeechRecognition({
        transcriptArea,
        recordingStatus,
        statusBar,
        transcriptText,
        onResult: (text, isFinal) => {
          if (isFinal) {
            dedupeAppendWithSpace(text, false);
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
          if (isRecording && activeRecognizer === 'online' && !pendingRecognizer) {
            if (window.recognition && typeof window.recognition.start === 'function') {
              try {
                window.recognition.start();
                return;
              } catch (e) {}
            }
            if (!window._webspeech_restart_pending) {
              window._webspeech_restart_pending = true;
              setTimeout(() => {
                window._webspeech_restart_pending = false;
                if (isRecording && activeRecognizer === 'online' && !pendingRecognizer) {
                  try {
                    startWebSpeechRecognition({
                      transcriptArea,
                      recordingStatus,
                      statusBar,
                      transcriptText,
                      onResult: (text, isFinal) => {
                        if (isFinal) {
                          dedupeAppendWithSpace(text, false);
                        } else {
                          transcriptArea.value = text;
                        }
                        transcriptArea.dispatchEvent(new Event('input'));
                      },
                      onError: (event) => {
                        statusBar.textContent = 'Speech recognition error: ' + event.error;
                        stopRecording();
                      },
                      onEnd: arguments.callee
                    });
                  } catch (e) {
                    statusBar.textContent = 'Speech recognition restart failed: ' + e.message;
                    stopRecording();
                  }
                }
              }, 500);
            }
            return;
          }
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
      activeRecognizer = 'online';
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
    await startTranscription(true); // overlap=true
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
  // No need to stop window.voskMicStream (handled in vosk-integration.js)
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
