/**
 * Latest Vosk Implementation for Offline Speech Recognition
 * Based on Vosk API v0.3.45+ and modern browser standards
 * 
 * Download Sources:
 * - Vosk.js: https://alphacephei.com/vosk/
 * - Models: https://alphacephei.com/vosk/models/
 * - Examples: https://github.com/ccoreilly/vosk-browser
 */

class VoskRecognition {
  constructor() {
    this.model = null;
    this.recognizer = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.isProcessing = false;
    this.onResult = null;
    this.onError = null;
    this.onStatus = null;
    
    // Configuration
    this.config = {
      sampleRate: 16000,
      bufferSize: 4096,
      modelPath: './models/vosk-model-small-en-us-0.15.tar.gz',
      enablePartialResults: false,
      enableWordTimings: true,
      maxAlternatives: 1
    };
    
    // Speech deduplication
    this.deduplicator = {
      lastResults: [],
      maxHistory: 5,
      similarityThreshold: 0.8,
      timeWindow: 3000,
      
      isDuplicate(text) {
        if (!text || text.trim().length === 0) return true;
        
        const now = Date.now();
        this.lastResults = this.lastResults.filter(result => 
          now - result.timestamp < this.timeWindow
        );
        
        if (this.lastResults.length > 0) {
          const lastResult = this.lastResults[this.lastResults.length - 1];
          if (text.toLowerCase() === lastResult.text.toLowerCase() && 
              now - lastResult.timestamp < 1000) {
            return true;
          }
          
          for (const result of this.lastResults) {
            const similarity = this.calculateSimilarity(text, result.text);
            if (similarity > this.similarityThreshold) {
              return true;
            }
          }
        }
        
        this.lastResults.push({
          text: text.toLowerCase(),
          timestamp: now
        });
        
        if (this.lastResults.length > this.maxHistory) {
          this.lastResults.shift();
        }
        
        return false;
      },
      
      calculateSimilarity(str1, str2) {
        const words1 = new Set(str1.toLowerCase().split(/\s+/));
        const words2 = new Set(str2.toLowerCase().split(/\s+/));
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
      },
      
      reset() {
        this.lastResults = [];
      }
    };
  }

  /**
   * Initialize Vosk recognition
   */
  async initialize() {
    try {
      this.updateStatus('Initializing Vosk...');
      
      // Check if Vosk is available
      if (typeof window.Vosk === 'undefined') {
        throw new Error('Vosk not found. Please include vosk.js in your HTML.');
      }
      
      // Load model
      this.updateStatus('Loading Vosk model...');
      this.model = await window.Vosk.createModel(this.config.modelPath);
      
      if (!this.model || typeof this.model.KaldiRecognizer !== 'function') {
        throw new Error('Failed to load Vosk model or KaldiRecognizer not available');
      }
      
      this.updateStatus('Vosk initialized successfully');
      return true;
      
    } catch (error) {
      this.handleError('Initialization failed: ' + error.message);
      return false;
    }
  }

  /**
   * Start real-time recognition
   */
  async startRecognition(onResult, onError, onStatus) {
    try {
      this.onResult = onResult;
      this.onError = onError;
      this.onStatus = onStatus;
      
      if (this.isProcessing) {
        throw new Error('Recognition already in progress');
      }
      
      // Initialize if not already done
      if (!this.model) {
        const initialized = await this.initialize();
        if (!initialized) return false;
      }
      
      this.updateStatus('Starting recognition...');
      
      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.config.sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.config.sampleRate
      });
      
      // Create recognizer
      this.recognizer = new this.model.KaldiRecognizer(this.config.sampleRate);
      
      // Configure recognizer
      if (typeof this.recognizer.setWords === 'function') {
        this.recognizer.setWords(this.config.enableWordTimings);
      }
      
      // Create audio processing pipeline
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Use ScriptProcessorNode (AudioWorklet not available)
      this.setupScriptProcessor(source);
      
      this.isProcessing = true;
      this.deduplicator.reset();
      this.updateStatus('Recognition active - speak now!');
      
