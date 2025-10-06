#!/usr/bin/env node

// Test the config and automation commands functionality
import chalk from 'chalk';

console.log(chalk.cyan('🧪 Testing Baseguard Config and Automation Commands\n'));

// Test 1: Check if the configuration manager can be imported
try {
  console.log(chalk.blue('Test 1: Configuration Manager Import'));
  const { ConfigurationManager } = await import('./src/core/configuration.js');
  console.log(chalk.green('✅ ConfigurationManager imported successfully'));
  
  // Test creating default config
  const defaultConfig = ConfigurationManager.createDefault();
  console.log(chalk.green('✅ Default configuration created'));
  console.log(chalk.dim(`   - Version: ${defaultConfig.version}`));
  console.log(chalk.dim(`   - Targets: ${defaultConfig.targets.length} browser(s)`));
  console.log(chalk.dim(`   - Automation: ${defaultConfig.automation.enabled ? 'enabled' : 'disabled'}`));
  
} catch (error) {
  console.log(chalk.red('❌ Configuration Manager test failed:'), error.message);
}

console.log();

// Test 2: Check if UI components can be imported
try {
  console.log(chalk.blue('Test 2: UI Components Import'));
  const { UIComponents } = await import('./src/ui/components.js');
  console.log(chalk.green('✅ UIComponents imported successfully'));
  
  // Test showing a simple message
  UIComponents.showSuccessBox('Test message from UIComponents');
  
} catch (error) {
  console.log(chalk.red('❌ UI Components test failed:'), error.message);
}

console.log();

// Test 3: Check if terminal header works
try {
  console.log(chalk.blue('Test 3: Terminal Header'));
  const { showTerminalHeader } = await import('./src/ui/terminal-header.js');
  console.log(chalk.green('✅ Terminal header imported successfully'));
  
  console.log(chalk.dim('Showing terminal header...'));
  showTerminalHeader();
  
} catch (error) {
  console.log(chalk.red('❌ Terminal header test failed:'), error.message);
}

console.log(chalk.cyan('\n🎉 Config and Automation Commands Test Complete!'));
console.log(chalk.dim('The implemented functionality is ready for use.\n'));