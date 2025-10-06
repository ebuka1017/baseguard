import { UIComponents } from '../ui/index.js';
import { BaseGuard } from '../core/baseguard.js';
import { ConfigurationManager } from '../core/configuration.js';
import { ErrorHandler } from '../core/error-handler.js';
import { glob } from 'glob';
import chalk from 'chalk';
import type { Violation } from '../types/index.js';

/**
 * Check for compatibility violations
 */
export async function check(options: {
  strict?: boolean;
  files?: string;
  format?: 'table' | 'json' | 'junit';
}): Promise<void> {
  try {
    UIComponents.showHeader();
    
    // Load configuration
    const config = await ConfigurationManager.load();
    
    // Initialize BaseGuard
    const baseGuard = new BaseGuard(config);
    
    const spinner = UIComponents.createSpinner('Scanning files for compatibility issues...');
    spinner.start();
    
    // Get files to check
    const filePattern = options.files || '**/*.{js,jsx,ts,tsx,vue,svelte,css,html}';
    const files = await glob(filePattern, {
      ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '.git/**',
        '**/*.min.js',
        '**/*.min.css'
      ]
    });
    
    if (files.length === 0) {
      spinner.fail('No files found to check');
      UIComponents.showWarningBox('No files matched the pattern. Try adjusting the --files option.');
      return;
    }
    
    spinner.text = `Analyzing ${files.length} files...`;
    
    // Scan for violations
    const violations = await baseGuard.checkViolations(files);
    
    spinner.stop();
    
    // Display results based on format
    switch (options.format) {
      case 'json':
        console.log(JSON.stringify(violations, null, 2));
        break;
      case 'junit':
        UIComponents.showJUnitReport(violations);
        break;
      default:
        UIComponents.showViolations(violations);
        break;
    }
    
    // Show summary
    if (violations.length === 0) {
      UIComponents.showSuccessBox('🎉 No compatibility violations found!');
    } else {
      const summary = {
        total: violations.length,
        byBrowser: violations.reduce((acc, v) => {
          acc[v.browser] = (acc[v.browser] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byFile: violations.reduce((acc, v) => {
          acc[v.file] = (acc[v.file] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };
      
      console.log(chalk.yellow('\n📊 Summary:'));
      console.log(`  Total violations: ${summary.total}`);
      console.log(`  Files affected: ${Object.keys(summary.byFile).length}`);
      console.log(`  Browsers affected: ${Object.keys(summary.byBrowser).join(', ')}`);
      
      UIComponents.showInfoBox('Run "base fix" to automatically fix these issues with AI assistance.');
    }
    
    // Exit with error code if violations found and strict mode
    if (options.strict && violations.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    const apiError = ErrorHandler.handleAPIError(error);
    ErrorHandler.displayError(apiError);
    
    // Provide specific help for check command issues
    console.log('\n💡 Troubleshooting:');
    if (apiError.type === 'configuration') {
      UIComponents.showList([
        'Run "base init" to set up BaseGuard configuration',
        'Check that .baseguardrc.json exists and is valid',
        'Run "base config validate" to check configuration'
      ]);
    } else if (options.files) {
      UIComponents.showList([
        `No files found matching pattern: ${options.files}`,
        'Try a different file pattern (e.g., "src/**/*.ts")',
        'Check that files exist in the specified locations'
      ]);
    } else {
      UIComponents.showList([
        'Check that you\'re in a project directory',
        'Verify file permissions for reading project files',
        'Try running with a specific file pattern: --files "src/**/*.js"'
      ]);
    }
    
    // Show fallback suggestions
    if (ErrorHandler.shouldUseFallbackMode(apiError)) {
      console.log('\n🔄 Fallback options:');
      UIComponents.showList(ErrorHandler.getFallbackSuggestions(apiError.type));
    }
    
    process.exit(1);
  }
}