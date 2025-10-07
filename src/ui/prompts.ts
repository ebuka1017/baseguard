import inquirer from 'inquirer';
import open from 'open';
import chalk from 'chalk';
import { Colors, UIComponents } from './components.js';
import { ApiKeyManager } from '../core/api-key-manager.js';
import type { BrowserTarget } from '../types/index.js';

/**
 * Interactive prompts for user input
 */
export class Prompts {
  /**
   * Prompt for initial BaseGuard setup
   */
  static async setupWizard(): Promise<{
    targets: BrowserTarget[];
    installHooks: boolean;
    hookTrigger: 'pre-commit' | 'pre-push';
    setupApiKeys: boolean;
  }> {
    UIComponents.showHeader();
    UIComponents.showSectionHeader('Welcome to BaseGuard Setup');
    
    console.log(Colors.muted('Let\'s configure BaseGuard for your project.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'targetPreset',
        message: 'Which browser compatibility target would you like to use?',
        choices: [
          {
            name: 'Baseline Widely (30+ months of support) - Recommended',
            value: 'baseline-widely'
          },
          {
            name: 'Baseline Newly (Recently available features)',
            value: 'baseline-newly'
          },
          {
            name: 'Last 2 years (Modern browsers)',
            value: 'last-2-years'
          },
          {
            name: 'Custom configuration',
            value: 'custom'
          }
        ],
        default: 'baseline-widely'
      },
      {
        type: 'confirm',
        name: 'installHooks',
        message: 'Would you like to install git hooks for automatic checking?',
        default: true
      },
      {
        type: 'list',
        name: 'hookTrigger',
        message: 'When should BaseGuard check your code?',
        choices: [
          {
            name: 'Before each commit (pre-commit) - Recommended',
            value: 'pre-commit'
          },
          {
            name: 'Before each push (pre-push)',
            value: 'pre-push'
          }
        ],
        default: 'pre-commit',
        when: (answers) => answers.installHooks
      },
      {
        type: 'confirm',
        name: 'setupApiKeys',
        message: 'Would you like to set up AI analysis and fixing now?',
        default: true
      }
    ]);

    let targets: BrowserTarget[] = [];
    
    if (answers.targetPreset === 'custom') {
      targets = await this.promptCustomTargets();
    } else {
      targets = this.getPresetTargets(answers.targetPreset);
    }

