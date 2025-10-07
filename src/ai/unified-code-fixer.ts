import type { Violation, Analysis, Fix, Configuration } from '../types/index.js';
import { JulesImplementer } from './jules-implementer.js';
import { GeminiCodeFixer } from './gemini-code-fixer.js';
import { ErrorHandler, APIError, ErrorType } from '../core/error-handler.js';
import { logger } from '../core/debug-logger.js';
import chalk from 'chalk';

/**
 * Unified code fixer that can use either Jules or Gemini based on configuration
 */
export class UnifiedCodeFixer {
  private config: Configuration;
  private julesImplementer?: JulesImplementer;
  private geminiCodeFixer?: GeminiCodeFixer;
  private categoryLogger: ReturnType<typeof logger.createCategoryLogger>;

  constructor(config: Configuration) {
    this.config = config;
    this.categoryLogger = logger.createCategoryLogger('unified-code-fixer');
    
    // Initialize available agents based on API keys
    this.initializeAgents();
  }

  /**
   * Initialize coding agents based on available API keys
   */
  private initializeAgents(): void {
    if (this.config.apiKeys.jules) {
      this.julesImplementer = new JulesImplementer(this.config.apiKeys.jules);
      this.categoryLogger.debug('Jules implementer initialized');
    }
    
    if (this.config.apiKeys.gemini) {
      this.geminiCodeFixer = new GeminiCodeFixer(this.config.apiKeys.gemini);
      this.categoryLogger.debug('Gemini code fixer initialized');
    }
  }

