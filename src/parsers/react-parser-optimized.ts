import { Parser } from './parser.js';
import type { DetectedFeature } from '../types/index.js';
import { LazyLoader } from '../core/lazy-loader.js';

/**
 * Optimized React/JSX parser using lazy loading
 */
export class ReactParser extends Parser {
  getName(): string {
    return 'ReactParser';
  }

  getSupportedExtensions(): string[] {
    return ['.jsx', '.tsx'];
  }

  canParse(filePath: string): boolean {
    return /\.(jsx|tsx)$/.test(filePath);
  }

  async parseFeatures(content: string, filePath: string): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    try {
      // Lazy load Babel dependencies only when needed
      const [parser, traverse] = await Promise.all([
        LazyLoader.getBabelParser(),
        LazyLoader.getBabelTraverse()
      ]);

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

      // Simple feature extraction optimized for performance
      traverse(ast, {
        MemberExpression: (path: any) => {
          const apiName = this.extractAPIName(path.node);
          if (apiName && this.isWebPlatformAPI(apiName)) {
            features.push({
              feature: apiName,
              type: 'js',
              context: this.getContext(content, path.node.loc?.start.line || 0),
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              file: filePath
            });
          }
        },

        CallExpression: (path: any) => {
          const apiName = this.extractCallName(path.node);
          if (apiName && this.isWebPlatformAPI(apiName)) {
            features.push({
              feature: apiName,
              type: 'js',
              context: this.getContext(content, path.node.loc?.start.line || 0),
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              file: filePath
            });
          }
        },

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
        }
      });

    } catch (error) {
      console.warn(`Warning: Could not parse React file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return features;
  }

  private extractAPIName(node: any): string | null {
    try {
      if (node.object && node.property) {
        const objectName = node.object.name || 'unknown';
        const propertyName = node.property.name || node.property.value || 'unknown';
        return `${objectName}.${propertyName}`;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  private extractCallName(node: any): string | null {
    try {
      if (node.callee) {
        if (node.callee.name) {
          return node.callee.name;
        }
        if (node.callee.object && node.callee.property) {
          const objectName = node.callee.object.name || 'unknown';
          const propertyName = node.callee.property.name || node.callee.property.value || 'unknown';
          return `${objectName}.${propertyName}`;
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  private isWebPlatformAPI(apiName: string): boolean {
    const webAPIs = [
      'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
      'navigator.serviceWorker', 'caches', 'Cache',
      'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
      'canvas.getContext', 'WebGLRenderingContext', 'WebGL2RenderingContext',
      'RTCPeerConnection', 'getUserMedia', 'MediaStream',
      'WebAssembly', 'structuredClone', 'queueMicrotask',
      'requestAnimationFrame', 'requestIdleCallback'
    ];
    
    return webAPIs.some(api => apiName.includes(api) || api.includes(apiName));
  }

  private getContext(content: string, line: number): string {
    const lines = content.split('\n');
    return lines[line - 1]?.trim() || '';
  }
}