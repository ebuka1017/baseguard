import chalk from 'chalk';
import * as Table from 'cli-table3';
import boxen from 'boxen';
import ora, { type Ora } from 'ora';
import type { Violation, Analysis, Fix, Configuration } from '../types/index.js';

/**
 * Color scheme for consistent CLI output
 */
export const Colors = {
  primary: chalk.cyan,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  muted: chalk.gray,
  highlight: chalk.magenta,
  feature: chalk.white.bold,
  file: chalk.dim,
  browser: chalk.yellow,
  baseline: chalk.cyan
} as const;

/**
 * UI components for beautiful CLI output
 */
export { Prompts } from './prompts.js';

export class UIComponents {
  /**
   * Display violations grouped by file with clear visual hierarchy
   */
  static showViolations(violations: Violation[]): void {
    if (violations.length === 0) {
      this.showSuccessBox('No compatibility violations found! 🎉');
      return;
    }

    this.showSectionHeader(`Found ${violations.length} compatibility violation${violations.length === 1 ? '' : 's'}`);

    // Group violations by file
    const violationsByFile = this.groupViolationsByFile(violations);

    Object.entries(violationsByFile).forEach(([file, fileViolations]) => {
      console.log(`\n${Colors.file.bold(file)}`);
      console.log(Colors.muted('─'.repeat(Math.min(file.length, 60))));

      fileViolations.forEach((violation, index) => {
        this.showSingleViolation(violation, index + 1);
      });
    });

    // Show summary
    this.showViolationSummary(violations);
  }

  /**
   * Display a single violation with context and details
   */
  static showSingleViolation(violation: Violation, index: number): void {
    const lineInfo = `${Colors.muted('Line')} ${Colors.highlight(violation.line.toString())}`;
    const featureInfo = `${Colors.feature(violation.feature)}`;
    const browserInfo = `${Colors.browser(violation.browser)} ${violation.required}`;
    const baselineInfo = this.formatBaselineStatus(violation.baselineStatus);

    console.log(`\n  ${Colors.error('●')} ${featureInfo} ${Colors.muted('at')} ${lineInfo}`);
    console.log(`    ${Colors.muted('Browser:')} ${browserInfo}`);
    console.log(`    ${Colors.muted('Baseline:')} ${baselineInfo}`);
    
    if (violation.reason) {
      console.log(`    ${Colors.muted('Issue:')} ${violation.reason}`);
    }

    // Show code context with syntax highlighting
    if (violation.context) {
      console.log(`    ${Colors.muted('Context:')}`);
      this.showCodeContext(violation.context, violation.line, violation.column);
    }
  }

  /**
   * Show code context with basic syntax highlighting
   */
  static showCodeContext(context: string, line: number, column: number): void {
    const lines = context.split('\n');
    const contextLines = lines.slice(Math.max(0, lines.length - 3), lines.length);
    
    contextLines.forEach((contextLine, index) => {
      const lineNumber = line - (contextLines.length - 1 - index);
      const isTargetLine = lineNumber === line;
      
      const lineNumberStr = Colors.muted(lineNumber.toString().padStart(3));
      const prefix = isTargetLine ? Colors.error('►') : Colors.muted('│');
      const content = isTargetLine ? Colors.highlight(contextLine) : Colors.muted(contextLine);
      
      console.log(`      ${lineNumberStr} ${prefix} ${content}`);
      
      // Show column indicator for target line
      if (isTargetLine && column > 0) {
        const spaces = ' '.repeat(6 + 4 + column - 1);
        console.log(`${spaces}${Colors.error('^')}`);
      }
    });
  }

  /**
   * Format baseline status with appropriate colors
   */
  static formatBaselineStatus(status: string): string {
    switch (status) {
      case 'widely':
        return Colors.success('✓ Widely supported');
      case 'newly':
        return Colors.warning('⚠ Newly available');
      case 'false':
        return Colors.error('✗ Not baseline');
      default:
        return Colors.muted(`${status}`);
    }
  }

  /**
   * Group violations by file for organized display
   */
  static groupViolationsByFile(violations: Violation[]): Record<string, Violation[]> {
    return violations.reduce((groups, violation) => {
      const file = violation.file;
      if (!groups[file]) {
        groups[file] = [];
      }
      groups[file].push(violation);
      return groups;
    }, {} as Record<string, Violation[]>);
  }

