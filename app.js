import {
  applyTheme, getStoredTheme, toggleTheme, showToast,
  WaveformVisualizer, RecordingTimer,
  exportNote, saveNote, loadAllNotes, deleteNote, clearAllNotes,
  saveAudioBlob, getAudioBlob, deleteAudioBlob, cleanExpiredAudioBlobs
} from './app-utils.js';
import transcriptionQueue, { MAX_WORKERS } from './engines/transcription-queue.js';
import { analyzeAudio } from './engines/audio-analytics.js';

// ── Boot ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFontSize();
  initCopyrightYear();
  initModals();
  initKeyboardShortcuts();
  initApp();
  // Clean up expired audio blob cache (24h TTL)
  cleanExpiredAudioBlobs().then(n => { if (n) console.log(`[AudioCache] Cleaned ${n} expired blob(s)`); }).catch(() => {});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
});

// ── Theme & Font ─────────────────────────────────────────────────────────
function initTheme() {
  applyTheme(getStoredTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  });
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
  document.getElementById('themeSelect').addEventListener('change', e => applyTheme(e.target.value));
}

function initFontSize() {
  const slider = document.getElementById('fontSizeSlider');
  const label = document.getElementById('fontSizeLabel');
  const stored = localStorage.getItem('vn-fontsize') || '100';
  slider.value = stored;
  label.textContent = stored + '%';
  document.documentElement.style.fontSize = (parseInt(stored) / 100) + 'rem';
  slider.addEventListener('input', () => {
    const v = slider.value;
    label.textContent = v + '%';
    document.documentElement.style.fontSize = (parseInt(v) / 100) + 'rem';
    localStorage.setItem('vn-fontsize', v);
  });
}

function initCopyrightYear() {
  document.querySelectorAll('.copyright-year').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
}

// ── Modals ───────────────────────────────────────────────────────────────
function initModals() {
  const pairs = [
    ['settingsBtn', 'settingsModal', 'closeSettingsBtn'],
    ['shortcutsBtn', 'shortcutsModal', 'closeShortcutsBtn'],
  ];
  pairs.forEach(([openId, modalId, closeId]) => {
    const modal = document.getElementById(modalId);
    document.getElementById(openId).addEventListener('click', () => modal.classList.add('open'));
    document.getElementById(closeId).addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
}

// ── Keyboard Shortcuts ───────────────────────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const activeEl = document.activeElement;
    const tag = activeEl.tagName;
    const isContentEditable = activeEl.isContentEditable;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isContentEditable;

    if (e.key === 'Escape') { closeAllModals(); return; }

    if (!typing && e.key === ' ') {
      e.preventDefault();
      document.getElementById('recordBtn').click();
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      document.getElementById('copyTranscriptBtn').click();
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      toggleTheme();
    }
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      document.getElementById('settingsModal').classList.add('open');
    }
  });
}

