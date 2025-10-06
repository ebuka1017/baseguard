/**
 * Startup optimization manager to minimize initialization time and memory usage
 */
export class StartupOptimizer {
  private static startTime = Date.now();
  private static initialized = false;

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
      if (initTime > 200) {
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
    const { LazyLoader } = await import('./lazy-loader.js');
    
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
      setInterval(() => {
        const { MemoryManager } = require('./memory-manager.js');
        const memCheck = MemoryManager.checkMemoryUsage();
        
        if (memCheck.warning) {
          MemoryManager.tryGarbageCollect();
        }
      }, 30000); // Check every 30 seconds
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
    const { LazyLoader } = await import('./lazy-loader.js');

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
    const { LazyLoader } = require('./lazy-loader.js');
    const { MemoryManager } = require('./memory-manager.js');

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
    if (metrics.totalStartupTime > 500) {
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
}