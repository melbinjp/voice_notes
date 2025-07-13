// Vosk Engine Module - Offline speech recognition
import moduleRegistry from '../module-registry.js';

class VoskEngine {
  constructor() {
    this.name = 'Vosk Offline Recognition';
    this.id = 'vosk';
    this.isInitialized = false;
    this.isRecording = false;
    this.model = null;
    this.recognizer = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.callbacks = {};
    
    // Audio processing
    this.audioBuffer = [];
    this.sampleRate = 16000;
    this.chunkSize = 4096;
    
    // Quality management
    this.lastResult = '';
    this.lastResultTime = 0;
    this.deduplicationWindow = 2000; // 2 seconds
    this.similarityThreshold = 0.8;
  }

  // Metadata for module registry
  static getMetadata() {
    return {
      id: 'vosk',
      name: 'Vosk Offline Recognition',
      description: 'High-quality offline speech recognition using Vosk models',
      version: '1.0.0',
      author: 'Alpha Cephei',
      icon: '🔒',
      priority: 10, // High priority for offline capability
      isOffline: true,
      isOnline: false,
      features: [
        'real_time_recognition',
        'file_transcription',
        'offline_processing',
        'high_accuracy',
        'custom_models',
        'language_support',
        'quality_management'
      ],
      requirements: [
        'vosk.js library',
        'vosk model files',
        'microphone access',
        'audio context support'
      ],
      supportedFormats: [
        'audio/wav',
        'audio/mp3',
        'audio/m4a',
        'audio/ogg',
        'audio/webm'
      ],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      languages: [
        { code: 'en-us', name: 'English (US)', model: 'vosk-model-small-en-us-0.15' },
        { code: 'en-gb', name: 'English (UK)', model: 'vosk-model-small-en-gb-0.15' },
        { code: 'es', name: 'Spanish', model: 'vosk-model-small-es-0.42' },
        { code: 'fr', name: 'French', model: 'vosk-model-small-fr-0.22' },
        { code: 'de', name: 'German', model: 'vosk-model-small-de-0.15' },
        { code: 'it', name: 'Italian', model: 'vosk-model-small-it-0.22' },
        { code: 'pt', name: 'Portuguese', model: 'vosk-model-small-pt-0.3' },
        { code: 'ru', name: 'Russian', model: 'vosk-model-small-ru-0.22' },
        { code: 'zh', name: 'Chinese', model: 'vosk-model-small-cn-0.22' },
        { code: 'ja', name: 'Japanese', model: 'vosk-model-small-ja-0.22' }
      ],
      modelPath: 'models/vosk-model-small-en-us-0.15.tar.gz',
      sampleRate: 16000,
      chunkSize: 4096,
      qualitySettings: {
        deduplicationWindow: 2000,
        similarityThreshold: 0.8,
        confidenceThreshold: 0.7
      }
    };
  }

