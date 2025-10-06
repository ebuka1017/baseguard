import { ConfigurationManager } from './configuration.js';
import { UIComponents } from '../ui/components.js';

/**
 * API key validation patterns and utilities
 */
export class ApiKeyManager {
  /**
   * Validate Jules API key format
   */
  static validateJulesApiKey(apiKey: string): { valid: boolean; error?: string } {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'API key is required' };
    }

    const trimmed = apiKey.trim();
    
    if (trimmed.length < 10) {
      return { valid: false, error: 'API key seems too short' };
    }

    if (trimmed.length > 200) {
      return { valid: false, error: 'API key seems too long' };
    }

    // Basic format validation - Jules keys might have specific patterns
    if (!/^[A-Za-z0-9_\-\.]+$/.test(trimmed)) {
      return { valid: false, error: 'API key contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * Validate Gemini API key format
   */
  static validateGeminiApiKey(apiKey: string): { valid: boolean; error?: string } {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'API key is required' };
    }

    const trimmed = apiKey.trim();
    
    if (trimmed.length < 30) {
      return { valid: false, error: 'Gemini API key seems too short' };
    }

    if (trimmed.length > 100) {
      return { valid: false, error: 'Gemini API key seems too long' };
    }

    // Gemini API keys typically start with "AIza"
    if (!trimmed.startsWith('AIza')) {
      return { valid: false, error: 'Gemini API keys typically start with "AIza"' };
    }

    // Basic format validation
    if (!/^[A-Za-z0-9_\-]+$/.test(trimmed)) {
      return { valid: false, error: 'API key contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * Test Jules API key connectivity
   */
  static async testJulesApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate format first
      const validation = this.validateJulesApiKey(apiKey);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Test connectivity with a simple API call
      const response = await fetch('https://jules.googleapis.com/v1alpha/sessions', {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey.trim(),
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        return { success: false, error: 'Invalid API key or insufficient permissions' };
      }

      if (response.status === 403) {
        return { success: false, error: 'API key does not have required permissions' };
      }

      if (response.status === 429) {
        return { success: false, error: 'Rate limit exceeded. Please try again later' };
      }

      if (!response.ok && response.status !== 404) {
        return { success: false, error: `API error: ${response.status} ${response.statusText}` };
      }

      // 404 is acceptable for a test call to sessions endpoint
      return { success: true };

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return { success: false, error: 'Network error. Please check your internet connection' };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown error occurred during API test' };
    }
  }

  /**
   * Test Gemini API key connectivity
   */
  static async testGeminiApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate format first
      const validation = this.validateGeminiApiKey(apiKey);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Test connectivity with a simple API call
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey.trim()
        }
      });

      if (response.status === 401) {
        return { success: false, error: 'Invalid API key' };
      }

      if (response.status === 403) {
        return { success: false, error: 'API key does not have required permissions' };
      }

      if (response.status === 429) {
        return { success: false, error: 'Rate limit exceeded. Please try again later' };
      }

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status} ${response.statusText}` };
      }

      // Verify we can parse the response
      const data = await response.json();
      if (!data.models || !Array.isArray(data.models)) {
        return { success: false, error: 'Unexpected API response format' };
      }

      return { success: true };

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          return { success: false, error: 'Network error. Please check your internet connection' };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown error occurred during API test' };
    }
  }

  /**
   * Store API keys securely in configuration
   */
  static async storeApiKeys(keys: { jules?: string; gemini?: string }): Promise<void> {
    const config = await ConfigurationManager.load();
    
    if (keys.jules) {
      config.apiKeys.jules = keys.jules.trim();
    }
    
    if (keys.gemini) {
      config.apiKeys.gemini = keys.gemini.trim();
    }
    
    await ConfigurationManager.save(config);
  }

  /**
   * Get stored API keys
   */
  static async getStoredApiKeys(): Promise<{ jules: string | null; gemini: string | null }> {
    const config = await ConfigurationManager.load();
    return {
      jules: config.apiKeys.jules,
      gemini: config.apiKeys.gemini
    };
  }

  /**
   * Check if API keys are configured
   */
  static async hasApiKeys(): Promise<{ jules: boolean; gemini: boolean }> {
    const keys = await this.getStoredApiKeys();
    return {
      jules: !!keys.jules,
      gemini: !!keys.gemini
    };
  }

  /**
   * Clear stored API keys
   */
  static async clearApiKeys(): Promise<void> {
    const config = await ConfigurationManager.load();
    config.apiKeys.jules = null;
    config.apiKeys.gemini = null;
    await ConfigurationManager.save(config);
  }

  /**
   * Validate and test all stored API keys
   */
  static async validateStoredKeys(): Promise<{
    jules: { valid: boolean; error?: string };
    gemini: { valid: boolean; error?: string };
  }> {
    const keys = await this.getStoredApiKeys();
    
    const results = {
      jules: { valid: false, error: 'No API key configured' },
      gemini: { valid: false, error: 'No API key configured' }
    };

    if (keys.jules) {
      const julesResult = await this.testJulesApiKey(keys.jules);
      results.jules = { valid: julesResult.success, error: julesResult.error || '' };
    }

    if (keys.gemini) {
      const geminiResult = await this.testGeminiApiKey(keys.gemini);
      results.gemini = { valid: geminiResult.success, error: geminiResult.error || '' };
    }

    return results;
  }

  /**
   * Get API key status for display
   */
  static async getApiKeyStatus(): Promise<{
    jules: 'configured' | 'missing' | 'invalid';
    gemini: 'configured' | 'missing' | 'invalid';
  }> {
    const keys = await this.getStoredApiKeys();
    const status: {
      jules: 'configured' | 'missing' | 'invalid';
      gemini: 'configured' | 'missing' | 'invalid';
    } = {
      jules: 'missing',
      gemini: 'missing'
    };

    if (keys.jules) {
      const validation = this.validateJulesApiKey(keys.jules);
      status.jules = validation.valid ? 'configured' : 'invalid';
    }

    if (keys.gemini) {
      const validation = this.validateGeminiApiKey(keys.gemini);
      status.gemini = validation.valid ? 'configured' : 'invalid';
    }

    return status;
  }

  /**
   * Show helpful error messages for API failures
   */
  static showApiErrorHelp(service: 'jules' | 'gemini', error: string): void {
    UIComponents.showErrorBox(`${service.toUpperCase()} API Error: ${error}`);
    
    console.log('\nTroubleshooting steps:');
    
    if (service === 'jules') {
      UIComponents.showList([
        'Verify your Jules API key at https://jules.google.com',
        'Check that the Jules GitHub app is installed on your repository',
        'Ensure your API key has the required permissions',
        'Try regenerating your API key if the issue persists'
      ]);
    } else {
      UIComponents.showList([
        'Verify your Gemini API key at https://aistudio.google.com/app/apikey',
        'Check that the Gemini API is enabled in your Google Cloud project',
        'Ensure you have sufficient quota remaining',
        'Try regenerating your API key if the issue persists'
      ]);
    }
  }
}