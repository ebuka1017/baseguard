import { UIComponents } from '../ui/index.js';
import { BaseGuard } from '../core/baseguard.js';
import { ConfigurationManager } from '../core/configuration.js';
import { ConfigurationRecovery } from '../core/configuration-recovery.js';
import { GracefulDegradationManager } from '../core/graceful-degradation-manager.js';
import { SystemErrorHandler } from '../core/system-error-handler.js';
import { ErrorHandler } from '../core/error-handler.js';
import { logger } from '../core/debug-logger.js';
import { glob } from 'glob';
import chalk from 'chalk';

/**
 * Check for compatibility violations with enhanced error recovery
 */
export async function check(options: {
  strict?: boolean;
  files?: string;
  format?: 'table' | 'json' | 'junit';
  debug?: boolean;
  offline?: boolean;
}): Promise<void> {
  const categoryLogger = logger.createCategoryLogger('check-command');
  logger.startSession('check-command');
  
  try {
    // Enable debug logging if requested
    if (options.debug) {
      logger.enableDebug();
    }
    
    // Set offline mode if requested
    if (options.offline) {
      SystemErrorHandler.setOfflineMode(true);
    }
    
    UIComponents.showHeader();
    categoryLogger.info('Starting compatibility check', { options });
    
    // Load configuration with recovery
    const config = await SystemErrorHandler.withRetry(
      async () => {
        try {
          return await ConfigurationManager.load();
        } catch (error) {
          categoryLogger.warn('Configuration load failed, attempting recovery', { error });
          
          // Attempt configuration recovery
          const recoveryResult = await ConfigurationRecovery.recoverConfiguration({
            createBackup: true,
            validateConfig: true,
            migrateVersion: true,
            repairCorruption: true,
            useDefaults: true
          });
          
          if (recoveryResult.success && recoveryResult.config) {
            if (recoveryResult.warnings.length > 0) {
              console.log(chalk.yellow('⚠️ Configuration was recovered with warnings:'));
              recoveryResult.warnings.forEach(warning => {
                console.log(chalk.yellow(`   • ${warning}`));
              });
            }
            return recoveryResult.config;
          } else {
            throw new Error(`Configuration recovery failed: ${recoveryResult.errors.join(', ')}`);
          }
        }
      },
      { operation: 'load_configuration' },
      2 // max retries
    );
    
    // Initialize BaseGuard with error handling
    const baseGuard = await SystemErrorHandler.handleGracefully(
      async () => new BaseGuard(config),
      null,
      { operation: 'initialize_baseguard' }
    );
    
    if (!baseGuard) {
      throw new Error('Failed to initialize BaseGuard');
    }
    
    const spinner = UIComponents.createSpinner('Scanning files for compatibility issues...');
    spinner.start();
    
    // Get files to check with error recovery
    const filePattern = options.files || '**/*.{js,jsx,ts,tsx,vue,svelte,css,html}';
    const files = await SystemErrorHandler.handleGracefully(
      async () => {
        return await glob(filePattern, {
          ignore: [
            'node_modules/**',
            'dist/**',
            'build/**',
            '.git/**',
            '**/*.min.js',
            '**/*.min.css'
          ]
        });
      },
      [], // fallback to empty array
      { operation: 'find_files', details: { pattern: filePattern } }
    );
    
    if (files.length === 0) {
      spinner.fail('No files found to check');
      
      // Show degradation status if in limited mode
      const mode = GracefulDegradationManager.getCurrentMode();
      if (mode && mode.name !== 'Full Functionality') {
        console.log(chalk.yellow(`\n⚠️ Currently in ${mode.name} mode`));
        if (mode.limitations.length > 0) {
          console.log(chalk.yellow('Limitations:'));
          mode.limitations.forEach(limitation => {
            console.log(chalk.yellow(`   • ${limitation}`));
          });
        }
      }
      
      UIComponents.showWarningBox('No files matched the pattern. Try adjusting the --files option.');
      return;
    }
    
    spinner.text = `Analyzing ${files.length} files...`;
    categoryLogger.info(`Found ${files.length} files to analyze`);
    
    // Scan for violations with enhanced error handling
    const violations = await SystemErrorHandler.handleGracefully(
      async () => {
        return await baseGuard.checkViolations(files);
      },
      [], // fallback to empty violations
      { operation: 'check_violations', details: { fileCount: files.length } },
      {
        logError: true,
        showWarning: true,
        attemptRecovery: true
      }
    );
    
    spinner.stop();
    categoryLogger.info(`Scan completed, found ${violations.length} violations`);
    
    // Display results based on format with error handling
    await SystemErrorHandler.handleGracefully(
      async () => {
        switch (options.format) {
          case 'json':
            console.log(JSON.stringify(violations, null, 2));
            break;
          case 'junit':
            UIComponents.showJUnitReport(violations);
            break;
          default:
            UIComponents.showViolations(violations);
            break;
        }
      },
      undefined,
      { operation: 'display_results', details: { format: options.format, violationCount: violations.length } },
      { logError: true, showWarning: false }
    );
    
    // Show summary with degradation mode info
    if (violations.length === 0) {
      UIComponents.showSuccessBox('🎉 No compatibility violations found!');
      
      // Show mode info if not in full functionality
      const mode = GracefulDegradationManager.getCurrentMode();
      if (mode && mode.name !== 'Full Functionality') {
        console.log(chalk.dim(`\nScan completed in ${mode.name} mode`));
      }
    } else {
      const summary = {
        total: violations.length,
        byBrowser: violations.reduce((acc, v) => {
          acc[v.browser] = (acc[v.browser] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byFile: violations.reduce((acc, v) => {
          acc[v.file] = (acc[v.file] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };
      
      console.log(chalk.yellow('\n📊 Summary:'));
      console.log(`  Total violations: ${summary.total}`);
      console.log(`  Files affected: ${Object.keys(summary.byFile).length}`);
      console.log(`  Browsers affected: ${Object.keys(summary.byBrowser).join(', ')}`);
      
      // Show appropriate next steps based on current mode
      const mode = GracefulDegradationManager.getCurrentMode();
      if (mode?.capabilities.autoFix) {
        UIComponents.showInfoBox('Run "base fix" to automatically fix these issues with AI assistance.');
      } else {
        UIComponents.showInfoBox('AI fixing is not available in current mode. Review violations manually or restore full functionality.');
      }
      
      if (mode && mode.name !== 'Full Functionality') {
        console.log(chalk.dim(`\nScan completed in ${mode.name} mode`));
        if (mode.limitations.length > 0) {
          console.log(chalk.yellow('Current limitations:'));
          mode.limitations.forEach(limitation => {
            console.log(chalk.yellow(`   • ${limitation}`));
          });
        }
      }
    }
    
    // Create auto-backup if violations found
    if (violations.length > 0) {
      await SystemErrorHandler.handleGracefully(
        async () => {
          const backup = await baseGuard.createConfigBackup();
          if (backup) {
            categoryLogger.debug('Created configuration backup', { backup });
          }
        },
        undefined,
        { operation: 'create_backup' },
        { logError: false, showWarning: false }
      );
    }
    
    // Exit with error code if violations found and strict mode
    if (options.strict && violations.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    categoryLogger.error('Check command failed', { error });
    
    const apiError = ErrorHandler.handleAPIError(error);
    ErrorHandler.displayError(apiError);
    
    // Handle service failures gracefully
    if (ErrorHandler.shouldUseFallbackMode(apiError)) {
      await GracefulDegradationManager.handleServiceFailure('check', apiError.type);
    }
    
    // Provide specific help for check command issues
    console.log('\n💡 Troubleshooting:');
    if (apiError.type === 'configuration') {
      UIComponents.showList([
        'Run "base init" to set up BaseGuard configuration',
        'Run "base config recover" to attempt automatic recovery',
        'Check that .baseguardrc.json exists and is valid',
        'Run "base config validate" to check configuration'
      ]);
    } else if (options.files) {
      UIComponents.showList([
        `No files found matching pattern: ${options.files}`,
        'Try a different file pattern (e.g., "src/**/*.ts")',
        'Check that files exist in the specified locations',
        'Use --debug flag for detailed logging'
      ]);
    } else {
      UIComponents.showList([
        'Check that you\'re in a project directory',
        'Verify file permissions for reading project files',
        'Try running with a specific file pattern: --files "src/**/*.js"',
        'Use --offline flag if network issues are suspected',
        'Use --debug flag for detailed error information'
      ]);
    }
    
    // Show fallback suggestions
    if (ErrorHandler.shouldUseFallbackMode(apiError)) {
      console.log('\n🔄 Fallback options:');
      UIComponents.showList(ErrorHandler.getFallbackSuggestions(apiError.type));
    }
    
    // Show recovery options
    console.log('\n🔧 Recovery options:');
    UIComponents.showList([
      'Run "base status" to check system health',
      'Run "base config recover" to fix configuration issues',
      'Run with --debug flag to get detailed error information',
      'Check logs in .baseguard/logs/ for more details'
    ]);
    
    // Generate debug report if in debug mode
    if (options.debug) {
      try {
        const reportFile = await logger.generateDebugReport();
        console.log(chalk.dim(`\nDebug report saved to: ${reportFile}`));
      } catch (reportError) {
        // Ignore report generation errors
      }
    }
    
    process.exit(1);
  } finally {
    // End logging session
    await logger.endSession();
  }
}
