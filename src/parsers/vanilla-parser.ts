import { Parser } from './parser.js';
import type { DetectedFeature } from '../types/index.js';
import { LazyLoader } from '../core/lazy-loader.js';
import { parse as parseBabel } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import postcss from 'postcss';

/**
 * Vanilla JavaScript/CSS/HTML parser - extracts ALL web platform features
 * Handles .js, .ts, .html, and .css files with comprehensive feature detection
 */
export class VanillaParser extends Parser {
  private readonly WEB_PLATFORM_APIS = new Set([
    // Canvas APIs
    'getContext', 'CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext',
    'OffscreenCanvas', 'ImageBitmap', 'createImageBitmap', 'Path2D', 'ImageData',
    'CanvasGradient', 'CanvasPattern', 'TextMetrics',
    
    // WebGL specific
    'createShader', 'shaderSource', 'compileShader', 'createProgram', 'attachShader',
    'linkProgram', 'useProgram', 'getAttribLocation', 'getUniformLocation',
    'enableVertexAttribArray', 'vertexAttribPointer', 'uniform1f', 'uniform2f',
    'uniform3f', 'uniform4f', 'uniformMatrix4fv', 'drawArrays', 'drawElements',
    
    // WebRTC APIs
    'RTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate',
    'getUserMedia', 'getDisplayMedia', 'MediaStream', 'MediaStreamTrack',
    'RTCRtpSender', 'RTCRtpReceiver', 'RTCStatsReport', 'RTCIceServer',
    
    // WebAssembly
    'WebAssembly', 'instantiate', 'compile', 'validate', 'Module', 'Instance',
    'Memory', 'Table', 'Global', 'CompileError', 'LinkError', 'RuntimeError',
    
    // Service Workers & PWA
    'ServiceWorker', 'serviceWorker', 'register', 'unregister', 'update',
    'Cache', 'caches', 'open', 'match', 'matchAll', 'add', 'addAll', 'put', 'delete',
    'PushManager', 'subscribe', 'getSubscription', 'permissionState',
    'Notification', 'showNotification', 'getNotifications', 'requestPermission',
    'BackgroundSync', 'sync', 'getTags', 'BackgroundFetch',
    
    // DOM APIs
    'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName',
    'getElementsByTagName', 'createElement', 'createTextNode', 'createDocumentFragment',
    'addEventListener', 'removeEventListener', 'dispatchEvent', 'CustomEvent',
    'MutationObserver', 'observe', 'disconnect', 'takeRecords',
    'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver',
    'AbortController', 'AbortSignal', 'abort', 'signal',
    'FormData', 'append', 'set', 'get', 'getAll', 'has', 'entries', 'keys', 'values',
    'URLSearchParams', 'URL', 'createObjectURL', 'revokeObjectURL',
    
    // Fetch API
    'fetch', 'Request', 'Response', 'Headers', 'clone', 'json', 'text', 'blob',
    'arrayBuffer', 'formData', 'ok', 'status', 'statusText', 'redirected',
    
    // File APIs
    'Blob', 'File', 'FileReader', 'FileList', 'readAsText', 'readAsDataURL',
    'readAsArrayBuffer', 'readAsBinaryString', 'slice',
    
    // Web APIs
    'navigator', 'geolocation', 'getCurrentPosition', 'watchPosition', 'clearWatch',
    'permissions', 'query', 'clipboard', 'writeText', 'readText', 'write', 'read',
    'share', 'canShare', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback', 'setTimeout', 'setInterval',
    'clearTimeout', 'clearInterval', 'queueMicrotask',
    
    // Storage APIs
    'localStorage', 'sessionStorage', 'getItem', 'setItem', 'removeItem', 'clear',
    'indexedDB', 'open', 'deleteDatabase', 'cmp', 'IDBDatabase', 'IDBTransaction',
    'IDBObjectStore', 'IDBIndex', 'IDBCursor', 'IDBKeyRange',
    
    // Crypto APIs
    'crypto', 'getRandomValues', 'randomUUID', 'subtle', 'encrypt', 'decrypt',
    'sign', 'verify', 'digest', 'generateKey', 'importKey', 'exportKey',
    
    // Performance APIs
    'performance', 'now', 'mark', 'measure', 'getEntries', 'getEntriesByName',
    'getEntriesByType', 'clearMarks', 'clearMeasures', 'timing', 'navigation',
    
    // Audio/Video APIs
    'AudioContext', 'createOscillator', 'createGain', 'createAnalyser',
    'createBiquadFilter', 'createBufferSource', 'createMediaElementSource',
    'createScriptProcessor', 'createDynamicsCompressor', 'createConvolver',
    'MediaRecorder', 'start', 'stop', 'pause', 'resume', 'requestData',
    'MediaSource', 'SourceBuffer', 'appendBuffer', 'remove', 'abort',
    'HTMLMediaElement', 'HTMLAudioElement', 'HTMLVideoElement', 'play', 'pause',
    'load', 'canPlayType', 'addTextTrack', 'captureStream',
    
    // Modern JavaScript APIs
    'structuredClone', 'reportError', 'WeakRef', 'deref', 'FinalizationRegistry',
    'AggregateError', 'Promise', 'allSettled', 'any', 'race', 'resolve', 'reject',
    'AsyncIterator', 'Symbol', 'iterator', 'asyncIterator', 'BigInt', 'asIntN', 'asUintN',
    
    // Intl APIs
    'Intl', 'DateTimeFormat', 'format', 'formatToParts', 'resolvedOptions',
    'NumberFormat', 'Collator', 'compare', 'PluralRules', 'select',
    'RelativeTimeFormat', 'ListFormat', 'Locale', 'getCanonicalLocales',
    'DisplayNames', 'of', 'Segmenter', 'segment',
    
    // Streams API
    'ReadableStream', 'WritableStream', 'TransformStream', 'getReader', 'getWriter',
    'readable', 'writable', 'pipeThrough', 'pipeTo', 'tee',
    
    // Web Components
    'customElements', 'define', 'get', 'whenDefined', 'upgrade', 'ShadowRoot',
    'attachShadow', 'shadowRoot', 'HTMLTemplateElement', 'content', 'HTMLSlotElement',
    
    // Pointer Events
    'PointerEvent', 'pointerId', 'pointerType', 'isPrimary', 'setPointerCapture',
    'releasePointerCapture', 'hasPointerCapture',
    
    // Touch Events
    'TouchEvent', 'touches', 'targetTouches', 'changedTouches', 'Touch',
    
    // Gamepad API
    'navigator.getGamepads', 'Gamepad', 'GamepadButton', 'pressed', 'value',
    
    // Battery API
    'navigator.getBattery', 'BatteryManager', 'charging', 'chargingTime',
    'dischargingTime', 'level',
    
    // Device APIs
    'DeviceOrientationEvent', 'alpha', 'beta', 'gamma', 'absolute',
    'DeviceMotionEvent', 'acceleration', 'accelerationIncludingGravity',
    'rotationRate', 'interval'
  ]);

