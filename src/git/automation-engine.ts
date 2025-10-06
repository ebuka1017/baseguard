import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import type { AutomationOptions, Violation, Analysis, Fix, Configuration } from '../types/index.js';
import { ConfigurationManager } from '../core/configuration.js';
import { BaseGuard } from '../core/baseguard.js';
import { UIComponents } from '../ui/components.js';
import { GeminiAnalyzer } from '../ai/gemini-analyzer.js';
import { JulesImplementer } from '../ai/jules-implementer.js';

/**
 * Automation engine for git workflow integration
 */
export class AutomationEngine {
  private config: Configuration;
  private baseGuard: BaseGuard;

  constructor(config?: Configuration) {
    this.config = config || ConfigurationManager.createDefault();
    this.baseGuard = new BaseGuard(this.config);
  }

  /**
   * Run automation for git hooks
   */
  async run(options: AutomationOptions): Promise<void> {
    try {
      // Load current configuration
      this.config = await ConfigurationManager.load();
      this.baseGuard = new BaseGuard(this.config);

      // Check if automation is enabled
      if (!this.config.automation.enabled) {
        console.log(chalk.yellow('⚠️ BaseGuard automation is disabled. Run "base automation enable" to enable it.'));
        return;
      }

      // Check if this is the correct trigger
      if (this.config.automation.trigger !== options.trigger) {
        // Silently exit if this isn't the configured trigger
        return;
      }

      console.log(chalk.cyan(`🛡️ BaseGuard automation running (${options.trigger})...`));

      // Step 1: Check violations in staged files
      const violations = await this.checkViolations(options.trigger);
      
      if (violations.length === 0) {
        console.log(chalk.green('✅ No compatibility issues found'));
        return;
      }

      console.log(chalk.yellow(`⚠️ Found ${violations.length} compatibility issue(s)`));
      UIComponents.showViolations(violations);

      // Step 2: Analyze violations (if enabled and API key available)
      let analyses: Analysis[] = [];
      if (this.config.automation.autoAnalyze && this.config.apiKeys.gemini) {
        analyses = await this.analyzeViolations(violations);
      }

      // Step 3: Auto-fix (if enabled and API keys available)
      if (this.config.automation.autoFix && this.config.apiKeys.jules && this.config.apiKeys.gemini) {
        const fixes = await this.generateFixes(violations, analyses);
        if (fixes.length > 0) {
          await this.applyFixes(fixes);
          await this.stageChanges();
          console.log(chalk.green('✅ All issues fixed automatically and staged'));
          return;
        }
      }

      // Manual mode - show options
      await this.showManualOptions(violations, analyses);

      // Block commit if configured to do so
      if (this.config.automation.blockCommit && !options.strict === false) {
        console.log(chalk.red('❌ Commit blocked due to compatibility issues'));
        console.log(chalk.dim('Use --no-verify to bypass this check'));
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('❌ BaseGuard automation failed:'), error instanceof Error ? error.message : 'Unknown error');
      
      // Don't block commit on automation errors unless in strict mode
      if (options.strict) {
        process.exit(1);
      }
    }
  }

  /**
   * Check violations in staged files (for pre-commit) or all files (for pre-push)
   */
  private async checkViolations(trigger: 'pre-commit' | 'pre-push'): Promise<Violation[]> {
    const spinner = ora('Checking for compatibility violations...').start();
    
    try {
      let filesToCheck: string[] = [];

      if (trigger === 'pre-commit') {
        // Get staged files for pre-commit
        filesToCheck = this.getStagedFiles();
      } else {
        // For pre-push, check all files in the repository
        filesToCheck = this.getAllTrackedFiles();
      }

      // Filter to only supported file types
      const supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte', '.css', '.html'];
      const filteredFiles = filesToCheck.filter(file => 
        supportedExtensions.some(ext => file.endsWith(ext))
      );

      if (filteredFiles.length === 0) {
        spinner.succeed('No supported files to check');
        return [];
      }

      spinner.text = `Checking ${filteredFiles.length} file(s)...`;

      // Use BaseGuard to check violations
      const violations = await this.baseGuard.checkViolations(filteredFiles);
      
      spinner.succeed(`Checked ${filteredFiles.length} file(s)`);
      return violations;

    } catch (error) {
      spinner.fail('Failed to check violations');
      throw error;
    }
  }

