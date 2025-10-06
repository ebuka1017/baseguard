import type { DetectedFeature } from '../types/index.js';
import { Parser } from './parser.js';
import { FeatureValidator } from './feature-validator.js';
import { LazyLoader } from '../core/lazy-loader.js';
import { MemoryManager } from '../core/memory-manager.js';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

/**
 * Parser manager that coordinates all parsers and provides concurrent processing
 * for large codebases with advanced web APIs using lazy loading
 */
export class ParserManager {
  private parsers: Map<string, Parser> = new Map();
  private readonly validator: FeatureValidator;
  private readonly maxConcurrency: number;
  private initialized = false;

  constructor(maxConcurrency: number = 10) {
    this.validator = new FeatureValidator();
    this.maxConcurrency = maxConcurrency;
    // Don't initialize parsers immediately - use lazy loading
  }

  /**
   * Lazy load parsers only when needed
   */
  private async ensureParsersLoaded(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Dynamically import parsers to reduce startup time
      const [
        { ReactParser },
        { VueParser },
        { SvelteParser },
        { VanillaParser }
      ] = await Promise.all([
        import('./react-parser.js'),
        import('./vue-parser.js'),
        import('./svelte-parser.js'),
        import('./vanilla-parser.js')
      ]);

      this.parsers.set('react', new ReactParser());
      this.parsers.set('vue', new VueParser());
      this.parsers.set('svelte', new SvelteParser());
      this.parsers.set('vanilla', new VanillaParser());

      this.initialized = true;
    } catch (error) {
      console.warn('Failed to load some parsers:', error);
      this.initialized = true;
    }
  }

  /**
   * Get parser for file type with lazy loading
   */
  private async getParserForFile(filePath: string): Promise<Parser | null> {
    await this.ensureParsersLoaded();

    for (const parser of this.parsers.values()) {
      if (parser.canParse(filePath)) {
        return parser;
      }
    }

    return null;
  }

  /**
   * Parse multiple files concurrently with error handling
   */
  async parseFiles(filePaths: string[]): Promise<DetectedFeature[]> {
    const allFeatures: DetectedFeature[] = [];
    
    // Filter out unsupported files
    const supportedFiles = filePaths.filter(filePath => this.canParseFile(filePath));
    
    if (supportedFiles.length === 0) {
      return [];
    }

    // Process files in batches for better performance
    const batches = this.createBatches(supportedFiles, this.maxConcurrency);
    
    for (const batch of batches) {
      try {
        const batchResults = await Promise.allSettled(
          batch.map(filePath => this.parseFile(filePath))
        );
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allFeatures.push(...result.value);
          } else {
            console.warn(`Failed to parse ${batch[index]}: ${result.reason}`);
          }
        });
        
        // Small delay between batches to prevent overwhelming the system
        if (batches.length > 1) {
          await this.sleep(10);
        }
        
      } catch (error) {
        console.error(`Error processing batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Validate and filter features
    return this.validator.validateFeatures(allFeatures, this.maxConcurrency);
  }

  /**
   * Parse a single file with memory optimization
   */
  async parseFile(filePath: string): Promise<DetectedFeature[]> {
    try {
      // Find appropriate parser
      const parser = await this.getParserForFile(filePath);
      if (!parser) {
        return [];
      }

      // Check file size and use streaming for large files
      const fileStats = await stat(filePath);
      
      if (MemoryManager.shouldStream(fileStats.size)) {
        return await this.parseFileStreaming(filePath, parser);
      }

      // Read file content for smaller files
      const content = await readFile(filePath, 'utf-8');
      
      // Parse features
      const features = await parser.parseFeatures(content, filePath);
      
      // Add file path to features for tracking and optimize memory
      return features.map(feature => MemoryManager.optimizeObject({
        ...feature,
        file: filePath
      }));
      
    } catch (error) {
      // Graceful error handling for unsupported files and syntax errors
      if (error instanceof Error) {
        if (error.message.includes('ENOENT')) {
          console.warn(`File not found: ${filePath}`);
        } else if (error.message.includes('SyntaxError') || error.message.includes('Unexpected token')) {
          console.warn(`Syntax error in ${filePath}: ${error.message}`);
        } else {
          console.warn(`Error parsing ${filePath}: ${error.message}`);
        }
      } else {
        console.warn(`Unknown error parsing ${filePath}`);
      }
      return [];
    }
  }

  /**
   * Parse large files using streaming to reduce memory usage
   */
  private async parseFileStreaming(filePath: string, parser: Parser): Promise<DetectedFeature[]> {
    const features: DetectedFeature[] = [];
    
    await MemoryManager.readFileStreaming(filePath, async (chunk, startLine) => {
      try {
        const chunkFeatures = await parser.parseFeatures(chunk, filePath);
        
        // Adjust line numbers for chunk offset
        const adjustedFeatures = chunkFeatures.map(feature => ({
          ...feature,
          line: feature.line + startLine - 1,
          file: filePath
        }));
        
        features.push(...adjustedFeatures);
      } catch (error) {
        // Continue processing other chunks even if one fails
        console.warn(`Error parsing chunk in ${filePath}: ${error}`);
      }
    });

    return features;
  }

  /**
   * Check if a file can be parsed by any available parser
   */
  async canParseFile(filePath: string): Promise<boolean> {
    await this.ensureParsersLoaded();
    
    for (const parser of this.parsers.values()) {
      if (parser.canParse(filePath)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get all supported file extensions
   */
  async getSupportedExtensions(): Promise<string[]> {
    await this.ensureParsersLoaded();
    
    const extensions = new Set<string>();
    this.parsers.forEach(parser => {
      parser.getSupportedExtensions().forEach(ext => extensions.add(ext));
    });
    return Array.from(extensions);
  }

  /**
   * Get parser information for debugging
   */
  async getParserInfo(): Promise<Array<{ name: string; extensions: string[] }>> {
    await this.ensureParsersLoaded();
    
    return Array.from(this.parsers.values()).map(parser => ({
      name: parser.getName(),
      extensions: parser.getSupportedExtensions()
    }));
  }

  /**
   * Filter files by supported extensions
   */
  async filterSupportedFiles(filePaths: string[]): Promise<string[]> {
    const supportedExtensions = await this.getSupportedExtensions();
    return filePaths.filter(filePath => {
      const extension = this.getFileExtension(filePath);
      return supportedExtensions.includes(extension);
    });
  }

  /**
   * Scan directory for supported files (recursive)
   */
  async scanDirectory(
    directoryPath: string,
    options: {
      recursive?: boolean;
      excludePatterns?: string[];
      maxDepth?: number;
    } = {}
  ): Promise<string[]> {
    const {
      recursive = true,
      excludePatterns = ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt'],
      maxDepth = 10
    } = options;

    const supportedFiles: string[] = [];
    
    try {
      await this.scanDirectoryRecursive(
        directoryPath,
        supportedFiles,
        excludePatterns,
        recursive,
        0,
        maxDepth
      );
    } catch (error) {
      console.error(`Error scanning directory ${directoryPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return supportedFiles;
  }

  /**
   * Recursive directory scanning helper
   */
  private async scanDirectoryRecursive(
    currentPath: string,
    results: string[],
    excludePatterns: string[],
    recursive: boolean,
    currentDepth: number,
    maxDepth: number
  ): Promise<void> {
    if (currentDepth >= maxDepth) {
      return;
    }

    try {
      const { readdir, stat } = await import('fs/promises');
      const entries = await readdir(currentPath);

      for (const entry of entries) {
        const fullPath = join(currentPath, entry);
        
        // Skip excluded patterns
        if (excludePatterns.some(pattern => entry.includes(pattern))) {
          continue;
        }

        try {
          const stats = await stat(fullPath);
          
          if (stats.isFile()) {
            if (await this.canParseFile(fullPath)) {
              results.push(fullPath);
            }
          } else if (stats.isDirectory() && recursive) {
            await this.scanDirectoryRecursive(
              fullPath,
              results,
              excludePatterns,
              recursive,
              currentDepth + 1,
              maxDepth
            );
          }
        } catch (error) {
          // Skip files/directories that can't be accessed
          continue;
        }
      }
    } catch (error) {
      console.warn(`Could not read directory ${currentPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(filePaths: string[]): Promise<{
    totalFiles: number;
    supportedFiles: number;
    filesByType: Record<string, number>;
    estimatedProcessingTime: number;
    memoryEstimate: string;
  }> {
    const supportedFiles = await this.filterSupportedFiles(filePaths);
    const filesByType: Record<string, number> = {};
    
    supportedFiles.forEach(filePath => {
      const extension = this.getFileExtension(filePath);
      filesByType[extension] = (filesByType[extension] || 0) + 1;
    });

    // Rough estimation: 10ms per file on average
    const estimatedProcessingTime = Math.ceil(supportedFiles.length * 10 / this.maxConcurrency);
    
    // Memory estimate: ~50KB per file on average
    const memoryEstimate = `${Math.round(supportedFiles.length * 50 / 1024)}MB`;

    return {
      totalFiles: filePaths.length,
      supportedFiles: supportedFiles.length,
      filesByType,
      estimatedProcessingTime,
      memoryEstimate
    };
  }

  /**
   * Get memory and performance statistics
   */
  getStats(): {
    parsersLoaded: number;
    maxConcurrency: number;
    memoryStats: any;
  } {
    return {
      parsersLoaded: this.parsers.size,
      maxConcurrency: this.maxConcurrency,
      memoryStats: MemoryManager.getMemoryStats()
    };
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
   * Get file extension
   */
  private getFileExtension(filePath: string): string {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  /**
   * Sleep utility for batch processing
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get feature validator instance
   */
  getValidator(): FeatureValidator {
    return this.validator;
  }

  /**
   * Validate features without parsing (for external use)
   */
  async validateFeatures(features: DetectedFeature[]): Promise<DetectedFeature[]> {
    return this.validator.validateFeatures(features, this.maxConcurrency);
  }
}