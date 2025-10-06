import { UIComponents } from '../ui/components.js';

/**
 * Error types for different API operations
 */
export enum ErrorType {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  CONFIGURATION = 'configuration',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

/**
 * Retry configuration for different error types
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: ErrorType[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorType.NETWORK,
    ErrorType.TIMEOUT,
    ErrorType.SERVER_ERROR,
    ErrorType.RATE_LIMIT
  ]
};

/**
 * API operation error with context and recovery suggestions
 */
export class APIError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode?: number;
  public readonly retryAfter?: number;
  public readonly quotaReset?: Date;
  public readonly suggestions: string[];
  public readonly context: Record<string, any>;

  constructor(
    message: string,
    type: ErrorType,
    options: {
      statusCode?: number;
      retryAfter?: number;
      quotaReset?: Date;
      suggestions?: string[];
      context?: Record<string, any>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'APIError';
    this.type = type;
    this.statusCode = options.statusCode;
    this.retryAfter = options.retryAfter;
    this.quotaReset = options.quotaReset;
    this.suggestions = options.suggestions || [];
    this.context = options.context || {};
    
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Comprehensive error handler for API operations
 */
export class ErrorHandler {
  /**
   * Handle and classify API errors
   */
  static handleAPIError(error: any, context: Record<string, any> = {}): APIError {
    // If already an APIError, return as-is
    if (error instanceof APIError) {
      return error;
    }

    // Network/connection errors
    if (this.isNetworkError(error)) {
      return new APIError(
        'Network connection failed. Please check your internet connection.',
        ErrorType.NETWORK,
        {
          suggestions: [
            'Check your internet connection',
            'Verify firewall settings allow outbound HTTPS connections',
            'Try again in a few moments'
          ],
          context,
          cause: error
        }
      );
    }

    // HTTP status code errors
    if (error.response?.status) {
      return this.handleHTTPError(error, context);
    }

    // Timeout errors
    if (this.isTimeoutError(error)) {
      return new APIError(
        'Request timed out. The API service may be experiencing high load.',
        ErrorType.TIMEOUT,
        {
          suggestions: [
            'Try again in a few moments',
            'Check if the API service is experiencing issues',
            'Consider increasing timeout settings'
          ],
          context,
          cause: error
        }
      );
    }

    // Configuration errors
    if (this.isConfigurationError(error)) {
      return new APIError(
        'Configuration error. Please check your API keys and settings.',
        ErrorType.CONFIGURATION,
        {
          suggestions: [
            'Run "base config" to verify your API keys',
            'Check that API keys are valid and not expired',
            'Ensure you have proper permissions for the API'
          ],
          context,
          cause: error
        }
      );
    }

    // Generic error
    return new APIError(
      error.message || 'An unexpected error occurred',
      ErrorType.UNKNOWN,
      {
        suggestions: [
          'Try the operation again',
          'Check the BaseGuard documentation for troubleshooting',
          'Report this issue if it persists'
        ],
        context,
        cause: error
      }
    );
  }

  /**
   * Handle HTTP status code errors
   */
  private static handleHTTPError(error: any, context: Record<string, any>): APIError {
    const status = error.response.status;
    const data = error.response.data;

    switch (status) {
      case 401:
        return new APIError(
          'Authentication failed. Your API key may be invalid or expired.',
          ErrorType.AUTHENTICATION,
          {
            statusCode: status,
            suggestions: [
              'Check that your API key is correct',
              'Verify the API key has not expired',
              'Run "base config" to update your API keys',
              'Ensure you have proper permissions'
            ],
            context
          }
        );

      case 403:
        return new APIError(
          'Access forbidden. You may not have permission for this operation.',
          ErrorType.AUTHENTICATION,
          {
            statusCode: status,
            suggestions: [
              'Check your API key permissions',
              'Verify you have access to the requested resource',
              'Contact support if you believe this is an error'
            ],
            context
          }
        );

      case 429:
        const retryAfter = this.parseRetryAfter(error.response.headers);
        const quotaReset = this.parseQuotaReset(error.response.headers);
        
        return new APIError(
          'Rate limit exceeded. Please wait before making more requests.',
          ErrorType.RATE_LIMIT,
          {
            statusCode: status,
            retryAfter,
            quotaReset,
            suggestions: [
              retryAfter ? `Wait ${retryAfter} seconds before retrying` : 'Wait before retrying',
              'Consider reducing the frequency of requests',
              quotaReset ? `Quota resets at ${quotaReset.toLocaleString()}` : 'Check your quota limits'
            ],
            context
          }
        );

      case 400:
        return new APIError(
          data?.message || 'Invalid request. Please check your input parameters.',
          ErrorType.INVALID_REQUEST,
          {
            statusCode: status,
            suggestions: [
              'Check the request parameters',
              'Verify the data format is correct',
              'Review the API documentation for requirements'
            ],
            context
          }
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return new APIError(
          'Server error. The API service is experiencing issues.',
          ErrorType.SERVER_ERROR,
          {
            statusCode: status,
            suggestions: [
              'Try again in a few moments',
              'Check the API service status page',
              'Report the issue if it persists'
            ],
            context
          }
        );

      default:
        return new APIError(
          data?.message || `HTTP ${status}: ${error.message}`,
          ErrorType.UNKNOWN,
          {
            statusCode: status,
            suggestions: [
              'Check the API documentation',
              'Try the request again',
              'Report this issue if it persists'
            ],
            context
          }
        );
    }
  }

  /**
   * Check if error is a network/connection error
   */
  private static isNetworkError(error: any): boolean {
    return (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ENETUNREACH' ||
      error.message?.includes('network') ||
      error.message?.includes('connection')
    );
  }

  /**
   * Check if error is a timeout error
   */
  private static isTimeoutError(error: any): boolean {
    return (
      error.code === 'ETIMEDOUT' ||
      error.code === 'TIMEOUT' ||
      error.message?.includes('timeout')
    );
  }

  /**
   * Check if error is a configuration error
   */
  private static isConfigurationError(error: any): boolean {
    return (
      error.message?.includes('API key') ||
      error.message?.includes('configuration') ||
      error.message?.includes('invalid key')
    );
  }

  /**
   * Parse retry-after header
   */
  private static parseRetryAfter(headers: any): number | undefined {
    const retryAfter = headers?.['retry-after'] || headers?.['Retry-After'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? undefined : seconds;
    }
    return undefined;
  }

  /**
   * Parse quota reset time from headers
   */
  private static parseQuotaReset(headers: any): Date | undefined {
    const reset = headers?.['x-ratelimit-reset'] || headers?.['X-RateLimit-Reset'];
    if (reset) {
      const timestamp = parseInt(reset, 10);
      return isNaN(timestamp) ? undefined : new Date(timestamp * 1000);
    }
    return undefined;
  }

  /**
   * Retry operation with exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: APIError;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const apiError = this.handleAPIError(error);
        lastError = apiError;

        // Don't retry if this is the last attempt
        if (attempt === retryConfig.maxRetries) {
          break;
        }

        // Don't retry if error type is not retryable
        if (!retryConfig.retryableErrors.includes(apiError.type)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
          retryConfig.maxDelay
        );

        // Use retry-after header if available
        const actualDelay = apiError.retryAfter ? apiError.retryAfter * 1000 : delay;

        console.log(`Retrying in ${Math.ceil(actualDelay / 1000)} seconds... (attempt ${attempt + 1}/${retryConfig.maxRetries})`);
        await this.sleep(actualDelay);
      }
    }

    throw lastError!;
  }

  /**
   * Display error to user with helpful information
   */
  static displayError(error: APIError): void {
    UIComponents.showErrorBox(error.message);

    if (error.suggestions.length > 0) {
      console.log('\nSuggestions:');
      UIComponents.showList(error.suggestions);
    }

    // Show additional context for specific error types
    switch (error.type) {
      case ErrorType.RATE_LIMIT:
        if (error.retryAfter) {
          UIComponents.showWarningBox(`Rate limited. Retry after ${error.retryAfter} seconds.`);
        }
        if (error.quotaReset) {
          UIComponents.showInfoBox(`Quota resets at: ${error.quotaReset.toLocaleString()}`);
        }
        break;

      case ErrorType.AUTHENTICATION:
        UIComponents.showWarningBox('Run "base config" to update your API keys.');
        break;

      case ErrorType.NETWORK:
        UIComponents.showWarningBox('Check your internet connection and try again.');
        break;
    }
  }

  /**
   * Get fallback mode suggestions when APIs are unavailable
   */
  static getFallbackSuggestions(errorType: ErrorType): string[] {
    switch (errorType) {
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
        return [
          'Use offline mode for basic compatibility checking',
          'Review violations manually using browser compatibility tables',
          'Try again when network connection is restored'
        ];

      case ErrorType.RATE_LIMIT:
      case ErrorType.QUOTA_EXCEEDED:
        return [
          'Continue with basic violation detection without AI analysis',
          'Review violations manually',
          'Try AI features again later when quota resets'
        ];

      case ErrorType.AUTHENTICATION:
        return [
          'Use BaseGuard without AI features',
          'Update API keys when available',
          'Review violations manually using web compatibility resources'
        ];

      default:
        return [
          'Continue with basic compatibility checking',
          'Review violations manually',
          'Try AI features again later'
        ];
    }
  }

  /**
   * Check if operation should continue in fallback mode
   */
  static shouldUseFallbackMode(error: APIError): boolean {
    return [
      ErrorType.NETWORK,
      ErrorType.TIMEOUT,
      ErrorType.AUTHENTICATION,
      ErrorType.RATE_LIMIT,
      ErrorType.QUOTA_EXCEEDED
    ].includes(error.type);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate API response structure
   */
  static validateAPIResponse(response: any, expectedFields: string[]): void {
    if (!response || typeof response !== 'object') {
      throw new APIError(
        'Invalid API response format',
        ErrorType.VALIDATION,
        {
          suggestions: [
            'Check API service status',
            'Verify API version compatibility',
            'Try the request again'
          ]
        }
      );
    }

    const missingFields = expectedFields.filter(field => !(field in response));
    if (missingFields.length > 0) {
      throw new APIError(
        `API response missing required fields: ${missingFields.join(', ')}`,
        ErrorType.VALIDATION,
        {
          suggestions: [
            'Check API documentation for response format',
            'Verify API version compatibility',
            'Report this issue if it persists'
          ],
          context: { missingFields, response }
        }
      );
    }
  }

  /**
   * Create context object for error reporting
   */
  static createContext(operation: string, params?: Record<string, any>): Record<string, any> {
    return {
      operation,
      timestamp: new Date().toISOString(),
      params: params || {},
      version: process.env.npm_package_version || 'unknown'
    };
  }
}