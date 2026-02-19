import type { Violation, Analysis } from '../types/index.js';
import { createHash } from 'crypto';
import { ErrorHandler, APIError, ErrorType } from '../core/error-handler.js';

/**
 * Cache entry for analysis results
 */
interface CacheEntry {
  analysis: Analysis;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

/**
 * Gemini AI analyzer for compatibility violations
 */
export class GeminiAnalyzer {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  private cache = new Map<string, CacheEntry>();
  private readonly cacheTtl = 24 * 60 * 60 * 1000; // 24 hours

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Analyze a violation using Gemini AI with web search
   */
  async analyzeViolation(violation: Violation): Promise<Analysis> {
    // Check cache first
    const cacheKey = this.generateCacheKey(violation);
    const cachedResult = this.getCachedAnalysis(cacheKey);
    
    if (cachedResult) {
      console.log(`Using cached analysis for ${violation.feature}`);
      return cachedResult;
    }

    const context = ErrorHandler.createContext('gemini_analysis', {
      feature: violation.feature,
      browser: violation.browser,
      file: violation.file
    });

    try {
      const prompt = this.buildAnalysisPrompt(violation);
      
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
          'No analysis candidates returned from Gemini API',
          ErrorType.VALIDATION,
          {
            suggestions: [
              'Try rephrasing the analysis request',
              'Check if the feature is supported by Gemini',
              'Try again with a different violation'
            ],
            context
          }
        );
      }
      
      const candidate = data.candidates[0];
      const content = candidate.content?.parts?.[0]?.text;
      const groundingMetadata = candidate.groundingMetadata;
      
      if (!content) {
        throw new APIError(
          'Empty analysis content returned from Gemini API',
          ErrorType.VALIDATION,
          {
            suggestions: [
              'Try the analysis again',
              'Check if the violation data is complete',
              'Verify API key permissions'
            ],
            context
          }
        );
      }
      
      const analysis = this.parseAnalysisResponse(content, groundingMetadata, violation);
      
      // Cache the result
      this.cacheAnalysis(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      const apiError = ErrorHandler.handleAPIError(error, context);
      
      // Log error for debugging
      console.error('Gemini analysis failed:', {
        feature: violation.feature,
        error: apiError.message,
        type: apiError.type
      });
      
      // Return fallback analysis with error context
      return this.createFallbackAnalysis(violation, apiError);
    }
  }

  /**
   * Make API call to Gemini (retry logic handled by ErrorHandler)
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
          google_search: {}
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      })
    });

    // Let ErrorHandler classify the error based on status code
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).response = response;
      throw error;
    }

    return response;
  }

  /**
   * Build analysis prompt for Gemini
   */
  private buildAnalysisPrompt(violation: Violation): string {
    return `
Analyze this browser compatibility issue and provide actionable insights:

COMPATIBILITY ISSUE:
- Feature: ${violation.feature}
- File: ${violation.file} (line ${violation.line})
- Unsupported Browser: ${violation.browser} ${violation.required}
- Baseline Status: ${violation.baselineStatus}
- Code Context: ${violation.context}

Please research and provide:

1. MARKET IMPACT: What percentage of users are affected by this compatibility issue? Search for current browser market share data for ${violation.browser} ${violation.required}.

2. USER EXPERIENCE: Explain in plain English what will happen to users on the unsupported browser. Will the feature fail silently, break the layout, or cause JavaScript errors?

3. FIX STRATEGY: What's the best approach to fix this? Options include:
   - Progressive enhancement with @supports
   - Feature detection with JavaScript
   - Polyfills or libraries
   - Alternative implementations

4. BEST PRACTICES: Search for current best practices from MDN, web.dev, or CSS-Tricks for implementing ${violation.feature} with fallbacks.

5. CODE EXAMPLES: What specific techniques should be used for the fix?

Format your response with clear sections and cite your sources.
    `;
  }

