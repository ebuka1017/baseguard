import type { BrowserTarget, Violation, DetectedFeature, CompatibilityResult } from '../types/index.js';
import { LazyLoader } from './lazy-loader.js';
import { MemoryManager } from './memory-manager.js';

// Comprehensive feature mapping dictionary for ALL web platform features
const FEATURE_ID_MAP: Record<string, string> = {
  // CSS Properties
  'container-type': 'container-queries',
  'container-name': 'container-queries',
  'container': 'container-queries',
  'aspect-ratio': 'aspect-ratio',
  'gap': 'grid-gap',
  'row-gap': 'grid-gap',
  'column-gap': 'grid-gap',
  'scroll-behavior': 'scroll-behavior',
  'backdrop-filter': 'backdrop-filter',
  'color-scheme': 'color-scheme',
  'accent-color': 'accent-color',
  'overscroll-behavior': 'overscroll-behavior',
  'scroll-snap-type': 'scroll-snap-type',
  'scroll-snap-align': 'scroll-snap-align',
  'object-fit': 'object-fit',
  'object-position': 'object-position',
  'place-items': 'place-items',
  'place-content': 'place-content',
  'place-self': 'place-self',
  'inset': 'inset',
  'inset-block': 'inset',
  'inset-inline': 'inset',
  'block-size': 'logical-properties',
  'inline-size': 'logical-properties',
  'margin-block': 'logical-properties',
  'margin-inline': 'logical-properties',
  'padding-block': 'logical-properties',
  'padding-inline': 'logical-properties',
  'border-block': 'logical-properties',
  'border-inline': 'logical-properties',

  // CSS Selectors
  ':has()': 'has',
  ':is()': 'is',
  ':where()': 'where',
  ':focus-visible': 'focus-visible',
  ':focus-within': 'focus-within',
  ':target-within': 'target-within',
  '::backdrop': 'backdrop',
  '::marker': 'marker',
  '::part()': 'part',
  '::slotted()': 'slotted',

  // CSS At-rules
  '@supports': 'supports',
  '@container': 'container-queries',
  '@layer': 'cascade-layers',
  '@scope': 'scope',

  // JavaScript Web APIs
  'HTMLDialogElement.showModal': 'dialog',
  'HTMLDialogElement.show': 'dialog',
  'HTMLDialogElement.close': 'dialog',
  'structuredClone': 'structured-clone',
  'Array.prototype.at': 'array-at',
  'Array.prototype.findLast': 'array-find-last',
  'Array.prototype.findLastIndex': 'array-find-last',
  'String.prototype.at': 'string-at',
  'String.prototype.replaceAll': 'string-replace-all',
  'Object.hasOwn': 'object-has-own',
  'ResizeObserver': 'resize-observer',
  'IntersectionObserver': 'intersection-observer',
  'MutationObserver': 'mutation-observer',
  'PerformanceObserver': 'performance-observer',
  'BroadcastChannel': 'broadcast-channel',
  'MessageChannel': 'message-channel',
  'SharedArrayBuffer': 'shared-array-buffer',
  'Atomics': 'atomics',
  'BigInt': 'bigint',
  'WeakRef': 'weak-ref',
  'FinalizationRegistry': 'finalization-registry',

  // Canvas and WebGL APIs
  'CanvasRenderingContext2D.filter': 'canvas-filter',
  'CanvasRenderingContext2D.reset': 'canvas-reset',
  'WebGL2RenderingContext': 'webgl2',
  'OffscreenCanvas': 'offscreen-canvas',
  'OffscreenCanvasRenderingContext2D': 'offscreen-canvas',
  'ImageBitmap': 'image-bitmap',
  'createImageBitmap': 'image-bitmap',
  'Path2D': 'path2d',

  // WebRTC APIs
  'RTCPeerConnection': 'webrtc',
  'getUserMedia': 'getusermedia',
  'RTCDataChannel': 'rtc-data-channel',
  'RTCRtpTransceiver': 'rtc-rtp-transceiver',
  'RTCStatsReport': 'rtc-stats',
  'RTCIceCandidate': 'rtc-ice-candidate',
  'RTCSessionDescription': 'rtc-session-description',

  // Service Workers and PWA
  'ServiceWorker': 'service-workers',
  'navigator.serviceWorker': 'service-workers',
  'ServiceWorkerRegistration': 'service-workers',
  'Cache': 'cache-api',
  'CacheStorage': 'cache-api',
  'PushManager': 'push-api',
  'PushSubscription': 'push-api',
  'NotificationEvent': 'notification-api',
  'BackgroundSync': 'background-sync',
  'PaymentRequest': 'payment-request',
  'PaymentResponse': 'payment-request',

  // WebAssembly
  'WebAssembly': 'webassembly',
  'WebAssembly.instantiate': 'webassembly',
  'WebAssembly.compile': 'webassembly',
  'WebAssembly.Module': 'webassembly',
  'WebAssembly.Instance': 'webassembly',
  'WebAssembly.Memory': 'webassembly',
  'WebAssembly.Table': 'webassembly',

  // JavaScript Syntax (ECMAScript features)
  'optional-chaining': 'optional-chaining',
  'nullish-coalescing': 'nullish-coalescing',
  'private-fields': 'private-fields',
  'private-methods': 'private-methods',
  'static-class-fields': 'static-class-fields',
  'top-level-await': 'top-level-await',
  'import-assertions': 'import-assertions',
  'import-meta': 'import-meta',
  'dynamic-import': 'dynamic-import',
  'async-iteration': 'async-iteration',
  'for-await-of': 'async-iteration',
  'destructuring': 'destructuring',
  'rest-spread': 'rest-spread',
  'template-literals': 'template-literals',
  'arrow-functions': 'arrow-functions',
  'const-let': 'const-let',
  'default-parameters': 'default-parameters',

  // HTML Elements and Attributes
  'dialog': 'dialog',
  'details': 'details-summary',
  'summary': 'details-summary',
  'loading="lazy"': 'loading-lazy',
  'decoding="async"': 'image-decoding',
  'input[type="date"]': 'input-date',
  'input[type="time"]': 'input-time',
  'input[type="datetime-local"]': 'input-datetime-local',
  'input[type="month"]': 'input-month',
  'input[type="week"]': 'input-week',
  'input[type="color"]': 'input-color',
  'input[type="range"]': 'input-range',
  'input[type="search"]': 'input-search',
  'input[type="tel"]': 'input-tel',
  'input[type="url"]': 'input-url',
  'input[type="email"]': 'input-email',
  'input[type="number"]': 'input-number',
  'datalist': 'datalist',
  'output': 'output',
  'progress': 'progress',
  'meter': 'meter',
  'picture': 'picture',
  'source': 'picture',
  'track': 'track',
  'slot': 'slot',
  'template': 'template',

  // DOM APIs
  'DOMMatrix': 'geometry-interfaces',
  'DOMPoint': 'geometry-interfaces',
  'DOMRect': 'geometry-interfaces',
  'DOMQuad': 'geometry-interfaces',
  'AbortController': 'abort-controller',
  'AbortSignal': 'abort-controller',
  'FormData': 'form-data',
  'URLSearchParams': 'url-search-params',
  'URL': 'url',
  'URLPattern': 'url-pattern',
  'Blob': 'blob',
  'File': 'file',
  'FileReader': 'file-reader',
  'FileList': 'file-list',
  'DataTransfer': 'data-transfer',
  'ClipboardAPI': 'clipboard-api',
  'navigator.clipboard': 'clipboard-api',
  'Permissions': 'permissions-api',
  'navigator.permissions': 'permissions-api',
  'Geolocation': 'geolocation',
  'navigator.geolocation': 'geolocation',
  'DeviceOrientationEvent': 'device-orientation',
  'DeviceMotionEvent': 'device-motion',
  'Vibration': 'vibration',
  'navigator.vibrate': 'vibration',
  'Battery': 'battery-status',
  'navigator.getBattery': 'battery-status',
  'NetworkInformation': 'network-information',
  'navigator.connection': 'network-information',
  'MediaDevices': 'media-devices',
  'navigator.mediaDevices': 'media-devices',
  'MediaStream': 'media-stream',
  'MediaRecorder': 'media-recorder',
  'SpeechSynthesis': 'speech-synthesis',
  'SpeechRecognition': 'speech-recognition',
  'Gamepad': 'gamepad',
  'navigator.getGamepads': 'gamepad',
  'PointerEvent': 'pointer-events',
  'TouchEvent': 'touch-events',
  'WheelEvent': 'wheel-events',
  'KeyboardEvent': 'keyboard-events',
  'MouseEvent': 'mouse-events',
  'FocusEvent': 'focus-events',
  'InputEvent': 'input-events',
  'CompositionEvent': 'composition-events',
  'CustomEvent': 'custom-events',
  'EventTarget': 'event-target',
  'addEventListener': 'event-listeners',
  'removeEventListener': 'event-listeners',
  'dispatchEvent': 'event-dispatch',
  'requestAnimationFrame': 'request-animation-frame',
  'cancelAnimationFrame': 'request-animation-frame',
  'requestIdleCallback': 'request-idle-callback',
  'cancelIdleCallback': 'request-idle-callback',
  'setTimeout': 'timers',
  'setInterval': 'timers',
  'clearTimeout': 'timers',
  'clearInterval': 'timers',
  'queueMicrotask': 'queue-microtask',
  'fetch': 'fetch',
  'Request': 'fetch',
  'Response': 'fetch',
  'Headers': 'fetch',
  'XMLHttpRequest': 'xhr',
  'EventSource': 'server-sent-events',
  'WebSocket': 'websockets',
  'History': 'history-api',
  'history.pushState': 'history-api',
  'history.replaceState': 'history-api',
  'Location': 'location',
  'Navigator': 'navigator',
  'Screen': 'screen',
  'Window': 'window',
  'Document': 'document',
  'Element': 'element',
  'Node': 'node',
  'DocumentFragment': 'document-fragment',
  'ShadowRoot': 'shadow-dom',
  'customElements': 'custom-elements',
  'HTMLElement': 'html-element',
  'SVGElement': 'svg-element'
};

