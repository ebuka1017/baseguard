import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { GitignoreManager } from './gitignore-manager.js';
import { UIComponents } from '../ui/components.js';
import type { Configuration, BrowserTarget } from '../types/index.js';

// Preset browser target configurations
export const BROWSER_TARGET_PRESETS = {
  'baseline-widely': [
    { browser: 'chrome', minVersion: 'baseline' },
    { browser: 'firefox', minVersion: 'baseline' },
    { browser: 'safari', minVersion: 'baseline' },
    { browser: 'edge', minVersion: 'baseline' }
  ] as BrowserTarget[],
  'baseline-newly': [
    { browser: 'chrome', minVersion: 'baseline-newly' },
    { browser: 'firefox', minVersion: 'baseline-newly' },
    { browser: 'safari', minVersion: 'baseline-newly' },
    { browser: 'edge', minVersion: 'baseline-newly' }
  ] as BrowserTarget[],
  'last-2-years': [
    { browser: 'chrome', minVersion: '100' },
    { browser: 'firefox', minVersion: '100' },
    { browser: 'safari', minVersion: '15' },
    { browser: 'edge', minVersion: '100' }
  ] as BrowserTarget[]
};

export type PresetName = 'baseline-widely' | 'baseline-newly' | 'last-2-years';

/**
 * Configuration manager for BaseGuard settings
 */
export class ConfigurationManager {
  private static readonly CONFIG_FILE = '.baseguardrc.json';

  /**
   * Load configuration from file or create default
   */
  static async load(): Promise<Configuration> {
    try {
      await access(this.CONFIG_FILE, constants.F_OK);
      const content = await readFile(this.CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content) as Configuration;
      
      // Validate and migrate configuration if needed
      return this.validateAndMigrate(config);
    } catch (error) {
      // File doesn't exist or is invalid, return default
      return this.createDefault();
    }
  }

  /**
   * Save configuration to file
   */
  static async save(config: Configuration): Promise<void> {
    const validatedConfig = this.validateAndMigrate(config);
    const content = JSON.stringify(validatedConfig, null, 2);
    await writeFile(this.CONFIG_FILE, content, 'utf-8');
    
    // Ensure config file is in .gitignore for security
    const gitignoreUpdated = await GitignoreManager.ensureConfigIgnored();
    if (gitignoreUpdated) {
      UIComponents.showInfoBox('Added .baseguardrc.json to .gitignore for security');
    }
  }

  /**
   * Create default configuration
   */
  static createDefault(): Configuration {
    return {
      version: '1.0.0',
      targets: BROWSER_TARGET_PRESETS['baseline-widely'],
      apiKeys: {
        jules: null,
        gemini: null
      },
      automation: {
        enabled: false,
        trigger: 'pre-commit',
        autoAnalyze: true,
        autoFix: false,
        blockCommit: true
      }
    };
  }

  /**
   * Create configuration with preset browser targets
   */
  static createWithPreset(preset: PresetName): Configuration {
    const config = this.createDefault();
    config.targets = [...BROWSER_TARGET_PRESETS[preset]];
    return config;
  }

  /**
   * Create configuration with custom browser targets
   */
  static createWithCustomTargets(targets: BrowserTarget[]): Configuration {
    const config = this.createDefault();
    config.targets = this.validateBrowserTargets(targets);
    return config;
  }

  /**
   * Validate and migrate configuration
   */
  private static validateAndMigrate(config: any): Configuration {
    const defaultConfig = this.createDefault();
    
    // Ensure all required fields exist
    const validatedConfig: Configuration = {
      version: config.version || defaultConfig.version,
      targets: this.validateBrowserTargets(config.targets || defaultConfig.targets),
      apiKeys: {
        jules: config.apiKeys?.jules || null,
        gemini: config.apiKeys?.gemini || null
      },
      automation: {
        enabled: config.automation?.enabled ?? defaultConfig.automation.enabled,
        trigger: this.validateTrigger(config.automation?.trigger) || defaultConfig.automation.trigger,
        autoAnalyze: config.automation?.autoAnalyze ?? defaultConfig.automation.autoAnalyze,
        autoFix: config.automation?.autoFix ?? defaultConfig.automation.autoFix,
        blockCommit: config.automation?.blockCommit ?? defaultConfig.automation.blockCommit
      }
    };

    return validatedConfig;
  }

  /**
   * Validate browser targets
   */
  private static validateBrowserTargets(targets: any[]): BrowserTarget[] {
    if (!Array.isArray(targets) || targets.length === 0) {
      return BROWSER_TARGET_PRESETS['baseline-widely'];
    }

    const validTargets: BrowserTarget[] = [];
    const supportedBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'opera', 'samsung'];

    for (const target of targets) {
      if (typeof target !== 'object' || !target.browser || !target.minVersion) {
        continue;
      }

      const browser = target.browser.toLowerCase();
      if (!supportedBrowsers.includes(browser)) {
        continue;
      }

      const minVersion = this.validateMinVersion(target.minVersion);
      if (!minVersion) {
        continue;
      }

      validTargets.push({ browser, minVersion });
    }

