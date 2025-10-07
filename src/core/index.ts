// Core engine exports
export * from './baseguard.js';
export * from './baseline-checker.js';
export { ConfigurationManager, BROWSER_TARGET_PRESETS } from './configuration.js';
export type { PresetName } from './configuration.js';
export { ApiKeyManager } from './api-key-manager.js';
export { GitignoreManager } from './gitignore-manager.js';
export { CacheManager, LRUCache } from './cache-manager.js';
export { FileProcessor } from './file-processor.js';
export { DirectoryFilter } from './directory-filter.js';
export { LazyLoader } from './lazy-loader.js';
export { MemoryManager } from './memory-manager.js';
export { StartupOptimizer } from './startup-optimizer.js';
export { SystemErrorHandler } from './system-error-handler.js';
export { GracefulDegradationManager } from './graceful-degradation-manager.js';
export { ConfigurationRecovery } from './configuration-recovery.js';
export { logger, DebugLogger } from './debug-logger.js';