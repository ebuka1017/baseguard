import chalk from 'chalk';
import inquirer from 'inquirer';
import { UIComponents } from '../ui/index.js';
import { ConfigurationManager } from '../core/configuration.js';
import { ErrorHandler } from '../core/error-handler.js';
import { GitHookManager } from '../git/hook-manager.js';
import { AutomationEngine } from '../git/automation-engine.js';
import type { AutomationOptions } from '../types/index.js';

/**
 * Manage git automation and hooks
 */
export async function automation(action: string, options?: any): Promise<void> {
  try {
    switch (action) {
      case 'enable':
        await enableAutomation(options);
        break;
      case 'disable':
        await disableAutomation();
        break;
      case 'status':
        await showAutomationStatus();
        break;
      case 'configure':
        await configureAutomation();
        break;
      case 'run':
        await runAutomation(options);
        break;
      default:
        await showAutomationHelp();
    }
  } catch (error) {
    const apiError = ErrorHandler.handleAPIError(error);
    ErrorHandler.displayError(apiError);
    
    // Provide specific help for automation command issues
    console.log('\n💡 Automation troubleshooting:');
    if (action === 'enable') {
      UIComponents.showList([
        'Ensure you\'re in a git repository (run "git init" if needed)',
        'Check that you have a package.json file',
        'Verify write permissions for .husky directory',
        'Make sure Husky is installed (npm install husky)'
      ]);
    } else if (action === 'run') {
      UIComponents.showList([
        'This command is typically called by git hooks automatically',
        'Check that BaseGuard configuration exists (.baseguardrc.json)',
        'Verify git hooks are properly installed',
        'Run "base automation status" to check setup'
      ]);
    } else if (action === 'disable') {
      UIComponents.showList([
        'Check file permissions for .husky directory',
        'Verify git repository is properly initialized',
        'Run "base automation status" to check current state'
      ]);
    } else {
      UIComponents.showList([
        'Run "base automation status" to check current setup',
        'Use "base automation --help" to see available commands',
        'Ensure you\'re in a git repository with BaseGuard configured'
      ]);
    }
    
    process.exit(1);
  }
}

/**
 * Enable automation with optional configuration
 */
async function enableAutomation(options?: { trigger?: string; autoFix?: boolean; autoAnalyze?: boolean }): Promise<void> {
  console.log(chalk.cyan('🤖 Enabling BaseGuard automation...'));
  
  const config = await ConfigurationManager.load();
  const hookManager = new GitHookManager();
  
  // Configure automation settings
  let trigger: 'pre-commit' | 'pre-push' = config.automation.trigger;
  let autoFix = config.automation.autoFix;
  let autoAnalyze = config.automation.autoAnalyze;
  
  // Use provided options or prompt for configuration
  if (options?.trigger) {
    if (options.trigger === 'pre-commit' || options.trigger === 'pre-push') {
      trigger = options.trigger;
    } else {
      throw new Error('Invalid trigger. Must be "pre-commit" or "pre-push"');
    }
  } else if (!config.automation.enabled) {
    // First time setup - prompt for configuration
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'trigger',
        message: 'When should BaseGuard check for violations?',
        choices: [
          { name: 'Before each commit (pre-commit)', value: 'pre-commit' },
          { name: 'Before each push (pre-push)', value: 'pre-push' }
        ],
        default: trigger
      },
      {
        type: 'confirm',
        name: 'autoAnalyze',
        message: 'Enable automatic AI analysis of violations?',
        default: autoAnalyze,
        when: () => !!config.apiKeys.gemini
      },
      {
        type: 'confirm',
        name: 'autoFix',
        message: 'Enable automatic AI fixing of violations?',
        default: autoFix,
        when: () => !!config.apiKeys.jules && !!config.apiKeys.gemini
      }
    ]);
    
    trigger = answers.trigger;
    autoAnalyze = answers.autoAnalyze ?? autoAnalyze;
    autoFix = answers.autoFix ?? autoFix;
  }
  
  if (options?.autoFix !== undefined) {
    autoFix = options.autoFix;
  }
  
  if (options?.autoAnalyze !== undefined) {
    autoAnalyze = options.autoAnalyze;
  }
  
  // Update configuration
  config.automation.enabled = true;
  config.automation.trigger = trigger;
  config.automation.autoAnalyze = autoAnalyze;
  config.automation.autoFix = autoFix;
  
  await ConfigurationManager.save(config);
  
  // Install git hooks
  await hookManager.installHooks(trigger);
  
  UIComponents.showSuccessBox(`Automation enabled with ${trigger} trigger`);
  
  // Show configuration summary
  console.log(chalk.cyan('\n📋 Automation Configuration:'));
  console.log(`  Trigger: ${chalk.white(trigger)}`);
  console.log(`  Auto-analyze: ${autoAnalyze ? chalk.green('enabled') : chalk.red('disabled')}`);
  console.log(`  Auto-fix: ${autoFix ? chalk.green('enabled') : chalk.red('disabled')}`);
  console.log(`  Block commits: ${config.automation.blockCommit ? chalk.green('enabled') : chalk.red('disabled')}`);
  
  if (!config.apiKeys.gemini) {
    console.log(chalk.yellow('\n⚠️ Gemini API key not configured. Run "base config" to set up AI features.'));
  }
  
  if (!config.apiKeys.jules) {
    console.log(chalk.yellow('⚠️ Jules API key not configured. Run "base config" to set up AI fixing.'));
  }
}

