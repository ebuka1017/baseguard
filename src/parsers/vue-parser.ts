import { Parser } from './parser.js';
import type { DetectedFeature } from '../types/index.js';

export class VueParser extends Parser {
  canParse(filePath: string): boolean {
    return /\.vue$/.test(filePath);
  }

  async parseFeatures(content: string, filePath: string): Promise<DetectedFeature[]> {
    throw new Error('Not implemented yet');
  }

  getSupportedExtensions(): string[] {
    return ['.vue'];
  }

  getName(): string {
    return 'VueParser';
  }
}
