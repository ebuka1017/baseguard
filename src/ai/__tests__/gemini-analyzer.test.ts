import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAnalyzer } from '../gemini-analyzer.js';
import type { Violation } from '../../types/index.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('GeminiAnalyzer', () => {
  let analyzer: GeminiAnalyzer;
  const mockApiKey = 'AIzaSyDummyKeyForTesting1234567890123456789';

  beforeEach(() => {
    analyzer = new GeminiAnalyzer(mockApiKey);
    vi.clearAllMocks();
  });

  const mockViolation: Violation = {
    feature: 'container-type',
    featureId: 'container-queries',
    file: 'src/Card.css',
    line: 15,
    column: 5,
    context: '  container-type: inline-size;',
    browser: 'safari',
    required: '15',
    actual: false,
    baselineStatus: 'newly',
    reason: 'Not supported in Safari 15'
  };

  describe('API Key Validation', () => {
    it('should validate correct API key format', () => {
      expect(GeminiAnalyzer.validateApiKey(mockApiKey)).toBe(true);
    });

    it('should reject invalid API key format', () => {
      expect(GeminiAnalyzer.validateApiKey('invalid-key')).toBe(false);
      expect(GeminiAnalyzer.validateApiKey('AIza123')).toBe(false); // too short
    });
  });

  describe('Cache Management', () => {
    it('should cache analysis results', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: 'Test analysis response with 5% market share impact.' }]
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://web.dev/container-queries' } }
              ]
            }
          }]
        })
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      // First call should hit the API
      const analysis1 = await analyzer.analyzeViolation(mockViolation);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const analysis2 = await analyzer.analyzeViolation(mockViolation);
      expect(fetch).toHaveBeenCalledTimes(1); // Still only 1 call
      
      expect(analysis1.violation.feature).toBe(analysis2.violation.feature);
    });

    it('should clear cache when requested', async () => {
      analyzer.clearCache();
      const stats = analyzer.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const analysis = await analyzer.analyzeViolation(mockViolation);
      
      expect(analysis.confidence).toBe(0.3); // Fallback confidence
      expect(analysis.plainEnglish).toContain('API error');
      expect(analysis.fixStrategy).toBe('progressive enhancement');
    });

    it('should handle invalid API responses', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ candidates: [] })
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const analysis = await analyzer.analyzeViolation(mockViolation);
      
      expect(analysis.confidence).toBe(0.3);
      expect(analysis.plainEnglish).toContain('API error');
    });
  });

  describe('Response Parsing', () => {
    it('should extract market share from response', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: 'This affects approximately 8.5% of users on Safari 15.' }]
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://caniuse.com/css-container-queries' } }
              ]
            }
          }]
        })
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const analysis = await analyzer.analyzeViolation(mockViolation);
      
      expect(analysis.marketShare).toBe(0.085);
      expect(analysis.sources).toContain('https://caniuse.com/css-container-queries');
    });

    it('should extract best practices from response', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ 
                text: 'Use @supports for feature detection. Consider using polyfills. Test across target browsers.' 
              }]
            },
            groundingMetadata: { groundingChunks: [] }
          }]
        })
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const analysis = await analyzer.analyzeViolation(mockViolation);
      
      expect(analysis.bestPractices).toContain('Use @supports for feature detection');
      expect(analysis.bestPractices).toContain('Consider using polyfills');
      expect(analysis.bestPractices).toContain('Test across target browsers');
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple violations with concurrency control', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: 'Test analysis response.' }]
            },
            groundingMetadata: { groundingChunks: [] }
          }]
        })
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const violations = [mockViolation, { ...mockViolation, feature: 'dialog' }];
      const analyses = await analyzer.analyzeViolations(violations, 2);
      
      expect(analyses).toHaveLength(2);
      expect(analyses[0].violation.feature).toBe('container-type');
      expect(analyses[1].violation.feature).toBe('dialog');
    });
  });
});