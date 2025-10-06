import { readdir, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import { glob } from 'glob';

/**
 * Smart directory filtering to skip node_modules and build outputs
 */
export class DirectoryFilter {
  private readonly defaultExcludePatterns: string[] = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    '.output',
    'coverage',
    '.nyc_output',
    '.cache',
    '.parcel-cache',
    '.vscode',
    '.idea',
    '*.log',
    '*.tmp',
    '*.temp',
    '.DS_Store',
    'Thumbs.db'
  ];

  private readonly defaultIncludeExtensions: string[] = [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.vue',
    '.svelte',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.html',
    '.htm'
  ];

  private readonly excludePatterns: Set<string>;
  private readonly includeExtensions: Set<string>;
  private readonly maxDepth: number;
  private readonly maxFiles: number;

  constructor(options: {
    excludePatterns?: string[];
    includeExtensions?: string[];
    maxDepth?: number;
    maxFiles?: number;
  } = {}) {
    this.excludePatterns = new Set([
      ...this.defaultExcludePatterns,
      ...(options.excludePatterns || [])
    ]);
    
    this.includeExtensions = new Set(
      options.includeExtensions || this.defaultIncludeExtensions
    );
    
    this.maxDepth = options.maxDepth || 10;
    this.maxFiles = options.maxFiles || 10000;
  }

  /**
   * Find files recursively with smart filtering
   */
  async findFiles(
    directories: string[],
    options: {
      patterns?: string[];
      excludePatterns?: string[];
      includeHidden?: boolean;
    } = {}
  ): Promise<string[]> {
    const {
      patterns = [],
      excludePatterns = [],
      includeHidden = false
    } = options;

    const allExcludePatterns = new Set([
      ...this.excludePatterns,
      ...excludePatterns
    ]);

    const files: string[] = [];
    const processedDirs = new Set<string>();

    for (const directory of directories) {
      try {
        await this.findFilesRecursive(
          directory,
          files,
          allExcludePatterns,
          patterns,
          includeHidden,
          0,
          processedDirs
        );
      } catch (error) {
        console.warn(`Could not scan directory ${directory}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Stop if we've found too many files
      if (files.length >= this.maxFiles) {
        console.warn(`Reached maximum file limit (${this.maxFiles}). Some files may be skipped.`);
        break;
      }
    }

    return files.slice(0, this.maxFiles);
  }

  /**
   * Find files using glob patterns (faster for specific patterns)
   */
  async findFilesWithGlob(
    patterns: string[],
    options: {
      cwd?: string;
      excludePatterns?: string[];
    } = {}
  ): Promise<string[]> {
    const { cwd = process.cwd(), excludePatterns = [] } = options;

    try {
      const allFiles = await glob(patterns, {
        cwd,
        ignore: [
          ...Array.from(this.excludePatterns),
          ...excludePatterns
        ],
        absolute: true,
        nodir: true
      });

      // Filter by supported extensions
      return allFiles.filter(file => this.isSupportedFile(file));
    } catch (error) {
      console.error(`Glob search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Check if a file should be processed
   */
  isSupportedFile(filePath: string): boolean {
    const extension = extname(filePath).toLowerCase();
    return this.includeExtensions.has(extension);
  }

  /**
   * Check if a directory should be excluded
   */
  isExcludedDirectory(dirPath: string): boolean {
    const dirName = basename(dirPath);
    
    // Check exact matches
    if (this.excludePatterns.has(dirName)) {
      return true;
    }

    // Check pattern matches
    for (const pattern of this.excludePatterns) {
      if (pattern.includes('*') || pattern.includes('?')) {
        // Simple glob pattern matching
        const regex = new RegExp(
          pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
        );
        if (regex.test(dirName)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get file statistics for a directory
   */
  async getDirectoryStats(directoryPath: string): Promise<{
    totalFiles: number;
    supportedFiles: number;
    directories: number;
    excludedDirectories: number;
    largestFiles: Array<{ path: string; size: number }>;
  }> {
    const stats = {
      totalFiles: 0,
      supportedFiles: 0,
      directories: 0,
      excludedDirectories: 0,
      largestFiles: [] as Array<{ path: string; size: number }>
    };

    try {
      await this.collectStats(directoryPath, stats, 0);
    } catch (error) {
      console.warn(`Could not collect stats for ${directoryPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Sort largest files
    stats.largestFiles.sort((a, b) => b.size - a.size);
    stats.largestFiles = stats.largestFiles.slice(0, 10);

    return stats;
  }

  /**
   * Recursive file finding with smart filtering
   */
  private async findFilesRecursive(
    currentPath: string,
    results: string[],
    excludePatterns: Set<string>,
    includePatterns: string[],
    includeHidden: boolean,
    currentDepth: number,
    processedDirs: Set<string>
  ): Promise<void> {
    // Prevent infinite loops with symlinks
    if (processedDirs.has(currentPath)) {
      return;
    }
    processedDirs.add(currentPath);

    // Check depth limit
    if (currentDepth >= this.maxDepth) {
      return;
    }

    // Check file limit
    if (results.length >= this.maxFiles) {
      return;
    }

    try {
      const entries = await readdir(currentPath);

      for (const entry of entries) {
        // Skip hidden files/directories unless explicitly included
        if (!includeHidden && entry.startsWith('.')) {
          continue;
        }

        const fullPath = join(currentPath, entry);

        try {
          const stats = await stat(fullPath);

          if (stats.isDirectory()) {
            // Check if directory should be excluded
            if (this.isExcludedDirectory(fullPath)) {
              continue;
            }

            // Recurse into directory
            await this.findFilesRecursive(
              fullPath,
              results,
              excludePatterns,
              includePatterns,
              includeHidden,
              currentDepth + 1,
              processedDirs
            );
          } else if (stats.isFile()) {
            // Check if file matches patterns
            if (this.shouldIncludeFile(fullPath, includePatterns)) {
              results.push(fullPath);
            }
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
   * Check if file should be included based on patterns
   */
  private shouldIncludeFile(filePath: string, includePatterns: string[]): boolean {
    // If no specific patterns, use extension filtering
    if (includePatterns.length === 0) {
      return this.isSupportedFile(filePath);
    }

    // Check against include patterns
    const fileName = basename(filePath);
    return includePatterns.some(pattern => {
      if (pattern.includes('*') || pattern.includes('?')) {
        const regex = new RegExp(
          pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
        );
        return regex.test(fileName);
      }
      return fileName === pattern;
    });
  }

  /**
   * Collect directory statistics recursively
   */
  private async collectStats(
    currentPath: string,
    stats: any,
    currentDepth: number
  ): Promise<void> {
    if (currentDepth >= this.maxDepth) {
      return;
    }

    try {
      const entries = await readdir(currentPath);

      for (const entry of entries) {
        const fullPath = join(currentPath, entry);

        try {
          const fileStat = await stat(fullPath);

          if (fileStat.isDirectory()) {
            stats.directories++;
            
            if (this.isExcludedDirectory(fullPath)) {
              stats.excludedDirectories++;
              continue;
            }

            await this.collectStats(fullPath, stats, currentDepth + 1);
          } else if (fileStat.isFile()) {
            stats.totalFiles++;
            
            if (this.isSupportedFile(fullPath)) {
              stats.supportedFiles++;
            }

            // Track largest files
            if (stats.largestFiles.length < 100) {
              stats.largestFiles.push({
                path: fullPath,
                size: fileStat.size
              });
            }
          }
        } catch (error) {
          // Skip files/directories that can't be accessed
          continue;
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  /**
   * Get supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.includeExtensions);
  }

  /**
   * Get exclude patterns
   */
  getExcludePatterns(): string[] {
    return Array.from(this.excludePatterns);
  }

  /**
   * Add custom exclude pattern
   */
  addExcludePattern(pattern: string): void {
    this.excludePatterns.add(pattern);
  }

  /**
   * Remove exclude pattern
   */
  removeExcludePattern(pattern: string): void {
    this.excludePatterns.delete(pattern);
  }

  /**
   * Add supported extension
   */
  addSupportedExtension(extension: string): void {
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
    this.includeExtensions.add(extension.toLowerCase());
  }

  /**
   * Remove supported extension
   */
  removeSupportedExtension(extension: string): void {
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
    this.includeExtensions.delete(extension.toLowerCase());
  }
}