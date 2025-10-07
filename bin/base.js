#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { init, check, fix, config, automation, status, diagnostics } from '../dist/commands/index.js';
import { showTerminalHeader, showVersionInfo, showGlobalHelp } from '../dist/ui/index.js';
import { StartupOptimizer } from '../dist/core/startup-optimizer.js';

// Initialize startup optimizations with timeout
const startupPromise = Promise.race([
  StartupOptimizer.initialize().then(() => {
    // Run additional startup optimizations
    return StartupOptimizer.optimizeStartup();
  }),
  new Promise(resolve => setTimeout(resolve, 1000)) // Max 1 second for startup
]).catch(() => {
  // Ignore startup errors, continue with CLI
});

const program = new Command();

program
  .name('base')
  .description(chalk.cyan('🛡️ BaseGuard - Never ship incompatible code again\n') + 
    chalk.dim('Intelligent browser compatibility enforcement with AI-powered analysis and autonomous fixing'))
  .version('1.0.3')
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str))
  })
  .configureHelp({
    helpWidth: 100,
    sortSubcommands: true
  })
  .addHelpText('after', `
${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base init                    ${chalk.gray('# Initialize BaseGuard in your project')}
  ${chalk.dim('$')} base check                   ${chalk.gray('# Check for compatibility violations')}
  ${chalk.dim('$')} base fix                     ${chalk.gray('# Fix violations with AI assistance')}
  ${chalk.dim('$')} base config set-keys        ${chalk.gray('# Configure API keys for AI services')}
  ${chalk.dim('$')} base automation enable      ${chalk.gray('# Enable git hooks for automatic checking')}

${chalk.cyan('Getting Started:')}
  1. Run ${chalk.white('base init')} to set up BaseGuard in your project
  2. Configure API keys with ${chalk.white('base config set-keys')} for AI features
  3. Enable automation with ${chalk.white('base automation enable')}
  4. Check compatibility with ${chalk.white('base check')}

${chalk.cyan('Documentation:')}
  ${chalk.blue('https://github.com/baseguard/baseguard#readme')}

${chalk.cyan('Support:')}
  ${chalk.blue('https://github.com/baseguard/baseguard/issues')}
`);

// Initialize BaseGuard in project
program
  .command('init')
  .description('Initialize BaseGuard in your project with guided setup')
  .option('--preset <preset>', 'Browser target preset (baseline-widely, baseline-newly, last-2-years, custom)', 'baseline-widely')
  .option('--skip-hooks', 'Skip git hook installation during setup')
  .option('--skip-api-keys', 'Skip API key configuration during setup')
  .addHelpText('after', `
${chalk.cyan('Browser Target Presets:')}
  ${chalk.white('baseline-widely')}   Support features available in Baseline for 30+ months
  ${chalk.white('baseline-newly')}    Support newly available Baseline features  
  ${chalk.white('last-2-years')}     Support browsers from the last 2 years
  ${chalk.white('custom')}           Configure custom browser targets interactively

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base init                           ${chalk.gray('# Interactive setup with baseline-widely preset')}
  ${chalk.dim('$')} base init --preset baseline-newly  ${chalk.gray('# Use baseline-newly preset')}
  ${chalk.dim('$')} base init --skip-hooks             ${chalk.gray('# Skip git hook installation')}
  ${chalk.dim('$')} base init --preset custom          ${chalk.gray('# Configure custom browser targets')}

${chalk.cyan('What this does:')}
  • Creates .baseguardrc.json configuration file
  • Sets up browser compatibility targets
  • Configures API keys for AI services (optional)
  • Installs git hooks for automation (optional)
  • Adds .baseguardrc.json to .gitignore for security
`)
  .action(async (options) => {
    await startupPromise;
    await StartupOptimizer.optimizeForUseCase('init');
    return init(options);
  });

