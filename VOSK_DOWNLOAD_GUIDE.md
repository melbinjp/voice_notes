# 🎤 Vosk Offline Speech Recognition - Complete Download & Implementation Guide

## 📥 Download Sources

### **1. Vosk.js Library**
- **Primary Source**: https://alphacephei.com/vosk/
- **GitHub Repository**: https://github.com/alphacephei.com/vosk-api
- **Browser Examples**: https://github.com/ccoreilly/vosk-browser
- **CDN**: Not available (download required for offline use)

### **2. Speech Recognition Models**

#### **English Models**
- **Small Model (39MB)**: https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.tar.gz
- **Large Model (1.8GB)**: https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.tar.gz
- **UK English**: https://alphacephei.com/vosk/models/vosk-model-small-en-gb-0.15.tar.gz

#### **Other Languages**
- **Spanish**: https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.tar.gz
- **French**: https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.tar.gz
- **German**: https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.tar.gz
- **Italian**: https://alphacephei.com/vosk/models/vosk-model-small-it-0.22.tar.gz
- **Portuguese**: https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.tar.gz
- **Russian**: https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.tar.gz
- **Chinese**: https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.tar.gz
- **Japanese**: https://alphacephei.com/vosk/models/vosk-model-small-ja-0.22.tar.gz

### **3. File Structure**
```
your-project/
├── vosk.js                    # Vosk library (5.5MB)
├── vosk-latest.js            # Modern implementation
├── vosk-worklet.js           # AudioWorklet processor
├── models/
│   ├── vosk-model-small-en-us-0.15.tar.gz
│   ├── vosk-model-small-es-0.42.tar.gz
│   └── ... (other models)
└── index.html
```

## 🚀 Implementation

### **1. Basic HTML Setup**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vosk Offline Speech Recognition</title>
</head>
<body>
    <h1>🎤 Vosk Offline Speech Recognition</h1>
    
    <div class="controls">
        <button id="startBtn">Start Recognition</button>
        <button id="stopBtn">Stop Recognition</button>
        <button id="fileBtn">Transcribe File</button>
        <input type="file" id="audioFile" accept="audio/*" style="display: none;">
    </div>
    
    <div class="status" id="status">Ready</div>
    <div class="transcript" id="transcript"></div>
    
    <!-- Load Vosk library -->
    <script src="vosk.js"></script>
    <script src="vosk-latest.js"></script>
    <script src="app.js"></script>
</body>
</html>
```

### **2. Modern Implementation (vosk-latest.js)**
```javascript
// Usage example
const vosk = new VoskRecognition();

// Configure settings
vosk.configure({
  sampleRate: 16000,
  modelPath: './models/vosk-model-small-en-us-0.15.tar.gz',
  enableWordTimings: true
});

// Start recognition
document.getElementById('startBtn').onclick = async () => {
  const success = await vosk.startRecognition(
    // onResult callback
    (text, isFinal, result) => {
      document.getElementById('transcript').textContent += text + ' ';
      console.log('Recognized:', text);
    },
    // onError callback
    (error) => {
      console.error('Error:', error);
      document.getElementById('status').textContent = 'Error: ' + error;
    },
    // onStatus callback
    (status) => {
      document.getElementById('status').textContent = status;
    }
  );
  
  if (!success) {
    console.error('Failed to start recognition');
  }
};

// Stop recognition
document.getElementById('stopBtn').onclick = () => {
  vosk.stopRecognition();
};

// File transcription
document.getElementById('fileBtn').onclick = () => {
  document.getElementById('audioFile').click();
};

document.getElementById('audioFile').onchange = async (event) => {
  const file = event.target.files[0];
  if (file) {
    const text = await vosk.transcribeFile(file);
    if (text) {
      document.getElementById('transcript').textContent = text;
    }
  }
};
```

### **3. Complete App Implementation (app.js)**
```javascript
class VoskApp {
  constructor() {
    this.vosk = new VoskRecognition();
    this.isRecording = false;
    this.transcript = '';
    
    this.initialize();
  }
  
  async initialize() {
    // Check if Vosk is available
    if (!VoskRecognition.isAvailable()) {
      this.showError('Vosk not available. Please check if vosk.js is loaded.');
      return;
    }
    
    // Initialize Vosk
    const success = await this.vosk.initialize();
    if (!success) {
      this.showError('Failed to initialize Vosk');
      return;
    }
    
    this.setupEventListeners();
    this.updateStatus('Ready to start recognition');
  }
  
