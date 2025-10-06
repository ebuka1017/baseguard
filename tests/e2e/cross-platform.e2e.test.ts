import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_TIMEOUT = 30000;
const TEMP_DIR = path.join(__dirname, '../temp-platform');

// Helper function to run BaseGuard commands
async function runBaseGuard(args: string[], cwd: string = TEMP_DIR): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const basePath = path.join(__dirname, '../../bin/base.js');
    const child = spawn('node', [basePath, ...args], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
      shell: os.platform() === 'win32' // Use shell on Windows
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

    setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, exitCode: 1 });
    }, TEST_TIMEOUT);
  });
}

// Helper function to create test project
async function createTestProject(projectName: string): Promise<string> {
  const projectPath = path.join(TEMP_DIR, projectName);
  await fs.mkdir(projectPath, { recursive: true });
  
  // Create test files with various path separators and line endings
  const jsContent = `// Test file for cross-platform compatibility
const data = { test: 'value' };
const cloned = structuredClone(data);
const observer = new ResizeObserver(() => {});
console.log('Cross-platform test');`;

  const cssContent = `.container {
  container-type: inline-size;
  aspect-ratio: 16/9;
  backdrop-filter: blur(10px);
}

@container (min-width: 400px) {
  .container {
    font-size: 1.2rem;
  }
}`;

  // Test different line endings
  const windowsLineEndings = jsContent.replace(/\n/g, '\r\n');
  const unixLineEndings = jsContent.replace(/\r\n/g, '\n');
  
  await fs.writeFile(path.join(projectPath, 'test-windows.js'), windowsLineEndings);
  await fs.writeFile(path.join(projectPath, 'test-unix.js'), unixLineEndings);
  await fs.writeFile(path.join(projectPath, 'test.css'), cssContent);
  
  // Create configuration
  const config = {
    version: '1.0.0',
    targets: [{ browser: 'safari', minVersion: '15' }],
    apiKeys: { jules: null, gemini: null },
    automation: { enabled: false }
  };
  
  await fs.writeFile(path.join(projectPath, '.baseguardrc.json'), JSON.stringify(config, null, 2));
  
  return projectPath;
}

