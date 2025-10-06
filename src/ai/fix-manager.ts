import { readFile, writeFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';
import chalk from 'chalk';
import type { Fix, Violation } from '../types/index.js';

/**
 * Fix manager for previewing and applying code fixes
 */
export class FixManager {
  private appliedFixes: Map<string, { original: string; backup: string }> = new Map();

  /**
   * Generate unified diff preview of proposed changes
   */
  async generatePreview(fix: Fix): Promise<string> {
    try {
      const originalContent = await readFile(fix.filePath, 'utf8');
      const modifiedContent = this.applyPatchToContent(originalContent, fix.patch);
      
      return this.createUnifiedDiff(fix.filePath, originalContent, modifiedContent);
    } catch (error) {
      throw new Error(`Failed to generate preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show interactive fix approval with clear change descriptions
   */
  async showFixPreview(fix: Fix): Promise<boolean> {
    console.log(chalk.cyan(`\n🔧 Fix Preview for ${fix.violation.feature} in ${fix.filePath}\n`));
    
    // Show fix explanation
    console.log(chalk.white('📋 Fix Description:'));
    console.log(chalk.dim(fix.explanation));
    console.log();
    
    // Show confidence score
    const confidenceColor = fix.confidence >= 0.8 ? 'green' : fix.confidence >= 0.6 ? 'yellow' : 'red';
    console.log(chalk.white('🎯 Confidence: ') + chalk[confidenceColor](`${Math.round(fix.confidence * 100)}%`));
    console.log();
    
    // Show unified diff
    console.log(chalk.white('📝 Changes:'));
    const preview = await this.generatePreview(fix);
    console.log(this.colorizeUnifiedDiff(preview));
    console.log();
    
    // Show human-readable preview
    if (fix.preview) {
      console.log(chalk.white('👀 Summary:'));
      console.log(chalk.dim(fix.preview));
      console.log();
    }
    
    // Interactive approval
    const { default: inquirer } = await import('inquirer');
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do with this fix?',
        choices: [
          { name: '✅ Apply this fix', value: 'apply' },
          { name: '👀 Show detailed diff', value: 'detail' },
          { name: '❌ Skip this fix', value: 'skip' },
          { name: '🚫 Cancel all fixes', value: 'cancel' }
        ]
      }
    ]);
    
    switch (action) {
      case 'apply':
        return true;
      case 'detail':
        await this.showDetailedDiff(fix);
        return await this.showFixPreview(fix); // Show preview again
      case 'skip':
        return false;
      case 'cancel':
        throw new Error('Fix application cancelled by user');
      default:
        return false;
    }
  }

  /**
   * Apply fixes to original files while preserving formatting and structure
   */
  async applyFix(fix: Fix): Promise<void> {
    try {
      // Create backup before applying fix
      await this.createBackup(fix.filePath);
      
      // Read original content
      const originalContent = await readFile(fix.filePath, 'utf8');
      
      // Apply patch to content
      const modifiedContent = this.applyPatchToContent(originalContent, fix.patch);
      
      // Write modified content back to file
      await writeFile(fix.filePath, modifiedContent, 'utf8');
      
      // Store fix information for potential rollback
      this.appliedFixes.set(fix.filePath, {
        original: originalContent,
        backup: this.getBackupPath(fix.filePath)
      });
      
      console.log(chalk.green(`✅ Applied fix to ${fix.filePath}`));
    } catch (error) {
      throw new Error(`Failed to apply fix: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply multiple fixes with batch processing
   */
  async applyFixes(fixes: Fix[]): Promise<{ applied: Fix[]; skipped: Fix[]; failed: { fix: Fix; error: string }[] }> {
    const results = {
      applied: [] as Fix[],
      skipped: [] as Fix[],
      failed: [] as { fix: Fix; error: string }[]
    };
    
    console.log(chalk.cyan(`\n🔧 Applying ${fixes.length} fixes...\n`));
    
    for (const fix of fixes) {
      try {
        const shouldApply = await this.showFixPreview(fix);
        
        if (shouldApply) {
          await this.applyFix(fix);
          results.applied.push(fix);
        } else {
          results.skipped.push(fix);
          console.log(chalk.yellow(`⏭️ Skipped fix for ${fix.filePath}`));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ fix, error: errorMessage });
        console.log(chalk.red(`❌ Failed to apply fix for ${fix.filePath}: ${errorMessage}`));
      }
    }
    
    return results;
  }

  /**
   * Rollback applied fixes
   */
  async rollbackFix(filePath: string): Promise<void> {
    const fixInfo = this.appliedFixes.get(filePath);
    
    if (!fixInfo) {
      throw new Error(`No applied fix found for ${filePath}`);
    }
    
    try {
      // Restore original content
      await writeFile(filePath, fixInfo.original, 'utf8');
      
      // Remove from applied fixes
      this.appliedFixes.delete(filePath);
      
      console.log(chalk.green(`✅ Rolled back fix for ${filePath}`));
    } catch (error) {
      throw new Error(`Failed to rollback fix: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rollback all applied fixes
   */
  async rollbackAllFixes(): Promise<void> {
    const filePaths = Array.from(this.appliedFixes.keys());
    
    console.log(chalk.cyan(`\n🔄 Rolling back ${filePaths.length} fixes...\n`));
    
    for (const filePath of filePaths) {
      try {
        await this.rollbackFix(filePath);
      } catch (error) {
        console.log(chalk.red(`❌ Failed to rollback ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
  }

  /**
   * Get list of applied fixes
   */
  getAppliedFixes(): string[] {
    return Array.from(this.appliedFixes.keys());
  }

  /**
   * Create backup of original file
   */
  private async createBackup(filePath: string): Promise<void> {
    const backupPath = this.getBackupPath(filePath);
    const backupDir = dirname(backupPath);
    
    // Ensure backup directory exists
    if (!existsSync(backupDir)) {
      await mkdir(backupDir, { recursive: true });
    }
    
    // Copy original file to backup location
    await copyFile(filePath, backupPath);
  }

  /**
   * Get backup file path
   */
  private getBackupPath(filePath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return join('.baseguard', 'backups', `${filePath.replace(/[/\\]/g, '_')}.${timestamp}.backup`);
  }

  /**
   * Apply patch to file content
   */
  private applyPatchToContent(originalContent: string, patch: string): string {
    const lines = originalContent.split('\n');
    const patchLines = patch.split('\n');
    
    let result = [...lines];
    let currentLine = 0;
    
    for (const patchLine of patchLines) {
      if (patchLine.startsWith('@@')) {
        // Parse hunk header to get line numbers
        const match = patchLine.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match && match[2]) {
          currentLine = parseInt(match[2]) - 1;
        }
      } else if (patchLine.startsWith('-')) {
        // Remove line
        const lineToRemove = patchLine.substring(1);
        const index = result.findIndex((line, i) => i >= currentLine && line.trim() === lineToRemove.trim());
        if (index !== -1) {
          result.splice(index, 1);
        }
      } else if (patchLine.startsWith('+')) {
        // Add line
        const lineToAdd = patchLine.substring(1);
        result.splice(currentLine, 0, lineToAdd);
        currentLine++;
      } else if (patchLine.startsWith(' ')) {
        // Context line - advance current line
        currentLine++;
      }
    }
    
    return result.join('\n');
  }

  /**
   * Create unified diff between original and modified content
   */
  private createUnifiedDiff(filePath: string, original: string, modified: string): string {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    let diff = `--- a/${filePath}\n+++ b/${filePath}\n`;
    
    // Simple diff algorithm (in production, use a proper diff library)
    let i = 0, j = 0;
    while (i < originalLines.length || j < modifiedLines.length) {
      const originalLine = originalLines[i] || '';
      const modifiedLine = modifiedLines[j] || '';
      
      if (originalLine === modifiedLine) {
        diff += ` ${originalLine}\n`;
        i++;
        j++;
      } else {
        // Find next matching line
        let nextMatch = -1;
        for (let k = j + 1; k < modifiedLines.length; k++) {
          if (modifiedLines[k] === originalLine) {
            nextMatch = k;
            break;
          }
        }
        
        if (nextMatch !== -1) {
          // Lines were added
          for (let k = j; k < nextMatch; k++) {
            diff += `+${modifiedLines[k]}\n`;
          }
          j = nextMatch;
        } else {
          // Line was removed or changed
          if (i < originalLines.length) {
            diff += `-${originalLine}\n`;
            i++;
          }
          if (j < modifiedLines.length) {
            diff += `+${modifiedLine}\n`;
            j++;
          }
        }
      }
    }
    
    return diff;
  }

  /**
   * Colorize unified diff for better readability
   */
  private colorizeUnifiedDiff(diff: string): string {
    return diff
      .split('\n')
      .map(line => {
        if (line.startsWith('+++') || line.startsWith('---')) {
          return chalk.bold(line);
        } else if (line.startsWith('@@')) {
          return chalk.cyan(line);
        } else if (line.startsWith('+')) {
          return chalk.green(line);
        } else if (line.startsWith('-')) {
          return chalk.red(line);
        } else {
          return chalk.dim(line);
        }
      })
      .join('\n');
  }

  /**
   * Show detailed diff with more context
   */
  private async showDetailedDiff(fix: Fix): Promise<void> {
    console.log(chalk.cyan(`\n📋 Detailed Diff for ${fix.filePath}\n`));
    
    try {
      const originalContent = await readFile(fix.filePath, 'utf8');
      const modifiedContent = this.applyPatchToContent(originalContent, fix.patch);
      
      const originalLines = originalContent.split('\n');
      const modifiedLines = modifiedContent.split('\n');
      
      console.log(chalk.white('Original:'));
      originalLines.forEach((line, i) => {
        console.log(chalk.dim(`${(i + 1).toString().padStart(3)} | `) + line);
      });
      
      console.log(chalk.white('\nModified:'));
      modifiedLines.forEach((line, i) => {
        console.log(chalk.dim(`${(i + 1).toString().padStart(3)} | `) + line);
      });
      
      console.log();
    } catch (error) {
      console.log(chalk.red(`Failed to show detailed diff: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}