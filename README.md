# 🎤 Voice Notes — Private & Offline PWA

A professional, production-grade Progressive Web App (PWA) for voice notes. Record, transcribe, and summarize your voice notes with **100% privacy and zero cloud dependency**. Everything happens locally in your browser using cutting-edge AI.

---

## 🌟 Key Features

- **🛡️ Total Privacy**: All transcriptions and summaries are processed **offline** on your device. No audio or text ever leaves your browser.
- **🎙️ Advanced Transcription**:
  - **Web Speech API**: High-speed, system-native transcription.
  - **OpenAI Whisper (Offline)**: High-accuracy, transformer-based transcription running via WASM.
  - **Vosk**: Fallback engine for maximum compatibility.
- **🧠 Local Summarization**: Generate concise summaries using the `DistilBART` model running locally via Transformers.js.
- **📊 AI Model Status Tracking**: Real-time progress bars and readiness badges show exactly when models are downloading and cached.
- **📈 Professional UX**:
  - **Live Waveform**: Visual feedback while recording.
  - **Recording Timer**: Precise duration tracking.
  - **Interactive Transcript**: Click any word to play back the audio from that moment.
  - **Toast Notifications**: Modern, non-intrusive status alerts.
- **📚 History Management**: Fully searchable and sortable local database (IndexedDB) for all your notes.
- **🌓 Adaptive Themes**: Seamless support for Light, Dark, and System-default themes with a sticky toggle.
- **📱 PWA Ready**: Installable on Desktop, iOS, and Android. Works offline once AI models are cached.

---

## 🚀 Getting Started

### 1. Run Locally
This is a **pure static repository** with zero build requirements. To run it locally:
1. Clone the repo.
2. Open `index.html` using a local server (e.g., VS Code Live Server or `npx serve .`).
   > **Note**: A local server is required for Web Workers and AI models to function correctly.

### 2. Deploy to GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings > Pages**.
3. Select the `main` branch and the `/ (root)` folder.
4. Your app is now live at `https://<username>.github.io/<repo-name>/`.

### 3. PWA Installation
Once live, visit the URL on your phone or desktop and select **"Add to Home Screen"** or **"Install"** from the browser menu.

---

## 🧠 How the AI Works

The app utilizes **Transformers.js** to run heavy machine learning models inside Web Workers:
- **Transcription**: Uses `Xenova/whisper-tiny.en` (~40MB).
- **Summarization**: Uses `Xenova/distilbart-cnn-6-6` (~300MB).

**First Load**: The first time you use a specific engine or summarize, the models will download from Hugging Face. 
**Caching**: Once downloaded, models are cached in your browser's IndexedDB. Subsequent uses are instantaneous and work fully offline.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Start / Stop Recording |
| `Ctrl + Shift + C` | Copy Transcript |
| `Ctrl + Shift + T` | Toggle Theme |
| `Ctrl + ,` | Open Settings |
| `Escape` | Close Modals |

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JS (ES6+), HTML5, CSS3.
- **AI Engines**: Transformers.js, Web Speech API, Vosk.
- **Storage**: IndexedDB for history and model caching.
- **PWA**: Service Workers with cache-first strategy.

---

## 📄 License
MIT License. Free to use and modify.

---

## 🤝 Credits
- UI/UX inspired by modern voice-to-text tools.
- AI Models powered by [Xenova / Transformers.js](https://huggingface.co/Xenova).
- Offline speech recognition via [Vosk-browser](https://github.com/alphacep/vosk-browser).
