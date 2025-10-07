import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { showTerminalHeader } from './terminal-header.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Show version information and system details
 */
export async function showVersionInfo(options: { checkUpdates?: boolean } = {}): Promise<void> {
  try {
    // Read package.json for version info
    const packagePath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    
    console.log(chalk.cyan('🛡️ BaseGuard Version Information\n'));
    
    // BaseGuard version
    console.log(chalk.white('BaseGuard:'));
    console.log(`  Version: ${chalk.green(packageJson.version)}`);
    console.log(`  License: ${packageJson.license}`);
    console.log(`  Homepage: ${chalk.blue('https://github.com/baseguard/baseguard')}`);
    
    // System information
    console.log(chalk.white('\nSystem:'));
    console.log(`  Node.js: ${chalk.green(process.version)}`);
    console.log(`  Platform: ${process.platform} ${process.arch}`);
    console.log(`  OS: ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'}`);
    
    // Dependencies
    console.log(chalk.white('\nKey Dependencies:'));
    const deps = packageJson.dependencies;
    console.log(`  web-features: ${chalk.green(deps['web-features'])}`);
    console.log(`  commander: ${chalk.green(deps.commander)}`);
    console.log(`  chalk: ${chalk.green(deps.chalk)}`);
    
    // Engine requirements
    console.log(chalk.white('\nRequirements:'));
    console.log(`  Node.js: ${chalk.green(packageJson.engines.node)}`);
    
    // Check for updates if requested
    if (options.checkUpdates) {
      console.log(chalk.white('\nChecking for updates...'));
      try {
        const { default: fetch } = await import('node-fetch');
        const response = await fetch('https://registry.npmjs.org/baseguard/latest');
        const data = await response.json() as any;
        const latestVersion = data.version;
        
        if (latestVersion !== packageJson.version) {
          console.log(chalk.yellow(`  📦 Update available: ${chalk.green(latestVersion)} (current: ${packageJson.version})`));
          console.log(chalk.yellow(`  Run: ${chalk.white('npm update -g baseguard')}`));
        } else {
          console.log(chalk.green('  ✅ You have the latest version'));
        }
      } catch (error) {
        console.log(chalk.red('  ❌ Unable to check for updates (network error)'));
      }
    }
    
    // Installation info
    console.log(chalk.white('\nInstallation:'));
    console.log(`  Global: ${chalk.white('npm install -g baseguard')}`);
    console.log(`  Local: ${chalk.white('npm install --save-dev baseguard')}`);
    
    // Support links
    console.log(chalk.white('\nSupport:'));
    console.log(`  Documentation: ${chalk.blue('https://github.com/baseguard/baseguard#readme')}`);
    console.log(`  Issues: ${chalk.blue('https://github.com/baseguard/baseguard/issues')}`);
    console.log(`  Discussions: ${chalk.blue('https://github.com/baseguard/baseguard/discussions')}`);
    
  } catch (error) {
    console.error(chalk.red('❌ Error reading version information:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Show comprehensive help information
 */
export function showGlobalHelp(): void {
  showTerminalHeader();
  
  console.log(chalk.cyan('🛡️ BaseGuard - Never ship incompatible code again\n'));
  
  console.log(chalk.white('DESCRIPTION:'));
  console.log('  BaseGuard is an intelligent browser compatibility enforcement tool that prevents');
  console.log('  incompatible code from reaching production. It combines Baseline detection using');
  console.log('  the web-features package, Gemini AI analysis, and Jules autonomous fixing.\n');
  
  console.log(chalk.white('USAGE:'));
  console.log(`  ${chalk.cyan('base')} ${chalk.white('<command>')} ${chalk.gray('[options]')}\n`);
  
  console.log(chalk.white('CORE COMMANDS:'));
  console.log(`  ${chalk.cyan('init')}                    Initialize BaseGuard in your project`);
  console.log(`  ${chalk.cyan('check')}                   Scan for browser compatibility violations`);
  console.log(`  ${chalk.cyan('fix')}                     Fix violations with AI assistance`);
  console.log(`  ${chalk.cyan('config')}                  Manage configuration and settings`);
  console.log(`  ${chalk.cyan('automation')}              Manage git hooks and automation\n`);
  
  console.log(chalk.white('QUICK COMMANDS:'));
  console.log(`  ${chalk.cyan('add')} ${chalk.white('<target>')}           Add browser target (e.g., "chrome 100")`);
  console.log(`  ${chalk.cyan('remove')} ${chalk.white('<target>')}        Remove browser target`);
  console.log(`  ${chalk.cyan('list')}                    Show configuration summary\n`);
  
  console.log(chalk.white('UTILITY COMMANDS:'));
  console.log(`  ${chalk.cyan('version')}                 Show version and system information`);
  console.log(`  ${chalk.cyan('help')} ${chalk.white('[command]')}         Show help for specific command\n`);
  
  console.log(chalk.white('GETTING STARTED:'));
  console.log(`  1. ${chalk.white('base init')}                     Set up BaseGuard in your project`);
  console.log(`  2. ${chalk.white('base config set-keys')}          Configure API keys for AI features`);
  console.log(`  3. ${chalk.white('base automation enable')}        Enable git hooks for automation`);
  console.log(`  4. ${chalk.white('base check')}                    Check for compatibility issues\n`);
  
  console.log(chalk.white('COMMON WORKFLOWS:'));
  console.log(chalk.yellow('  Basic Compatibility Checking:'));
  console.log(`    ${chalk.dim('$')} base init`);
  console.log(`    ${chalk.dim('$')} base check`);
  console.log(`    ${chalk.dim('$')} base add "chrome 100"  ${chalk.gray('# Add specific browser support')}`);
  
  console.log(chalk.yellow('\n  AI-Powered Fixing:'));
  console.log(`    ${chalk.dim('$')} base config set-keys   ${chalk.gray('# Configure Gemini & Jules API keys')}`);
  console.log(`    ${chalk.dim('$')} base fix               ${chalk.gray('# Analyze and fix violations')}`);
  
  console.log(chalk.yellow('\n  Automated Git Integration:'));
  console.log(`    ${chalk.dim('$')} base automation enable ${chalk.gray('# Install git hooks')}`);
  console.log(`    ${chalk.dim('$')} git commit             ${chalk.gray('# Automatic checking on commit')}`);
  
  console.log(chalk.white('\nBROWSER TARGETS:'));
  console.log(`  ${chalk.cyan('Presets:')} baseline-widely, baseline-newly, last-2-years, custom`);
  console.log(`  ${chalk.cyan('Format:')} "browser version" (e.g., "chrome 100", "safari baseline")`);
  console.log(`  ${chalk.cyan('Examples:')} "chrome 100", "safari 15", "firefox baseline"\n`);
  
  console.log(chalk.white('AI SERVICES:'));
  console.log(`  ${chalk.cyan('Gemini:')} AI analysis of compatibility issues`);
  console.log(`    Get API key: ${chalk.blue('https://aistudio.google.com')}`);
  console.log(`  ${chalk.cyan('Jules:')}  Autonomous code fixing (requires GitHub repository)`);
  console.log(`    Get API key: ${chalk.blue('https://jules.google.com')}\n`);
  
  console.log(chalk.white('SUPPORTED FILES:'));
  console.log('  • JavaScript/TypeScript: .js, .jsx, .ts, .tsx');
  console.log('  • Framework files: .vue, .svelte');
  console.log('  • Stylesheets: .css');
  console.log('  • Markup: .html\n');
  
  console.log(chalk.white('FEATURES DETECTED:'));
  console.log('  • CSS properties, selectors, and at-rules');
  console.log('  • JavaScript APIs and ECMAScript features');
  console.log('  • HTML elements and attributes');
  console.log('  • Web platform APIs (Canvas, WebGL, WebRTC, WebAssembly, etc.)');
  console.log('  • Framework-aware extraction (React, Vue, Svelte)\n');
  
  console.log(chalk.white('CONFIGURATION:'));
  console.log(`  ${chalk.cyan('File:')} .baseguardrc.json (automatically created)`);
  console.log(`  ${chalk.cyan('Security:')} Automatically added to .gitignore`);
  console.log(`  ${chalk.cyan('Validation:')} Built-in configuration validation\n`);
  
  console.log(chalk.white('EXAMPLES:'));
  console.log(chalk.gray('  # Quick setup and check'));
  console.log(`  ${chalk.dim('$')} base init --preset baseline-widely`);
  console.log(`  ${chalk.dim('$')} base check --strict`);
  
  console.log(chalk.gray('\n  # Configure specific browser support'));
  console.log(`  ${chalk.dim('$')} base add "chrome 100"`);
  console.log(`  ${chalk.dim('$')} base add "safari baseline"`);
  console.log(`  ${chalk.dim('$')} base check --files "src/**/*.ts"`);
  
  console.log(chalk.gray('\n  # Set up AI-powered fixing'));
  console.log(`  ${chalk.dim('$')} base config set-keys`);
  console.log(`  ${chalk.dim('$')} base fix --analyze-only`);
  console.log(`  ${chalk.dim('$')} base fix --auto`);
  
  console.log(chalk.gray('\n  # Enable automation'));
  console.log(`  ${chalk.dim('$')} base automation enable --trigger pre-commit`);
  console.log(`  ${chalk.dim('$')} base automation status`);
  
  console.log(chalk.white('\nGLOBAL OPTIONS:'));
  console.log(`  ${chalk.cyan('--help, -h')}              Show help information`);
  console.log(`  ${chalk.cyan('--version, -V')}           Show version number\n`);
  
  console.log(chalk.white('DOCUMENTATION:'));
  console.log(`  ${chalk.blue('https://github.com/baseguard/baseguard#readme')}\n`);
  
  console.log(chalk.white('SUPPORT:'));
  console.log(`  Issues: ${chalk.blue('https://github.com/baseguard/baseguard/issues')}`);
  console.log(`  Discussions: ${chalk.blue('https://github.com/baseguard/baseguard/discussions')}\n`);
  
  console.log(chalk.gray('For command-specific help, run: base help <command>'));
}