import type { DetectedFeature } from '../types/index.js';

/**
 * Abstract base class for all code parsers
 */
export abstract class Parser {
  /**
   * Check if this parser can handle the given file
   */
  abstract canParse(filePath: string): boolean;

  /**
   * Parse features from file content
   */
  abstract parseFeatures(content: string, filePath: string): Promise<DetectedFeature[]>;

  /**
   * Get supported file extensions for this parser
   */
  abstract getSupportedExtensions(): string[];

  /**
   * Get parser name for identification
   */
  abstract getName(): string;
}