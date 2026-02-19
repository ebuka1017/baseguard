import { createReadStream } from 'fs';
import { createInterface } from 'readline';

/**
 * Memory-efficient file processing and streaming
 */
export class MemoryManager {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks
  private static readonly GC_THRESHOLD = 100 * 1024 * 1024; // 100MB

  /**
   * Check if file should be processed in streaming mode
   */
  static shouldStream(fileSize: number): boolean {
    return fileSize > this.MAX_FILE_SIZE;
  }

  /**
   * Read large file in chunks using streaming
   */
  static async readFileStreaming(
    filePath: string,
    processor: (chunk: string, lineNumber: number) => Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = createReadStream(filePath, {
        encoding: 'utf8',
        highWaterMark: this.CHUNK_SIZE
      });

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let lineNumber = 0;
      let currentChunk = '';
      let chunkLineCount = 0;

      rl.on('line', async (line) => {
        lineNumber++;
        currentChunk += line + '\n';
        chunkLineCount++;

        // Process in chunks to avoid memory buildup
        if (chunkLineCount >= 1000) {
          try {
            await processor(currentChunk, lineNumber - chunkLineCount + 1);
            currentChunk = '';
            chunkLineCount = 0;
            
            // Force garbage collection if available
            this.tryGarbageCollect();
          } catch (error) {
            rl.close();
            reject(error);
            return;
          }
        }
      });

      rl.on('close', async () => {
        try {
          // Process remaining chunk
          if (currentChunk.trim()) {
            await processor(currentChunk, lineNumber - chunkLineCount + 1);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      rl.on('error', reject);
      fileStream.on('error', reject);
    });
  }

  /**
   * Process array in memory-efficient batches
   */
  static async processBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize: number = 100
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      try {
        const batchResults = await processor(batch);
        results.push(...batchResults);
        
        // Force garbage collection between batches
        this.tryGarbageCollect();
        
        // Small delay to prevent overwhelming the system
        if (i + batchSize < items.length) {
          await this.sleep(1);
        }
      } catch (error) {
        console.warn(`Error processing batch ${i}-${i + batchSize}: ${error}`);
      }
    }
    
    return results;
  }

  /**
   * Monitor memory usage and warn if high
   */
  static checkMemoryUsage(): {
    usage: NodeJS.MemoryUsage;
    warning?: string;
  } {
    const usage = process.memoryUsage();
    let warning: string | undefined;

    // Check if memory usage is high (over 100MB heap used)
    if (usage.heapUsed > this.GC_THRESHOLD) {
      warning = `High memory usage detected: ${Math.round(usage.heapUsed / 1024 / 1024)}MB heap used`;
    }

    return { usage, warning };
  }

  /**
   * Try to trigger garbage collection if available
   */
  static tryGarbageCollect(): void {
    if (global.gc) {
      try {
        global.gc();
      } catch (error) {
        // Ignore GC errors
      }
    }
  }

  /**
   * Sleep utility for batch processing
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create memory-efficient data structure for violations
   */
  static createViolationTracker(): ViolationTracker {
    return new ViolationTracker();
  }

  /**
   * Optimize object for memory usage by removing undefined properties
   */
  static optimizeObject<T extends Record<string, any>>(obj: T): T {
    const optimized = {} as T;
    
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        optimized[key as keyof T] = value;
      }
    }
    
    return optimized;
  }

  /**
   * Get memory usage statistics
   */
  static getMemoryStats(): {
    heapUsed: string;
    heapTotal: string;
    external: string;
    rss: string;
  } {
    const usage = process.memoryUsage();
    
    return {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
    };
  }
}

/**
 * Memory-efficient violation tracking
 */
class ViolationTracker {
  private violations = new Map<string, any>();
  private fileIndex = new Map<string, number>();
  private nextFileId = 0;

  /**
   * Add violation with memory optimization
   */
  addViolation(violation: any): void {
    // Optimize file path storage using indices
    let fileId = this.fileIndex.get(violation.file);
    if (fileId === undefined) {
      fileId = this.nextFileId++;
      this.fileIndex.set(violation.file, fileId);
    }

    // Create optimized violation object
    const optimized = {
      f: violation.feature,
      fid: violation.featureId,
      fi: fileId, // file index instead of full path
      l: violation.line,
      c: violation.column,
      ctx: violation.context?.substring(0, 100), // Limit context length
      b: violation.browser,
      r: violation.required,
      a: violation.actual,
      bs: violation.baselineStatus,
      rs: violation.reason?.substring(0, 200) // Limit reason length
    };

    const key = `${fileId}-${violation.line}-${violation.feature}`;
    this.violations.set(key, optimized);
  }

  /**
   * Get all violations with full data
   */
  getViolations(): any[] {
    const result: any[] = [];
    const fileIdToPath = new Map<number, string>();
    
    // Create reverse mapping
    for (const [path, id] of this.fileIndex) {
      fileIdToPath.set(id, path);
    }

    for (const optimized of this.violations.values()) {
      result.push({
        feature: optimized.f,
        featureId: optimized.fid,
        file: fileIdToPath.get(optimized.fi) || 'unknown',
        line: optimized.l,
        column: optimized.c,
        context: optimized.ctx,
        browser: optimized.b,
        required: optimized.r,
        actual: optimized.a,
        baselineStatus: optimized.bs,
        reason: optimized.rs
      });
    }

    return result;
  }

  /**
   * Get memory usage statistics
   */
  getStats(): {
    violationCount: number;
    fileCount: number;
    memoryEstimate: string;
  } {
    const violationCount = this.violations.size;
    const fileCount = this.fileIndex.size;
    
    // Rough memory estimate (each violation ~200 bytes)
    const memoryEstimate = `${Math.round(violationCount * 200 / 1024)}KB`;

    return {
      violationCount,
      fileCount,
      memoryEstimate
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.violations.clear();
    this.fileIndex.clear();
    this.nextFileId = 0;
  }
}
