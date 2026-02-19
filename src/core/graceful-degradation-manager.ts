import chalk from 'chalk';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import type { Violation, Analysis, Fix } from '../types/index.js';
import { ErrorType } from './error-handler.js';
import { UIComponents } from '../ui/components.js';

export interface DegradationMode {
  name: string;
  description: string;
  capabilities: {
    baselineChecking: boolean;
    aiAnalysis: boolean;
    autoFix: boolean;
    caching: boolean;
    offlineMode: boolean;
  };
  limitations: string[];
}

export interface FallbackOptions {
  useCache: boolean;
  skipAI: boolean;
  basicAnalysis: boolean;
  offlineMode: boolean;
  continueOnError: boolean;
}

/**
 * Manages graceful degradation when services are unavailable
 */
export class GracefulDegradationManager {
  private static currentMode: DegradationMode | null = null;
  private static fallbackOptions: FallbackOptions = {
    useCache: true,
    skipAI: false,
    basicAnalysis: true,
    offlineMode: false,
    continueOnError: true
  };
  private static serviceStatus = new Map<string, { available: boolean; lastCheck: number; error?: string }>();
  private static cacheDir = path.join(process.cwd(), '.baseguard', 'cache');

  /**
   * Available degradation modes
   */
  private static readonly DEGRADATION_MODES: Record<string, DegradationMode> = {
    full: {
      name: 'Full Functionality',
      description: 'All features available including AI analysis and fixing',
      capabilities: {
        baselineChecking: true,
        aiAnalysis: true,
        autoFix: true,
        caching: true,
        offlineMode: false
      },
      limitations: []
    },
    
    aiLimited: {
      name: 'AI Limited',
      description: 'Basic compatibility checking with limited AI features',
      capabilities: {
        baselineChecking: true,
        aiAnalysis: false,
        autoFix: false,
        caching: true,
        offlineMode: false
      },
      limitations: [
        'AI analysis unavailable',
        'Automatic fixing disabled',
        'Using cached analysis when available'
      ]
    },
    
    offline: {
      name: 'Offline Mode',
      description: 'Baseline checking only using local data',
      capabilities: {
        baselineChecking: true,
        aiAnalysis: false,
        autoFix: false,
        caching: true,
        offlineMode: true
      },
      limitations: [
        'No network-dependent features',
        'AI services unavailable',
        'Using local web-features data only',
        'Cached results when available'
      ]
    },
    
    minimal: {
      name: 'Minimal Mode',
      description: 'Basic error detection with minimal features',
      capabilities: {
        baselineChecking: true,
        aiAnalysis: false,
        autoFix: false,
        caching: false,
        offlineMode: true
      },
      limitations: [
        'No AI features',
        'No caching',
        'Basic compatibility checking only',
        'Manual review required for all issues'
      ]
    }
  };

  /**
   * Initialize degradation manager
   */
  static async initialize(): Promise<void> {
    // Ensure cache directory exists
    await fs.mkdir(this.cacheDir, { recursive: true });
    
    // Set initial mode based on environment
    if (process.env.BASEGUARD_OFFLINE === 'true') {
      await this.setDegradationMode('offline');
    } else {
      await this.setDegradationMode('full');
    }
    
    // Check service availability
    await this.checkServiceAvailability();
  }

  /**
   * Set degradation mode
   */
  static async setDegradationMode(modeName: string): Promise<void> {
    const mode = this.DEGRADATION_MODES[modeName];
    if (!mode) {
      throw new Error(`Unknown degradation mode: ${modeName}`);
    }

    this.currentMode = mode;
    
    // Update environment variables based on mode
    if (mode.capabilities.offlineMode) {
      process.env.BASEGUARD_OFFLINE = 'true';
    }
    
    // Update fallback options
    this.fallbackOptions = {
      useCache: mode.capabilities.caching,
      skipAI: !mode.capabilities.aiAnalysis,
      basicAnalysis: true,
      offlineMode: mode.capabilities.offlineMode,
      continueOnError: true
    };

    console.log(chalk.cyan(`🔄 Switched to ${mode.name}: ${mode.description}`));
    
    if (mode.limitations.length > 0) {
      console.log(chalk.yellow('⚠️ Limitations in this mode:'));
      mode.limitations.forEach(limitation => {
        console.log(chalk.yellow(`   • ${limitation}`));
      });
    }
  }

