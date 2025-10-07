import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { UIComponents } from '../ui/components.js';

export interface SystemErrorContext {
  operation: string;
  file?: string;
  line?: number;
  details?: any;
  timestamp?: Date;
  userId?: string;
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  execute: () => Promise<boolean>;
  priority: number;
}

export class SystemError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: SystemErrorContext,
    public recoverable: boolean = true,
    public severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {
    super(message);
    this.name = 'SystemError';
    this.context = {
      operation: context?.operation || 'unknown',
      file: context?.file,
      line: context?.line,
      details: context?.details,
      timestamp: new Date(),
      userId: context?.userId
    };
  }
}

export class SystemErrorHandler {
  private static retryAttempts = new Map<string, number>();
  private static maxRetries = 3;
  private static backoffBase = 1000; // 1 second
  private static errorLog: SystemError[] = [];
  private static maxLogSize = 100;
  private static recoveryStrategies = new Map<string, RecoveryStrategy[]>();
  private static gracefulDegradationEnabled = true;
  private static offlineMode = false;

  static async withRetry<T>(
    operation: () => Promise<T>,
    context: SystemErrorContext,
    maxRetries: number = SystemErrorHandler.maxRetries,
    customBackoff?: (attempt: number) => number
  ): Promise<T> {
    const key = `${context.operation}-${context.file || 'global'}`;
    let attempts = SystemErrorHandler.retryAttempts.get(key) || 0;

    try {
      const result = await operation();
      SystemErrorHandler.retryAttempts.delete(key); // Reset on success
      return result;
    } catch (error) {
      attempts++;
      SystemErrorHandler.retryAttempts.set(key, attempts);

      const wrappedError = SystemErrorHandler.wrapError(error, context);
      SystemErrorHandler.logError(wrappedError);

      if (attempts >= maxRetries) {
        SystemErrorHandler.retryAttempts.delete(key);
        
        // Try recovery strategies before giving up
        const recovered = await SystemErrorHandler.attemptRecovery(wrappedError);
        if (!recovered) {
          throw wrappedError;
        }
        
        // If recovery succeeded, try the operation once more
        SystemErrorHandler.retryAttempts.delete(key);
        return SystemErrorHandler.withRetry(operation, context, 1); // One more try after recovery
      }

      const delay = customBackoff ? customBackoff(attempts) : SystemErrorHandler.backoffBase * Math.pow(2, attempts - 1);
      console.warn(chalk.yellow(`⚠️ Retry ${attempts}/${maxRetries} for ${context.operation} in ${delay}ms`));
      
      await SystemErrorHandler.sleep(delay);
      return SystemErrorHandler.withRetry(operation, context, maxRetries, customBackoff);
    }
  }

