import { Parser } from './parser.js';
import type { DetectedFeature } from '../types/index.js';
import { LazyLoader } from '../core/lazy-loader.js';

/**
 * React/JSX parser using Babel - extracts ALL web platform features
 * while ignoring React-specific APIs
 */
export class ReactParser extends Parser {
  private readonly REACT_SPECIFIC_APIS = new Set([
    // React hooks
    'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo',
    'useRef', 'useImperativeHandle', 'useLayoutEffect', 'useDebugValue',
    'useId', 'useDeferredValue', 'useTransition', 'useSyncExternalStore',
    
    // React components and APIs
    'React', 'Component', 'PureComponent', 'Fragment', 'StrictMode',
    'Suspense', 'lazy', 'memo', 'forwardRef', 'createContext', 'createElement',
    'cloneElement', 'isValidElement', 'Children', 'createRef',
    
    // React DOM
    'ReactDOM', 'render', 'hydrate', 'unmountComponentAtNode', 'findDOMNode',
    'createPortal', 'flushSync',
    
    // JSX elements (these are handled separately)
    'jsx', 'jsxs', '_jsx', '_jsxs'
  ]);

  private readonly WEB_PLATFORM_APIS = new Set([
    // Canvas APIs
    'getContext', 'CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext',
    'OffscreenCanvas', 'ImageBitmap', 'createImageBitmap', 'Path2D',
    
    // WebRTC APIs
    'RTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate',
    'getUserMedia', 'getDisplayMedia', 'MediaStream', 'MediaStreamTrack',
    
    // WebAssembly
    'WebAssembly', 'instantiate', 'compile', 'validate',
    
    // Service Workers & PWA
    'ServiceWorker', 'serviceWorker', 'register', 'Cache', 'caches',
    'PushManager', 'Notification', 'showNotification',
    
    // DOM APIs
    'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName',
    'addEventListener', 'removeEventListener', 'dispatchEvent', 'CustomEvent',
    'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver',
    'AbortController', 'AbortSignal', 'FormData', 'URLSearchParams', 'URL',
    'fetch', 'Request', 'Response', 'Headers', 'Blob', 'File', 'FileReader',
    
    // Web APIs
    'navigator', 'geolocation', 'permissions', 'clipboard', 'share',
    'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'localStorage', 'sessionStorage', 'indexedDB', 'crypto', 'performance',
    
    // Audio/Video APIs
    'AudioContext', 'MediaRecorder', 'MediaSource', 'SourceBuffer',
    'HTMLMediaElement', 'HTMLAudioElement', 'HTMLVideoElement',
    
    // Modern JavaScript APIs
    'structuredClone', 'queueMicrotask', 'reportError',
    'WeakRef', 'FinalizationRegistry', 'AggregateError',
    
    // Intl APIs
    'Intl', 'DateTimeFormat', 'NumberFormat', 'Collator', 'PluralRules',
    'RelativeTimeFormat', 'ListFormat', 'Locale'
  ]);

  private readonly CSS_PROPERTIES = new Set([
    // Container Queries
    'container-type', 'container-name', 'container',
    
    // Grid & Flexbox
    'display', 'grid-template-columns', 'grid-template-rows', 'gap', 'grid-gap',
    'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
    
    // Modern CSS
    'aspect-ratio', 'object-fit', 'object-position', 'backdrop-filter',
    'color-scheme', 'accent-color', 'scroll-behavior', 'scroll-snap-type',
    'overscroll-behavior', 'touch-action', 'user-select',
    
    // CSS Custom Properties
    '--', 'var(', 'calc(', 'clamp(', 'min(', 'max(',
    
    // Transforms & Animations
    'transform', 'transform-origin', 'perspective', 'backface-visibility',
    'animation', 'transition', 'will-change',
    
    // Layout
    'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'width', 'height', 'margin', 'padding', 'border', 'outline'
  ]);

  canParse(filePath: string): boolean {
    return /\.(jsx|tsx)$/.test(filePath);
  }