  /**
   * Check availability of external services
   */
  static async checkServiceAvailability(): Promise<void> {
    const services = ['gemini', 'jules', 'network'];
    
    for (const service of services) {
      try {
        const available = await this.testServiceAvailability(service);
        this.serviceStatus.set(service, {
          available,
          lastCheck: Date.now(),
          error: available ? undefined : 'Service unavailable'
        });
      } catch (error) {
        this.serviceStatus.set(service, {
          available: false,
          lastCheck: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Auto-adjust degradation mode based on service availability
    await this.autoAdjustDegradationMode();
  }

  /**
   * Test individual service availability
   */
  private static async testServiceAvailability(service: string): Promise<boolean> {
    switch (service) {
      case 'network':
        try {
          // Simple network connectivity test
          const response = await fetch('https://www.google.com', { 
            method: 'HEAD',
            signal: AbortSignal.timeout(5000)
          });
          return response.ok;
        } catch (error) {
          return false;
        }
      
      case 'gemini':
        // This would be implemented with actual Gemini API test
        return this.serviceStatus.get('network')?.available ?? false;
      
      case 'jules':
        // This would be implemented with actual Jules API test
        return this.serviceStatus.get('network')?.available ?? false;
      
      default:
        return false;
    }
  }

  /**
   * Auto-adjust degradation mode based on service availability
   */
  private static async autoAdjustDegradationMode(): Promise<void> {
    const networkAvailable = this.serviceStatus.get('network')?.available ?? false;
    const geminiAvailable = this.serviceStatus.get('gemini')?.available ?? false;
    const julesAvailable = this.serviceStatus.get('jules')?.available ?? false;

    if (!networkAvailable) {
      await this.setDegradationMode('offline');
    } else if (!geminiAvailable && !julesAvailable) {
      await this.setDegradationMode('aiLimited');
    } else if (!geminiAvailable || !julesAvailable) {
      await this.setDegradationMode('aiLimited');
    } else if (this.currentMode?.name !== 'Full Functionality') {
      await this.setDegradationMode('full');
    }
  }

  /**
   * Handle service failure and adjust accordingly
   */
  static async handleServiceFailure(service: string, errorType: ErrorType): Promise<void> {
    console.log(chalk.yellow(`⚠️ Service failure detected: ${service} (${errorType})`));
    
    // Update service status
    this.serviceStatus.set(service, {
      available: false,
      lastCheck: Date.now(),
      error: `Service failed: ${errorType}`
    });

    // Provide specific guidance based on error type
    switch (errorType) {
      case ErrorType.NETWORK:
        console.log(chalk.cyan('🔌 Switching to offline mode due to network issues'));
        await this.setDegradationMode('offline');
        break;
      
      case ErrorType.AUTHENTICATION:
        console.log(chalk.yellow('🔑 API authentication failed - disabling AI features'));
        await this.setDegradationMode('aiLimited');
        UIComponents.showWarningBox('Run "base config" to update your API keys');
        break;
      
      case ErrorType.RATE_LIMIT:
        console.log(chalk.yellow('🚦 Rate limit reached - using cached responses'));
        this.fallbackOptions.useCache = true;
        this.fallbackOptions.skipAI = true;
        break;
      
      case ErrorType.QUOTA_EXCEEDED:
        console.log(chalk.yellow('📊 API quota exceeded - switching to basic mode'));
        await this.setDegradationMode('aiLimited');
        break;
      
      default:
        console.log(chalk.yellow('🔄 Service error - enabling fallback mode'));
        await this.setDegradationMode('aiLimited');
        break;
    }

    // Show available alternatives
    this.showFallbackOptions();
  }

  /**
   * Show available fallback options to user
   */
  private static showFallbackOptions(): void {
    const mode = this.currentMode;
    if (!mode) return;

    console.log(chalk.cyan('\n🔄 Available features in current mode:'));
    
    if (mode.capabilities.baselineChecking) {
      console.log(chalk.green('   ✅ Baseline compatibility checking'));
    }
    
    if (mode.capabilities.caching) {
      console.log(chalk.green('   ✅ Cached analysis results'));
    }
    
    if (!mode.capabilities.aiAnalysis) {
      console.log(chalk.yellow('   ⚠️ AI analysis disabled - manual review required'));
    }
    
    if (!mode.capabilities.autoFix) {
      console.log(chalk.yellow('   ⚠️ Auto-fixing disabled - manual fixes required'));
    }

    console.log(chalk.cyan('\n💡 Suggestions:'));
    console.log(chalk.cyan('   • Review violations manually using browser compatibility tables'));
    console.log(chalk.cyan('   • Use progressive enhancement techniques'));
    console.log(chalk.cyan('   • Test across your target browsers'));
    
    if (!mode.capabilities.offlineMode) {
      console.log(chalk.cyan('   • Try again when network/services are restored'));
    }
  }

  /**
   * Create fallback analysis when AI is unavailable
   */
  static createFallbackAnalysis(violation: Violation, reason: string = 'AI services unavailable'): Analysis {
    return {
      violation,
      userImpact: `Users on ${violation.browser} ${violation.required} may experience compatibility issues with ${violation.feature}`,
      marketShare: this.estimateMarketShare(violation.browser, violation.required),
      fixStrategy: this.getDefaultFixStrategy(violation.feature),
      bestPractices: [
        'Use @supports for CSS feature detection',
        'Implement feature detection for JavaScript APIs',
        'Provide fallback implementations',
        'Test across target browsers'
      ],
      sources: [],
      plainEnglish: `${reason}. This feature (${violation.feature}) may not be supported in ${violation.browser} ${violation.required}. Consider using progressive enhancement techniques and providing fallbacks for better compatibility.`,
      confidence: 0.3
    };
  }

  /**
   * Estimate market share for fallback analysis
   */
  private static estimateMarketShare(browser: string, version: string): number {
    const estimates: Record<string, number> = {
      'chrome': 0.65,
      'firefox': 0.08,
      'safari': 0.18,
      'edge': 0.05,
      'opera': 0.02,
      'samsung': 0.02
    };

    const baseShare = estimates[browser.toLowerCase()] || 0.05;
    
    // Reduce estimate for older versions
    if (version !== 'baseline' && version !== 'baseline-newly') {
      const versionNum = parseInt(version, 10);
      if (!isNaN(versionNum)) {
        const currentYear = new Date().getFullYear();
        const estimatedYear = 2008 + (versionNum / 10);
        const yearsDiff = currentYear - estimatedYear;
        
        if (yearsDiff > 2) {
          return baseShare * 0.1;
        } else if (yearsDiff > 1) {
          return baseShare * 0.3;
        }
      }
    }

    return baseShare;
  }

  /**
   * Get default fix strategy based on feature type
   */
  private static getDefaultFixStrategy(feature: string): string {
    const lowerFeature = feature.toLowerCase();
    
    if (lowerFeature.includes('css') || lowerFeature.includes('grid') || lowerFeature.includes('flex')) {
      return 'progressive enhancement with @supports';
    } else if (lowerFeature.includes('api') || lowerFeature.includes('js')) {
      return 'feature detection with polyfills';
    } else if (lowerFeature.includes('element') || lowerFeature.includes('html')) {
      return 'graceful degradation';
    }
    
    return 'progressive enhancement';
  }

  /**
   * Try to load cached analysis
   */
  static async loadCachedAnalysis(violation: Violation): Promise<Analysis | null> {
    if (!this.fallbackOptions.useCache) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(violation);
      const cacheFile = path.join(this.cacheDir, `analysis-${cacheKey}.json`);
      
      const content = await fs.readFile(cacheFile, 'utf-8');
      const cached = JSON.parse(content);
      
      // Check if cache is still valid (24 hours)
      const cacheAge = Date.now() - cached.timestamp;
      if (cacheAge < 24 * 60 * 60 * 1000) {
        console.log(chalk.dim(`📦 Using cached analysis for ${violation.feature}`));
        return cached.analysis;
      }
    } catch (error) {
      // Cache miss or error - return null
    }

    return null;
  }

  /**
   * Save analysis to cache
   */
  static async saveAnalysisToCache(analysis: Analysis): Promise<void> {
    if (!this.fallbackOptions.useCache) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(analysis.violation);
      const cacheFile = path.join(this.cacheDir, `analysis-${cacheKey}.json`);
      
      const cacheData = {
        timestamp: Date.now(),
        analysis
      };
      
      await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      // Ignore cache write errors
      console.warn(chalk.dim(`Warning: Could not save analysis to cache: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Generate cache key for violation
   */
  private static generateCacheKey(violation: Violation): string {
    const keyData = `${violation.feature}:${violation.browser}:${violation.required}:${violation.baselineStatus}`;
    return createHash('md5').update(keyData).digest('hex');
  }

  /**
   * Create basic fix suggestion when auto-fix is unavailable
   */
  static createBasicFixSuggestion(violation: Violation, analysis: Analysis): Fix {
    const basicPatch = this.generateBasicPatch(violation);
    
    return {
      violation,
      analysis,
      patch: basicPatch,
      explanation: `Manual fix required for ${violation.feature} compatibility:\n\n` +
                  `1. Review the code at ${violation.file}:${violation.line}\n` +
                  `2. Implement ${analysis.fixStrategy}\n` +
                  `3. Test in ${violation.browser} ${violation.required}\n` +
                  `4. Consider using: ${analysis.bestPractices.join(', ')}`,
      filePath: violation.file,
      preview: `Manual review required:\n- Feature: ${violation.feature}\n- Location: ${violation.file}:${violation.line}\n- Strategy: ${analysis.fixStrategy}`,
      confidence: 0.5,
      testable: false
    };
  }

  /**
   * Generate basic patch template
   */
  private static generateBasicPatch(violation: Violation): string {
    return `# Manual fix required for ${violation.feature}
# File: ${violation.file}
# Line: ${violation.line}
# 
# Current code:
# ${violation.context}
#
# Suggested approach:
# 1. Add feature detection or @supports rule
# 2. Provide fallback for ${violation.browser} ${violation.required}
# 3. Test across target browsers
#
# Example patterns:
# CSS: @supports (${violation.feature}: value) { /* modern code */ }
# JS: if ('${violation.feature}' in window) { /* modern code */ }
`;
  }

  /**
   * Get current degradation mode
   */
  static getCurrentMode(): DegradationMode | null {
    return this.currentMode;
  }

  /**
   * Get service status
   */
  static getServiceStatus(): Map<string, { available: boolean; lastCheck: number; error?: string }> {
    return new Map(this.serviceStatus);
  }

  /**
   * Get fallback options
   */
  static getFallbackOptions(): FallbackOptions {
    return { ...this.fallbackOptions };
  }

  /**
   * Force refresh service status
   */
  static async refreshServiceStatus(): Promise<void> {
    console.log(chalk.cyan('🔄 Checking service availability...'));
    await this.checkServiceAvailability();
    
    const status = this.getServiceStatus();
    console.log(chalk.cyan('\n📊 Service Status:'));
    
    for (const [service, info] of status) {
      const statusIcon = info.available ? '✅' : '❌';
      const statusText = info.available ? 'Available' : 'Unavailable';
      console.log(chalk.cyan(`   ${statusIcon} ${service}: ${statusText}`));
      
      if (!info.available && info.error) {
        console.log(chalk.dim(`      Error: ${info.error}`));
      }
    }
  }

  /**
   * Clean up old cache files
   */
  static async cleanupCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Show degradation status to user
   */
  static showStatus(): void {
    const mode = this.currentMode;
    if (!mode) {
      console.log(chalk.red('❌ Degradation manager not initialized'));
      return;
    }

    UIComponents.showInfoBox(`Current Mode: ${mode.name}`);
    console.log(chalk.dim(mode.description));
    
    if (mode.limitations.length > 0) {
      console.log(chalk.yellow('\n⚠️ Current limitations:'));
      mode.limitations.forEach(limitation => {
        console.log(chalk.yellow(`   • ${limitation}`));
      });
    }

    const status = this.getServiceStatus();
    console.log(chalk.cyan('\n📊 Service Status:'));
    
    for (const [service, info] of status) {
      const statusIcon = info.available ? '✅' : '❌';
      const age = Math.round((Date.now() - info.lastCheck) / 1000);
      console.log(chalk.cyan(`   ${statusIcon} ${service} (checked ${age}s ago)`));
    }
  }
}
