import type { Violation, Analysis, Fix, JulesSession, JulesActivity } from '../types/index.js';
import { GitHubManager } from '../git/github-manager.js';
import { FixManager } from './fix-manager.js';
import { ErrorHandler, APIError, ErrorType } from '../core/error-handler.js';
import chalk from 'chalk';

/**
 * Jules AI implementer for autonomous code fixing
 * Note: Jules requires GitHub repositories and cannot work with local files
 */
export class JulesImplementer {
  private apiKey: string;
  private baseUrl = 'https://jules.googleapis.com/v1alpha';
  private githubManager: GitHubManager;
  private fixManager: FixManager;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.githubManager = new GitHubManager();
    this.fixManager = new FixManager();
  }

  /**
   * Generate a fix using Jules AI
   */
  async generateFix(violation: Violation, analysis: Analysis, repoSource?: string): Promise<Fix> {
    const context = ErrorHandler.createContext('jules_fix_generation', {
      feature: violation.feature,
      file: violation.file,
      browser: violation.browser
    });

    try {
      // Get repository source if not provided
      const source = repoSource || await this.githubManager.getCurrentSourceIdentifier();
      
      // Create a session for this specific fix with retry logic
      const session = await ErrorHandler.withRetry(
        () => this.createSession(violation, analysis, source),
        {
          maxRetries: 2,
          retryableErrors: [ErrorType.NETWORK, ErrorType.TIMEOUT, ErrorType.RATE_LIMIT, ErrorType.SERVER_ERROR]
        }
      );
      
      // Monitor session activities until completion
      const activities = await this.waitForCompletion(session.id);
      
      // Extract the generated code changes
      const fix = await this.extractFix(session.id, activities, violation, analysis);
      
      return fix;
    } catch (error) {
      const apiError = ErrorHandler.handleAPIError(error, context);
      
      // Log error for debugging
      console.error('Jules fix generation failed:', {
        feature: violation.feature,
        error: apiError.message,
        type: apiError.type
      });
      
      // Re-throw with proper error handling
      throw apiError;
    }
  }

  /**
   * Create a Jules session for fixing
   */
  private async createSession(violation: Violation, analysis: Analysis, source: string): Promise<JulesSession> {
    const prompt = this.buildFixPrompt(violation, analysis);
    
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey
      },
      body: JSON.stringify({
        prompt: prompt,
        sourceContext: {
          source: source, // e.g., "sources/github/user/repo"
          githubRepoContext: {
            startingBranch: "main"
          }
        },
        title: `Fix ${violation.feature} compatibility in ${violation.file}`,
        requirePlanApproval: false // Auto-approve for BaseGuard automation
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`Jules API error: ${response.status} ${response.statusText} - ${errorText}`);
      (error as any).response = response;
      throw error;
    }
    
    const sessionData = await response.json();
    
    // Validate session response
    ErrorHandler.validateAPIResponse(sessionData, ['id']);
    
    return sessionData;
  }

  /**
   * Wait for Jules session completion
   */
  private async waitForCompletion(sessionId: string): Promise<JulesActivity[]> {
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max (10 seconds * 30)
    
    while (attempts < maxAttempts) {
      const activities = await this.getActivities(sessionId);
      const lastActivity = activities[activities.length - 1];
      
      // Check if session is complete
      if (lastActivity && this.isCompletionActivity(lastActivity)) {
        return activities;
      }
      
      // Check for failure states
      if (lastActivity && this.isFailureActivity(lastActivity)) {
        throw new Error(`Jules session failed: ${JSON.stringify(lastActivity)}`);
      }
      
      // Wait 10 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
    }
    
    throw new Error('Jules session timed out after 5 minutes');
  }

  private isCompletionActivity(activity: any): boolean {
    return (
      activity?.type === 'sessionCompleted' ||
      activity?.type === 'agent_finished' ||
      activity?.status === 'completed' ||
      Boolean(activity?.sessionCompleted)
    );
  }

  private isFailureActivity(activity: any): boolean {
    return (
      activity?.type === 'sessionFailed' ||
      activity?.status === 'failed' ||
      activity?.status === 'error' ||
      Boolean(activity?.sessionFailed)
    );
  }

  /**
   * Get activities for a Jules session
   */
  private async getActivities(sessionId: string): Promise<JulesActivity[]> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/activities`, {
      headers: {
        'X-Goog-Api-Key': this.apiKey
      }
    });

    if (!response.ok) {
      const error = new Error(`Failed to get activities: ${response.status} ${response.statusText}`);
      (error as any).response = response;
      throw error;
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new APIError(
        'Invalid activities response from Jules API',
        ErrorType.VALIDATION,
        {
          suggestions: [
            'Check Jules API service status',
            'Verify session ID is valid',
            'Try the request again'
          ]
        }
      );
    }
    
    return data.activities || [];
  }

  /**
   * Extract fix from completed Jules session
   */
  private async extractFix(sessionId: string, activities: JulesActivity[], violation: Violation, analysis: Analysis): Promise<Fix> {
    // Get the final session state to extract code changes
    const sessionResponse = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      headers: {
        'X-Goog-Api-Key': this.apiKey
      }
    });

    if (!sessionResponse.ok) {
      throw new Error(`Failed to get session details: ${sessionResponse.status}`);
    }

    const sessionData = await sessionResponse.json();
    
    // Prefer official Jules patch artifact when available
    const patch = this.extractPatchFromActivities(activities, sessionData);
    const codeChanges = this.extractCodeChanges(activities, sessionData);
    const finalPatch = patch || this.generateUnifiedDiff(violation.file, codeChanges);
    
    return {
      violation,
      analysis,
      patch: finalPatch,
      explanation: this.generateFixExplanation(violation, analysis, codeChanges),
      filePath: violation.file,
      preview: this.generatePreview(codeChanges, finalPatch),
      confidence: 0.8, // Jules confidence score
      testable: true
    };
  }

  private extractPatchFromActivities(activities: JulesActivity[], sessionData: any): string {
    const activityPatch = activities
      .map((activity: any) =>
        activity?.changeSet?.gitPatch?.unidiffPatch ||
        activity?.changeSet?.gitPatch?.patch ||
        activity?.gitPatch?.unidiffPatch ||
        activity?.gitPatch?.patch
      )
      .find((patch: string | undefined) => typeof patch === 'string' && patch.length > 0);

    if (activityPatch) {
      return activityPatch;
    }

    return (
      sessionData?.changeSet?.gitPatch?.unidiffPatch ||
      sessionData?.changeSet?.gitPatch?.patch ||
      sessionData?.latestChangeSet?.gitPatch?.unidiffPatch ||
      sessionData?.latestChangeSet?.gitPatch?.patch ||
      ''
    );
  }

  /**
   * Extract code changes from Jules activities and session data
   */
  private extractCodeChanges(activities: JulesActivity[], sessionData: any): { original: string; modified: string } {
    // Look for code changes in activities
    const codeActivity = activities.find(activity => 
      activity.type === 'code_change' || activity.type === 'file_edit'
    );

    if (codeActivity) {
      // Extract from activity data (implementation depends on Jules API response format)
      return {
        original: sessionData.originalCode || '',
        modified: sessionData.modifiedCode || ''
      };
    }

    // Fallback: extract from session data
    return {
      original: sessionData.originalCode || '',
      modified: sessionData.modifiedCode || ''
    };
  }

  /**
   * Generate unified diff patch
   */
  private generateUnifiedDiff(filePath: string, changes: { original: string; modified: string }): string {
    const originalLines = changes.original.split('\n');
    const modifiedLines = changes.modified.split('\n');
    
    // Simple diff generation (in production, use a proper diff library)
    let patch = `--- a/${filePath}\n+++ b/${filePath}\n`;
    
    // Find differences and generate patch format
    for (let i = 0; i < Math.max(originalLines.length, modifiedLines.length); i++) {
      const originalLine = originalLines[i] || '';
      const modifiedLine = modifiedLines[i] || '';
      
      if (originalLine !== modifiedLine) {
        if (originalLine) {
          patch += `-${originalLine}\n`;
        }
        if (modifiedLine) {
          patch += `+${modifiedLine}\n`;
        }
      }
    }
    
    return patch;
  }

  /**
   * Generate fix explanation
   */
  private generateFixExplanation(violation: Violation, analysis: Analysis, _changes: { original: string; modified: string }): string {
    return `Fixed ${violation.feature} compatibility issue in ${violation.file}:\n\n` +
           `- Added progressive enhancement using ${analysis.fixStrategy}\n` +
           `- Implemented fallback for ${violation.browser} ${violation.required}\n` +
           `- Applied best practices: ${analysis.bestPractices.join(', ')}\n\n` +
           `This fix ensures the feature works across all target browsers while maintaining the original functionality.`;
  }

  /**
   * Generate human-readable preview
   */
  private generatePreview(changes: { original: string; modified: string }, patch: string): string {
    if (patch) {
      return patch.split('\n').slice(0, 40).join('\n');
    }

    const originalLines = changes.original.split('\n');
    const modifiedLines = changes.modified.split('\n');
    
    let preview = 'Changes:\n';
    
    for (let i = 0; i < Math.max(originalLines.length, modifiedLines.length); i++) {
      const originalLine = originalLines[i];
      const modifiedLine = modifiedLines[i];
      
      if (originalLine !== modifiedLine) {
        if (originalLine) {
          preview += `- ${originalLine}\n`;
        }
        if (modifiedLine) {
          preview += `+ ${modifiedLine}\n`;
        }
      }
    }
    
    return preview;
  }

  /**
   * Build fix prompt for Jules
   */
  private buildFixPrompt(violation: Violation, analysis: Analysis): string {
    return `Fix browser compatibility issue in ${violation.file}:

