// Voice Notes PWA - Main Application (Modular Version)
import ModularRecognitionManager from './modular-recognition-manager.js?v=7';

// Import module loader to ensure all engines are registered
import './module-loader.js?v=7';

// App state
const state = {
  isRecording: false,
  currentEngineId: '',
  transcript: '',
  summary: '',
  history: [],
  sessionTitle: '',
  selectedFile: null,
  availableEngines: []
};

// DOM elements
const elements = {
  recordBtn: document.getElementById('recordBtn'),
  engineSelector: document.getElementById('engineSelector'),
  engineInfo: document.getElementById('engineInfo'),
  engineFeatures: document.getElementById('engineFeatures'),
  transcript: document.getElementById('transcript'),
  summary: document.getElementById('summary'),
  historyList: document.getElementById('historyList'),
  sessionTitle: document.getElementById('sessionTitle'),
  statusBar: document.getElementById('statusBar'),
  copyTranscriptBtn: document.getElementById('copyTranscriptBtn'),
  sendToLLMBtn: document.getElementById('sendToLLMBtn'),
  copySummaryBtn: document.getElementById('copySummaryBtn'),
  updateBanner: document.getElementById('updateBanner'),
  // Upload elements
  audioFile: document.getElementById('audioFile'),
  uploadArea: document.getElementById('uploadArea'),
  uploadSection: document.getElementById('uploadSection'),
  uploadFormats: document.getElementById('uploadFormats'),
  transcribeFileBtn: document.getElementById('transcribeFileBtn'),
  fileInfo: document.getElementById('fileInfo')
};

// Recognition manager instance
let recognitionManager = null;

// Initialize app
async function initializeApp() {
  try {
    console.log('Initializing Voice Notes PWA (Modular)...');
    
    // Initialize modular recognition manager
    recognitionManager = new ModularRecognitionManager();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup service worker
    setupServiceWorker();
    
    // Discover and load available engines
    await discoverEngines();
    
    // Auto-select best available engine
    await autoSelectEngine();
    
    // Load history
    loadHistory();
    
    // Update UI
    updateStatus('Ready to start recording');
    
    console.log('App initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
    updateStatus('Initialization failed: ' + error.message);
  }
}

// Discover available engines
async function discoverEngines() {
  try {
    updateStatus('Discovering available engines...');
    
    // Initialize engines from registry
    await recognitionManager.initializeEngines();
    
    // Get available engines
    state.availableEngines = await recognitionManager.getAvailableEngines();
    
    console.log(`Found ${state.availableEngines.length} available engines:`, 
      state.availableEngines.map(e => e.name));
    
    // Populate engine selector
    populateEngineSelector();
    
    updateStatus(`Found ${state.availableEngines.length} available engines`);
    
  } catch (error) {
    console.error('Engine discovery failed:', error);
    updateStatus('Engine discovery failed: ' + error.message);
  }
}

// Populate engine selector dropdown
function populateEngineSelector() {
  const selector = elements.engineSelector;
  selector.innerHTML = '';
  
  if (state.availableEngines.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No engines available';
    option.disabled = true;
    selector.appendChild(option);
    return;
  }
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select an engine...';
  selector.appendChild(defaultOption);
  
  // Add engine options
  state.availableEngines.forEach(engine => {
    const option = document.createElement('option');
    option.value = engine.id;
    option.textContent = `${engine.icon} ${engine.name}`;
    selector.appendChild(option);
  });
}

// Auto-select best available engine
async function autoSelectEngine() {
  try {
    if (state.availableEngines.length === 0) {
      throw new Error('No engines available');
    }
    
    // Try to auto-select best engine (prefer offline engines)
    const bestEngine = await recognitionManager.autoSelectEngine(['offline_processing', 'file_transcription']);
    
    if (bestEngine) {
      state.currentEngineId = bestEngine.id;
      elements.engineSelector.value = bestEngine.id;
      updateEngineInfo();
      updateUploadSection();
      elements.recordBtn.disabled = false;
      
      console.log(`Auto-selected engine: ${bestEngine.name}`);
      updateStatus(`Using ${bestEngine.name}`);
    }
    
  } catch (error) {
    console.error('Auto-engine selection failed:', error);
    
    // Fallback to first available engine
    if (state.availableEngines.length > 0) {
      const firstEngine = state.availableEngines[0];
      await handleEngineChange({ target: { value: firstEngine.id } });
    }
  }
}

// Setup event listeners
function setupEventListeners() {
  // Record button
  elements.recordBtn.addEventListener('click', toggleRecording);
  
  // Engine selector
  elements.engineSelector.addEventListener('change', handleEngineChange);
  
  // Copy buttons
  elements.copyTranscriptBtn.addEventListener('click', copyTranscript);
  elements.copySummaryBtn.addEventListener('click', copySummary);
  
  // Send to LLM button
  elements.sendToLLMBtn.addEventListener('click', sendToLLM);
  
  // Session title
  elements.sessionTitle.addEventListener('input', (e) => {
    state.sessionTitle = e.target.value;
  });
  
  // Update banner
  elements.updateBanner.addEventListener('click', () => {
    window.location.reload();
  });

  // Upload functionality
  setupUploadEventListeners();
}

// Setup upload event listeners
function setupUploadEventListeners() {
  // File input change
  elements.audioFile.addEventListener('change', handleFileSelect);
  
  // Upload area click
  elements.uploadArea.addEventListener('click', () => {
    elements.audioFile.click();
  });
  
  // Drag and drop
  elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('drag-over');
  });
  
  elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('drag-over');
  });
  
  elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect({ target: { files } });
    }
  });
  
  // Transcribe file button
  elements.transcribeFileBtn.addEventListener('click', transcribeSelectedFile);
}