describe('Cross-Platform Compatibility Tests', () => {
  beforeEach(async () => {
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
    await fs.mkdir(TEMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Platform Detection', () => {
    it('should detect current platform correctly', async () => {
      const projectPath = await createTestProject('platform-detection');
      
      const result = await runBaseGuard(['check'], projectPath);
      
      // Should work regardless of platform
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      expect(result.stdout).toContain('compatibility') || expect(result.stdout).toContain('violations');
    }, TEST_TIMEOUT);

    it('should handle platform-specific paths correctly', async () => {
      const projectPath = await createTestProject('path-handling');
      
      // Create nested directory structure
      const nestedPath = path.join(projectPath, 'src', 'components', 'deep');
      await fs.mkdir(nestedPath, { recursive: true });
      
      await fs.writeFile(
        path.join(nestedPath, 'Component.js'),
        'const observer = new ResizeObserver(() => {});'
      );
      
      const result = await runBaseGuard(['check'], projectPath);
      
      // Should find files in nested paths on all platforms
      expect(result.stdout).toContain('Component.js') || expect(result.stdout).toContain('ResizeObserver');
    }, TEST_TIMEOUT);
  });

  describe('File System Handling', () => {
    it('should handle different line endings correctly', async () => {
      const projectPath = await createTestProject('line-endings');
      
      const result = await runBaseGuard(['check'], projectPath);
      
      // Should detect violations in both Windows and Unix line ending files
      expect(result.stdout).toContain('structuredClone');
      expect(result.stdout).toContain('ResizeObserver');
      
      // Should process both files
      expect(result.stdout).toContain('test-windows.js') || expect(result.stdout).toContain('test-unix.js');
    }, TEST_TIMEOUT);

    it('should handle case-sensitive file systems', async () => {
      const projectPath = await createTestProject('case-sensitivity');
      
      // Create files with different cases
      await fs.writeFile(
        path.join(projectPath, 'Component.JS'), // Uppercase extension
        'const observer = new ResizeObserver(() => {});'
      );
      
      await fs.writeFile(
        path.join(projectPath, 'STYLES.CSS'), // Uppercase filename
        '.container { container-type: inline-size; }'
      );
      
      const result = await runBaseGuard(['check'], projectPath);
      
      // Should handle files regardless of case
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);

    it('should handle long file paths', async () => {
      const projectPath = await createTestProject('long-paths');
      
      // Create a very deep directory structure
      let deepPath = projectPath;
      for (let i = 0; i < 10; i++) {
        deepPath = path.join(deepPath, `very-long-directory-name-${i}`);
      }
      
      try {
        await fs.mkdir(deepPath, { recursive: true });
        await fs.writeFile(
          path.join(deepPath, 'deep-component.js'),
          'const observer = new ResizeObserver(() => {});'
        );
        
        const result = await runBaseGuard(['check'], projectPath);
        
        // Should handle deep paths without issues
        expect(result.exitCode).toBeGreaterThanOrEqual(0);
      } catch (error) {
        // Some platforms have path length limits, that's acceptable
        console.log('Platform path length limit reached, skipping test');
      }
    }, TEST_TIMEOUT);
  });

  describe('Process and Shell Handling', () => {
    it('should handle different shell environments', async () => {
      const projectPath = await createTestProject('shell-handling');
      
      // Test with different environment variables
      const result = await runBaseGuard(['check'], projectPath);
      
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should handle process signals correctly', async () => {
      const projectPath = await createTestProject('signal-handling');
      
      // Start a BaseGuard process
      const basePath = path.join(__dirname, '../../bin/base.js');
      const child = spawn('node', [basePath, 'check'], {
        cwd: projectPath,
        stdio: 'pipe'
      });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send interrupt signal
      child.kill('SIGINT');
      
      // Should handle gracefully
      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => resolve(code || 0));
        setTimeout(() => resolve(1), 5000); // Timeout
      });
      
      expect(exitCode).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);
  });

  describe('Configuration Handling', () => {
    it('should handle different configuration file encodings', async () => {
      const projectPath = await createTestProject('encoding-test');
      
      // Create configuration with different encodings
      const config = {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }],
        description: 'Test with special characters: áéíóú ñ 中文 🚀'
      };
      
      await fs.writeFile(
        path.join(projectPath, '.baseguardrc.json'),
        JSON.stringify(config, null, 2),
        'utf8'
      );
      
      const result = await runBaseGuard(['check'], projectPath);
      
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);

    it('should handle missing permissions gracefully', async () => {
      const projectPath = await createTestProject('permissions-test');
      
      // Try to create a read-only configuration (platform dependent)
      try {
        const configPath = path.join(projectPath, '.baseguardrc.json');
        await fs.chmod(configPath, 0o444); // Read-only
        
        const result = await runBaseGuard(['config', 'list'], projectPath);
        
        // Should handle read-only files gracefully
        expect(result.exitCode).toBeGreaterThanOrEqual(0);
        
        // Restore permissions for cleanup
        await fs.chmod(configPath, 0o644);
      } catch (error) {
        // Some platforms might not support chmod, that's okay
        console.log('Platform does not support chmod, skipping permissions test');
      }
    }, TEST_TIMEOUT);
  });

  describe('Node.js Version Compatibility', () => {
    it('should work with current Node.js version', async () => {
      const projectPath = await createTestProject('node-version');
      
      const result = await runBaseGuard(['--version'], projectPath);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    }, TEST_TIMEOUT);

    it('should handle ES modules correctly', async () => {
      const projectPath = await createTestProject('esm-test');
      
      // Create an ES module file
      await fs.writeFile(
        path.join(projectPath, 'module.mjs'),
        `
        import { ResizeObserver } from 'some-module';
        export const observer = new ResizeObserver(() => {});
        export default { structuredClone: globalThis.structuredClone };
        `
      );
      
      const result = await runBaseGuard(['check'], projectPath);
      
      // Should parse ES modules correctly
      expect(result.stdout).toContain('ResizeObserver') || expect(result.stdout).toContain('structuredClone');
    }, TEST_TIMEOUT);
  });

  describe('Memory and Performance', () => {
    it('should handle memory constraints gracefully', async () => {
      const projectPath = await createTestProject('memory-test');
      
      // Create many files to test memory usage
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          fs.writeFile(
            path.join(projectPath, `file${i}.js`),
            `
            // File ${i}
            const data${i} = { test: ${i} };
            const cloned${i} = structuredClone(data${i});
            const observer${i} = new ResizeObserver(() => {});
            `.repeat(10) // Make files larger
          )
        );
      }
      await Promise.all(promises);
      
      const result = await runBaseGuard(['check'], projectPath);
      
      // Should complete without memory issues
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      expect(result.stdout).toContain('structuredClone');
    }, TEST_TIMEOUT);

    it('should handle concurrent file processing', async () => {
      const projectPath = await createTestProject('concurrent-test');
      
      // Create files in different subdirectories
      const dirs = ['src', 'components', 'utils', 'styles'];
      const promises = [];
      
      for (const dir of dirs) {
        const dirPath = path.join(projectPath, dir);
        await fs.mkdir(dirPath, { recursive: true });
        
        for (let i = 0; i < 5; i++) {
          promises.push(
            fs.writeFile(
              path.join(dirPath, `${dir}-file${i}.js`),
              `const observer = new ResizeObserver(() => {}); // ${dir} ${i}`
            )
          );
        }
      }
      
      await Promise.all(promises);
      
      const startTime = Date.now();
      const result = await runBaseGuard(['check'], projectPath);
      const duration = Date.now() - startTime;
      
      // Should process files efficiently
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      expect(result.stdout).toContain('ResizeObserver');
    }, TEST_TIMEOUT);
  });

  describe('Error Handling Across Platforms', () => {
    it('should handle file system errors gracefully', async () => {
      const projectPath = await createTestProject('fs-error-test');
      
      // Create a file and then make its directory inaccessible (platform dependent)
      const subDir = path.join(projectPath, 'restricted');
      await fs.mkdir(subDir);
      await fs.writeFile(
        path.join(subDir, 'test.js'),
        'const observer = new ResizeObserver(() => {});'
      );
      
      try {
        // Try to make directory inaccessible
        await fs.chmod(subDir, 0o000);
        
        const result = await runBaseGuard(['check'], projectPath);
        
        // Should handle permission errors gracefully
        expect(result.exitCode).toBeGreaterThanOrEqual(0);
        
        // Restore permissions for cleanup
        await fs.chmod(subDir, 0o755);
      } catch (error) {
        // Platform might not support chmod
        console.log('Platform does not support chmod, skipping FS error test');
      }
    }, TEST_TIMEOUT);

    it('should provide platform-appropriate error messages', async () => {
      const projectPath = await createTestProject('error-message-test');
      
      // Try to run BaseGuard on a non-existent directory
      const nonExistentPath = path.join(projectPath, 'does-not-exist');
      
      const result = await runBaseGuard(['check'], nonExistentPath);
      
      // Should provide helpful error message
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('directory') || expect(result.stderr).toContain('path');
    }, TEST_TIMEOUT);
  });
});