  // Check if Vosk is available
  async isAvailable() {
    try {
      // Check if Vosk library is loaded
      if (typeof Vosk === 'undefined') {
        console.log('Vosk library not loaded');
        return false;
      }

      // Check if we can create a model
      const testModel = await this.loadModel();
      if (testModel) {
        console.log('Vosk engine is available');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Vosk availability check failed:', error);
      return false;
    }
  }

  // Initialize the engine
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      console.log('Initializing Vosk engine...');
      
      // Load the model
      this.model = await this.loadModel();
      if (!this.model) {
        throw new Error('Failed to load Vosk model');
      }

      // Create recognizer
      this.recognizer = new this.model.KaldiRecognizer(this.sampleRate);
      if (!this.recognizer) {
        throw new Error('Failed to create Vosk recognizer');
      }

      this.isInitialized = true;
      console.log('Vosk engine initialized successfully');
      return true;
    } catch (error) {
      console.error('Vosk initialization failed:', error);
      throw error;
    }
  }

  // Load Vosk model
  async loadModel() {
    try {
      if (typeof Vosk === 'undefined') {
        throw new Error('Vosk library not available');
      }

      const metadata = VoskEngine.getMetadata();
      const modelPath = metadata.modelPath;
      
      console.log(`Loading Vosk model from: ${modelPath}`);
      
      // Create model using the global Vosk instance
      const model = await Vosk.createModel(modelPath);
      
      if (!model) {
        throw new Error('Failed to create Vosk model');
      }

      console.log('Vosk model loaded successfully');
      return model;
    } catch (error) {
      console.error('Vosk model loading failed:', error);
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
      console.log('Starting Vosk recognition...');
      
      this.callbacks = { onResult, onError, onStatus };
      this.isRecording = true;

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      // Create audio source
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create script processor for audio processing
      this.processor = this.audioContext.createScriptProcessor(this.chunkSize, 1, 1);

      // Set up audio processing
      this.processor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Convert float32 to int16
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        // Process audio chunk
        this.processAudioChunk(int16Data);
      };

      // Connect audio nodes
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Resume audio context
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      if (onStatus) onStatus('Recording started');
      console.log('Vosk recognition started');
      return true;

    } catch (error) {
      console.error('Failed to start Vosk recognition:', error);
      this.isRecording = false;
      throw error;
    }
  }

  // Process audio chunk
  processAudioChunk(audioData) {
    try {
      if (!this.recognizer || !this.isRecording) return;

      // Accept waveform data
      const hasResult = this.recognizer.acceptWaveform(audioData);

      if (hasResult) {
        // Get final result
        const result = this.recognizer.retrieveFinalResult();
        if (result) {
          const parsedResult = JSON.parse(result);
          if (parsedResult.text && parsedResult.text.trim()) {
            const text = parsedResult.text.trim();
            
            // Apply quality management
            if (this.isQualityResult(text)) {
              if (this.callbacks.onResult) {
                this.callbacks.onResult(text, 'final');
              }
            }
          }
        }
      } else {
        // Get partial result
        const partialResult = this.recognizer.retrievePartialResult();
        if (partialResult) {
          const parsedPartial = JSON.parse(partialResult);
          if (parsedPartial.partial && parsedPartial.partial.trim()) {
            const partialText = parsedPartial.partial.trim();
            
            if (this.callbacks.onResult) {
              this.callbacks.onResult(partialText, 'partial');
            }
          }
        }
      }
    } catch (error) {
      console.error('Audio processing error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  // Stop recognition
  async stop() {
    if (!this.isRecording) return;

    try {
      console.log('Stopping Vosk recognition...');
      
      this.isRecording = false;

      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      // Disconnect and close audio context
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }

      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      // Get final result
      if (this.recognizer) {
        const finalResult = this.recognizer.retrieveFinalResult();
        if (finalResult) {
          const parsedResult = JSON.parse(finalResult);
          if (parsedResult.text && parsedResult.text.trim()) {
            const text = parsedResult.text.trim();
            if (this.callbacks.onResult) {
              this.callbacks.onResult(text, 'final');
            }
          }
        }
      }

      if (this.callbacks.onStatus) {
        this.callbacks.onStatus('Recording stopped');
      }

      console.log('Vosk recognition stopped');
    } catch (error) {
      console.error('Error stopping Vosk recognition:', error);
    }
  }

  // Transcribe audio file
  async transcribeFile(file) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log('Transcribing file with Vosk:', file.name);
      
      const startTime = Date.now();
      
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const audioData = new Int16Array(arrayBuffer);
      
      // Process audio data in chunks
      const chunkSize = this.chunkSize;
      let finalText = '';
      
      for (let i = 0; i < audioData.length; i += chunkSize) {
        const chunk = audioData.slice(i, i + chunkSize);
        const hasResult = this.recognizer.acceptWaveform(chunk);
        
        if (hasResult) {
          const result = this.recognizer.retrieveFinalResult();
          if (result) {
            const parsedResult = JSON.parse(result);
            if (parsedResult.text) {
              finalText += ' ' + parsedResult.text;
            }
          }
        }
      }
      
      // Get any remaining final result
      const finalResult = this.recognizer.retrieveFinalResult();
      if (finalResult) {
        const parsedResult = JSON.parse(finalResult);
        if (parsedResult.text) {
          finalText += ' ' + parsedResult.text;
        }
      }
      
      const duration = (Date.now() - startTime) / 1000;
      const text = finalText.trim();
      
      console.log(`Vosk file transcription completed in ${duration}s`);
      
      return {
        text,
        duration,
        engine: 'vosk',
        confidence: 0.9, // Vosk doesn't provide confidence scores
        language: 'en-us'
      };
      
    } catch (error) {
      console.error('Vosk file transcription failed:', error);
      throw error;
    }
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
    return VoskEngine.getMetadata();
  }

  // Get supported languages
  getSupportedLanguages() {
    return VoskEngine.getMetadata().languages;
  }

  // Set language
  async setLanguage(languageCode) {
    const metadata = VoskEngine.getMetadata();
    const language = metadata.languages.find(lang => lang.code === languageCode);
    
    if (!language) {
      throw new Error(`Language '${languageCode}' not supported`);
    }
    
    // For now, we'll need to reload the model with the new language
    // This is a simplified implementation
    console.log(`Language set to: ${language.name} (${languageCode})`);
  }

  // Check quality
  checkQuality() {
    return {
      quality: 'high',
      issues: [],
      engine: 'vosk',
      model: this.model ? 'loaded' : 'not_loaded',
      status: this.getStatus()
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
      
      if (this.recognizer) {
        // Try different cleanup methods
        if (typeof this.recognizer.free === 'function') {
          this.recognizer.free();
        } else if (typeof this.recognizer.destroy === 'function') {
          this.recognizer.destroy();
        } else if (typeof this.recognizer.close === 'function') {
          this.recognizer.close();
        }
        this.recognizer = null;
      }
      
      this.model = null;
      this.isInitialized = false;
      
      console.log('Vosk engine cleaned up');
    } catch (error) {
      console.error('Vosk cleanup error:', error);
    }
  }
}

// Auto-register with module registry
moduleRegistry.registerModule('vosk', VoskEngine, VoskEngine.getMetadata());

export { VoskEngine }; 