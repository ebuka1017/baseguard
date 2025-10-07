import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_TIMEOUT = 45000; // 45 seconds for git operations
const TEMP_DIR = path.join(__dirname, '../temp-git');

// Helper function to run git commands
function runGit(args: string[], cwd: string): string {
  try {
    return execSync(`git ${args.join(' ')}`, { 
      cwd, 
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`);
  }
}

// Helper function to run BaseGuard commands
async function runBaseGuard(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

    setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, exitCode: 1 });
    }, TEST_TIMEOUT);
  });
}

// Helper function to setup git repository
async function setupGitRepo(repoPath: string): Promise<void> {
  await fs.mkdir(repoPath, { recursive: true });
  
  // Initialize git repo
  runGit(['init'], repoPath);
  runGit(['config', 'user.name', 'Test User'], repoPath);
  runGit(['config', 'user.email', 'test@example.com'], repoPath);
  
  // Create initial commit
  await fs.writeFile(path.join(repoPath, 'README.md'), '# Test Project\n');
  runGit(['add', 'README.md'], repoPath);
  runGit(['commit', '-m', '"Initial commit"'], repoPath);
}

// Helper function to create test files with violations
async function createTestFiles(repoPath: string): Promise<void> {
  // Create a file with modern features that will trigger violations
  const jsContent = `
// Modern JavaScript features
const data = { test: 'value' };
const cloned = structuredClone(data);
const observer = new ResizeObserver(() => {});

// Dialog API usage
const dialog = document.querySelector('dialog');
if (dialog) {
  dialog.showModal();
}
`;

  const cssContent = `
.container {
  container-type: inline-size;
  aspect-ratio: 16/9;
  backdrop-filter: blur(10px);
}

@container (min-width: 400px) {
  .container {
    font-size: 1.2rem;
  }
}

.modern-selector:has(dialog[open]) {
  background: color-mix(in srgb, red 50%, blue);
}
`;

  await fs.writeFile(path.join(repoPath, 'test.js'), jsContent);
  await fs.writeFile(path.join(repoPath, 'test.css'), cssContent);
}

describe('Git Integration End-to-End Tests', () => {
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

  describe('Git Hook Installation', () => {
    it('should install pre-commit hooks successfully', async () => {
      const repoPath = path.join(TEMP_DIR, 'hook-install-test');
      await setupGitRepo(repoPath);
      
      // Initialize BaseGuard with automation
      const initResult = await runBaseGuard(['init'], repoPath);
      expect(initResult.exitCode).toBe(0);
      
      // Install git hooks
      const hookResult = await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      expect(hookResult.exitCode).toBe(0);
      
      // Check if hook files were created
      const hookPath = path.join(repoPath, '.husky/pre-commit');
      const hookExists = await fs.access(hookPath).then(() => true).catch(() => false);
      expect(hookExists).toBe(true);
      
      if (hookExists) {
        const hookContent = await fs.readFile(hookPath, 'utf8');
        expect(hookContent).toContain('base automation run');
      }
    }, TEST_TIMEOUT);

    it('should install pre-push hooks successfully', async () => {
      const repoPath = path.join(TEMP_DIR, 'pre-push-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      const hookResult = await runBaseGuard(['automation', 'enable', '--trigger', 'pre-push'], repoPath);
      expect(hookResult.exitCode).toBe(0);
      
      const hookPath = path.join(repoPath, '.husky/pre-push');
      const hookExists = await fs.access(hookPath).then(() => true).catch(() => false);
      expect(hookExists).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Pre-commit Hook Behavior', () => {
    it('should block commits when violations are found', async () => {
      const repoPath = path.join(TEMP_DIR, 'block-commit-test');
      await setupGitRepo(repoPath);
      
      // Initialize BaseGuard and enable automation
      await runBaseGuard(['init'], repoPath);
      
      // Create configuration that will find violations
      const config = {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }],
        automation: {
          enabled: true,
          trigger: 'pre-commit',
          autoAnalyze: false,
          autoFix: false,
          blockCommit: true
        }
      };
      await fs.writeFile(path.join(repoPath, '.baseguardrc.json'), JSON.stringify(config, null, 2));
      
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      
      // Create files with violations
      await createTestFiles(repoPath);
      runGit(['add', '.'], repoPath);
      
      // Try to commit - should fail
      try {
        runGit(['commit', '-m', 'Add files with violations'], repoPath);
        expect.fail('Commit should have been blocked');
      } catch (error: any) {
        expect(error.message).toContain('Git command failed');
      }
    }, TEST_TIMEOUT);

    it('should allow commits when no violations are found', async () => {
      const repoPath = path.join(TEMP_DIR, 'allow-commit-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      // Create configuration targeting very old browsers (everything should pass)
      const config = {
        version: '1.0.0',
        targets: [{ browser: 'chrome', minVersion: '120' }], // Very new browser
        automation: {
          enabled: true,
          trigger: 'pre-commit',
          blockCommit: true
        }
      };
      await fs.writeFile(path.join(repoPath, '.baseguardrc.json'), JSON.stringify(config, null, 2));
      
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      
      // Create files without violations (for very new browsers)
      await fs.writeFile(path.join(repoPath, 'safe.js'), 'console.log("Hello World");');
      await fs.writeFile(path.join(repoPath, 'safe.css'), '.safe { color: red; }');
      
      runGit(['add', '.'], repoPath);
      
      // Commit should succeed
      const commitOutput = runGit(['commit', '-m', 'Add safe files'], repoPath);
      expect(commitOutput).toContain('Add safe files');
    }, TEST_TIMEOUT);

    it('should respect --no-verify flag', async () => {
      const repoPath = path.join(TEMP_DIR, 'no-verify-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      const config = {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }],
        automation: {
          enabled: true,
          trigger: 'pre-commit',
          blockCommit: true
        }
      };
      await fs.writeFile(path.join(repoPath, '.baseguardrc.json'), JSON.stringify(config, null, 2));
      
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      
      // Create files with violations
      await createTestFiles(repoPath);
      runGit(['add', '.'], repoPath);
      
      // Commit with --no-verify should succeed
      const commitOutput = runGit(['commit', '--no-verify', '-m', 'Bypass BaseGuard'], repoPath);
      expect(commitOutput).toContain('Bypass BaseGuard');
    }, TEST_TIMEOUT);
  });

  describe('Auto-fix Mode', () => {
    it('should automatically fix violations and include in commit', async () => {
      const repoPath = path.join(TEMP_DIR, 'auto-fix-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      // Enable auto-fix mode (would require API keys in real scenario)
      const config = {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }],
        apiKeys: {
          jules: 'test-key',
          gemini: 'test-key'
        },
        automation: {
          enabled: true,
          trigger: 'pre-commit',
          autoAnalyze: true,
          autoFix: true,
          blockCommit: false
        }
      };
      await fs.writeFile(path.join(repoPath, '.baseguardrc.json'), JSON.stringify(config, null, 2));
      
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      
      // Create files with violations
      await createTestFiles(repoPath);
      runGit(['add', '.'], repoPath);
      
      // Note: This test would require mock API responses in a real scenario
      // For now, we test that the automation runs without crashing
      try {
        runGit(['commit', '-m', 'Test auto-fix'], repoPath);
      } catch (error: any) {
        // Expected to fail due to missing API keys, but should not crash
        expect(error.message).toContain('API') || expect(error.message).toContain('key');
      }
    }, TEST_TIMEOUT);
  });

  describe('Pre-push Hook Behavior', () => {
    it('should check violations before push', async () => {
      const repoPath = path.join(TEMP_DIR, 'pre-push-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      const config = {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }],
        automation: {
          enabled: true,
          trigger: 'pre-push',
          blockCommit: true
        }
      };
      await fs.writeFile(path.join(repoPath, '.baseguardrc.json'), JSON.stringify(config, null, 2));
      
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-push'], repoPath);
      
      // Create and commit files with violations (bypassing pre-commit)
      await createTestFiles(repoPath);
      runGit(['add', '.'], repoPath);
      runGit(['commit', '--no-verify', '-m', 'Add files with violations'], repoPath);
      
      // Create a remote repository simulation
      const remoteRepo = path.join(TEMP_DIR, 'remote-repo');
      await fs.mkdir(remoteRepo, { recursive: true });
      runGit(['init', '--bare'], remoteRepo);
      runGit(['remote', 'add', 'origin', remoteRepo], repoPath);
      
      // Try to push - should fail due to violations
      try {
        runGit(['push', 'origin', 'main'], repoPath);
        expect.fail('Push should have been blocked');
      } catch (error: any) {
        expect(error.message).toContain('Git command failed');
      }
    }, TEST_TIMEOUT);
  });

  describe('Automation Configuration', () => {
    it('should enable and disable automation correctly', async () => {
      const repoPath = path.join(TEMP_DIR, 'automation-config-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      // Enable automation
      const enableResult = await runBaseGuard(['automation', 'enable'], repoPath);
      expect(enableResult.exitCode).toBe(0);
      
      // Check configuration
      const configPath = path.join(repoPath, '.baseguardrc.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(config.automation.enabled).toBe(true);
      
      // Disable automation
      const disableResult = await runBaseGuard(['automation', 'disable'], repoPath);
      expect(disableResult.exitCode).toBe(0);
      
      // Check configuration updated
      const updatedConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(updatedConfig.automation.enabled).toBe(false);
    }, TEST_TIMEOUT);

    it('should handle different trigger configurations', async () => {
      const repoPath = path.join(TEMP_DIR, 'trigger-config-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      // Test pre-commit trigger
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      let config = JSON.parse(await fs.readFile(path.join(repoPath, '.baseguardrc.json'), 'utf8'));
      expect(config.automation.trigger).toBe('pre-commit');
      
      // Test pre-push trigger
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-push'], repoPath);
      config = JSON.parse(await fs.readFile(path.join(repoPath, '.baseguardrc.json'), 'utf8'));
      expect(config.automation.trigger).toBe('pre-push');
    }, TEST_TIMEOUT);
  });

  describe('Incremental Scanning', () => {
    it('should only scan changed files in git workflow', async () => {
      const repoPath = path.join(TEMP_DIR, 'incremental-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      
      // Create multiple files
      await fs.writeFile(path.join(repoPath, 'file1.js'), 'console.log("file1");');
      await fs.writeFile(path.join(repoPath, 'file2.js'), 'console.log("file2");');
      await createTestFiles(repoPath); // Creates files with violations
      
      runGit(['add', 'file1.js', 'file2.js'], repoPath);
      runGit(['commit', '-m', 'Add safe files'], repoPath);
      
      // Now stage only the files with violations
      runGit(['add', 'test.js', 'test.css'], repoPath);
      
      const config = {
        version: '1.0.0',
        targets: [{ browser: 'safari', minVersion: '15' }],
        automation: {
          enabled: true,
          trigger: 'pre-commit',
          blockCommit: true
        }
      };
      await fs.writeFile(path.join(repoPath, '.baseguardrc.json'), JSON.stringify(config, null, 2));
      
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      
      // The automation should only check staged files
      try {
        runGit(['commit', '-m', 'Add files with violations'], repoPath);
        expect.fail('Commit should have been blocked');
      } catch (error: any) {
        expect(error.message).toContain('Git command failed');
      }
    }, TEST_TIMEOUT);
  });

  describe('Error Recovery', () => {
    it('should handle corrupted git hooks gracefully', async () => {
      const repoPath = path.join(TEMP_DIR, 'corrupted-hook-test');
      await setupGitRepo(repoPath);
      
      await runBaseGuard(['init'], repoPath);
      await runBaseGuard(['automation', 'enable', '--trigger', 'pre-commit'], repoPath);
      
      // Corrupt the hook file
      const hookPath = path.join(repoPath, '.husky/pre-commit');
      await fs.writeFile(hookPath, 'invalid shell script content {{{');
      
      // Create and stage files
      await fs.writeFile(path.join(repoPath, 'test.js'), 'console.log("test");');
      runGit(['add', '.'], repoPath);
      
      // Commit should either succeed (hook fails) or provide clear error
      try {
        const result = runGit(['commit', '-m', 'Test corrupted hook'], repoPath);
        // If it succeeds, that's also acceptable behavior
        expect(result).toContain('Test corrupted hook');
      } catch (error: any) {
        // If it fails, error should be about the hook, not BaseGuard crashing
        expect(error.message).toContain('hook') || expect(error.message).toContain('script');
      }
    }, TEST_TIMEOUT);

    it('should handle missing BaseGuard configuration in git workflow', async () => {
      const repoPath = path.join(TEMP_DIR, 'missing-config-test');
      await setupGitRepo(repoPath);
      
      // Install hooks without proper BaseGuard initialization
      await fs.mkdir(path.join(repoPath, '.husky'), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, '.husky/pre-commit'),
        '#!/bin/sh\n. "$(dirname "$0")/_/husky.sh"\nbase automation run --trigger pre-commit'
      );
      
      // Create and stage files
      await fs.writeFile(path.join(repoPath, 'test.js'), 'console.log("test");');
      runGit(['add', '.'], repoPath);
      
      // Should handle missing configuration gracefully
      try {
        runGit(['commit', '-m', 'Test missing config'], repoPath);
      } catch (error: any) {
        // Should provide helpful error about missing configuration
        expect(error.message).toContain('configuration') || expect(error.message).toContain('init');
      }
    }, TEST_TIMEOUT);
  });
});