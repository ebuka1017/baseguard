import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';

/**
 * Manages .gitignore file to ensure sensitive configuration is not committed
 */
export class GitignoreManager {
  private static readonly GITIGNORE_FILE = '.gitignore';
  private static readonly CONFIG_FILE = '.baseguardrc.json';

  /**
   * Ensure .baseguardrc.json is in .gitignore for security
   */
  static async ensureConfigIgnored(): Promise<boolean> {
    try {
      // Check if .gitignore exists
      const gitignoreExists = await this.fileExists(this.GITIGNORE_FILE);
      
      if (!gitignoreExists) {
        // Create .gitignore with BaseGuard config
        await this.createGitignore();
        return true;
      }

      // Read existing .gitignore
      const content = await readFile(this.GITIGNORE_FILE, 'utf-8');
      
      // Check if our config file is already ignored
      if (this.isConfigIgnored(content)) {
        return false; // Already ignored, no changes made
      }

      // Add our config to .gitignore
      await this.addConfigToGitignore(content);
      return true; // Changes made

    } catch (error) {
      console.warn(`Warning: Could not update .gitignore: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Check if a file exists
   */
  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create new .gitignore with BaseGuard configuration
   */
  private static async createGitignore(): Promise<void> {
    const content = `# BaseGuard configuration (contains API keys)
${this.CONFIG_FILE}
`;
    await writeFile(this.GITIGNORE_FILE, content, 'utf-8');
  }

  /**
   * Check if config file is already ignored
   */
  private static isConfigIgnored(gitignoreContent: string): boolean {
    const lines = gitignoreContent.split('\n').map(line => line.trim());
    
    // Check for exact match or pattern that would match our config
    return lines.some(line => {
      if (line === this.CONFIG_FILE) return true;
      if (line === '*.json' && this.CONFIG_FILE.endsWith('.json')) return true;
      if (line === '.baseguardrc*') return true;
      
      // Check for glob patterns that might match
      if (line.includes('*') && this.matchesPattern(this.CONFIG_FILE, line)) {
        return true;
      }
      
      return false;
    });
  }

  /**
   * Add config file to existing .gitignore
   */
  private static async addConfigToGitignore(existingContent: string): Promise<void> {
    let content = existingContent;
    
    // Ensure content ends with newline
    if (!content.endsWith('\n')) {
      content += '\n';
    }

    // Add BaseGuard section
    content += `
# BaseGuard configuration (contains API keys)
${this.CONFIG_FILE}
`;

    await writeFile(this.GITIGNORE_FILE, content, 'utf-8');
  }

  /**
   * Simple glob pattern matching
   */
  private static matchesPattern(filename: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }

  /**
   * Check if config file is properly ignored
   */
  static async isConfigSecure(): Promise<{
    gitignoreExists: boolean;
    configIgnored: boolean;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    
    const gitignoreExists = await this.fileExists(this.GITIGNORE_FILE);
    let configIgnored = false;

    if (!gitignoreExists) {
      recommendations.push('Create .gitignore file to protect sensitive configuration');
    } else {
      try {
        const content = await readFile(this.GITIGNORE_FILE, 'utf-8');
        configIgnored = this.isConfigIgnored(content);
        
        if (!configIgnored) {
          recommendations.push(`Add "${this.CONFIG_FILE}" to .gitignore to prevent committing API keys`);
        }
      } catch (error) {
        recommendations.push('Check .gitignore file permissions and readability');
      }
    }

    // Check if config file exists and might be tracked
    const configExists = await this.fileExists(this.CONFIG_FILE);
    if (configExists && !configIgnored) {
      recommendations.push('Remove .baseguardrc.json from git tracking if already committed');
      recommendations.push('Run: git rm --cached .baseguardrc.json');
    }

    return {
      gitignoreExists,
      configIgnored,
      recommendations
    };
  }

  /**
   * Get security recommendations for the user
   */
  static async getSecurityRecommendations(): Promise<string[]> {
    const status = await this.isConfigSecure();
    return status.recommendations;
  }
}