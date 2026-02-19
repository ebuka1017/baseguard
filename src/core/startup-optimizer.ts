/**
 * Startup optimization manager to minimize initialization time and memory usage
 */
export class StartupOptimizer {
  private static startTime = Date.now();
  private static initialized = false;
  private static gcInterval: NodeJS.Timeout | null = null;
  private static memoryInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize BaseGuard with optimized startup
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const startTime = Date.now();

    try {
      // Start critical dependency loading in background
      await this.preloadCriticalDependencies();

      // Initialize memory management
      this.setupMemoryOptimizations();

      this.initialized = true;

      const initTime = Date.now() - startTime;
      if (initTime > 1000) {
        console.warn(`Slow startup detected: ${initTime}ms`);
      }
    } catch (error) {
      console.warn('Startup optimization failed:', error);
      this.initialized = true; // Continue anyway
    }
  }

  /**
   * Preload critical dependencies without blocking
   */
  private static async preloadCriticalDependencies(): Promise<void> {
    // Start loading critical dependencies in parallel
    const criticalLoads = [
      LazyLoader.getWebFeatures().catch(() => {}),
      LazyLoader.getBabelParser().catch(() => {})
    ];

    // Don't wait for all to complete - just start the loading process
    Promise.all(criticalLoads);
  }

  /**
   * Setup memory optimizations
   */
  private static setupMemoryOptimizations(): void {
    // Enable garbage collection hints if available
    if (global.gc) {
      // Set up periodic GC for long-running processes
      this.gcInterval = setInterval(() => {
        const memCheck = MemoryManager.checkMemoryUsage();
        
        if (memCheck.warning) {
          MemoryManager.tryGarbageCollect();
        }
      }, 30000); // Check every 30 seconds
      this.gcInterval.unref();
    }

    // Setup process memory monitoring
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        console.warn('Memory warning: Too many event listeners');
      }
    });
  }

  /**
   * Get startup performance metrics
   */
  static getStartupMetrics(): {
    totalStartupTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    nodeVersion: string;
    platform: string;
  } {
    return {
      totalStartupTime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Optimize for specific use cases
   */
  static async optimizeForUseCase(useCase: 'check' | 'fix' | 'init'): Promise<void> {
    switch (useCase) {
      case 'check':
        // Preload parsing and baseline checking dependencies
        LazyLoader.getWebFeatures().catch(() => {});
        LazyLoader.getBabelParser().catch(() => {});
        LazyLoader.getPostCSS().catch(() => {});
        break;

      case 'fix':
        // Preload all dependencies including AI services
        LazyLoader.preloadCommon();
        break;

      case 'init':
        // Minimal loading for initialization
        break;
    }
  }

  /**
   * Clean up resources and optimize memory
   */
  static cleanup(): void {
    // Clear intervals
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }

    // Clear caches
    LazyLoader.clearCache();
    
    // Force garbage collection if available
    MemoryManager.tryGarbageCollect();
  }

  /**
   * Check if startup optimizations are working
   */
  static validateOptimizations(): {
    isOptimized: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    const metrics = this.getStartupMetrics();
    
    // Check startup time
    if (metrics.totalStartupTime > 2000) {
      issues.push(`Slow startup: ${metrics.totalStartupTime}ms`);
      recommendations.push('Consider reducing dependencies or using lazy loading');
    }

    // Check memory usage
    const heapUsedMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 50) {
      issues.push(`High memory usage: ${Math.round(heapUsedMB)}MB`);
      recommendations.push('Consider optimizing data structures or clearing caches');
    }

    // Check Node.js version
    const nodeVersion = parseInt(metrics.nodeVersion.slice(1));
    if (nodeVersion < 18) {
      issues.push(`Old Node.js version: ${metrics.nodeVersion}`);
      recommendations.push('Upgrade to Node.js 18+ for better performance');
    }

    return {
      isOptimized: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Optimize memory usage by reducing object overhead
   */
  static optimizeMemoryUsage(): void {
    // Enable V8 memory optimizations if available
    if (process.env.NODE_ENV !== 'development') {
      // Set V8 flags for better memory management
      process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --max-old-space-size=512 --optimize-for-size';
    }

    // Setup memory monitoring
    if (global.gc) {
      this.memoryInterval = setInterval(() => {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        
        // Force GC if memory usage is high
        if (heapUsedMB > 100 && global.gc) {
          global.gc();
        }
      }, 30000);
      this.memoryInterval.unref();
    }
  }

  /**
   * Reduce startup time by deferring non-critical operations
   */
  static async deferNonCriticalOperations(): Promise<void> {
    // Defer heavy operations until after startup
    setTimeout(async () => {
      try {
        // Preload remaining dependencies
        const { LazyLoader } = await import('./lazy-loader.js');
        LazyLoader.preloadCommon();
        
        // Initialize caches
        // Cleanup old logs
        const { logger } = await import('./debug-logger.js');
        logger.cleanupOldLogs().catch(() => {});
      } catch (error) {
        // Ignore errors in deferred operations
      }
    }, 100); // Defer by 100ms
  }

  /**
   * Optimize startup by preloading critical dependencies
   */
  static async optimizeStartup(): Promise<void> {
    // Start loading critical dependencies in background
    const criticalLoads = [
      LazyLoader.getWebFeatures().catch(() => {}),
      LazyLoader.getBabelParser().catch(() => {})
    ];

    // Don't wait for all to complete, just start the process
    Promise.all(criticalLoads);
    
    // Setup memory optimizations
    this.optimizeMemoryUsage();
    
    // Defer non-critical operations
    this.deferNonCriticalOperations();
  }
}
import { LazyLoader } from './lazy-loader.js';
import { MemoryManager } from './memory-manager.js';