  /**
   * Generate a fix using the configured primary agent with fallback
   */
  async generateFix(violation: Violation, analysis: Analysis): Promise<Fix> {
    const primaryAgent = this.config.codingAgent.primary;
    const fallbackAgent = this.config.codingAgent.fallback;
    
    this.categoryLogger.info('Generating fix', {
      feature: violation.feature,
      primaryAgent,
      fallbackAgent
    });

    try {
      // Try primary agent first
      const fix = await this.generateFixWithAgent(violation, analysis, primaryAgent);
      
      this.categoryLogger.info('Fix generated successfully with primary agent', {
        agent: primaryAgent,
        confidence: fix.confidence
      });
      
      return fix;
      
    } catch (primaryError) {
      this.categoryLogger.warn('Primary agent failed, trying fallback', {
        primaryAgent,
        fallbackAgent,
        error: primaryError instanceof Error ? primaryError.message : 'Unknown error'
      });
      
      // Try fallback agent if different from primary
      if (fallbackAgent !== primaryAgent) {
        try {
          const fix = await this.generateFixWithAgent(violation, analysis, fallbackAgent);
          
          this.categoryLogger.info('Fix generated successfully with fallback agent', {
            agent: fallbackAgent,
            confidence: fix.confidence
          });
          
          // Add note about fallback usage
          fix.explanation = `[Generated using ${fallbackAgent} as fallback]\n\n${fix.explanation}`;
          
          return fix;
          
        } catch (fallbackError) {
          this.categoryLogger.error('Both agents failed', {
            primaryError: primaryError instanceof Error ? primaryError.message : 'Unknown error',
            fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
          });
          
          throw new Error(`Both coding agents failed. Primary (${primaryAgent}): ${primaryError instanceof Error ? primaryError.message : 'Unknown error'}. Fallback (${fallbackAgent}): ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        }
      } else {
        throw primaryError;
      }
    }
  }

  /**
   * Generate fix with specific agent
   */
  private async generateFixWithAgent(
    violation: Violation, 
    analysis: Analysis, 
    agent: 'jules' | 'gemini'
  ): Promise<Fix> {
    switch (agent) {
      case 'jules':
        return await this.generateFixWithJules(violation, analysis);
      
      case 'gemini':
        return await this.generateFixWithGemini(violation, analysis);
      
      default:
        throw new Error(`Unknown coding agent: ${agent}`);
    }
  }

  /**
   * Generate fix using Jules
   */
  private async generateFixWithJules(violation: Violation, analysis: Analysis): Promise<Fix> {
    if (!this.julesImplementer) {
      throw new APIError(
        'Jules API key not configured',
        ErrorType.AUTHENTICATION,
        {
          suggestions: [
            'Run "base config set-keys" to configure Jules API key',
            'Get Jules API key from https://jules.google.com/settings#api',
            'Switch to Gemini agent with "base config coding-agent gemini"'
          ]
        }
      );
    }

    // Check if repository is detected for Jules
    const isRepoDetected = await this.julesImplementer.isRepositoryDetected();
    if (!isRepoDetected) {
      throw new APIError(
        'Jules requires a GitHub repository',
        ErrorType.CONFIGURATION,
        {
          suggestions: [
            'Ensure you are in a git repository with GitHub remote',
            'Jules only works with GitHub repositories',
            'Switch to Gemini agent for local files: "base config coding-agent gemini"'
          ]
        }
      );
    }

    return await this.julesImplementer.generateFix(violation, analysis);
  }

  /**
   * Generate fix using Gemini
   */
  private async generateFixWithGemini(violation: Violation, analysis: Analysis): Promise<Fix> {
    if (!this.geminiCodeFixer) {
      throw new APIError(
        'Gemini API key not configured',
        ErrorType.AUTHENTICATION,
        {
          suggestions: [
            'Run "base config set-keys" to configure Gemini API key',
            'Get Gemini API key from https://aistudio.google.com',
            'Switch to Jules agent with "base config coding-agent jules"'
          ]
        }
      );
    }

    return await this.geminiCodeFixer.generateFix(violation, analysis);
  }

  /**
   * Generate multiple fix options using available agents
   */
  async generateFixOptions(violation: Violation, analysis: Analysis): Promise<Fix[]> {
    const fixes: Fix[] = [];
    
    try {
      // Try primary agent
      const primaryFix = await this.generateFix(violation, analysis);
      fixes.push(primaryFix);
      
      // If primary agent has low confidence, try the other agent for alternatives
      if (primaryFix.confidence < 0.7) {
        const alternativeAgent = this.config.codingAgent.primary === 'jules' ? 'gemini' : 'jules';
        
        try {
          const alternativeFix = await this.generateFixWithAgent(violation, analysis, alternativeAgent);
          alternativeFix.explanation = `[Alternative approach using ${alternativeAgent}]\n\n${alternativeFix.explanation}`;
          fixes.push(alternativeFix);
          
          this.categoryLogger.info('Generated alternative fix', {
            primaryAgent: this.config.codingAgent.primary,
            alternativeAgent,
            primaryConfidence: primaryFix.confidence,
            alternativeConfidence: alternativeFix.confidence
          });
          
        } catch (error) {
          this.categoryLogger.debug('Alternative agent failed', {
            agent: alternativeAgent,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
    } catch (error) {
      this.categoryLogger.error('Failed to generate fix options', { error });
      throw error;
    }
    
    return fixes;
  }

  /**
   * Get agent capabilities and status
   */
  async getAgentStatus(): Promise<{
    jules: { available: boolean; configured: boolean; repoDetected?: boolean; error?: string };
    gemini: { available: boolean; configured: boolean; error?: string };
    primary: string;
    fallback: string;
  }> {
    const status = {
      jules: { available: false, configured: !!this.config.apiKeys.jules, error: undefined as string | undefined, repoDetected: undefined as boolean | undefined },
      gemini: { available: false, configured: !!this.config.apiKeys.gemini, error: undefined as string | undefined },
      primary: this.config.codingAgent.primary,
      fallback: this.config.codingAgent.fallback
    };

    // Test Jules availability
    if (this.julesImplementer) {
      try {
        const connectionTest = await this.julesImplementer.testConnection();
        status.jules.available = connectionTest.success;
        if (!connectionTest.success) {
          status.jules.error = connectionTest.error;
        }
        
        // Check repository detection
        status.jules.repoDetected = await this.julesImplementer.isRepositoryDetected();
        
      } catch (error) {
        status.jules.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    // Test Gemini availability
    if (this.geminiCodeFixer) {
      try {
        const connectionTest = await this.geminiCodeFixer.testConnection();
        status.gemini.available = connectionTest.success;
        if (!connectionTest.success) {
          status.gemini.error = connectionTest.error;
        }
      } catch (error) {
        status.gemini.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return status;
  }

  /**
   * Show agent comparison and recommendations
   */
  showAgentComparison(): void {
    console.log(chalk.cyan('\n🤖 Coding Agent Comparison\n'));
    
    console.log(chalk.white('Jules (Google\'s Autonomous Coding Agent):'));
    console.log(chalk.green('  ✅ Autonomous operation in cloud VMs'));
    console.log(chalk.green('  ✅ Full repository context understanding'));
    console.log(chalk.green('  ✅ Asynchronous processing'));
    console.log(chalk.green('  ✅ Integrated with GitHub workflows'));
    console.log(chalk.red('  ❌ Requires GitHub repository'));
    console.log(chalk.red('  ❌ Cannot work with local/uncommitted files'));
    console.log(chalk.red('  ❌ Slower (asynchronous processing)'));
    
    console.log(chalk.white('\nGemini 2.5 Pro (Direct API Integration):'));
    console.log(chalk.green('  ✅ Works with any files (GitHub or not)'));
    console.log(chalk.green('  ✅ Immediate processing'));
    console.log(chalk.green('  ✅ Works with uncommitted/local files'));
    console.log(chalk.green('  ✅ Grounded with real-time web search'));
    console.log(chalk.yellow('  ⚠️ Requires manual code application'));
    console.log(chalk.yellow('  ⚠️ Limited to single-file context'));
    
    console.log(chalk.cyan('\n💡 Recommendations:'));
    console.log(chalk.cyan('  • Use Jules for: GitHub repositories, complex multi-file changes'));
    console.log(chalk.cyan('  • Use Gemini for: Local development, quick fixes, non-GitHub projects'));
    console.log(chalk.cyan('  • Configure both for maximum flexibility'));
  }

  /**
   * Switch primary coding agent
   */
  async switchPrimaryAgent(agent: 'jules' | 'gemini'): Promise<void> {
    this.config.codingAgent.primary = agent;
    this.categoryLogger.info('Switched primary coding agent', { agent });
    
    console.log(chalk.green(`✅ Primary coding agent switched to ${agent}`));
    
    // Show agent-specific setup instructions
    if (agent === 'jules' && !this.config.apiKeys.jules) {
      console.log(chalk.yellow('\n⚠️ Jules API key not configured'));
      console.log(chalk.cyan('Run "base config set-keys" to configure Jules API key'));
    } else if (agent === 'gemini' && !this.config.apiKeys.gemini) {
      console.log(chalk.yellow('\n⚠️ Gemini API key not configured'));
      console.log(chalk.cyan('Run "base config set-keys" to configure Gemini API key'));
    }
  }

  /**
   * Get recommended agent based on current context
   */
  async getRecommendedAgent(): Promise<{ agent: 'jules' | 'gemini'; reason: string }> {
    // Check if we're in a GitHub repository
    const isGitHubRepo = this.julesImplementer ? await this.julesImplementer.isRepositoryDetected() : false;
    
    if (isGitHubRepo && this.config.apiKeys.jules) {
      return {
        agent: 'jules',
        reason: 'GitHub repository detected and Jules is configured'
      };
    } else if (this.config.apiKeys.gemini) {
      return {
        agent: 'gemini',
        reason: isGitHubRepo ? 'Gemini works with any files including local changes' : 'Not in a GitHub repository, Gemini works with local files'
      };
    } else if (this.config.apiKeys.jules) {
      return {
        agent: 'jules',
        reason: 'Only Jules is configured'
      };
    } else {
      return {
        agent: 'gemini',
        reason: 'Default recommendation for local development'
      };
    }
  }
}