export class BaselineChecker {
  private webFeatures: any = null;
  private featureCache = new Map<string, any>();
  private initialized = false;

  constructor() {
    // Don't load web-features immediately - use lazy loading
  }

  /**
   * Initialize web-features data lazily
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.webFeatures = await LazyLoader.getWebFeatures();
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to load web-features data:', error);
      this.webFeatures = { features: {}, browsers: {}, groups: {} };
      this.initialized = true;
    }
  }

  /**
   * Get feature status from web-features package with caching
   */
  private async getFeatureStatus(featureId: string): Promise<any> {
    await this.ensureInitialized();

    // Check cache first
    if (this.featureCache.has(featureId)) {
      return this.featureCache.get(featureId);
    }

    const feature = this.webFeatures?.features?.[featureId] || this.webFeatures?.[featureId];
    
    // Cache the result to avoid repeated lookups
    if (feature) {
      // Optimize the feature data to reduce memory usage
      const optimized = MemoryManager.optimizeObject({
        name: feature.name,
        status: feature.status,
        support: feature.support,
        baseline: feature.baseline
      });
      this.featureCache.set(featureId, optimized);
      return optimized;
    }

    // Cache null results too to avoid repeated failed lookups
    this.featureCache.set(featureId, null);
    return null;
  }

  /**
   * Map detected feature to web-features ID
   */
  private mapFeatureToId(feature: string): string | null {
    // Direct mapping
    if (FEATURE_ID_MAP[feature]) {
      return FEATURE_ID_MAP[feature];
    }

    // Try to find partial matches for complex features
    for (const [key, value] of Object.entries(FEATURE_ID_MAP)) {
      if (feature.includes(key) || key.includes(feature)) {
        return value;
      }
    }

    // Check if the feature exists directly in web-features
    if (this.webFeatures?.[feature] || this.webFeatures?.features?.[feature]) {
      return feature;
    }

    return null;
  }

