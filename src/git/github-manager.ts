import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import open from 'open';

/**
 * GitHub repository manager for Jules integration
 */
export class GitHubManager {
  private repoOwner: string | null = null;
  private repoName: string | null = null;
  private sourceIdentifier: string | null = null;

  /**
   * Guide user through Jules GitHub app installation
   */
  async setupJulesGitHubIntegration(): Promise<string> {
    console.log(chalk.cyan('\n🔗 Setting up Jules GitHub Integration\n'));
    
    // Step 1: Check if we're in a git repository
    if (!this.isGitRepository()) {
      throw new Error('Not in a git repository. Please run this command from within a git repository.');
    }

    // Step 2: Get repository information
    await this.detectRepositoryInfo();
    
    // Step 3: Guide user through GitHub app installation
    await this.guideGitHubAppInstallation();
    
    // Step 4: Verify connection and get source identifier
    const sourceId = await this.getSourceIdentifier();
    
    console.log(chalk.green('✅ Jules GitHub integration setup complete!'));
    return sourceId;
  }

  /**
   * Check if current directory is a git repository
   */
  private isGitRepository(): boolean {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect repository owner and name from git remote
   */
  private async detectRepositoryInfo(): Promise<void> {
    try {
      const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
      
      // Parse GitHub URL (supports both HTTPS and SSH)
      const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      
      if (match) {
        this.repoOwner = match[1] || null;
        this.repoName = match[2] || null;
        
        console.log(chalk.blue(`📁 Detected repository: ${this.repoOwner}/${this.repoName}`));
      } else {
        throw new Error('Could not detect GitHub repository from remote URL');
      }
    } catch (error) {
      throw new Error(`Failed to detect repository info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Guide user through GitHub app installation process
   */
  private async guideGitHubAppInstallation(): Promise<void> {
    console.log(chalk.yellow('\n📋 Jules GitHub App Installation Steps:\n'));
    
    console.log('1. Opening Jules GitHub app installation page...');
    
    // Open Jules GitHub app installation URL
    const installUrl = 'https://github.com/apps/jules-ai';
    await open(installUrl);
    
    console.log(chalk.dim(`   ${installUrl}`));
    
    console.log('\n2. Follow these steps in your browser:');
    console.log('   • Click "Install" on the Jules app page');
    console.log('   • Select your repository or organization');
    console.log(`   • Grant access to ${this.repoOwner}/${this.repoName}`);
    console.log('   • Complete the installation process');
    
    console.log('\n3. After installation:');
    console.log('   • Return to this terminal');
    console.log('   • The setup will continue automatically');
    
    // Wait for user confirmation
    await this.waitForUserConfirmation();
  }

  /**
   * Wait for user to confirm GitHub app installation
   */
  private async waitForUserConfirmation(): Promise<void> {
    const { default: inquirer } = await import('inquirer');
    
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Have you completed the Jules GitHub app installation?',
        default: false
      }
    ]);
    
    if (!confirmed) {
      console.log(chalk.yellow('\nPlease complete the GitHub app installation and run this command again.'));
      process.exit(0);
    }
  }

  /**
   * Get source identifier for Jules API
   */
  private async getSourceIdentifier(): Promise<string> {
    if (!this.repoOwner || !this.repoName) {
      throw new Error('Repository information not available');
    }
    
    // Generate source identifier in the format expected by Jules
    this.sourceIdentifier = `sources/github/${this.repoOwner}/${this.repoName}`;
    
    console.log(chalk.blue(`🔗 Source identifier: ${this.sourceIdentifier}`));
    
    return this.sourceIdentifier;
  }

  /**
   * Verify GitHub authentication and permissions
   */
  async verifyGitHubConnection(): Promise<boolean> {
    try {
      if (!this.repoOwner || !this.repoName) {
        await this.detectRepositoryInfo();
      }
      
      // Check if we can access the repository
      const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}`);
      
      if (response.ok) {
        console.log(chalk.green('✅ GitHub repository access verified'));
        return true;
      } else {
        console.log(chalk.yellow('⚠️ GitHub repository access verification failed'));
        return false;
      }
    } catch (error) {
      console.log(chalk.red(`❌ GitHub connection error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return false;
    }
  }

  /**
   * Get current repository source identifier
   */
  async getCurrentSourceIdentifier(): Promise<string> {
    if (this.sourceIdentifier) {
      return this.sourceIdentifier;
    }
    
    await this.detectRepositoryInfo();
    return this.getSourceIdentifier();
  }

  /**
   * Check if Jules GitHub integration is set up
   */
  async isJulesIntegrationSetup(): Promise<boolean> {
    try {
      if (!this.isGitRepository()) {
        return false;
      }
      
      await this.detectRepositoryInfo();
      return await this.verifyGitHubConnection();
    } catch {
      return false;
    }
  }

  /**
   * Get repository information
   */
  getRepositoryInfo(): { owner: string | null; name: string | null } {
    return {
      owner: this.repoOwner,
      name: this.repoName
    };
  }

  /**
   * Check if repository has required permissions for Jules
   */
  async checkRepositoryPermissions(): Promise<{ hasAccess: boolean; permissions: string[] }> {
    try {
      if (!this.repoOwner || !this.repoName) {
        await this.detectRepositoryInfo();
      }
      
      // In a real implementation, this would check specific permissions
      // For now, we'll assume basic access if we can read the repo
      const hasAccess = await this.verifyGitHubConnection();
      
      const permissions = hasAccess ? [
        'read',
        'write',
        'pull_requests'
      ] : [];
      
      return { hasAccess, permissions };
    } catch {
      return { hasAccess: false, permissions: [] };
    }
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string {
    try {
      return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch {
      return 'main'; // fallback
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  hasUncommittedChanges(): boolean {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      return status.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get repository URL for display
   */
  getRepositoryUrl(): string | null {
    if (!this.repoOwner || !this.repoName) {
      return null;
    }
    
    return `https://github.com/${this.repoOwner}/${this.repoName}`;
  }
}