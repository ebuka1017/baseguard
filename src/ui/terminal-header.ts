import chalk from 'chalk';

/**
 * Display beautiful Baseguard terminal header with ASCII art and tagline
 */
export function showTerminalHeader(): void {
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

  // Use a single color that contrasts well with both light and dark terminals
  console.log(chalk.bold.white(logo));

  // Tagline with styling
  console.log(
    chalk.bold.white('                    Ship Modern Code') + 
    chalk.dim(' ✨\n')
  );
}

/**
 * Display compact header for command output
 */
export function showCompactHeader(): void {
  console.log(
    chalk.bold.white('🛡️  Baseguard') + 
    chalk.dim(' - Ship Modern Code ✨\n')
  );
}

/**
 * Simple fallback header without external dependencies
 */
export function showSimpleHeader(): void {
  console.clear();
  
  const logo = `
██████╗   █████╗  ███████╗ ███████╗  ██████╗  ██╗   ██╗  █████╗  ██████╗  ██████╗ 
██╔══██╗ ██╔══██╗ ██╔════╝ ██╔════╝ ██╔════╝  ██║   ██║ ██╔══██╗ ██╔══██╗ ██╔══██╗
██████╔╝ ███████║ ███████╗ █████╗   ██║  ███╗ ██║   ██║ ███████║ ██████╔╝ ██║  ██║
██╔══██╗ ██╔══██║ ╚════██║ ██╔══╝   ██║   ██║ ██║   ██║ ██╔══██║ ██╔══██╗ ██║  ██║
██████╔╝ ██║  ██║ ███████║ ███████╗ ╚██████╔╝ ╚██████╔╝ ██║  ██║ ██║  ██║ ██████╔╝
╚═════╝  ╚═╝  ╚═╝ ╚══════╝ ╚══════╝  ╚═════╝   ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═════╝ 
  `;

  console.log(chalk.bold.white(logo));
  console.log(
    chalk.bold.white('                    Ship Modern Code') + 
    chalk.dim(' ✨\n')
  );
}