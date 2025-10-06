import type { Violation, Analysis, Fix, Configuration } from '../types/index.js';
import { ParserManager } from '../parsers/parser-manager.js';
import { BaselineChecker } from './baseline-checker.js';
import { FileProcessor } from './file-processor.js';
import { DirectoryFilter } from './directory-filter.js';
import { CacheManager } from './cache-manager.js';

/**
 * Main BaseGuard class that orchestrates compatibility checking and fixing
 */
export class BaseGuard {
  private config: Configuration;
  private parserManager: ParserManager;
  private baselineChecker: BaselineChecker;
  private fileProcessor: FileProcessor;
  private directoryFilter: DirectoryFilter;
  private cacheManager: CacheManager;

  constructor(config: Configuration) {
    this.config = config;
    this.cacheManager = new CacheManager({
      maxCacheSize: 2000,
      cacheValidityMs: 10 * 60 * 1000 // 10 minutes
    });
    this.parserManager = new ParserManager();
    this.baselineChecker = new BaselineChecker();
    this.fileProcessor = new FileProcessor({
      maxWorkers: 8,
      cacheManager: this.cacheManager
    });
    this.directoryFilter = new DirectoryFilter({
      maxDepth: 8,
      maxFiles: 5000
    });
  }

  /**
   * Check files for compatibility violations with performance optimizations
   */
  async checkViolations(patterns: string[] = []): Promise<Violation[]> {
    const violations: Violation[] = [];
    
    // Find files using smart filtering and caching
    const allFiles = patterns.length > 0 
      ? await this.directoryFilter.findFilesWithGlob(patterns)
      : await this.directoryFilter.findFiles(['src', 'app', 'pages', 'components'], {
          includeHidden: false
        });
    
    if (allFiles.length === 0) {
      console.warn('No supported files found to check');
      return violations;
    }

    console.log(`Processing ${allFiles.length} files...`);
    
    // Process files concurrently with caching
    const allFeatures = await this.fileProcessor.processFiles(allFiles);
    
    // Check each feature for compatibility violations
    for (const feature of allFeatures) {
      try {
        const compatibilityResult = await this.baselineChecker.checkCompatibility(
          feature,
          this.config.targets
        );
        
        // Add violations with file context
        for (const violation of compatibilityResult.violations) {
          violations.push({
            ...violation,
            file: feature.file || 'unknown',
            line: feature.line,
            column: feature.column,
            context: feature.context
          });
        }
      } catch (error) {
        console.warn(`Warning: Could not check compatibility for feature ${feature.feature}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return violations;
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(directories: string[] = ['src']): Promise<{
    directoryStats: any;
    processorStats: any;
    cacheStats: any;
  }> {
    const directoryStats = await Promise.all(
      directories.map(dir => this.directoryFilter.getDirectoryStats(dir))
    );

    return {
      directoryStats: directoryStats.reduce((acc, stats) => ({
        totalFiles: acc.totalFiles + stats.totalFiles,
        supportedFiles: acc.supportedFiles + stats.supportedFiles,
        directories: acc.directories + stats.directories,
        excludedDirectories: acc.excludedDirectories + stats.excludedDirectories,
        largestFiles: [...acc.largestFiles, ...stats.largestFiles]
          .sort((a, b) => b.size - a.size)
          .slice(0, 10)
      }), {
        totalFiles: 0,
        supportedFiles: 0,
        directories: 0,
        excludedDirectories: 0,
        largestFiles: []
      }),
      processorStats: this.fileProcessor.getStats(),
      cacheStats: this.cacheManager.getStats()
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cacheManager.clearAll();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.fileProcessor.cleanup();
    this.cacheManager.clearAll();
  }

  /**
   * Analyze violations using AI
   */
  async analyzeViolations(violations: Violation[]): Promise<Analysis[]> {
    // Implementation will be added in task 4
    throw new Error('Not implemented yet');
  }

  /**
   * Generate fixes for violations
   */
  async generateFixes(violations: Violation[], analyses: Analysis[]): Promise<Fix[]> {
    // Implementation will be added in task 5
    throw new Error('Not implemented yet');
  }

  /**
   * Apply fixes to files
   */
  async applyFixes(fixes: Fix[]): Promise<void> {
    // Implementation will be added in task 5
    throw new Error('Not implemented yet');
  }
}