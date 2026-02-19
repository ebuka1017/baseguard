import { Parser } from './parser.js';
import type { DetectedFeature } from '../types/index.js';
import { LazyLoader } from '../core/lazy-loader.js';
import * as t from '@babel/types';

/**
 * Vue single-file component parser - extracts ALL web platform features
 * while ignoring Vue-specific APIs
 */
export class VueParser extends Parser {
  private readonly VUE_SPECIFIC_APIS = new Set([
    // Vue 3 Composition API
    'ref', 'reactive', 'computed', 'watch', 'watchEffect', 'onMounted', 'onUnmounted',
    'onBeforeMount', 'onBeforeUnmount', 'onUpdated', 'onBeforeUpdate',
    'onActivated', 'onDeactivated', 'onErrorCaptured', 'provide', 'inject',
    'getCurrentInstance', 'nextTick', 'defineComponent', 'defineProps', 'defineEmits',
    'defineExpose', 'withDefaults', 'toRef', 'toRefs', 'unref', 'isRef',
    
    // Vue 2 Options API
    'Vue', 'data', 'props', 'methods', 'computed', 'watch', 'created', 'mounted',
    'updated', 'destroyed', 'beforeCreate', 'beforeMount', 'beforeUpdate', 'beforeDestroy',
    'activated', 'deactivated', 'errorCaptured', 'mixins', 'extends', 'components',
    
    // Vue Router
    'useRouter', 'useRoute', '$router', '$route', 'router-link', 'router-view',
    
    // Vuex/Pinia
    'useStore', '$store', 'mapState', 'mapGetters', 'mapMutations', 'mapActions'
  ]);