  private readonly CSS_PROPERTIES = new Set([
    // Container Queries
    'container-type', 'container-name', 'container', 'container-query-length',
    
    // Grid Layout
    'display', 'grid', 'inline-grid', 'grid-template-columns', 'grid-template-rows',
    'grid-template-areas', 'grid-template', 'grid-column-start', 'grid-column-end',
    'grid-row-start', 'grid-row-end', 'grid-column', 'grid-row', 'grid-area',
    'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow', 'gap', 'grid-gap',
    'column-gap', 'row-gap', 'grid-column-gap', 'grid-row-gap',
    
    // Flexbox
    'flex', 'inline-flex', 'flex-direction', 'flex-wrap', 'flex-flow',
    'justify-content', 'align-items', 'align-content', 'align-self',
    'flex-grow', 'flex-shrink', 'flex-basis', 'order',
    
    // Modern Layout
    'aspect-ratio', 'object-fit', 'object-position', 'place-items', 'place-content',
    'place-self', 'justify-items', 'justify-self', 'align-tracks', 'justify-tracks',
    
    // Visual Effects
    'backdrop-filter', 'filter', 'mix-blend-mode', 'isolation', 'clip-path',
    'mask', 'mask-image', 'mask-mode', 'mask-repeat', 'mask-position',
    'mask-clip', 'mask-origin', 'mask-size', 'mask-composite',
    
    // Color & Appearance
    'color-scheme', 'accent-color', 'color-mix', 'color-contrast',
    'forced-color-adjust', 'print-color-adjust',
    
    // Scrolling
    'scroll-behavior', 'scroll-snap-type', 'scroll-snap-align', 'scroll-snap-stop',
    'scroll-margin', 'scroll-margin-top', 'scroll-margin-right', 'scroll-margin-bottom',
    'scroll-margin-left', 'scroll-padding', 'scroll-padding-top', 'scroll-padding-right',
    'scroll-padding-bottom', 'scroll-padding-left', 'overscroll-behavior',
    'overscroll-behavior-x', 'overscroll-behavior-y', 'scroll-timeline',
    'scroll-timeline-name', 'scroll-timeline-axis',
    
    // Interaction
    'touch-action', 'user-select', 'pointer-events', 'cursor',
    
    // CSS Custom Properties & Functions
    '--', 'var(', 'calc(', 'clamp(', 'min(', 'max(', 'minmax(',
    
    // Transforms & Animations
    'transform', 'transform-origin', 'transform-style', 'perspective',
    'perspective-origin', 'backface-visibility', 'animation', 'animation-name',
    'animation-duration', 'animation-timing-function', 'animation-delay',
    'animation-iteration-count', 'animation-direction', 'animation-fill-mode',
    'animation-play-state', 'animation-timeline', 'transition', 'transition-property',
    'transition-duration', 'transition-timing-function', 'transition-delay',
    'will-change', 'contain', 'content-visibility',
    
    // Typography
    'font-display', 'font-variation-settings', 'font-optical-sizing',
    'font-palette', 'text-decoration-thickness', 'text-decoration-skip-ink',
    'text-underline-offset', 'text-underline-position', 'hanging-punctuation',
    'hyphens', 'line-break', 'word-break', 'overflow-wrap', 'text-overflow',
    'white-space', 'tab-size', 'writing-mode', 'text-orientation',
    
    // Layout & Positioning
    'position', 'top', 'right', 'bottom', 'left', 'z-index', 'inset',
    'inset-block', 'inset-inline', 'width', 'height', 'min-width', 'min-height',
    'max-width', 'max-height', 'margin', 'margin-top', 'margin-right',
    'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right',
    'padding-bottom', 'padding-left', 'border', 'border-radius', 'outline',
    'box-sizing', 'overflow', 'overflow-x', 'overflow-y', 'resize',
    
    // Logical Properties
    'margin-block', 'margin-inline', 'padding-block', 'padding-inline',
    'border-block', 'border-inline', 'inset-block-start', 'inset-block-end',
    'inset-inline-start', 'inset-inline-end'
  ]);

