import { UIComponents, Prompts } from '../ui/index.js';
import { ConfigurationManager, BROWSER_TARGET_PRESETS, type PresetName } from '../core/index.js';
import { ErrorHandler } from '../core/error-handler.js';

/**
 * Initialize BaseGuard in a project
 */
export async function init(options: {
  preset?: string;
  skipHooks?: boolean;
  skipApiKeys?: boolean;
}): Promise<void> {
  try {
    UIComponents.showHeader();
    
    // Check if already initialized
    const configExists = await ConfigurationManager.exists();
    if (configExists) {
      const { default: inquirer } = await import('inquirer');
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'BaseGuard is already initialized. Overwrite existing configuration?',
          default: false
        }
      ]);
      
      if (!overwrite) {
        UIComponents.showInfoBox('Initialization cancelled. Use "base config" to modify settings.');
        return;
      }
    }
    
    const spinner = UIComponents.createSpinner('Setting up BaseGuard configuration...');
    spinner.start();
    
    // Create configuration based on options or run setup wizard
    let config;
    
    if (options.preset && options.preset !== 'custom') {
      // Use preset configuration
      const presetName = options.preset as PresetName;
      if (BROWSER_TARGET_PRESETS[presetName]) {
        config = ConfigurationManager.createWithPreset(presetName);
        spinner.text = `Using ${presetName} preset...`;
      } else {
        spinner.fail(`Invalid preset: ${options.preset}`);
        UIComponents.showErrorBox(`Available presets: ${Object.keys(BROWSER_TARGET_PRESETS).join(', ')}`);
        return;
      }
    } else {
      // Run interactive setup wizard
      spinner.stop();
      const setupResult = await Prompts.setupWizard();
      spinner.start();
      
      config = ConfigurationManager.createWithCustomTargets(setupResult.targets);
      
      // Set up automation if requested and not skipped
      if (setupResult.installHooks && !options.skipHooks) {
        config.automation = {
          enabled: true,
          trigger: setupResult.hookTrigger,
          autoAnalyze: true,
          autoFix: false,
          blockCommit: true
        };
      }
    }
    
    // Set up API keys and coding agent if not skipped
    if (!options.skipApiKeys) {
      spinner.stop();
      const apiKeys = await Prompts.setupApiKeys();
      
      if (apiKeys.julesApiKey) {
        config.apiKeys.jules = apiKeys.julesApiKey;
      }
      if (apiKeys.geminiApiKey) {
        config.apiKeys.gemini = apiKeys.geminiApiKey;
      }
      
      // Configure coding agent based on available keys
      if (apiKeys.julesApiKey && apiKeys.geminiApiKey) {
        const codingAgentChoice = await Prompts.chooseCodingAgent();
        config.codingAgent.primary = codingAgentChoice.primary;
        config.codingAgent.fallback = codingAgentChoice.fallback;
      } else if (apiKeys.julesApiKey) {
        config.codingAgent.primary = 'jules';
        config.codingAgent.fallback = 'jules';
      } else if (apiKeys.geminiApiKey) {
        config.codingAgent.primary = 'gemini';
        config.codingAgent.fallback = 'gemini';
      }
      
      spinner.start();
    }
    
    await ConfigurationManager.save(config);
    spinner.succeed('BaseGuard configuration created');
    
    UIComponents.showSuccessBox('BaseGuard has been successfully initialized!');
    
    // Show configuration summary
    console.log('\n📋 Configuration Summary:');
    UIComponents.showList([
      `Browser targets: ${config.targets.map(t => `${t.browser} ${t.minVersion}`).join(', ')}`,
      `API keys: ${config.apiKeys.jules ? '✅' : '❌'} Jules, ${config.apiKeys.gemini ? '✅' : '❌'} Gemini`,
      `Automation: ${config.automation.enabled ? '✅ Enabled' : '❌ Disabled'}`
    ]);
    
    console.log('\n🚀 Next steps:');
    const nextSteps = ['Run `base check` to scan for compatibility issues'];
    
    if (config.apiKeys.jules && config.apiKeys.gemini) {
      nextSteps.push('Run `base fix` to automatically fix issues with AI');
    } else {
      nextSteps.push('Run `base config set-keys` to configure AI services');
    }
    
    if (!config.automation.enabled) {
      nextSteps.push('Run `base automation enable` to set up git hooks');
    }
    
    UIComponents.showList(nextSteps);
    
  } catch (error) {
    const apiError = ErrorHandler.handleAPIError(error);
    ErrorHandler.displayError(apiError);
    
    // Provide specific help for common init issues
    console.log('\n💡 Common solutions:');
    if (apiError.type === 'network') {
      UIComponents.showList([
        'Check your internet connection',
        'Try running init again with --skip-api-keys to set up offline',
        'Configure API keys later with "base config set-keys"'
      ]);
    } else if (apiError.type === 'configuration') {
      UIComponents.showList([
        'Delete .baseguardrc.json and try again',
        'Check file permissions in the current directory',
        'Run "base config validate" to check for issues'
      ]);
    } else {
      UIComponents.showList([
        'Try running "base init --skip-api-keys" for offline setup',
        'Check the documentation at https://github.com/baseguard/baseguard#readme',
        'Report this issue if it persists'
      ]);
    }
    
    process.exit(1);
  }
}