    return {
      targets,
      installHooks: answers.installHooks,
      hookTrigger: answers.hookTrigger || 'pre-commit',
      setupApiKeys: answers.setupApiKeys
    };
  }

  /**
   * Prompt for custom browser targets
   */
  static async promptCustomTargets(): Promise<BrowserTarget[]> {
    const targets: BrowserTarget[] = [];
    let addMore = true;

    while (addMore) {
      const target = await inquirer.prompt([
        {
          type: 'list',
          name: 'browser',
          message: 'Select a browser:',
          choices: [
            'chrome',
            'firefox', 
            'safari',
            'edge',
            'opera',
            'samsung_android',
            'webview_android'
          ]
        },
        {
          type: 'input',
          name: 'version',
          message: 'Minimum version (or "baseline" for baseline support):',
          default: 'baseline',
          validate: (input: string) => {
            if (input === 'baseline' || input === 'baseline-newly') return true;
            if (/^\d+(\.\d+)*$/.test(input)) return true;
            return 'Please enter a valid version number or "baseline"';
          }
        }
      ]);

      targets.push({
        browser: target.browser,
        minVersion: target.version
      });

      const continuePrompt = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addAnother',
          message: 'Add another browser target?',
          default: false
        }
      ]);

      addMore = continuePrompt.addAnother;
    }

    return targets;
  }

  /**
   * Get preset browser targets
   */
  private static getPresetTargets(preset: string): BrowserTarget[] {
    switch (preset) {
      case 'baseline-widely':
        return [
          { browser: 'chrome', minVersion: 'baseline' },
          { browser: 'firefox', minVersion: 'baseline' },
          { browser: 'safari', minVersion: 'baseline' },
          { browser: 'edge', minVersion: 'baseline' }
        ];
      case 'baseline-newly':
        return [
          { browser: 'chrome', minVersion: 'baseline-newly' },
          { browser: 'firefox', minVersion: 'baseline-newly' },
          { browser: 'safari', minVersion: 'baseline-newly' },
          { browser: 'edge', minVersion: 'baseline-newly' }
        ];
      case 'last-2-years':
        return [
          { browser: 'chrome', minVersion: '109' },
          { browser: 'firefox', minVersion: '109' },
          { browser: 'safari', minVersion: '16' },
          { browser: 'edge', minVersion: '109' }
        ];
      default:
        return [];
    }
  }

  /**
   * Guided API key setup with browser integration
   */
  static async setupApiKeys(): Promise<{
    julesApiKey?: string;
    geminiApiKey?: string;
  }> {
    UIComponents.showSectionHeader('API Key Setup');
    
    console.log(Colors.muted('BaseGuard uses AI services for analysis and fixing:'));
    console.log(Colors.muted('• Jules API for autonomous code fixing'));
    console.log(Colors.muted('• Gemini API for compatibility analysis\n'));

    const setupChoice = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'How would you like to proceed?',
        choices: [
          {
            name: 'Set up both APIs now (Recommended)',
            value: 'both'
          },
          {
            name: 'Set up Jules API only (for fixing)',
            value: 'jules'
          },
          {
            name: 'Set up Gemini API only (for analysis)',
            value: 'gemini'
          },
          {
            name: 'Skip for now (baseline checking only)',
            value: 'skip'
          }
        ],
        default: 'both'
      }
    ]);

    if (setupChoice.choice === 'skip') {
      UIComponents.showWarningBox('Skipping API setup. You can configure APIs later with: base config api-keys');
      return {};
    }

    const result: { julesApiKey?: string; geminiApiKey?: string } = {};

    if (setupChoice.choice === 'both' || setupChoice.choice === 'jules') {
      result.julesApiKey = await this.setupJulesApiKey();
    }

    if (setupChoice.choice === 'both' || setupChoice.choice === 'gemini') {
      result.geminiApiKey = await this.setupGeminiApiKey();
    }

    return result;
  }

  /**
   * Set up Jules API key with browser integration
   */
  static async setupJulesApiKey(): Promise<string | undefined> {
    console.log(Colors.info('\n🔧 Setting up Jules API for autonomous code fixing'));
    
    const openBrowser = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'open',
        message: 'Open jules.google.com to get your API key?',
        default: true
      }
    ]);

    if (openBrowser.open) {
      const spinner = UIComponents.createSpinner('Opening Jules website...');
      spinner.start();
      
      try {
        await open('https://jules.google.com');
        spinner.succeed('Opened jules.google.com');
      } catch (error) {
        spinner.fail('Failed to open browser. Please visit https://jules.google.com manually');
      }
    }

    console.log(Colors.muted('\nSteps to get your Jules API key:'));
    UIComponents.showList([
      'Sign in to jules.google.com',
      'Navigate to API settings or developer console',
      'Generate a new API key',
      'Copy the key and paste it below'
    ]);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const keyPrompt = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter your Jules API key:',
          mask: '*',
          validate: (input: string) => {
            const validation = ApiKeyManager.validateJulesApiKey(input);
            return validation.valid || validation.error!;
          }
        }
      ]);

      // Test the API key
      const spinner = UIComponents.createSpinner('Testing Jules API key...');
      spinner.start();
      
      const testResult = await ApiKeyManager.testJulesApiKey(keyPrompt.apiKey);
      
      if (testResult.success) {
        spinner.succeed('Jules API key validated successfully');
        
        // Note: GitHub integration should be set up on the Jules dashboard
        console.log(chalk.cyan('💡 Note: GitHub integration should be configured on the Jules dashboard.'));
        
        return keyPrompt.apiKey;
      } else {
        spinner.fail(`Failed to validate Jules API key: ${testResult.error}`);
        attempts++;
        
        if (attempts < maxAttempts) {
          const retry = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'retry',
              message: `Would you like to try again? (${maxAttempts - attempts} attempts remaining)`,
              default: true
            }
          ]);

          if (!retry.retry) {
            break;
          }
        }
      }
    }

    UIComponents.showWarningBox('Jules API key setup incomplete. You can configure it later with: base config api-keys');
    return undefined;
  }



  /**
   * Set up Gemini API key with browser integration
   */
  static async setupGeminiApiKey(): Promise<string | undefined> {
    console.log(Colors.info('\n🧠 Setting up Gemini API for compatibility analysis'));
    
    const openBrowser = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'open',
        message: 'Open aistudio.google.com to get your API key?',
        default: true
      }
    ]);

    if (openBrowser.open) {
      const spinner = UIComponents.createSpinner('Opening AI Studio...');
      spinner.start();
      
      try {
        await open('https://aistudio.google.com/app/apikey');
        spinner.succeed('Opened AI Studio');
      } catch (error) {
        spinner.fail('Failed to open browser. Please visit https://aistudio.google.com/app/apikey manually');
      }
    }

    console.log(Colors.muted('\nSteps to get your Gemini API key:'));
    UIComponents.showList([
      'Sign in to aistudio.google.com',
      'Click "Get API key" or "Create API key"',
      'Copy the generated key',
      'Paste it below'
    ]);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const keyPrompt = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter your Gemini API key:',
          mask: '*',
          validate: (input: string) => {
            const validation = ApiKeyManager.validateGeminiApiKey(input);
            return validation.valid || validation.error!;
          }
        }
      ]);

      // Test the API key
      const spinner = UIComponents.createSpinner('Testing Gemini API key...');
      spinner.start();
      
      const testResult = await ApiKeyManager.testGeminiApiKey(keyPrompt.apiKey);
      
      if (testResult.success) {
        spinner.succeed('Gemini API key validated successfully');
        return keyPrompt.apiKey;
      } else {
        spinner.fail(`Failed to validate Gemini API key: ${testResult.error}`);
        attempts++;
        
        if (attempts < maxAttempts) {
          const retry = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'retry',
              message: `Would you like to try again? (${maxAttempts - attempts} attempts remaining)`,
              default: true
            }
          ]);

          if (!retry.retry) {
            break;
          }
        }
      }
    }

    UIComponents.showWarningBox('Gemini API key setup incomplete. You can configure it later with: base config api-keys');
    return undefined;
  }

  /**
   * Prompt for fix approval with preview
   */
  static async confirmFix(fixPreview: string, fileName: string): Promise<boolean> {
    console.log(Colors.highlight(`\n📝 Proposed fix for ${fileName}:`));
    console.log(Colors.muted('─'.repeat(50)));
    console.log(fixPreview);
    console.log(Colors.muted('─'.repeat(50)));

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          {
            name: '✅ Apply this fix',
            value: 'apply'
          },
          {
            name: '❌ Skip this fix',
            value: 'skip'
          },
          {
            name: '👀 Show more details',
            value: 'details'
          }
        ],
        default: 'apply'
      }
    ]);

    if (answer.action === 'details') {
      // Show more details and ask again
      console.log(Colors.info('\nFix details:'));
      UIComponents.showList([
        'This fix adds progressive enhancement',
        'Original functionality is preserved',
        'Fallbacks are added for older browsers',
        'Code follows best practices'
      ]);
      
      return this.confirmFix(fixPreview, fileName);
    }

    return answer.action === 'apply';
  }

  /**
   * Show progress for batch operations
   */
  static async showBatchProgress<T>(
    items: T[],
    operation: (item: T, index: number) => Promise<void>,
    operationName: string
  ): Promise<void> {
    console.log(Colors.primary(`\n${operationName}...`));
    
    for (let i = 0; i < items.length; i++) {
      UIComponents.showProgress(i, items.length, `Processing ${i + 1}/${items.length}`);
      await operation(items[i]!, i);
    }
    
    UIComponents.showProgress(items.length, items.length, 'Complete');
  }

  /**
   * Handle graceful error display with next steps
   */
  static async handleError(error: Error, context: string): Promise<void> {
    UIComponents.showErrorBox(`${context}: ${error.message}`);
    
    console.log(Colors.muted('\nPossible solutions:'));
    
    if (error.message.includes('API key')) {
      UIComponents.showList([
        'Check your API key configuration: base config show',
        'Reconfigure API keys: base config api-keys',
        'Verify API key permissions and quotas'
      ]);
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      UIComponents.showList([
        'Check your internet connection',
        'Verify firewall settings',
        'Try again in a few moments'
      ]);
    } else if (error.message.includes('file') || error.message.includes('permission')) {
      UIComponents.showList([
        'Check file permissions',
        'Ensure the file exists and is readable',
        'Try running with appropriate permissions'
      ]);
    } else {
      UIComponents.showList([
        'Check the BaseGuard documentation',
        'Report this issue on GitHub',
        'Try running with --verbose for more details'
      ]);
    }

    const continuePrompt = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to continue anyway?',
        default: false
      }
    ]);

    if (!continuePrompt.continue) {
      process.exit(1);
    }
  }

  /**
   * Prompt for configuration updates
   */
  static async promptConfigUpdate(currentConfig: any): Promise<any> {
    UIComponents.showSectionHeader('Update Configuration');
    
    const choices = [
      {
        name: 'Browser targets',
        value: 'targets'
      },
      {
        name: 'API keys',
        value: 'apiKeys'
      },
      {
        name: 'Git automation settings',
        value: 'automation'
      },
      {
        name: 'View current configuration',
        value: 'view'
      }
    ];

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'section',
        message: 'What would you like to update?',
        choices
      }
    ]);

    switch (answer.section) {
      case 'targets':
        return { targets: await this.promptCustomTargets() };
      case 'apiKeys':
        return { apiKeys: await this.setupApiKeys() };
      case 'automation':
        return { automation: await this.promptAutomationSettings() };
      case 'view':
        console.log(Colors.info('\nCurrent configuration:'));
        console.log(JSON.stringify(currentConfig, null, 2));
        return {};
      default:
        return {};
    }
  }

  /**
   * Prompt for automation settings
   */
  static async promptAutomationSettings(): Promise<any> {
    return await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enabled',
        message: 'Enable git automation?',
        default: true
      },
      {
        type: 'list',
        name: 'trigger',
        message: 'When should BaseGuard run?',
        choices: [
          { name: 'Before each commit (pre-commit)', value: 'pre-commit' },
          { name: 'Before each push (pre-push)', value: 'pre-push' }
        ],
        default: 'pre-commit',
        when: (answers) => answers.enabled
      },
      {
        type: 'confirm',
        name: 'autoAnalyze',
        message: 'Automatically analyze violations with AI?',
        default: true,
        when: (answers) => answers.enabled
      },
      {
        type: 'confirm',
        name: 'autoFix',
        message: 'Automatically fix violations when possible?',
        default: false,
        when: (answers) => answers.enabled
      },
      {
        type: 'confirm',
        name: 'blockCommit',
        message: 'Block commits when violations are found?',
        default: true,
        when: (answers) => answers.enabled
      }
    ]);
  }

  /**
   * Choose coding agent for fixing
   */
  static async chooseCodingAgent(): Promise<{ primary: 'jules' | 'gemini'; fallback: 'jules' | 'gemini' }> {
    console.log(chalk.cyan('\n🤖 Coding Agent Selection'));
    console.log(chalk.dim('Choose which AI agent to use for code fixing:\n'));
    
    console.log(chalk.white('Jules (Google\'s Autonomous Coding Agent):'));
    console.log(chalk.green('  ✅ Autonomous operation in cloud VMs'));
    console.log(chalk.green('  ✅ Full repository context understanding'));
    console.log(chalk.green('  ✅ Asynchronous processing'));
    console.log(chalk.red('  ❌ Requires GitHub repository'));
    console.log(chalk.red('  ❌ Cannot work with local/uncommitted files'));
    
    console.log(chalk.white('\nGemini 2.5 Pro (Direct API Integration):'));
    console.log(chalk.green('  ✅ Works with any files (GitHub or not)'));
    console.log(chalk.green('  ✅ Immediate processing'));
    console.log(chalk.green('  ✅ Works with uncommitted/local files'));
    console.log(chalk.green('  ✅ Grounded with real-time web search'));
    console.log(chalk.yellow('  ⚠️ Requires manual code application'));
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'primary',
        message: 'Select primary coding agent:',
        choices: [
          { name: 'Gemini 2.5 Pro (recommended for most projects)', value: 'gemini' },
          { name: 'Jules (for GitHub repositories with autonomous needs)', value: 'jules' }
        ],
        default: 'gemini'
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
    
    console.log(chalk.green(`\n✅ Coding agents configured:`));
    console.log(`   Primary: ${answers.primary}`);
    console.log(`   Fallback: ${answers.fallback}`);
    
    return answers;
  }
}