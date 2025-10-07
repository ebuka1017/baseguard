import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DetectedFeature } from '../types/index.js';
import { CacheManager } from './cache-manager.js';

/**
 * Worker task for file parsing
 */
interface WorkerTask {
  id: string;
  filePath: string;
  content?: string;
}

/**
 * Worker result
 */
interface WorkerResult {
  id: string;
  features: DetectedFeature[];
  error?: string;
}

/**
 * File processor with concurrent parsing using worker threads
 */
export class FileProcessor {
  private readonly maxWorkers: number;
  private readonly cacheManager: CacheManager;
  private workers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private pendingTasks = new Map<string, {
    resolve: (features: DetectedFeature[]) => void;
    reject: (error: Error) => void;
  }>();
  private isProcessing = false;

  constructor(options: {
    maxWorkers?: number;
    cacheManager?: CacheManager;
  } = {}) {
    this.maxWorkers = options.maxWorkers || Math.min(cpus().length, 8);
    this.cacheManager = options.cacheManager || new CacheManager();
  }

  /**
   * Process multiple files concurrently with caching
   */
  async processFiles(filePaths: string[]): Promise<DetectedFeature[]> {
    // Check cache for unchanged files
    const { changed, unchanged } = await this.cacheManager.getChangedFiles(filePaths);
    
    // Get cached results for unchanged files
    const cachedFeatures: DetectedFeature[] = [];
    for (const filePath of unchanged) {
      const cached = await this.cacheManager.getCachedParseResult(filePath);
      if (cached) {
        cachedFeatures.push(...cached);
      } else {
        // Cache miss, need to process
        changed.push(filePath);
      }
    }

    // Process changed files
    const newFeatures = changed.length > 0 
      ? await this.processFilesWithWorkers(changed)
      : [];

    return [...cachedFeatures, ...newFeatures];
  }

  /**
   * Process files using worker threads
   */
  private async processFilesWithWorkers(filePaths: string[]): Promise<DetectedFeature[]> {
    if (filePaths.length === 0) {
      return [];
    }

    // Create worker tasks
    const tasks: WorkerTask[] = filePaths.map((filePath, index) => ({
      id: `task_${index}_${Date.now()}`,
      filePath
    }));

    // Process tasks in batches
    const batchSize = Math.max(1, Math.ceil(tasks.length / this.maxWorkers));
    const batches: WorkerTask[][] = [];
    
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }

    const allFeatures: DetectedFeature[] = [];

    // Process each batch
    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(task => this.processTask(task))
      );

      batchResults.forEach((result, index) => {
        const task = batch[index];
        if (!task) return;
        
        if (result.status === 'fulfilled') {
          allFeatures.push(...result.value);
          // Cache the result
          this.cacheManager.setCachedParseResult(task.filePath, result.value);
        } else {
          console.warn(`Failed to process ${task.filePath}: ${result.reason}`);
        }
      });

      // Small delay between batches to prevent overwhelming
      if (batches.length > 1) {
        await this.sleep(10);
      }
    }

    return allFeatures;
  }

  /**
   * Process a single task
   */
  private async processTask(task: WorkerTask): Promise<DetectedFeature[]> {
    return new Promise((resolve, reject) => {
      // Check cache first
      this.cacheManager.getCachedParseResult(task.filePath)
        .then(cached => {
          if (cached) {
            resolve(cached);
            return;
          }

          // Add to pending tasks
          this.pendingTasks.set(task.id, { resolve, reject });
          this.taskQueue.push(task);
          
          // Start processing if not already running
          if (!this.isProcessing) {
            this.startProcessing();
          }
        })
        .catch(reject);
    });
  }

  /**
   * Start worker processing
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Initialize workers
      await this.initializeWorkers();

      // Process tasks
      while (this.taskQueue.length > 0 || this.pendingTasks.size > 0) {
        await this.processBatch();
        await this.sleep(10);
      }
    } finally {
      // Cleanup
      await this.terminateWorkers();
      this.isProcessing = false;
    }
  }

  /**
   * Initialize worker threads
   */
  private async initializeWorkers(): Promise<void> {
    const workerScript = this.getWorkerScriptPath();
    const numWorkers = Math.min(this.maxWorkers, this.taskQueue.length);

    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = new Worker(workerScript);
        
        worker.on('message', (result: WorkerResult) => {
          this.handleWorkerResult(result);
        });

        worker.on('error', (error) => {
          console.error(`Worker error: ${error.message}`);
        });

        this.workers.push(worker);
      } catch (error) {
        console.warn(`Failed to create worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Process a batch of tasks with available workers
   */
  private async processBatch(): Promise<void> {
    const availableWorkers = this.workers.length;
    const tasksToProcess = this.taskQueue.splice(0, availableWorkers);

    if (tasksToProcess.length === 0) {
      return;
    }

    // Assign tasks to workers
    const promises = tasksToProcess.map((task, index) => {
      const worker = this.workers[index % this.workers.length];
      return this.assignTaskToWorker(worker, task);
    });

    await Promise.allSettled(promises);
  }

  /**
   * Assign task to worker
   */
  private async assignTaskToWorker(worker: Worker | undefined, task: WorkerTask): Promise<void> {
    if (!worker) {
      throw new Error('Worker is not available');
    }
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`Worker task ${task.id} timed out`);
        this.handleWorkerError(task.id, new Error('Worker timeout'));
        resolve();
      }, 30000); // 30 second timeout

      const messageHandler = (result: WorkerResult) => {
        if (result.id === task.id) {
          clearTimeout(timeout);
          worker.off('message', messageHandler);
          resolve();
        }
      };

      worker.on('message', messageHandler);
      worker.postMessage(task);
    });
  }

  /**
   * Handle worker result
   */
  private handleWorkerResult(result: WorkerResult): void {
    const pending = this.pendingTasks.get(result.id);
    if (!pending) {
      return;
    }

    this.pendingTasks.delete(result.id);

    if (result.error) {
      pending.reject(new Error(result.error));
    } else {
      pending.resolve(result.features);
    }
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(taskId: string, error: Error): void {
    const pending = this.pendingTasks.get(taskId);
    if (pending) {
      this.pendingTasks.delete(taskId);
      pending.reject(error);
    }
  }

  /**
   * Terminate all workers
   */
  private async terminateWorkers(): Promise<void> {
    await Promise.all(
      this.workers.map(worker => worker.terminate())
    );
    this.workers = [];
  }

  /**
   * Get worker script path
   */
  private getWorkerScriptPath(): string {
    // For now, we'll use a simple fallback since we don't have worker threads implemented yet
    // In a real implementation, this would point to a separate worker script
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return join(__dirname, 'parser-worker.js');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    maxWorkers: number;
    activeWorkers: number;
    queuedTasks: number;
    pendingTasks: number;
    cacheStats: any;
  } {
    return {
      maxWorkers: this.maxWorkers,
      activeWorkers: this.workers.length,
      queuedTasks: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size,
      cacheStats: this.cacheManager.getStats()
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.terminateWorkers();
    this.taskQueue = [];
    this.pendingTasks.clear();
    this.isProcessing = false;
  }
}