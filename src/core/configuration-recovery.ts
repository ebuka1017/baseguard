import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ConfigurationManager } from './configuration.js';
import { SystemErrorHandler } from './system-error-handler.js';
import { logger } from './debug-logger.js';
import { UIComponents } from '../ui/components.js';
import type { Configuration } from '../types/index.js';

export interface ConfigurationBackup {
  timestamp: Date;
  version: string;
  config: Configuration;
  source: 'auto' | 'manual' | 'recovery';
  checksum: string;
}

export interface RecoveryOptions {
  createBackup: boolean;
  validateConfig: boolean;
  migrateVersion: boolean;
  repairCorruption: boolean;
  useDefaults: boolean;
}

/**
 * Enhanced configuration recovery and backup system
 */
export class ConfigurationRecovery {
  private static readonly CONFIG_FILE = '.baseguardrc.json';
  private static readonly BACKUP_DIR = path.join('.baseguard', 'backups');
  private static readonly MAX_BACKUPS = 10;
  private static readonly RECOVERY_LOG = path.join('.baseguard', 'recovery.log');

  /**
   * Attempt to recover corrupted configuration
   */
  static async recoverConfiguration(options: Partial<RecoveryOptions> = {}): Promise<{
    success: boolean;
    config?: Configuration;
    backupCreated?: string;
    errors: string[];
    warnings: string[];
  }> {
    const recoveryOptions: RecoveryOptions = {
      createBackup: true,
      validateConfig: true,
      migrateVersion: true,
      repairCorruption: true,
      useDefaults: false,
      ...options
    };

    const result = {
      success: false,
      config: undefined as Configuration | undefined,
      backupCreated: undefined as string | undefined,
      errors: [] as string[],
      warnings: [] as string[]
    };

    const categoryLogger = logger.createCategoryLogger('config-recovery');
    categoryLogger.info('Starting configuration recovery', { options: recoveryOptions });

    try {
      // Step 1: Check if config file exists
      const configExists = await this.configFileExists();
      
      if (!configExists) {
        categoryLogger.info('Configuration file does not exist, creating default');
        result.config = await this.createDefaultConfiguration();
        result.success = true;
        return result;
      }

      // Step 2: Try to read and parse existing config
      let currentConfig: any = null;
      let configContent = '';
      
      try {
        configContent = await fs.readFile(this.CONFIG_FILE, 'utf-8');
        currentConfig = JSON.parse(configContent);
        categoryLogger.debug('Successfully read configuration file');
      } catch (parseError) {
        categoryLogger.error('Failed to parse configuration file', { error: parseError });
        result.errors.push(`Configuration file is corrupted: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        
        if (recoveryOptions.repairCorruption) {
          const repairResult = await this.repairCorruptedConfig(configContent);
          if (repairResult.success) {
            currentConfig = repairResult.config;
            result.warnings.push('Configuration was repaired from corrupted state');
          }
        }
      }

      // Step 3: Create backup if requested and config exists
      if (recoveryOptions.createBackup && currentConfig) {
        try {
          result.backupCreated = await this.createBackup(currentConfig, 'recovery');
          categoryLogger.info('Created configuration backup', { backupFile: result.backupCreated });
        } catch (backupError) {
          result.warnings.push(`Failed to create backup: ${backupError instanceof Error ? backupError.message : 'Unknown error'}`);
        }
      }

      // Step 4: Validate configuration structure
      if (recoveryOptions.validateConfig && currentConfig) {
        const validation = ConfigurationManager.validateConfiguration(currentConfig);
        if (!validation.valid) {
          categoryLogger.warn('Configuration validation failed', { errors: validation.errors });
          result.errors.push(...validation.errors);
          
          if (recoveryOptions.repairCorruption) {
            currentConfig = await this.repairValidationErrors(currentConfig, validation.errors);
            result.warnings.push('Configuration was repaired to fix validation errors');
          }
        }
      }

      // Step 5: Migrate configuration version if needed
      if (recoveryOptions.migrateVersion && currentConfig) {
        const migrationResult = await this.migrateConfiguration(currentConfig);
        if (migrationResult.migrated) {
          currentConfig = migrationResult.config;
          result.warnings.push(`Configuration migrated from version ${migrationResult.fromVersion} to ${migrationResult.toVersion}`);
          categoryLogger.info('Configuration migrated', migrationResult);
        }
      }

      // Step 6: Final validation and save
      if (currentConfig) {
        try {
          // Use the public migrateConfiguration method instead
          const finalConfig = ConfigurationManager.migrateConfiguration(currentConfig);
          
          await ConfigurationManager.save(finalConfig);
          result.config = finalConfig;
          result.success = true;
          categoryLogger.info('Configuration recovery completed successfully');
        } catch (saveError) {
          result.errors.push(`Failed to save recovered configuration: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`);
        }
      }

      // Step 7: Use defaults as last resort
      if (!result.success && recoveryOptions.useDefaults) {
        categoryLogger.warn('Using default configuration as last resort');
        result.config = await this.createDefaultConfiguration();
        result.success = true;
        result.warnings.push('Used default configuration due to unrecoverable errors');
      }

    } catch (error) {
      categoryLogger.error('Configuration recovery failed', { error });
      result.errors.push(`Recovery process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Log recovery result
    await this.logRecoveryAttempt(result);

    return result;
  }

  /**
   * Create automatic backup of configuration
   */
  static async createAutoBackup(): Promise<string | null> {
    try {
      const config = await ConfigurationManager.load();
      return await this.createBackup(config, 'auto');
    } catch (error) {
      logger.warn('config-backup', 'Failed to create automatic backup', { error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  /**
   * Create manual backup of configuration
   */
  static async createManualBackup(): Promise<string> {
    const config = await ConfigurationManager.load();
    return await this.createBackup(config, 'manual');
  }

  /**
   * Create backup with metadata
   */
  private static async createBackup(config: Configuration, source: 'auto' | 'manual' | 'recovery'): Promise<string> {
    await fs.mkdir(this.BACKUP_DIR, { recursive: true });

    const timestamp = new Date();
    const backupId = `${timestamp.toISOString().replace(/[:.]/g, '-')}-${source}`;
    const backupFile = path.join(this.BACKUP_DIR, `config-${backupId}.json`);

    const backup: ConfigurationBackup = {
      timestamp,
      version: config.version,
      config,
      source,
      checksum: this.calculateChecksum(config)
    };

    await fs.writeFile(backupFile, JSON.stringify(backup, null, 2));

    // Clean up old backups
    await this.cleanupOldBackups();

    return backupFile;
  }

  /**
   * Restore configuration from backup
   */
  static async restoreFromBackup(backupFile: string): Promise<{
    success: boolean;
    config?: Configuration;
    errors: string[];
  }> {
    const result = {
      success: false,
      config: undefined as Configuration | undefined,
      errors: [] as string[]
    };

    try {
      const backupContent = await fs.readFile(backupFile, 'utf-8');
      const backup: ConfigurationBackup = JSON.parse(backupContent);

      // Validate backup integrity
      const currentChecksum = this.calculateChecksum(backup.config);
      if (currentChecksum !== backup.checksum) {
        result.errors.push('Backup file integrity check failed');
        return result;
      }

      // Validate configuration
      const validation = ConfigurationManager.validateConfiguration(backup.config);
      if (!validation.valid) {
        result.errors.push(...validation.errors);
        return result;
      }

      // Save restored configuration
      await ConfigurationManager.save(backup.config);
      result.config = backup.config;
      result.success = true;

      logger.info('config-recovery', 'Configuration restored from backup', {
        backupFile,
        backupTimestamp: backup.timestamp,
        backupSource: backup.source
      });

    } catch (error) {
      result.errors.push(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * List available backups
   */
  static async listBackups(): Promise<{
    file: string;
    timestamp: Date;
    version: string;
    source: string;
    size: number;
  }[]> {
    try {
      const backups: any[] = [];
      const files = await fs.readdir(this.BACKUP_DIR);

      for (const file of files) {
        if (!file.startsWith('config-') || !file.endsWith('.json')) {
          continue;
        }

        try {
          const filePath = path.join(this.BACKUP_DIR, file);
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const backup: ConfigurationBackup = JSON.parse(content);

          backups.push({
            file: filePath,
            timestamp: new Date(backup.timestamp),
            version: backup.version,
            source: backup.source,
            size: stats.size
          });
        } catch (error) {
          // Skip invalid backup files
          logger.warn('config-recovery', `Invalid backup file: ${file}`, { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      logger.error('config-recovery', 'Failed to list backups', { error });
      return [];
    }
  }

  /**
   * Repair corrupted configuration content
   */
  private static async repairCorruptedConfig(content: string): Promise<{
    success: boolean;
    config?: any;
    repairs: string[];
  }> {
    const result = {
      success: false,
      config: undefined as any,
      repairs: [] as string[]
    };

    try {
      // Try to fix common JSON issues
      let repairedContent = content;

      // Fix trailing commas
      repairedContent = repairedContent.replace(/,(\s*[}\]])/g, '$1');
      result.repairs.push('Removed trailing commas');

      // Fix missing quotes around keys
      repairedContent = repairedContent.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      result.repairs.push('Added quotes around object keys');

      // Fix single quotes to double quotes
      repairedContent = repairedContent.replace(/'/g, '"');
      result.repairs.push('Converted single quotes to double quotes');

      // Try to parse repaired content
      try {
        result.config = JSON.parse(repairedContent);
        result.success = true;
      } catch (parseError) {
        // If still can't parse, try to extract valid parts
        const extractResult = await this.extractValidConfigParts(content);
        if (extractResult.success) {
          result.config = extractResult.config;
          result.success = true;
          result.repairs.push(...extractResult.repairs);
        }
      }

    } catch (error) {
      logger.error('config-recovery', 'Failed to repair corrupted config', { error });
    }

    return result;
  }

  /**
   * Extract valid configuration parts from corrupted content
   */
  private static async extractValidConfigParts(content: string): Promise<{
    success: boolean;
    config?: any;
    repairs: string[];
  }> {
    const result = {
      success: false,
      config: undefined as any,
      repairs: [] as string[]
    };

    try {
      // Create minimal valid configuration
      const defaultConfig = ConfigurationManager.createDefault();
      const extractedConfig = { ...defaultConfig };

      // Try to extract specific fields using regex
      const patterns = {
        version: /"version"\s*:\s*"([^"]+)"/,
        targets: /"targets"\s*:\s*(\[[^\]]*\])/,
        apiKeys: /"apiKeys"\s*:\s*(\{[^}]*\})/,
        automation: /"automation"\s*:\s*(\{[^}]*\})/
      };

      for (const [field, pattern] of Object.entries(patterns)) {
        const match = content.match(pattern);
        if (match && match[1]) {
          try {
            if (field === 'version') {
              extractedConfig.version = match[1];
            } else {
              const parsed = JSON.parse(match[1]);
              (extractedConfig as any)[field] = parsed;
            }
            result.repairs.push(`Extracted ${field} field`);
          } catch (error) {
            // Skip invalid field
          }
        }
      }

      result.config = extractedConfig;
      result.success = true;
      result.repairs.push('Created configuration from extracted valid parts');

    } catch (error) {
      logger.error('config-recovery', 'Failed to extract config parts', { error });
    }

    return result;
  }

  /**
   * Repair configuration validation errors
   */
  private static async repairValidationErrors(config: any, errors: string[]): Promise<any> {
    const repairedConfig = { ...config };
    const defaultConfig = ConfigurationManager.createDefault();

    for (const error of errors) {
      if (error.includes('version')) {
        repairedConfig.version = defaultConfig.version;
      } else if (error.includes('targets')) {
        repairedConfig.targets = defaultConfig.targets;
      } else if (error.includes('apiKeys')) {
        repairedConfig.apiKeys = defaultConfig.apiKeys;
      } else if (error.includes('automation')) {
        repairedConfig.automation = defaultConfig.automation;
      }
    }

    return repairedConfig;
  }

  /**
   * Migrate configuration to current version
   */
  private static async migrateConfiguration(config: any): Promise<{
    migrated: boolean;
    config: any;
    fromVersion?: string;
    toVersion: string;
  }> {
    const currentVersion = '1.0.0';
    const configVersion = config.version || '0.0.0';

    if (configVersion === currentVersion) {
      return {
        migrated: false,
        config,
        toVersion: currentVersion
      };
    }

    // Perform migration
    const migratedConfig = ConfigurationManager.migrateConfiguration(config);

    return {
      migrated: true,
      config: migratedConfig,
      fromVersion: configVersion,
      toVersion: currentVersion
    };
  }

  /**
   * Create default configuration with recovery metadata
   */
  private static async createDefaultConfiguration(): Promise<Configuration> {
    const config = ConfigurationManager.createDefault();
    await ConfigurationManager.save(config);
    
    logger.info('config-recovery', 'Created default configuration');
    return config;
  }

  /**
   * Check if configuration file exists
   */
  private static async configFileExists(): Promise<boolean> {
    try {
      await fs.access(this.CONFIG_FILE);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate configuration checksum for integrity verification
   */
  private static calculateChecksum(config: Configuration): string {
    const { createHash } = require('crypto');
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return createHash('sha256').update(configString).digest('hex');
  }

  /**
   * Clean up old backup files
   */
  private static async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      
      if (backups.length > this.MAX_BACKUPS) {
        const toDelete = backups.slice(this.MAX_BACKUPS);
        
        for (const backup of toDelete) {
          try {
            await fs.unlink(backup.file);
            logger.debug('config-recovery', `Deleted old backup: ${path.basename(backup.file)}`);
          } catch (error) {
            // Ignore individual deletion errors
          }
        }
      }
    } catch (error) {
      logger.warn('config-recovery', 'Failed to cleanup old backups', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Log recovery attempt for debugging
   */
  private static async logRecoveryAttempt(result: any): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.RECOVERY_LOG), { recursive: true });
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        success: result.success,
        errors: result.errors,
        warnings: result.warnings,
        backupCreated: result.backupCreated
      };

      await fs.appendFile(this.RECOVERY_LOG, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      // Ignore logging errors
    }
  }

  /**
   * Validate configuration file integrity
   */
  static async validateIntegrity(): Promise<{
    valid: boolean;
    readable: boolean;
    parseable: boolean;
    structureValid: boolean;
    errors: string[];
    suggestions: string[];
  }> {
    const result = {
      valid: false,
      readable: false,
      parseable: false,
      structureValid: false,
      errors: [] as string[],
      suggestions: [] as string[]
    };

    try {
      // Check if file is readable
      const content = await fs.readFile(this.CONFIG_FILE, 'utf-8');
      result.readable = true;

      // Check if content is parseable JSON
      let config: any;
      try {
        config = JSON.parse(content);
        result.parseable = true;
      } catch (parseError) {
        result.errors.push(`Configuration file contains invalid JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        result.suggestions.push('Run "base init" to recreate the configuration file');
        return result;
      }

      // Check configuration structure
      const validation = ConfigurationManager.validateConfiguration(config);
      result.structureValid = validation.valid;
      
      if (!validation.valid) {
        result.errors.push(...validation.errors);
        result.suggestions.push('Run "base config" to fix configuration issues');
      }

      result.valid = result.readable && result.parseable && result.structureValid;

    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        result.errors.push('Configuration file does not exist');
        result.suggestions.push('Run "base init" to create a new configuration file');
      } else {
        result.errors.push(`Cannot read configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        result.suggestions.push('Check file permissions and try again');
      }
    }

    return result;
  }

  /**
   * Interactive recovery wizard
   */
  static async runRecoveryWizard(): Promise<void> {
    console.log(chalk.cyan('🔧 BaseGuard Configuration Recovery Wizard'));
    console.log(chalk.dim('This wizard will help you recover or repair your BaseGuard configuration.\n'));

    // Step 1: Validate current configuration
    console.log(chalk.cyan('Step 1: Validating current configuration...'));
    const integrity = await this.validateIntegrity();
    
    if (integrity.valid) {
      UIComponents.showSuccessBox('Configuration is valid and healthy');
      return;
    }

    // Step 2: Show issues
    console.log(chalk.red('\n❌ Configuration issues found:'));
    integrity.errors.forEach(error => {
      console.log(chalk.red(`   • ${error}`));
    });

    console.log(chalk.cyan('\n💡 Suggestions:'));
    integrity.suggestions.forEach(suggestion => {
      console.log(chalk.cyan(`   • ${suggestion}`));
    });

    // Step 3: Offer recovery options
    console.log(chalk.cyan('\n🔄 Recovery Options:'));
    console.log(chalk.cyan('   1. Automatic repair (recommended)'));
    console.log(chalk.cyan('   2. Restore from backup'));
    console.log(chalk.cyan('   3. Create new configuration'));
    console.log(chalk.cyan('   4. Manual repair guidance'));

    // For now, just run automatic repair
    console.log(chalk.cyan('\nRunning automatic repair...'));
    
    const recoveryResult = await this.recoverConfiguration({
      createBackup: true,
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
        console.log(chalk.yellow('\n⚠️ Warnings:'));
        recoveryResult.warnings.forEach(warning => {
          console.log(chalk.yellow(`   • ${warning}`));
        });
      }
    } else {
      console.log(chalk.red('\n❌ Recovery failed:'));
      recoveryResult.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
      
      console.log(chalk.cyan('\n💡 Next steps:'));
      console.log(chalk.cyan('   • Run "base init" to create a fresh configuration'));
      console.log(chalk.cyan('   • Check file permissions in your project directory'));
      console.log(chalk.cyan('   • Contact support if the issue persists'));
    }
  }
}