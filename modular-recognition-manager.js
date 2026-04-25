// Modular Recognition Manager - Dynamic engine management using module registry
import moduleRegistry from './module-registry.js';

class ModularRecognitionManager {
  constructor() {
    this.currentEngine = null;
    this.isRecording = false;
    this.callbacks = {};

    console.log('Modular recognition manager initialized');
  }

  // Initialize available engines from registry
  async initializeEngines() {
    try {
      console.log('Initializing engines from module registry...');

      // Get all available modules
      const availableModules = moduleRegistry.getAvailableModules();
      console.log(`Found ${availableModules.length} registered modules`);

      // Check availability for each module
      for (const moduleInfo of availableModules) {
        const isAvailable = await moduleRegistry.isModuleAvailable(moduleInfo.id);
        console.log(`Module ${moduleInfo.name} (${moduleInfo.id}): ${isAvailable ? 'Available' : 'Not available'}`);
      }

      return availableModules;
    } catch (error) {
      console.error('Error initializing engines:', error);
      return [];
    }
  }

  // Get available engines with their metadata
  async getAvailableEngines() {
    const availableModules = moduleRegistry.getAvailableModules();
    const engines = [];

    for (const moduleInfo of availableModules) {
      const isAvailable = await moduleRegistry.isModuleAvailable(moduleInfo.id);
      if (isAvailable) {
        engines.push(moduleInfo);
      }
    }

    return engines;
  }

  // Set engine by ID
  async setEngine(engineId) {
    try {
      // Check if engine is available
      const isAvailable = await moduleRegistry.isModuleAvailable(engineId);
      if (!isAvailable) {
        throw new Error(`Engine '${engineId}' not available`);
      }

      // Stop current engine if recording
      if (this.isRecording) {
        await this.stop();
      }

      // Create new engine instance
      this.currentEngine = await moduleRegistry.createModule(engineId);

      // Initialize the engine
      await this.currentEngine.initialize();

      console.log(`Switched to engine: ${this.currentEngine.name} (${engineId})`);
      return this.currentEngine;
    } catch (error) {
      console.error(`Failed to set engine ${engineId}:`, error);
      throw error;
    }
  }

  // Preload an engine's models/data
  async preloadEngine(engineId, onStatus) {
    try {
      // If the engine is already the current one, use it
      let engine = this.currentEngine;
      if (!engine || engine.id !== engineId) {
        const metadata = moduleRegistry.getModuleMetadata(engineId);
        if (!metadata) throw new Error(`Engine '${engineId}' not found`);
        
        // We create a temporary instance just for preloading if it's not current
        engine = await moduleRegistry.createModule(engineId);
        await engine.initialize();
      }

      if (engine.preload) {
        return await engine.preload(onStatus);
      } else {
        console.warn(`Engine ${engineId} does not support preloading`);
        if (onStatus) onStatus('ready');
        return true;
      }
    } catch (error) {
      console.error(`Preload failed for ${engineId}:`, error);
      if (onStatus) onStatus('error', error.message);
      throw error;
    }
  }

  // Start recognition
  async start(onResult, onError, onStatus) {
    if (!this.currentEngine) {
      throw new Error('No engine selected');
    }

    if (this.isRecording) {
      throw new Error('Recognition already in progress');
    }

    try {
      this.isRecording = true;
      this.callbacks = { onResult, onError, onStatus };

      const success = await this.currentEngine.start(onResult, onError, onStatus);
      if (!success) {
        this.isRecording = false;
        throw new Error(`Failed to start ${this.currentEngine.name}`);
      }

      return true;
    } catch (error) {
      this.isRecording = false;
      throw error;
    }
  }

  // Stop recognition
  async stop() {
    if (!this.currentEngine || !this.isRecording) {
      return;
    }

    try {
      await this.currentEngine.stop();
    } catch (error) {
      console.error('Error stopping recognition:', error);
    } finally {
      this.isRecording = false;
      this.callbacks = {};
    }
  }

