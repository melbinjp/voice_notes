// Module Registry - Dynamic engine discovery and loading
class ModuleRegistry {
  constructor() {
    this.modules = new Map();
    this.availableModules = [];
    this.loadedModules = new Set();
  }

  // Register a module with its metadata
  registerModule(moduleId, moduleClass, metadata) {
    this.modules.set(moduleId, {
      class: moduleClass,
      metadata: {
        id: moduleId,
        name: metadata.name || moduleId,
        description: metadata.description || '',
        version: metadata.version || '1.0.0',
        author: metadata.author || 'Unknown',
        features: metadata.features || [],
        requirements: metadata.requirements || [],
        supportedFormats: metadata.supportedFormats || [],
        maxFileSize: metadata.maxFileSize || null,
        languages: metadata.languages || [],
        isOnline: metadata.isOnline || false,
        isOffline: metadata.isOffline || false,
        icon: metadata.icon || '🎤',
        priority: metadata.priority || 0,
        ...metadata
      }
    });
    
    console.log(`Module registered: ${moduleId} (${metadata.name})`);
  }

  // Get all available modules with their metadata
  getAvailableModules() {
    return Array.from(this.modules.values()).map(module => ({
      ...module.metadata,
      isLoaded: this.loadedModules.has(module.metadata.id)
    }));
  }

  // Get module metadata
  getModuleMetadata(moduleId) {
    const module = this.modules.get(moduleId);
    return module ? module.metadata : null;
  }

  // Create an instance of a module
  async createModule(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    try {
      const instance = new module.class();
      this.loadedModules.add(moduleId);
      console.log(`Module instance created: ${moduleId}`);
      return instance;
    } catch (error) {
      console.error(`Failed to create module instance: ${moduleId}`, error);
      throw error;
    }
  }

  // Check if a module is available
  async isModuleAvailable(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) return false;

    try {
      const instance = await this.createModule(moduleId);
      const isAvailable = await instance.isAvailable();
      return isAvailable;
    } catch (error) {
      console.error(`Module availability check failed: ${moduleId}`, error);
      return false;
    }
  }

  // Get modules that support specific features
  getModulesWithFeature(feature) {
    return this.getAvailableModules().filter(module => 
      module.features.includes(feature)
    );
  }

  // Get modules that support file transcription
  getModulesWithFileSupport() {
    return this.getAvailableModules().filter(module => 
      module.features.includes('file_transcription')
    );
  }

  // Get modules that support specific file formats
  getModulesSupportingFormat(format) {
    return this.getAvailableModules().filter(module => 
      module.supportedFormats.includes(format)
    );
  }

  // Get modules by type (online/offline)
  getModulesByType(type) {
    if (type === 'online') {
      return this.getAvailableModules().filter(module => module.isOnline);
    } else if (type === 'offline') {
      return this.getAvailableModules().filter(module => module.isOffline);
    }
    return this.getAvailableModules();
  }

  // Get the best available module based on priority and features
  getBestModule(preferredFeatures = []) {
    const available = this.getAvailableModules();
    
    // Sort by priority (higher first) and then by feature match
    return available.sort((a, b) => {
      // First sort by priority
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Then by feature match count
      const aFeatures = preferredFeatures.filter(f => a.features.includes(f)).length;
      const bFeatures = preferredFeatures.filter(f => b.features.includes(f)).length;
      
      return bFeatures - aFeatures;
    })[0];
  }

  // Clear loaded modules
  clearLoadedModules() {
    this.loadedModules.clear();
  }

  // Get debug information
  getDebugInfo() {
    return {
      totalModules: this.modules.size,
      loadedModules: Array.from(this.loadedModules),
      availableModules: this.getAvailableModules(),
      registrySize: this.modules.size
    };
  }
}

// Global module registry instance
const moduleRegistry = new ModuleRegistry();

export default moduleRegistry; 