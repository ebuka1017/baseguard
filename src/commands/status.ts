import { BaseGuard } from '../core/baseguard.js';
import { ConfigurationManager } from '../core/configuration.js';
import { ConfigurationRecovery } from '../core/configuration-recovery.js';
import { GracefulDegradationManager } from '../core/graceful-degradation-manager.js';
import { SystemErrorHandler } from '../core/system-error-handler.js';
import { logger } from '../core/debug-logger.js';
import { UIComponents } from '../ui/components.js';
import chalk from 'chalk';

/**
 * Show BaseGuard system status and health
 */
export async function status(options: {
  verbose?: boolean;
  services?: boolean;
  config?: boolean;
  errors?: boolean;
}): Promise<void> {
  const categoryLogger = logger.createCategoryLogger('status-command');
  
  try {
    UIComponents.showHeader();
    console.log(chalk.cyan('🔍 BaseGuard System Status\n'));
    
    // Load configuration with recovery if needed
    let config;
    try {
      config = await ConfigurationManager.load();
    } catch (error) {
      console.log(chalk.red('❌ Configuration Error'));
      console.log(chalk.dim(`   ${error instanceof Error ? error.message : 'Unknown error'}`));
      
      if (options.config) {
        console.log(chalk.cyan('\n🔧 Configuration Recovery Options:'));
        console.log(chalk.cyan('   • Run "base config recover" to attempt automatic recovery'));
        console.log(chalk.cyan('   • Run "base init" to create a new configuration'));
        console.log(chalk.cyan('   • Check .baseguardrc.json file manually'));
      }
      
      return;
    }
    
    // Initialize BaseGuard
    const baseGuard = new BaseGuard(config);
    
    // Show system health
    const health = await baseGuard.getHealthStatus();
    
    // Overall status
    const statusIcon = health.overall === 'healthy' ? '✅' : health.overall === 'degraded' ? '⚠️' : '❌';
    const statusColor = health.overall === 'healthy' ? chalk.green : health.overall === 'degraded' ? chalk.yellow : chalk.red;
    
    console.log(statusColor(`${statusIcon} Overall Status: ${health.overall.toUpperCase()}`));
    console.log(chalk.dim(`   Degradation Mode: ${health.degradationMode}`));
    
    // Component status
    console.log(chalk.cyan('\n📊 Component Status:'));
    for (const [component, status] of Object.entries(health.components)) {
      const componentIcon = status.status === 'healthy' ? '✅' : status.status === 'degraded' ? '⚠️' : '❌';
      console.log(`   ${componentIcon} ${component}: ${status.status}`);
      
      if (options.verbose && status.details) {
        if (status.details.errors?.length > 0) {
          console.log(chalk.dim(`      Errors: ${status.details.errors.slice(0, 3).join(', ')}`));
        }
        if (status.details.error) {
          console.log(chalk.dim(`      Error: ${status.details.error}`));
        }
        if (status.details.lastCheck) {
          const age = Math.round((Date.now() - status.details.lastCheck) / 1000);
          console.log(chalk.dim(`      Last Check: ${age}s ago`));
        }
      }
    }
    
    // Service status (if requested)
    if (options.services) {
      console.log(chalk.cyan('\n🌐 Service Status:'));
      const serviceStatus = GracefulDegradationManager.getServiceStatus();
      
      for (const [service, info] of serviceStatus) {
        const serviceIcon = info.available ? '✅' : '❌';
        const age = Math.round((Date.now() - info.lastCheck) / 1000);
        console.log(`   ${serviceIcon} ${service}: ${info.available ? 'Available' : 'Unavailable'} (${age}s ago)`);
        
        if (!info.available && info.error && options.verbose) {
          console.log(chalk.dim(`      Error: ${info.error}`));
        }
      }
      
      // Refresh service status
      console.log(chalk.dim('\n🔄 Refreshing service status...'));
      await GracefulDegradationManager.refreshServiceStatus();
    }
    
    // Configuration status (if requested)
    if (options.config) {
      console.log(chalk.cyan('\n⚙️ Configuration Status:'));
      
      const configIntegrity = await ConfigurationRecovery.validateIntegrity();
      const configIcon = configIntegrity.valid ? '✅' : '❌';
      console.log(`   ${configIcon} Configuration File: ${configIntegrity.valid ? 'Valid' : 'Invalid'}`);
      
      if (!configIntegrity.valid) {
        console.log(chalk.red('   Errors:'));
        configIntegrity.errors.forEach(error => {
          console.log(chalk.red(`      • ${error}`));
        });
        
        console.log(chalk.cyan('   Suggestions:'));
        configIntegrity.suggestions.forEach(suggestion => {
          console.log(chalk.cyan(`      • ${suggestion}`));
        });
      }
      
      // Show configuration details
      if (options.verbose) {
        console.log(chalk.dim('\n   Configuration Details:'));
        console.log(chalk.dim(`      Version: ${config.version}`));
        console.log(chalk.dim(`      Targets: ${config.targets.length} browser(s)`));
        console.log(chalk.dim(`      API Keys: Jules ${config.apiKeys.jules ? '✓' : '✗'}, Gemini ${config.apiKeys.gemini ? '✓' : '✗'}`));
        console.log(chalk.dim(`      Automation: ${config.automation.enabled ? 'Enabled' : 'Disabled'}`));
      }
      
      // Show available backups
      const backups = await ConfigurationRecovery.listBackups();
      if (backups.length > 0) {
        console.log(chalk.dim(`\n   Available Backups: ${backups.length}`));
        if (options.verbose) {
          backups.slice(0, 3).forEach(backup => {
            console.log(chalk.dim(`      • ${backup.timestamp.toLocaleString()} (${backup.source})`));
          });
        }
      }
    }
    
    // Error summary (if requested)
    if (options.errors) {
      console.log(chalk.cyan('\n🚨 Error Summary:'));
      
      const errorSummary = logger.getErrorSummary();
      console.log(`   Total Errors: ${errorSummary.totalErrors}`);
      console.log(`   Total Warnings: ${errorSummary.totalWarnings}`);
      
      if (errorSummary.totalErrors > 0) {
        console.log(chalk.red('\n   Error Categories:'));
        for (const [category, count] of Object.entries(errorSummary.errorsByCategory)) {
          console.log(chalk.red(`      ${category}: ${count}`));
        }
        
        if (options.verbose && errorSummary.recentErrors.length > 0) {
          console.log(chalk.red('\n   Recent Errors:'));
          errorSummary.recentErrors.slice(0, 3).forEach(error => {
            console.log(chalk.red(`      • ${error.message} (${error.category})`));
          });
        }
      }
      
      // System error handler status
      const systemErrorSummary = SystemErrorHandler.getErrorSummary();
      if (systemErrorSummary.total > 0) {
        console.log(chalk.yellow('\n   System Errors:'));
        console.log(`      Total: ${systemErrorSummary.total}`);
        console.log(`      Critical: ${systemErrorSummary.critical}`);
        console.log(`      Recoverable: ${systemErrorSummary.recoverable}`);
        
        if (options.verbose) {
          console.log(chalk.yellow('\n   By Severity:'));
          for (const [severity, count] of Object.entries(systemErrorSummary.bySeverity)) {
            if (count > 0) {
              console.log(`      ${severity}: ${count}`);
            }
          }
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
    
    // Show degradation mode details
    const mode = GracefulDegradationManager.getCurrentMode();
    if (mode && mode.name !== 'Full Functionality') {
      console.log(chalk.yellow(`\n⚠️ Currently in ${mode.name} Mode`));
      console.log(chalk.dim(`   ${mode.description}`));
      
      if (mode.limitations.length > 0) {
        console.log(chalk.yellow('\n   Limitations:'));
        mode.limitations.forEach(limitation => {
          console.log(chalk.yellow(`      • ${limitation}`));
        });
      }
      
      console.log(chalk.cyan('\n   Available Features:'));
      if (mode.capabilities.baselineChecking) {
        console.log(chalk.green('      ✅ Baseline compatibility checking'));
      }
      if (mode.capabilities.caching) {
        console.log(chalk.green('      ✅ Result caching'));
      }
      if (!mode.capabilities.aiAnalysis) {
        console.log(chalk.yellow('      ⚠️ AI analysis disabled'));
      }
      if (!mode.capabilities.autoFix) {
        console.log(chalk.yellow('      ⚠️ Auto-fixing disabled'));
      }
    }
    
    // Performance info
    if (options.verbose) {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      console.log(chalk.cyan('\n📈 Performance Info:'));
      console.log(`   Uptime: ${Math.round(uptime)}s`);
      console.log(`   Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB used / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB total`);
      console.log(`   Platform: ${process.platform} ${process.arch}`);
      console.log(`   Node.js: ${process.version}`);
    }
    
    // Quick actions
    console.log(chalk.cyan('\n🔧 Quick Actions:'));
    const actions = [];
    
    if (health.overall !== 'healthy') {
      actions.push('Run "base config recover" to attempt automatic recovery');
    }
    
    if (!mode?.capabilities.aiAnalysis) {
      actions.push('Check network connectivity to restore AI features');
    }
    
    const errorSummary = logger.getErrorSummary();
    if (errorSummary.totalErrors > 5) {
      actions.push('Run with --errors flag to see detailed error information');
    }
    
    actions.push('Run "base check" to scan for compatibility issues');
    actions.push('Run "base status --verbose" for detailed information');
    
    actions.forEach(action => {
      console.log(chalk.cyan(`   • ${action}`));
    });
    
  } catch (error) {
    categoryLogger.error('Status command failed', { error });
    
    console.log(chalk.red('\n❌ Failed to get system status'));
    console.log(chalk.red(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    
    console.log(chalk.cyan('\n🔧 Recovery Options:'));
    console.log(chalk.cyan('   • Run "base init" to reinitialize BaseGuard'));
    console.log(chalk.cyan('   • Check file permissions in your project directory'));
    console.log(chalk.cyan('   • Verify BaseGuard installation: npm list baseguard'));
    
    process.exit(1);
  }
}

/**
 * Show detailed system diagnostics
 */
export async function diagnostics(): Promise<void> {
  const categoryLogger = logger.createCategoryLogger('diagnostics');
  
  try {
    console.log(chalk.cyan('🔬 BaseGuard System Diagnostics\n'));
    
    // Generate comprehensive debug report
    const reportFile = await logger.generateDebugReport();
    console.log(chalk.green(`✅ Debug report generated: ${reportFile}`));
    
    // Show configuration recovery wizard
    console.log(chalk.cyan('\n🔧 Running Configuration Recovery Wizard...'));
    await ConfigurationRecovery.runRecoveryWizard();
    
    // Show service status
    console.log(chalk.cyan('\n🌐 Checking Service Availability...'));
    await GracefulDegradationManager.refreshServiceStatus();
    
    // Show error log summary
    const loggerErrorSummary = logger.getErrorSummary();
    if (loggerErrorSummary.totalErrors > 0) {
      console.log(chalk.yellow(`\n⚠️ Found ${loggerErrorSummary.totalErrors} errors in logs`));
      console.log(chalk.cyan('Recent errors:'));
      loggerErrorSummary.recentErrors.slice(0, 5).forEach(error => {
        console.log(chalk.red(`   • ${error.message} (${error.category})`));
      });
    }
    
    // Cleanup old files
    console.log(chalk.cyan('\n🧹 Cleaning up old files...'));
    await logger.cleanupOldLogs();
    await GracefulDegradationManager.cleanupCache();
    
    console.log(chalk.green('\n✅ Diagnostics completed'));
    
  } catch (error) {
    categoryLogger.error('Diagnostics failed', { error });
    console.log(chalk.red(`\n❌ Diagnostics failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}