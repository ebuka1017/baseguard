#!/usr/bin/env node

import chalk from 'chalk';

// Simple terminal header test
function showTerminalHeader() {
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

// Test the header
showTerminalHeader();

console.log(chalk.cyan('🛡️ Baseguard Terminal Header Test Complete!'));
console.log(chalk.dim('This beautiful header will be shown when running Baseguard commands.\n'));