// Handle file selection
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  if (!file.type.startsWith('audio/')) {
    updateStatus('Please select an audio file');
    return;
  }
  
  // Check if current engine supports file transcription
  if (!recognitionManager.supportsFeature('file_transcription')) {
    updateStatus('Current engine does not support file transcription');
    return;
  }
  
  // Check file size
  const currentEngine = recognitionManager.getCurrentEngineInfo();
  if (currentEngine && currentEngine.maxFileSize && file.size > currentEngine.maxFileSize) {
    updateStatus(`File too large. Maximum size: ${(currentEngine.maxFileSize / 1024 / 1024).toFixed(1)}MB`);
    return;
  }
  
  state.selectedFile = file;
  updateFileInfo(file);
  elements.transcribeFileBtn.disabled = false;
}

// Update file info display
function updateFileInfo(file) {
  const size = (file.size / 1024 / 1024).toFixed(2);
  const type = file.type || 'Unknown';
  
  elements.fileInfo.innerHTML = `
    <div class="file-details">
      <strong>${file.name}</strong><br>
      <small>${type} • ${size} MB</small>
    </div>
  `;
}

// Transcribe selected file
async function transcribeSelectedFile() {
  if (!state.selectedFile) {
    updateStatus('No file selected');
    return;
  }
  
  try {
    updateStatus('Transcribing file...');
    elements.transcribeFileBtn.disabled = true;
    
    const result = await recognitionManager.transcribeFile(state.selectedFile);
    
    // Update transcript
    state.transcript = result.text;
    elements.transcript.value = result.text;
    
    updateStatus(`File transcribed successfully (${result.duration}s)`);
    
    // Save to history
    if (result.text.trim()) {
      saveToHistory();
    }
    
  } catch (error) {
    console.error('File transcription failed:', error);
    updateStatus('File transcription failed: ' + error.message);
  } finally {
    elements.transcribeFileBtn.disabled = false;
  }
}

// Setup service worker
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registered:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              elements.updateBanner.style.display = 'block';
            }
          });
        });
      })
      .catch(error => {
        console.error('ServiceWorker registration failed:', error);
      });
  }
}

