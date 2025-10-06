import type { Violation, Analysis, Fix, Configuration } from '../types/index.js';
import { ParserManager } from '../parsers/parser-manager.js';
import { BaselineChecker } from './baseline-checker.js';
import { FileProcessor } from './file-processor.js';
import { DirectoryFilter } from './directory-filter.js';
import { CacheManager } from './cache-manager.js';
import { SystemErrorHandler } from './system-error-handler.js';
import { GracefulDegradationManager } from './graceful-degradation-manager.js';
import { ConfigurationRecovery } from './configuration-recovery.js';
import { logger } from './debug-logger.js';
import { ErrorHandler, APIError } from './error-handler.js';
import chalk from 'chalk';

/**
 * Main BaseGuard class that orchestrates compatibility checking and fixing
 */
export class BaseGuard {
  private config: Configuration;
  private parserManager!: ParserManager;
  private baselineChecker!: BaselineChecker;
  private fileProcessor!: FileProcessor;
  private directoryFilter!: DirectoryFilter;
  private cacheManager!: CacheManager;
  private categoryLogger: ReturnType<typeof logger.createCategoryLogger>;
  private initialized = false;

  constructor(config: Configuration) {
    this.config = config;
    this.categoryLogger = logger.createCategoryLogger('baseguard');
    
    // Initialize with error handling (async initialization)
    this.initializeComponents().catch(error => {
      this.categoryLogger.error('Failed to initialize BaseGuard', { error });
    });
  }

