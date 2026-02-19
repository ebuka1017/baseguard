/**
 * Lazy loading system for heavy dependencies and parsers
 */
export class LazyLoader {
  private static instances = new Map<string, any>();
  private static loadPromises = new Map<string, Promise<any>>();

  /**
   * Lazy load web-features package
   */
  static async getWebFeatures(): Promise<any> {
    const key = 'web-features';
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.loadPromises.has(key)) {
      return this.loadPromises.get(key);
    }

    const loadPromise = this.loadWebFeatures();
    this.loadPromises.set(key, loadPromise);

    try {
      const webFeatures = await loadPromise;
      this.instances.set(key, webFeatures);
      this.loadPromises.delete(key);
      return webFeatures;
    } catch (error) {
      this.loadPromises.delete(key);
      throw error;
    }
  }

  /**
   * Lazy load Babel parser
   */
  static async getBabelParser(): Promise<any> {
    const key = 'babel-parser';
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.loadPromises.has(key)) {
      return this.loadPromises.get(key);
    }

    const loadPromise = import('@babel/parser');
    this.loadPromises.set(key, loadPromise);

    try {
      const parser = await loadPromise;
      this.instances.set(key, parser);
      this.loadPromises.delete(key);
      return parser;
    } catch (error) {
      this.loadPromises.delete(key);
      throw error;
    }
  }

  /**
   * Lazy load Babel traverse
   */
  static async getBabelTraverse(): Promise<any> {
    const key = 'babel-traverse';
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.loadPromises.has(key)) {
      return this.loadPromises.get(key);
    }

    const loadPromise = import('@babel/traverse');
    this.loadPromises.set(key, loadPromise);

    try {
      const traverseModule = await loadPromise;
      const traverseExport = traverseModule.default || traverseModule;
      const traverse =
        typeof traverseExport === 'function'
          ? traverseExport
          : (traverseExport as any)?.default;

      if (typeof traverse !== 'function') {
        throw new Error('Failed to resolve @babel/traverse default export');
      }

      this.instances.set(key, traverse);
      this.loadPromises.delete(key);
      return this.instances.get(key);
    } catch (error) {
      this.loadPromises.delete(key);
      throw error;
    }
  }

  /**
   * Lazy load PostCSS
   */
  static async getPostCSS(): Promise<any> {
    const key = 'postcss';
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.loadPromises.has(key)) {
      return this.loadPromises.get(key);
    }

    const loadPromise = import('postcss');
    this.loadPromises.set(key, loadPromise);

    try {
      const postcss = await loadPromise;
      this.instances.set(key, postcss.default || postcss);
      this.loadPromises.delete(key);
      return this.instances.get(key);
    } catch (error) {
      this.loadPromises.delete(key);
      throw error;
    }
  }

  /**
   * Lazy load Vue compiler
   */
  static async getVueCompiler(): Promise<any> {
    const key = 'vue-compiler';
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.loadPromises.has(key)) {
      return this.loadPromises.get(key);
    }

    const loadPromise = import('@vue/compiler-sfc');
    this.loadPromises.set(key, loadPromise);

    try {
      const compiler = await loadPromise;
      this.instances.set(key, compiler);
      this.loadPromises.delete(key);
      return compiler;
    } catch (error) {
      this.loadPromises.delete(key);
      throw error;
    }
  }

  /**
   * Lazy load Svelte compiler
   */
  static async getSvelteCompiler(): Promise<any> {
    const key = 'svelte-compiler';
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.loadPromises.has(key)) {
      return this.loadPromises.get(key);
    }

    const loadPromise = import('svelte/compiler');
    this.loadPromises.set(key, loadPromise);

    try {
      const compiler = await loadPromise;
      this.instances.set(key, compiler);
      this.loadPromises.delete(key);
      return compiler;
    } catch (error) {
      this.loadPromises.delete(key);
      throw error;
    }
  }

  /**
   * Preload commonly used dependencies
   */
  static async preloadCommon(): Promise<void> {
    // Preload in background without blocking
    Promise.all([
      this.getWebFeatures().catch(() => {}),
      this.getBabelParser().catch(() => {}),
      this.getPostCSS().catch(() => {})
    ]);
  }

  /**
   * Clear all cached instances (for testing)
   */
  static clearCache(): void {
    this.instances.clear();
    this.loadPromises.clear();
  }

  /**
   * Get memory usage statistics
   */
  static getStats(): {
    loadedModules: string[];
    pendingLoads: string[];
    memoryUsage?: NodeJS.MemoryUsage;
  } {
    return {
      loadedModules: Array.from(this.instances.keys()),
      pendingLoads: Array.from(this.loadPromises.keys()),
      memoryUsage: process.memoryUsage ? process.memoryUsage() : undefined
    };
  }

  /**
   * Load web-features with optimized loading
   */
  private static async loadWebFeatures(): Promise<any> {
    try {
      // Try to load web-features package
      const webFeatures = await import('web-features');
      
      // Extract only the data we need to reduce memory usage
      const optimizedData = this.optimizeWebFeaturesData(webFeatures.default || webFeatures);
      
      return optimizedData;
    } catch (error) {
      console.warn('Failed to load web-features package:', error);
      // Return minimal fallback data
      return {
        features: {},
        browsers: {},
        groups: {}
      };
    }
  }

  /**
   * Optimize web-features data to reduce memory usage
   */
  private static optimizeWebFeaturesData(webFeatures: any): any {
    if (!webFeatures) {
      return { features: {}, browsers: {}, groups: {} };
    }

    // Handle both direct export and features property
    const featuresData = webFeatures.features || webFeatures;
    
    if (!featuresData || typeof featuresData !== 'object') {
      return { features: {}, browsers: {}, groups: {} };
    }

    // Create optimized structure with only essential data
    const optimized = {
      features: {} as any,
      browsers: webFeatures.browsers || {},
      groups: webFeatures.groups || {}
    };

    // Only keep essential feature data to reduce memory footprint
    for (const [featureId, feature] of Object.entries(featuresData)) {
      const f = feature as any;
      
      // Skip if not a valid feature object
      if (!f || typeof f !== 'object') {
        continue;
      }

      // Only store essential compatibility data
      optimized.features[featureId] = {
        name: f.name,
        status: f.status ? {
          baseline: f.status.baseline,
          support: f.status.support
        } : null,
        // Skip heavy data like descriptions, specs, caniuse data, etc.
      };
    }

    return optimized;
  }

  /**
   * Get startup performance statistics
   */
  static getStartupStats(): {
    loadedModules: string[];
    pendingLoads: string[];
    startupTime?: number;
  } {
    return {
      loadedModules: Array.from(this.instances.keys()),
      pendingLoads: Array.from(this.loadPromises.keys()),
      startupTime: process.uptime ? Math.round(process.uptime() * 1000) : undefined
    };
  }

  /**
   * Optimize startup by preloading critical dependencies
   */
  static async optimizeStartup(): Promise<void> {
    // Start loading critical dependencies in background
    const criticalLoads = [
      this.getWebFeatures().catch(() => {}),
      this.getBabelParser().catch(() => {})
    ];

    // Don't wait for all to complete, just start the process
    Promise.all(criticalLoads);
  }
}
