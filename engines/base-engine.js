// Base Engine Class - Defines the interface for all recognition engines
export class BaseEngine {
  constructor(config = {}) {
    this.id = config.id || 'base';
    this.name = config.name || 'Base Engine';
    this.type = config.type || 'unknown'; // 'offline' or 'online'
    this.description = config.description || 'Base recognition engine';
    this.icon = config.icon || '🔧';
    this.isInitialized = false;
    this.isRecording = false;
    this.currentTranscript = '';
    this.supportedLanguages = [];
    this.config = config;
  }

  // Required methods that all engines must implement
  async initialize() {
    throw new Error('initialize() method must be implemented by subclass');
  }

  async start(onResult, onError, onStatus) {
    throw new Error('start() method must be implemented by subclass');
  }

  async stop() {
    throw new Error('stop() method must be implemented by subclass');
  }

  async transcribeFile(file) {
    throw new Error('transcribeFile() method must be implemented by subclass');
  }

  // Optional methods with default implementations
  async isAvailable() {
    return true;
  }

  getCurrentTranscript() {
    return this.currentTranscript;
  }

  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  getStatus() {
    if (this.isRecording) return 'recording';
    if (this.isInitialized) return 'ready';
    return 'uninitialized';
  }

  // Utility methods
  updateTranscript(text, isFinal = true) {
    if (isFinal) {
      this.currentTranscript += text + ' ';
    }
  }

  clearTranscript() {
    this.currentTranscript = '';
  }

  // Configuration
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  // Cleanup
  async cleanup() {
    this.isInitialized = false;
    this.isRecording = false;
    this.currentTranscript = '';
  }

  // Quality checks
  checkQuality() {
    return {
      quality: 'unknown',
      issues: [],
      engine: this.name,
      status: this.getStatus()
    };
  }

  // Engine info
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      icon: this.icon,
      isAvailable: this.isAvailable(),
      isInitialized: this.isInitialized,
      isRecording: this.isRecording,
      supportedLanguages: this.supportedLanguages,
      status: this.getStatus()
    };
  }
} 