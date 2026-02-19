import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

/**
 * Git hook installation and management using husky
 */
export class GitHookManager {
  private huskyDir = '.husky';
  
  /**
   * Install git hooks for BaseGuard automation
   */
  async installHooks(trigger: 'pre-commit' | 'pre-push'): Promise<void> {
    try {
      // Ensure we're in a git repository
      await this.ensureGitRepository();
      
      // Ensure husky is installed and configured
      await this.ensureHuskyInstalled();
      
      // Create the hook script
      await this.createHookScript(trigger);
      
      console.log(chalk.green(`✅ ${trigger} hook installed successfully`));
    } catch (error) {
      throw new Error(`Failed to install ${trigger} hook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Uninstall git hooks
   */
  async uninstallHooks(): Promise<void> {
    try {
      const hooks = ['pre-commit', 'pre-push'];
      
      for (const hook of hooks) {
        const hookPath = join(this.huskyDir, hook);
        if (existsSync(hookPath)) {
          unlinkSync(hookPath);
          console.log(chalk.yellow(`🗑️ Removed ${hook} hook`));
        }
      }
      
      // If no hooks remain, we could optionally remove husky entirely
      // but we'll leave it in case user has other hooks
      console.log(chalk.green('✅ BaseGuard hooks uninstalled'));
    } catch (error) {
      throw new Error(`Failed to uninstall hooks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if hooks are installed
   */
  async areHooksInstalled(): Promise<boolean> {
    const preCommitPath = join(this.huskyDir, 'pre-commit');
    const prePushPath = join(this.huskyDir, 'pre-push');
    
    // Check if either hook exists and contains BaseGuard automation
    const checkHook = (path: string): boolean => {
      if (!existsSync(path)) return false;
      
      try {
        const content = readFileSync(path, 'utf-8');
        return content.includes('base automation run');
      } catch {
        return false;
      }
    };
    
    return checkHook(preCommitPath) || checkHook(prePushPath);
  }

  /**
   * Get currently installed hook types
   */
  async getInstalledHooks(): Promise<('pre-commit' | 'pre-push')[]> {
    const hooks: ('pre-commit' | 'pre-push')[] = [];
    
    const checkHook = (hookType: 'pre-commit' | 'pre-push'): boolean => {
      const hookPath = join(this.huskyDir, hookType);
      if (!existsSync(hookPath)) return false;
      
      try {
        const content = readFileSync(hookPath, 'utf-8');
        return content.includes('base automation run');
      } catch {
        return false;
      }
    };
    
    if (checkHook('pre-commit')) hooks.push('pre-commit');
    if (checkHook('pre-push')) hooks.push('pre-push');
    
    return hooks;
  }

  /**
   * Update existing hook configuration
   */
  async updateHookConfiguration(oldTrigger: 'pre-commit' | 'pre-push', newTrigger: 'pre-commit' | 'pre-push'): Promise<void> {
    try {
      // Remove old hook if different
      if (oldTrigger !== newTrigger) {
        const oldHookPath = join(this.huskyDir, oldTrigger);
        if (existsSync(oldHookPath)) {
          unlinkSync(oldHookPath);
        }
      }
      
      // Install new hook
      await this.createHookScript(newTrigger);
      
      console.log(chalk.green(`✅ Hook configuration updated to ${newTrigger}`));
    } catch (error) {
      throw new Error(`Failed to update hook configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure we're in a git repository
   */
  private async ensureGitRepository(): Promise<void> {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch {
      throw new Error('Not in a git repository. Please run this command from within a git repository.');
    }
  }

  /**
   * Ensure husky is installed and configured
   */
  private async ensureHuskyInstalled(): Promise<void> {
    try {
      // Check if husky is already initialized
      if (!existsSync(this.huskyDir)) {
        console.log(chalk.blue('🔧 Initializing husky...'));
        
        // Initialize husky
        execSync('npx husky install', { stdio: 'inherit' });
        
        // Add husky install to package.json prepare script if not already there
        await this.addPrepareScript();
      }
    } catch (error) {
      throw new Error(`Failed to initialize husky: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add prepare script to package.json for husky
   */
  private async addPrepareScript(): Promise<void> {
    try {
      const packageJsonPath = 'package.json';
      if (!existsSync(packageJsonPath)) return;
      
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      
      // Add prepare script if it doesn't exist or doesn't include husky
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }
      
      if (!packageJson.scripts.prepare || !packageJson.scripts.prepare.includes('husky install')) {
        packageJson.scripts.prepare = 'husky install';
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log(chalk.blue('📝 Added husky install to package.json prepare script'));
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Could not update package.json: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Create hook script content
   */
  private async createHookScript(trigger: string): Promise<void> {
    const hookPath = join(this.huskyDir, trigger);
    
    // Create .husky directory if it doesn't exist
    if (!existsSync(this.huskyDir)) {
      mkdirSync(this.huskyDir, { recursive: true });
    }
    
    const hookContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# BaseGuard automation
base automation run --trigger ${trigger}
`;
    
    writeFileSync(hookPath, hookContent);
    
    // Make the hook executable (Unix systems)
    if (process.platform !== 'win32') {
      try {
        execSync(`chmod +x "${hookPath}"`);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Could not make hook executable: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
    
    console.log(chalk.blue(`📝 Created ${trigger} hook script`));
  }
}
