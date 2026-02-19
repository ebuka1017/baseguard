import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { SystemError } from './system-error-handler.js';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  context?: any;
  error?: Error;
  performance?: {
    duration?: number;
    memory?: number;
    cpu?: number;
  };
}

export interface DebugSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  entries: LogEntry[];
  summary: {
    errors: number;
    warnings: number;
    performance: {
      totalDuration: number;
      peakMemory: number;
      operations: number;
    };
  };
}

/**
 * Enhanced logging and debugging system for BaseGuard
 */
export class DebugLogger {
  private static instance: DebugLogger | null = null;
  private logLevel: LogLevel = LogLevel.INFO;
  private logDir: string;
  private currentSession: DebugSession | null = null;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private flushInterval: NodeJS.Timeout | null = null;
  private performanceMarks = new Map<string, number>();

  constructor() {
    this.logDir = path.join(process.cwd(), '.baseguard', 'logs');
    this.initializeLogging();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  /**
   * Initialize logging system
   */
  private async initializeLogging(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      
      // Set log level from environment
      const envLevel = process.env.BASEGUARD_LOG_LEVEL?.toUpperCase();
      if (envLevel && envLevel in LogLevel) {
        this.logLevel = LogLevel[envLevel as keyof typeof LogLevel];
      }

      // Start auto-flush
      this.flushInterval = setInterval(() => {
        this.flushLogs();
      }, 5000); // Flush every 5 seconds
      this.flushInterval.unref();

      // Handle process exit
      process.on('exit', () => this.cleanup());
      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());
    } catch (error) {
      console.warn('Failed to initialize debug logging:', error);
    }
  }

  /**
   * Start a new debug session
   */
  startSession(sessionId?: string): string {
    const id = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      id,
      startTime: new Date(),
      entries: [],
      summary: {
        errors: 0,
        warnings: 0,
        performance: {
          totalDuration: 0,
          peakMemory: 0,
          operations: 0
        }
      }
    };

    this.info('session', `Debug session started: ${id}`);
    return id;
  }

  /**
   * End current debug session
   */
  async endSession(): Promise<DebugSession | null> {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.endTime = new Date();
    const duration = this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime();
    this.currentSession.summary.performance.totalDuration = duration;

    this.info('session', `Debug session ended: ${this.currentSession.id}`);
    
    // Save session to file
    await this.saveSession(this.currentSession);
    
    const session = this.currentSession;
    this.currentSession = null;
    
    return session;
  }

  /**
   * Log error message
   */
  error(category: string, message: string, context?: any, error?: Error): void {
    this.log(LogLevel.ERROR, category, message, context, error);
    
    if (this.currentSession) {
      this.currentSession.summary.errors++;
    }
  }

  /**
   * Log warning message
   */
  warn(category: string, message: string, context?: any): void {
    this.log(LogLevel.WARN, category, message, context);
    
    if (this.currentSession) {
      this.currentSession.summary.warnings++;
    }
  }

  /**
   * Log info message
   */
  info(category: string, message: string, context?: any): void {
    this.log(LogLevel.INFO, category, message, context);
  }

  /**
   * Log debug message
   */
  debug(category: string, message: string, context?: any): void {
    this.log(LogLevel.DEBUG, category, message, context);
  }

  /**
   * Log trace message
   */
  trace(category: string, message: string, context?: any): void {
    this.log(LogLevel.TRACE, category, message, context);
  }

  /**
   * Start performance measurement
   */
  startPerformance(operation: string): void {
    this.performanceMarks.set(operation, Date.now());
    this.trace('performance', `Started: ${operation}`);
  }

  /**
   * End performance measurement
   */
  endPerformance(operation: string, context?: any): number {
    const startTime = this.performanceMarks.get(operation);
    if (!startTime) {
      this.warn('performance', `No start mark found for operation: ${operation}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.performanceMarks.delete(operation);

    const memoryUsage = process.memoryUsage();
    const performance = {
      duration,
      memory: memoryUsage.heapUsed,
      cpu: process.cpuUsage().user
    };

    this.info('performance', `Completed: ${operation} (${duration}ms)`, {
      ...context,
      performance
    });

    if (this.currentSession) {
      this.currentSession.summary.performance.operations++;
      this.currentSession.summary.performance.peakMemory = Math.max(
        this.currentSession.summary.performance.peakMemory,
        memoryUsage.heapUsed
      );
    }

    return duration;
  }

  /**
   * Log system error with enhanced context
   */
  logSystemError(error: SystemError): void {
    this.error('system', error.message, {
      code: error.code,
      severity: error.severity,
      recoverable: error.recoverable,
      context: error.context,
      stack: error.stack
    }, error);
  }

  /**
   * Log API operation
   */
  logApiOperation(service: string, operation: string, success: boolean, duration: number, context?: any): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `${service}.${operation}: ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`;
    
    this.log(level, 'api', message, {
      service,
      operation,
      success,
      duration,
      ...context
    });
  }

  /**
   * Log file processing operation
   */
  logFileProcessing(file: string, operation: string, success: boolean, duration?: number, context?: any): void {
    const level = success ? LogLevel.DEBUG : LogLevel.WARN;
    const message = `${operation}: ${file} ${success ? 'SUCCESS' : 'FAILED'}${duration ? ` (${duration}ms)` : ''}`;
    
    this.log(level, 'file', message, {
      file,
      operation,
      success,
      duration,
      ...context
    });
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, category: string, message: string, context?: any, error?: Error): void {
    if (level > this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      context,
      error
    };

    // Add to buffer
    this.logBuffer.push(entry);
    
    // Add to current session
    if (this.currentSession) {
      this.currentSession.entries.push(entry);
    }

    // Console output for important messages
    if (level <= LogLevel.WARN || (level === LogLevel.INFO && process.env.BASEGUARD_VERBOSE === 'true')) {
      this.outputToConsole(entry);
    }

    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.flushLogs();
    }
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    
    let color = chalk.white;
    let icon = '';
    
    switch (entry.level) {
      case LogLevel.ERROR:
        color = chalk.red;
        icon = '❌';
        break;
      case LogLevel.WARN:
        color = chalk.yellow;
        icon = '⚠️';
        break;
      case LogLevel.INFO:
        color = chalk.cyan;
        icon = 'ℹ️';
        break;
      case LogLevel.DEBUG:
        color = chalk.dim;
        icon = '🔍';
        break;
      case LogLevel.TRACE:
        color = chalk.dim;
        icon = '📍';
        break;
    }

    const prefix = `${icon} [${levelName}] ${entry.category}:`;
    console.log(color(`${prefix} ${entry.message}`));
    
    if (entry.context && process.env.BASEGUARD_DEBUG === 'true') {
      console.log(chalk.dim(`   Context: ${JSON.stringify(entry.context, null, 2)}`));
    }
    
    if (entry.error && entry.level <= LogLevel.WARN) {
      console.log(chalk.dim(`   Error: ${entry.error.stack || entry.error.message}`));
    }
  }

  /**
   * Flush log buffer to file
   */
  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    try {
      const logFile = path.join(this.logDir, `baseguard-${new Date().toISOString().split('T')[0]}.log`);
      const logLines = this.logBuffer.map(entry => this.formatLogEntry(entry));
      
      await fs.appendFile(logFile, logLines.join('\n') + '\n');
      this.logBuffer = [];
    } catch (error) {
      console.warn('Failed to flush logs:', error);
    }
  }

  /**
   * Format log entry for file output
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level].padEnd(5);
    const category = entry.category.padEnd(12);
    
    let line = `${timestamp} [${level}] ${category} ${entry.message}`;
    
    if (entry.context) {
      line += ` | Context: ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      line += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        line += ` | Stack: ${entry.error.stack.replace(/\n/g, '\\n')}`;
      }
    }
    
    return line;
  }

  /**
   * Save debug session to file
   */
  private async saveSession(session: DebugSession): Promise<void> {
    try {
      const sessionFile = path.join(this.logDir, `session-${session.id}.json`);
      await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    } catch (error) {
      console.warn('Failed to save debug session:', error);
    }
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    const allEntries = [
      ...this.logBuffer,
      ...(this.currentSession?.entries || [])
    ];
    
    return allEntries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, count);
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category: string, count: number = 50): LogEntry[] {
    return this.getRecentLogs(count * 2)
      .filter(entry => entry.category === category)
      .slice(0, count);
  }

  /**
   * Get error summary
   */
  getErrorSummary(): {
    totalErrors: number;
    totalWarnings: number;
    errorsByCategory: Record<string, number>;
    recentErrors: LogEntry[];
  } {
    const recentLogs = this.getRecentLogs(500);
    const errors = recentLogs.filter(entry => entry.level === LogLevel.ERROR);
    const warnings = recentLogs.filter(entry => entry.level === LogLevel.WARN);
    
    const errorsByCategory: Record<string, number> = {};
    errors.forEach(entry => {
      errorsByCategory[entry.category] = (errorsByCategory[entry.category] || 0) + 1;
    });
    
    return {
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      errorsByCategory,
      recentErrors: errors.slice(0, 10)
    };
  }

  /**
   * Generate debug report
   */
  async generateDebugReport(): Promise<string> {
    const summary = this.getErrorSummary();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    const report = {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown',
      platform: {
        os: process.platform,
        arch: process.arch,
        node: process.version
      },
      runtime: {
        uptime: Math.round(uptime),
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        }
      },
      session: this.currentSession ? {
        id: this.currentSession.id,
        duration: Date.now() - this.currentSession.startTime.getTime(),
        entries: this.currentSession.entries.length,
        summary: this.currentSession.summary
      } : null,
      errors: summary,
      recentLogs: this.getRecentLogs(20)
    };
    
    const reportFile = path.join(this.logDir, `debug-report-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    return reportFile;
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info('logger', `Log level set to ${LogLevel[level]}`);
  }

  /**
   * Enable verbose logging
   */
  enableVerbose(): void {
    this.setLogLevel(LogLevel.DEBUG);
    process.env.BASEGUARD_VERBOSE = 'true';
  }

  /**
   * Enable debug mode
   */
  enableDebug(): void {
    this.setLogLevel(LogLevel.TRACE);
    process.env.BASEGUARD_DEBUG = 'true';
    process.env.BASEGUARD_VERBOSE = 'true';
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs(maxAgeDays: number = 7): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const now = Date.now();
      const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          this.debug('cleanup', `Removed old log file: ${file}`);
        }
      }
    } catch (error) {
      this.warn('cleanup', 'Failed to cleanup old logs', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Final flush
    this.flushLogs().catch(() => {
      // Ignore errors during cleanup
    });
    
    if (this.currentSession) {
      this.endSession().catch(() => {
        // Ignore errors during cleanup
      });
    }
  }

  /**
   * Create logger for specific category
   */
  createCategoryLogger(category: string) {
    return {
      error: (message: string, context?: any, error?: Error) => this.error(category, message, context, error),
      warn: (message: string, context?: any) => this.warn(category, message, context),
      info: (message: string, context?: any) => this.info(category, message, context),
      debug: (message: string, context?: any) => this.debug(category, message, context),
      trace: (message: string, context?: any) => this.trace(category, message, context),
      startPerformance: (operation: string) => this.startPerformance(`${category}.${operation}`),
      endPerformance: (operation: string, context?: any) => this.endPerformance(`${category}.${operation}`, context)
    };
  }
}

// Export singleton instance
export const logger = DebugLogger.getInstance();
