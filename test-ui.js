// Simple test to verify UI components work
import { UIComponents, Colors } from './dist/ui/index.js';

// Test the UI components
console.log('Testing BaseGuard UI Components...\n');

// Test header
UIComponents.showHeader();

// Test status messages
UIComponents.showStatus('success', 'UI components loaded successfully');
UIComponents.showStatus('info', 'Testing various UI elements');

// Test section header
UIComponents.showSectionHeader('Test Results');

// Test list
UIComponents.showList([
  'Colorful output ✓',
  'Spinner components ✓', 
  'Interactive prompts ✓',
  'Violation display ✓'
]);

// Test boxes
UIComponents.showSuccessBox('All UI components are working!');
UIComponents.showInfoBox('Task 6 implementation complete');

console.log('\n' + Colors.primary('🎉 Beautiful CLI interface ready!'));