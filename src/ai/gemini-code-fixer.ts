import type { Violation, Analysis, Fix } from '../types/index.js';
import { promises as fs } from 'fs';
import { ErrorHandler, APIError, ErrorType } from '../core/error-handler.js';
import { logger } from '../core/debug-logger.js';
import chalk from 'chalk';

/**
 * Gemini 2.5 Pro code fixer for local files and repositories
 * Works with any code (GitHub or not, committed or uncommitted)
 */
export class GeminiCodeFixer {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';
  private categoryLogger: ReturnType<typeof logger.createCategoryLogger>;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.categoryLogger = logger.createCategoryLogger('gemini-code-fixer');
  }

  /**
   * Generate a fix using Gemini 2.5 Pro with grounding
   */
  async generateFix(violation: Violation, analysis: Analysis): Promise<Fix> {
    const context = ErrorHandler.createContext('gemini_code_fix', {
      feature: violation.feature,
      file: violation.file,
      browser: violation.browser
    });

    try {
      this.categoryLogger.info('Generating code fix', {
        feature: violation.feature,
        file: violation.file,
        strategy: analysis.fixStrategy
      });

      // Read the current file content
      const fileContent = await this.readFileContent(violation.file);
      
      // Build the fix prompt with file context
      const prompt = this.buildFixPrompt(violation, analysis, fileContent);
      
      const response = await ErrorHandler.withRetry(
        () => this.makeApiCall(prompt),
        {
          maxRetries: 2,
          retryableErrors: [ErrorType.NETWORK, ErrorType.TIMEOUT, ErrorType.RATE_LIMIT, ErrorType.SERVER_ERROR]
        }
      );
      
      const data = await response.json();
      
      // Validate response structure
      ErrorHandler.validateAPIResponse(data, ['candidates']);
      
      if (!data.candidates || data.candidates.length === 0) {
        throw new APIError(
          'No fix candidates returned from Gemini API',
          ErrorType.VALIDATION,
          {
            suggestions: [
              'Try rephrasing the fix request',
              'Check if the code is valid',
              'Try again with a different approach'
            ],
            context
          }
        );
      }
      
      const candidate = data.candidates[0];
      const content = candidate.content?.parts?.[0]?.text;
      
      if (!content) {
        throw new APIError(
          'Empty fix content returned from Gemini API',
          ErrorType.VALIDATION,
          {
            suggestions: [
              'Try the fix generation again',
              'Check if the violation data is complete',
              'Verify API key permissions'
            ],
            context
          }
        );
      }
      
      // Parse the fix response and generate proper diff
      const fix = await this.parseFixResponse(content, violation, analysis, fileContent);
      
      this.categoryLogger.info('Code fix generated successfully', {
        feature: violation.feature,
        confidence: fix.confidence,
        hasPreview: fix.preview.length > 0
      });
      
      return fix;
      
    } catch (error) {
      const apiError = ErrorHandler.handleAPIError(error, context);
      this.categoryLogger.error('Code fix generation failed', { error: apiError });
      throw apiError;
    }
  }

  /**
   * Make API call to Gemini 2.5 Pro with grounding
   */
  private async makeApiCall(prompt: string): Promise<Response> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'x-goog-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        tools: [{
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 0.7
            }
          }
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
          candidateCount: 1
        }
      })
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).response = response;
      throw error;
    }

    return response;
  }

  /**
   * Build comprehensive fix prompt for Gemini 2.5 Pro
   */
  private buildFixPrompt(violation: Violation, analysis: Analysis, fileContent: string): string {
    return `You are an expert web developer tasked with fixing browser compatibility issues. Generate a precise code fix with proper diff format.

## COMPATIBILITY ISSUE
- **Feature**: ${violation.feature}
- **File**: ${violation.file} (line ${violation.line})
- **Unsupported Browser**: ${violation.browser} ${violation.required}
- **Baseline Status**: ${violation.baselineStatus}
- **Current Code Context**: ${violation.context}

## ANALYSIS INSIGHTS
- **Fix Strategy**: ${analysis.fixStrategy}
- **User Impact**: ${analysis.userImpact}
- **Market Share Affected**: ${(analysis.marketShare * 100).toFixed(1)}%
- **Best Practices**: ${analysis.bestPractices.join(', ')}

## CURRENT FILE CONTENT
\`\`\`${this.getFileExtension(violation.file)}
${fileContent}
\`\`\`

## REQUIREMENTS
1. **Fix the compatibility issue** using ${analysis.fixStrategy}
2. **Preserve all existing functionality** - no breaking changes
3. **Add proper fallbacks** for ${violation.browser} ${violation.required}
4. **Follow best practices**: ${analysis.bestPractices.join(', ')}
5. **Generate a unified diff** showing exactly what changes to make
6. **Provide clear explanation** of the fix approach

## OUTPUT FORMAT
Please provide your response in this exact format:

### EXPLANATION
[Explain the fix approach and why it works]

### DIFF
\`\`\`diff
--- a/${violation.file}
+++ b/${violation.file}
@@ -[start_line],[num_lines] +[start_line],[num_lines] @@
[unified diff content showing the exact changes]
\`\`\`

### PREVIEW
\`\`\`${this.getFileExtension(violation.file)}
[Show the key changed sections with context]
\`\`\`

### TESTING
[Suggest how to test the fix works in ${violation.browser} ${violation.required}]

Focus on creating a production-ready fix that maintains compatibility across all browsers while adding proper support for ${violation.browser} ${violation.required}.`;
  }

  /**
   * Read file content with error handling
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      this.categoryLogger.warn('Could not read file content', { 
        file: filePath, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // Return empty content if file can't be read
      return `// File content could not be read: ${filePath}`;
    }
  }

  /**
   * Get file extension for syntax highlighting
   */
  private getFileExtension(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    const extensionMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'vue': 'vue',
      'svelte': 'svelte',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'html': 'html',
      'htm': 'html'
    };
    
    return extensionMap[ext || ''] || 'text';
  }

  /**
   * Parse Gemini's fix response and create Fix object
   */
  private async parseFixResponse(
    content: string, 
    violation: Violation, 
    analysis: Analysis, 
    originalContent: string
  ): Promise<Fix> {
    try {
      // Extract sections from the response
      const explanation = this.extractSection(content, 'EXPLANATION');
      const diffContent = this.extractSection(content, 'DIFF');
      const preview = this.extractSection(content, 'PREVIEW');
      const testing = this.extractSection(content, 'TESTING');

      // Clean up the diff content
      const cleanDiff = this.cleanDiffContent(diffContent);
      
      // Generate a human-readable preview if not provided
      const finalPreview = preview || this.generatePreviewFromDiff(cleanDiff, originalContent);
      
      // Calculate confidence based on response quality
      const confidence = this.calculateFixConfidence(content, diffContent);

      // Create comprehensive explanation
      const fullExplanation = this.buildFullExplanation(
        violation, 
        analysis, 
        explanation, 
        testing
      );

      return {
        violation,
        analysis,
        patch: cleanDiff,
        explanation: fullExplanation,
        filePath: violation.file,
        preview: finalPreview,
        confidence,
        testable: true
      };

    } catch (error) {
      this.categoryLogger.error('Failed to parse fix response', { error });
      
      // Return a basic fix with the raw content
      return {
        violation,
        analysis,
        patch: this.generateBasicDiff(violation.file, content),
        explanation: `Fix generated for ${violation.feature} compatibility issue.\n\n${content}`,
        filePath: violation.file,
        preview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
        confidence: 0.6,
        testable: true
      };
    }
  }

  /**
   * Extract a specific section from the response
   */
  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`### ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n### |$)`, 'i');
    const match = content.match(regex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    return '';
  }

  /**
   * Clean and validate diff content
   */
  private cleanDiffContent(diffContent: string): string {
    if (!diffContent) {
      return '';
    }

    // Remove code block markers if present
    let cleaned = diffContent.replace(/^```diff\\n|```$/gm, '').trim();
    
    // Ensure it starts with proper diff headers
    if (!cleaned.startsWith('---') && !cleaned.startsWith('@@')) {
      // If it's just the diff content without headers, add basic headers
      cleaned = `--- a/file\n+++ b/file\n${cleaned}`;
    }
    
    return cleaned;
  }

  /**
   * Generate preview from diff content
   */
  private generatePreviewFromDiff(diffContent: string, originalContent: string): string {
    if (!diffContent) {
      return 'No preview available';
    }

    try {
      // Extract added lines from diff
      const addedLines = diffContent
        .split('\n')
        .filter(line => line.startsWith('+') && !line.startsWith('+++'))
        .map(line => line.substring(1))
        .join('\n');

      if (addedLines) {
        return `Changes to be applied:\n\n${addedLines}`;
      }
    } catch (error) {
      // Fallback to showing first part of diff
    }

    return diffContent.substring(0, 300) + (diffContent.length > 300 ? '...' : '');
  }

  /**
   * Calculate confidence score based on response quality
   */
  private calculateFixConfidence(content: string, diffContent: string): number {
    let confidence = 0.5; // Base confidence

    // Check if response has proper structure
    if (content.includes('### EXPLANATION')) confidence += 0.1;
    if (content.includes('### DIFF')) confidence += 0.1;
    if (content.includes('### PREVIEW')) confidence += 0.1;
    if (content.includes('### TESTING')) confidence += 0.1;

    // Check diff quality
    if (diffContent && diffContent.includes('@@')) confidence += 0.1;
    if (diffContent && (diffContent.includes('+') || diffContent.includes('-'))) confidence += 0.1;

    return Math.min(confidence, 0.9); // Cap at 0.9
  }

  /**
   * Build comprehensive explanation
   */
  private buildFullExplanation(
    violation: Violation, 
    analysis: Analysis, 
    explanation: string, 
    testing: string
  ): string {
    let fullExplanation = `Fixed ${violation.feature} compatibility issue in ${violation.file}\n\n`;
    
    if (explanation) {
      fullExplanation += `## Fix Approach\n${explanation}\n\n`;
    }
    
    fullExplanation += `## Strategy Applied\n${analysis.fixStrategy}\n\n`;
    fullExplanation += `## Browser Support\nThis fix ensures compatibility with ${violation.browser} ${violation.required} and newer versions.\n\n`;
    
    if (testing) {
      fullExplanation += `## Testing\n${testing}\n\n`;
    }
    
    fullExplanation += `## Best Practices Applied\n${analysis.bestPractices.map(practice => `• ${practice}`).join('\n')}`;
    
    return fullExplanation;
  }

  /**
   * Generate basic diff as fallback
   */
  private generateBasicDiff(filePath: string, content: string): string {
    return `--- a/${filePath}
+++ b/${filePath}
@@ -1,1 +1,1 @@
-// Original code (manual review required)
+// Fixed code: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}

# Manual fix required - please review the generated content above
# and apply the appropriate changes to your code.`;
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<{ success: boolean; error?: string; errorType?: ErrorType }> {
    try {
      const testPrompt = 'Generate a simple "Hello, World!" comment in JavaScript.';
      const response = await this.makeApiCall(testPrompt);
      
      const data = await response.json();
      
      if (data.candidates && data.candidates.length > 0) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: 'API responded but returned no content',
          errorType: ErrorType.VALIDATION
        };
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
   * Validate API key format
   */
  public static validateApiKey(apiKey: string): boolean {
    // Gemini API keys typically start with 'AIza' and are 39+ characters long
    return /^AIza[A-Za-z0-9_-]{35,}$/.test(apiKey) || apiKey.length >= 20;
  }

  /**
   * Generate multiple fix options for complex issues
   */
  async generateFixOptions(violation: Violation, analysis: Analysis): Promise<Fix[]> {
    const fixes: Fix[] = [];
    
    try {
      // Generate primary fix
      const primaryFix = await this.generateFix(violation, analysis);
      fixes.push(primaryFix);
      
      // Generate alternative approaches if confidence is low
      if (primaryFix.confidence < 0.7) {
        this.categoryLogger.info('Generating alternative fix approaches', {
          feature: violation.feature,
          primaryConfidence: primaryFix.confidence
        });
        
        const alternativeFix = await this.generateAlternativeFix(violation, analysis);
        if (alternativeFix) {
          fixes.push(alternativeFix);
        }
      }
      
    } catch (error) {
      this.categoryLogger.error('Failed to generate fix options', { error });
      throw error;
    }
    
    return fixes;
  }

  /**
   * Generate alternative fix approach
   */
  private async generateAlternativeFix(violation: Violation, analysis: Analysis): Promise<Fix | null> {
    try {
      const fileContent = await this.readFileContent(violation.file);
      
      // Build alternative prompt with different strategy
      const alternativePrompt = this.buildAlternativeFixPrompt(violation, analysis, fileContent);
      
      const response = await this.makeApiCall(alternativePrompt);
      const data = await response.json();
      
      if (data.candidates && data.candidates.length > 0) {
        const content = data.candidates[0].content?.parts?.[0]?.text;
        if (content) {
          const fix = await this.parseFixResponse(content, violation, analysis, fileContent);
          fix.explanation = `Alternative approach: ${fix.explanation}`;
          return fix;
        }
      }
      
    } catch (error) {
      this.categoryLogger.warn('Failed to generate alternative fix', { error });
    }
    
    return null;
  }

  /**
   * Build alternative fix prompt with different strategy
   */
  private buildAlternativeFixPrompt(violation: Violation, analysis: Analysis, fileContent: string): string {
    const alternativeStrategies = {
      'progressive enhancement with @supports': 'feature detection with JavaScript',
      'feature detection with polyfills': 'progressive enhancement with @supports',
      'graceful degradation': 'polyfill-based approach'
    };
    
    const altStrategy = alternativeStrategies[analysis.fixStrategy as keyof typeof alternativeStrategies] || 'alternative progressive enhancement';
    
    return this.buildFixPrompt(violation, { ...analysis, fixStrategy: altStrategy }, fileContent);
  }
}