      return true;
      
    } catch (error) {
      this.handleError('Failed to start recognition: ' + error.message);
      return false;
    }
  }

  /**
   * Setup ScriptProcessorNode (fallback method)
   */
  setupScriptProcessor(source) {
    try {
      this.processor = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        1,
        1
      );
      
      this.processor.onaudioprocess = (event) => {
        if (!this.isProcessing || !this.recognizer) return;
        
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Convert float32 to int16
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        
        // Process audio data
        const isFinal = this.recognizer.acceptWaveform(int16Data);
        
        if (isFinal) {
          const result = this.recognizer.retrieveFinalResult();
          this.processResult(result);
        } else if (this.config.enablePartialResults) {
          const partialResult = this.recognizer.retrievePartialResult();
          this.processResult(partialResult, false);
        }
      };
      
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      
    } catch (error) {
      this.handleError('Failed to setup audio processor: ' + error.message);
    }
  }

  /**
   * Process recognition results
   */
  processResult(resultString, isFinal = true) {
    try {
      if (!resultString || resultString.trim() === '') return;
      
      const result = JSON.parse(resultString);
      const text = result.text || '';
      
      if (text.trim() === '') return;
      
      // Check for duplicates
      if (this.deduplicator.isDuplicate(text)) {
        return;
      }
      
      // Call result callback
      if (this.onResult) {
        this.onResult(text, isFinal, result);
      }
      
    } catch (error) {
      console.error('Error processing result:', error);
    }
  }

  /**
   * Stop recognition
   */
  stopRecognition() {
    try {
      this.isProcessing = false;
      
      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      // Disconnect audio processor
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }
      
      // Close audio context
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
        this.audioContext = null;
      }
      
      // Cleanup recognizer
      if (this.recognizer) {
        try {
          if (typeof this.recognizer.free === 'function') {
            this.recognizer.free();
          } else if (typeof this.recognizer.destroy === 'function') {
            this.recognizer.destroy();
          } else if (typeof this.recognizer.close === 'function') {
            this.recognizer.close();
          }
        } catch (error) {
          console.warn('Error cleaning up recognizer:', error);
        }
        this.recognizer = null;
      }
      
      this.updateStatus('Recognition stopped');
      
    } catch (error) {
      this.handleError('Error stopping recognition: ' + error.message);
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribeFile(file) {
    try {
      this.updateStatus('Transcribing file...');
      
      // Initialize if not already done
      if (!this.model) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize Vosk');
        }
      }
      
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const audioData = new Uint8Array(arrayBuffer);
      
      // Create recognizer
      const recognizer = new this.model.KaldiRecognizer(this.config.sampleRate);
      
      // Process audio data (simplified - would need proper audio decoding)
      const int16Data = new Int16Array(audioData.buffer);
      const isFinal = recognizer.acceptWaveform(int16Data);
      
      if (isFinal) {
        const result = recognizer.retrieveFinalResult();
        const parsedResult = JSON.parse(result);
        
        // Cleanup
        try {
          if (typeof recognizer.free === 'function') {
            recognizer.free();
          } else if (typeof recognizer.destroy === 'function') {
            recognizer.destroy();
          }
        } catch (error) {
          console.warn('Error cleaning up file recognizer:', error);
        }
        
        return {
          text: parsedResult.text || '',
          confidence: parsedResult.confidence || 0,
          duration: 0, // Would need to calculate from audio
          engine: 'Vosk'
        };
      } else {
        throw new Error('File transcription incomplete');
      }
      
    } catch (error) {
      this.handleError('File transcription failed: ' + error.message);
      throw error;
    }
  }

  /**
   * Resample audio data
   */
  resampleAudio(pcm, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) return pcm;
    
    const ratio = fromSampleRate / toSampleRate;
    const newLength = Math.round(pcm.length / ratio);
    const result = new Int16Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const index = Math.round(i * ratio);
      result[i] = pcm[index] || 0;
    }
    
    return result;
  }

  /**
   * Update status
   */
  updateStatus(message) {
    console.log('Vosk Status:', message);
    if (this.onStatus) {
      this.onStatus(message);
    }
  }

  /**
   * Handle errors
   */
  handleError(error) {
    console.error('Vosk Error:', error);
    if (this.onError) {
      this.onError(error);
    }
  }

  /**
   * Check if Vosk is available
   */
  static isAvailable() {
    return typeof window.Vosk !== 'undefined' && 
           typeof window.Vosk.createModel === 'function';
  }

  /**
   * Get supported languages
   */
  static getSupportedLanguages() {
    return [
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'es-ES', name: 'Spanish' },
      { code: 'fr-FR', name: 'French' },
      { code: 'de-DE', name: 'German' },
      { code: 'it-IT', name: 'Italian' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'ru-RU', name: 'Russian' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'ja-JP', name: 'Japanese' }
    ];
  }

  /**
   * Configure Vosk
   */
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopRecognition();
    this.model = null;
    this.onResult = null;
    this.onError = null;
    this.onStatus = null;
  }
}

// Make VoskRecognition globally available
window.VoskRecognition = VoskRecognition; 