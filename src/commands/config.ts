import { UIComponents, Prompts } from '../ui/index.js';
import { ConfigurationManager, ApiKeyManager, GitignoreManager } from '../core/index.js';
import { ConfigurationRecovery } from '../core/configuration-recovery.js';
import { ErrorHandler } from '../core/error-handler.js';
import chalk from 'chalk';

/**
 * Manage BaseGuard configuration
 */
export async function config(action: string, options?: {
  add?: string;
  remove?: string;
  preset?: string;
  file?: string;
  format?: string;
  backup?: boolean;
  interactive?: boolean;
  agent?: string;
  show?: boolean;
}): Promise<void> {
  try {
    switch (action) {
      case 'show':
        await showConfiguration();
        break;
      case 'list':
        await listConfiguration(options?.format);
        break;
      case 'set-keys':
        await setupApiKeys();
        break;
      case 'targets':
        await updateTargets(options);
        break;
      case 'automation':
        await updateAutomation();
        break;
      case 'update':
        await updateConfiguration();
        break;
      case 'validate':
        await validateConfiguration();
        break;
      case 'security':
        await checkSecurity();
        break;
      case 'backup':
        await backupConfiguration();
        break;
      case 'restore':
        await restoreConfiguration(options?.file);
        break;
      case 'recover':
        await recoverConfiguration(options);
        break;
      case 'coding-agent':
        await manageCodingAgent(options);
        break;
      default:
        UIComponents.showErrorBox(`Unknown config action: ${action}`);
        showConfigHelp();
        process.exit(1);
    }
    
  } catch (error) {
    const apiError = ErrorHandler.handleAPIError(error);
    ErrorHandler.displayError(apiError);
    
    // Provide specific help for config command issues
    console.log('\n💡 Configuration help:');
    if (action === 'set-keys') {
      UIComponents.showList([
        'Get Gemini API key from https://aistudio.google.com',
        'Get Jules API key from https://jules.google.com',
        'Ensure API keys are valid and have proper permissions',
        'Check your internet connection for key validation'
      ]);
    } else if (action === 'targets') {
      UIComponents.showList([
        'Use format "browser version" (e.g., "chrome 100")',
        'Available browsers: chrome, safari, firefox, edge',
        'Use "baseline" for Baseline-only support',
        'Check available presets with "base config targets --help"'
      ]);
    } else if (action === 'validate') {
      UIComponents.showList([
        'Check .baseguardrc.json file exists',
        'Verify JSON syntax is correct',
        'Run "base init" to recreate configuration if needed'
      ]);
    } else {
      UIComponents.showList([
        'Run "base config show" to see current configuration',
        'Use "base config --help" to see available commands',
        'Check file permissions in the current directory'
      ]);
    }
    
    process.exit(1);
  }
}

async function showConfiguration(): Promise<void> {
  const display = await ConfigurationManager.getConfigurationDisplay();
  
  UIComponents.showConfiguration(display.config);
  
  // Show security status
  if (!display.security.configIgnored) {
    UIComponents.showWarningBox('Configuration file is not in .gitignore - API keys may be exposed!');
    
    if (display.security.recommendations.length > 0) {
      console.log('\nSecurity recommendations:');
      UIComponents.showList(display.security.recommendations);
    }
  }
  
  // Show validation errors if any
  if (!display.validation.valid) {
    UIComponents.showErrorBox('Configuration validation failed');
    UIComponents.showList(display.validation.errors);
  }
}

