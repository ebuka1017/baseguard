import chalk from 'chalk';
import { UIComponents } from '../ui/index.js';
import { BaseGuard } from '../core/index.js';
import { ConfigurationManager } from '../core/configuration.js';
import { ErrorHandler } from '../core/error-handler.js';
import { JulesImplementer } from '../ai/jules-implementer.js';
import { GeminiAnalyzer } from '../ai/gemini-analyzer.js';
import { glob } from 'glob';

/**
 * Fix violations with AI analysis and implementation
 */
export async function fix(options: {
  auto?: boolean;
  analyzeOnly?: boolean;
  files?: string;
}): Promise<void> {
  try {
    console.log(chalk.cyan('🔧 BaseGuard AI Fix\n'));
    
    // Load configuration
    const config = await ConfigurationManager.load();
    
    // Check API keys
    if (!config.apiKeys.jules) {
      UIComponents.showErrorBox('Jules API key not configured. Run "base init" to set up API keys.');
      process.exit(1);
    }
    
    if (!config.apiKeys.gemini) {
      UIComponents.showErrorBox('Gemini API key not configured. Run "base init" to set up API keys.');
      process.exit(1);
    }
    
    // Initialize services
    const baseGuard = new BaseGuard(config);
    const julesImplementer = new JulesImplementer(config.apiKeys.jules);
    const geminiAnalyzer = new GeminiAnalyzer(config.apiKeys.gemini);
    
    // Check GitHub integration
    const isGitHubSetup = await julesImplementer.isGitHubIntegrationSetup();
    if (!isGitHubSetup) {
      console.log(chalk.yellow('⚠️ Jules GitHub integration not set up'));
      
      const { default: inquirer } = await import('inquirer');
      const { setupNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'setupNow',
          message: 'Would you like to set up Jules GitHub integration now?',
          default: true
        }
      ]);
      
      if (setupNow) {
        await julesImplementer.setupGitHubIntegration();
      } else {
        console.log(chalk.yellow('GitHub integration required for Jules fixing. Exiting.'));
        process.exit(0);
      }
    }
    
    // Step 1: Check for violations
    console.log(chalk.cyan('🔍 Scanning for compatibility violations...'));
    
    // Get files to fix
    const filePattern = options.files || '**/*.{js,jsx,ts,tsx,vue,svelte,css,html}';
    const files = await glob(filePattern, {
      ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '.git/**',
        '**/*.min.js',
        '**/*.min.css'
      ]
    });
    
    const violations = await baseGuard.checkViolations(files);
    
    if (violations.length === 0) {
      UIComponents.showSuccessBox('No compatibility violations found!');
      return;
    }
    
    console.log(chalk.yellow(`\n⚠️ Found ${violations.length} compatibility violations\n`));
    UIComponents.showViolations(violations);
    
    // Step 2: Analyze violations with Gemini
    console.log(chalk.cyan('\n🧠 Analyzing violations with AI...'));
    const analyses = await geminiAnalyzer.analyzeViolations(violations);
    
    // If analyze-only mode, show analysis and exit
    if (options.analyzeOnly) {
      console.log(chalk.cyan('\n📋 Analysis Results:\n'));
      analyses.forEach((analysis, index) => {
        console.log(chalk.yellow(`${index + 1}. ${analysis.violation.feature} in ${analysis.violation.file}`));
        console.log(`   Impact: ${analysis.userImpact}`);
        console.log(`   Strategy: ${analysis.fixStrategy}`);
        console.log(`   Confidence: ${Math.round(analysis.confidence * 100)}%\n`);
      });
      return;
    }
    
    // Step 3: Generate and apply fixes with Jules
    console.log(chalk.cyan('\n🤖 Generating fixes with Jules AI...'));
    const results = await julesImplementer.generateAndApplyFixes(violations, analyses);
    
    // Show results
    console.log(chalk.cyan('\n📊 Fix Results:\n'));
    
    if (results.applied.length > 0) {
      console.log(chalk.green(`✅ Applied ${results.applied.length} fixes:`));
      results.applied.forEach(fix => {
        console.log(chalk.green(`   • ${fix.filePath} - ${fix.violation.feature}`));
      });
      console.log();
    }
    
    if (results.skipped.length > 0) {
      console.log(chalk.yellow(`⏭️ Skipped ${results.skipped.length} fixes:`));
      results.skipped.forEach(fix => {
        console.log(chalk.yellow(`   • ${fix.filePath} - ${fix.violation.feature}`));
      });
      console.log();
    }
    
    if (results.failed.length > 0) {
      console.log(chalk.red(`❌ Failed ${results.failed.length} fixes:`));
      results.failed.forEach(({ fix, error }) => {
        console.log(chalk.red(`   • ${fix.filePath} - ${fix.violation.feature}: ${error}`));
      });
      console.log();
    }
    
    // Show rollback option if fixes were applied
    if (results.applied.length > 0) {
      const { default: inquirer } = await import('inquirer');
      const { showRollback } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'showRollback',
          message: 'Would you like to see rollback options?',
          default: false
        }
      ]);
      
      if (showRollback) {
        const { rollbackAction } = await inquirer.prompt([
          {
            type: 'list',
            name: 'rollbackAction',
            message: 'Rollback options:',
            choices: [
              { name: 'Keep all fixes', value: 'keep' },
              { name: 'Rollback all fixes', value: 'rollback_all' },
              { name: 'Rollback specific fixes', value: 'rollback_specific' }
            ]
          }
        ]);
        
        if (rollbackAction === 'rollback_all') {
          await julesImplementer.rollbackAllFixes();
          UIComponents.showSuccessBox('All fixes have been rolled back');
        } else if (rollbackAction === 'rollback_specific') {
          const appliedFiles = julesImplementer.getAppliedFixes();
          const { filesToRollback } = await inquirer.prompt([
            {
              type: 'checkbox',
              name: 'filesToRollback',
              message: 'Select fixes to rollback:',
              choices: appliedFiles.map(file => ({ name: file, value: file }))
            }
          ]);
          
          for (const file of filesToRollback) {
            await julesImplementer.rollbackFix(file);
          }
          
          if (filesToRollback.length > 0) {
            UIComponents.showSuccessBox(`Rolled back ${filesToRollback.length} fixes`);
          }
        }
      }
    }
    
    UIComponents.showSuccessBox('Fix process completed!');
    
  } catch (error) {
    const apiError = ErrorHandler.handleAPIError(error);
    ErrorHandler.displayError(apiError);
    
    // Provide specific help for fix command issues
    console.log('\n💡 Troubleshooting:');
    if (apiError.type === 'authentication') {
      UIComponents.showList([
        'Check your API keys with "base config show"',
        'Update API keys with "base config set-keys"',
        'Verify API keys are valid and not expired',
        'Ensure you have proper permissions for Jules and Gemini'
      ]);
    } else if (apiError.type === 'configuration') {
      UIComponents.showList([
        'Run "base init" to set up BaseGuard configuration',
        'Configure API keys with "base config set-keys"',
        'Check GitHub integration for Jules fixing'
      ]);
    } else if (apiError.type === 'network') {
      UIComponents.showList([
        'Check your internet connection',
        'Verify firewall allows access to AI services',
        'Try again when network connection is stable'
      ]);
    } else {
      UIComponents.showList([
        'Try running "base check" for basic violation detection',
        'Verify your API keys are configured correctly',
        'Check the documentation for troubleshooting steps'
      ]);
    }
    
    // Show fallback suggestions
    if (ErrorHandler.shouldUseFallbackMode(apiError)) {
      console.log('\n🔄 Alternative options:');
      UIComponents.showList([
        'Run "base check" for offline compatibility checking',
        'Review violations manually using browser compatibility tables',
        'Try AI features again when services are available'
      ]);
    }
    
    process.exit(1);
  }
}