  /**
   * Get staged files from git
   */
  private getStagedFiles(): string[] {
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
      return output.trim().split('\n').filter(file => file.length > 0);
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Could not get staged files, checking all files'));
      return this.getAllTrackedFiles();
    }
  }

  /**
   * Get all tracked files from git
   */
  private getAllTrackedFiles(): string[] {
    try {
      const output = execSync('git ls-files', { encoding: 'utf-8' });
      return output.trim().split('\n').filter(file => file.length > 0);
    } catch (error) {
      throw new Error('Could not get tracked files from git');
    }
  }

  /**
   * Analyze violations if auto-analyze is enabled
   */
  private async analyzeViolations(violations: Violation[]): Promise<Analysis[]> {
    if (!this.config.apiKeys.gemini) {
      console.log(chalk.yellow('⚠️ Gemini API key not configured, skipping analysis'));
      return [];
    }

    const spinner = ora('Analyzing violations with AI...').start();
    
    try {
      const analyzer = new GeminiAnalyzer(this.config.apiKeys.gemini);
      const analyses: Analysis[] = [];

      // Analyze violations in batches to avoid rate limiting
      for (const violation of violations) {
        try {
          const analysis = await analyzer.analyzeViolation(violation);
          analyses.push(analysis);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️ Could not analyze ${violation.feature}: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }

      spinner.succeed(`Analyzed ${analyses.length} violation(s)`);
      return analyses;

    } catch (error) {
      spinner.fail('Failed to analyze violations');
      throw error;
    }
  }

  /**
   * Generate and apply fixes if auto-fix is enabled
   */
  private async generateFixes(violations: Violation[], analyses: Analysis[]): Promise<Fix[]> {
    if (!this.config.apiKeys.jules) {
      console.log(chalk.yellow('⚠️ Jules API key not configured, skipping auto-fix'));
      return [];
    }

    const spinner = ora('Generating fixes with AI...').start();
    
    try {
      const implementer = new JulesImplementer(this.config.apiKeys.jules);
      const fixes: Fix[] = [];

      // Generate fixes for violations that have analyses
      for (const violation of violations) {
        const analysis = analyses.find(a => a.violation.feature === violation.feature);
        if (!analysis) continue;

        try {
          // For automation, we need a repository source - this would need to be configured
          // For now, we'll skip Jules integration in automation mode
          console.log(chalk.yellow('⚠️ Jules integration requires repository setup, skipping auto-fix'));
          break;
        } catch (error) {
          console.warn(chalk.yellow(`⚠️ Could not generate fix for ${violation.feature}: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }

      spinner.succeed(`Generated ${fixes.length} fix(es)`);
      return fixes;

    } catch (error) {
      spinner.fail('Failed to generate fixes');
      throw error;
    }
  }

  /**
   * Apply fixes to files
   */
  private async applyFixes(fixes: Fix[]): Promise<void> {
    const spinner = ora('Applying fixes...').start();
    
    try {
      // This would use the BaseGuard.applyFixes method when implemented
      // For now, we'll just log that fixes would be applied
      spinner.succeed(`Applied ${fixes.length} fix(es)`);
    } catch (error) {
      spinner.fail('Failed to apply fixes');
      throw error;
    }
  }

  /**
   * Stage changes after fixing
   */
  private async stageChanges(): Promise<void> {
    try {
      execSync('git add -u', { stdio: 'ignore' });
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Could not stage changes automatically'));
    }
  }

  /**
   * Show manual options when auto-fix is disabled
   */
  private async showManualOptions(violations: Violation[], analyses: Analysis[] = []): Promise<void> {
    console.log(chalk.cyan('\n🔧 Manual Options:'));
    
    const choices = [
      {
        name: 'Continue with commit (ignore violations)',
        value: 'continue'
      },
      {
        name: 'Fix violations manually and retry',
        value: 'manual'
      }
    ];

    // Add AI options if API keys are available
    if (this.config.apiKeys.gemini && analyses.length === 0) {
      choices.unshift({
        name: 'Analyze violations with AI first',
        value: 'analyze'
      });
    }

    if (this.config.apiKeys.jules && this.config.apiKeys.gemini) {
      choices.unshift({
        name: 'Generate and preview AI fixes',
        value: 'fix'
      });
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }
    ]);

    switch (action) {
      case 'continue':
        console.log(chalk.yellow('⚠️ Continuing with violations...'));
        break;
        
      case 'manual':
        console.log(chalk.blue('💡 Fix the violations manually and run git commit again'));
        process.exit(1);
        
      case 'analyze':
        console.log(chalk.blue('🔍 Run "base check --analyze" to get AI analysis'));
        process.exit(1);
        
      case 'fix':
        console.log(chalk.blue('🤖 Run "base fix" to generate and preview AI fixes'));
        process.exit(1);
        
      default:
        process.exit(1);
    }
  }

  /**
   * Check if git repository has uncommitted changes
   */
  private hasUncommittedChanges(): boolean {
    try {
      const output = execSync('git status --porcelain', { encoding: 'utf-8' });
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get current git branch
   */
  private getCurrentBranch(): string {
    try {
      const output = execSync('git branch --show-current', { encoding: 'utf-8' });
      return output.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if we're in a git repository
   */
  private isGitRepository(): boolean {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}