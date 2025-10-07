import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';


/**
 * GitHub repository manager for Jules integration
 * Note: GitHub app installation should be done on the Jules dashboard, not here
 */
export class GitHubManager {
  private repoOwner: string | null = null;
  private repoName: string | null = null;
  private sourceIdentifier: string | null = null;

  /**
   * Check if current directory is a git repository
   */
  isGitRepository(): boolean {
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
  async detectRepositoryInfo(): Promise<void> {
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
   * Get source identifier for Jules API
   */
  async getSourceIdentifier(): Promise<string> {
    if (!this.repoOwner || !this.repoName) {
      await this.detectRepositoryInfo();
    }
    
    if (!this.repoOwner || !this.repoName) {
      throw new Error('Repository information not available');
    }
    
    // Generate source identifier in the format expected by Jules
    this.sourceIdentifier = `sources/github/${this.repoOwner}/${this.repoName}`;
    
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
   * Check if we can detect repository information (GitHub integration is handled on Jules dashboard)
   */
  async isJulesIntegrationSetup(): Promise<boolean> {
    try {
      if (!this.isGitRepository()) {
        return false;
      }
      
      await this.detectRepositoryInfo();
      return this.repoOwner !== null && this.repoName !== null;
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