  /**
   * Check if a version is supported based on browser support data
   */
  private isVersionSupported(browserSupport: any, minVersion: string): boolean {
    if (!browserSupport) return false;

    // If browser support is true, it's supported
    if (browserSupport === true) return true;

    // If browser support is false or null, it's not supported
    if (!browserSupport) return false;

    // If it's a version string, compare versions
    if (typeof browserSupport === 'string') {
      // browserSupport represents the first supporting version.
      // A target is compatible only when support starts at or before the target version.
      return this.compareVersions(browserSupport, minVersion) <= 0;
    }

    // If it's an object with version info, extract the version
    if (typeof browserSupport === 'object' && browserSupport.version) {
      return this.compareVersions(browserSupport.version, minVersion) <= 0;
    }

    return false;
  }

  /**
   * Compare two version strings
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }

  /**
   * Map browser name to web-features format
   */
  private mapBrowserName(browser: string): string {
    const browserMap: Record<string, string> = {
      'chrome': 'chrome',
      'firefox': 'firefox',
      'safari': 'safari',
      'edge': 'edge',
      'opera': 'opera',
      'samsung': 'samsung_android'
    };

    return browserMap[browser] || browser;
  }

  /**
   * Create a violation object
   */
  private createViolation(
    detectedFeature: DetectedFeature,
    target: BrowserTarget,
    featureData: any,
    featureId: string
  ): Violation {
    const browserKey = this.mapBrowserName(target.browser);
    const support = featureData?.status?.support;
    const browserSupport = support ? (support as any)[browserKey] : undefined;
    const baselineStatus = featureData?.status?.baseline;

    let actual: string | false = false;
    if (browserSupport === true) {
      actual = 'supported';
    } else if (typeof browserSupport === 'string') {
      actual = browserSupport;
    } else if (typeof browserSupport === 'object' && browserSupport?.version) {
      actual = browserSupport.version;
    }

    let reason = '';
    if (target.minVersion === 'baseline' || target.minVersion === 'baseline-newly') {
      if (baselineStatus === false) {
        reason = 'Feature is not part of Baseline (not supported across all major browsers)';
      } else if (baselineStatus === 'limited') {
        reason = 'Feature has limited Baseline support';
      }
    } else {
      reason = `Feature requires ${target.browser} ${actual || 'unknown'} but target is ${target.minVersion}`;
    }

    return {
      feature: detectedFeature.feature,
      featureId,
      file: detectedFeature.file || 'unknown',
      line: detectedFeature.line,
      column: detectedFeature.column,
      context: detectedFeature.context,
      browser: target.browser,
      required: target.minVersion,
      actual,
      baselineStatus: baselineStatus === false ? 'false' : baselineStatus === true ? 'widely' : String(baselineStatus || 'unknown'),
      reason
    };
  }

