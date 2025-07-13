// Web Speech API Engine Module - Online speech recognition
import moduleRegistry from '../module-registry.js';

class WebSpeechEngine {
  constructor() {
    this.name = 'Web Speech API Recognition';
    this.id = 'webspeech';
    this.isInitialized = false;
    this.isRecording = false;
    this.recognition = null;
    this.callbacks = {};
    
    // Quality management
    this.lastResult = '';
    this.lastResultTime = 0;
    this.deduplicationWindow = 2000; // 2 seconds
    this.similarityThreshold = 0.8;
    this.lastFinalIndex = 0;
  }

  // Metadata for module registry
  static getMetadata() {
    return {
      id: 'webspeech',
      name: 'Web Speech API Recognition',
      description: 'Browser-native online speech recognition using Web Speech API',
      version: '1.0.0',
      author: 'W3C Web Speech API',
      icon: '🌐',
      priority: 5, // Medium priority for online capability
      isOffline: false,
      isOnline: true,
      features: [
        'real_time_recognition',
        'continuous_recognition',
        'interim_results',
        'language_detection',
        'browser_native',
        'no_installation',
        'quality_management'
      ],
      requirements: [
        'Web Speech API support',
        'internet connection',
        'microphone access',
        'HTTPS or localhost'
      ],
      supportedFormats: [
        'audio/wav',
        'audio/mp3',
        'audio/m4a',
        'audio/ogg',
        'audio/webm'
      ],
      maxFileSize: 50 * 1024 * 1024, // 50MB (browser limitations)
      languages: [
        { code: 'en-US', name: 'English (US)' },
        { code: 'en-GB', name: 'English (UK)' },
        { code: 'en-AU', name: 'English (Australia)' },
        { code: 'en-CA', name: 'English (Canada)' },
        { code: 'en-IN', name: 'English (India)' },
        { code: 'es-ES', name: 'Spanish (Spain)' },
        { code: 'es-MX', name: 'Spanish (Mexico)' },
        { code: 'fr-FR', name: 'French (France)' },
        { code: 'fr-CA', name: 'French (Canada)' },
        { code: 'de-DE', name: 'German (Germany)' },
        { code: 'it-IT', name: 'Italian (Italy)' },
        { code: 'pt-BR', name: 'Portuguese (Brazil)' },
        { code: 'pt-PT', name: 'Portuguese (Portugal)' },
        { code: 'ru-RU', name: 'Russian (Russia)' },
        { code: 'zh-CN', name: 'Chinese (Simplified)' },
        { code: 'zh-TW', name: 'Chinese (Traditional)' },
        { code: 'ja-JP', name: 'Japanese (Japan)' },
        { code: 'ko-KR', name: 'Korean (Korea)' },
        { code: 'nl-NL', name: 'Dutch (Netherlands)' },
        { code: 'pl-PL', name: 'Polish (Poland)' },
        { code: 'sv-SE', name: 'Swedish (Sweden)' },
        { code: 'da-DK', name: 'Danish (Denmark)' },
        { code: 'fi-FI', name: 'Finnish (Finland)' },
        { code: 'no-NO', name: 'Norwegian (Norway)' },
        { code: 'tr-TR', name: 'Turkish (Turkey)' },
        { code: 'ar-SA', name: 'Arabic (Saudi Arabia)' },
        { code: 'he-IL', name: 'Hebrew (Israel)' },
        { code: 'hi-IN', name: 'Hindi (India)' },
        { code: 'th-TH', name: 'Thai (Thailand)' },
        { code: 'vi-VN', name: 'Vietnamese (Vietnam)' }
      ],
      qualitySettings: {
        deduplicationWindow: 2000,
        similarityThreshold: 0.8,
        confidenceThreshold: 0.7,
        interimResults: true,
        continuous: true
      }
    };
  }

  // Check if Web Speech API is available
  async isAvailable() {
    try {
      // Check if Web Speech API is supported
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.log('Web Speech API not supported');
        return false;
      }

      // Check if we're on HTTPS or localhost
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.log('Web Speech API requires HTTPS or localhost');
        return false;
      }

