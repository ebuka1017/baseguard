import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds for E2E tests
const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const TEMP_DIR = path.join(__dirname, '../temp');

// Helper function to run BaseGuard commands
async function runBaseGuard(args: string[], cwd: string = TEMP_DIR): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const basePath = path.join(__dirname, '../../bin/base.js');
    const child = spawn('node', [basePath, ...args], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });

    // Kill process after timeout
    setTimeout(() => {
      child.kill();
      resolve({
        stdout,
        stderr,
        exitCode: 1
      });
    }, TEST_TIMEOUT);
  });
}

// Helper function to copy fixture to temp directory
async function copyFixture(fixtureName: string, tempName: string): Promise<string> {
  const sourcePath = path.join(FIXTURES_DIR, fixtureName);
  const destPath = path.join(TEMP_DIR, tempName);
  
  await fs.mkdir(destPath, { recursive: true });
  await copyDirectory(sourcePath, destPath);
  
  return destPath;
}

// Helper function to recursively copy directory
async function copyDirectory(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// Helper function to create test configuration
async function createTestConfig(projectPath: string, config: any): Promise<void> {
  const configPath = path.join(projectPath, '.baseguardrc.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

describe('BaseGuard End-to-End Tests', () => {
  beforeEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
    await fs.mkdir(TEMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory after each test
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('React Project Testing', () => {
    it('should detect compatibility violations in React project', async () => {
      const projectPath = await copyFixture('react-project', 'react-test');
      
      // Create test configuration targeting older browsers
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'safari', minVersion: '15' },
          { browser: 'chrome', minVersion: '90' }
        ],
        apiKeys: {
          jules: null,
          gemini: null
        },
        automation: {
          enabled: false,
          trigger: 'pre-commit',
          autoAnalyze: false,
          autoFix: false,
          blockCommit: true
        }
      });

      const result = await runBaseGuard(['check', '--strict'], projectPath);
      
      // Should find violations
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('compatibility violations found');
      
      // Should detect specific modern features
      expect(result.stdout).toContain('container-type');
      expect(result.stdout).toContain('dialog');
      expect(result.stdout).toContain('structuredClone');
      expect(result.stdout).toContain('ResizeObserver');
      
      // Should show file locations
      expect(result.stdout).toContain('App.tsx');
      expect(result.stdout).toContain('App.css');
    }, TEST_TIMEOUT);

    it('should pass when targeting modern browsers', async () => {
      const projectPath = await copyFixture('react-project', 'react-modern');
      
      // Create configuration targeting modern browsers
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'chrome', minVersion: 'baseline' },
          { browser: 'safari', minVersion: 'baseline' },
          { browser: 'firefox', minVersion: 'baseline' }
        ],
        apiKeys: {
          jules: null,
          gemini: null
        }
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      // Should pass with baseline targets
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No compatibility issues found');
    }, TEST_TIMEOUT);
  });

  describe('Vue Project Testing', () => {
    it('should detect compatibility violations in Vue project', async () => {
      const projectPath = await copyFixture('vue-project', 'vue-test');
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'safari', minVersion: '14' },
          { browser: 'firefox', minVersion: '85' }
        ]
      });

      const result = await runBaseGuard(['check', '--strict'], projectPath);
      
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('compatibility violations found');
      
      // Should detect Vue-specific extractions
      expect(result.stdout).toContain('container-type');
      expect(result.stdout).toContain('App.vue');
      
      // Should ignore Vue-specific syntax
      expect(result.stdout).not.toContain('@click');
      expect(result.stdout).not.toContain('v-if');
    }, TEST_TIMEOUT);

    it('should extract web platform features from Vue SFC', async () => {
      const projectPath = await copyFixture('vue-project', 'vue-extraction');
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }]
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      // Should extract from all SFC sections
      expect(result.stdout).toContain('ResizeObserver'); // From script
      expect(result.stdout).toContain('container-type'); // From style
      expect(result.stdout).toContain('dialog'); // From template
    }, TEST_TIMEOUT);
  });

  describe('Svelte Project Testing', () => {
    it('should detect compatibility violations in Svelte project', async () => {
      const projectPath = await copyFixture('svelte-project', 'svelte-test');
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'safari', minVersion: '14' },
          { browser: 'chrome', minVersion: '88' }
        ]
      });

      const result = await runBaseGuard(['check', '--strict'], projectPath);
      
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('compatibility violations found');
      
      // Should detect Svelte-specific extractions
      expect(result.stdout).toContain('App.svelte');
      expect(result.stdout).toContain('OffscreenCanvas');
      expect(result.stdout).toContain('backdrop-filter');
      
      // Should ignore Svelte-specific syntax
      expect(result.stdout).not.toContain('bind:this');
      expect(result.stdout).not.toContain('on:click');
    }, TEST_TIMEOUT);

    it('should handle complex Svelte features', async () => {
      const projectPath = await copyFixture('svelte-project', 'svelte-complex');
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }]
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      // Should extract modern web APIs
      expect(result.stdout).toContain('WebGL2RenderingContext');
      expect(result.stdout).toContain('serviceWorker');
      expect(result.stdout).toContain('caches');
    }, TEST_TIMEOUT);
  });

  describe('Vanilla Project Testing', () => {
    it('should detect all web platform features in vanilla project', async () => {
      const projectPath = await copyFixture('vanilla-project', 'vanilla-test');
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'safari', minVersion: '14' },
          { browser: 'firefox', minVersion: '80' }
        ]
      });

      const result = await runBaseGuard(['check', '--strict'], projectPath);
      
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('compatibility violations found');
      
      // Should detect features from all file types
      expect(result.stdout).toContain('index.html');
      expect(result.stdout).toContain('styles.css');
      expect(result.stdout).toContain('script.js');
      
      // Should detect comprehensive web platform features
      expect(result.stdout).toContain('container-type'); // CSS
      expect(result.stdout).toContain('dialog'); // HTML
      expect(result.stdout).toContain('structuredClone'); // JavaScript
      expect(result.stdout).toContain('color-mix'); // CSS function
      expect(result.stdout).toContain('OffscreenCanvas'); // Canvas API
    }, TEST_TIMEOUT);

    it('should handle all modern CSS features', async () => {
      const projectPath = await copyFixture('vanilla-project', 'vanilla-css');
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '14' }]
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      // Should detect advanced CSS features
      expect(result.stdout).toContain('backdrop-filter');
      expect(result.stdout).toContain('aspect-ratio');
      expect(result.stdout).toContain(':has');
      expect(result.stdout).toContain('color-scheme');
      expect(result.stdout).toContain('accent-color');
    }, TEST_TIMEOUT);
  });

  describe('Cross-Framework Testing', () => {
    it('should handle mixed framework project', async () => {
      // Create a project with multiple frameworks
      const projectPath = path.join(TEMP_DIR, 'mixed-project');
      await fs.mkdir(projectPath, { recursive: true });
      
      // Copy files from different frameworks
      await fs.copyFile(
        path.join(FIXTURES_DIR, 'react-project/src/App.tsx'),
        path.join(projectPath, 'react-component.tsx')
      );
      await fs.copyFile(
        path.join(FIXTURES_DIR, 'vue-project/src/App.vue'),
        path.join(projectPath, 'vue-component.vue')
      );
      await fs.copyFile(
        path.join(FIXTURES_DIR, 'svelte-project/src/App.svelte'),
        path.join(projectPath, 'svelte-component.svelte')
      );
      await fs.copyFile(
        path.join(FIXTURES_DIR, 'vanilla-project/script.js'),
        path.join(projectPath, 'vanilla-script.js')
      );

      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }]
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      // Should process all framework files
      expect(result.stdout).toContain('react-component.tsx');
      expect(result.stdout).toContain('vue-component.vue');
      expect(result.stdout).toContain('svelte-component.svelte');
      expect(result.stdout).toContain('vanilla-script.js');
      
      // Should find violations in all files
      expect(result.stdout).toContain('compatibility violations found');
    }, TEST_TIMEOUT);
  });

  describe('Configuration Testing', () => {
    it('should respect different browser targets', async () => {
      const projectPath = await copyFixture('react-project', 'config-test');
      
      // Test with very old browsers
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'safari', minVersion: '10' },
          { browser: 'chrome', minVersion: '60' }
        ]
      });

      const oldResult = await runBaseGuard(['check'], projectPath);
      expect(oldResult.stdout).toContain('compatibility violations found');
      
      // Test with very new browsers
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'safari', minVersion: '17' },
          { browser: 'chrome', minVersion: '120' }
        ]
      });

      const newResult = await runBaseGuard(['check'], projectPath);
      // Should have fewer or no violations with newer targets
      expect(newResult.exitCode).toBeLessThanOrEqual(oldResult.exitCode);
    }, TEST_TIMEOUT);

    it('should handle baseline targets correctly', async () => {
      const projectPath = await copyFixture('vanilla-project', 'baseline-test');
      
      // Test baseline widely available
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [
          { browser: 'chrome', minVersion: 'baseline' },
          { browser: 'safari', minVersion: 'baseline' }
        ]
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      // Should only flag features that are not baseline
      if (result.exitCode === 1) {
        expect(result.stdout).toContain('baseline');
      }
    }, TEST_TIMEOUT);
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed files gracefully', async () => {
      const projectPath = path.join(TEMP_DIR, 'malformed-project');
      await fs.mkdir(projectPath, { recursive: true });
      
      // Create malformed files
      await fs.writeFile(path.join(projectPath, 'broken.js'), 'const invalid = {');
      await fs.writeFile(path.join(projectPath, 'broken.css'), '.invalid { color: }');
      await fs.writeFile(path.join(projectPath, 'broken.vue'), '<template><div></template>');
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }]
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      // Should not crash and should report parsing issues
      expect(result.exitCode).not.toBe(2); // Not a crash
      expect(result.stderr).toContain('parsing');
    }, TEST_TIMEOUT);

    it('should handle empty project', async () => {
      const projectPath = path.join(TEMP_DIR, 'empty-project');
      await fs.mkdir(projectPath, { recursive: true });
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }]
      });

      const result = await runBaseGuard(['check'], projectPath);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No files found to check');
    }, TEST_TIMEOUT);

    it('should handle missing configuration', async () => {
      const projectPath = await copyFixture('react-project', 'no-config');
      
      const result = await runBaseGuard(['check'], projectPath);
      
      // Should prompt for initialization or use defaults
      expect(result.stderr).toContain('configuration') || expect(result.stdout).toContain('init');
    }, TEST_TIMEOUT);
  });

  describe('Performance Testing', () => {
    it('should handle large number of files efficiently', async () => {
      const projectPath = path.join(TEMP_DIR, 'large-project');
      await fs.mkdir(projectPath, { recursive: true });
      
      // Create many files
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          fs.writeFile(
            path.join(projectPath, `file${i}.js`),
            `
            // Modern JavaScript features
            const data = { test: ${i} };
            const cloned = structuredClone(data);
            const observer = new ResizeObserver(() => {});
            console.log('File ${i}');
            `
          )
        );
      }
      await Promise.all(promises);
      
      await createTestConfig(projectPath, {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }]
      });

      const startTime = Date.now();
      const result = await runBaseGuard(['check'], projectPath);
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (10 seconds for 50 files)
      expect(duration).toBeLessThan(10000);
      expect(result.stdout).toContain('structuredClone');
      expect(result.stdout).toContain('ResizeObserver');
    }, TEST_TIMEOUT);
  });

  describe('CLI Interface Testing', () => {
    it('should show help information', async () => {
      const result = await runBaseGuard(['--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('BaseGuard');
      expect(result.stdout).toContain('check');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('fix');
    }, TEST_TIMEOUT);

    it('should show version information', async () => {
      const result = await runBaseGuard(['--version']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    }, TEST_TIMEOUT);

    it('should handle invalid commands gracefully', async () => {
      const result = await runBaseGuard(['invalid-command']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command') || expect(result.stdout).toContain('help');
    }, TEST_TIMEOUT);
  });
});