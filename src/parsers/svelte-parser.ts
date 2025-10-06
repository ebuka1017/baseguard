import { Parser } from './parser.js';
import type { DetectedFeature } from '../types/index.js';
import { LazyLoader } from '../core/lazy-loader.js';

/**
 * Parser for Svelte files (.svelte) - extracts ALL web platform features
 * while ignoring Svelte-specific syntax
 */
export class SvelteParser extends Parser {
  private readonly SVELTE_SPECIFIC_APIS = new Set([
    // Svelte stores
    'writable', 'readable', 'derived', 'get', 'subscribe', 'set', 'update',
    
    // Svelte lifecycle
    'onMount', 'onDestroy', 'beforeUpdate', 'afterUpdate', 'tick',
    'setContext', 'getContext', 'hasContext', 'getAllContexts',
    
    // Svelte actions and transitions
    'createEventDispatcher', 'dispatch',
    
    // SvelteKit specific
    'page', 'navigating', 'updated', 'goto', 'prefetch', 'prefetchRoutes',
    'invalidate', 'invalidateAll', 'preloadData', 'preloadCode',
    
    // Svelte compiler directives (handled separately)
    'bind', 'on', 'use', 'transition', 'in', 'out', 'animate'
  ]);

  private readonly SVELTE_DIRECTIVES = new Set([
    'bind:', 'on:', 'use:', 'transition:', 'in:', 'out:', 'animate:', 'class:', 'style:'
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
    return filePath.endsWith('.svelte');
  }

  getSupportedExtensions(): string[] {
    return ['.svelte'];
  }

  getName(): string {
    return 'SvelteParser';
  }

  async parseFeatures(content: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      // Lazy load Svelte compiler
      const svelteCompiler = await LazyLoader.getSvelteCompiler();
      const ast = svelteCompiler.parse(content, { filename: filePath });
      
      // Parse script sections for JavaScript features
      if (ast.instance) {
        const scriptFeatures = await this.parseScriptSection(
          ast.instance,
          content,
          filePath,
          'instance'
        );
        features.push(...scriptFeatures);
      }
      
      if (ast.module) {
        const moduleFeatures = await this.parseScriptSection(
          ast.module,
          content,
          filePath,
          'module'
        );
        features.push(...moduleFeatures);
      }
      
      // Parse CSS from style sections
      if (ast.css) {
        const styleFeatures = await this.parseStyleSection(
          ast.css,
          content,
          filePath
        );
        features.push(...styleFeatures);
      }
      
      // Parse HTML template for standard elements
      if (ast.html) {
        const templateFeatures = this.parseTemplateSection(
          ast.html,
          content,
          filePath
        );
        features.push(...templateFeatures);
      }
      
    } catch (error) {
      console.warn(`Warning: Could not parse Svelte file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private async parseScriptSection(
    scriptNode: any,
    fullContent: string,
    filePath: string,
    sectionType: 'instance' | 'module'
  ): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      // Extract the script content from the full file
      const scriptContent = this.extractScriptContent(scriptNode, fullContent);
      
      // Determine if TypeScript
      const isTypeScript = scriptNode.attributes?.some((attr: any) => 
        attr.name === 'lang' && (attr.value[0]?.data === 'ts' || attr.value[0]?.data === 'typescript')
      );
      
      const ast = parseBabel(scriptContent, {
        sourceType: 'module',
        plugins: [
          'typescript' as any,
          'decorators-legacy' as any,
          'classProperties' as any,
          'objectRestSpread' as any,
          'asyncGenerators' as any,
          'functionBind' as any,
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
        MemberExpression: (path) => {
          const feature = this.extractWebAPIFeature(path.node, scriptContent, scriptNode.start);
          if (feature) {
            features.push({ ...feature, file: filePath });
          }
        },

        // Extract function calls to Web APIs
        CallExpression: (path) => {
          const feature = this.extractWebAPICall(path.node, scriptContent, scriptNode.start);
          if (feature) {
            features.push({ ...feature, file: filePath });
          }
        },

        // Extract modern JavaScript syntax features
        OptionalMemberExpression: (path) => {
          features.push({
            feature: 'optional-chaining',
            type: 'js',
            context: this.getContext(scriptContent, path.node.loc?.start.line || 0),
            line: (path.node.loc?.start.line || 0) + this.getLineOffset(scriptNode.start, fullContent),
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        // Nullish coalescing
        LogicalExpression: (path) => {
          if (path.node.operator === '??') {
            features.push({
              feature: 'nullish-coalescing',
              type: 'js',
              context: this.getContext(scriptContent, path.node.loc?.start.line || 0),
              line: (path.node.loc?.start.line || 0) + this.getLineOffset(scriptNode.start, fullContent),
              column: path.node.loc?.start.column || 0,
              file: filePath
            });
          }
        },

        // Private class fields
        ClassPrivateProperty: (path) => {
          features.push({
            feature: 'private-fields',
            type: 'js',
            context: this.getContext(scriptContent, path.node.loc?.start.line || 0),
            line: (path.node.loc?.start.line || 0) + this.getLineOffset(scriptNode.start, fullContent),
            column: path.node.loc?.start.column || 0,
            file: filePath
          });
        },

        // Top-level await
        AwaitExpression: (path) => {
          if (this.isTopLevelAwait(path)) {
            features.push({
              feature: 'top-level-await',
              type: 'js',
              context: this.getContext(scriptContent, path.node.loc?.start.line || 0),
              line: (path.node.loc?.start.line || 0) + this.getLineOffset(scriptNode.start, fullContent),
              column: path.node.loc?.start.column || 0,
              file: filePath
            });
          }
        }
      });

    } catch (error) {
      console.warn(`Warning: Could not parse ${sectionType} script in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private async parseStyleSection(
    styleNode: any,
    fullContent: string,
    filePath: string
  ): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      const styleContent = this.extractStyleContent(styleNode, fullContent);
      const lineOffset = this.getLineOffset(styleNode.start, fullContent);
      
      const root = postcss.parse(styleContent);
      
      root.walkDecls(decl => {
        features.push({
          feature: decl.prop,
          type: 'css',
          context: `${decl.prop}: ${decl.value}`,
          line: (decl.source?.start?.line || 0) + lineOffset,
          column: decl.source?.start?.column || 0,
          file: filePath
        });
      });

      root.walkRules(rule => {
        // Extract CSS selectors that might be modern features
        if (rule.selector.includes(':has(') || 
            rule.selector.includes(':is(') || 
            rule.selector.includes(':where(') ||
            rule.selector.includes(':focus-visible')) {
          features.push({
            feature: this.extractSelectorFeature(rule.selector),
            type: 'css',
            context: rule.selector,
            line: (rule.source?.start?.line || 0) + lineOffset,
            column: rule.source?.start?.column || 0,
            file: filePath
          });
        }
      });

      root.walkAtRules(atRule => {
        // Extract at-rules like @supports, @container, etc.
        features.push({
          feature: `@${atRule.name}`,
          type: 'css',
          context: `@${atRule.name} ${atRule.params}`,
          line: (atRule.source?.start?.line || 0) + lineOffset,
          column: atRule.source?.start?.column || 0,
          file: filePath
        });
      });
      
    } catch (error) {
      console.warn(`Warning: Could not parse style section in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private parseTemplateSection(
    htmlNode: any,
    fullContent: string,
    filePath: string
  ): DetectedFeature[] {
    const features: DetectedFeature[] = [];
    
    try {
      // Walk through the HTML AST to find standard HTML elements
      this.walkHtmlNode(htmlNode, (node: any) => {
        if (node.type === 'Element') {
          const tagName = node.name;
          
          // Check for modern HTML elements
          if (this.isModernHTMLElement(tagName)) {
            const lineOffset = this.getLineOffset(node.start, fullContent);
            features.push({
              feature: tagName,
              type: 'html',
              context: this.getNodeContext(node, fullContent),
              line: lineOffset,
              column: 0,
              file: filePath
            });
          }
          
          // Check for modern HTML attributes (ignore Svelte directives)
          if (node.attributes) {
            node.attributes.forEach((attr: any) => {
              if (attr.type === 'Attribute' && !this.isSvelteDirective(attr.name)) {
                if (this.isModernHTMLAttribute(attr.name, attr.value)) {
                  const lineOffset = this.getLineOffset(node.start, fullContent);
                  features.push({
                    feature: attr.name,
                    type: 'html',
                    context: this.getNodeContext(node, fullContent),
                    line: lineOffset,
                    column: 0,
                    file: filePath
                  });
                }
              }
            });
          }
        }
      });
      
    } catch (error) {
      console.warn(`Warning: Could not parse template section in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private extractWebAPIFeature(node: t.MemberExpression, content: string, offset: number): DetectedFeature | null {
    const apiName = this.getMemberExpressionName(node);
    
    if (!apiName || this.SVELTE_SPECIFIC_APIS.has(apiName)) {
      return null;
    }

    if (this.WEB_PLATFORM_APIS.has(apiName)) {
      return {
        feature: apiName,
        type: 'js',
        context: this.getContext(content, node.loc?.start.line || 0),
        line: (node.loc?.start.line || 0) + this.getLineOffset(offset, content),
        column: node.loc?.start.column || 0
      };
    }

    return null;
  }

  private extractWebAPICall(node: t.CallExpression, content: string, offset: number): DetectedFeature | null {
    let apiName = '';
    
    if (t.isIdentifier(node.callee)) {
      apiName = node.callee.name;
    } else if (t.isMemberExpression(node.callee)) {
      apiName = this.getMemberExpressionName(node.callee);
    }

    if (!apiName || this.SVELTE_SPECIFIC_APIS.has(apiName)) {
      return null;
    }

    if (this.WEB_PLATFORM_APIS.has(apiName)) {
      return {
        feature: apiName,
        type: 'js',
        context: this.getContext(content, node.loc?.start.line || 0),
        line: (node.loc?.start.line || 0) + this.getLineOffset(offset, content),
        column: node.loc?.start.column || 0
      };
    }

    return null;
  }

  private extractScriptContent(scriptNode: any, fullContent: string): string {
    const start = scriptNode.content.start;
    const end = scriptNode.content.end;
    return fullContent.slice(start, end);
  }

  private extractStyleContent(styleNode: any, fullContent: string): string {
    const start = styleNode.content.start;
    const end = styleNode.content.end;
    return fullContent.slice(start, end);
  }

  private getLineOffset(position: number, content: string): number {
    return content.slice(0, position).split('\n').length - 1;
  }

  private walkHtmlNode(node: any, callback: (node: any) => void): void {
    callback(node);
    if (node.children) {
      node.children.forEach((child: any) => this.walkHtmlNode(child, callback));
    }
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

  private isSvelteDirective(attrName: string): boolean {
    return Array.from(this.SVELTE_DIRECTIVES).some((directive: string) => attrName.startsWith(directive));
  }

  private isModernHTMLAttribute(attrName: string, attrValue: any): boolean {
    const modernAttrs = new Set([
      'loading', 'decoding', 'fetchpriority', 'enterkeyhint', 'inputmode'
    ]);
    return modernAttrs.has(attrName);
  }

  private getNodeContext(node: any, fullContent: string): string {
    const start = node.start;
    const end = Math.min(node.end, start + 100); // Limit context length
    return fullContent.slice(start, end).trim();
  }

  private getContext(content: string, line: number): string {
    const lines = content.split('\n');
    const targetLine = lines[line - 1] || '';
    return targetLine.trim();
  }
}