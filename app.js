import {
  applyTheme, getStoredTheme, toggleTheme, showToast,
  WaveformVisualizer, RecordingTimer,
  exportNote, saveNote, loadAllNotes, deleteNote, updateNote, clearAllNotes
} from './app-utils.js';

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
    const tag = document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

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
    el.progressContainer.style.display = show ? 'block' : 'none';
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
      if (data?.progress !== null) bar.style.width = `${data.progress}%`;
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
  const priorityOrder = ['webspeech', 'whisper'];
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

  const startRecording = async () => {
    state.isRecording = true;
    state.transcriptText = '';
    state.timedWords = [];
    el.transcript.value = '';
    el.timedTranscript.innerHTML = '<div class="history-empty">Recording…</div>';
    el.recordBtnIcon.textContent = '⏹️';
    el.recordBtnLabel.textContent = 'Stop';
    el.recordBtn.classList.add('recording');
    el.recordingDot.classList.add('active');
    el.recordingStatus.textContent = 'Recording…';
    timer.start();

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      waveform.start(micStream);
    } catch (_) {}

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
      (status, data) => {
        if (status === 'loading') {
          updateProgress(true, data?.progress, `Loading: ${data?.file || '…'}`);
          updateModelStatus('whisper', 'loading');
        } else if (status === 'progress') {
          updateModelStatus('whisper', 'progress', data);
        } else if (status === 'ready') {
          updateProgress(false);
          updateModelStatus('whisper', 'ready');
        }
      }
    );
  };

  const stopRecording = async () => {
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    waveform.stop();
    timer.stop();
    await manager.stop();
    state.isRecording = false;
    el.recordBtnIcon.textContent = '🎙️';
    el.recordBtnLabel.textContent = 'Start Recording';
    el.recordBtn.classList.remove('recording');
    el.recordingDot.classList.remove('active');
    el.recordingStatus.textContent = '';
    setStatus('Stopped');
    updateWordCount();
  };

  el.recordBtn.addEventListener('click', async () => {
    if (state.isRecording) { await stopRecording(); }
    else {
      try { await startRecording(); }
      catch (err) {
        state.isRecording = false;
        el.recordBtn.classList.remove('recording');
        el.recordBtnIcon.textContent = '🎙️';
        el.recordBtnLabel.textContent = 'Start Recording';
        el.recordingDot.classList.remove('active');
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
      span.addEventListener('click', () => { el.audioPlayback.currentTime = w.start; el.audioPlayback.play(); });
      el.timedTranscript.appendChild(span);
    });
  }

  el.audioPlayback.addEventListener('timeupdate', () => {
    const t = el.audioPlayback.currentTime;
    el.timedTranscript.querySelectorAll('.transcript-word').forEach(span => {
      const active = t >= parseFloat(span.dataset.start) && t <= parseFloat(span.dataset.end);
      span.classList.toggle('active-word', active);
      if (active) span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  // ── File Upload ───────────────────────────────────────────────────────
  const setFile = file => {
    if (!file) return;
    state.selectedFile = file;
    el.fileInfo.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    el.transcribeFileBtn.disabled = false;
    el.audioPlayback.src = URL.createObjectURL(file);
    el.audioPlayback.style.display = 'block';
  };

  el.uploadArea.addEventListener('click', () => el.audioFile.click());
  el.uploadArea.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') el.audioFile.click(); });
  el.audioFile.addEventListener('change', e => setFile(e.target.files[0]));
  el.uploadArea.addEventListener('dragover', e => { e.preventDefault(); el.uploadArea.classList.add('dragover'); });
  el.uploadArea.addEventListener('dragleave', () => el.uploadArea.classList.remove('dragover'));
  el.uploadArea.addEventListener('drop', e => {
    e.preventDefault(); el.uploadArea.classList.remove('dragover');
    setFile(e.dataTransfer.files[0]);
  });

  el.transcribeFileBtn.addEventListener('click', async () => {
    if (!state.selectedFile) return;
    el.transcribeFileBtn.disabled = true;
    updateProgress(true, 0, 'Preparing…');
    try {
      const result = await manager.transcribeFile(state.selectedFile, p => {
        // p = { percent, status, data }
        if (p.data?.status === 'progress') {
          updateModelStatus('whisper', 'progress', p.data);
        } else if (p.data?.status === 'ready') {
          updateModelStatus('whisper', 'ready');
        }
        updateProgress(true, p.percent, p.status);
      });
      updateProgress(false);
      el.transcript.value = result.text;
      state.transcriptText = result.text;
      if (result.chunks || result.words) {
        state.timedWords = (result.chunks || result.words).map(c => ({
          word: c.text || c.word,
          start: c.timestamp ? c.timestamp[0] : c.start,
          end: c.timestamp ? c.timestamp[1] : c.end
        }));
        renderTimedTranscript(state.timedWords);
      }
      updateWordCount();
      showToast('Transcription complete!', 'success');
    } catch (err) {
      updateProgress(false);
      showToast(`Transcription failed: ${err.message}`, 'error');
    } finally {
      el.transcribeFileBtn.disabled = false;
    }
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
  });
  document.addEventListener('click', e => {
    if (!el.exportBtn.contains(e.target) && !el.exportMenu.contains(e.target)) {
      el.exportMenu.classList.remove('open');
      el.exportBtn.setAttribute('aria-expanded', 'false');
    }
  });

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
        if (e.data.data?.status === 'progress') updateProgress(true, e.data.data.progress, `Downloading model: ${e.data.data.file}…`);
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
}