  /**
   * Parse Gemini response into structured analysis
   */
  private parseAnalysisResponse(content: string, groundingMetadata: any, violation: Violation): Analysis {
    // Extract sources from grounding metadata
    const sources = this.extractSources(groundingMetadata);
    
    // Parse structured information from response
    const userImpact = this.extractUserImpact(content);
    const marketShare = this.extractMarketShare(content);
    const fixStrategy = this.extractFixStrategy(content);
    const bestPractices = this.extractBestPractices(content);
    
    // Calculate confidence based on grounding quality
    const confidence = this.calculateConfidence(groundingMetadata, content);
    
    // Clean up the plain English explanation
    const plainEnglish = this.cleanupPlainEnglish(content);
    
    return {
      violation,
      userImpact,
      marketShare,
      fixStrategy,
      bestPractices,
      sources,
      plainEnglish,
      confidence
    };
  }

  /**
   * Extract sources from grounding metadata
   */
  private extractSources(groundingMetadata: any): string[] {
    if (!groundingMetadata?.groundingChunks) {
      return [];
    }
    
    return groundingMetadata.groundingChunks
      .map((chunk: any) => chunk.web?.uri)
      .filter((uri: string) => uri && uri.startsWith('http'))
      .slice(0, 5); // Limit to top 5 sources
  }

  /**
   * Extract user impact from response text
   */
  private extractUserImpact(content: string): string {
    // Look for specific impact patterns with context
    const patterns = [
      /(\d+(?:\.\d+)?%[^.]*(?:users?|browsers?|market|traffic|visitors?))/i,
      /(?:affects?|impacts?)[^.]*(\d+(?:\.\d+)?%[^.]*)/i,
      /(?:approximately|around|about)\s+(\d+(?:\.\d+)?%[^.]*(?:users?|browsers?))/i,
      /(users?\s+on\s+[^.]*(?:may|will|could)[^.]*)/i
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Look for general impact statements without percentages
    const generalPatterns = [
      /(?:affects?|impacts?)[^.]*users?[^.]*\./i,
      /users?\s+(?:may|will|could)[^.]*experience[^.]*\./i,
      /compatibility\s+issues?[^.]*users?[^.]*\./i
    ];
    
    for (const pattern of generalPatterns) {
      const match = content.match(pattern);
      if (match && match[0]) {
        return match[0].trim();
      }
    }
    
    return `Users on ${this.getCurrentViolation()?.browser || 'older browsers'} may experience compatibility issues`;
  }

  /**
   * Extract market share percentage from response
   */
  private extractMarketShare(content: string): number {
    // Look for percentage patterns in context of market share or usage
    const patterns = [
      /market\s+share[^.]*?(\d+(?:\.\d+)?)%/i,
      /(\d+(?:\.\d+)?)%[^.]*(?:market|users?|browsers?|traffic)/i,
      /usage[^.]*?(\d+(?:\.\d+)?)%/i,
      /(\d+(?:\.\d+)?)%[^.]*(?:affected|impacted)/i
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const percentage = parseFloat(match[1]);
        if (percentage >= 0 && percentage <= 100) {
          return percentage / 100;
        }
      }
    }
    
    // Fallback: look for any percentage and validate it's reasonable
    const anyPercentMatch = content.match(/(\d+(?:\.\d+)?)%/);
    if (anyPercentMatch && anyPercentMatch[1]) {
      const percentage = parseFloat(anyPercentMatch[1]);
      if (percentage >= 0.1 && percentage <= 50) { // Reasonable range for browser market share
        return percentage / 100;
      }
    }
    
    return 0.05; // Default 5% if not found
  }

  /**
   * Get current violation being processed (for fallback messages)
   */
  private getCurrentViolation(): Violation | null {
    // This would be set during processing, but for now return null
    return null;
  }

  /**
   * Extract fix strategy from response
   */
  private extractFixStrategy(content: string): string {
    // Look for strategy keywords
    const strategies = [
      'progressive enhancement',
      'feature detection',
      'polyfill',
      'fallback',
      '@supports',
      'graceful degradation'
    ];
    
    for (const strategy of strategies) {
      if (content.toLowerCase().includes(strategy)) {
        return strategy;
      }
    }
    
    return 'progressive enhancement';
  }