  private readonly CSS_SELECTORS = new Set([
    ':has(', ':is(', ':where(', ':not(', ':focus-visible', ':focus-within',
    ':target-within', ':any-link', ':local-link', ':scope', ':current',
    ':past', ':future', ':playing', ':paused', ':seeking', ':buffering',
    ':stalled', ':muted', ':volume-locked', ':fullscreen', ':picture-in-picture',
    ':user-invalid', ':user-valid', ':blank', ':placeholder-shown',
    '::backdrop', '::placeholder', '::marker', '::selection', '::first-letter',
    '::first-line', '::before', '::after', '::file-selector-button'
  ]);

  private readonly HTML_ELEMENTS = new Set([
    // Modern semantic elements
    'dialog', 'details', 'summary', 'main', 'article', 'section', 'nav', 'aside',
    'header', 'footer', 'figure', 'figcaption', 'time', 'mark', 'progress', 'meter',
    
    // Media elements
    'canvas', 'video', 'audio', 'source', 'track', 'embed', 'object', 'picture',
    
    // Form elements
    'datalist', 'output', 'keygen', 'fieldset', 'legend',
    
    // Interactive elements
    'slot', 'template'
  ]);

  private readonly HTML_ATTRIBUTES = new Set([
    'loading', 'decoding', 'fetchpriority', 'enterkeyhint', 'inputmode',
    'autocomplete', 'autofocus', 'capture', 'crossorigin', 'dirname',
    'download', 'draggable', 'enctype', 'formaction', 'formenctype',
    'formmethod', 'formnovalidate', 'formtarget', 'hidden', 'integrity',
    'is', 'itemid', 'itemprop', 'itemref', 'itemscope', 'itemtype',
    'kind', 'label', 'lang', 'list', 'loop', 'max', 'maxlength', 'media',
    'method', 'min', 'minlength', 'multiple', 'muted', 'novalidate',
    'open', 'optimum', 'pattern', 'placeholder', 'playsinline', 'poster',
    'preload', 'readonly', 'referrerpolicy', 'rel', 'required', 'reversed',
    'rows', 'rowspan', 'sandbox', 'scope', 'selected', 'shape', 'size',
    'sizes', 'span', 'spellcheck', 'srcdoc', 'srclang', 'srcset', 'start',
    'step', 'target', 'translate', 'type', 'usemap', 'value', 'wrap'
  ]);

