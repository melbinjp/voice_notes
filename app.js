import {
  applyTheme, getStoredTheme, toggleTheme, showToast,
  WaveformVisualizer, RecordingTimer,
  exportNote, saveNote, loadAllNotes, deleteNote, clearAllNotes
} from './app-utils.js';
import transcriptionQueue, { MAX_WORKERS } from './engines/transcription-queue.js';

// ── Boot ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFontSize();
  initCopyrightYear();
  initModals();
  initKeyboardShortcuts();
  initApp();
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

  el.transcript.addEventListener('input', updateWordCount);

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
            state.timedWords = [...state.timedWords, ...result.chunks];
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

  function renderTimedTranscript(words) {
    if (!words?.length) { el.timedTranscript.innerHTML = '<div class="history-empty">No interactive transcript.</div>'; return; }
    el.timedTranscript.innerHTML = '';
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'transcript-word';
      span.textContent = w.word + ' ';
      span.dataset.start = w.start;
      span.dataset.end = w.end;
      span.contentEditable = 'true';

      span.addEventListener('mousedown', (e) => {
        // Only play if not actively editing
        if (document.activeElement !== span) {
            el.audioPlayback.currentTime = w.start;
            el.audioPlayback.play();
        }
      });

      span.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
              e.preventDefault();
              span.blur();
          }
      });

      span.addEventListener('input', (e) => {
        w.word = span.textContent.trim();
        // Update main transcript text as well
        // make sure words array is kept in sync
        el.transcript.value = words.map(word => word.word).filter(w => w.length > 0).join(' ');
        state.transcriptText = el.transcript.value;
      });

      el.timedTranscript.appendChild(span);
    });
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
      return `
        <div class="history-card" role="listitem" data-id="${note.id}">
          <div class="history-card-info">
            <div class="history-card-title" title="Click to load" data-id="${note.id}">${safe(note.title || 'Untitled')}</div>
            <div class="history-card-meta">
              <span class="history-card-date">${date}</span>
              ${note.engine ? `<span class="engine-badge">${note.engine}</span>` : ''}
              <span class="words-badge">${words} words</span>
            </div>
          </div>
          <div class="history-card-actions">
            <button class="btn-ghost load-note-btn" data-id="${note.id}" aria-label="Load note">Load</button>
            <button class="btn-ghost export-note-btn" data-id="${note.id}" aria-label="Export note">⬇️</button>
            <button class="btn-danger delete-note-btn" data-id="${note.id}" aria-label="Delete note">🗑️</button>
          </div>
        </div>`;
    }).join('');

    el.historyGrid.querySelectorAll('.load-note-btn, .history-card-title').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = Number(e.target.dataset.id);
        const note = allNotes.find(n => n.id === id);
        if (!note) return;
        state.currentNote = note;
        el.sessionTitle.value = note.title || '';
        el.transcript.value = note.transcript || '';
        state.transcriptText = note.transcript || '';
        el.summary.innerHTML = note.summary ? `<p>${note.summary.replace(/\n/g, '<br>')}</p>` : '';
        switchTab('text');
        updateWordCount();
        showToast(`Loaded: ${note.title}`, 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    el.historyGrid.querySelectorAll('.delete-note-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = Number(e.target.dataset.id);
        if (!confirm('Delete this note?')) return;
        await deleteNote(id);
        showToast('Note deleted', 'success');
        renderHistory();
      });
    });

    el.historyGrid.querySelectorAll('.export-note-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = Number(e.target.dataset.id);
        const note = allNotes.find(n => n.id === id);
        if (note) exportNote(note, 'md');
      });
    });
  }

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

    el.inboxList.querySelectorAll('.load-inbox-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = Number(e.target.dataset.id);
        const item = transcriptionQueue.getItem(id);
        if (!item || !item.transcript) return;
        el.transcript.value = item.transcript;
        state.transcriptText = item.transcript;
        if (item.chunks?.length) { state.timedWords = item.chunks; renderTimedTranscript(item.chunks); }
        el.sessionTitle.value = item.name || '';
        updateWordCount();
        showToast(`Loaded: ${item.name}`, 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    el.inboxList.querySelectorAll('.remove-inbox-btn').forEach(btn => {
      btn.addEventListener('click', e => transcriptionQueue.remove(Number(e.target.dataset.id)));
    });
  }

  transcriptionQueue.addEventListener('change', e => renderInbox(e.detail));
  transcriptionQueue.addEventListener('itemdone', e => {
    const item = e.detail;
    if (!item.transcript) return;
    saveNote({
      date: new Date(item.doneAt).toISOString(),
      title: item.name || 'Recording',
      transcript: item.transcript,
      summary: '',
      engine: 'whisper',
    }).then(() => { renderHistory(); showToast(`✅ Saved: "${item.name}"`, 'success'); });
  });

  if (el.clearInboxBtn) {
    el.clearInboxBtn.addEventListener('click', () => transcriptionQueue.clearDone());
  }

  // ── TTS (Kokoro-82M) ──────────────────────────────────────────────────
  let ttsWorker = null;
  let ttsAudioCtx = null;
  let ttsSource = null;
  let ttsSpeaking = false;

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
        ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const buf = ttsAudioCtx.createBuffer(1, audio.length, sampleRate);
        buf.copyToChannel(audio, 0);
        ttsSource = ttsAudioCtx.createBufferSource();
        ttsSource.buffer = buf;
        ttsSource.connect(ttsAudioCtx.destination);
        ttsSource.onended = () => { ttsSpeaking = false; el.ttsSpeakBtn.classList.remove('speaking'); el.ttsStopBtn.style.display = 'none'; el.ttsSpeakBtn.disabled = false; };
        ttsSource.start();
        ttsSpeaking = true;
        el.ttsSpeakBtn.classList.add('speaking');
        el.ttsStopBtn.style.display = '';
      } else if (status === 'error') {
        setTTSProgress(false);
        showToast(`TTS error: ${e.data.error}`, 'error');
        el.ttsSpeakBtn.disabled = false;
        el.ttsSpeakIcon.textContent = '🔊';
        el.ttsSpeakLabel.textContent = 'Speak';
        updateKokoroStatus('error');
      }
    };
  }

  el.ttsSpeakBtn.addEventListener('click', () => {
    const text = window.getSelection()?.toString().trim() || el.transcript.value.trim();
    if (!text) { showToast('No text to speak — add a transcript first.', 'warning'); return; }
    initTTSWorker();
    const voice = el.ttsVoiceSelect.value || 'af_heart';
    const speed = parseFloat(el.ttsSpeedSlider.value) || 1.0;
    el.ttsSpeakBtn.disabled = true;
    el.ttsSpeakIcon.textContent = '⏳';
    el.ttsSpeakLabel.textContent = 'Speaking…';
    ttsWorker.postMessage({ action: 'generate', text, voice, speed, id: 'tts-' + Date.now() });
  });

  el.ttsStopBtn.addEventListener('click', () => {
    if (ttsSource) { try { ttsSource.stop(); } catch (_) {} ttsSource = null; }
    ttsSpeaking = false;
    el.ttsSpeakBtn.classList.remove('speaking');
    el.ttsStopBtn.style.display = 'none';
    el.ttsSpeakBtn.disabled = false;
    el.ttsSpeakIcon.textContent = '🔊';
    el.ttsSpeakLabel.textContent = 'Speak';
    setTTSProgress(false);
  });

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

