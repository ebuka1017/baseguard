#!/usr/bin/env node

// Test the terminal header
import { showTerminalHeader, showCompactHeader } from './dist/ui/terminal-header.js';

console.log('Testing full terminal header:');
showTerminalHeader();

setTimeout(() => {
  console.log('\n\nTesting compact header:');
  showCompactHeader();
}, 2000);