  /**
   * Extract best practices from response
   */
  private extractBestPractices(content: string): string[] {
    const practices: string[] = [];
    
    // Look for specific best practices mentioned in the response
    const practicePatterns = [
      { pattern: /@supports|feature detection/i, practice: 'Use @supports for feature detection' },
      { pattern: /fallback|alternative/i, practice: 'Provide fallback implementations' },
      { pattern: /polyfill/i, practice: 'Consider using polyfills' },
      { pattern: /progressive enhancement/i, practice: 'Use progressive enhancement' },
      { pattern: /graceful degradation/i, practice: 'Implement graceful degradation' },
      { pattern: /test|testing/i, practice: 'Test across target browsers' },
      { pattern: /vendor prefix/i, practice: 'Use vendor prefixes when needed' },
      { pattern: /modernizr/i, practice: 'Consider using Modernizr for feature detection' }
    ];
    
    for (const { pattern, practice } of practicePatterns) {
      if (pattern.test(content) && !practices.includes(practice)) {
        practices.push(practice);
      }
    }
    
    // Extract numbered or bulleted best practices from the response
    const listMatches = content.match(/(?:^|\n)\s*[-*•]\s*([^.\n]+)/gm);
    if (listMatches) {
      for (const match of listMatches.slice(0, 3)) { // Limit to 3 additional practices
        const practice = match.replace(/^[\s\n-*•]+/, '').trim();
        if (practice.length > 10 && practice.length < 100 && !practices.some(p => p.includes(practice))) {
          practices.push(practice);
        }
      }
    }
    
    return practices.length > 0 ? practices : ['Follow progressive enhancement principles'];
  }

  /**
   * Clean up plain English explanation
   */
  private cleanupPlainEnglish(content: string): string {
    // Remove excessive whitespace and normalize line breaks
    let cleaned = content.replace(/\n\s*\n/g, '\n\n').trim();
    
    // Remove markdown formatting that might interfere with display
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold
    cleaned = cleaned.replace(/\*(.*?)\*/g, '$1'); // Remove italic
    
    // Ensure it's not too long for display
    if (cleaned.length > 1500) {
      const sentences = cleaned.split(/[.!?]+/);
      let truncated = '';
      for (const sentence of sentences) {
        if (truncated.length + sentence.length > 1400) break;
        truncated += sentence + '.';
      }
      cleaned = truncated + '..';
    }
    
    return cleaned;
  }

  /**
   * Calculate confidence score based on grounding quality
   */
  private calculateConfidence(groundingMetadata: any, content: string): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence if we have grounding sources
    if (groundingMetadata?.groundingChunks?.length > 0) {
      confidence += 0.2;
    }
    
    // Increase confidence if response contains specific data
    if (content.includes('%')) {
      confidence += 0.1;
    }
    
    // Increase confidence if response mentions authoritative sources
    const authoritativeSources = ['mdn', 'web.dev', 'caniuse', 'w3c'];
    if (authoritativeSources.some(source => content.toLowerCase().includes(source))) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Create fallback analysis when API fails
   */
  private createFallbackAnalysis(violation: Violation, error: APIError): Analysis {
    let fallbackMessage = `Analysis unavailable: ${error.message}`;
    let confidence = 0.3;

    // Provide more specific fallback based on error type
    if (error.type === ErrorType.RATE_LIMIT) {
      fallbackMessage = `Rate limit reached. Using basic compatibility analysis for ${violation.feature}.`;
      confidence = 0.4;
    } else if (error.type === ErrorType.AUTHENTICATION) {
      fallbackMessage = `API authentication failed. Using offline compatibility analysis for ${violation.feature}.`;
      confidence = 0.2;
    } else if (error.type === ErrorType.NETWORK) {
      fallbackMessage = `Network unavailable. Using cached compatibility data for ${violation.feature}.`;
      confidence = 0.5;
    }

    // Get fallback suggestions based on error type
    const fallbackSuggestions = ErrorHandler.getFallbackSuggestions(error.type);

    return {
      violation,
      userImpact: `Users on ${violation.browser} ${violation.required} may experience compatibility issues with ${violation.feature}`,
      marketShare: this.estimateMarketShare(violation.browser, violation.required),
      fixStrategy: this.getDefaultFixStrategy(violation.feature),
      bestPractices: [
        'Use @supports for CSS feature detection',
        'Implement fallback solutions',
        'Test across target browsers',
        ...fallbackSuggestions.slice(0, 2)
      ],
      sources: [],
      plainEnglish: `${fallbackMessage} Consider using progressive enhancement techniques and testing across your target browsers.`,
      confidence
    };
  }