  private readonly VUE_DIRECTIVES = new Set([
    'v-if', 'v-else', 'v-else-if', 'v-for', 'v-show', 'v-bind', 'v-on', 'v-model',
    'v-slot', 'v-pre', 'v-cloak', 'v-once', 'v-memo', 'v-html', 'v-text'
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

  canParse(filePath: string): boolean {
    return /\.vue$/.test(filePath);
  }

  async parseFeatures(content: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      // Lazy load Vue compiler
      const vueCompiler = await LazyLoader.getVueCompiler();
      const { descriptor } = vueCompiler.parse(content, { filename: filePath });
      
      // Parse script blocks for JavaScript features
      if (descriptor.script) {
        const scriptFeatures = await this.parseScriptBlock(
          descriptor.script.content,
          descriptor.script.lang || 'js',
          filePath
        );
        features.push(...scriptFeatures);
      }
      
      if (descriptor.scriptSetup) {
        const setupFeatures = await this.parseScriptBlock(
          descriptor.scriptSetup.content,
          descriptor.scriptSetup.lang || 'js',
          filePath
        );
        features.push(...setupFeatures);
      }
      
      // Parse style blocks for CSS features
      if (descriptor.styles) {
        for (const style of descriptor.styles) {
          const styleFeatures = await this.parseStyleBlock(
            style.content,
            style.lang || 'css',
            filePath
          );
          features.push(...styleFeatures);
        }
      }
      
      // Parse template for HTML features (standard elements only)
      if (descriptor.template) {
        const templateFeatures = this.parseTemplateBlock(
          descriptor.template.content,
          filePath
        );
        features.push(...templateFeatures);
      }
      
    } catch (error) {
      console.warn(`Warning: Could not parse Vue file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private async parseScriptBlock(content: string, lang: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      const isTypeScript = lang === 'ts' || lang === 'typescript';
      
      // Lazy load Babel dependencies
      const [parser, traverse] = await Promise.all([
        LazyLoader.getBabelParser(),
        LazyLoader.getBabelTraverse()
      ]);
      
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: [
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
        ].filter(plugin => isTypeScript || plugin !== 'typescript')
      });

      traverse(ast, {
        // Extract JavaScript Web APIs
        MemberExpression: (path: any) => {
          const feature = this.extractWebAPIFeature(path.node, path, content);
          if (feature) {
            features.push({ ...feature, file: filePath });
          }
        },

        // Extract function calls to Web APIs
        CallExpression: (path: any) => {
          const feature = this.extractWebAPICall(path.node, path, content);
          if (feature) {
            features.push({ ...feature, file: filePath });
          }
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
        }
      });

    } catch (error) {
      console.warn(`Warning: Could not parse script block in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private async parseStyleBlock(content: string, lang: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      // For now, only handle CSS (not SCSS, Less, etc.)
      if (lang === 'css' || !lang) {
        // Lazy load PostCSS
        const postcss = await LazyLoader.getPostCSS();
        const root = postcss.parse(content);
        
        root.walkDecls((decl: any) => {
          features.push({
            feature: decl.prop,
            type: 'css',
            context: `${decl.prop}: ${decl.value}`,
            line: decl.source?.start?.line || 0,
            column: decl.source?.start?.column || 0,
            file: filePath
          });
        });

        root.walkRules((rule: any) => {
          // Extract CSS selectors that might be modern features
          if (rule.selector.includes(':has(') || 
              rule.selector.includes(':is(') || 
              rule.selector.includes(':where(') ||
              rule.selector.includes(':focus-visible')) {
            features.push({
              feature: this.extractSelectorFeature(rule.selector),
              type: 'css',
              context: rule.selector,
              line: rule.source?.start?.line || 0,
              column: rule.source?.start?.column || 0,
              file: filePath
            });
          }
        });

        root.walkAtRules((atRule: any) => {
          // Extract at-rules like @supports, @container, etc.
          features.push({
            feature: `@${atRule.name}`,
            type: 'css',
            context: `@${atRule.name} ${atRule.params}`,
            line: atRule.source?.start?.line || 0,
            column: atRule.source?.start?.column || 0,
            file: filePath
          });
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not parse style block in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private parseTemplateBlock(content: string, filePath: string): DetectedFeature[] {
    const features: DetectedFeature[] = [];
    
    // Extract standard HTML elements and attributes (ignore Vue directives)
    const htmlElementRegex = /<(\w+)([^>]*)>/g;
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;
      while ((match = htmlElementRegex.exec(line)) !== null) {
        const tagName = match[1];
        const attributes = match[2];
        
        // Check for modern HTML elements
        if (tagName && this.isModernHTMLElement(tagName)) {
          features.push({
            feature: tagName,
            type: 'html',
            context: line.trim(),
            line: index + 1,
            column: match.index,
            file: filePath
          });
        }
        
        // Check for modern HTML attributes (ignore Vue directives)
        if (attributes) {
          const modernAttrs = this.extractModernAttributes(attributes);
          modernAttrs.forEach(attr => {
            features.push({
              feature: attr,
              type: 'html',
              context: line.trim(),
              line: index + 1,
              column: match!.index,
              file: filePath
            });
          });
        }
      }
    });

    return features;
  }

  private extractWebAPIFeature(node: t.MemberExpression, path: any, content: string): DetectedFeature | null {
    const apiName = this.getMemberExpressionName(node);
    
    if (!apiName || this.VUE_SPECIFIC_APIS.has(apiName)) {
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

  private extractWebAPICall(node: t.CallExpression, path: any, content: string): DetectedFeature | null {
    let apiName = '';
    
    if (t.isIdentifier(node.callee)) {
      apiName = node.callee.name;
    } else if (t.isMemberExpression(node.callee)) {
      apiName = this.getMemberExpressionName(node.callee);
    }

    if (!apiName || this.VUE_SPECIFIC_APIS.has(apiName)) {
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

  private extractSelectorFeature(selector: string): string {
    if (selector.includes(':has(')) return ':has()';
    if (selector.includes(':is(')) return ':is()';
    if (selector.includes(':where(')) return ':where()';
    if (selector.includes(':focus-visible')) return ':focus-visible';
    return selector;
  }

  private isModernHTMLElement(tagName: string): boolean {
    const modernElements = new Set([
      'dialog', 'details', 'summary', 'main', 'article', 'section', 'nav', 'aside',
      'header', 'footer', 'figure', 'figcaption', 'time', 'mark', 'progress', 'meter',
      'canvas', 'video', 'audio', 'source', 'track', 'embed', 'object'
    ]);
    return modernElements.has(tagName);
  }

  private extractModernAttributes(attributes: string): string[] {
    const modernAttrs: string[] = [];
    const modernAttrPatterns = [
      /loading=["']lazy["']/,
      /decoding=["']async["']/,
      /fetchpriority=["'](high|low)["']/,
      /enterkeyhint=["']\w+["']/,
      /inputmode=["']\w+["']/
    ];

    modernAttrPatterns.forEach(pattern => {
      if (pattern.test(attributes)) {
        const match = attributes.match(pattern);
        if (match && match[0]) {
          const attrName = match[0].split('=')[0];
          if (attrName) {
            modernAttrs.push(attrName);
          }
        }
      }
    });

    return modernAttrs;
  }

  private getContext(content: string, line: number): string {
    const lines = content.split('\n');
    const targetLine = lines[line - 1] || '';
    return targetLine.trim();
  }

  getSupportedExtensions(): string[] {
    return ['.vue'];
  }

  getName(): string {
    return 'VueParser';
  }
}