// Check for compatibility violations
program
  .command('check')
  .description('Scan code for browser compatibility violations using Baseline data')
  .option('--strict', 'Exit with error code if violations are found (useful for CI/CD)')
  .option('--files <pattern>', 'File pattern to check using glob syntax', '**/*.{js,jsx,ts,tsx,vue,svelte,css,html}')
  .option('--format <format>', 'Output format for results', 'table')
  .option('--debug', 'Enable debug logging for troubleshooting')
  .option('--offline', 'Run in offline mode (no network requests)')
  .addHelpText('after', `
${chalk.cyan('Output Formats:')}
  ${chalk.white('table')}    Human-readable table format (default)
  ${chalk.white('json')}     JSON format for programmatic use
  ${chalk.white('junit')}    JUnit XML format for CI/CD integration

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base check                              ${chalk.gray('# Check all supported files')}
  ${chalk.dim('$')} base check --strict                     ${chalk.gray('# Exit with error if violations found')}
  ${chalk.dim('$')} base check --files "src/**/*.ts"        ${chalk.gray('# Check only TypeScript files in src/')}
  ${chalk.dim('$')} base check --format json                ${chalk.gray('# Output results as JSON')}
  ${chalk.dim('$')} base check --files "*.css" --strict     ${chalk.gray('# Check CSS files with strict mode')}

${chalk.cyan('File Patterns:')}
  Supports glob patterns like:
  • ${chalk.white('"src/**/*.{js,ts}"')} - All JS/TS files in src/ and subdirectories
  • ${chalk.white('"components/*.vue"')} - All Vue files in components/
  • ${chalk.white('"**/*.css"')} - All CSS files in project

${chalk.cyan('What this checks:')}
  • CSS properties, selectors, and at-rules
  • JavaScript APIs and ECMAScript features  
  • HTML elements and attributes
  • Framework-specific files (React, Vue, Svelte)
  • Web platform APIs (Canvas, WebGL, WebRTC, WebAssembly, etc.)
`)
  .action(async (options) => {
    await startupPromise;
    await StartupOptimizer.optimizeForUseCase('check');
    return check(options);
  });

// Fix violations with AI
program
  .command('fix')
  .description('Analyze and fix compatibility violations using AI (requires API keys)')
  .option('--auto', 'Apply fixes automatically without interactive confirmation')
  .option('--analyze-only', 'Only run AI analysis without generating code fixes')
  .option('--files <pattern>', 'File pattern to fix using glob syntax', '**/*.{js,jsx,ts,tsx,vue,svelte,css,html}')
  .addHelpText('after', `
${chalk.cyan('Prerequisites:')}
  • Gemini API key (for analysis and fixing) - Get from ${chalk.blue('https://aistudio.google.com')}
  • Jules API key (optional, for GitHub repos) - Get from ${chalk.blue('https://jules.google.com')}
  • Choose your coding agent: "base config coding-agent"

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base fix                                 ${chalk.gray('# Interactive fix with confirmation prompts')}
  ${chalk.dim('$')} base fix --auto                          ${chalk.gray('# Apply all fixes automatically')}
  ${chalk.dim('$')} base fix --analyze-only                  ${chalk.gray('# Only analyze, don\'t generate fixes')}
  ${chalk.dim('$')} base fix --files "src/**/*.css"          ${chalk.gray('# Fix only CSS files in src/')}

${chalk.cyan('How it works:')}
  1. ${chalk.white('Scan')} - Detects compatibility violations using Baseline data
  2. ${chalk.white('Analyze')} - Gemini AI researches impact and fix strategies  
  3. ${chalk.white('Fix')} - AI generates progressive enhancement code (Jules or Gemini)
  4. ${chalk.white('Review')} - Shows preview of changes before applying
  5. ${chalk.white('Apply')} - Updates files with compatibility fixes

${chalk.cyan('Coding Agents:')}
  • ${chalk.white('Gemini 2.5 Pro')} - Works with any files, immediate processing
  • ${chalk.white('Jules')} - GitHub repos only, autonomous cloud processing

${chalk.cyan('Fix Strategies:')}
  • Progressive enhancement with @supports for CSS
  • Feature detection for JavaScript APIs
  • Polyfills and fallbacks for older browsers
  • Graceful degradation patterns

${chalk.cyan('Setup:')}
  Run ${chalk.white('base config set-keys')} to configure API keys
  Run ${chalk.white('base config coding-agent')} to choose your preferred agent
`)
  .action(async (options) => {
    await startupPromise;
    await StartupOptimizer.optimizeForUseCase('fix');
    return fix(options);
  });