  /**
   * Show violation summary with actionable next steps
   */
  static showViolationSummary(violations: Violation[]): void {
    console.log('\n');
    this.showSectionHeader('Summary');

    // Count by browser
    const browserCounts = violations.reduce((counts, v) => {
      const key = `${v.browser} ${v.required}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // Count by baseline status
    const baselineCounts = violations.reduce((counts, v) => {
      counts[v.baselineStatus] = (counts[v.baselineStatus] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // Show browser breakdown
    console.log(Colors.muted('Affected browsers:'));
    Object.entries(browserCounts).forEach(([browser, count]) => {
      console.log(`  ${Colors.browser('●')} ${browser}: ${Colors.highlight(count.toString())} issue${count === 1 ? '' : 's'}`);
    });

    // Show baseline breakdown
    console.log(Colors.muted('\nBaseline status:'));
    Object.entries(baselineCounts).forEach(([status, count]) => {
      const statusDisplay = this.formatBaselineStatus(status);
      console.log(`  ${statusDisplay}: ${Colors.highlight(count.toString())} issue${count === 1 ? '' : 's'}`);
    });

    // Show next steps
    console.log(Colors.muted('\nNext steps:'));
    this.showList([
      `Run ${Colors.primary('base fix')} to automatically fix issues with AI`,
      `Run ${Colors.primary('base check --strict')} to see detailed analysis`,
      `Configure different browser targets with ${Colors.primary('base config targets')}`
    ]);
  }

  /**
   * Display analysis results with sources and recommendations
   */
  static showAnalysis(analysis: Analysis): void {
    const { violation, userImpact, fixStrategy, bestPractices, sources, plainEnglish, confidence } = analysis;
    
    console.log(`\n${Colors.highlight('🧠 AI Analysis')}`);
    console.log(Colors.muted('─'.repeat(20)));
    
    console.log(`${Colors.feature(violation.feature)} ${Colors.muted('in')} ${Colors.file(violation.file)}`);
    
    if (userImpact) {
      console.log(`\n${Colors.muted('User Impact:')} ${userImpact}`);
    }
    
    if (fixStrategy) {
      console.log(`${Colors.muted('Fix Strategy:')} ${fixStrategy}`);
    }
    
    if (bestPractices.length > 0) {
      console.log(`\n${Colors.muted('Best Practices:')}`);
      this.showList(bestPractices);
    }
    
    if (plainEnglish) {
      console.log(`\n${Colors.muted('Explanation:')}`);
      console.log(this.wrapText(plainEnglish, 70));
    }
    
    if (sources.length > 0) {
      console.log(`\n${Colors.muted('Sources:')}`);
      sources.forEach(source => {
        console.log(`  ${Colors.info('🔗')} ${Colors.primary(source)}`);
      });
    }
    
    const confidenceColor = confidence > 0.8 ? Colors.success : confidence > 0.6 ? Colors.warning : Colors.error;
    console.log(`\n${Colors.muted('Confidence:')} ${confidenceColor((confidence * 100).toFixed(0) + '%')}`);
  }

  /**
   * Display fix preview with diff-like formatting
   */
  static showFixPreview(fix: Fix): void {
    console.log(`\n${Colors.highlight('🔧 Proposed Fix')}`);
    console.log(Colors.muted('─'.repeat(20)));
    
    console.log(`${Colors.file(fix.filePath)}`);
    console.log(`${Colors.muted('Explanation:')} ${fix.explanation}`);
    
    if (fix.patch) {
      console.log(`\n${Colors.muted('Changes:')}`);
      this.showDiff(fix.patch);
    }
    
    if (fix.preview) {
      console.log(`\n${Colors.muted('Preview:')}`);
      console.log(this.wrapText(fix.preview, 70));
    }
    
    const confidenceColor = fix.confidence > 0.8 ? Colors.success : fix.confidence > 0.6 ? Colors.warning : Colors.error;
    console.log(`\n${Colors.muted('Confidence:')} ${confidenceColor((fix.confidence * 100).toFixed(0) + '%')}`);
  }

  /**
   * Display diff with syntax highlighting
   */
  static showDiff(patch: string): void {
    const lines = patch.split('\n');
    
    lines.forEach(line => {
      if (line.startsWith('+')) {
        console.log(`    ${Colors.success(line)}`);
      } else if (line.startsWith('-')) {
        console.log(`    ${Colors.error(line)}`);
      } else if (line.startsWith('@@')) {
        console.log(`    ${Colors.info(line)}`);
      } else {
        console.log(`    ${Colors.muted(line)}`);
      }
    });
  }

  /**
   * Show configuration in a readable format
   */
  static showConfiguration(config: Configuration): void {
    this.showSectionHeader('BaseGuard Configuration');
    
    console.log(`${Colors.muted('Version:')} ${config.version}`);
    
    console.log(`\n${Colors.muted('Browser Targets:')}`);
    config.targets.forEach(target => {
      const version = target.minVersion === 'baseline' ? Colors.baseline('baseline') : 
                     target.minVersion === 'baseline-newly' ? Colors.warning('baseline-newly') :
                     Colors.highlight(target.minVersion);
      console.log(`  ${Colors.browser('●')} ${target.browser} ${version}`);
    });
    
    console.log(`\n${Colors.muted('API Keys:')}`);
    const julesStatus = config.apiKeys.jules ? Colors.success('✓ Configured') : Colors.error('✗ Not set');
    const geminiStatus = config.apiKeys.gemini ? Colors.success('✓ Configured') : Colors.error('✗ Not set');
    console.log(`  ${Colors.muted('Jules:')} ${julesStatus}`);
    console.log(`  ${Colors.muted('Gemini:')} ${geminiStatus}`);
    
    if (config.automation) {
      console.log(`\n${Colors.muted('Git Automation:')}`);
      const enabledStatus = config.automation.enabled ? Colors.success('✓ Enabled') : Colors.error('✗ Disabled');
      console.log(`  ${Colors.muted('Status:')} ${enabledStatus}`);
      
      if (config.automation.enabled) {
        console.log(`  ${Colors.muted('Trigger:')} ${config.automation.trigger}`);
        console.log(`  ${Colors.muted('Auto-analyze:')} ${config.automation.autoAnalyze ? '✓' : '✗'}`);
        console.log(`  ${Colors.muted('Auto-fix:')} ${config.automation.autoFix ? '✓' : '✗'}`);
        console.log(`  ${Colors.muted('Block commits:')} ${config.automation.blockCommit ? '✓' : '✗'}`);
      }
    }
  }

  /**
   * Wrap text to specified width
   */
  static wrapText(text: string, width: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    words.forEach(word => {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    
    return lines.map(line => `    ${line}`).join('\n');
  }

  /**
   * Create a spinner for long-running operations
   */
  static createSpinner(text: string): Ora {
    return ora({
      text: Colors.primary(text),
      spinner: 'dots',
      color: 'cyan'
    });
  }

  /**
   * Show success message in a box
   */
  static showSuccessBox(message: string): void {
    console.log(boxen(
      Colors.success.bold('✅ ' + message),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green'
      }
    ));
  }

  /**
   * Show error message in a box
   */
  static showErrorBox(message: string): void {
    console.log(boxen(
      Colors.error.bold('❌ ' + message),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'red'
      }
    ));
  }

  /**
   * Show warning message in a box
   */
  static showWarningBox(message: string): void {
    console.log(boxen(
      Colors.warning.bold('⚠️ ' + message),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow'
      }
    ));
  }

  /**
   * Show info message in a box
   */
  static showInfoBox(message: string): void {
    console.log(boxen(
      Colors.info.bold('ℹ️ ' + message),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan'
      }
    ));
  }

  /**
   * Show a formatted header with Baseguard branding
   */
  static showHeader(): void {
    const header = `
${Colors.primary.bold('🛡️  Baseguard')} ${Colors.muted('- Never ship incompatible code again')}
${Colors.muted('━'.repeat(60))}
    `.trim();
    console.log(header);
  }

  /**
   * Show the full terminal header with ASCII art
   */
  static showFullHeader(): void {
    try {
      // Use the simple header for now
      this.showTerminalHeader();
    } catch {
      // Fallback to simple header if terminal-header is not available
      this.showHeader();
    }
  }

  /**
   * Show beautiful terminal header with ASCII art
   */
  static showTerminalHeader(): void {
    console.clear();
    
    // Well-spaced ASCII art for "Baseguard" - monochrome for good contrast
    const logo = `
██████╗   █████╗  ███████╗ ███████╗  ██████╗  ██╗   ██╗  █████╗  ██████╗  ██████╗ 
██╔══██╗ ██╔══██╗ ██╔════╝ ██╔════╝ ██╔════╝  ██║   ██║ ██╔══██╗ ██╔══██╗ ██╔══██╗
██████╔╝ ███████║ ███████╗ █████╗   ██║  ███╗ ██║   ██║ ███████║ ██████╔╝ ██║  ██║
██╔══██╗ ██╔══██║ ╚════██║ ██╔══╝   ██║   ██║ ██║   ██║ ██╔══██║ ██╔══██╗ ██║  ██║
██████╔╝ ██║  ██║ ███████║ ███████╗ ╚██████╔╝ ╚██████╔╝ ██║  ██║ ██║  ██║ ██████╔╝
╚═════╝  ╚═╝  ╚═╝ ╚══════╝ ╚══════╝  ╚═════╝   ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═════╝ 
    `;

    // Use monochrome styling for good contrast
    console.log(chalk.bold.white(logo));

    // Tagline with styling
    console.log(
      chalk.bold.white('                    Ship Modern Code') + 
      chalk.dim(' ✨\n')
    );
  }

  /**
   * Show a formatted section header
   */
  static showSectionHeader(title: string): void {
    console.log(`\n${Colors.highlight.bold(title)}`);
    console.log(Colors.muted('─'.repeat(title.length)));
  }

  /**
   * Create a formatted table for displaying data
   */
  static createTable(headers: string[]): any {
    return new (Table as any)({
      head: headers.map(h => Colors.primary.bold(h)),
      style: {
        head: [],
        border: ['dim'],
        'padding-left': 1,
        'padding-right': 1
      },
      chars: {
        'top': '─',
        'top-mid': '┬',
        'top-left': '┌',
        'top-right': '┐',
        'bottom': '─',
        'bottom-mid': '┴',
        'bottom-left': '└',
        'bottom-right': '┘',
        'left': '│',
        'left-mid': '├',
        'mid': '─',
        'mid-mid': '┼',
        'right': '│',
        'right-mid': '┤',
        'middle': '│'
      }
    });
  }

  /**
   * Show a progress indicator
   */
  static showProgress(current: number, total: number, operation: string): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    
    process.stdout.write(`\r${Colors.primary('[')}${Colors.success(progressBar)}${Colors.primary(']')} ${percentage}% ${Colors.muted(operation)}`);
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Clear the current line (useful for progress indicators)
   */
  static clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * Show a simple status message with icon
   */
  static showStatus(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    const colors = {
      success: Colors.success,
      error: Colors.error,
      warning: Colors.warning,
      info: Colors.info
    };
    
    console.log(`${icons[type]} ${colors[type](message)}`);
  }

  /**
   * Show a list of items with bullets
   */
  static showList(items: string[], bullet: string = '•'): void {
    items.forEach(item => {
      console.log(`  ${Colors.muted(bullet)} ${item}`);
    });
  }

  /**
   * Show a key-value pair
   */
  static showKeyValue(key: string, value: string, indent: number = 0): void {
    const spaces = ' '.repeat(indent);
    console.log(`${spaces}${Colors.muted(key + ':')} ${value}`);
  }

  /**
   * Show JUnit XML report for violations
   */
  static showJUnitReport(violations: Violation[]): void {
    const testSuites = this.groupViolationsByFile(violations);
    const totalTests = Object.keys(testSuites).length;
    const totalFailures = violations.length;
    
    console.log('<?xml version="1.0" encoding="UTF-8"?>');
    console.log(`<testsuites tests="${totalTests}" failures="${totalFailures}" time="0">`);
    
    Object.entries(testSuites).forEach(([file, fileViolations]) => {
      console.log(`  <testsuite name="${file}" tests="1" failures="${fileViolations.length}" time="0">`);
      
      if (fileViolations.length > 0) {
        console.log(`    <testcase name="compatibility-check" classname="${file}">`);
        fileViolations.forEach(violation => {
          console.log(`      <failure message="${violation.feature} not compatible with ${violation.browser} ${violation.required}">`);
          console.log(`        ${violation.reason || 'Compatibility violation detected'}`);
          console.log(`        Line: ${violation.line}, Column: ${violation.column}`);
          console.log('      </failure>');
        });
        console.log('    </testcase>');
      } else {
        console.log(`    <testcase name="compatibility-check" classname="${file}"/>`);
      }
      
      console.log('  </testsuite>');
    });
    
    console.log('</testsuites>');
  }
}