  async parseFeatures(content: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      // Lazy load Babel dependencies
      const [parser, traverse, types] = await Promise.all([
        LazyLoader.getBabelParser(),
        LazyLoader.getBabelTraverse(),
        import('@babel/types')
      ]);

      const t = types.default || types;
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
          'topLevelAwait'
        ]
      });

      traverse(ast, {
        // Extract JavaScript Web APIs
        MemberExpression: (path: any) => {
          const feature = this.extractWebAPIFeature(path.node, content, t);
          if (feature) {
            features.push({
              ...feature,
              file: filePath,
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0
            });
          }
        },

        // Extract function calls to Web APIs
        CallExpression: (path: any) => {
          const feature = this.extractWebAPICall(path.node, content, t);
          if (feature) {
            features.push({
              ...feature,
              file: filePath,
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0
            });
          }
        },

        // Extract CSS from inline styles
        ObjectExpression: (path: any) => {
          const cssFeatures = this.extractInlineCSS(path.node, content, t);
          cssFeatures.forEach(feature => {
            features.push({
              ...feature,
              file: filePath,
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0
            });
          });
        },

        // Extract modern JavaScript syntax features
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

        // Top-level await
        AwaitExpression: (path: any) => {
          if (this.isTopLevelAwait(path, t)) {
            features.push({
              feature: 'top-level-await',
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
      console.warn(`Warning: Could not parse ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private extractWebAPIFeature(node: any, content: string, t: any): DetectedFeature | null {
    const apiName = this.getMemberExpressionName(node, t);
    
    if (!apiName || this.REACT_SPECIFIC_APIS.has(apiName)) {
      return null;
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

  private extractWebAPICall(node: any, content: string, t: any): DetectedFeature | null {
    let apiName = '';
    
    if (t.isIdentifier(node.callee)) {
      apiName = node.callee.name;
    } else if (t.isMemberExpression(node.callee)) {
      apiName = this.getMemberExpressionName(node.callee, t);
    }

    if (!apiName || this.REACT_SPECIFIC_APIS.has(apiName)) {
      return null;
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

  private extractInlineCSS(node: any, content: string, t: any): DetectedFeature[] {
    const features: DetectedFeature[] = [];
    
    // Check if this is likely a style object (has CSS-like properties)
    const hasStyleProps = node.properties.some((prop: any) => {
      if (t.isObjectProperty(prop) && (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key))) {
        const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
        return this.CSS_PROPERTIES.has(key) || key.includes('-') || key.startsWith('--');
      }
      return false;
    });

    if (!hasStyleProps) {
      return features;
    }

    node.properties.forEach((prop: any) => {
      if (t.isObjectProperty(prop)) {
        let key = '';
        if (t.isIdentifier(prop.key)) {
          key = prop.key.name;
        } else if (t.isStringLiteral(prop.key)) {
          key = prop.key.value;
        }

        if (key && (this.CSS_PROPERTIES.has(key) || key.startsWith('--') || key.includes('-'))) {
          features.push({
            feature: key,
            type: 'css',
            context: this.getContext(content, prop.loc?.start.line || 0),
            line: prop.loc?.start.line || 0,
            column: prop.loc?.start.column || 0
          });
        }
      }
    });

    return features;
  }

  private getMemberExpressionName(node: any, t: any): string {
    const parts: string[] = [];
    
    const traverse = (n: any): void => {
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

  private isTopLevelAwait(path: any, t: any): boolean {
    let currentPath = path.parentPath;
    while (currentPath) {
      if (t.isFunction(currentPath.node) || t.isArrowFunctionExpression(currentPath.node)) {
        return false;
      }
      currentPath = currentPath.parentPath!;
    }
    return true;
  }

  private getContext(content: string, line: number): string {
    const lines = content.split('\n');
    const targetLine = lines[line - 1] || '';
    return targetLine.trim();
  }

  getSupportedExtensions(): string[] {
    return ['.jsx', '.tsx'];
  }

  getName(): string {
    return 'ReactParser';
  }
}