// Configuration management
const configCmd = program
  .command('config')
  .description('Manage BaseGuard configuration and settings')
  .addHelpText('after', `
${chalk.cyan('Configuration Commands:')}
  ${chalk.white('show')}        Display detailed configuration with security status
  ${chalk.white('list')}        Show configuration summary (supports --format json)
  ${chalk.white('set-keys')}    Interactive API key setup with browser integration
  ${chalk.white('targets')}     Manage browser compatibility targets
  ${chalk.white('validate')}    Check configuration file for errors
  ${chalk.white('automation')}  Configure git automation settings

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base config show                        ${chalk.gray('# Show detailed configuration')}
  ${chalk.dim('$')} base config set-keys                    ${chalk.gray('# Set up API keys interactively')}
  ${chalk.dim('$')} base config list --format json          ${chalk.gray('# Export configuration as JSON')}
  ${chalk.dim('$')} base config targets --preset baseline-widely  ${chalk.gray('# Set browser targets')}
`);

configCmd
  .command('show')
  .description('Display detailed configuration with security and validation status')
  .addHelpText('after', `
${chalk.cyan('What this shows:')}
  • Current browser targets and presets
  • API key configuration status (without exposing keys)
  • Automation and git hook settings
  • Security status (.gitignore configuration)
  • Configuration validation results
  • Recommendations for improvements
`)
  .action(() => config('show'));

configCmd
  .command('set-keys')
  .description('Interactive setup of API keys for AI services')
  .addHelpText('after', `
${chalk.cyan('API Services:')}
  ${chalk.white('Gemini')} - For AI analysis of compatibility issues
    Get your key: ${chalk.blue('https://aistudio.google.com')}
  
  ${chalk.white('Jules')}  - For autonomous code fixing
    Get your key: ${chalk.blue('https://jules.google.com')}

${chalk.cyan('Security:')}
  • Keys are stored in .baseguardrc.json
  • File is automatically added to .gitignore
  • Keys are validated before saving
`)
  .action(() => config('set-keys'));

configCmd
  .command('targets')
  .description('Manage browser compatibility targets')
  .option('--add <target>', 'Add browser target (format: "browser version")')
  .option('--remove <target>', 'Remove browser target by name')
  .option('--preset <preset>', 'Set predefined browser targets')
  .addHelpText('after', `
${chalk.cyan('Target Formats:')}
  ${chalk.white('"chrome 100"')}      Minimum Chrome version 100
  ${chalk.white('"safari baseline"')} Safari with Baseline support only
  ${chalk.white('"firefox 90"')}     Minimum Firefox version 90

${chalk.cyan('Available Presets:')}
  ${chalk.white('baseline-widely')}   Features available for 30+ months
  ${chalk.white('baseline-newly')}    Newly available Baseline features
  ${chalk.white('last-2-years')}     Browsers from last 2 years

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base config targets --add "chrome 100"
  ${chalk.dim('$')} base config targets --remove chrome
  ${chalk.dim('$')} base config targets --preset baseline-widely
`)
  .action((options) => config('targets', options));

configCmd
  .command('list')
  .description('Show configuration summary with status information')
  .option('--format <format>', 'Output format (table or json)', 'table')
  .addHelpText('after', `
${chalk.cyan('Output Formats:')}
  ${chalk.white('table')}  Human-readable summary (default)
  ${chalk.white('json')}   Machine-readable JSON for scripts

${chalk.cyan('Includes:')}
  • Browser targets and count
  • API key configuration status
  • Automation settings
  • Security and validation status
`)
  .action((options) => config('list', options));

configCmd
  .command('validate')
  .description('Validate configuration file for errors and inconsistencies')
  .addHelpText('after', `
${chalk.cyan('Validation Checks:')}
  • Configuration file syntax and structure
  • Browser target format and validity
  • API key format validation
  • Automation setting consistency
  • Required field presence

${chalk.cyan('Exit Codes:')}
  0 - Configuration is valid
  1 - Validation errors found
`)
  .action(() => config('validate'));

