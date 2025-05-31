# Vosk Offline Speech Recognition Integration & Codebase Documentation

## Overview
This project is a Voice Notes PWA that supports both offline (Vosk) and online (Web Speech API) speech recognition, with seamless mode switching, robust transcript/summary history, and high-quality summarization via a Cloudflare Worker.

---

## Vosk Setup & Integration

### Model
- The Vosk English model (`vosk-model-small-en-us-0.15.tar.gz`) is stored locally in the `models/` directory.
- The model is loaded once per session using the Vosk WASM API.

### Audio Graph
- A single `AudioContext` and `AudioWorkletNode` are created per session for microphone input.
- The audio worklet is registered only once, and the microphone stream is connected to the worklet node.

### Recognizer Lifecycle
- A new recognizer is created and destroyed for each recognition session (start/stop recording).
- The recognizer processes audio frames from the worklet and emits partial/final results.
- All resources (mic, audio context, recognizer) are released on stop.

### API
- `startVoskRecognition(onResult)`: Starts offline recognition, calls `onResult(text, isFinal)`.
- `stopVoskRecognition()`: Stops recognition and releases resources.
- `loadVosk()`: Loads the model and initializes the audio graph if not already loaded.

---

## Mode Switching Logic
- The app supports seamless switching between offline (Vosk) and online (Web Speech API) modes.
- When switching modes during recording, both recognizers overlap for 5 seconds to avoid audio loss.
- Deduplication logic ensures no repeated transcript text during overlap.
- Transcript is always preserved across mode switches.

---

## Transcript & Summary History
- Every transcript and summary is saved to `localStorage` and rendered in the UI.
- Users can expand/collapse, copy, or delete any note from history.
- History logic is robust and DRY, ensuring no data loss.

---

## Summarization (Cloudflare Worker)
- The transcript is sent to a Cloudflare Worker that uses the BART model for summarization.
- The prompt instructs the model to correct all spelling and grammar mistakes, then summarize as clearly as possible.
- The summary is displayed and saved with the transcript in history.

---

## File Structure
- `app.js`: Main app logic, UI, mode switching, event handling, transcript/summary history.
- `vosk-integration.js`: Vosk model/audio/recognizer logic, mic stream management.
- `webspeech-integration.js`: Web Speech API logic for online recognition.
- `worker.js`: Cloudflare Worker for summarization.
- `service-worker.js`: PWA offline support.
- `vosk.js`: Vosk WASM loader stub.
- `models/vosk-model-small-en-us-0.15.tar.gz`: Offline model.

---

## Architectural Notes
- All event handlers and resources are robustly cleaned up to prevent leaks.
- No global variables are leaked; all state is managed within modules.
- The codebase is modular, with clear separation of concerns.
- All major edge cases (mic release, recognizer errors, transcript loss) are handled.

---

## How to Add/Update Vosk Model
1. Place the new model `.tar.gz` file in the `models/` directory.
2. Update the model path in `vosk-integration.js` if needed.
3. The app will load the new model on next startup.

---

## How to Extend
- To add new languages, add the corresponding Vosk model and update the loader.
- To improve summarization, update the prompt or model in `worker.js`.
- UI and history logic can be extended in `app.js`.

---

## Last Updated
May 29, 2025
