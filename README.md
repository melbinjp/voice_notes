# 🎤 Voice Notes PWA

A Progressive Web App for offline and online speech recognition with AI summarization capabilities.

## ✨ Features

- **🔒 Offline Recognition**: Vosk-based speech recognition that works without internet
- **🌐 Online Recognition**: Web Speech API for enhanced accuracy when online
- **📁 File Upload**: Transcribe audio files (MP3, WAV, M4A, OGG)
- **🔄 Modular Engines**: Completely interchangeable recognition engines
- **📝 Real-time Transcription**: Live speech-to-text conversion
- **🤖 AI Summarization**: Generate summaries from transcripts
- **📚 Session History**: Save and manage transcription sessions
- **📱 PWA Support**: Install as a native app on mobile devices
- **🎨 Modern UI**: Beautiful, responsive design

## 🏗️ Architecture

### Modular Recognition System

The app uses a completely modular recognition system where engines are interchangeable without any changes to the main application:

```
📁 engines/
├── base-engine.js          # Base class defining engine interface
├── vosk-engine.js          # Vosk offline recognition engine
└── webspeech-engine.js     # Web Speech API online engine

📁 Main Files
├── modular-recognition-manager.js  # Engine manager
├── app.js                          # Main application logic
└── index.html                      # User interface
```

### Engine Interface

All engines implement the same interface:

```javascript
class BaseEngine {
  async initialize()           // Initialize the engine
  async start(onResult, onError, onStatus)  // Start recognition
  async stop()                 // Stop recognition
  async transcribeFile(file)   // Transcribe audio file
  async isAvailable()          // Check if engine is available
  getCurrentTranscript()       // Get current transcript
  getSupportedLanguages()      // Get supported languages
  getStatus()                  // Get engine status
  checkQuality()               // Check engine quality
  async cleanup()              // Cleanup resources
}
```

## 🚀 Getting Started

### Prerequisites

- Modern web browser with Web Speech API support
- For offline functionality: Vosk model files

### Installation

1. **Clone or download** the project files
2. **Download Vosk model** (for offline recognition):
   ```bash
   # Create models directory
   mkdir models
   
   # Download English model (small)
   curl -L -o models/vosk-model-small-en-us-0.15.tar.gz \
     https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.tar.gz
   ```

3. **Serve the files** using a local web server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```

4. **Open** `http://localhost:8000` in your browser

### Usage

1. **Select Engine**: Choose between Vosk (offline) or Web Speech API (online)
2. **Start Recording**: Click "Start Recording" to begin live transcription
3. **Upload Files**: Drag and drop audio files or click to browse
4. **Generate Summary**: Click "Summarize" to create AI summaries
5. **Save Sessions**: All sessions are automatically saved to history

## 🔧 Configuration

### Engine Configuration

Each engine can be configured independently:

```javascript
// Vosk Engine Configuration
const voskConfig = {
  modelPath: './models/vosk-model-small-en-us-0.15.tar.gz',
  sampleRate: 16000,
  enableWordTimings: true,
  enablePartialResults: false
};

// Web Speech API Configuration
const webSpeechConfig = {
  language: 'en-US',
  continuous: true,
  interimResults: false,
  maxAlternatives: 1,
  deduplication: true,
  similarityThreshold: 0.8,
  timeWindow: 3000
};
```

### Deduplication Settings

Configure speech deduplication to prevent repeated results:

```javascript
recognitionManager.configureDeduplication({
  enabled: true,
  similarityThreshold: 0.8,  // Similarity threshold (0-1)
  timeWindow: 3000,          // Time window in milliseconds
  maxHistory: 5              // Maximum history items
});
```

## 📁 File Structure