configCmd
  .command('automation')
  .description('Configure git automation settings interactively')
  .addHelpText('after', `
${chalk.cyan('Automation Settings:')}
  • Enable/disable git hooks
  • Choose trigger (pre-commit or pre-push)
  • Configure auto-analysis with Gemini
  • Configure auto-fixing with Jules
  • Set commit blocking behavior
`)
  .action(() => config('automation'));

configCmd
  .command('recover')
  .description('Attempt automatic recovery of corrupted configuration')
  .option('--backup', 'Create backup before recovery')
  .option('--interactive', 'Run interactive recovery wizard')
  .addHelpText('after', `
${chalk.cyan('Recovery Features:')}
  • Automatic detection of configuration issues
  • Repair of corrupted JSON syntax
  • Migration from older configuration versions
  • Validation and structure repair
  • Backup creation before changes

${chalk.cyan('Recovery Process:')}
  1. Validates current configuration
  2. Creates backup if requested
  3. Attempts automatic repair
  4. Migrates to current version
  5. Validates final result

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base config recover                ${chalk.gray('# Automatic recovery')}
  ${chalk.dim('$')} base config recover --backup       ${chalk.gray('# Create backup first')}
  ${chalk.dim('$')} base config recover --interactive  ${chalk.gray('# Interactive wizard')}
`)
  .action((options) => config('recover', options));

configCmd
  .command('coding-agent')
  .description('Manage coding agent selection (Jules vs Gemini)')
  .option('--agent <agent>', 'Set primary agent (jules or gemini)')
  .option('--show', 'Show current agent configuration and status')
  .addHelpText('after', `
${chalk.cyan('Coding Agents:')}
  ${chalk.white('Jules')}    - Google's autonomous coding agent (GitHub repos only)
  ${chalk.white('Gemini')}   - Gemini 2.5 Pro direct API (works with any files)

${chalk.cyan('Agent Comparison:')}
  Jules:
    ✅ Autonomous operation in cloud VMs
    ✅ Full repository context understanding
    ✅ Asynchronous processing
    ❌ Requires GitHub repository
    ❌ Cannot work with local/uncommitted files

  Gemini:
    ✅ Works with any files (GitHub or not)
    ✅ Immediate processing
    ✅ Works with uncommitted/local files
    ✅ Grounded with real-time web search
    ⚠️ Requires manual code application

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base config coding-agent --show     ${chalk.gray('# Show current configuration')}
  ${chalk.dim('$')} base config coding-agent --agent gemini  ${chalk.gray('# Set Gemini as primary')}
  ${chalk.dim('$')} base config coding-agent --agent jules   ${chalk.gray('# Set Jules as primary')}
  ${chalk.dim('$')} base config coding-agent             ${chalk.gray('# Interactive selection')}
`)
  .action((options) => config('coding-agent', options));

// Automation and git hooks
const autoCmd = program
  .command('automation')
  .alias('auto')
  .description('Manage git automation and hooks for continuous compatibility checking')
  .addHelpText('after', `
${chalk.cyan('Automation Features:')}
  • Automatic compatibility checking on git operations
  • AI-powered analysis and fixing integration
  • Commit blocking when violations are found
  • Configurable triggers (pre-commit or pre-push)

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base automation enable                  ${chalk.gray('# Enable with interactive setup')}
  ${chalk.dim('$')} base automation enable --trigger pre-push  ${chalk.gray('# Enable with pre-push trigger')}
  ${chalk.dim('$')} base automation status                  ${chalk.gray('# Show current automation status')}
  ${chalk.dim('$')} base automation disable                 ${chalk.gray('# Disable automation and remove hooks')}
`);