/**
 * Disable automation
 */
async function disableAutomation(): Promise<void> {
  console.log(chalk.cyan('🤖 Disabling BaseGuard automation...'));
  
  const config = await ConfigurationManager.load();
  const hookManager = new GitHookManager();
  
  // Update configuration
  config.automation.enabled = false;
  await ConfigurationManager.save(config);
  
  // Uninstall git hooks
  await hookManager.uninstallHooks();
  
  UIComponents.showSuccessBox('Automation disabled');
}

/**
 * Show automation status
 */
async function showAutomationStatus(): Promise<void> {
  const config = await ConfigurationManager.load();
  const hookManager = new GitHookManager();
  
  console.log(chalk.cyan('🤖 BaseGuard Automation Status\n'));
  
  // Configuration status
  console.log(chalk.white('Configuration:'));
  console.log(`  Enabled: ${config.automation.enabled ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`  Trigger: ${chalk.white(config.automation.trigger)}`);
  console.log(`  Auto-analyze: ${config.automation.autoAnalyze ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`  Auto-fix: ${config.automation.autoFix ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`  Block commits: ${config.automation.blockCommit ? chalk.green('✓') : chalk.red('✗')}`);
  
  // Git hooks status
  const hooksInstalled = await hookManager.areHooksInstalled();
  const installedHooks = await hookManager.getInstalledHooks();
  
  console.log(chalk.white('\nGit Hooks:'));
  console.log(`  Installed: ${hooksInstalled ? chalk.green('✓') : chalk.red('✗')}`);
  if (installedHooks.length > 0) {
    console.log(`  Active hooks: ${chalk.white(installedHooks.join(', '))}`);
  }
  
  // API keys status
  console.log(chalk.white('\nAPI Keys:'));
  console.log(`  Gemini: ${config.apiKeys.gemini ? chalk.green('✓ configured') : chalk.red('✗ not configured')}`);
  console.log(`  Jules: ${config.apiKeys.jules ? chalk.green('✓ configured') : chalk.red('✗ not configured')}`);
  
  // Recommendations
  if (config.automation.enabled && !hooksInstalled) {
    console.log(chalk.yellow('\n⚠️ Automation is enabled but git hooks are not installed. Run "base automation enable" to fix this.'));
  }
  
  if (config.automation.autoAnalyze && !config.apiKeys.gemini) {
    console.log(chalk.yellow('⚠️ Auto-analyze is enabled but Gemini API key is not configured.'));
  }
  
  if (config.automation.autoFix && (!config.apiKeys.jules || !config.apiKeys.gemini)) {
    console.log(chalk.yellow('⚠️ Auto-fix is enabled but API keys are not configured.'));
  }
}

/**
 * Configure automation settings
 */
async function configureAutomation(): Promise<void> {
  console.log(chalk.cyan('🤖 Configuring BaseGuard automation...\n'));
  
  const config = await ConfigurationManager.load();
  const hookManager = new GitHookManager();
  
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable automation?',
      default: config.automation.enabled
    },
    {
      type: 'list',
      name: 'trigger',
      message: 'When should BaseGuard check for violations?',
      choices: [
        { name: 'Before each commit (pre-commit)', value: 'pre-commit' },
        { name: 'Before each push (pre-push)', value: 'pre-push' }
      ],
      default: config.automation.trigger,
      when: (answers) => answers.enabled
    },
    {
      type: 'confirm',
      name: 'autoAnalyze',
      message: 'Enable automatic AI analysis of violations?',
      default: config.automation.autoAnalyze,
      when: (answers) => answers.enabled && !!config.apiKeys.gemini
    },
    {
      type: 'confirm',
      name: 'autoFix',
      message: 'Enable automatic AI fixing of violations?',
      default: config.automation.autoFix,
      when: (answers) => answers.enabled && !!config.apiKeys.jules && !!config.apiKeys.gemini
    },
    {
      type: 'confirm',
      name: 'blockCommit',
      message: 'Block commits when violations are found?',
      default: config.automation.blockCommit,
      when: (answers) => answers.enabled
    }
  ]);
  
  // Update configuration
  const oldTrigger = config.automation.trigger;
  
  config.automation.enabled = answers.enabled ?? config.automation.enabled;
  config.automation.trigger = answers.trigger ?? config.automation.trigger;
  config.automation.autoAnalyze = answers.autoAnalyze ?? config.automation.autoAnalyze;
  config.automation.autoFix = answers.autoFix ?? config.automation.autoFix;
  config.automation.blockCommit = answers.blockCommit ?? config.automation.blockCommit;
  
  await ConfigurationManager.save(config);
  
  // Update git hooks if needed
  if (config.automation.enabled) {
    if (oldTrigger !== config.automation.trigger) {
      await hookManager.updateHookConfiguration(oldTrigger, config.automation.trigger);
    } else {
      await hookManager.installHooks(config.automation.trigger);
    }
  } else {
    await hookManager.uninstallHooks();
  }
  
  UIComponents.showSuccessBox('Automation configuration updated');
  
  // Show updated status
  await showAutomationStatus();
}

/**
 * Run automation manually (used by git hooks)
 */
async function runAutomation(options: { trigger?: string; strict?: boolean } = {}): Promise<void> {
  const trigger = options.trigger as 'pre-commit' | 'pre-push' || 'pre-commit';
  
  const automationOptions: AutomationOptions = {
    trigger,
    strict: options.strict
  };
  
  const engine = new AutomationEngine();
  await engine.run(automationOptions);
}

/**
 * Show automation help
 */
async function showAutomationHelp(): Promise<void> {
  console.log(chalk.cyan('🤖 BaseGuard Automation Commands\n'));
  
  console.log(chalk.white('Usage:'));
  console.log('  base automation <command> [options]\n');
  
  console.log(chalk.white('Commands:'));
  console.log('  enable     Enable automation with git hooks');
  console.log('  disable    Disable automation and remove git hooks');
  console.log('  status     Show current automation status');
  console.log('  configure  Interactive configuration of automation settings');
  console.log('  run        Run automation manually (used by git hooks)\n');
  
  console.log(chalk.white('Examples:'));
  console.log('  base automation enable');
  console.log('  base automation enable --trigger pre-push');
  console.log('  base automation disable');
  console.log('  base automation status');
  console.log('  base automation configure');
}