  /**
   * Check compatibility of a detected feature against browser targets
   */
  async checkCompatibility(detectedFeature: DetectedFeature, targets: BrowserTarget[]): Promise<CompatibilityResult> {
    await this.ensureInitialized();
    const featureId = this.mapFeatureToId(detectedFeature.feature);

    if (!featureId) {
      // Feature not found in mapping, assume it's compatible
      return {
        violations: [],
        featureData: null
      };
    }

    const featureData = await this.getFeatureStatus(featureId);

    if (!featureData) {
      // Feature not found in web-features, assume it's compatible
      return {
        violations: [],
        featureData: null
      };
    }

    const violations: Violation[] = [];

    for (const target of targets) {
      if (target.minVersion === 'baseline' || target.minVersion === 'baseline-newly') {
        // Check baseline status
        const baselineStatus = featureData.status?.baseline;

        if (target.minVersion === 'baseline' && baselineStatus !== 'high') {
          violations.push(this.createViolation(detectedFeature, target, featureData, featureId));
        } else if (target.minVersion === 'baseline-newly' && baselineStatus === false) {
          violations.push(this.createViolation(detectedFeature, target, featureData, featureId));
        }
      } else {
        // Check specific version - map browser names to web-features format
        const browserKey = this.mapBrowserName(target.browser);
        const support = featureData.status?.support;
        const browserSupport = support ? (support as any)[browserKey] : undefined;

        if (!this.isVersionSupported(browserSupport, target.minVersion)) {
          violations.push(this.createViolation(detectedFeature, target, featureData, featureId));
        }
      }
    }

    return {
      violations,
      featureData
    };
  }

  /**
   * Check multiple features against browser targets with memory optimization
   */
  async checkMultipleFeatures(detectedFeatures: DetectedFeature[], targets: BrowserTarget[]): Promise<Violation[]> {
    const violationTracker = MemoryManager.createViolationTracker();

    // Process in batches to manage memory usage
    await MemoryManager.processBatches(
      detectedFeatures,
      async (batch) => {
        const batchResults = await Promise.all(
          batch.map(feature => this.checkCompatibility(feature, targets))
        );
        
        for (const result of batchResults) {
          for (const violation of result.violations) {
            violationTracker.addViolation(violation);
          }
        }
        
        return [];
      },
      50 // Process 50 features at a time
    );

    return violationTracker.getViolations();
  }

  /**
   * Get available feature IDs for debugging/testing
   */
  async getAvailableFeatureIds(): Promise<string[]> {
    await this.ensureInitialized();
    return Object.keys(this.webFeatures?.features || this.webFeatures || {});
  }

  /**
   * Clear caches to free memory
   */
  clearCache(): void {
    this.featureCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    memoryEstimate: string;
  } {
    const cacheSize = this.featureCache.size;
    const memoryEstimate = `${Math.round(cacheSize * 500 / 1024)}KB`; // Rough estimate
    
    return {
      cacheSize,
      memoryEstimate
    };
  }

  /**
   * Get feature mapping for debugging/testing
   */
  getFeatureMapping(): Record<string, string> {
    return { ...FEATURE_ID_MAP };
  }
}