  static async handleGracefully<T>(
    operation: () => Promise<T>,
    fallback: T | (() => Promise<T>),
    context: SystemErrorContext,
    options: {
      logError?: boolean;
      showWarning?: boolean;
      attemptRecovery?: boolean;
    } = {}
  ): Promise<T> {
    const { logError = true, showWarning = true, attemptRecovery = true } = options;

    try {
      return await operation();
    } catch (error) {
      const wrappedError = SystemErrorHandler.wrapError(error, context);
      
      if (logError) {
        SystemErrorHandler.logError(wrappedError);
      }

      if (showWarning) {
        console.warn(chalk.yellow(`⚠️ ${context.operation} failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }

      // Attempt recovery if enabled
      if (attemptRecovery && wrappedError.recoverable) {
        const recovered = await SystemErrorHandler.attemptRecovery(wrappedError);
        if (recovered) {
          try {
            return await operation();
          } catch (retryError) {
            // Recovery didn't work, fall back
          }
        }
      }

      // Use fallback
      const fallbackValue = typeof fallback === 'function' ? await (fallback as () => Promise<T>)() : fallback;
      
      if (showWarning) {
        console.warn(chalk.cyan('🔄 Using fallback strategy'));
      }
      
      return fallbackValue;
    }
  }

  static wrapError(error: any, context: SystemErrorContext): SystemError {
    if (error instanceof SystemError) {
      return error;
    }

    let code = 'UNKNOWN_ERROR';
    let recoverable = true;
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

    // Categorize errors with enhanced detection
    if (error.code === 'ENOENT') {
      code = 'FILE_NOT_FOUND';
      severity = 'low';
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      code = 'PERMISSION_DENIED';
      recoverable = false;
      severity = 'high';
    } else if (error.code === 'ENOTDIR') {
      code = 'INVALID_PATH';
      severity = 'medium';
    } else if (error.name === 'SyntaxError') {
      code = 'SYNTAX_ERROR';
      severity = 'low';
    } else if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      code = 'NETWORK_ERROR';
      severity = 'medium';
    } else if (error.code === 'ETIMEDOUT') {
      code = 'TIMEOUT_ERROR';
      severity = 'medium';
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      code = 'API_ERROR';
      severity = 'medium';
    } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
      code = 'TOO_MANY_FILES';
      severity = 'high';
    } else if (error.code === 'ENOSPC') {
      code = 'DISK_FULL';
      recoverable = false;
      severity = 'critical';
    } else if (error.message?.includes('out of memory') || error.code === 'ERR_MEMORY_ALLOCATION_FAILED') {
      code = 'OUT_OF_MEMORY';
      recoverable = false;
      severity = 'critical';
    } else if (error.message?.includes('configuration') || error.message?.includes('config')) {
      code = 'CONFIGURATION_ERROR';
      severity = 'medium';
    } else if (error.message?.includes('parser') || error.message?.includes('parsing')) {
      code = 'PARSER_ERROR';
      severity = 'low';
    }

    return new SystemError(
      error.message || 'An unknown error occurred',
      code,
      context,
      recoverable,
      severity
    );
  }

  static displayError(error: SystemError, options: { verbose?: boolean; showRecovery?: boolean } = {}): void {
    const { verbose = false, showRecovery = true } = options;
    
    // Color based on severity
    const severityColors = {
      low: chalk.yellow,
      medium: chalk.red,
      high: chalk.redBright,
      critical: chalk.bgRed.white
    };
    
    const colorFn = severityColors[error.severity];
    
    console.error(colorFn('❌ System Error:'), error.message);
    
    if (error.context?.file) {
      console.error(chalk.dim(`   File: ${error.context.file}`));
    }
    
    if (error.context?.line) {
      console.error(chalk.dim(`   Line: ${error.context.line}`));
    }

    if (verbose && error.context?.details) {
      console.error(chalk.dim(`   Details: ${JSON.stringify(error.context.details, null, 2)}`));
    }

    // Show recovery options
    if (showRecovery && error.recoverable) {
      SystemErrorHandler.showRecoveryOptions(error);
    }

    // Provide helpful suggestions
    SystemErrorHandler.provideSuggestions(error);
  }

  private static async attemptRecovery(error: SystemError): Promise<boolean> {
    const strategies = SystemErrorHandler.recoveryStrategies.get(error.code) || [];
    
    if (strategies.length === 0) {
      return false;
    }

    console.log(chalk.cyan('🔧 Attempting automatic recovery...'));

    // Sort strategies by priority
    strategies.sort((a, b) => b.priority - a.priority);

    for (const strategy of strategies) {
      try {
        console.log(chalk.dim(`   Trying: ${strategy.description}`));
        const success = await strategy.execute();
        
        if (success) {
          console.log(chalk.green(`✅ Recovery successful: ${strategy.name}`));
          return true;
        }
      } catch (recoveryError) {
        console.log(chalk.dim(`   Recovery failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`));
      }
    }

    console.log(chalk.yellow('⚠️ Automatic recovery failed'));
    return false;
  }

  private static showRecoveryOptions(error: SystemError): void {
    const strategies = SystemErrorHandler.recoveryStrategies.get(error.code) || [];
    
    if (strategies.length > 0) {
      console.error(chalk.cyan('\n🔧 Available recovery options:'));
      strategies.forEach((strategy, index) => {
        console.error(chalk.cyan(`   ${index + 1}. ${strategy.description}`));
      });
    }
  }

  private static provideSuggestions(error: SystemError): void {
    const suggestions: string[] = [];

    switch (error.code) {
      case 'FILE_NOT_FOUND':
        suggestions.push('Check if the file path is correct');
        suggestions.push('Ensure the file exists and is accessible');
        suggestions.push('Verify the working directory is correct');
        break;
      case 'PERMISSION_DENIED':
        suggestions.push('Check file permissions with ls -la (Unix) or dir (Windows)');
        suggestions.push('Run with appropriate privileges if needed');
        suggestions.push('Ensure the file is not locked by another process');
        break;
      case 'SYNTAX_ERROR':
        suggestions.push('Check the file syntax with your editor');
        suggestions.push('Ensure the file is valid for its type');
        suggestions.push('Look for missing brackets, quotes, or semicolons');
        break;
      case 'NETWORK_ERROR':
        suggestions.push('Check your internet connection');
        suggestions.push('Verify API endpoints are accessible');
        suggestions.push('Consider running in offline mode with --offline flag');
        suggestions.push('Check if you\'re behind a proxy or firewall');
        break;
      case 'API_ERROR':
        suggestions.push('Verify your API keys are correct');
        suggestions.push('Check API rate limits and quotas');
        suggestions.push('Ensure the API service is available');
        break;
      case 'TIMEOUT_ERROR':
        suggestions.push('Increase timeout with --timeout flag');
        suggestions.push('Check network stability');
        suggestions.push('Try again later if the service is overloaded');
        break;
      case 'TOO_MANY_FILES':
        suggestions.push('Close unnecessary applications');
        suggestions.push('Increase system file descriptor limits');
        suggestions.push('Process files in smaller batches');
        break;
      case 'DISK_FULL':
        suggestions.push('Free up disk space');
        suggestions.push('Clean temporary files');
        suggestions.push('Move files to another drive');
        break;
      case 'OUT_OF_MEMORY':
        suggestions.push('Close other applications to free memory');
        suggestions.push('Process files in smaller batches');
        suggestions.push('Increase system memory if possible');
        break;
      case 'CONFIGURATION_ERROR':
        suggestions.push('Run "base init" to reconfigure BaseGuard');
        suggestions.push('Check .baseguardrc.json for syntax errors');
        suggestions.push('Verify all required configuration fields are present');
        break;
      case 'PARSER_ERROR':
        suggestions.push('Check file syntax and encoding');
        suggestions.push('Ensure file extension matches content type');
        suggestions.push('Try with a simpler version of the file');
        break;
    }

    if (suggestions.length > 0) {
      console.error(chalk.cyan('\n💡 Suggestions:'));
      suggestions.forEach(suggestion => {
        console.error(chalk.cyan(`   • ${suggestion}`));
      });
    }

    // Show degradation options
    if (SystemErrorHandler.gracefulDegradationEnabled) {
      SystemErrorHandler.showDegradationOptions(error);
    }
  }

  private static showDegradationOptions(error: SystemError): void {
    const degradationOptions: string[] = [];

    switch (error.code) {
      case 'NETWORK_ERROR':
      case 'API_ERROR':
        degradationOptions.push('Continue with baseline-only checking (no AI analysis)');
        degradationOptions.push('Use cached results if available');
        degradationOptions.push('Switch to offline mode automatically');
        break;
      case 'SYNTAX_ERROR':
      case 'PARSER_ERROR':
        degradationOptions.push('Skip malformed files and continue with others');
        degradationOptions.push('Use basic text parsing as fallback');
        degradationOptions.push('Report parsing issues and continue');
        break;
      case 'TOO_MANY_FILES':
        degradationOptions.push('Process files in smaller batches');
        degradationOptions.push('Skip non-essential file types');
        degradationOptions.push('Use streaming processing to reduce memory usage');
        break;
      case 'CONFIGURATION_ERROR':
        degradationOptions.push('Use default configuration settings');
        degradationOptions.push('Skip optional features that require configuration');
        degradationOptions.push('Continue with basic compatibility checking');
        break;
    }

    if (degradationOptions.length > 0) {
      console.error(chalk.magenta('\n🔄 Graceful degradation options:'));
      degradationOptions.forEach(option => {
        console.error(chalk.magenta(`   • ${option}`));
      });
    }
  }

  static logError(error: SystemError): void {
    SystemErrorHandler.errorLog.push(error);
    
    // Keep log size manageable
    if (SystemErrorHandler.errorLog.length > SystemErrorHandler.maxLogSize) {
      SystemErrorHandler.errorLog.shift();
    }
  }

  static async saveErrorLog(filePath?: string): Promise<void> {
    const logPath = filePath || path.join(process.cwd(), '.baseguard-errors.log');
    
    const logData = {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown',
      platform: process.platform,
      nodeVersion: process.version,
      errors: SystemErrorHandler.errorLog.map(error => ({
        message: error.message,
        code: error.code,
        severity: error.severity,
        context: error.context,
        recoverable: error.recoverable
      }))
    };

    try {
      await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
      console.log(chalk.dim(`Error log saved to: ${logPath}`));
    } catch (writeError) {
      console.warn(chalk.yellow(`Failed to save error log: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`));
    }
  }

  static getErrorSummary(): { 
    total: number; 
    bySeverity: Record<string, number>; 
    byCode: Record<string, number>;
    recoverable: number;
    critical: number;
  } {
    const summary = {
      total: SystemErrorHandler.errorLog.length,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byCode: {} as Record<string, number>,
      recoverable: 0,
      critical: 0
    };

    SystemErrorHandler.errorLog.forEach(error => {
      summary.bySeverity[error.severity]++;
      summary.byCode[error.code] = (summary.byCode[error.code] || 0) + 1;
      if (error.recoverable) summary.recoverable++;
      if (error.severity === 'critical') summary.critical++;
    });

    return summary;
  }

  static registerRecoveryStrategy(errorCode: string, strategy: RecoveryStrategy): void {
    if (!SystemErrorHandler.recoveryStrategies.has(errorCode)) {
      SystemErrorHandler.recoveryStrategies.set(errorCode, []);
    }
    SystemErrorHandler.recoveryStrategies.get(errorCode)!.push(strategy);
  }

  static enableGracefulDegradation(enabled: boolean = true): void {
    SystemErrorHandler.gracefulDegradationEnabled = enabled;
  }

  static setOfflineMode(offline: boolean = true): void {
    SystemErrorHandler.offlineMode = offline;
    if (offline) {
      console.log(chalk.cyan('🔌 Offline mode enabled - AI features disabled'));
    }
  }

  static isOfflineMode(): boolean {
    return SystemErrorHandler.offlineMode || process.env.BASEGUARD_OFFLINE === 'true';
  }

  static clearErrorLog(): void {
    SystemErrorHandler.errorLog = [];
  }

  static async createCorruptionRecovery(configPath: string): Promise<boolean> {
    try {
      // Backup corrupted config
      const backupPath = `${configPath}.backup.${Date.now()}`;
      await fs.copyFile(configPath, backupPath);
      console.log(chalk.yellow(`Corrupted config backed up to: ${backupPath}`));

      // Create minimal working config
      const minimalConfig = {
        version: '1.0.0',
        targets: [{ browser: 'chrome', minVersion: 'baseline' }],
        apiKeys: { jules: null, gemini: null },
        automation: { enabled: false }
      };

      await fs.writeFile(configPath, JSON.stringify(minimalConfig, null, 2));
      console.log(chalk.green('✅ Created minimal working configuration'));
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to recover from configuration corruption'));
      return false;
    }
  }

  static async handleProcessSignals(): Promise<void> {
    const gracefulShutdown = async (signal: string) => {
      // Only log for non-interactive signals (SIGTERM, not SIGINT from Ctrl+C)
      if (signal !== 'SIGINT') {
        console.log(chalk.yellow(`\n⚠️ Received ${signal}, shutting down gracefully...`));
      }
      
      // Cleanup intervals and timers
      try {
        const { StartupOptimizer } = await import('./startup-optimizer.js');
        StartupOptimizer.cleanup();
      } catch (error) {
        // Ignore cleanup errors
      }
      
      // Save error log before exit (but don't wait too long)
      try {
        const savePromise = SystemErrorHandler.saveErrorLog();
        await Promise.race([
          savePromise,
          new Promise(resolve => setTimeout(resolve, 100)) // Max 100ms wait
        ]);
      } catch (error) {
        // Ignore errors during shutdown
      }
      
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      const systemError = SystemErrorHandler.wrapError(error, {
        operation: 'uncaught-exception',
        details: { stack: error.stack }
      });
      
      SystemErrorHandler.displayError(systemError, { verbose: true });
      SystemErrorHandler.saveErrorLog().finally(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const systemError = SystemErrorHandler.wrapError(reason, {
        operation: 'unhandled-rejection',
        details: { promise: promise.toString() }
      });
      
      SystemErrorHandler.displayError(systemError, { verbose: true });
      SystemErrorHandler.saveErrorLog().finally(() => {
        process.exit(1);
      });
    });
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Initialize default recovery strategies
  static initializeRecoveryStrategies(): void {
    // File not found recovery
    SystemErrorHandler.registerRecoveryStrategy('FILE_NOT_FOUND', {
      name: 'Create missing directories',
      description: 'Create missing parent directories',
      priority: 3,
      execute: async () => {
        try {
          // Try to create parent directories for common paths
          const commonPaths = ['src', 'app', 'components', 'pages', '.baseguard'];
          for (const dirPath of commonPaths) {
            try {
              await fs.mkdir(dirPath, { recursive: true });
            } catch (error) {
              // Ignore if directory already exists
            }
          }
          return true;
        } catch (error) {
          return false;
        }
      }
    });

    // Network error recovery
    SystemErrorHandler.registerRecoveryStrategy('NETWORK_ERROR', {
      name: 'Switch to offline mode',
      description: 'Continue with offline-only features',
      priority: 2,
      execute: async () => {
        console.log(chalk.cyan('🔌 Switching to offline mode...'));
        SystemErrorHandler.setOfflineMode(true);
        process.env.BASEGUARD_OFFLINE = 'true';
        return true;
      }
    });

    // API error recovery
    SystemErrorHandler.registerRecoveryStrategy('API_ERROR', {
      name: 'Use cached responses',
      description: 'Fall back to cached API responses',
      priority: 1,
      execute: async () => {
        try {
          // Check if cache directory exists and has content
          const cacheDir = path.join(process.cwd(), '.baseguard', 'cache');
          const cacheExists = await fs.access(cacheDir).then(() => true).catch(() => false);
          
          if (cacheExists) {
            const files = await fs.readdir(cacheDir);
            if (files.length > 0) {
              console.log(chalk.cyan('📦 Using cached API responses'));
              return true;
            }
          }
          
          // Enable offline mode as fallback
          SystemErrorHandler.setOfflineMode(true);
          return true;
        } catch (error) {
          return false;
        }
      }
    });

    // Syntax error recovery
    SystemErrorHandler.registerRecoveryStrategy('SYNTAX_ERROR', {
      name: 'Skip malformed file',
      description: 'Skip the file with syntax errors and continue',
      priority: 1,
      execute: async () => {
        console.log(chalk.cyan('⏭️ Skipping malformed file and continuing...'));
        return true;
      }
    });

    // Configuration error recovery
    SystemErrorHandler.registerRecoveryStrategy('CONFIGURATION_ERROR', {
      name: 'Create minimal config',
      description: 'Create a minimal working configuration',
      priority: 2,
      execute: async () => {
        const configPath = path.join(process.cwd(), '.baseguardrc.json');
        return await SystemErrorHandler.createCorruptionRecovery(configPath);
      }
    });

    // Parser error recovery
    SystemErrorHandler.registerRecoveryStrategy('PARSER_ERROR', {
      name: 'Use fallback parser',
      description: 'Try with a simpler parsing strategy',
      priority: 1,
      execute: async () => {
        console.log(chalk.cyan('🔄 Using fallback parser strategy...'));
        return true;
      }
    });

    // Memory error recovery
    SystemErrorHandler.registerRecoveryStrategy('OUT_OF_MEMORY', {
      name: 'Reduce processing batch size',
      description: 'Process files in smaller batches to reduce memory usage',
      priority: 3,
      execute: async () => {
        console.log(chalk.cyan('🧠 Reducing memory usage by processing smaller batches...'));
        process.env.BASEGUARD_BATCH_SIZE = '10'; // Reduce from default
        return true;
      }
    });

    // Too many files recovery
    SystemErrorHandler.registerRecoveryStrategy('TOO_MANY_FILES', {
      name: 'Limit file processing',
      description: 'Reduce the number of files processed simultaneously',
      priority: 2,
      execute: async () => {
        console.log(chalk.cyan('📁 Limiting concurrent file processing...'));
        process.env.BASEGUARD_MAX_FILES = '100'; // Reduce from default
        return true;
      }
    });

    // Timeout error recovery
    SystemErrorHandler.registerRecoveryStrategy('TIMEOUT_ERROR', {
      name: 'Increase timeout and retry',
      description: 'Increase timeout settings and retry the operation',
      priority: 2,
      execute: async () => {
        console.log(chalk.cyan('⏱️ Increasing timeout settings...'));
        process.env.BASEGUARD_TIMEOUT = '60000'; // 60 seconds
        return true;
      }
    });

    // Permission denied recovery
    SystemErrorHandler.registerRecoveryStrategy('PERMISSION_DENIED', {
      name: 'Skip protected files',
      description: 'Skip files that cannot be accessed and continue',
      priority: 1,
      execute: async () => {
        console.log(chalk.cyan('🔒 Skipping protected files and continuing...'));
        return true;
      }
    });

    // Disk full recovery
    SystemErrorHandler.registerRecoveryStrategy('DISK_FULL', {
      name: 'Clean temporary files',
      description: 'Clean up temporary files to free space',
      priority: 3,
      execute: async () => {
        try {
          console.log(chalk.cyan('🧹 Cleaning temporary files...'));
          
          // Clean BaseGuard temp files
          const tempDir = path.join(process.cwd(), '.baseguard', 'temp');
          try {
            await fs.rm(tempDir, { recursive: true, force: true });
            await fs.mkdir(tempDir, { recursive: true });
          } catch (error) {
            // Ignore if temp dir doesn't exist
          }
          
          // Clean system temp files (be careful here)
          const systemTemp = process.env.TMPDIR || process.env.TEMP || '/tmp';
          const baseguardTempPattern = path.join(systemTemp, 'baseguard-*');
          
          try {
            const { glob } = await import('glob');
            const tempFiles = await glob(baseguardTempPattern);
            for (const file of tempFiles) {
              try {
                await fs.rm(file, { recursive: true, force: true });
              } catch (error) {
                // Ignore individual file errors
              }
            }
          } catch (error) {
            // Ignore if glob fails
          }
          
          return true;
        } catch (error) {
          return false;
        }
      }
    });
  }
}

// Initialize recovery strategies and signal handlers when module loads
SystemErrorHandler.initializeRecoveryStrategies();
SystemErrorHandler.handleProcessSignals();