  canParse(filePath: string): boolean {
    return /\.(js|ts|html|css)$/.test(filePath);
  }

  async parseFeatures(content: string, filePath: string): Promise<DetectedFeature[]> {
    const extension = this.getFileExtension(filePath);
    
    switch (extension) {
      case '.js':
      case '.ts':
        return this.parseJavaScript(content, filePath, extension === '.ts');
      case '.css':
        return this.parseCSS(content, filePath);
      case '.html':
        return await this.parseHTML(content, filePath);
      default:
        return [];
    }
  }

  private async parseJavaScript(content: string, filePath: string, isTypeScript: boolean): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      const ast = parseBabel(content, {
        sourceType: 'module',
        plugins: [
          'typescript' as any,
          'decorators-legacy' as any,
          'classProperties' as any,
          'objectRestSpread' as any,
          'asyncGenerators' as any,
          'functionBind' as any,
          'exportDefaultFrom' as any,
          'exportNamespaceFrom' as any,
          'dynamicImport' as any,
          'nullishCoalescingOperator',
          'optionalChaining',
          'topLevelAwait',
          'privateIn',
          'importMeta'
        ].filter(plugin => isTypeScript || plugin !== 'typescript')
      });

      traverse(ast, {
        // Extract Web API member expressions
        MemberExpression: (path: any) => {
          const feature = this.extractWebAPIFeature(path.node, content);
          if (feature) {
            features.push({ ...feature, file: filePath });
          }
        },

        // Extract Web API function calls
        CallExpression: (path: any) => {
          const feature = this.extractWebAPICall(path.node, content);
          if (feature) {
            features.push({ ...feature, file: filePath });
          }
        },

        // Modern JavaScript syntax features
        OptionalMemberExpression: (path: any) => {
          features.push({
            feature: 'optional-chaining',
            type: 'js',
            context: this.getContext(content, path.node.loc?.start.line || 0),
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        OptionalCallExpression: (path: any) => {
          features.push({
            feature: 'optional-chaining',
            type: 'js',
            context: this.getContext(content, path.node.loc?.start.line || 0),
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        // Nullish coalescing
        LogicalExpression: (path: any) => {
          if (path.node.operator === '??') {
            features.push({
              feature: 'nullish-coalescing',
              type: 'js',
              context: this.getContext(content, path.node.loc?.start.line || 0),
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              file: filePath
            });
          }
        },

        // Private class fields
        ClassPrivateProperty: (path: any) => {
          features.push({
            feature: 'private-fields',
            type: 'js',
            context: this.getContext(content, path.node.loc?.start.line || 0),
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        ClassPrivateMethod: (path: any) => {
          features.push({
            feature: 'private-methods',
            type: 'js',
            context: this.getContext(content, path.node.loc?.start.line || 0),
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        // Top-level await
        AwaitExpression: (path: any) => {
          if (this.isTopLevelAwait(path)) {
            features.push({
              feature: 'top-level-await',
              type: 'js',
              context: this.getContext(content, path.node.loc?.start.line || 0),
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              file: filePath
            });
          }
        },

        // Dynamic imports
        Import: (path: any) => {
          features.push({
            feature: 'dynamic-import',
            type: 'js',
            context: this.getContext(content, path.node.loc?.start.line || 0),
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        // BigInt literals
        BigIntLiteral: (path: any) => {
          features.push({
            feature: 'bigint',
            type: 'js',
            context: this.getContext(content, path.node.loc?.start.line || 0),
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        // Numeric separators
        NumericLiteral: (path: any) => {
          if ((path.node.extra as any)?.raw?.includes('_')) {
            features.push({
              feature: 'numeric-separators',
              type: 'js',
              context: this.getContext(content, path.node.loc?.start.line || 0),
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              file: filePath
            });
          }
        }
      });

    } catch (error) {
      console.warn(`Warning: Could not parse JavaScript file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private async parseCSS(content: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      const root = postcss.parse(content);
      
      // Extract CSS properties
      root.walkDecls((decl: any) => {
        if (this.CSS_PROPERTIES.has(decl.prop) || decl.prop.startsWith('--')) {
          features.push({
            feature: decl.prop,
            type: 'css',
            context: `${decl.prop}: ${decl.value}`,
            line: decl.source?.start?.line || 0,
            column: decl.source?.start?.column || 0,
            file: filePath
          });
        }

        // Check for CSS functions in values
        if (decl.value.includes('var(') || decl.value.includes('calc(') || 
            decl.value.includes('clamp(') || decl.value.includes('min(') || 
            decl.value.includes('max(')) {
          const func = this.extractCSSFunction(decl.value);
          if (func) {
            features.push({
              feature: func,
              type: 'css',
              context: `${decl.prop}: ${decl.value}`,
              line: decl.source?.start?.line || 0,
              column: decl.source?.start?.column || 0,
              file: filePath
            });
          }
        }
      });

      // Extract CSS selectors
      root.walkRules((rule: any) => {
        this.CSS_SELECTORS.forEach(selector => {
          if (rule.selector.includes(selector)) {
            features.push({
              feature: selector.replace('(', '()'),
              type: 'css',
              context: rule.selector,
              line: rule.source?.start?.line || 0,
              column: rule.source?.start?.column || 0,
              file: filePath
            });
          }
        });
      });

      // Extract at-rules
      root.walkAtRules((atRule: any) => {
        const atRuleName = `@${atRule.name}`;
        features.push({
          feature: atRuleName,
          type: 'css',
          context: `${atRuleName} ${atRule.params}`,
          line: atRule.source?.start?.line || 0,
          column: atRule.source?.start?.column || 0,
          file: filePath
        });
      });
      
    } catch (error) {
      console.warn(`Warning: Could not parse CSS file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private async parseHTML(content: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    const lines = content.split('\n');
    
    // Parse HTML elements and attributes
    const elementRegex = /<(\w+)([^>]*)>/g;
    
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;
      while ((match = elementRegex.exec(line)) !== null) {
        const tagName = match[1];
        const attributes = match[2];
        
        // Check for modern HTML elements
        if (tagName && this.HTML_ELEMENTS.has(tagName)) {
          features.push({
            feature: tagName!,
            type: 'html',
            context: line.trim(),
            line: index + 1,
            column: match.index,
            file: filePath
          });
        }
        
        // Check for modern HTML attributes
        if (attributes) {
          const modernAttrs = this.extractHTMLAttributes(attributes);
          modernAttrs.forEach(attr => {
            features.push({
              feature: attr,
              type: 'html',
              context: line.trim(),
              line: index + 1,
              column: match?.index || 0,
              file: filePath
            });
          });
        }
      }
    });

    // Extract inline CSS and JavaScript
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    
    // Parse inline styles
    let styleMatch;
    while ((styleMatch = styleRegex.exec(content)) !== null) {
      const cssContent = styleMatch[1];
      const cssFeatures = cssContent ? await this.parseInlineCSS(cssContent, filePath) : [];
      features.push(...cssFeatures);
    }
    
    // Parse inline scripts
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(content)) !== null) {
      const jsContent = scriptMatch[1];
      const jsFeatures = jsContent ? await this.parseInlineJS(jsContent, filePath) : [];
      features.push(...jsFeatures);
    }

    return features;
  }

  private async parseInlineCSS(cssContent: string, filePath: string): Promise<DetectedFeature[]> {
    try {
      return await this.parseCSS(cssContent, filePath);
    } catch (error) {
      console.warn(`Warning: Could not parse inline CSS in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private async parseInlineJS(jsContent: string, filePath: string): Promise<DetectedFeature[]> {
    try {
      return await this.parseJavaScript(jsContent, filePath, false);
    } catch (error) {
      console.warn(`Warning: Could not parse inline JavaScript in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private extractWebAPIFeature(node: t.MemberExpression, content: string): DetectedFeature | null {
    const apiName = this.getMemberExpressionName(node);
    
    if (this.WEB_PLATFORM_APIS.has(apiName)) {
      return {
        feature: apiName,
        type: 'js',
        context: this.getContext(content, node.loc?.start.line || 0),
        line: node.loc?.start.line || 0,
        column: node.loc?.start.column || 0
      };
    }

    return null;
  }

  private extractWebAPICall(node: t.CallExpression, content: string): DetectedFeature | null {
    let apiName = '';
    
    if (t.isIdentifier(node.callee)) {
      apiName = node.callee.name;
    } else if (t.isMemberExpression(node.callee)) {
      apiName = this.getMemberExpressionName(node.callee);
    }

    if (this.WEB_PLATFORM_APIS.has(apiName)) {
      return {
        feature: apiName,
        type: 'js',
        context: this.getContext(content, node.loc?.start.line || 0),
        line: node.loc?.start.line || 0,
        column: node.loc?.start.column || 0
      };
    }

    return null;
  }

  private extractCSSFunction(value: string): string | null {
    const functions = ['var(', 'calc(', 'clamp(', 'min(', 'max(', 'minmax('];
    for (const func of functions) {
      if (value.includes(func)) {
        return func.replace('(', '()');
      }
    }
    return null;
  }

  private extractHTMLAttributes(attributes: string): string[] {
    const modernAttrs: string[] = [];
    
    this.HTML_ATTRIBUTES.forEach(attr => {
      const attrRegex = new RegExp(`\\b${attr}\\b`, 'i');
      if (attrRegex.test(attributes)) {
        modernAttrs.push(attr);
      }
    });

    return modernAttrs;
  }

  private getMemberExpressionName(node: t.MemberExpression): string {
    const parts: string[] = [];
    
    const traverse = (n: t.Expression): void => {
      if (t.isIdentifier(n)) {
        parts.unshift(n.name);
      } else if (t.isMemberExpression(n)) {
        if (t.isIdentifier(n.property)) {
          parts.unshift(n.property.name);
        }
        traverse(n.object);
      }
    };
    
    traverse(node);
    return parts.join('.');
  }

  private isTopLevelAwait(path: any): boolean {
    let parent = path.parent;
    while (parent) {
      if (t.isFunction(parent) || t.isArrowFunctionExpression(parent)) {
        return false;
      }
      parent = path.parentPath?.parent;
    }
    return true;
  }

  private getFileExtension(filePath: string): string {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  private getContext(content: string, line: number): string {
    const lines = content.split('\n');
    const targetLine = lines[line - 1] || '';
    return targetLine.trim();
  }

  getSupportedExtensions(): string[] {
    return ['.js', '.ts', '.html', '.css'];
  }

  getName(): string {
    return 'VanillaParser';
  }
}