  // Transcribe file
  async transcribeFile(file, onProgress) {
    if (!this.currentEngine) {
      throw new Error('No engine selected');
    }

    // Check if current engine supports file transcription
    const engineInfo = this.currentEngine.getInfo();
    if (!engineInfo.features.includes('file_transcription')) {
      throw new Error(`Engine ${engineInfo.name} does not support file transcription`);
    }

    try {
      if (this.currentEngine.transcribeFile.length >= 2) {
        return await this.currentEngine.transcribeFile(file, onProgress);
      } else {
        return await this.currentEngine.transcribeFile(file);
      }
    } catch (error) {
      console.error('File transcription failed:', error);
      throw error;
    }
  }

  // Get current engine
  getCurrentEngine() {
    return this.currentEngine;
  }

  // Get current engine info
  getCurrentEngineInfo() {
    return this.currentEngine ? this.currentEngine.getInfo() : null;
  }

  // Get engine info by ID
  getEngineInfo(engineId) {
    return moduleRegistry.getModuleMetadata(engineId);
  }

  // Check if engine supports specific feature
  supportsFeature(feature) {
    if (!this.currentEngine) return false;

    const engineInfo = this.currentEngine.getInfo();
    return engineInfo.features.includes(feature);
  }

  // Get engines that support specific feature
  getEnginesWithFeature(feature) {
    return moduleRegistry.getModulesWithFeature(feature);
  }

  // Get engines that support file transcription
  getEnginesWithFileSupport() {
    return moduleRegistry.getModulesWithFileSupport();
  }

  // Get engines by type
  getEnginesByType(type) {
    return moduleRegistry.getModulesByType(type);
  }

  // Get best available engine
  getBestEngine(preferredFeatures = []) {
    return moduleRegistry.getBestModule(preferredFeatures);
  }

  // Auto-select best available engine
  async autoSelectEngine(preferredFeatures = []) {
    try {
      const bestEngine = this.getBestEngine(preferredFeatures);
      if (!bestEngine) {
        throw new Error('No engines available');
      }

      await this.setEngine(bestEngine.id);
      return bestEngine;
    } catch (error) {
      console.error('Auto-engine selection failed:', error);
      throw error;
    }
  }

  // Quality and status
  checkQuality() {
    if (!this.currentEngine) {
      return {
        quality: 'unknown',
        issues: ['No engine selected'],
        engine: 'None'
      };
    }

    return this.currentEngine.checkQuality();
  }

  getStatus() {
    if (!this.currentEngine) {
      return 'no_engine';
    }
    return this.currentEngine.getStatus();
  }

  // Configuration
  configureEngine(engineId, config) {
    const engine = this.currentEngine;
    if (engine && engine.id === engineId && engine.configure) {
      engine.configure(config);
    }
  }

  configureDeduplication(options = {}) {
    if (this.currentEngine && this.currentEngine.configureDeduplication) {
      this.currentEngine.configureDeduplication(options);
    }
  }

  // Language support
  getSupportedLanguages(engineId = null) {
    if (engineId) {
      const engineInfo = moduleRegistry.getModuleMetadata(engineId);
      return engineInfo ? engineInfo.languages : [];
    }

    if (this.currentEngine) {
      return this.currentEngine.getSupportedLanguages();
    }

    return [];
  }

  async setLanguage(languageCode) {
    if (!this.currentEngine) {
      throw new Error('No engine selected');
    }

    if (this.currentEngine.setLanguage) {
      await this.currentEngine.setLanguage(languageCode);
    } else {
      throw new Error('Language setting not supported by current engine');
    }
  }

  // Engine availability
  isEngineAvailable(engineId) {
    return moduleRegistry.isModuleAvailable(engineId);
  }

  getEngineCount() {
    return moduleRegistry.getAvailableModules().length;
  }

  // Debug information
  getDebugInfo() {
    return {
      currentEngine: this.currentEngine ? this.currentEngine.getInfo() : null,
      isRecording: this.isRecording,
      availableEngines: moduleRegistry.getAvailableModules(),
      registryInfo: moduleRegistry.getDebugInfo()
    };
  }

  // Cleanup
  async cleanup() {
    try {
      if (this.isRecording) {
        await this.stop();
      }

      if (this.currentEngine && this.currentEngine.cleanup) {
        await this.currentEngine.cleanup();
      }

      this.currentEngine = null;
      moduleRegistry.clearLoadedModules();

      console.log('Modular recognition manager cleaned up');
    } catch (error) {
      console.error('Error cleaning up recognition manager:', error);
    }
  }
}

export default ModularRecognitionManager; 