autoCmd
  .command('enable')
  .description('Enable git automation with hook installation')
  .option('--trigger <trigger>', 'When to run checks (pre-commit or pre-push)', 'pre-commit')
  .option('--auto-fix', 'Enable automatic fixing of violations')
  .addHelpText('after', `
${chalk.cyan('Trigger Options:')}
  ${chalk.white('pre-commit')}  Check before each commit (faster feedback)
  ${chalk.white('pre-push')}    Check before each push (less frequent)

${chalk.cyan('What this does:')}
  • Installs git hooks using Husky
  • Configures BaseGuard to run automatically
  • Sets up automation preferences
  • Updates .baseguardrc.json configuration

${chalk.cyan('Requirements:')}
  • Git repository (run ${chalk.white('git init')} first)
  • Node.js project with package.json
`)
  .action((options) => automation('enable', options));

autoCmd
  .command('disable')
  .description('Disable git automation and remove hooks')
  .addHelpText('after', `
${chalk.cyan('What this does:')}
  • Removes git hooks from .husky/ directory
  • Disables automation in configuration
  • Preserves other BaseGuard settings

${chalk.cyan('Note:')}
  You can re-enable automation anytime with ${chalk.white('base automation enable')}
`)
  .action(() => automation('disable'));

autoCmd
  .command('run')
  .description('Run automation manually (used internally by git hooks)')
  .option('--trigger <trigger>', 'Trigger context (pre-commit or pre-push)')
  .addHelpText('after', `
${chalk.cyan('Usage:')}
  This command is typically called by git hooks automatically.
  You can run it manually for testing automation behavior.

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base automation run --trigger pre-commit
  ${chalk.dim('$')} base automation run --trigger pre-push
`)
  .action((options) => automation('run', options));

autoCmd
  .command('status')
  .description('Show detailed automation status and configuration')
  .addHelpText('after', `
${chalk.cyan('Status Information:')}
  • Automation enabled/disabled state
  • Git hook installation status
  • Trigger configuration (pre-commit/pre-push)
  • Auto-analysis and auto-fix settings
  • API key configuration status
  • Recommendations for setup improvements
`)
  .action(() => automation('status'));

autoCmd
  .command('configure')
  .description('Interactive configuration of all automation settings')
  .addHelpText('after', `
${chalk.cyan('Configuration Options:')}
  • Enable/disable automation
  • Choose trigger timing
  • Configure AI analysis settings
  • Configure AI fixing settings
  • Set commit blocking behavior

${chalk.cyan('Interactive Setup:')}
  Guides you through all automation options with explanations
  and recommendations based on your current configuration.
`)
  .action(() => automation('configure'));

// Browser target management commands (shortcuts)
program
  .command('add <target>')
  .description('Add browser target (shortcut for config targets --add)')
  .addHelpText('after', `
${chalk.cyan('Target Format:')}
  "browser version" - e.g., "chrome 100", "safari 15", "firefox baseline"

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base add "chrome 100"      ${chalk.gray('# Add Chrome 100+ support')}
  ${chalk.dim('$')} base add "safari baseline" ${chalk.gray('# Add Safari with Baseline support')}
  ${chalk.dim('$')} base add "firefox 90"     ${chalk.gray('# Add Firefox 90+ support')}
`)
  .action((target) => config('targets', { add: target }));

program
  .command('remove <target>')
  .description('Remove browser target (shortcut for config targets --remove)')
  .addHelpText('after', `
${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base remove chrome    ${chalk.gray('# Remove all Chrome targets')}
  ${chalk.dim('$')} base remove safari    ${chalk.gray('# Remove all Safari targets')}
  ${chalk.dim('$')} base remove firefox   ${chalk.gray('# Remove all Firefox targets')}
`)
  .action((target) => config('targets', { remove: target }));

program
  .command('list')
  .description('List configuration summary (shortcut for config list)')
  .option('--format <format>', 'Output format (table or json)', 'table')
  .addHelpText('after', `
${chalk.cyan('Quick Status:')}
  Shows browser targets, API keys, automation status, and security info.
  
${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base list              ${chalk.gray('# Show configuration summary')}
  ${chalk.dim('$')} base list --format json ${chalk.gray('# Export as JSON')}
`)
  .action((options) => config('list', options));

