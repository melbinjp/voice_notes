// Vosk Speech Recognition integration for Voice Notes PWA
// This file loads the Vosk WASM model and provides a simple API for English speech-to-text

let voskRecognizer = null;
let voskModel = null;
let voskReady = false;
let voskAudioContext = null;
let voskStream = null;
let voskProcessor = null;
let voskOnResult = null;

async function loadVosk() {
  if (voskReady) return;
  // Load vosk.js and the model (assume both are in the root or /vosk/)
  await import('./vosk.js');
  voskModel = new VoskModel('vosk-model-small-en-us-0.15'); // folder with model files
  await voskModel.init();
  voskRecognizer = new VoskRecognizer(voskModel, 16000);
  voskReady = true;
}

async function startVoskRecognition(onResult) {
  await loadVosk();
  voskOnResult = onResult;
  voskAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  voskStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = voskAudioContext.createMediaStreamSource(voskStream);
  voskProcessor = voskAudioContext.createScriptProcessor(4096, 1, 1);
  source.connect(voskProcessor);
  voskProcessor.connect(voskAudioContext.destination);
  voskProcessor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, input[i] * 32767));
    }
    const result = voskRecognizer.acceptWaveform(int16);
    if (result) {
      const res = voskRecognizer.result();
      if (res && res.text && voskOnResult) voskOnResult(res.text, true);
    } else {
      const res = voskRecognizer.partialResult();
      if (res && res.partial && voskOnResult) voskOnResult(res.partial, false);
    }
  };
}

function stopVoskRecognition() {
  if (voskProcessor) voskProcessor.disconnect();
  if (voskAudioContext) voskAudioContext.close();
  if (voskStream) voskStream.getTracks().forEach(track => track.stop());
  voskProcessor = null;
  voskAudioContext = null;
  voskStream = null;
  voskOnResult = null;
}

export { startVoskRecognition, stopVoskRecognition, loadVosk };
