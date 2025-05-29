// Vosk Speech Recognition integration for Voice Notes PWA
// This file loads the Vosk WASM model and provides a simple API for English speech-to-text

// --- Vosk Model & Audio Graph: Load ONCE at startup ---
let voskModel = null;
let voskAudioContext = null;
let voskMicSource = null;
let voskWorkletNode = null;
let voskRecognizer = null;
let voskOnResult = null;

async function initVoskWorklet() {
  if (voskModel && voskAudioContext && voskWorkletNode) return; // Already initialized
  const statusBar = document.getElementById('statusBar');
  if (statusBar) statusBar.textContent = 'Loading Vosk model...';
  voskModel = await Vosk.createModel('./models/vosk-model-small-en-us-0.15.tar.gz');
  if (!voskModel.ready) throw new Error('Model not ready after load');
  if (statusBar) statusBar.textContent = 'Model loaded.';
  voskAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  // Register the audio worklet if not already registered
  if (!voskAudioContext.audioWorklet.workletAdded) {
    const workletCode = `
      class VoskProcessor extends AudioWorkletProcessor {
        constructor() { super(); }
        process(inputs) {
          const input = inputs[0][0];
          if (input) this.port.postMessage(input);
          return true;
        }
      }
      registerProcessor('vosk-processor', VoskProcessor);
    `;
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await voskAudioContext.audioWorklet.addModule(url);
    voskAudioContext.audioWorklet.workletAdded = true;
  }
  voskMicSource = voskAudioContext.createMediaStreamSource(
    window.voskMicStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } })
  );
  voskWorkletNode = new AudioWorkletNode(voskAudioContext, 'vosk-processor');
  voskMicSource.connect(voskWorkletNode);
  // Do NOT connect to destination yet
}

// --- Recognizer: Create/Destroy on demand ---
async function startVoskRecognition(onResult) {
  await initVoskWorklet();
  voskOnResult = onResult;
  // Clean up any previous recognizer
  if (voskRecognizer && typeof voskRecognizer.remove === 'function') {
    voskRecognizer.remove();
    voskRecognizer = null;
  }
  voskRecognizer = new voskModel.KaldiRecognizer(16000);
  voskRecognizer.on('partialresult', ({ result }) => {
    if (result && result.partial && voskOnResult) voskOnResult(result.partial, false);
  });
  voskRecognizer.on('result', ({ result }) => {
    if (result && result.text && voskOnResult) voskOnResult(result.text, true);
  });
  voskWorkletNode.port.onmessage = (e) => {
    if (!voskRecognizer) return;
    let input = e.data;
    if (!(input instanceof Float32Array)) input = new Float32Array(input);
    try {
      voskRecognizer.acceptWaveformFloat(input, 16000);
    } catch (err) {
      console.error('Error processing audio:', err);
    }
  };
  voskWorkletNode.connect(voskAudioContext.destination);
}

function stopVoskRecognition() {
  if (voskRecognizer && typeof voskRecognizer.remove === 'function') {
    voskRecognizer.remove();
    voskRecognizer = null;
  }
  // Only disconnect if actually connected
  if (voskWorkletNode && voskAudioContext) {
    try {
      voskWorkletNode.disconnect(voskAudioContext.destination);
    } catch (e) {
      // Ignore if already disconnected
    }
  }
  voskOnResult = null;
}

export { startVoskRecognition, stopVoskRecognition, initVoskWorklet as loadVosk };