      // Test microphone access
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Web Speech API is available');
        return true;
      } catch (error) {
        console.log('Microphone access denied');
        return false;
      }
    } catch (error) {
      console.error('Web Speech API availability check failed:', error);
      return false;
    }
  }

  // Initialize the engine
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      console.log('Initializing Web Speech API engine...');
      
      // Create recognition instance
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      // Configure recognition
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;
      
      this.isInitialized = true;
      console.log('Web Speech API engine initialized successfully');
      return true;
    } catch (error) {
      console.error('Web Speech API initialization failed:', error);
      throw error;
    }
  }

  // Start real-time recognition
  async start(onResult, onError, onStatus) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRecording) {
      throw new Error('Recognition already in progress');
    }

    try {
      console.log('Starting Web Speech API recognition...');
      
      this.callbacks = { onResult, onError, onStatus };
      this.isRecording = true;
      this.lastFinalIndex = 0;

      // Set up event handlers
      this.recognition.onstart = () => {
        console.log('Web Speech API recognition started');
        if (this.callbacks.onStatus) {
          this.callbacks.onStatus('Recording started');
        }
      };

      this.recognition.onresult = (event) => {
        this.handleRecognitionResult(event);
      };

      this.recognition.onerror = (event) => {
        console.error('Web Speech API error:', event.error);
        if (this.callbacks.onError) {
          this.callbacks.onError(new Error(event.error));
        }
      };

      this.recognition.onend = () => {
        console.log('Web Speech API recognition ended');
        this.isRecording = false;
        if (this.callbacks.onStatus) {
          this.callbacks.onStatus('Recording stopped');
        }
      };

      // Start recognition
      this.recognition.start();
      return true;

    } catch (error) {
      console.error('Failed to start Web Speech API recognition:', error);
      this.isRecording = false;
      throw error;
    }
  }

  // Handle recognition results
  handleRecognitionResult(event) {
    try {
      let finalTranscript = '';
      let interimTranscript = '';

      // Process results
      for (let i = this.lastFinalIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript;
          this.lastFinalIndex = i + 1;
        } else {
          interimTranscript += transcript;
        }
      }

      // Handle final results
      if (finalTranscript.trim()) {
        const text = finalTranscript.trim();
        
        // Apply quality management
        if (this.isQualityResult(text)) {
          if (this.callbacks.onResult) {
            this.callbacks.onResult(text, 'final');
          }
        }
      }

      // Handle interim results
      if (interimTranscript.trim()) {
        const text = interimTranscript.trim();
        if (this.callbacks.onResult) {
          this.callbacks.onResult(text, 'partial');
        }
      }

    } catch (error) {
      console.error('Error handling recognition result:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  // Stop recognition
  async stop() {
    if (!this.isRecording) return;

    try {
      console.log('Stopping Web Speech API recognition...');
      
      if (this.recognition) {
        this.recognition.stop();
      }
      
      this.isRecording = false;
      console.log('Web Speech API recognition stopped');
    } catch (error) {
      console.error('Error stopping Web Speech API recognition:', error);
    }
  }

  // Transcribe audio file (not directly supported by Web Speech API)
  async transcribeFile(file) {
    throw new Error('File transcription not supported by Web Speech API. Use Vosk engine for file transcription.');
  }

  // Quality management
  isQualityResult(text) {
    const now = Date.now();
    
    // Check time window
    if (now - this.lastResultTime < this.deduplicationWindow) {
      // Check similarity
      const similarity = this.calculateSimilarity(text, this.lastResult);
      if (similarity > this.similarityThreshold) {
        return false; // Too similar, skip
      }
    }
    
    this.lastResult = text;
    this.lastResultTime = now;
    return true;
  }

  // Calculate text similarity
  calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  // Configure deduplication
  configureDeduplication(options = {}) {
    this.deduplicationWindow = options.window || 2000;
    this.similarityThreshold = options.threshold || 0.8;
  }

  // Get engine information
  getInfo() {
    return WebSpeechEngine.getMetadata();
  }

  // Get supported languages
  getSupportedLanguages() {
    return WebSpeechEngine.getMetadata().languages;
  }

  // Set language
  async setLanguage(languageCode) {
    const metadata = WebSpeechEngine.getMetadata();
    const language = metadata.languages.find(lang => lang.code === languageCode);
    
    if (!language) {
      throw new Error(`Language '${languageCode}' not supported`);
    }
    
    if (this.recognition) {
      this.recognition.lang = languageCode;
      console.log(`Language set to: ${language.name} (${languageCode})`);
    }
  }

  // Configure recognition settings
  configure(config = {}) {
    if (this.recognition) {
      if (config.continuous !== undefined) {
        this.recognition.continuous = config.continuous;
      }
      if (config.interimResults !== undefined) {
        this.recognition.interimResults = config.interimResults;
      }
      if (config.maxAlternatives !== undefined) {
        this.recognition.maxAlternatives = config.maxAlternatives;
      }
      if (config.grammars !== undefined) {
        this.recognition.grammars = config.grammars;
      }
    }
  }

  // Check quality
  checkQuality() {
    const issues = [];
    let quality = 'good';

    if (!this.isInitialized) {
      issues.push('Web Speech API not initialized');
      quality = 'poor';
    }

    if (!this.recognition) {
      issues.push('Recognition instance not available');
      quality = 'poor';
    }

    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      issues.push('HTTPS required for Web Speech API');
      quality = 'poor';
    }

    return {
      quality,
      issues,
      engine: 'webspeech',
      status: this.getStatus(),
      browser: navigator.userAgent,
      protocol: location.protocol
    };
  }

  // Get status
  getStatus() {
    if (!this.isInitialized) return 'not_initialized';
    if (this.isRecording) return 'recording';
    return 'ready';
  }

  // Cleanup
  async cleanup() {
    try {
      await this.stop();
      
      if (this.recognition) {
        this.recognition = null;
      }
      
      this.isInitialized = false;
      
      console.log('Web Speech API engine cleaned up');
    } catch (error) {
      console.error('Web Speech API cleanup error:', error);
    }
  }
}

// Auto-register with module registry
moduleRegistry.registerModule('webspeech', WebSpeechEngine, WebSpeechEngine.getMetadata());

export { WebSpeechEngine }; 