// ── Main App ─────────────────────────────────────────────────────────────
async function initApp() {
  const el = {
    recordBtn: document.getElementById('recordBtn'),
    recordBtnIcon: document.getElementById('recordBtnIcon'),
    recordBtnLabel: document.getElementById('recordBtnLabel'),
    recordingStatus: document.getElementById('recordingStatus'),
    recordingDot: document.getElementById('recordingDot'),
    sessionTitle: document.getElementById('sessionTitle'),
    transcript: document.getElementById('transcript'),
    timedTranscript: document.getElementById('timedTranscript'),
    tabText: document.getElementById('tabText'),
    tabTimed: document.getElementById('tabTimed'),
    wordCount: document.getElementById('wordCount'),
    copyTranscriptBtn: document.getElementById('copyTranscriptBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportMenu: document.getElementById('exportMenu'),
    exportTxt: document.getElementById('exportTxt'),
    exportMd: document.getElementById('exportMd'),
    exportJson: document.getElementById('exportJson'),
    exportSrt: document.getElementById('exportSrt'),
    identifySpeakersBtn: document.getElementById('identifySpeakersBtn'),
    diarizationProgress: document.getElementById('diarizationProgress'),
    diarizationProgressFill: document.getElementById('diarizationProgressFill'),
    diarizationProgressLabel: document.getElementById('diarizationProgressLabel'),
    sendToLLMBtn: document.getElementById('sendToLLMBtn'),
    summary: document.getElementById('summary'),
    copySummaryBtn: document.getElementById('copySummaryBtn'),
    statusBar: document.getElementById('statusBar'),
    progressContainer: document.getElementById('progressContainer'),
    progressLabel: document.getElementById('progressLabel'),
    progressBar: document.getElementById('progressBar'),
    audioFile: document.getElementById('audioFile'),
    uploadArea: document.getElementById('uploadArea'),
    uploadSection: document.getElementById('uploadSection'),
    transcribeFileBtn: document.getElementById('transcribeFileBtn'),
    fileInfo: document.getElementById('fileInfo'),
    audioPlayback: document.getElementById('audioPlayback'),
    attachAudioWrap: document.getElementById('attachAudioWrap'),
    attachAudioInput: document.getElementById('attachAudioInput'),
    detachAudioBtn: document.getElementById('detachAudioBtn'),
    attachedAudioName: document.getElementById('attachedAudioName'),
    engineSelector: document.getElementById('engineSelector'),
    engineInfo: document.getElementById('engineInfo'),
    languageSelector: document.getElementById('languageSelector'),
    historyGrid: document.getElementById('historyGrid'),
    historySearch: document.getElementById('historySearch'),
    historySort: document.getElementById('historySort'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    preloadModelsBtn: document.getElementById('preloadModelsBtn'),
    whisperReadiness: document.getElementById('whisperReadiness'),
    whisperProgressArea: document.getElementById('whisperProgressArea'),
    whisperProgressFile: document.getElementById('whisperProgressFile'),
    whisperProgressBar: document.getElementById('whisperProgressBar'),
    summarizerReadiness: document.getElementById('summarizerReadiness'),
    summarizerProgressArea: document.getElementById('summarizerProgressArea'),
    summarizerProgressFile: document.getElementById('summarizerProgressFile'),
    summarizerProgressBar: document.getElementById('summarizerProgressBar'),
    // Inbox
    recordingInbox: document.getElementById('recordingInbox'),
    inboxList: document.getElementById('inboxList'),
    inboxWorkerBadge: document.getElementById('inboxWorkerBadge'),
    clearInboxBtn: document.getElementById('clearInboxBtn'),
    bulkQueueCount: document.getElementById('bulkQueueCount'),
    // TTS
    ttsSpeakBtn: document.getElementById('ttsSpeakBtn'),
    ttsSpeakIcon: document.getElementById('ttsSpeakIcon'),
    ttsSpeakLabel: document.getElementById('ttsSpeakLabel'),
    ttsStopBtn: document.getElementById('ttsStopBtn'),
    ttsDownloadBtn: document.getElementById('ttsDownloadBtn'),
    ttsFormatSelect: document.getElementById('ttsFormatSelect'),
    ttsVoiceSelect: document.getElementById('ttsVoiceSelect'),
    ttsSpeedSlider: document.getElementById('ttsSpeedSlider'),
    ttsSpeedValue: document.getElementById('ttsSpeedValue'),
    ttsProgress: document.getElementById('ttsProgress'),
    ttsProgressFill: document.getElementById('ttsProgressFill'),
    ttsProgressLabel: document.getElementById('ttsProgressLabel'),
    // Kokoro model card
    kokoroReadiness: document.getElementById('kokoroReadiness'),
    kokoroProgressArea: document.getElementById('kokoroProgressArea'),
    kokoroProgressFile: document.getElementById('kokoroProgressFile'),
    kokoroProgressBar: document.getElementById('kokoroProgressBar'),
    // Settings
    concurrencySelect: document.getElementById('concurrencySelect'),
    concurrencyLabel: document.getElementById('concurrencyLabel'),
  };

  const state = {
    isRecording: false,
    transcriptText: '',
    timedWords: [],
    selectedFile: null,
    currentNote: null,
    speakerNames: {}, // Maps 'SPEAKER_00' to 'Interviewer'
  };

  const waveform = new WaveformVisualizer('waveformCanvas');
  const timer = new RecordingTimer('recordingTimer');
  let micStream = null;

  const setStatus = msg => { el.statusBar.textContent = msg; };

  const updateProgress = (show, pct = null, label = null) => {
    if (pct === undefined) pct = null;
    el.progressContainer.style.display = show ? 'block' : 'none';

    if (pct === null && show && label && label.toLowerCase().includes('transcribing')) {
        label = "Processing... This might take a few minutes depending on file size.";
    }

    if (label) el.progressLabel.textContent = label;
    if (pct !== null) {
      el.progressBar.style.animation = 'none';
      el.progressBar.style.width = pct + '%';
    } else if (show) {
      el.progressBar.style.width = '100%';
      el.progressBar.style.animation = 'pulse 1.5s infinite';
    }
    if (!show) { el.progressBar.style.animation = 'none'; el.progressBar.style.width = '0%'; }
  };

  const updateModelStatus = (model, status, data = null) => {
    const badge = el[`${model}Readiness`];
    const area = el[`${model}ProgressArea`];
    const file = el[`${model}ProgressFile`];
    const bar = el[`${model}ProgressBar`];
    if (!badge) return;

    if (status === 'loading') {
      badge.textContent = 'Initializing…';
      badge.dataset.state = 'downloading';
    } else if (status === 'progress') {
      area.style.display = 'block';
      badge.textContent = 'Downloading…';
      badge.dataset.state = 'downloading';
      if (data?.file) file.textContent = `File: ${data.file}`;
      if (data?.progress !== null && data?.progress !== undefined) bar.style.width = `${data.progress}%`;
    } else if (status === 'ready') {
      badge.textContent = 'Ready';
      badge.dataset.state = 'ready';
      area.style.display = 'none';
      console.log(`[AI Model] ${model} is ready.`);
    } else if (status === 'error') {
      badge.textContent = 'Error';
      badge.dataset.state = 'error';
      showToast(`${model} model error: ${data}`, 'error');
    }
  };

  const updateWordCount = () => {
    const words = el.transcript.value.trim().split(/\s+/).filter(Boolean).length;
    el.wordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
  };

  el.transcript.addEventListener('input', () => {
    state.transcriptText = el.transcript.value;
    // Rebuild interactive words from text (text view is authoritative when edited directly)
    state.timedWords = wordsFromText(el.transcript.value);
    renderTimedTranscript(state.timedWords);
    updateWordCount();
  });

  // ── Engine Manager ────────────────────────────────────────────────────
  let manager = null;

  // Import engines so they self-register with the module registry
  await Promise.allSettled([
    import('./engines/webspeech-engine.js'),
    import('./engines/whisper-engine.js'),
  ]);
  const { default: ModularRecognitionManager } = await import('./modular-recognition-manager.js');
  manager = new ModularRecognitionManager();
  const engines = await manager.initializeEngines();

  el.engineSelector.innerHTML = engines.map(e =>
    `<option value="${e.id}">${e.icon || ''} ${e.name}</option>`
  ).join('');

  // Select best available engine — try in priority order, skip unavailable
  const priorityOrder = ['whisper', 'webspeech'];
  let engineReady = false;
  for (const eid of priorityOrder) {
    try {
      await manager.setEngine(eid);
      engineReady = true;
      break;
    } catch { /* engine not available, try next */ }
  }
  if (!engineReady) {
    setStatus('No engines available — use Chrome/Edge on HTTPS for Web Speech API');
  }

  updateEngineUI();
  el.recordBtn.disabled = false;

  function updateEngineUI() {
    const info = manager.getCurrentEngineInfo();
    if (!info) return;
    el.engineInfo.innerHTML = `
      <div class="engine-info-name">${info.icon || ''} ${info.name}</div>
      <div class="engine-info-desc">${info.description}</div>
      <div class="engine-features">${info.features.map(f => `<span class="feature-badge">${f.replace(/_/g,' ')}</span>`).join('')}</div>
    `;
    const supportsFile = info.features.includes('file_transcription');
    el.uploadSection.style.display = supportsFile ? 'block' : 'none';
    el.engineSelector.value = info.id;
    populateLanguages(info);
  }

  el.engineSelector.addEventListener('change', async e => {
    try {
      setStatus(`Switching to ${e.target.value}...`);
      await manager.setEngine(e.target.value);
      updateEngineUI();
      
      // If switching to Whisper, proactively start preloading to show progress
      if (e.target.value === 'whisper') {
        manager.preloadEngine('whisper', (status, data) => {
          updateModelStatus('whisper', status === 'loading' ? 'loading' : 'progress', data);
          if (status === 'ready') updateModelStatus('whisper', 'ready');
        }).catch(err => console.error('Switch-time preload failed:', err));
      }
      
      showToast('Engine switched', 'success');
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  });

  // ── Language Selector ─────────────────────────────────────────────────
  function populateLanguages(info) {
    const langs = info.languages || [];
    if (!langs.length) {
      el.languageSelector.innerHTML = '<option value="">No language options</option>';
      el.languageSelector.disabled = true;
      return;
    }
    el.languageSelector.disabled = false;
    el.languageSelector.innerHTML = langs.map(l =>
      `<option value="${l.code}">${l.name}</option>`
    ).join('');
    const stored = localStorage.getItem('vn-lang');
    if (stored && langs.find(l => l.code === stored)) el.languageSelector.value = stored;
  }

  el.languageSelector.addEventListener('change', async e => {
    const lang = e.target.value;
    if (!lang) return;
    localStorage.setItem('vn-lang', lang);
    try {
      await manager.setLanguage(lang);
      showToast(`Language set to ${lang}`, 'info');
    } catch (err) {
      showToast(`Language not supported: ${err.message}`, 'warning');
    }
  });

  // ── Recording ─────────────────────────────────────────────────────────
  // For Whisper: record with MediaRecorder, enqueue blob on stop (non-blocking).
  // For WebSpeech: real-time transcription as before.

  let whisperRecorder = null;
  let whisperChunks   = [];
  let whisperMime     = '';

  function resetRecordBtn() {
    state.isRecording = false;
    el.recordBtnIcon.textContent  = '🎙️';
    el.recordBtnLabel.textContent = 'Start Recording';
    el.recordBtn.classList.remove('recording');
    el.recordBtn.disabled = false;
    el.recordingDot.classList.remove('active');
    el.recordingStatus.textContent = '';
  }

  const startRecording = async () => {
    const engineInfo = manager.getCurrentEngineInfo();
    const isWhisper  = engineInfo && engineInfo.id === 'whisper';

    state.isRecording     = true;
    state.transcriptText  = '';
    state.timedWords      = [];
    el.transcript.value   = '';
    el.timedTranscript.innerHTML = '<div class="history-empty">Recording…</div>';
    el.recordBtnIcon.textContent  = '⏹️';
    el.recordBtnLabel.textContent = 'Stop';
    el.recordBtn.classList.add('recording');
    el.recordingDot.classList.add('active');
    el.recordingStatus.textContent = isWhisper
      ? 'Recording… (queued for transcription on stop)'
      : 'Recording…';
    timer.start();

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      waveform.start(micStream);
    } catch (_) {}

    if (isWhisper) {
      // ── Whisper path: MediaRecorder → blob → queue ──────────────────
      const mimes = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
      whisperMime   = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      whisperChunks = [];
      whisperRecorder = new MediaRecorder(micStream, whisperMime ? { mimeType: whisperMime } : {});
      whisperRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) whisperChunks.push(e.data); };
      whisperRecorder.onstop = () => {
        if (!whisperChunks.length) return;
        const blob = new Blob(whisperChunks, { type: whisperMime || 'audio/webm' });
        whisperChunks = [];
        const sessionName = el.sessionTitle.value.trim()
          || `Recording ${new Date().toLocaleTimeString()}`;
        transcriptionQueue.setLanguage(localStorage.getItem('vn-lang') || 'auto');
        transcriptionQueue.enqueue(blob, sessionName);
        showToast('Recording queued for transcription ⚡', 'info');
      };
      whisperRecorder.start(1000);
    } else {
      // ── WebSpeech path: real-time transcription ──────────────────────
      await manager.start(
        result => {
          if (result.isFinal) state.transcriptText += result.text + ' ';
          el.transcript.value = state.transcriptText + (result.interim || '');
          updateWordCount();
          if (result.chunks) {
            state.timedWords = [...state.timedWords, ...normalizeChunks(result.chunks)];
            renderTimedTranscript(state.timedWords);
          }
        },
        err => { showToast(`Recognition error: ${err}`, 'error'); stopRecording(); },
        () => {}
      );
    }
  };

  const stopRecording = async () => {
    const engineInfo = manager.getCurrentEngineInfo();
    const isWhisper  = engineInfo && engineInfo.id === 'whisper';

    waveform.stop();
    timer.stop();
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

    if (isWhisper) {
      if (whisperRecorder && whisperRecorder.state !== 'inactive') whisperRecorder.stop();
      whisperRecorder = null;
      resetRecordBtn(); // re-enable immediately — transcription runs in background queue
    } else {
      await manager.stop();
      resetRecordBtn();
      setStatus('Stopped');
      updateWordCount();
    }
  };

  el.recordBtn.addEventListener('click', async () => {
    if (state.isRecording) { await stopRecording(); }
    else {
      try { await startRecording(); }
      catch (err) {
        resetRecordBtn();
        timer.stop();
        waveform.stop();
        showToast(`Error: ${err.message}`, 'error');
      }
    }
  });


  // ── Timed Transcript ──────────────────────────────────────────────────
  const switchTab = tab => {
    const isText = tab === 'text';
    el.tabText.classList.toggle('active', isText);
    el.tabTimed.classList.toggle('active', !isText);
    el.tabText.setAttribute('aria-selected', isText);
    el.tabTimed.setAttribute('aria-selected', !isText);
    document.getElementById('transcriptTextView').style.display = isText ? 'block' : 'none';
    el.timedTranscript.style.display = isText ? 'none' : 'block';
  };
  el.tabText.addEventListener('click', () => switchTab('text'));
  el.tabTimed.addEventListener('click', () => switchTab('timed'));
  // Default to interactive/timed view
  switchTab('timed');

  // Normalize chunks from Whisper ({text, timestamp:[s,e]}) or internal ({word, start, end})
  function normalizeChunks(rawChunks) {
    if (!rawChunks?.length) return [];
    
    const mapped = rawChunks.map(c => {
      const word = c.word ?? c.text ?? '';
      let start = c.start ?? 0;
      let end   = c.end   ?? 0;
      if (Array.isArray(c.timestamp)) {
        start = c.timestamp[0] ?? 0;
        end   = c.timestamp[1] ?? start;
      }
      return { word: String(word).trim(), start, end };
    }).filter(c => c.word.length > 0);

    // Deduplication pass for Whisper hallucinations and overlap loops
    const deduplicated = [];
    for (const current of mapped) {
      if (deduplicated.length > 0) {
        const prev = deduplicated[deduplicated.length - 1];
        
        // 1. Exact loop hallucination: Same word, timestamp hasn't moved forward
        if (current.word.toLowerCase() === prev.word.toLowerCase() && current.start <= prev.start + 0.05) {
          continue; // Skip duplicate word stuck in the same time segment
        }
        
        // 2. Phrase loop hallucination: Look back a few words to see if we're repeating a phrase at the same timestamp
        if (current.start < prev.end) { // Overlapping time
            const recentWords = deduplicated.slice(-5).map(w => w.word.toLowerCase());
            if (recentWords.includes(current.word.toLowerCase())) {
                continue; // Skip overlap duplicate
            }
        }
      }
      deduplicated.push(current);
    }
    
    return deduplicated;
  }

  // Build word objects from plain transcript text (no timestamps)
  function wordsFromText(text) {
    if (!text?.trim()) return [];
    return text.trim().split(/\s+/).filter(Boolean).map(w => ({ word: w, start: 0, end: 0 }));
  }

  function renderTimedTranscript(words) {
    if (el.identifySpeakersBtn) el.identifySpeakersBtn.style.display = 'none';

    if (!words?.length) {
      el.timedTranscript.innerHTML = '<div class="history-empty">No interactive transcript available.</div>';
      return;
    }
    el.timedTranscript.innerHTML = '';
    const hasTimestamps = words.some(w => w.start > 0 || w.end > 0);
    
    let currentBlock = null;
    let currentSpeaker = null;

    words.forEach((w, i) => {
      // Create a new block if the speaker changes (or on the first word)
      if (!currentBlock || w.speaker !== currentSpeaker) {
        currentSpeaker = w.speaker;
        currentBlock = document.createElement('div');
        currentBlock.className = 'speaker-block';
        
        if (currentSpeaker) {
          const header = document.createElement('div');
          header.className = 'speaker-header';
          header.style.display = 'flex';
          header.style.alignItems = 'center';
          header.style.gap = '8px';
          header.style.marginBottom = '6px';
          header.style.flexWrap = 'wrap';

          // Editable name
          const nameSpan = document.createElement('span');
          nameSpan.className = 'speaker-name-inline';
          nameSpan.contentEditable = 'true';
          nameSpan.textContent = state.speakerNames[currentSpeaker] || currentSpeaker;
          nameSpan.style.fontWeight = '600';
          nameSpan.style.fontSize = '0.75rem';
          nameSpan.style.color = 'var(--primary)';
          nameSpan.style.padding = '2px 6px';
          nameSpan.style.background = 'var(--primary-transparent)';
          nameSpan.style.borderRadius = '4px';
          nameSpan.style.outline = 'none';
          nameSpan.title = 'Click to edit speaker name';

          const handleNameSave = () => {
            const newName = nameSpan.textContent.trim();
            if (newName && newName !== (state.speakerNames[currentSpeaker] || currentSpeaker)) {
              // Update TTS Aliases
              const oldName = state.speakerNames[currentSpeaker] || currentSpeaker;
              const aliases = loadAliases();
              if (aliases[oldName] !== undefined) {
                  aliases[newName] = aliases[oldName];
                  delete aliases[oldName];
                  saveAliases(aliases);
                  if (typeof renderAliases === 'function') renderAliases();
              }
              state.speakerNames[currentSpeaker] = newName;
              renderTimedTranscript(state.timedWords); // Re-render to cascade name update
            } else {
              nameSpan.textContent = state.speakerNames[currentSpeaker] || currentSpeaker;
            }
          };

          nameSpan.addEventListener('blur', handleNameSave);
          nameSpan.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              nameSpan.blur();
            }
          });

          // Inline Voice Select
          const aliases = loadAliases();
          const currentAliasName = state.speakerNames[currentSpeaker] || currentSpeaker;
          const currentVoice = aliases[currentAliasName] || '';

          const voiceSelect = document.createElement('select');
          voiceSelect.className = 'speaker-voice-select';
          voiceSelect.style.fontSize = '0.7rem';
          voiceSelect.style.padding = '2px 4px';
          voiceSelect.style.borderRadius = '4px';
          voiceSelect.style.border = '1px solid var(--border)';
          voiceSelect.style.background = 'var(--bg-input)';
          voiceSelect.style.color = 'var(--text)';
          voiceSelect.style.cursor = 'pointer';
          voiceSelect.title = 'Assign a TTS voice';

          const voiceOptions = [
            { v: '', l: '(No Voice)' },
            { v: 'af_heart', l: '❤️ Heart' },
            { v: 'af_bella', l: '🌸 Bella' },
            { v: 'af_sarah', l: '☀️ Sarah' },
            { v: 'af_nicole', l: '🎙️ Nicole' },
            { v: 'am_adam', l: '🎤 Adam' },
            { v: 'am_michael', l: '🎧 Michael' },
            { v: 'bf_emma', l: '🫖 Emma' },
            { v: 'bf_isabella', l: '🌹 Isabella' },
            { v: 'bm_george', l: '🎩 George' },
            { v: 'bm_lewis', l: '📻 Lewis' },
          ];

          voiceOptions.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.v;
            el.textContent = opt.l;
            voiceSelect.appendChild(el);
          });
          
          // Handle custom voices that aren't in the default list
          if (currentVoice && !voiceOptions.some(o => o.v === currentVoice)) {
             const customOpt = document.createElement('option');
             customOpt.value = currentVoice;
             customOpt.textContent = `⚙️ ${currentVoice}`;
             voiceSelect.appendChild(customOpt);
          }
          voiceSelect.value = currentVoice;

          voiceSelect.addEventListener('change', () => {
             const newVoice = voiceSelect.value;
             const latestAliases = loadAliases();
             const nameToUpdate = state.speakerNames[currentSpeaker] || currentSpeaker;
             latestAliases[nameToUpdate] = newVoice;
             saveAliases(latestAliases);
             if (typeof renderAliases === 'function') renderAliases();
             showToast(`Voice updated to ${newVoice || 'None'} for ${nameToUpdate}`, 'success');
          });

          header.appendChild(nameSpan);
          header.appendChild(voiceSelect);
          currentBlock.appendChild(header);
        }
        
        el.timedTranscript.appendChild(currentBlock);
      }

      const span = document.createElement('span');
      span.className = 'transcript-word';
      span.textContent = w.word + ' ';
      span.dataset.start = w.start;
      span.dataset.end = w.end;
      span.contentEditable = 'true';

      if (hasTimestamps) {
        span.addEventListener('mousedown', (e) => {
          if (document.activeElement !== span) {
              el.audioPlayback.currentTime = w.start;
              el.audioPlayback.play();
          }
        });
      }

      span.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
              e.preventDefault();
              span.blur();
          }
      });

      span.addEventListener('input', (e) => {
        w.word = span.textContent.trim();
        el.transcript.value = words.map(word => word.word).filter(wx => wx.length > 0).join(' ');
        state.transcriptText = el.transcript.value;
      });

      currentBlock.appendChild(span);
    });

    if (hasTimestamps && el.identifySpeakersBtn) {
        el.identifySpeakersBtn.style.display = ''; // Show button if we have actual word timings
    }
  }

  let manualScrollTimeout = null;
  let isScrollingManually = false;

  const handleManualScroll = () => {
    isScrollingManually = true;
    if (manualScrollTimeout) clearTimeout(manualScrollTimeout);
    manualScrollTimeout = setTimeout(() => {
        isScrollingManually = false;
    }, 3000); // Resume auto-scroll after 3 seconds of no scrolling
  };

  el.timedTranscript.addEventListener('wheel', handleManualScroll, { passive: true });
  el.timedTranscript.addEventListener('touchmove', handleManualScroll, { passive: true });

  el.audioPlayback.addEventListener('timeupdate', () => {
    const t = el.audioPlayback.currentTime;
    el.timedTranscript.querySelectorAll('.transcript-word').forEach(span => {
      const active = t >= parseFloat(span.dataset.start) && t <= parseFloat(span.dataset.end);
      span.classList.toggle('active-word', active);
      if (active && !isScrollingManually) {
          span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });


  // ── Attach/Detach Audio for Interactive Editing ─────────────────────────
  el.attachAudioWrap.style.display = 'flex';

  el.attachAudioInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    el.audioPlayback.src = url;
    el.audioPlayback.style.display = 'block';
    el.detachAudioBtn.style.display = '';
    el.attachedAudioName.textContent = file.name;
    showToast(`Audio attached: ${file.name}`, 'success');
    e.target.value = ''; // allow re-selecting same file
  });

  el.detachAudioBtn.addEventListener('click', () => {
    el.audioPlayback.pause();
    el.audioPlayback.removeAttribute('src');
    el.audioPlayback.style.display = 'none';
    el.detachAudioBtn.style.display = 'none';
    el.attachedAudioName.textContent = '';
    document.getElementById('audioInsightsPanel').style.display = 'none';
    showToast('Audio detached', 'info');
  });

  // ── Audio Insights ─────────────────────────────────────────────────────
  async function analyzeAudioAndRender(audioSrc) {
    const panel = document.getElementById('audioInsightsPanel');
    try {
      // Fetch and decode audio
      let arrayBuffer;
      if (audioSrc instanceof Blob) {
        arrayBuffer = await audioSrc.arrayBuffer();
      } else if (typeof audioSrc === 'string') {
        const resp = await fetch(audioSrc);
        arrayBuffer = await resp.arrayBuffer();
      } else {
        return;
      }
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();
      const samples = decoded.getChannelData(0);
      const wordCount = (el.transcript.value || '').trim().split(/\s+/).filter(Boolean).length;

      const metrics = analyzeAudio(samples, 16000, wordCount);

      // Populate metric cards
      document.getElementById('insightDuration').textContent = metrics.durationFormatted;
      document.getElementById('insightPace').textContent = metrics.wordsPerMinute > 0 ? `${metrics.wordsPerMinute} wpm` : '—';
      document.getElementById('insightPaceLabel').textContent = metrics.wordsPerMinute > 0 ? metrics.paceLabel : '';
      document.getElementById('insightVolume').textContent = `${metrics.avgVolumeDb}%`;
      document.getElementById('insightPeak').textContent = `${metrics.peakDb}%`;
      document.getElementById('insightSilence').textContent = `${metrics.silenceRatio}%`;
      document.getElementById('insightPauses').textContent = metrics.pauseCount;

      // Draw sparkline
      drawSparkline(metrics.sparkline);

      panel.style.display = 'block';
      panel.open = true;
    } catch (err) {
      console.warn('[AudioInsights] Analysis failed:', err);
      panel.style.display = 'none';
    }
  }

  function drawSparkline(data) {
    const canvas = document.getElementById('sparklineCanvas');
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lineColor = isDark ? 'rgba(99,102,241,0.9)' : 'rgba(79,70,229,0.9)';
    const fillColor = isDark ? 'rgba(99,102,241,0.15)' : 'rgba(79,70,229,0.1)';

    ctx.clearRect(0, 0, W, H);

    // Normalize dB array to 0-1.
    // Assuming typical voice range is -50dB (silence) to 0dB (max)
    const normData = data.map(db => Math.max(0, Math.min(1, (db + 50) / 50)));

    // Fill area
    ctx.beginPath();
    ctx.moveTo(0, H);
    normData.forEach((val, i) => {
      const x = (i / (normData.length - 1)) * W;
      const y = H - val * H * 0.9;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Line
    ctx.beginPath();
    normData.forEach((val, i) => {
      const x = (i / (normData.length - 1)) * W;
      const y = H - val * H * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Auto-analyze when audio is attached
  const origAttachChange = el.attachAudioInput.onchange;
  el.attachAudioInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (file) {
      // Small delay to let the audio player load
      setTimeout(() => analyzeAudioAndRender(file), 300);
    }
  });

  // ── File Upload (Bulk) ────────────────────────────────────────────────
  let pendingFiles = [];

  function updateBulkUI() {
    if (pendingFiles.length === 0) {
      el.transcribeFileBtn.disabled = true;
      el.fileInfo.textContent = '';
      el.bulkQueueCount.style.display = 'none';
    } else {
      el.transcribeFileBtn.disabled = false;
      el.fileInfo.textContent = `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} selected`;
      el.bulkQueueCount.textContent = pendingFiles.length + ' files';
      el.bulkQueueCount.style.display = '';
    }
  }

  function addFiles(files) {
    for (const f of files) {
      if (f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|ogg|webm|flac|aac|opus)$/i)) {
        pendingFiles.push(f);
      }
    }
    updateBulkUI();
  }

  el.uploadArea.addEventListener('click', () => el.audioFile.click());
  el.uploadArea.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') el.audioFile.click(); });
  el.audioFile.addEventListener('change', e => { addFiles(Array.from(e.target.files)); e.target.value = ''; });
  el.uploadArea.addEventListener('dragover', e => { e.preventDefault(); el.uploadArea.classList.add('dragover'); });
  el.uploadArea.addEventListener('dragleave', () => el.uploadArea.classList.remove('dragover'));
  el.uploadArea.addEventListener('drop', e => {
    e.preventDefault(); el.uploadArea.classList.remove('dragover');
    addFiles(Array.from(e.dataTransfer.files));
  });

  el.transcribeFileBtn.addEventListener('click', () => {
    if (!pendingFiles.length) return;
    transcriptionQueue.setLanguage(localStorage.getItem('vn-lang') || 'auto');
    for (const f of pendingFiles) {
      transcriptionQueue.enqueue(f, f.name);
    }
    showToast(`${pendingFiles.length} file(s) queued for transcription ⚡`, 'info');
    pendingFiles = [];
    updateBulkUI();
  });

  // ── Copy & Export ─────────────────────────────────────────────────────
  el.copyTranscriptBtn.addEventListener('click', () => {
    if (!el.transcript.value) return;
    navigator.clipboard.writeText(el.transcript.value);
    showToast('Transcript copied!', 'success');
  });

  el.copySummaryBtn.addEventListener('click', () => {
    const txt = el.summary.textContent;
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    showToast('Summary copied!', 'success');
  });

  el.exportBtn.addEventListener('click', () => {
    const open = el.exportMenu.classList.toggle('open');
    el.exportBtn.setAttribute('aria-expanded', open);
    if (open) {
      // Use position:fixed calculated from the button rect to escape backdrop-filter stacking context
      const rect = el.exportBtn.getBoundingClientRect();
      el.exportMenu.style.position = 'fixed';
      el.exportMenu.style.top = (rect.bottom + 6) + 'px';
      // Align right edge of menu to right edge of button
      el.exportMenu.style.right = (window.innerWidth - rect.right) + 'px';
      el.exportMenu.style.left = 'auto';
      el.exportMenu.style.minWidth = Math.max(160, rect.width) + 'px';
    }
  });
  document.addEventListener('click', e => {
    if (!el.exportBtn.contains(e.target) && !el.exportMenu.contains(e.target)) {
      el.exportMenu.classList.remove('open');
      el.exportBtn.setAttribute('aria-expanded', 'false');
    }
  });
  window.addEventListener('scroll', () => {
    if (el.exportMenu.classList.contains('open')) {
      const rect = el.exportBtn.getBoundingClientRect();
      el.exportMenu.style.top = (rect.bottom + 6) + 'px';
      el.exportMenu.style.right = (window.innerWidth - rect.right) + 'px';
    }
  }, { passive: true });

  const makeCurrentNote = () => ({
    id: state.currentNote?.id,
    title: el.sessionTitle.value || 'Untitled Note',
    transcript: el.transcript.value,
    summary: el.summary.textContent,
    date: state.currentNote?.date || new Date().toISOString(),
    engine: manager.getCurrentEngineInfo()?.id || 'unknown',
  });

  el.exportTxt.addEventListener('click', () => { exportNote(makeCurrentNote(), 'txt'); el.exportMenu.classList.remove('open'); });
  el.exportMd.addEventListener('click',  () => { exportNote(makeCurrentNote(), 'md');  el.exportMenu.classList.remove('open'); });
  el.exportJson.addEventListener('click',() => { exportNote(makeCurrentNote(), 'json');el.exportMenu.classList.remove('open'); });
  el.exportSrt.addEventListener('click', () => { exportNote(makeCurrentNote(), 'srt'); el.exportMenu.classList.remove('open'); });

  if (el.identifySpeakersBtn) {
    el.identifySpeakersBtn.addEventListener('click', async () => {
      if (!state.currentNote) { showToast('No interactive transcript available to tag.', 'warning'); return; }
      if (!state.timedWords || state.timedWords.length === 0) {
        showToast('No interactive transcript available to tag.', 'warning');
        return;
      }
      
      // Need audio to diarize
      let audioBlob = null;
      try {
        const cached = await getAudioBlob(state.currentNote.id);
        if (cached && cached.blob) audioBlob = cached.blob;
      } catch (_) {}

      if (!audioBlob) {
        showToast('Original audio is required for speaker identification. Please attach the audio file first.', 'warning', 5000);
        return;
      }

      initDiarizationWorker();
      el.identifySpeakersBtn.disabled = true;
      el.identifySpeakersBtn.textContent = '⏳ Processing...';
      
      // Send Blob to worker via ArrayBuffer
      const buffer = await audioBlob.arrayBuffer();
      diarizationWorker.postMessage({
        action: 'diarize',
        audioData: buffer,
        sampleRate: 16000,
        id: 'diarize-' + Date.now()
      });
    });
  }

  // ── Summarizer ────────────────────────────────────────────────────────
  let summarizerWorker = null;

  el.sendToLLMBtn.addEventListener('click', () => {
    const text = el.transcript.value.trim();
    if (!text) { showToast('No transcript to summarize.', 'warning'); return; }
    el.sendToLLMBtn.disabled = true;
    updateProgress(true, 0, 'Warming up offline summarizer…');

    if (!summarizerWorker) {
      try { summarizerWorker = new Worker('engines/offline-summarizer-worker.js', { type: 'module' }); }
      catch (e) { updateProgress(false); showToast('Could not start summarizer.', 'error'); el.sendToLLMBtn.disabled = false; return; }
    }

    const msgId = Date.now().toString();
    const wordCount = text.split(/\s+/).length;
    const maxLen = Math.min(300, Math.max(50, Math.floor(wordCount * 0.4)));
    const minLen = Math.min(100, Math.max(10, Math.floor(wordCount * 0.1)));

    const handler = e => {
      if (e.data.id !== msgId) return;
      if (e.data.status === 'progress') {
        updateModelStatus('summarizer', 'progress', e.data.data);
        if (e.data.data?.status === 'progress' && e.data.data?.progress !== undefined) updateProgress(true, e.data.data.progress, `Downloading model: ${e.data.data.file}…`);
        else if (e.data.data?.status === 'ready') {
          updateProgress(true, 100, 'Model ready. Summarizing…');
          updateModelStatus('summarizer', 'ready');
        }
      } else if (e.data.status === 'loading') {
        updateModelStatus('summarizer', 'loading');
      } else if (e.data.status === 'processing') {
        updateProgress(true, null, 'Generating summary offline…');
      } else if (e.data.status === 'success') {
        summarizerWorker.removeEventListener('message', handler);
        updateProgress(false);
        el.summary.innerHTML = `<p>${e.data.summary.replace(/\n/g, '<br>')}</p>`;
        el.sendToLLMBtn.disabled = false;
        const engineId = manager.getCurrentEngineInfo()?.id || 'unknown';
        saveNote({
          date: new Date().toISOString(),
          title: el.sessionTitle.value || 'Note ' + new Date().toLocaleTimeString(),
          transcript: text,
          summary: e.data.summary,
          engine: engineId,
        }).then(() => { showToast('Note saved to history!', 'success'); renderHistory(); });
      } else if (e.data.status === 'error') {
        summarizerWorker.removeEventListener('message', handler);
        updateProgress(false);
        showToast(`Summarizer error: ${e.data.error}`, 'error');
        el.sendToLLMBtn.disabled = false;
      }
    };

    summarizerWorker.addEventListener('message', handler);
    summarizerWorker.postMessage({ action: 'summarize', text, max_length: maxLen, min_length: minLen, id: msgId });
  });

  // ── Preload ───────────────────────────────────────────────────────────
  el.preloadModelsBtn.addEventListener('click', () => {
    el.preloadModelsBtn.disabled = true;
    showToast('Starting model preloading...', 'info');

    // Preload Summarizer
    if (!summarizerWorker) {
      summarizerWorker = new Worker('engines/offline-summarizer-worker.js', { type: 'module' });
      summarizerWorker.addEventListener('message', e => {
        if (e.data.status === 'progress') updateModelStatus('summarizer', 'progress', e.data.data);
        if (e.data.status === 'loading') updateModelStatus('summarizer', 'loading');
        if (e.data.status === 'preload_done') updateModelStatus('summarizer', 'ready');
      });
    }
    summarizerWorker.postMessage({ action: 'preload', id: 'preload-' + Date.now() });

    // Preload Whisper (via engine manager)
    manager.preloadEngine('whisper', (status, data) => {
        updateModelStatus('whisper', status === 'loading' ? 'loading' : 'progress', data);
        if (status === 'ready') updateModelStatus('whisper', 'ready');
    }).catch(err => {
        console.warn('Manager preload failed, trying fallback...', err);
        // Direct worker fallback if engine manager fails
        const w = new Worker('engines/whisper-worker.js', { type: 'module' });
        w.onmessage = e => {
            if (e.data.status === 'progress') updateModelStatus('whisper', 'progress', e.data.data);
            if (e.data.status === 'loading') updateModelStatus('whisper', 'loading');
            if (e.data.status === 'preload_done' || e.data.status === 'ready') {
                updateModelStatus('whisper', 'ready');
                w.terminate();
            }
        };
        w.postMessage({ action: 'preload', id: 'preload-whisper' });
    });

    setTimeout(() => { el.preloadModelsBtn.disabled = false; }, 2000);
  });

  // ── History ───────────────────────────────────────────────────────────
  let allNotes = [];

  async function renderHistory() {
    allNotes = await loadAllNotes();
    applyHistoryFilter();
  }

  function applyHistoryFilter() {
    const q = el.historySearch.value.toLowerCase();
    const sort = el.historySort.value;
    let notes = allNotes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.transcript || '').toLowerCase().includes(q)
    );
    if (sort === 'date-desc') notes.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === 'date-asc') notes.sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === 'title-asc') notes.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    renderHistoryCards(notes);
  }

  function renderHistoryCards(notes) {
    if (!notes.length) {
      el.historyGrid.innerHTML = '<div class="history-empty">No notes yet. Record something!</div>';
      return;
    }
    el.historyGrid.innerHTML = notes.map(note => {
      const date = new Date(note.date).toLocaleDateString() + ' ' +
        new Date(note.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const words = note.transcript ? note.transcript.trim().split(/\s+/).filter(Boolean).length : 0;
      const safe = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const srcLabel = note.sourceName ? `<span class="source-badge" title="Source: ${safe(note.sourceName)}">📎 ${safe(note.sourceName)}</span>` : '';
      return `
        <div class="history-card" role="listitem" data-id="${note.id}">
          <div class="history-card-info">
            <div class="history-card-title" title="Click to load" data-id="${note.id}">${safe(note.title || 'Untitled')}</div>
            <div class="history-card-meta">
              <span class="history-card-date">${date}</span>
              ${note.engine ? `<span class="engine-badge">${note.engine}</span>` : ''}
              <span class="words-badge">${words} words</span>
              ${srcLabel}
            </div>
          </div>
          <div class="history-card-actions">
            <button class="btn-ghost load-note-btn" data-id="${note.id}" aria-label="Load note">Load</button>
            <button class="btn-ghost export-note-btn" data-id="${note.id}" aria-label="Export note">⬇️</button>
            <button class="btn-danger delete-note-btn" data-id="${note.id}" aria-label="Delete note">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  // History event delegation — survives re-renders
  el.historyGrid.addEventListener('click', async e => {
    const loadBtn = e.target.closest('.load-note-btn, .history-card-title');
    if (loadBtn) {
      const id = Number(loadBtn.dataset.id);
      const note = allNotes.find(n => n.id === id);
      if (!note) return;
      state.currentNote = note;
      el.sessionTitle.value = note.title || '';
      el.transcript.value = note.transcript || '';
      state.transcriptText = note.transcript || '';
      el.summary.innerHTML = note.summary ? `<p>${note.summary.replace(/\n/g, '<br>')}</p>` : '';
      // Build interactive transcript from chunks or plain text
      const normalized = normalizeChunks(note.chunks);
      state.timedWords = normalized.length ? normalized : wordsFromText(note.transcript);
      renderTimedTranscript(state.timedWords);
      switchTab('timed');
      updateWordCount();
      // Try to auto-attach cached audio blob
      let audioAttached = false;
      if (note.id) {
        try {
          const cached = await getAudioBlob(note.id);
          if (cached && cached.blob) {
            const url = URL.createObjectURL(cached.blob);
            el.audioPlayback.src = url;
            el.audioPlayback.style.display = 'block';
            el.detachAudioBtn.style.display = '';
            el.attachedAudioName.textContent = cached.sourceName || note.sourceName || '';
            audioAttached = true;
            const hoursLeft = Math.round((cached.expiresAt - Date.now()) / (60 * 60 * 1000));
            showToast(`Loaded with audio (cached ${hoursLeft}h left): ${note.title}`, 'info', 4000);
            analyzeAudioAndRender(cached.blob);
          }
        } catch (_) {}
      }
      if (!audioAttached && note.sourceName) {
        el.attachedAudioName.textContent = `📎 ${note.sourceName}`;
        showToast(`Loaded: ${note.title} — attach "${note.sourceName}" for interactive editing`, 'info', 5000);
      } else if (!audioAttached) {
        showToast(`Loaded: ${note.title}`, 'info');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const deleteBtn = e.target.closest('.delete-note-btn');
    if (deleteBtn) {
      const id = Number(deleteBtn.dataset.id);
      if (!confirm('Delete this note?')) return;
      await deleteNote(id);
      showToast('Note deleted', 'success');
      renderHistory();
      return;
    }
    const exportBtn = e.target.closest('.export-note-btn');
    if (exportBtn) {
      const id = Number(exportBtn.dataset.id);
      const note = allNotes.find(n => n.id === id);
      if (note) exportNote(note, 'md');
    }
  });

  el.historySearch.addEventListener('input', applyHistoryFilter);
  el.historySort.addEventListener('change', applyHistoryFilter);
  el.clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Delete ALL notes? This cannot be undone.')) return;
    await clearAllNotes();
    showToast('All notes cleared', 'success');
    renderHistory();
  });

  renderHistory();

  // ── Concurrency Setting ───────────────────────────────────────────────
  if (el.concurrencySelect && el.concurrencyLabel) {
    const stored = parseInt(localStorage.getItem('vn-max-workers') || MAX_WORKERS, 10);
    el.concurrencySelect.value = String(Math.min(3, Math.max(1, stored)));
    el.concurrencyLabel.textContent = el.concurrencySelect.value;
    el.concurrencySelect.addEventListener('change', () => {
      localStorage.setItem('vn-max-workers', el.concurrencySelect.value);
      el.concurrencyLabel.textContent = el.concurrencySelect.value;
      showToast('Concurrency updated — takes effect on next queue run', 'info');
    });
  }

  // ── Recording Inbox (Queue UI) ────────────────────────────────────────
  function renderInbox(items) {
    const hasItems = items.length > 0;
    el.recordingInbox.style.display = hasItems ? 'block' : 'none';
    const active = items.filter(i => ['queued','decoding','loading','transcribing'].includes(i.status)).length;
    el.inboxWorkerBadge.textContent = `${Math.min(active, MAX_WORKERS)}/${MAX_WORKERS} workers`;

    if (!hasItems) { el.inboxList.innerHTML = ''; return; }

    el.inboxList.innerHTML = items.slice().reverse().map(item => {
      const ago = item.doneAt
        ? `Done ${Math.round((Date.now() - item.doneAt) / 1000)}s ago`
        : item.status === 'queued' ? 'Waiting…'
        : item.progressLabel || item.status;
      const pct = item.progress || 0;
      const isActive = ['decoding','loading','transcribing'].includes(item.status);
      return `<div class="inbox-item" data-id="${item.id}">
        <div>
          <div class="inbox-item-name">${item.name}</div>
          <div class="inbox-item-meta">${ago}</div>
        </div>
        <div class="inbox-item-actions">
          <span class="inbox-status-badge" data-status="${item.status}">${item.status}</span>
          ${item.status === 'done' ? `<button class="btn-ghost load-inbox-btn" data-id="${item.id}">Load</button>` : ''}
          ${item.status !== 'decoding' && item.status !== 'transcribing' && item.status !== 'loading'
            ? `<button class="btn-danger remove-inbox-btn" data-id="${item.id}">🗑️</button>` : ''}
        </div>
        ${isActive ? `<div class="inbox-progress-wrap">
          <div class="inbox-progress-label">${item.progressLabel || '…'}</div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>` : ''}
      </div>`;
    }).join('');
  }

  // Event delegation for inbox buttons (survives re-renders)
  el.inboxList.addEventListener('click', e => {
    const loadBtn = e.target.closest('.load-inbox-btn');
    if (loadBtn) {
      const id = Number(loadBtn.dataset.id);
      const item = transcriptionQueue.getItem(id);
      if (!item || !item.transcript) { showToast('No transcription could be generated for this file.', 'warning'); return; }
      el.transcript.value = item.transcript;
      state.transcriptText = item.transcript;
      const normalized = normalizeChunks(item.chunks);
      state.timedWords = normalized.length ? normalized : wordsFromText(item.transcript);
      renderTimedTranscript(state.timedWords);
      switchTab('timed');
      el.sessionTitle.value = item.name || '';
      
      // Setup current note state so features like Diarization and Export work natively
      state.currentNote = {
        id: item.noteId || null,
        title: item.name || '',
        transcript: item.transcript,
        chunks: item.chunks || [],
        summary: '',
        date: new Date(item.doneAt).toISOString(),
        engine: 'whisper'
      };

      // If the queue item has an audio blob, make it available for interactive playback
      if (item.blob) {
        const audioUrl = URL.createObjectURL(item.blob);
        el.audioPlayback.src = audioUrl;
        el.audioPlayback.style.display = 'block';
        analyzeAudioAndRender(item.blob);
      }
      updateWordCount();
      showToast(`Loaded: ${item.name}`, 'info');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const removeBtn = e.target.closest('.remove-inbox-btn');
    if (removeBtn) {
      transcriptionQueue.remove(Number(removeBtn.dataset.id));
    }
  });

  // Update Whisper model status when queue workers report progress
  transcriptionQueue.addEventListener('change', e => {
    const items = e.detail;
    renderInbox(items);
    // If any item is in 'loading' state, update whisper badge
    const loading = items.find(i => i.status === 'loading');
    if (loading) updateModelStatus('whisper', 'progress', { file: 'whisper-tiny', progress: loading.progress });
    // If any item just reached 'transcribing', whisper model is ready
    const transcribing = items.find(i => i.status === 'transcribing');
    if (transcribing) updateModelStatus('whisper', 'ready');
    // If any item is done, whisper model was ready
    const done = items.find(i => i.status === 'done');
    if (done) updateModelStatus('whisper', 'ready');
  });

  transcriptionQueue.addEventListener('itemdone', async e => {
    const item = e.detail;
    if (!item.transcript || !item.transcript.trim()) {
      showToast(`⚠️ No transcription could be generated for "${item.name}". The audio may be silent, too short, or in an unsupported format.`, 'warning', 6000);
      return;
    }
    const noteId = await saveNote({
      date: new Date(item.doneAt).toISOString(),
      title: item.name || 'Recording',
      transcript: item.transcript,
      chunks: item.chunks || [],
      summary: '',
      engine: 'whisper',
      sourceName: item.name || '',
    });
    item.noteId = noteId; // Attach the saved ID back to the queue item
    // Cache audio blob temporarily (24h) for interactive playback
    if (item.blob && noteId) {
      try { await saveAudioBlob(noteId, item.blob, item.name || ''); }
      catch (err) { console.warn('Could not cache audio blob:', err); }
    }
    renderHistory();
    showToast(`✅ Saved: "${item.name}"`, 'success');
  });

  if (el.clearInboxBtn) {
    el.clearInboxBtn.addEventListener('click', () => transcriptionQueue.clearDone());
  }

  // ── Diarization (Pyannote) ──────────────────────────────────────────────
  let diarizationWorker = null;

  function setDiarizationProgress(show, label = '', pct = null) {
    el.diarizationProgress.style.display = show ? 'flex' : 'none';
    if (label) el.diarizationProgressLabel.textContent = label;
    if (pct != null) { el.diarizationProgressFill.style.width = pct + '%'; el.diarizationProgressFill.style.animation = 'none'; }
    else if (show) { el.diarizationProgressFill.style.width = '100%'; el.diarizationProgressFill.style.animation = 'pulse 1.5s infinite'; }
  }

  function initDiarizationWorker() {
    if (diarizationWorker) return;
    diarizationWorker = new Worker('engines/diarization-worker.js', { type: 'module' });
    diarizationWorker.onmessage = (e) => {
      const { status, data, segments, error } = e.data;
      if (status === 'loading') {
        setDiarizationProgress(true, 'Initializing Pyannote…');
      } else if (status === 'progress') {
        setDiarizationProgress(true, `Downloading: ${data.file || 'model'} (${Math.round(data.progress || 0)}%)`, data.progress);
      } else if (status === 'analyzing') {
        setDiarizationProgress(true, 'Analyzing speakers...');
      } else if (status === 'success') {
        setDiarizationProgress(false);
        applyDiarizationSegments(segments);
        el.identifySpeakersBtn.disabled = false;
        el.identifySpeakersBtn.textContent = '👥 Identify Speakers';
      } else if (status === 'error') {
        setDiarizationProgress(false);
        showToast(`Diarization error: ${error}`, 'error');
        el.identifySpeakersBtn.disabled = false;
        el.identifySpeakersBtn.textContent = '👥 Identify Speakers';
      }
    };
  }

  function applyDiarizationSegments(segments) {
    if (!segments || segments.length === 0) {
      showToast('No speakers could be identified.', 'warning');
      return;
    }

    let aliasesModified = false;
    const aliases = loadAliases();

    let lastSpeaker = null;

    // Map each word in state.timedWords to a speaker segment
    state.timedWords.forEach(word => {
      // Find the segment that overlaps most with this word's center time
      const centerTime = word.start + ((word.end - word.start) / 2);
      const matchingSeg = segments.find(s => centerTime >= s.start && centerTime <= s.end);
      
      if (matchingSeg) {
        word.speaker = matchingSeg.id;
        lastSpeaker = matchingSeg.id;
        // Auto-initialize speaker name if not exists
        if (!state.speakerNames[matchingSeg.id]) {
          state.speakerNames[matchingSeg.id] = matchingSeg.id; // e.g. 'SPEAKER_00'
        }
        // Auto-populate the TTS Aliases so user can quickly map a voice to it!
        if (aliases[matchingSeg.id] === undefined) {
          aliases[matchingSeg.id] = '';
          aliasesModified = true;
        }
      } else if (lastSpeaker) {
        // If there is a tiny gap between Pyannote segments, assign to the last known speaker
        word.speaker = lastSpeaker;
      } else {
        word.speaker = 'UNKNOWN';
        if (!state.speakerNames['UNKNOWN']) state.speakerNames['UNKNOWN'] = 'UNKNOWN';
      }
    });

    if (aliasesModified) {
      saveAliases(aliases);
      if (typeof renderAliases === 'function') renderAliases();
    }

    // Re-render the interactive transcript with speaker blocks
    renderTimedTranscript(state.timedWords);
    showToast('✅ Speakers identified!', 'success');
  }

  // ── TTS (Kokoro-82M) ──────────────────────────────────────────────────
  let ttsWorker = null;
  let lastTTSAudio = null;  // { audio: Float32Array, sampleRate: number }

  // Convert Float32Array PCM to a WAV Blob for native <audio> playback
  function float32ToWavBlob(samples, sampleRate) {
    const numCh = 1, bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const dataLen = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLen);
    const view = new DataView(buffer);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataLen, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numCh * bytesPerSample, true);
    view.setUint16(32, numCh * bytesPerSample, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataLen, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function resetTTSBtn() {
    el.ttsSpeakBtn.classList.remove('speaking');
    el.ttsSpeakBtn.disabled = false;
    el.ttsSpeakIcon.textContent = '🔊';
    el.ttsSpeakLabel.textContent = 'Speak';
    el.ttsStopBtn.style.display = 'none';
  }

  function updateKokoroStatus(status, data) {
    if (!el.kokoroReadiness) return;
    if (status === 'loading') {
      el.kokoroReadiness.textContent = 'Initializing…'; el.kokoroReadiness.dataset.state = 'downloading';
    } else if (status === 'progress') {
      el.kokoroProgressArea.style.display = 'block';
      el.kokoroReadiness.textContent = 'Downloading…'; el.kokoroReadiness.dataset.state = 'downloading';
      if (data?.file) el.kokoroProgressFile.textContent = `File: ${data.file}`;
      if (data?.progress != null) el.kokoroProgressBar.style.width = `${data.progress}%`;
    } else if (status === 'ready') {
      el.kokoroReadiness.textContent = 'Ready'; el.kokoroReadiness.dataset.state = 'ready';
      el.kokoroProgressArea.style.display = 'none';
    } else if (status === 'error') {
      el.kokoroReadiness.textContent = 'Error'; el.kokoroReadiness.dataset.state = 'error';
    }
  }

  function setTTSProgress(show, label = '', pct = null) {
    el.ttsProgress.style.display = show ? 'flex' : 'none';
    if (label) el.ttsProgressLabel.textContent = label;
    if (pct != null) { el.ttsProgressFill.style.width = pct + '%'; el.ttsProgressFill.style.animation = 'none'; }
    else if (show) { el.ttsProgressFill.style.width = '100%'; el.ttsProgressFill.style.animation = 'pulse 1.5s infinite'; }
  }

  function encodeWAV(pcm, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.length * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < pcm.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function downloadTTSAudio() {
    if (!lastTTSAudio) { showToast('No audio to download — generate speech first.', 'warning'); return; }
    
    // Always download as WAV since we don't have LAME mp3 encoder bundled reliably
    const blob = encodeWAV(lastTTSAudio.audio, lastTTSAudio.sampleRate);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-notes-tts-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function initTTSWorker() {
    if (ttsWorker) return;
    ttsWorker = new Worker('engines/tts-worker.js', { type: 'module' });
    ttsWorker.postMessage({ action: 'list_voices', id: 'voices' });
    ttsWorker.onmessage = e => {
      const { status, id } = e.data;
      if (status === 'voices') {
        el.ttsVoiceSelect.innerHTML = e.data.voices.map(v =>
          `<option value="${v.id}">${v.name}</option>`
        ).join('');
        return;
      }
      if (status === 'loading') { setTTSProgress(true, 'Loading Kokoro model…'); updateKokoroStatus('loading'); }
      else if (status === 'progress') {
        const d = e.data.data || {};
        setTTSProgress(true, `Downloading: ${d.file || 'kokoro'} (${Math.round(d.progress || 0)}%)`, d.progress);
        updateKokoroStatus('progress', d);
      } else if (status === 'ready') { setTTSProgress(false); updateKokoroStatus('ready'); }
      else if (status === 'generating') { setTTSProgress(true, 'Generating speech…'); }
      else if (status === 'chunk') {
        setTTSProgress(true, `Generating… ${e.data.current}/${e.data.total}`, Math.round((e.data.current / e.data.total) * 100));
      } else if (status === 'success') {
        setTTSProgress(false);
        const { audio, sampleRate } = e.data;

        // Store for download
        lastTTSAudio = { audio: new Float32Array(audio), sampleRate };
        el.ttsDownloadBtn.style.display = '';
        el.ttsFormatSelect.style.display = '';

        // Create WAV blob and load into native <audio> player (no auto-play)
        const wavBlob = float32ToWavBlob(audio, sampleRate);
        const wavUrl = URL.createObjectURL(wavBlob);
        el.audioPlayback.src = wavUrl;
        el.audioPlayback.style.display = 'block';
        resetTTSBtn();
        showToast('🔊 Speech ready — press play on the audio player', 'success', 3000);
      } else if (status === 'error') {
        setTTSProgress(false);
        showToast(`TTS error: ${e.data.error}`, 'error');
        resetTTSBtn();
        updateKokoroStatus('error');
      }
    };
  }

  // ── Custom Narrator Aliases ─────────────────────────────────────────────
  const ALIAS_KEY = 'vn-tts-aliases';
  function loadAliases() {
    try { return JSON.parse(localStorage.getItem(ALIAS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveAliases(aliases) { localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases)); }

  const aliasEditor = document.getElementById('ttsAliasEditor');
  const aliasNameInput = document.getElementById('ttsAliasName');
  const aliasVoiceInput = document.getElementById('ttsAliasVoice');
  const aliasAddBtn = document.getElementById('ttsAliasAddBtn');
  const exampleScript = document.getElementById('ttsExampleScript');

  function renderAliases() {
    const aliases = loadAliases();
    const entries = Object.entries(aliases);
    if (!entries.length) {
      aliasEditor.innerHTML = '<div style="font-size:0.7rem; opacity:0.6; padding:2px 0;">No custom aliases yet.</div>';
      return;
    }
    aliasEditor.innerHTML = entries.map(([name, voice]) =>
      `<div style="display:flex; gap:6px; align-items:center; font-size:0.72rem;">
        <span style="flex:1; font-weight:600;">[${name}]</span>
        <span style="flex:1; opacity:0.8; ${!voice ? 'color:var(--warning);' : ''}">→ ${voice || '(No voice assigned)'}</span>
        <button class="btn-ghost alias-remove-btn" data-alias="${name}" style="padding:2px 8px; font-size:0.68rem; color:var(--danger);">✕</button>
      </div>`
    ).join('');
    aliasEditor.querySelectorAll('.alias-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const aliases = loadAliases();
        delete aliases[btn.dataset.alias];
        saveAliases(aliases);
        renderAliases();
        showToast(`Alias "${btn.dataset.alias}" removed`, 'info');
      });
    });
  }

  const aliasVoiceSelect = document.getElementById('ttsAliasVoiceSelect');

  aliasVoiceSelect?.addEventListener('change', () => {
    if (aliasVoiceSelect.value === 'custom') {
      aliasVoiceInput.style.display = 'block';
    } else {
      aliasVoiceInput.style.display = 'none';
      aliasVoiceInput.value = '';
    }
  });

  aliasAddBtn.addEventListener('click', () => {
    const name = aliasNameInput.value.trim();
    let voice = aliasVoiceSelect ? aliasVoiceSelect.value : aliasVoiceInput.value.trim();
    if (voice === 'custom' || !voice) {
      voice = aliasVoiceInput.value.trim();
    }

    if (!name) { showToast('Enter an alias name.', 'warning'); return; }
    const aliases = loadAliases();
    aliases[name] = voice || ''; // Allow saving a blank voice so the user can see it in the list
    saveAliases(aliases);
    aliasNameInput.value = '';
    if (aliasVoiceSelect) aliasVoiceSelect.value = 'af_heart';
    aliasVoiceInput.value = '';
    aliasVoiceInput.style.display = 'none';
    renderAliases();
    showToast(`Alias "${name}" updated`, 'success');
  });

  // Click example script to copy
  if (exampleScript) {
    exampleScript.addEventListener('click', () => {
      navigator.clipboard.writeText(exampleScript.textContent);
      showToast('Example script copied!', 'success');
    });
  }

  renderAliases();

  el.ttsSpeakBtn.addEventListener('click', () => {
    // Get text: prefer explicit user selection (if substantial), else use synced transcript state
    const selection = window.getSelection()?.toString().trim();
    const text = (selection && selection.length > 5) ? selection : (state.transcriptText || el.transcript.value).trim();
    if (!text) { showToast('No text to speak — add a transcript first.', 'warning'); return; }
    initTTSWorker();
    const voice = el.ttsVoiceSelect.value || 'af_heart';
    const speed = parseFloat(el.ttsSpeedSlider.value) || 1.0;
    const aliases = loadAliases();
    el.ttsSpeakBtn.disabled = true;
    el.ttsSpeakIcon.textContent = '⏳';
    el.ttsSpeakLabel.textContent = 'Generating…';
    el.ttsStopBtn.style.display = ''; // Show stop button during generation
    ttsWorker.postMessage({ action: 'generate', text, voice, speed, aliases, id: 'tts-' + Date.now() });
  });

  el.ttsStopBtn.addEventListener('click', () => {
    // Stop audio playback only — don't kill the worker
    el.audioPlayback.pause();
    resetTTSBtn();
    setTTSProgress(false);
  });

  el.ttsDownloadBtn.addEventListener('click', downloadTTSAudio);

  el.ttsSpeedSlider.addEventListener('input', () => {
    el.ttsSpeedValue.textContent = parseFloat(el.ttsSpeedSlider.value).toFixed(1) + '×';
  });

  // Ctrl+Shift+S → speak
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); el.ttsSpeakBtn.click(); }
  });

  // "Preload All" also warms up the Kokoro TTS model
  el.preloadModelsBtn.addEventListener('click', () => {
    initTTSWorker();
    ttsWorker.postMessage({ action: 'preload', id: 'kokoro-preload-' + Date.now() });
  });
}