// Handle engine change
async function handleEngineChange(event) {
  const engineId = event.target.value;
  
  if (!engineId) {
    state.currentEngineId = '';
    updateEngineInfo();
    updateUploadSection();
    elements.recordBtn.disabled = true;
    return;
  }
  
  try {
    updateStatus(`Switching to ${engineId}...`);
    elements.recordBtn.disabled = true;
    
    await recognitionManager.setEngine(engineId);
    state.currentEngineId = engineId;
    
    updateEngineInfo();
    updateUploadSection();
    elements.recordBtn.disabled = false;
    
    updateStatus(`Switched to ${recognitionManager.getCurrentEngineInfo().name}`);
    
  } catch (error) {
    console.error('Engine change failed:', error);
    updateStatus('Engine change failed: ' + error.message);
    elements.recordBtn.disabled = true;
  }
}

// Update engine info display
function updateEngineInfo() {
  const engineInfo = recognitionManager.getCurrentEngineInfo();
  
  if (!engineInfo) {
    elements.engineInfo.innerHTML = `
      <div class="engine-type">No engine selected</div>
      <div class="engine-description">Please select an engine</div>
      <div class="engine-features"></div>
    `;
    return;
  }
  
  const typeText = engineInfo.isOffline ? '🔒 Offline' : '🌐 Online';
  const features = engineInfo.features.map(f => `<span class="feature-tag">${f}</span>`).join('');
  
  elements.engineInfo.innerHTML = `
    <div class="engine-type">${typeText}</div>
    <div class="engine-description">${engineInfo.description}</div>
    <div class="engine-features">${features}</div>
  `;
}

// Update upload section visibility
function updateUploadSection() {
  const engineInfo = recognitionManager.getCurrentEngineInfo();
  
  if (engineInfo && engineInfo.features.includes('file_transcription')) {
    elements.uploadSection.style.display = 'block';
    
    // Update supported formats
    if (engineInfo.supportedFormats && engineInfo.supportedFormats.length > 0) {
      const formats = engineInfo.supportedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ');
      elements.uploadFormats.textContent = `Supports ${formats}`;
    }
  } else {
    elements.uploadSection.style.display = 'none';
  }
}

