// Module Loader - Ensures all engine modules are loaded and registered
import moduleRegistry from './module-registry.js?v=7';

// Import all engine modules to trigger auto-registration
import './engines/webspeech-engine.js?v=7';
import './engines/whisper-engine.js?v=7';

// Export the module registry for use by other modules
export default moduleRegistry;

// Log registration status
console.log('Module loader initialized');
console.log('Registered modules:', moduleRegistry.getAvailableModules().map(m => m.name)); 