// System status and health
program
  .command('status')
  .description('Show BaseGuard system status and health information')
  .option('--verbose', 'Show detailed status information')
  .option('--services', 'Check external service availability')
  .option('--config', 'Show configuration status and validation')
  .option('--errors', 'Show error summary and recent issues')
  .addHelpText('after', `
${chalk.cyan('Status Information:')}
  • Overall system health (healthy/degraded/critical)
  • Component status (configuration, services, errors)
  • Current degradation mode and limitations
  • Service availability (network, APIs)
  • Configuration validation results
  • Error summary and recent issues
  • Performance information
  • Recovery recommendations

${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base status                    ${chalk.gray('# Show basic system status')}
  ${chalk.dim('$')} base status --verbose          ${chalk.gray('# Show detailed information')}
  ${chalk.dim('$')} base status --services         ${chalk.gray('# Check service availability')}
  ${chalk.dim('$')} base status --config           ${chalk.gray('# Show configuration status')}
  ${chalk.dim('$')} base status --errors           ${chalk.gray('# Show error information')}

${chalk.cyan('Health Levels:')}
  ${chalk.green('✅ Healthy')}    All systems operational
  ${chalk.yellow('⚠️ Degraded')}   Some features limited
  ${chalk.red('❌ Critical')}   Major issues detected
`)
  .action(async (options) => {
    await startupPromise;
    return status(options);
  });

// System diagnostics
program
  .command('diagnostics')
  .alias('diag')
  .description('Run comprehensive system diagnostics and recovery')
  .addHelpText('after', `
${chalk.cyan('Diagnostic Features:')}
  • Generate detailed debug report
  • Run configuration recovery wizard
  • Check service availability
  • Show error log summary
  • Clean up old files and caches
  • Provide recovery recommendations

${chalk.cyan('What this does:')}
  1. Creates comprehensive debug report
  2. Attempts automatic configuration recovery
  3. Checks all external services
  4. Analyzes error logs for patterns
  5. Cleans up temporary files
  6. Provides actionable recommendations

${chalk.cyan('Use when:')}
  • BaseGuard is not working correctly
  • You're experiencing frequent errors
  • Need to troubleshoot issues
  • Want to optimize performance
`)
  .action(async () => {
    await startupPromise;
    return diagnostics();
  });

// Add version command with detailed info
program
  .command('version')
  .description('Show version information and system details')
  .option('--check-updates', 'Check for available updates')
  .addHelpText('after', `
${chalk.cyan('Version Information:')}
  Shows BaseGuard version, Node.js version, and system information.
  
${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base version                ${chalk.gray('# Show version info')}
  ${chalk.dim('$')} base version --check-updates ${chalk.gray('# Check for updates')}
`)
  .action((options) => showVersionInfo(options));

// Add help command
program
  .command('help [command]')
  .description('Display help information for BaseGuard or specific commands')
  .addHelpText('after', `
${chalk.cyan('Examples:')}
  ${chalk.dim('$')} base help           ${chalk.gray('# Show general help')}
  ${chalk.dim('$')} base help init      ${chalk.gray('# Show help for init command')}
  ${chalk.dim('$')} base help config    ${chalk.gray('# Show help for config commands')}
`)
  .action((command) => {
    if (command) {
      program.commands.find(cmd => cmd.name() === command)?.help();
    } else {
      showGlobalHelp();
    }
  });

// Handle unknown commands
program.on('command:*', function (operands) {
  console.error(chalk.red('❌ Unknown command:'), chalk.white(operands[0]));
  console.log(chalk.yellow('\n💡 Suggestions:'));
  console.log(`  • Run ${chalk.white('base help')} to see all available commands`);
  console.log(`  • Run ${chalk.white('base init')} if you haven't set up BaseGuard yet`);
  console.log(`  • Check for typos in the command name`);
  process.exit(1);
});

// Show help if no command provided
if (process.argv.length <= 2) {
  showTerminalHeader();
  showGlobalHelp();
  process.exit(0);
}

// For help commands, don't wait for startup
const isHelpCommand = process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('help');
if (isHelpCommand) {
  // Parse immediately without waiting for startup
  program.parse();
} else {
  // Wait for startup for other commands
  startupPromise.finally(() => {
    program.parse();
  });
}