```
voice_notes/
├── index.html                    # Main application
├── app.js                        # Application logic
├── style.css                     # Styling
├── manifest.json                 # PWA manifest
├── service-worker.js             # Service worker
├── modular-recognition-manager.js # Engine manager
├── engines/                      # Recognition engines
│   ├── base-engine.js
│   ├── vosk-engine.js
│   └── webspeech-engine.js
├── models/                       # Vosk model files
│   └── vosk-model-small-en-us-0.15.tar.gz
├── vosk.js                       # Vosk library
├── vosk-latest.js                # Vosk implementation
└── README.md                     # This file
```

## 🔌 Adding New Engines

To add a new recognition engine:

1. **Create engine file** in `engines/` directory
2. **Extend BaseEngine** class
3. **Implement required methods**
4. **Register in ModularRecognitionManager**

Example:

```javascript
// engines/my-engine.js
import { BaseEngine } from './base-engine.js';

export class MyEngine extends BaseEngine {
  constructor(config = {}) {
    super({
      id: 'myengine',
      name: 'My Recognition Engine',
      type: 'offline', // or 'online'
      description: 'My custom recognition engine',
      icon: '🔧',
      ...config
    });
  }

  async initialize() {
    // Initialize your engine
  }

  async start(onResult, onError, onStatus) {
    // Start recognition
  }

  async stop() {
    // Stop recognition
  }

  async transcribeFile(file) {
    // Transcribe file
  }
}

// In modular-recognition-manager.js
import { MyEngine } from './engines/my-engine.js';

// Add to initializeEngines method
const myEngine = new MyEngine();
if (await myEngine.isAvailable()) {
  this.engines.set('myengine', myEngine);
}
```

## 🐛 Troubleshooting

### Common Issues

1. **Vosk not working**:
   - Ensure `vosk.js` and `vosk-latest.js` are loaded
   - Check model file exists in `models/` directory
   - Verify browser supports WebAssembly
   - Check browser console for error messages

2. **Web Speech API not working**:
   - **IMPORTANT**: Web Speech API requires HTTPS or localhost for microphone access
   - Check browser supports SpeechRecognition
   - Ensure you're running on `http://localhost` or `https://`
   - Check microphone permissions in browser settings
   - Try refreshing the page and allowing microphone access

3. **File upload not working**:
   - Ensure file is audio format (MP3, WAV, M4A, OGG)
   - Check file size (recommended < 50MB)
   - Verify Vosk engine is selected (Web Speech API doesn't support file transcription)

4. **Service worker issues**:
   - Clear browser cache
   - Check browser console for errors
   - Ensure HTTPS or localhost

5. **No transcription happening**:
   - Check if you're on HTTPS or localhost (required for microphone access)
   - Allow microphone permissions when prompted
   - Try switching between engines
   - Check browser console for error messages

### Debug Information

Use browser console to get debug information:

```javascript
// Get debug info
const debugInfo = recognitionManager.getDebugInfo();
console.log(debugInfo);

// Check engine quality
const quality = recognitionManager.checkQuality();
console.log(quality);
```

### Web Speech API Requirements

**Critical**: Web Speech API requires:
- HTTPS connection OR
- localhost (127.0.0.1) OR  
- localhost with port (e.g., localhost:8000)

**File protocol (file://) will NOT work** for microphone access.

## 📱 PWA Features

- **Offline Support**: Works without internet (with Vosk)
- **Installable**: Add to home screen on mobile devices
- **Background Sync**: Automatic updates when online
- **Push Notifications**: (Future feature)

## 🔒 Privacy & Security

- **Offline Processing**: Vosk processes audio locally
- **No Data Collection**: No audio data sent to servers
- **Local Storage**: All data stored locally in browser
- **HTTPS Required**: For microphone access and PWA features

## 🌐 Browser Support

- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Limited Web Speech API support
- **Edge**: Full support
- **Mobile Browsers**: Varies by platform

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section above
2. Ensure you're running on HTTPS or localhost
3. Check browser console for error messages
4. Verify microphone permissions are granted
5. Create an issue with detailed information

---

**Made with ❤️ for accessible speech recognition**