  /**
   * Estimate market share for fallback analysis
   */
  private estimateMarketShare(browser: string, version: string): number {
    // Conservative estimates based on typical browser usage patterns
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
        // Rough estimate: older versions have lower usage
        const currentYear = new Date().getFullYear();
        const estimatedYear = 2008 + (versionNum / 10); // Very rough estimation
        const yearsDiff = currentYear - estimatedYear;
        
        if (yearsDiff > 2) {
          return baseShare * 0.1; // Much lower for old versions
        } else if (yearsDiff > 1) {
          return baseShare * 0.3; // Lower for somewhat old versions
        }
      }
    }

    return baseShare;
  }

  /**
   * Get default fix strategy based on feature type
   */
  private getDefaultFixStrategy(feature: string): string {
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
   * Generate cache key for a violation
   */
  private generateCacheKey(violation: Violation): string {
    // Create a hash based on feature, browser, and version
    const keyData = `${violation.feature}:${violation.browser}:${violation.required}:${violation.baselineStatus}`;
    return createHash('md5').update(keyData).digest('hex');
  }

  /**
   * Get cached analysis if available and not expired
   */
  private getCachedAnalysis(cacheKey: string): Analysis | null {
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Cache expired, remove it
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry.analysis;
  }

  /**
   * Cache analysis result
   */
  private cacheAnalysis(cacheKey: string, analysis: Analysis): void {
    const entry: CacheEntry = {
      analysis,
      timestamp: Date.now(),
      ttl: this.cacheTtl
    };
    
    this.cache.set(cacheKey, entry);
    
    // Clean up old entries periodically
    this.cleanupCache();
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached analyses
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size
    };
  }

  /**
   * Analyze multiple violations with concurrency control
   */
  async analyzeViolations(violations: Violation[], maxConcurrent = 3): Promise<Analysis[]> {
    const results: Analysis[] = [];
    
    // Process violations in batches to avoid overwhelming the API
    for (let i = 0; i < violations.length; i += maxConcurrent) {
      const batch = violations.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(violation => this.analyzeViolation(violation));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Error processing batch ${i / maxConcurrent + 1}:`, error);
        
        // Process individually as fallback
        for (const violation of batch) {
          try {
            const analysis = await this.analyzeViolation(violation);
            results.push(analysis);
          } catch (individualError) {
            console.error(`Error analyzing ${violation.feature}:`, individualError);
            results.push(this.createFallbackAnalysis(violation, ErrorHandler.handleAPIError(individualError)));
          }
        }
      }
      
      // Add delay between batches to respect rate limits
      if (i + maxConcurrent < violations.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Validate API key format
   */
  public static validateApiKey(apiKey: string): boolean {
    // Gemini API keys typically start with 'AIza' and are 39 characters long
    // But they can also have other formats, so let's be more flexible
    return /^AIza[A-Za-z0-9_-]{35,}$/.test(apiKey) || apiKey.length >= 20;
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<{ success: boolean; error?: string; errorType?: ErrorType }> {
    try {
      const testPrompt = 'Test connection. Please respond with "OK".';
      const response = await this.makeApiCall(testPrompt);
      
      // If we get here, the API call succeeded
      const data = await response.json();
      
      // Validate we got a proper response
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
}