async function listConfiguration(format?: string): Promise<void> {
  const display = await ConfigurationManager.getConfigurationDisplay();
  
  if (format === 'json') {
    // Output as JSON for programmatic use
    const output = {
      configuration: display.config,
      security: display.security,
      validation: display.validation,
      status: {
        configured: display.config.apiKeys.jules !== null || display.config.apiKeys.gemini !== null,
        automationEnabled: display.config.automation.enabled,
        targetCount: display.config.targets.length
      }
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  // Default table format
  UIComponents.showSectionHeader('BaseGuard Configuration Summary');
  
  // Configuration overview
  console.log('📋 Configuration:');
  console.log(`  Version: ${display.config.version}`);
  console.log(`  Targets: ${display.config.targets.length} browser(s)`);
  console.log(`  API Keys: ${display.config.apiKeys.jules ? '✓' : '✗'} Jules, ${display.config.apiKeys.gemini ? '✓' : '✗'} Gemini`);
  console.log(`  Automation: ${display.config.automation.enabled ? '✓ enabled' : '✗ disabled'}`);
  
  // Browser targets
  console.log('\n🎯 Browser Targets:');
  display.config.targets.forEach(target => {
    console.log(`  • ${target.browser} ${target.minVersion}`);
  });
  
  // Automation settings
  console.log('\n🤖 Automation Settings:');
  console.log(`  Enabled: ${display.config.automation.enabled ? '✓' : '✗'}`);
  console.log(`  Trigger: ${display.config.automation.trigger}`);
  console.log(`  Auto-analyze: ${display.config.automation.autoAnalyze ? '✓' : '✗'}`);
  console.log(`  Auto-fix: ${display.config.automation.autoFix ? '✓' : '✗'}`);
  console.log(`  Block commits: ${display.config.automation.blockCommit ? '✓' : '✗'}`);
  
  // Security status
  console.log('\n🔒 Security Status:');
  console.log(`  .gitignore exists: ${display.security.gitignoreExists ? '✓' : '✗'}`);
  console.log(`  Config file ignored: ${display.security.configIgnored ? '✓' : '✗'}`);
  
  // Validation status
  console.log('\n✅ Validation Status:');
  console.log(`  Configuration valid: ${display.validation.valid ? '✓' : '✗'}`);
  
  // Show warnings/errors
  if (!display.security.configIgnored) {
    UIComponents.showWarningBox('Configuration file is not in .gitignore - API keys may be exposed!');
  }
  
  if (!display.validation.valid) {
    UIComponents.showErrorBox('Configuration validation failed');
    UIComponents.showList(display.validation.errors);
  }
  
  if (display.security.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    UIComponents.showList(display.security.recommendations);
  }
}

async function setupApiKeys(): Promise<void> {
  const apiKeys = await Prompts.setupApiKeys();
  
  if (apiKeys.julesApiKey || apiKeys.geminiApiKey) {
    await ApiKeyManager.storeApiKeys({
      jules: apiKeys.julesApiKey,
      gemini: apiKeys.geminiApiKey
    });
    
    UIComponents.showSuccessBox('API keys updated successfully');
    
    // Show security reminder
    const security = await GitignoreManager.isConfigSecure();
    if (!security.configIgnored) {
      UIComponents.showWarningBox('Remember to add .baseguardrc.json to .gitignore to protect your API keys');
    }
  } else {
    UIComponents.showInfoBox('No API keys were configured');
  }
}

async function updateTargets(options?: { add?: string; remove?: string; preset?: string }): Promise<void> {
  if (options?.add) {
    // Add a specific browser target
    const target = ConfigurationManager.parseBrowserTarget(options.add);
    if (!target) {
      UIComponents.showErrorBox(`Invalid browser target format: ${options.add}`);
      UIComponents.showInfoBox('Format: "browser version" (e.g., "chrome 100", "safari baseline")');
      return;
    }
    
    await ConfigurationManager.addBrowserTarget(target);
    UIComponents.showSuccessBox(`Added browser target: ${target.browser} ${target.minVersion}`);
    return;
  }
  
  if (options?.remove) {
    // Remove a specific browser target
    await ConfigurationManager.removeBrowserTarget(options.remove);
    UIComponents.showSuccessBox(`Removed browser target: ${options.remove}`);
    return;
  }
  
  if (options?.preset) {
    // Set preset targets
    const presetName = options.preset as any;
    const availablePresets = ConfigurationManager.getAvailablePresets();
    
    if (!availablePresets.includes(presetName)) {
      UIComponents.showErrorBox(`Invalid preset: ${options.preset}`);
      UIComponents.showInfoBox(`Available presets: ${availablePresets.join(', ')}`);
      return;
    }
    
    await ConfigurationManager.updateWithPreset(presetName);
    UIComponents.showSuccessBox(`Updated to ${presetName} preset`);
    UIComponents.showInfoBox(ConfigurationManager.getPresetDescription(presetName));
    return;
  }
  
  // Interactive target configuration
  const targets = await Prompts.promptCustomTargets();
  await ConfigurationManager.updateWithCustomTargets(targets);
  UIComponents.showSuccessBox('Browser targets updated successfully');
}

async function updateAutomation(): Promise<void> {
  const automation = await Prompts.promptAutomationSettings();
  const config = await ConfigurationManager.load();
  config.automation = { ...config.automation, ...automation };
  await ConfigurationManager.save(config);
  UIComponents.showSuccessBox('Automation settings updated successfully');
}

async function updateConfiguration(): Promise<void> {
  const currentConfig = await ConfigurationManager.load();
  const updates = await Prompts.promptConfigUpdate(currentConfig);
  
  if (Object.keys(updates).length === 0) {
    UIComponents.showInfoBox('No changes made');
    return;
  }
  
  let config = currentConfig;
  
  // Apply updates
  for (const [key, value] of Object.entries(updates)) {
    switch (key) {
      case 'targets':
        await ConfigurationManager.updateWithCustomTargets(value as any);
        config = await ConfigurationManager.load(); // Reload after update
        break;
      case 'apiKeys': {
        const apiKeys = value as any;
        if (apiKeys.julesApiKey) config.apiKeys.jules = apiKeys.julesApiKey;
        if (apiKeys.geminiApiKey) config.apiKeys.gemini = apiKeys.geminiApiKey;
        break;
      }
      case 'automation':
        config.automation = { ...config.automation, ...(value as any) };
        break;
    }
  }
  
  await ConfigurationManager.save(config);
  UIComponents.showSuccessBox('Configuration updated successfully');
}

async function validateConfiguration(): Promise<void> {
  const display = await ConfigurationManager.getConfigurationDisplay();
  
  if (display.validation.valid) {
    UIComponents.showSuccessBox('Configuration is valid');
  } else {
    UIComponents.showErrorBox('Configuration validation failed');
    UIComponents.showList(display.validation.errors);
    process.exit(1);
  }
}

async function checkSecurity(): Promise<void> {
  const security = await GitignoreManager.isConfigSecure();
  
  UIComponents.showSectionHeader('Security Status');
  
  console.log(`✓ .gitignore exists: ${security.gitignoreExists ? 'Yes' : 'No'}`);
  console.log(`✓ Config file ignored: ${security.configIgnored ? 'Yes' : 'No'}`);
  
  if (security.recommendations.length > 0) {
    console.log('\nRecommendations:');
    UIComponents.showList(security.recommendations);
  } else {
    UIComponents.showSuccessBox('Configuration is secure');
  }
}

async function backupConfiguration(): Promise<void> {
  try {
    const backupFile = await ConfigurationManager.backupConfiguration();
    UIComponents.showSuccessBox(`Configuration backed up to: ${backupFile}`);
  } catch (error) {
    UIComponents.showErrorBox(`Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function restoreConfiguration(backupFile?: string): Promise<void> {
  if (!backupFile) {
    UIComponents.showErrorBox('Backup file path is required');
    console.log('Usage: base config restore --file <backup-file>');
    process.exit(1);
  }
  
  try {
    await ConfigurationManager.restoreConfiguration(backupFile);
    UIComponents.showSuccessBox('Configuration restored successfully');
  } catch (error) {
    UIComponents.showErrorBox(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function recoverConfiguration(options?: { backup?: boolean; interactive?: boolean }): Promise<void> {
  try {
    console.log(chalk.cyan('🔧 BaseGuard Configuration Recovery\n'));
    
    if (options?.interactive) {
      // Run interactive recovery wizard
      await ConfigurationRecovery.runRecoveryWizard();
      return;
    }
    
    // Automatic recovery
    console.log(chalk.cyan('Attempting automatic configuration recovery...'));
    
    const recoveryResult = await ConfigurationRecovery.recoverConfiguration({
      createBackup: options?.backup ?? true,
      validateConfig: true,
      migrateVersion: true,
      repairCorruption: true,
      useDefaults: true
    });
    
    if (recoveryResult.success) {
      UIComponents.showSuccessBox('Configuration recovered successfully');
      
      if (recoveryResult.backupCreated) {
        console.log(chalk.dim(`Backup created: ${recoveryResult.backupCreated}`));
      }
      
      if (recoveryResult.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠️ Recovery warnings:'));
        recoveryResult.warnings.forEach(warning => {
          console.log(chalk.yellow(`   • ${warning}`));
        });
      }
      
      // Show recovered configuration
      console.log(chalk.cyan('\n📋 Recovered Configuration:'));
      if (recoveryResult.config) {
        console.log(`   Version: ${recoveryResult.config.version}`);
        console.log(`   Targets: ${recoveryResult.config.targets.length} browser(s)`);
        console.log(`   API Keys: Jules ${recoveryResult.config.apiKeys.jules ? '✓' : '✗'}, Gemini ${recoveryResult.config.apiKeys.gemini ? '✓' : '✗'}`);
        console.log(`   Automation: ${recoveryResult.config.automation.enabled ? 'Enabled' : 'Disabled'}`);
      }
      
    } else {
      UIComponents.showErrorBox('Configuration recovery failed');
      
      console.log(chalk.red('\n❌ Recovery errors:'));
      recoveryResult.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
      
      console.log(chalk.cyan('\n💡 Manual recovery options:'));
      console.log(chalk.cyan('   • Run "base config recover --interactive" for guided recovery'));
      console.log(chalk.cyan('   • Run "base init" to create a fresh configuration'));
      console.log(chalk.cyan('   • Manually edit .baseguardrc.json file'));
      console.log(chalk.cyan('   • Restore from backup if available'));
      
      // Show available backups
      const backups = await ConfigurationRecovery.listBackups();
      if (backups.length > 0) {
        console.log(chalk.cyan('\n📦 Available backups:'));
        backups.slice(0, 3).forEach(backup => {
          console.log(chalk.cyan(`   • ${backup.timestamp.toLocaleString()} (${backup.source})`));
        });
        console.log(chalk.cyan('\n   Use "base config restore --file <backup-file>" to restore'));
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    UIComponents.showErrorBox(`Recovery process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    console.log(chalk.cyan('\n🆘 Emergency recovery options:'));
    console.log(chalk.cyan('   • Delete .baseguardrc.json and run "base init"'));
    console.log(chalk.cyan('   • Check file permissions in your project directory'));
    console.log(chalk.cyan('   • Run "base diagnostics" for comprehensive troubleshooting'));
    
    process.exit(1);
  }
}

function showConfigHelp(): void {
  UIComponents.showSectionHeader('Configuration Commands');
  UIComponents.showList([
    'base config show - Display current configuration',
    'base config list - List configuration summary',
    'base config list --format json - List configuration as JSON',
    'base config set-keys - Set up API keys for AI services',
    'base config targets - Configure browser targets',
    'base config targets --add "chrome 100" - Add browser target',
    'base config targets --remove chrome - Remove browser target',
    'base config targets --preset baseline-widely - Set preset targets',
    'base config automation - Configure git automation',
    'base config update - Interactive configuration update',
    'base config validate - Validate configuration file',
    'base config security - Check configuration security',
    'base config backup - Create configuration backup',
    'base config restore --file <backup> - Restore from backup',
    'base config recover - Attempt automatic configuration recovery',
    'base config recover --interactive - Run interactive recovery wizard',
    'base config coding-agent - Manage coding agent selection (Jules vs Gemini)',
    'base config coding-agent --show - Show current agent configuration',
    'base config coding-agent --agent gemini - Set Gemini as primary agent',
    '',
    'Shorthand commands:',
    'base add "chrome 100" - Add browser target',
    'base remove chrome - Remove browser target',
    'base list - List configuration summary'
  ]);
}

async function manageCodingAgent(options?: { agent?: string; show?: boolean }): Promise<void> {
  try {
    const config = await ConfigurationManager.load();
    
    if (options?.show) {
      // Show current coding agent configuration
      console.log(chalk.cyan('🤖 Coding Agent Configuration\n'));
      console.log(`Primary Agent: ${chalk.white(config.codingAgent.primary)}`);
      console.log(`Fallback Agent: ${chalk.white(config.codingAgent.fallback)}`);
      
      // Show agent status
      const { UnifiedCodeFixer } = await import('../ai/unified-code-fixer.js');
      const unifiedFixer = new UnifiedCodeFixer(config);
      const status = await unifiedFixer.getAgentStatus();
      
      console.log(chalk.cyan('\n📊 Agent Status:'));
      console.log(`Jules: ${status.jules.configured ? '🔑' : '❌'} configured, ${status.jules.available ? '✅' : '❌'} available`);
      if (status.jules.repoDetected !== undefined) {
        console.log(`       ${status.jules.repoDetected ? '✅' : '❌'} GitHub repository detected`);
      }
      console.log(`Gemini: ${status.gemini.configured ? '🔑' : '❌'} configured, ${status.gemini.available ? '✅' : '❌'} available`);
      
      // Show comparison
      unifiedFixer.showAgentComparison();
      return;
    }
    
    if (options?.agent) {
      // Set specific agent
      const agent = options.agent.toLowerCase();
      if (agent !== 'jules' && agent !== 'gemini') {
        UIComponents.showErrorBox('Invalid agent. Use "jules" or "gemini"');
        return;
      }
      
      config.codingAgent.primary = agent as 'jules' | 'gemini';
      await ConfigurationManager.save(config);
      
      console.log(chalk.green(`✅ Primary coding agent set to ${agent}`));
      
      // Show setup instructions if API key is missing
      if (agent === 'jules' && !config.apiKeys.jules) {
        console.log(chalk.yellow('\n⚠️ Jules API key not configured'));
        console.log(chalk.cyan('Get your Jules API key: https://jules.google.com/settings#api'));
        console.log(chalk.cyan('Run "base config set-keys" to configure it'));
      } else if (agent === 'gemini' && !config.apiKeys.gemini) {
        console.log(chalk.yellow('\n⚠️ Gemini API key not configured'));
        console.log(chalk.cyan('Get your Gemini API key: https://aistudio.google.com'));
        console.log(chalk.cyan('Run "base config set-keys" to configure it'));
      }
      
      return;
    }
    
    // Interactive agent selection
    const { UnifiedCodeFixer } = await import('../ai/unified-code-fixer.js');
    const unifiedFixer = new UnifiedCodeFixer(config);
    
    // Show current status
    console.log(chalk.cyan('🤖 Current Coding Agent Configuration\n'));
    console.log(`Primary: ${config.codingAgent.primary}`);
    console.log(`Fallback: ${config.codingAgent.fallback}`);
    
    // Get recommendation
    const recommendation = await unifiedFixer.getRecommendedAgent();
    console.log(chalk.cyan(`\n💡 Recommended: ${recommendation.agent}`));
    console.log(chalk.dim(`   Reason: ${recommendation.reason}`));
    
    // Interactive selection
    const { default: inquirer } = await import('inquirer');
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'primary',
        message: 'Select primary coding agent:',
        choices: [
          { name: 'Gemini 2.5 Pro (works with any files, immediate)', value: 'gemini' },
          { name: 'Jules (GitHub repos only, autonomous)', value: 'jules' }
        ],
        default: recommendation.agent
      },
      {
        type: 'list',
        name: 'fallback',
        message: 'Select fallback coding agent:',
        choices: [
          { name: 'Gemini 2.5 Pro', value: 'gemini' },
          { name: 'Jules', value: 'jules' }
        ],
        default: 'gemini'
      }
    ]);
    
    config.codingAgent.primary = answers.primary;
    config.codingAgent.fallback = answers.fallback;
    
    await ConfigurationManager.save(config);
    
    console.log(chalk.green('\n✅ Coding agent configuration updated'));
    console.log(`Primary: ${answers.primary}`);
    console.log(`Fallback: ${answers.fallback}`);
    
    // Show next steps
    console.log(chalk.cyan('\n🔧 Next Steps:'));
    if (!config.apiKeys[answers.primary as keyof typeof config.apiKeys]) {
      console.log(chalk.cyan(`• Configure ${answers.primary} API key: "base config set-keys"`));
    }
    if (answers.primary !== answers.fallback && !config.apiKeys[answers.fallback as keyof typeof config.apiKeys]) {
      console.log(chalk.cyan(`• Configure ${answers.fallback} API key for fallback: "base config set-keys"`));
    }
    console.log(chalk.cyan('• Test with: "base fix --analyze-only"'));
    
  } catch (error) {
    UIComponents.showErrorBox(`Failed to manage coding agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}
