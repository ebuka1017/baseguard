import type { DetectedFeature } from '../types/index.js';
import webFeatures from 'web-features';

/**
 * Comprehensive web-features validation and filtering system
 * Validates detected features against the complete web-features package
 * and filters out framework-specific features while capturing all web platform scope
 */
export class FeatureValidator {
  private readonly FEATURE_ID_MAP: Map<string, string>;
  private readonly FRAMEWORK_SPECIFIC_PATTERNS: RegExp[];
  
  constructor() {
    this.FEATURE_ID_MAP = this.buildFeatureIdMap();
    this.FRAMEWORK_SPECIFIC_PATTERNS = this.buildFrameworkPatterns();
  }

  /**
   * Validate and filter detected features against web-features package
   */
  async validateFeatures(
    detectedFeatures: DetectedFeature[],
    concurrency: number = 10
  ): Promise<DetectedFeature[]> {
    const validFeatures: DetectedFeature[] = [];
    
    // Process features in batches for performance
    const batches = this.createBatches(detectedFeatures, concurrency);
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(feature => this.validateSingleFeature(feature))
      );
      
      validFeatures.push(...batchResults.filter(Boolean) as DetectedFeature[]);
    }
    
    return this.deduplicateFeatures(validFeatures);
  }

  /**
   * Validate a single feature against web-features package
   */
  private async validateSingleFeature(feature: DetectedFeature): Promise<DetectedFeature | null> {
    try {
      // Skip framework-specific features
      if (this.isFrameworkSpecific(feature.feature)) {
        return null;
      }

      // Map feature to web-features ID
      const webFeatureId = this.mapToWebFeatureId(feature.feature);
      if (!webFeatureId) {
        return null;
      }

      // Validate against web-features package
      const webFeatureData = webFeatures[webFeatureId];
      if (!webFeatureData) {
        return null;
      }

      // Return validated feature with enhanced metadata
      return {
        ...feature,
        feature: webFeatureId, // Use standardized web-features ID
        context: this.enhanceContext(feature.context, feature.type)
      };

    } catch (error) {
      console.warn(`Warning: Could not validate feature ${feature.feature}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Build comprehensive feature ID mapping for ALL web platform technologies
   */
  private buildFeatureIdMap(): Map<string, string> {
    const map = new Map<string, string>();

    // CSS Properties mapping
    const cssPropertyMap = {
      // Container Queries
      'container-type': 'container-queries',
      'container-name': 'container-queries',
      'container': 'container-queries',
      
      // Grid Layout
      'display': 'css-grid',
      'grid-template-columns': 'css-grid',
      'grid-template-rows': 'css-grid',
      'grid-template-areas': 'css-grid',
      'grid-column': 'css-grid',
      'grid-row': 'css-grid',
      'grid-area': 'css-grid',
      'gap': 'css-grid-gap',
      'grid-gap': 'css-grid-gap',
      'column-gap': 'css-grid-gap',
      'row-gap': 'css-grid-gap',
      
      // Flexbox
      'flex': 'flexbox',
      'flex-direction': 'flexbox',
      'flex-wrap': 'flexbox',
      'justify-content': 'flexbox',
      'align-items': 'flexbox',
      'align-content': 'flexbox',
      'align-self': 'flexbox',
      
      // Modern Layout
      'aspect-ratio': 'aspect-ratio',
      'object-fit': 'object-fit',
      'object-position': 'object-fit',
      
      // Visual Effects
      'backdrop-filter': 'backdrop-filter',
      'filter': 'css-filters',
      'mix-blend-mode': 'css-mixblendmode',
      'clip-path': 'css-clip-path',
      'mask': 'css-masks',
      
      // Color & Appearance
      'color-scheme': 'color-scheme',
      'accent-color': 'accent-color',
      
      // Scrolling
      'scroll-behavior': 'scroll-behavior',
      'scroll-snap-type': 'scroll-snap',
      'scroll-snap-align': 'scroll-snap',
      'overscroll-behavior': 'overscroll-behavior',
      
      // Interaction
      'touch-action': 'touch-action',
      'user-select': 'user-select',
      
      // Custom Properties
      '--': 'css-variables',
      'var(': 'css-variables',
      
      // Functions
      'calc(': 'calc',
      'clamp(': 'css-math-functions',
      'min(': 'css-math-functions',
      'max(': 'css-math-functions',
      
      // Transforms & Animations
      'transform': 'transforms2d',
      'transform-origin': 'transforms2d',
      'perspective': 'transforms3d',
      'animation': 'css-animation',
      'transition': 'css-transitions',
      'will-change': 'will-change',
      'contain': 'css-containment',
      'content-visibility': 'content-visibility'
    };

    // CSS Selectors mapping
    const cssSelectorMap = {
      ':has()': 'css-has',
      ':is()': 'css-matches-pseudo',
      ':where()': 'css-where-pseudo',
      ':focus-visible': 'focus-visible',
      ':focus-within': 'focus-within',
      '::backdrop': 'backdrop',
      '::placeholder': 'placeholder',
      '::marker': 'css-marker-pseudo'
    };

    // JavaScript APIs mapping
    const jsApiMap = {
      // Canvas APIs
      'getContext': 'canvas',
      'CanvasRenderingContext2D': 'canvas',
      'WebGLRenderingContext': 'webgl',
      'WebGL2RenderingContext': 'webgl2',
      'OffscreenCanvas': 'offscreen-canvas',
      'ImageBitmap': 'createimagebitmap',
      'createImageBitmap': 'createimagebitmap',
      'Path2D': 'path2d',
      
      // WebRTC APIs
      'RTCPeerConnection': 'rtcpeerconnection',
      'RTCDataChannel': 'rtcdatachannel',
      'getUserMedia': 'getusermedia',
      'getDisplayMedia': 'getdisplaymedia',
      'MediaStream': 'mediastream',
      
      // WebAssembly
      'WebAssembly': 'wasm',
      'WebAssembly.instantiate': 'wasm',
      'WebAssembly.compile': 'wasm',
      
      // Service Workers
      'ServiceWorker': 'serviceworkers',
      'navigator.serviceWorker': 'serviceworkers',
      'Cache': 'cache',
      'caches': 'cache',
      'PushManager': 'push-api',
      'Notification': 'notifications',
      
      // DOM APIs
      'querySelector': 'queryselector',
      'querySelectorAll': 'queryselector',
      'addEventListener': 'addeventlistener',
      'CustomEvent': 'customevent',
      'MutationObserver': 'mutationobserver',
      'ResizeObserver': 'resizeobserver',
      'IntersectionObserver': 'intersectionobserver',
      'AbortController': 'abortcontroller',
      'FormData': 'formdata',
      'URLSearchParams': 'urlsearchparams',
      'URL': 'url',
      
      // Fetch API
      'fetch': 'fetch',
      'Request': 'fetch',
      'Response': 'fetch',
      'Headers': 'fetch',
      
      // File APIs
      'Blob': 'fileapi',
      'File': 'fileapi',
      'FileReader': 'filereader',
      
      // Storage APIs
      'localStorage': 'localstorage',
      'sessionStorage': 'sessionstorage',
      'indexedDB': 'indexeddb',
      
      // Crypto APIs
      'crypto': 'cryptography',
      'crypto.getRandomValues': 'getrandomvalues',
      'crypto.subtle': 'subtlecrypto',
      
      // Performance APIs
      'performance': 'high-resolution-time',
      'performance.now': 'high-resolution-time',
      'PerformanceObserver': 'performance-observer',
      
      // Audio/Video APIs
      'AudioContext': 'audio-api',
      'MediaRecorder': 'mediarecorder',
      'MediaSource': 'mediasource',
      'HTMLMediaElement': 'audio',
      
      // Modern JavaScript APIs
      'structuredClone': 'structured-clone',
      'WeakRef': 'weakrefs',
      'FinalizationRegistry': 'weakrefs',
      'AggregateError': 'promise-any',
      
      // ECMAScript features
      'optional-chaining': 'optional-chaining',
      'nullish-coalescing': 'nullish-coalescing',
      'private-fields': 'private-class-fields',
      'private-methods': 'private-class-methods',
      'top-level-await': 'top-level-await',
      'dynamic-import': 'es6-module-dynamic-import',
      'bigint': 'bigint',
      'numeric-separators': 'numeric-separators',
      
      // Intl APIs
      'Intl.DateTimeFormat': 'internationalization',
      'Intl.NumberFormat': 'internationalization',
      'Intl.Collator': 'internationalization',
      'Intl.PluralRules': 'intl-pluralrules',
      'Intl.RelativeTimeFormat': 'intl-relativetimeformat',
      'Intl.ListFormat': 'intl-listformat',
      'Intl.Locale': 'intl-locale',
      
      // Streams API
      'ReadableStream': 'streams',
      'WritableStream': 'streams',
      'TransformStream': 'streams',
      
      // Web Components
      'customElements': 'custom-elementsv1',
      'ShadowRoot': 'shadowdomv1',
      'HTMLTemplateElement': 'template',
      
      // Pointer Events
      'PointerEvent': 'pointer',
      'setPointerCapture': 'pointer',
      
      // Touch Events
      'TouchEvent': 'touch',
      
      // Gamepad API
      'navigator.getGamepads': 'gamepad',
      'Gamepad': 'gamepad',
      
      // Battery API
      'navigator.getBattery': 'battery-status',
      'BatteryManager': 'battery-status',
      
      // Device APIs
      'DeviceOrientationEvent': 'deviceorientation',
      'DeviceMotionEvent': 'devicemotion'
    };

    // HTML Elements mapping
    const htmlElementMap = {
      'dialog': 'dialog',
      'details': 'details',
      'summary': 'details',
      'main': 'html5semantic',
      'article': 'html5semantic',
      'section': 'html5semantic',
      'nav': 'html5semantic',
      'aside': 'html5semantic',
      'header': 'html5semantic',
      'footer': 'html5semantic',
      'figure': 'html5semantic',
      'figcaption': 'html5semantic',
      'time': 'html5semantic',
      'mark': 'html5semantic',
      'progress': 'progressmeter',
      'meter': 'progressmeter',
      'canvas': 'canvas',
      'video': 'video',
      'audio': 'audio',
      'source': 'video',
      'track': 'video-track',
      'picture': 'picture',
      'datalist': 'datalist',
      'output': 'form-validation',
      'template': 'template',
      'slot': 'shadowdomv1'
    };

    // HTML Attributes mapping
    const htmlAttributeMap = {
      'loading': 'loading-lazy-attr',
      'decoding': 'img-decode-async',
      'fetchpriority': 'priority-hints',
      'enterkeyhint': 'mdn-html_global_attributes_enterkeyhint',
      'inputmode': 'input-inputmode',
      'autocomplete': 'form-attribute-autocomplete',
      'crossorigin': 'cors',
      'integrity': 'subresource-integrity',
      'referrerpolicy': 'referrer-policy'
    };

    // At-rules mapping
    const atRuleMap = {
      '@supports': 'css-featurequeries',
      '@container': 'container-queries',
      '@media': 'css-mediaqueries',
      '@import': 'css-import',
      '@keyframes': 'css-animation',
      '@font-face': 'fontface',
      '@layer': 'css-cascade-layers'
    };

    // Combine all mappings
    Object.entries(cssPropertyMap).forEach(([key, value]) => map.set(key, value));
    Object.entries(cssSelectorMap).forEach(([key, value]) => map.set(key, value));
    Object.entries(jsApiMap).forEach(([key, value]) => map.set(key, value));
    Object.entries(htmlElementMap).forEach(([key, value]) => map.set(key, value));
    Object.entries(htmlAttributeMap).forEach(([key, value]) => map.set(key, value));
    Object.entries(atRuleMap).forEach(([key, value]) => map.set(key, value));

    return map;
  }

  /**
   * Build patterns to identify framework-specific features
   */
  private buildFrameworkPatterns(): RegExp[] {
    return [
      // React patterns
      /^use[A-Z]/, // React hooks (useState, useEffect, etc.)
      /^React/, // React namespace
      /^jsx/, // JSX elements
      /^_jsx/, // JSX runtime
      /^Component$/, // React.Component
      /^PureComponent$/, // React.PureComponent
      /^Fragment$/, // React.Fragment
      /^createElement$/, // React.createElement
      /^cloneElement$/, // React.cloneElement
      /^ReactDOM/, // ReactDOM namespace
      
      // Vue patterns
      /^ref$/, // Vue ref
      /^reactive$/, // Vue reactive
      /^computed$/, // Vue computed
      /^watch$/, // Vue watch
      /^onMounted$/, // Vue lifecycle
      /^onUnmounted$/, // Vue lifecycle
      /^defineComponent$/, // Vue defineComponent
      /^defineProps$/, // Vue defineProps
      /^defineEmits$/, // Vue defineEmits
      /^nextTick$/, // Vue nextTick
      /^provide$/, // Vue provide
      /^inject$/, // Vue inject
      /^toRef$/, // Vue toRef
      /^toRefs$/, // Vue toRefs
      /^unref$/, // Vue unref
      /^isRef$/, // Vue isRef
      /^useRouter$/, // Vue Router
      /^useRoute$/, // Vue Router
      /^useStore$/, // Vuex/Pinia
      
      // Svelte patterns
      /^writable$/, // Svelte stores
      /^readable$/, // Svelte stores
      /^derived$/, // Svelte stores
      /^onMount$/, // Svelte lifecycle
      /^onDestroy$/, // Svelte lifecycle
      /^beforeUpdate$/, // Svelte lifecycle
      /^afterUpdate$/, // Svelte lifecycle
      /^tick$/, // Svelte tick
      /^setContext$/, // Svelte context
      /^getContext$/, // Svelte context
      /^createEventDispatcher$/, // Svelte events
      /^goto$/, // SvelteKit
      /^page$/, // SvelteKit
      /^navigating$/, // SvelteKit
      
      // Angular patterns (for future support)
      /^ng[A-Z]/, // Angular directives
      /^Injectable$/, // Angular Injectable
      /^Component$/, // Angular Component (when in Angular context)
      /^Directive$/, // Angular Directive
      /^Pipe$/, // Angular Pipe
      
      // Framework directive patterns
      /^v-/, // Vue directives
      /^bind:/, // Svelte directives
      /^on:/, // Svelte directives
      /^use:/, // Svelte directives
      /^\*ng/, // Angular structural directives
      /^\[/, // Angular property binding
      /^\(/, // Angular event binding
    ];
  }

  /**
   * Check if a feature is framework-specific
   */
  private isFrameworkSpecific(featureName: string): boolean {
    return this.FRAMEWORK_SPECIFIC_PATTERNS.some(pattern => pattern.test(featureName));
  }

  /**
   * Map detected feature to web-features ID
   */
  private mapToWebFeatureId(featureName: string): string | null {
    // Direct mapping
    if (this.FEATURE_ID_MAP.has(featureName)) {
      return this.FEATURE_ID_MAP.get(featureName)!;
    }

    // Handle CSS custom properties
    if (featureName.startsWith('--')) {
      return 'css-variables';
    }

    // Handle member expressions (e.g., 'navigator.geolocation')
    if (featureName.includes('.')) {
      const parts = featureName.split('.');
      const lastPart = parts[parts.length - 1];
      
      // Try mapping the full expression first
      if (this.FEATURE_ID_MAP.has(featureName)) {
        return this.FEATURE_ID_MAP.get(featureName)!;
      }
      
      // Try mapping just the method/property name
      if (lastPart && this.FEATURE_ID_MAP.has(lastPart)) {
        return this.FEATURE_ID_MAP.get(lastPart)!;
      }
      
      // Try mapping the object name
      const objectName = parts[0];
      if (objectName && this.FEATURE_ID_MAP.has(objectName)) {
        return this.FEATURE_ID_MAP.get(objectName)!;
      }
    }

    // Check if the feature exists directly in web-features
    if (webFeatures[featureName]) {
      return featureName;
    }

    return null;
  }

  /**
   * Enhance context information for better display
   */
  private enhanceContext(context: string, type: 'css' | 'js' | 'html'): string {
    // Limit context length
    const maxLength = 100;
    if (context.length > maxLength) {
      context = context.substring(0, maxLength) + '...';
    }

    // Add type-specific formatting
    switch (type) {
      case 'css':
        return context.includes(':') ? context : `${context}: ...`;
      case 'js':
        return context;
      case 'html':
        return context.startsWith('<') ? context : `<${context}>`;
      default:
        return context;
    }
  }

  /**
   * Create batches for concurrent processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Remove duplicate features based on feature ID, file, and line
   */
  private deduplicateFeatures(features: DetectedFeature[]): DetectedFeature[] {
    const seen = new Set<string>();
    return features.filter(feature => {
      const key = `${feature.feature}:${feature.file}:${feature.line}:${feature.column}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get all supported web-features IDs for validation
   */
  getSupportedFeatures(): string[] {
    return Object.keys(webFeatures);
  }

  /**
   * Check if a specific feature ID is supported by web-features
   */
  isFeatureSupported(featureId: string): boolean {
    return featureId in webFeatures;
  }

  /**
   * Get feature data from web-features package
   */
  getFeatureData(featureId: string): any {
    return webFeatures[featureId] || null;
  }
}