  setupEventListeners() {
    document.getElementById('startBtn').onclick = () => this.startRecognition();
    document.getElementById('stopBtn').onclick = () => this.stopRecognition();
    document.getElementById('fileBtn').onclick = () => this.selectFile();
    
    // File input
    const fileInput = document.getElementById('audioFile');
    fileInput.onchange = (event) => this.handleFileUpload(event.target.files[0]);
    
    // Drag and drop
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });
  }
  
  async startRecognition() {
    if (this.isRecording) return;
    
    this.isRecording = true;
    this.transcript = '';
    this.updateTranscript('');
    
    const success = await this.vosk.startRecognition(
      (text, isFinal, result) => {
        this.transcript += text + ' ';
        this.updateTranscript(this.transcript);
      },
      (error) => {
        this.showError(error);
        this.isRecording = false;
      },
      (status) => {
        this.updateStatus(status);
      }
    );
    
    if (!success) {
      this.isRecording = false;
    }
  }
  
  stopRecognition() {
    if (!this.isRecording) return;
    
    this.vosk.stopRecognition();
    this.isRecording = false;
    this.updateStatus('Recognition stopped');
  }
  
  async handleFileUpload(file) {
    if (!file) return;
    
    this.updateStatus('Transcribing file...');
    const text = await this.vosk.transcribeFile(file);
    
    if (text) {
      this.transcript = text;
      this.updateTranscript(text);
      this.updateStatus('File transcription completed');
    } else {
      this.showError('Failed to transcribe file');
    }
  }
  
  selectFile() {
    document.getElementById('audioFile').click();
  }
  
  updateTranscript(text) {
    document.getElementById('transcript').textContent = text;
  }
  
  updateStatus(status) {
    document.getElementById('status').textContent = status;
  }
  
  showError(error) {
    console.error(error);
    this.updateStatus('Error: ' + error);
  }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
  new VoskApp();
});
```

## 🔧 Advanced Configuration

### **1. Multi-language Support**
```javascript
const vosk = new VoskRecognition();

// Switch languages
async function switchLanguage(languageCode) {
  const languages = VoskRecognition.getSupportedLanguages();
  const language = languages.find(lang => lang.code === languageCode);
  
  if (language) {
    vosk.configure({
      modelPath: `./models/${language.model}`
    });
    
    // Reinitialize with new model
    await vosk.initialize();
  }
}

// Example usage
switchLanguage('es'); // Switch to Spanish
switchLanguage('fr'); // Switch to French
```

### **2. Custom Configuration**
```javascript
vosk.configure({
  sampleRate: 16000,           // Audio sample rate
  bufferSize: 4096,           // Processing buffer size
  modelPath: './models/vosk-model-small-en-us-0.15.tar.gz',
  enablePartialResults: false, // Enable partial results
  enableWordTimings: true,     // Include word-level timing
  maxAlternatives: 1           // Number of alternative results
});
```

### **3. Error Handling**
```javascript
vosk.startRecognition(
  (text, isFinal, result) => {
    // Handle successful recognition
    console.log('Text:', text);
    console.log('Is Final:', isFinal);
    console.log('Full Result:', result);
  },
  (error) => {
    // Handle errors
    console.error('Recognition Error:', error);
    
    // Specific error handling
    if (error.includes('microphone')) {
      alert('Please allow microphone access');
    } else if (error.includes('model')) {
      alert('Model loading failed. Please check your internet connection.');
    }
  },
  (status) => {
    // Handle status updates
    console.log('Status:', status);
  }
);
```

## 📊 Performance Optimization

### **1. Model Selection**
- **Small Model (39MB)**: Good for most use cases, faster loading
- **Large Model (1.8GB)**: Higher accuracy, slower loading
- **Custom Models**: Domain-specific models for better accuracy

### **2. Audio Processing**
- **AudioWorkletNode**: Modern, non-blocking (preferred)
- **ScriptProcessorNode**: Legacy, blocking (fallback)
- **Buffer Size**: 4096 samples for good balance

### **3. Memory Management**
```javascript
// Proper cleanup
vosk.stopRecognition();

// Clear transcript periodically
setInterval(() => {
  if (transcript.length > 10000) {
    transcript = transcript.slice(-5000);
  }
}, 30000);
```

## 🐛 Troubleshooting

### **Common Issues**

#### **1. Model Loading Fails**
```javascript
// Check model path
console.log('Model path:', vosk.config.modelPath);

// Verify file exists
fetch(vosk.config.modelPath)
  .then(response => {
    if (!response.ok) {
      throw new Error('Model file not found');
    }
    console.log('Model file accessible');
  })
  .catch(error => {
    console.error('Model access error:', error);
  });
```

#### **2. Microphone Access Denied**
```javascript
// Check microphone permissions
navigator.permissions.query({ name: 'microphone' })
  .then(result => {
    if (result.state === 'denied') {
      alert('Microphone access is required for speech recognition');
    }
  });
```

#### **3. Audio Processing Issues**
```javascript
// Check audio context state
if (audioContext.state === 'suspended') {
  await audioContext.resume();
}

// Check sample rate compatibility
if (audioContext.sampleRate !== 16000) {
  console.warn('Sample rate mismatch, resampling may be needed');
}
```

## 🔗 Additional Resources

- **Official Documentation**: https://alphacephei.com/vosk/
- **API Reference**: https://alphacephei.com/vosk/integrations
- **Browser Examples**: https://github.com/ccoreilly/vosk-browser
- **Model Adaptation**: https://alphacephei.com/vosk/lm
- **Community Support**: https://github.com/alphacep/vosk-api/issues

## 📄 License

Vosk is licensed under Apache 2.0. See the [LICENSE](https://github.com/alphacep/vosk-api/blob/master/LICENSE) file for details.

---

**Last Updated**: 2024  
**Vosk Version**: 0.3.45+  
**Browser Support**: Chrome 66+, Firefox 60+, Safari 11.1+, Edge 79+ 