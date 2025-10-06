import { UIComponents, Prompts } from '../ui/index.js';
import { ConfigurationManager, ApiKeyManager, GitignoreManager } from '../core/index.js';
import { ErrorHandler } from '../core/error-handler.js';

/**
 * Manage BaseGuard configuration
 */
export async function config(action: string, options?: {
  add?: string;
  remove?: string;
  preset?: string;
  file?: string;
  format?: string;
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
      case 'apiKeys':
        const apiKeys = value as any;
        if (apiKeys.julesApiKey) config.apiKeys.jules = apiKeys.julesApiKey;
        if (apiKeys.geminiApiKey) config.apiKeys.gemini = apiKeys.geminiApiKey;
        break;
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
    '',
    'Shorthand commands:',
    'base add "chrome 100" - Add browser target',
    'base remove chrome - Remove browser target',
    'base list - List configuration summary'
  ]);
}