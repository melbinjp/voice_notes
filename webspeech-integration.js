// Web Speech API (online transcription) integration for Voice Notes PWA
// Provides startWebSpeechRecognition and stopWebSpeechRecognition

let recognition = null;
let shouldStopRecognition = false;

function startWebSpeechRecognition({
  transcriptArea,
  recordingStatus,
  statusBar,
  onResult,
  onError,
  onEnd,
  lang = 'en-US',
  interimResults = true,
  continuous = true,
  transcriptText = ''
}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (onError) onError({ error: 'not-supported' });
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.interimResults = interimResults;
  recognition.continuous = continuous;
  shouldStopRecognition = false;
  let localTranscript = transcriptText || '';

  recognition.onstart = () => {
    if (shouldStopRecognition) {
      recognition.stop();
      return;
    }
    if (recordingStatus) recordingStatus.textContent = 'Recording...';
    if (statusBar) statusBar.textContent = 'Listening (Web Speech API)';
  };
  recognition.onresult = (event) => {
    if (shouldStopRecognition) {
      recognition.stop();
      return;
    }
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        localTranscript += event.results[i][0].transcript + ' ';
        if (onResult) onResult(localTranscript, true);
      } else {
        interim += event.results[i][0].transcript;
        if (onResult) onResult(localTranscript + interim, false);
      }
    }
    if (transcriptArea) {
      transcriptArea.value = localTranscript + interim;
      transcriptArea.dispatchEvent(new Event('input'));
    }
  };
  recognition.onerror = (event) => {
    if (shouldStopRecognition) {
      recognition.stop();
      return;
    }
    if (onError) onError(event);
    stopWebSpeechRecognition();
  };
  recognition.onend = () => {
    if (shouldStopRecognition) {
      if (onEnd) onEnd('stopped');
      return;
    }
    if (onEnd) onEnd('ended');
  };
  recognition.start();
}

function stopWebSpeechRecognition() {
  shouldStopRecognition = true;
  if (recognition) {
    // Remove event listeners for GC
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    recognition.onstart = null;
    recognition.stop();
    recognition = null;
  }
}

export { startWebSpeechRecognition, stopWebSpeechRecognition };