// Toggle recording
async function toggleRecording() {
  if (state.isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

// Start recording
async function startRecording() {
  try {
    if (!recognitionManager.getCurrentEngine()) {
      throw new Error('No engine selected');
    }
    
    updateStatus('Starting recording...');
    elements.recordBtn.disabled = true;
    
    const success = await recognitionManager.start(
      (text, isFinal) => {
        if (isFinal) {
          state.transcript += (state.transcript ? ' ' : '') + text;
          elements.transcript.value = state.transcript;
        }
      },
      (error) => {
        console.error('Recognition error:', error);
        updateStatus('Recognition error: ' + error.message);
      },
      (status) => {
        updateStatus(status);
      }
    );
    
    if (success) {
      state.isRecording = true;
      updateRecordingUI();
    }
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    updateStatus('Failed to start recording: ' + error.message);
    elements.recordBtn.disabled = false;
  }
}

// Stop recording
async function stopRecording() {
  try {
    await recognitionManager.stop();
    state.isRecording = false;
    updateRecordingUI();
    
    // Save to history if we have content
    if (state.transcript.trim()) {
      saveToHistory();
    }
    
  } catch (error) {
    console.error('Failed to stop recording:', error);
    updateStatus('Failed to stop recording: ' + error.message);
  }
}

// Update recording UI
function updateRecordingUI() {
  if (state.isRecording) {
    elements.recordBtn.textContent = 'Stop Recording';
    elements.recordBtn.classList.add('recording');
    elements.recordingStatus.textContent = 'Recording...';
    elements.recordingStatus.classList.add('active');
  } else {
    elements.recordBtn.textContent = 'Start Recording';
    elements.recordBtn.classList.remove('recording');
    elements.recordingStatus.textContent = '';
    elements.recordingStatus.classList.remove('active');
    elements.recordBtn.disabled = false;
  }
}

// Copy transcript
async function copyTranscript() {
  try {
    await navigator.clipboard.writeText(state.transcript);
    updateStatus('Transcript copied to clipboard');
  } catch (error) {
    console.error('Failed to copy transcript:', error);
    updateStatus('Failed to copy transcript');
  }
}

// Copy summary
async function copySummary() {
  try {
    await navigator.clipboard.writeText(state.summary);
    updateStatus('Summary copied to clipboard');
  } catch (error) {
    console.error('Failed to copy summary:', error);
    updateStatus('Failed to copy summary');
  }
}

// Send to LLM
async function sendToLLM() {
  if (!state.transcript.trim()) {
    updateStatus('No transcript to summarize');
    return;
  }
  
  try {
    updateStatus('Generating summary...');
    elements.sendToLLMBtn.disabled = true;
    
    const summary = await generateSummary(state.transcript);
    state.summary = summary;
    elements.summary.textContent = summary;
    
    updateStatus('Summary generated successfully');
    
  } catch (error) {
    console.error('Failed to generate summary:', error);
    updateStatus('Failed to generate summary: ' + error.message);
  } finally {
    elements.sendToLLMBtn.disabled = false;
  }
}

// Generate summary using AI
async function generateSummary(transcript) {
  // This is a placeholder - you would integrate with your preferred AI service
  // For now, we'll create a simple summary
  
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const wordCount = transcript.split(/\s+/).length;
  
  if (wordCount < 10) {
    return transcript;
  }
  
  const summary = sentences.slice(0, Math.min(3, sentences.length)).join('. ') + '.';
  return `Summary (${wordCount} words): ${summary}`;
}

// Save to history
function saveToHistory() {
  const entry = {
    id: Date.now(),
    title: state.sessionTitle || 'Untitled Session',
    transcript: state.transcript,
    summary: state.summary,
    engine: recognitionManager.getCurrentEngineInfo()?.name || 'Unknown',
    timestamp: new Date().toISOString(),
    wordCount: state.transcript.split(/\s+/).length
  };
  
  state.history.unshift(entry);
  
  // Keep only last 50 entries
  if (state.history.length > 50) {
    state.history = state.history.slice(0, 50);
  }
  
  // Save to localStorage
  localStorage.setItem('voiceNotesHistory', JSON.stringify(state.history));
  
  updateHistoryUI();
}

// Load history
function loadHistory() {
  try {
    const saved = localStorage.getItem('voiceNotesHistory');
    if (saved) {
      state.history = JSON.parse(saved);
      updateHistoryUI();
    }
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

// Update history UI
function updateHistoryUI() {
  const historyList = elements.historyList;
  historyList.innerHTML = '';
  
  if (state.history.length === 0) {
    historyList.innerHTML = '<li class="no-history">No history yet</li>';
    return;
  }
  
  state.history.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `
      <div class="history-header">
        <span class="history-title">${entry.title}</span>
        <span class="history-meta">
          ${entry.engine} • ${entry.wordCount} words • ${new Date(entry.timestamp).toLocaleDateString()}
        </span>
      </div>
      <div class="history-preview">${entry.transcript.substring(0, 100)}${entry.transcript.length > 100 ? '...' : ''}</div>
      <button class="load-history-btn" onclick="loadHistoryEntry('${entry.id}')">Load</button>
    `;
    historyList.appendChild(li);
  });
}

// Load history entry
window.loadHistoryEntry = function(entryId) {
  const entry = state.history.find(h => h.id.toString() === entryId);
  if (entry) {
    state.transcript = entry.transcript;
    state.summary = entry.summary;
    state.sessionTitle = entry.title;
    
    elements.transcript.value = entry.transcript;
    elements.summary.textContent = entry.summary;
    elements.sessionTitle.value = entry.title;
    
    updateStatus(`Loaded session: ${entry.title}`);
  }
};

// Update status
function updateStatus(message) {
  elements.statusBar.textContent = message;
  console.log('Status:', message);
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