    return validTargets.length > 0 ? validTargets : BROWSER_TARGET_PRESETS['baseline-widely'];
  }

  /**
   * Validate minimum version
   */
  private static validateMinVersion(minVersion: any): string | null {
    if (typeof minVersion !== 'string') {
      return null;
    }

    // Special baseline keywords
    if (minVersion === 'baseline' || minVersion === 'baseline-newly') {
      return minVersion;
    }

    // Version number validation (basic)
    if (/^\d+(\.\d+)*$/.test(minVersion)) {
      return minVersion;
    }

    return null;
  }

  /**
   * Validate automation trigger
   */
  private static validateTrigger(trigger: any): 'pre-commit' | 'pre-push' | null {
    if (trigger === 'pre-commit' || trigger === 'pre-push') {
      return trigger;
    }
    return null;
  }

  /**
   * Parse browser target string (e.g., "chrome 100", "safari baseline")
   */
  static parseBrowserTarget(targetString: string): BrowserTarget | null {
    const parts = targetString.trim().toLowerCase().split(/\s+/);
    
    if (parts.length !== 2) {
      return null;
    }

    const browser = parts[0];
    const version = parts[1];
    
    if (!browser || !version) {
      return null;
    }

    const supportedBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'opera', 'samsung'];

    if (!supportedBrowsers.includes(browser)) {
      return null;
    }

    const minVersion = this.validateMinVersion(version);
    if (!minVersion) {
      return null;
    }

    return { browser, minVersion };
  }

  /**
   * Parse multiple browser targets from strings
   */
  static parseBrowserTargets(targetStrings: string[]): BrowserTarget[] {
    const targets: BrowserTarget[] = [];

    for (const targetString of targetStrings) {
      const target = this.parseBrowserTarget(targetString);
      if (target) {
        targets.push(target);
      }
    }

    return targets;
  }

  /**
   * Get available preset names
   */
  static getAvailablePresets(): PresetName[] {
    return Object.keys(BROWSER_TARGET_PRESETS) as PresetName[];
  }

  /**
   * Get preset description
   */
  static getPresetDescription(preset: PresetName): string {
    switch (preset) {
      case 'baseline-widely':
        return 'Features supported across all major browsers for 30+ months (Baseline Widely Available)';
      case 'baseline-newly':
        return 'Features newly available across all major browsers (Baseline Newly Available)';
      case 'last-2-years':
        return 'Browser versions from the last 2 years (Chrome 100+, Firefox 100+, Safari 15+, Edge 100+)';
      default:
        return 'Unknown preset';
    }
  }

  /**
   * Check if configuration file exists
   */
  static async exists(): Promise<boolean> {
    try {
      await access(this.CONFIG_FILE, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configuration file path
   */
  static getConfigFilePath(): string {
    return this.CONFIG_FILE;
  }

  /**
   * Add browser target to existing configuration
   */
  static async addBrowserTarget(target: BrowserTarget): Promise<void> {
    const config = await this.load();
    
    // Remove existing target for the same browser
    config.targets = config.targets.filter(t => t.browser !== target.browser);
    
    // Add new target
    config.targets.push(target);
    
    await this.save(config);
  }

  /**
   * Remove browser target from existing configuration
   */
  static async removeBrowserTarget(browser: string): Promise<void> {
    const config = await this.load();
    config.targets = config.targets.filter(t => t.browser !== browser.toLowerCase());
    
    // Ensure at least one target remains
    if (config.targets.length === 0) {
      config.targets = BROWSER_TARGET_PRESETS['baseline-widely'];
    }
    
    await this.save(config);
  }

  /**
   * Update browser targets with preset
   */
  static async updateWithPreset(preset: PresetName): Promise<void> {
    const config = await this.load();
    config.targets = [...BROWSER_TARGET_PRESETS[preset]];
    await this.save(config);
  }

  /**
   * Update browser targets with custom targets
   */
  static async updateWithCustomTargets(targets: BrowserTarget[]): Promise<void> {
    const config = await this.load();
    config.targets = this.validateBrowserTargets(targets);
    await this.save(config);
  }

  /**
   * Update automation configuration
   */
  static async updateAutomation(automationConfig: Partial<Configuration['automation']>): Promise<void> {
    const config = await this.load();
    
    config.automation = {
      ...config.automation,
      ...automationConfig
    };
    
    // Validate trigger
    if (automationConfig.trigger) {
      const validatedTrigger = this.validateTrigger(automationConfig.trigger);
      if (validatedTrigger) {
        config.automation.trigger = validatedTrigger;
      }
    }
    
    await this.save(config);
  }

  /**
   * Enable automation
   */
  static async enableAutomation(trigger?: 'pre-commit' | 'pre-push'): Promise<void> {
    const config = await this.load();
    config.automation.enabled = true;
    
    if (trigger) {
      config.automation.trigger = trigger;
    }
    
    await this.save(config);
  }

  /**
   * Disable automation
   */
  static async disableAutomation(): Promise<void> {
    const config = await this.load();
    config.automation.enabled = false;
    await this.save(config);
  }

  /**
   * Update API keys
   */
  static async updateApiKeys(apiKeys: Partial<Configuration['apiKeys']>): Promise<void> {
    const config = await this.load();
    
    config.apiKeys = {
      ...config.apiKeys,
      ...apiKeys
    };
    
    await this.save(config);
  }

  /**
   * Validate configuration structure and data
   */
  static validateConfiguration(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!config || typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return { valid: false, errors };
    }

    // Validate version
    if (!config.version || typeof config.version !== 'string') {
      errors.push('Configuration version is required and must be a string');
    }

    // Validate targets
    if (!Array.isArray(config.targets)) {
      errors.push('Browser targets must be an array');
    } else {
      config.targets.forEach((target: any, index: number) => {
        if (!target || typeof target !== 'object') {
          errors.push(`Target ${index} must be an object`);
          return;
        }
        if (!target.browser || typeof target.browser !== 'string') {
          errors.push(`Target ${index} must have a valid browser string`);
        }
        if (!target.minVersion || typeof target.minVersion !== 'string') {
          errors.push(`Target ${index} must have a valid minVersion string`);
        }
      });
    }

    // Validate API keys
    if (!config.apiKeys || typeof config.apiKeys !== 'object') {
      errors.push('API keys configuration must be an object');
    } else {
      if (config.apiKeys.jules !== null && typeof config.apiKeys.jules !== 'string') {
        errors.push('Jules API key must be a string or null');
      }
      if (config.apiKeys.gemini !== null && typeof config.apiKeys.gemini !== 'string') {
        errors.push('Gemini API key must be a string or null');
      }
    }

    // Validate automation
    if (!config.automation || typeof config.automation !== 'object') {
      errors.push('Automation configuration must be an object');
    } else {
      const automation = config.automation;
      if (typeof automation.enabled !== 'boolean') {
        errors.push('Automation enabled must be a boolean');
      }
      if (automation.trigger !== 'pre-commit' && automation.trigger !== 'pre-push') {
        errors.push('Automation trigger must be "pre-commit" or "pre-push"');
      }
      if (typeof automation.autoAnalyze !== 'boolean') {
        errors.push('Automation autoAnalyze must be a boolean');
      }
      if (typeof automation.autoFix !== 'boolean') {
        errors.push('Automation autoFix must be a boolean');
      }
      if (typeof automation.blockCommit !== 'boolean') {
        errors.push('Automation blockCommit must be a boolean');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Migrate configuration from older versions
   */
  static migrateConfiguration(config: any): Configuration {
    // Handle migration from version 0.x to 1.x
    if (!config.version || config.version.startsWith('0.')) {
      // Migrate old structure to new structure
      const migratedConfig = this.createDefault();
      
      // Preserve existing settings where possible
      if (config.targets && Array.isArray(config.targets)) {
        migratedConfig.targets = this.validateBrowserTargets(config.targets);
      }
      
      if (config.apiKeys) {
        migratedConfig.apiKeys.jules = config.apiKeys.jules || null;
        migratedConfig.apiKeys.gemini = config.apiKeys.gemini || null;
      }
      
      if (config.automation) {
        migratedConfig.automation = {
          ...migratedConfig.automation,
          ...config.automation
        };
      }
      
      migratedConfig.version = '1.0.0';
      return migratedConfig;
    }

    return config as Configuration;
  }

  /**
   * Get configuration display information
   */
  static async getConfigurationDisplay(): Promise<{
    config: Configuration;
    security: {
      gitignoreExists: boolean;
      configIgnored: boolean;
      recommendations: string[];
    };
    validation: {
      valid: boolean;
      errors: string[];
    };
  }> {
    const config = await this.load();
    const security = await GitignoreManager.isConfigSecure();
    const validation = this.validateConfiguration(config);

    return {
      config,
      security,
      validation
    };
  }

  /**
   * Backup current configuration
   */
  static async backupConfiguration(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `.baseguardrc.backup.${timestamp}.json`;
    
    try {
      const config = await this.load();
      const content = JSON.stringify(config, null, 2);
      await writeFile(backupFile, content, 'utf-8');
      return backupFile;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restore configuration from backup
   */
  static async restoreConfiguration(backupFile: string): Promise<void> {
    try {
      const content = await readFile(backupFile, 'utf-8');
      const config = JSON.parse(content);
      
      const validation = this.validateConfiguration(config);
      if (!validation.valid) {
        throw new Error(`Invalid backup configuration: ${validation.errors.join(', ')}`);
      }
      
      await this.save(config);
    } catch (error) {
      throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}