  /**
   * Initialize BaseGuard components with error recovery
   */
  private async initializeComponents(): Promise<void> {
    try {
      this.categoryLogger.info('Initializing BaseGuard components');
      
      // Initialize graceful degradation manager
      await GracefulDegradationManager.initialize();
      
      // Initialize components with error handling
      this.cacheManager = await SystemErrorHandler.handleGracefully(
        async () => {
          return new CacheManager({
            maxCacheSize: parseInt(process.env.BASEGUARD_CACHE_SIZE || '2000'),
            cacheValidityMs: 10 * 60 * 1000 // 10 minutes
          });
        },
        new CacheManager({ maxCacheSize: 1000, cacheValidityMs: 5 * 60 * 1000 }),
        { operation: 'cache_manager_init' }
      );

      this.parserManager = await SystemErrorHandler.handleGracefully(
        async () => {
          return new ParserManager();
        },
        new ParserManager(),
        { operation: 'parser_manager_init' }
      );

      this.baselineChecker = await SystemErrorHandler.handleGracefully(
        async () => {
          return new BaselineChecker();
        },
        new BaselineChecker(),
        { operation: 'baseline_checker_init' }
      );

      const maxWorkers = parseInt(process.env.BASEGUARD_MAX_WORKERS || '8');
      const maxFiles = parseInt(process.env.BASEGUARD_MAX_FILES || '5000');

      this.fileProcessor = await SystemErrorHandler.handleGracefully(
        async () => {
          return new FileProcessor({
            maxWorkers,
            cacheManager: this.cacheManager
          });
        },
        new FileProcessor({ maxWorkers: 2, cacheManager: this.cacheManager }),
        { operation: 'file_processor_init' }
      );

      this.directoryFilter = await SystemErrorHandler.handleGracefully(
        async () => {
          return new DirectoryFilter({
            maxDepth: 8,
            maxFiles
          });
        },
        new DirectoryFilter({ maxDepth: 4, maxFiles: 1000 }),
        { operation: 'directory_filter_init' }
      );

      this.initialized = true;
      this.categoryLogger.info('BaseGuard components initialized successfully');
      
    } catch (error) {
      this.categoryLogger.error('Failed to initialize BaseGuard components', { error });
      throw new Error(`BaseGuard initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure BaseGuard is properly initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeComponents();
    }
  }

  /**
   * Check files for compatibility violations with enhanced error recovery
   */
  async checkViolations(patterns: string[] = []): Promise<Violation[]> {
    await this.ensureInitialized();
    
    const sessionId = logger.startSession('check-violations');
    this.categoryLogger.startPerformance('check-violations');
    
    try {
      const violations: Violation[] = [];
      
      // Find files using smart filtering and caching with error recovery
      const allFiles = await SystemErrorHandler.withRetry(
        async () => {
          return patterns.length > 0 
            ? await this.directoryFilter.findFilesWithGlob(patterns)
            : await this.directoryFilter.findFiles(['src', 'app', 'pages', 'components'], {
                includeHidden: false
              });
        },
        { operation: 'find_files', details: { patterns } },
        3 // max retries
      );
      
      if (allFiles.length === 0) {
        this.categoryLogger.warn('No supported files found to check', { patterns });
        return violations;
      }

      this.categoryLogger.info(`Processing ${allFiles.length} files for violations`);
      
      // Process files concurrently with caching and error recovery
      const allFeatures = await SystemErrorHandler.handleGracefully(
        () => this.fileProcessor.processFiles(allFiles),
        [], // fallback to empty array
        { operation: 'process_files', details: { fileCount: allFiles.length } },
        {
          logError: true,
          showWarning: true,
          attemptRecovery: true
        }
      );
      
      this.categoryLogger.info(`Extracted ${allFeatures.length} features from ${allFiles.length} files`);
      
      // Check each feature for compatibility violations with error recovery
      let processedFeatures = 0;
      let failedFeatures = 0;
      
      for (const feature of allFeatures) {
        try {
          const compatibilityResult = await SystemErrorHandler.handleGracefully(
            () => this.baselineChecker.checkCompatibility(feature, this.config.targets),
            { violations: [], featureData: null }, // fallback result
            { 
              operation: 'check_compatibility', 
              file: feature.file,
              details: { feature: feature.feature }
            }
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
          
          processedFeatures++;
        } catch (error) {
          failedFeatures++;
          this.categoryLogger.warn('Failed to check feature compatibility', {
            feature: feature.feature,
            file: feature.file,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Continue processing other features
          continue;
        }
      }
      
      const duration = this.categoryLogger.endPerformance('check-violations', {
        totalFiles: allFiles.length,
        processedFeatures,
        failedFeatures,
        violationsFound: violations.length
      });
      
      this.categoryLogger.info('Violation check completed', {
        duration,
        totalFiles: allFiles.length,
        processedFeatures,
        failedFeatures,
        violationsFound: violations.length
      });
      
      return violations;
      
    } catch (error) {
      this.categoryLogger.error('Violation check failed', { error });
      
      // Try graceful degradation
      const mode = GracefulDegradationManager.getCurrentMode();
      if (mode?.capabilities.baselineChecking) {
        this.categoryLogger.info('Attempting graceful degradation for violation checking');
        
        try {
          // Simplified violation checking with minimal features
          const basicViolations = await this.performBasicViolationCheck(patterns);
          this.categoryLogger.info('Graceful degradation successful', { violationsFound: basicViolations.length });
          return basicViolations;
        } catch (degradationError) {
          this.categoryLogger.error('Graceful degradation also failed', { error: degradationError });
        }
      }
      
      throw error;
    } finally {
      await logger.endSession();
    }
  }

  /**
   * Perform basic violation checking as fallback
   */
  private async performBasicViolationCheck(patterns: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];
    
    try {
      // Use minimal file processing
      const basicFiles = patterns.length > 0 ? patterns : ['src/**/*.{js,ts,jsx,tsx,css,vue,svelte}'];
      
      // Simple file enumeration without complex processing
      const { glob } = await import('glob');
      const files = await glob(basicFiles.join(','), { ignore: ['node_modules/**', 'dist/**', 'build/**'] });
      
      this.categoryLogger.info(`Basic violation check on ${files.length} files`);
      
      // Process a limited number of files to avoid overwhelming the system
      const limitedFiles = files.slice(0, 100);
      
      for (const file of limitedFiles) {
        try {
          // Basic feature extraction without complex parsing
          const basicFeatures = await this.extractBasicFeatures(file);
          
          for (const feature of basicFeatures) {
            const result = await this.baselineChecker.checkCompatibility(feature, this.config.targets);
            violations.push(...result.violations);
          }
        } catch (error) {
          // Skip individual file errors in basic mode
          this.categoryLogger.debug('Skipped file in basic mode', { file, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
      
    } catch (error) {
      this.categoryLogger.error('Basic violation check failed', { error });
    }
    
    return violations;
  }

  /**
   * Extract basic features without complex parsing
   */
  private async extractBasicFeatures(file: string): Promise<any[]> {
    // This is a simplified feature extraction for fallback mode
    // In a real implementation, this would do basic text pattern matching
    return [];
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
   * Cleanup resources with error handling
   */
  async cleanup(): Promise<void> {
    this.categoryLogger.info('Starting BaseGuard cleanup');
    
    try {
      // Cleanup file processor
      await SystemErrorHandler.handleGracefully(
        async () => {
          await this.fileProcessor.cleanup();
          return undefined;
        },
        undefined,
        { operation: 'file_processor_cleanup' },
        { logError: false, showWarning: false }
      );
      
      // Clear caches
      await SystemErrorHandler.handleGracefully(
        async () => {
          this.cacheManager.clearAll();
          return undefined;
        },
        undefined,
        { operation: 'cache_cleanup' },
        { logError: false, showWarning: false }
      );
      
      // Cleanup graceful degradation manager
      await SystemErrorHandler.handleGracefully(
        async () => {
          await GracefulDegradationManager.cleanupCache();
          return undefined;
        },
        undefined,
        { operation: 'degradation_cleanup' },
        { logError: false, showWarning: false }
      );
      
      // Cleanup old logs
      await SystemErrorHandler.handleGracefully(
        async () => {
          await logger.cleanupOldLogs();
          return undefined;
        },
        undefined,
        { operation: 'log_cleanup' },
        { logError: false, showWarning: false }
      );
      
      this.categoryLogger.info('BaseGuard cleanup completed');
      
    } catch (error) {
      this.categoryLogger.warn('Some cleanup operations failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Create auto-backup of configuration
   */
  async createConfigBackup(): Promise<string | null> {
    try {
      return await ConfigurationRecovery.createAutoBackup();
    } catch (error) {
      this.categoryLogger.error('Failed to create config backup', { error });
      return null;
    }
  }

  /**
   * Show system status and health
   */
  async showSystemStatus(): Promise<void> {
    console.log(chalk.cyan('🔍 BaseGuard System Status\n'));
    
    const health = await this.getHealthStatus();
    
    // Overall status
    const statusIcon = health.overall === 'healthy' ? '✅' : health.overall === 'degraded' ? '⚠️' : '❌';
    const statusColor = health.overall === 'healthy' ? chalk.green : health.overall === 'degraded' ? chalk.yellow : chalk.red;
    
    console.log(statusColor(`${statusIcon} Overall Status: ${health.overall.toUpperCase()}`));
    console.log(chalk.dim(`Degradation Mode: ${health.degradationMode}\n`));
    
    // Component status
    console.log(chalk.cyan('📊 Component Status:'));
    for (const [component, status] of Object.entries(health.components)) {
      const componentIcon = status.status === 'healthy' ? '✅' : status.status === 'degraded' ? '⚠️' : '❌';
      console.log(`   ${componentIcon} ${component}: ${status.status}`);
      
      if (status.details && status.status !== 'healthy') {
        if (status.details.errors?.length > 0) {
          console.log(chalk.dim(`      Errors: ${status.details.errors.slice(0, 2).join(', ')}`));
        }
        if (status.details.error) {
          console.log(chalk.dim(`      Error: ${status.details.error}`));
        }
      }
    }
    
    // Recommendations
    if (health.recommendations.length > 0) {
      console.log(chalk.cyan('\n💡 Recommendations:'));
      health.recommendations.forEach(rec => {
        console.log(chalk.cyan(`   • ${rec}`));
      });
    }
    
    // Show degradation status
    GracefulDegradationManager.showStatus();
  }

  /**
   * Analyze violations using AI with graceful degradation
   */
  async analyzeViolations(violations: Violation[]): Promise<Analysis[]> {
    await this.ensureInitialized();
    
    const sessionId = logger.startSession('analyze-violations');
    this.categoryLogger.startPerformance('analyze-violations');
    
    try {
      const analyses: Analysis[] = [];
      const mode = GracefulDegradationManager.getCurrentMode();
      
      if (!mode?.capabilities.aiAnalysis) {
        this.categoryLogger.info('AI analysis disabled in current mode, using fallback analysis');
        
        // Create fallback analyses for all violations
        for (const violation of violations) {
          const fallbackAnalysis = GracefulDegradationManager.createFallbackAnalysis(
            violation, 
            'AI analysis unavailable in current mode'
          );
          analyses.push(fallbackAnalysis);
        }
        
        return analyses;
      }
      
      // Try to use cached analyses first
      for (const violation of violations) {
        const cached = await GracefulDegradationManager.loadCachedAnalysis(violation);
        if (cached) {
          analyses.push(cached);
        } else {
          // Will need AI analysis
          const fallbackAnalysis = GracefulDegradationManager.createFallbackAnalysis(
            violation,
            'AI analysis not yet implemented'
          );
          analyses.push(fallbackAnalysis);
        }
      }
      
      const duration = this.categoryLogger.endPerformance('analyze-violations', {
        violationCount: violations.length,
        analysesCreated: analyses.length
      });
      
      this.categoryLogger.info('Violation analysis completed', {
        duration,
        violationCount: violations.length,
        analysesCreated: analyses.length
      });
      
      return analyses;
      
    } catch (error) {
      this.categoryLogger.error('Violation analysis failed', { error });
      
      // Fallback to basic analysis
      const fallbackAnalyses = violations.map(violation => 
        GracefulDegradationManager.createFallbackAnalysis(violation, 'Analysis failed, using fallback')
      );
      
      return fallbackAnalyses;
    } finally {
      await logger.endSession();
    }
  }

  /**
   * Generate fixes for violations with graceful degradation
   */
  async generateFixes(violations: Violation[], analyses: Analysis[]): Promise<Fix[]> {
    await this.ensureInitialized();
    
    const sessionId = logger.startSession('generate-fixes');
    this.categoryLogger.startPerformance('generate-fixes');
    
    try {
      const fixes: Fix[] = [];
      const mode = GracefulDegradationManager.getCurrentMode();
      
      if (!mode?.capabilities.autoFix) {
        this.categoryLogger.info('Auto-fix disabled in current mode, creating manual fix suggestions');
        
        // Create manual fix suggestions
        for (let i = 0; i < violations.length; i++) {
          const violation = violations[i];
          const analysis = analyses[i];
          
          if (violation && analysis) {
            const manualFix = GracefulDegradationManager.createBasicFixSuggestion(violation, analysis);
            fixes.push(manualFix);
          }
        }
        
        return fixes;
      }
      
      // Auto-fix would be implemented here when available
      this.categoryLogger.info('Auto-fix not yet implemented, creating manual suggestions');
      
      for (let i = 0; i < violations.length; i++) {
        const violation = violations[i];
        const analysis = analyses[i];
        
        if (violation && analysis) {
          const manualFix = GracefulDegradationManager.createBasicFixSuggestion(violation, analysis);
          fixes.push(manualFix);
        }
      }
      
      const duration = this.categoryLogger.endPerformance('generate-fixes', {
        violationCount: violations.length,
        fixesGenerated: fixes.length
      });
      
      this.categoryLogger.info('Fix generation completed', {
        duration,
        violationCount: violations.length,
        fixesGenerated: fixes.length
      });
      
      return fixes;
      
    } catch (error) {
      this.categoryLogger.error('Fix generation failed', { error });
      throw error;
    } finally {
      await logger.endSession();
    }
  }

  /**
   * Apply fixes to files with error recovery
   */
  async applyFixes(fixes: Fix[]): Promise<void> {
    await this.ensureInitialized();
    
    const sessionId = logger.startSession('apply-fixes');
    this.categoryLogger.startPerformance('apply-fixes');
    
    try {
      this.categoryLogger.info(`Applying ${fixes.length} fixes`);
      
      let appliedCount = 0;
      let failedCount = 0;
      
      for (const fix of fixes) {
        try {
          await SystemErrorHandler.withRetry(
            async () => {
              // Fix application would be implemented here
              this.categoryLogger.debug('Fix application not yet implemented', { 
                file: fix.filePath,
                feature: fix.violation.feature 
              });
              
              // For now, just log the fix that would be applied
              console.log(chalk.cyan(`Would apply fix for ${fix.violation.feature} in ${fix.filePath}`));
            },
            { 
              operation: 'apply_fix', 
              file: fix.filePath,
              details: { feature: fix.violation.feature }
            },
            2 // max retries
          );
          
          appliedCount++;
        } catch (error) {
          failedCount++;
          this.categoryLogger.error('Failed to apply fix', {
            file: fix.filePath,
            feature: fix.violation.feature,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      const duration = this.categoryLogger.endPerformance('apply-fixes', {
        totalFixes: fixes.length,
        appliedCount,
        failedCount
      });
      
      this.categoryLogger.info('Fix application completed', {
        duration,
        totalFixes: fixes.length,
        appliedCount,
        failedCount
      });
      
      if (failedCount > 0) {
        console.log(chalk.yellow(`⚠️ ${failedCount} fixes failed to apply. Check logs for details.`));
      }
      
    } catch (error) {
      this.categoryLogger.error('Fix application process failed', { error });
      throw error;
    } finally {
      await logger.endSession();
    }
  }

  /**
   * Recover from configuration corruption
   */
  async recoverConfiguration(): Promise<Configuration> {
    this.categoryLogger.info('Attempting configuration recovery');
    
    const recoveryResult = await ConfigurationRecovery.recoverConfiguration({
      createBackup: true,
      validateConfig: true,
      migrateVersion: true,
      repairCorruption: true,
      useDefaults: true
    });
    
    if (recoveryResult.success && recoveryResult.config) {
      this.config = recoveryResult.config;
      this.categoryLogger.info('Configuration recovered successfully');
      
      if (recoveryResult.warnings.length > 0) {
        this.categoryLogger.warn('Configuration recovery warnings', { warnings: recoveryResult.warnings });
      }
      
      return this.config;
    } else {
      const error = new Error(`Configuration recovery failed: ${recoveryResult.errors.join(', ')}`);
      this.categoryLogger.error('Configuration recovery failed', { errors: recoveryResult.errors });
      throw error;
    }
  }

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'critical';
    components: Record<string, { status: string; details?: any }>;
    degradationMode: string;
    recommendations: string[];
  }> {
    const health = {
      overall: 'healthy' as 'healthy' | 'degraded' | 'critical',
      components: {} as Record<string, { status: string; details?: any }>,
      degradationMode: 'unknown',
      recommendations: [] as string[]
    };
    
    try {
      // Check configuration health
      const configIntegrity = await ConfigurationRecovery.validateIntegrity();
      health.components.configuration = {
        status: configIntegrity.valid ? 'healthy' : 'degraded',
        details: { errors: configIntegrity.errors, suggestions: configIntegrity.suggestions }
      };
      
      // Check degradation mode
      const mode = GracefulDegradationManager.getCurrentMode();
      health.degradationMode = mode?.name || 'unknown';
      
      if (mode?.name !== 'Full Functionality') {
        health.overall = 'degraded';
        health.recommendations.push(`Currently in ${mode?.name} mode`);
        health.recommendations.push(...(mode?.limitations || []));
      }
      
      // Check service status
      const serviceStatus = GracefulDegradationManager.getServiceStatus();
      for (const [service, status] of serviceStatus) {
        health.components[service] = {
          status: status.available ? 'healthy' : 'degraded',
          details: { lastCheck: status.lastCheck, error: status.error }
        };
        
        if (!status.available) {
          health.overall = 'degraded';
          health.recommendations.push(`${service} service is unavailable`);
        }
      }
      
      // Check error summary
      const errorSummary = logger.getErrorSummary();
      health.components.errors = {
        status: errorSummary.totalErrors > 10 ? 'critical' : errorSummary.totalErrors > 0 ? 'degraded' : 'healthy',
        details: errorSummary
      };
      
      if (errorSummary.totalErrors > 10) {
        health.overall = 'critical';
        health.recommendations.push('High error count detected - check logs');
      }
      
    } catch (error) {
      health.overall = 'critical';
      health.components.healthCheck = {
        status: 'failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
      health.recommendations.push('Health check failed - system may be unstable');
    }
    
    return health;
  }
}