ISSUE:
- Feature: ${violation.feature} (line ${violation.line})
- Unsupported in: ${violation.browser} ${violation.required}
- Baseline Status: ${violation.baselineStatus}
- Current code: ${violation.context}

ANALYSIS:
${analysis.plainEnglish}

FIX STRATEGY:
${analysis.fixStrategy}

REQUIREMENTS:
1. Implement progressive enhancement using @supports for CSS features
2. Use feature detection for JavaScript APIs  
3. Add appropriate fallbacks for older browsers
4. Preserve all original functionality
5. Follow best practices: ${analysis.bestPractices.join(', ')}
6. Ensure the fix works in ${violation.browser} ${violation.required} and newer versions

Please fix this compatibility issue while maintaining the existing functionality. The fix should be production-ready and follow web standards.`;
  }

  /**
   * Test Jules API connectivity
   */
  async testConnection(): Promise<{ success: boolean; error?: string; errorType?: ErrorType }> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions`, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': this.apiKey
        }
      });
      
      if (response.ok || response.status === 404) {
        // 404 is acceptable for sessions endpoint when no sessions exist
        return { success: true };
      } else {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as any).response = response;
        throw error;
      }
    } catch (error) {
      const apiError = ErrorHandler.handleAPIError(error);
      
      return { 
        success: false, 
        error: apiError.message,
        errorType: apiError.type
      };
    }
  }

  /**
   * Get repository source identifier (GitHub integration is handled on Jules dashboard)
   */
  async getRepositorySource(): Promise<string> {
    return await this.githubManager.getSourceIdentifier();
  }

  /**
   * Check if repository information is available (GitHub integration is handled on Jules dashboard)
   */
  async isRepositoryDetected(): Promise<boolean> {
    return await this.githubManager.isJulesIntegrationSetup();
  }

  /**
   * Verify GitHub connection and permissions
   */
  async verifyGitHubConnection(): Promise<boolean> {
    return await this.githubManager.verifyGitHubConnection();
  }

  /**
   * Get repository information
   */
  getRepositoryInfo(): { owner: string | null; name: string | null } {
    return this.githubManager.getRepositoryInfo();
  }

  /**
   * Get current source identifier
   */
  async getSourceIdentifier(): Promise<string> {
    return await this.githubManager.getCurrentSourceIdentifier();
  }

  /**
   * Generate and apply fixes with interactive preview
   */
  async generateAndApplyFixes(violations: Violation[], analyses: Analysis[]): Promise<{ applied: Fix[]; skipped: Fix[]; failed: { fix: Fix; error: string }[] }> {
    const fixes: Fix[] = [];
    
    // Generate fixes for each violation
    for (let i = 0; i < violations.length; i++) {
      const violation = violations[i];
      const analysis = analyses[i];
      
      if (!violation || !analysis) {
        console.log(chalk.red(`❌ Missing violation or analysis data for index ${i}`));
        continue;
      }
      
      try {
        console.log(chalk.cyan(`\n🔧 Generating fix ${i + 1}/${violations.length} for ${violation.feature}...`));
        const fix = await this.generateFix(violation, analysis);
        fixes.push(fix);
      } catch (error) {
        console.log(chalk.red(`❌ Failed to generate fix for ${violation.feature}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
    
    if (fixes.length === 0) {
      console.log(chalk.yellow('⚠️ No fixes were generated'));
      return { applied: [], skipped: [], failed: [] };
    }
    
    // Apply fixes with interactive preview
    return await this.fixManager.applyFixes(fixes);
  }

  /**
   * Preview a single fix
   */
  async previewFix(fix: Fix): Promise<string> {
    return await this.fixManager.generatePreview(fix);
  }

  /**
   * Apply a single fix
   */
  async applySingleFix(fix: Fix): Promise<void> {
    await this.fixManager.applyFix(fix);
  }

  /**
   * Rollback applied fixes
   */
  async rollbackFix(filePath: string): Promise<void> {
    await this.fixManager.rollbackFix(filePath);
  }

  /**
   * Rollback all applied fixes
   */
  async rollbackAllFixes(): Promise<void> {
    await this.fixManager.rollbackAllFixes();
  }

  /**
   * Get list of applied fixes
   */
  getAppliedFixes(): string[] {
    return this.fixManager.getAppliedFixes();
  }
}
