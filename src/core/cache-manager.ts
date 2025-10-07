import { createHash } from 'crypto';
import { stat } from 'fs/promises';
import type { DetectedFeature } from '../types/index.js';

/**
 * LRU Cache implementation for web-features data and parsing results
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value as K;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * File metadata for incremental scanning
 */
interface FileMetadata {
  path: string;
  mtime: number;
  size: number;
  hash: string;
}

/**
 * Cached parsing result
 */
interface CachedResult {
  features: DetectedFeature[];
  metadata: FileMetadata;
  timestamp: number;
}

/**
 * Cache manager for efficient file processing and incremental scanning
 */
export class CacheManager {
  private readonly parseCache: LRUCache<string, CachedResult>;
  private readonly webFeaturesCache: LRUCache<string, any>;
  private readonly fileMetadataCache: Map<string, FileMetadata>;
  private readonly maxCacheSize: number;
  private readonly cacheValidityMs: number;

  constructor(options: {
    maxCacheSize?: number;
    cacheValidityMs?: number;
  } = {}) {
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.cacheValidityMs = options.cacheValidityMs || 5 * 60 * 1000; // 5 minutes
    this.parseCache = new LRUCache(this.maxCacheSize);
    this.webFeaturesCache = new LRUCache(500);
    this.fileMetadataCache = new Map();
  }

  /**
   * Get cached parsing result if file hasn't changed
   */
  async getCachedParseResult(filePath: string): Promise<DetectedFeature[] | null> {
    try {
      const currentMetadata = await this.getFileMetadata(filePath);
      const cached = this.parseCache.get(filePath);

      if (!cached) {
        return null;
      }

      // Check if file has changed
      if (this.hasFileChanged(cached.metadata, currentMetadata)) {
        this.parseCache.set(filePath, { ...cached, metadata: currentMetadata });
        return null;
      }

      // Check cache validity
      if (Date.now() - cached.timestamp > this.cacheValidityMs) {
        return null;
      }

      return cached.features;
    } catch (error) {
      // File doesn't exist or can't be accessed
      return null;
    }
  }

  /**
   * Cache parsing result
   */
  async setCachedParseResult(filePath: string, features: DetectedFeature[]): Promise<void> {
    try {
      const metadata = await this.getFileMetadata(filePath);
      const cached: CachedResult = {
        features,
        metadata,
        timestamp: Date.now()
      };
      
      this.parseCache.set(filePath, cached);
      this.fileMetadataCache.set(filePath, metadata);
    } catch (error) {
      // Ignore caching errors
    }
  }

  /**
   * Get cached web-features data
   */
  getCachedWebFeature(featureId: string): any | null {
    return this.webFeaturesCache.get(featureId) || null;
  }

  /**
   * Cache web-features data
   */
  setCachedWebFeature(featureId: string, data: any): void {
    this.webFeaturesCache.set(featureId, data);
  }

  /**
   * Check if files have changed since last scan
   */
  async getChangedFiles(filePaths: string[]): Promise<{
    changed: string[];
    unchanged: string[];
  }> {
    const changed: string[] = [];
    const unchanged: string[] = [];

    await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const currentMetadata = await this.getFileMetadata(filePath);
          const cachedMetadata = this.fileMetadataCache.get(filePath);

          if (!cachedMetadata || this.hasFileChanged(cachedMetadata, currentMetadata)) {
            changed.push(filePath);
            this.fileMetadataCache.set(filePath, currentMetadata);
          } else {
            unchanged.push(filePath);
          }
        } catch (error) {
          // File doesn't exist or can't be accessed, consider it changed
          changed.push(filePath);
        }
      })
    );

    return { changed, unchanged };
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.parseCache.clear();
    this.webFeaturesCache.clear();
    this.fileMetadataCache.clear();
  }

  /**
   * Clear expired cache entries
   */
  clearExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find expired parse cache entries
    for (const [key, value] of this.parseCache['cache']) {
      if (now - value.timestamp > this.cacheValidityMs) {
        expiredKeys.push(key);
      }
    }

    // Remove expired entries
    expiredKeys.forEach(key => {
      this.parseCache['cache'].delete(key);
      this.fileMetadataCache.delete(key);
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    parseCache: { size: number; maxSize: number };
    webFeaturesCache: { size: number; maxSize: number };
    fileMetadataCache: { size: number };
  } {
    return {
      parseCache: {
        size: this.parseCache.size(),
        maxSize: this.maxCacheSize
      },
      webFeaturesCache: {
        size: this.webFeaturesCache.size(),
        maxSize: 500
      },
      fileMetadataCache: {
        size: this.fileMetadataCache.size
      }
    };
  }

  /**
   * Get file metadata for change detection
   */
  private async getFileMetadata(filePath: string): Promise<FileMetadata> {
    const stats = await stat(filePath);
    const hash = this.generateFileHash(filePath, stats.mtime.getTime(), stats.size);
    
    return {
      path: filePath,
      mtime: stats.mtime.getTime(),
      size: stats.size,
      hash
    };
  }

  /**
   * Check if file has changed based on metadata
   */
  private hasFileChanged(cached: FileMetadata, current: FileMetadata): boolean {
    return cached.mtime !== current.mtime || 
           cached.size !== current.size || 
           cached.hash !== current.hash;
  }

  /**
   * Generate hash for file identification
   */
  private generateFileHash(filePath: string, mtime: number, size: number): string {
    return createHash('md5')
      .update(`${filePath}:${mtime}:${size}`)
      .digest('hex');
  }
}