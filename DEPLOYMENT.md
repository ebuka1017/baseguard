# BaseGuard Deployment Guide

This guide covers deploying BaseGuard in various environments and integrating it into development workflows.

## 📦 Installation Methods

### Global Installation (Recommended)

```bash
# Install globally for CLI access
npm install -g baseguard

# Verify installation
base --version
```

### Project-specific Installation

```bash
# Install as dev dependency
npm install --save-dev baseguard

# Use with npx
npx base init
```

### From Source

```bash
# Clone repository
git clone https://github.com/ebuka1017/baseguard.git
cd baseguard

# Install dependencies
npm install

# Build project
npm run build

# Link globally
npm link
```

## 🏗️ CI/CD Integration

### GitHub Actions

Create `.github/workflows/baseguard.yml`:

```yaml
name: BaseGuard Compatibility Check

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  compatibility-check:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install BaseGuard
      run: npm install -g baseguard
    
    - name: Initialize BaseGuard
      run: |
        base init --preset baseline-widely --skip-hooks --skip-api-keys
    
    - name: Check compatibility
      run: base check --strict --format junit > baseguard-results.xml
    
    - name: Upload results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: baseguard-results
        path: baseguard-results.xml
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - compatibility-check

baseguard:
  stage: compatibility-check
  image: node:18
  before_script:
    - npm install -g baseguard
  script:
    - base init --preset baseline-widely --skip-hooks --skip-api-keys
    - base check --strict --format json > baseguard-report.json
  artifacts:
    reports:
      junit: baseguard-report.json
    expire_in: 1 week
  only:
    - merge_requests
    - main
```

### Jenkins Pipeline

Create `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    tools {
        nodejs '18'
    }
    
    stages {
        stage('Install BaseGuard') {
            steps {
                sh 'npm install -g baseguard'
            }
        }
        
        stage('Initialize') {
            steps {
                sh 'base init --preset baseline-widely --skip-hooks --skip-api-keys'
            }
        }
        
        stage('Compatibility Check') {
            steps {
                sh 'base check --strict --format junit > baseguard-results.xml'
            }
            post {
                always {
                    junit 'baseguard-results.xml'
                }
            }
        }
    }
}
```

### Azure DevOps

Create `azure-pipelines.yml`:

```yaml
trigger:
- main

pool:
  vmImage: 'ubuntu-latest'

steps:
- task: NodeTool@0
  inputs:
    versionSpec: '18.x'
  displayName: 'Install Node.js'

- script: |
    npm install -g baseguard
    base init --preset baseline-widely --skip-hooks --skip-api-keys
  displayName: 'Setup BaseGuard'

- script: |
    base check --strict --format junit > $(Agent.TempDirectory)/baseguard-results.xml
  displayName: 'Run Compatibility Check'

- task: PublishTestResults@2
  inputs:
    testResultsFormat: 'JUnit'
    testResultsFiles: '$(Agent.TempDirectory)/baseguard-results.xml'
  displayName: 'Publish Results'
```

## 🐳 Docker Integration

### Dockerfile

```dockerfile
FROM node:18-alpine

# Install BaseGuard globally
RUN npm install -g baseguard

# Set working directory
WORKDIR /app

# Copy project files
COPY . .

# Install project dependencies
RUN npm ci

# Initialize BaseGuard
RUN base init --preset baseline-widely --skip-hooks --skip-api-keys

# Run compatibility check
CMD ["base", "check", "--strict"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  baseguard:
    build: .
    volumes:
      - .:/app
    environment:
      - NODE_ENV=production
    command: base check --strict --format json
```

## 🔧 Team Configuration

### Shared Configuration

Create a shared `.baseguardrc.json` template:

```json
{
  "version": "1.0.2",
  "targets": [
    "chrome baseline",
    "firefox baseline", 
    "safari baseline"
  ],
  "codingAgent": {
    "primary": "gemini",
    "fallback": "jules"
  },
  "automation": {
    "enabled": true,
    "trigger": "pre-commit",
    "autoAnalysis": true,
    "autoFix": false
  },
  "files": {
    "include": ["src/**/*.{js,jsx,ts,tsx,vue,svelte,css}"],
    "exclude": ["node_modules/**", "dist/**", "build/**"]
  }
}
```

### Team Setup Script

Create `scripts/setup-baseguard.sh`:

```bash
#!/bin/bash

echo "🛡️ Setting up BaseGuard for the team..."

# Install BaseGuard globally
npm install -g baseguard

# Initialize with team configuration
base init --preset baseline-widely

# Enable automation
base automation enable --trigger pre-commit

echo "✅ BaseGuard setup complete!"
echo "📝 Next steps:"
echo "   1. Run 'base config set-keys' to configure API keys"
echo "   2. Run 'base check' to verify setup"
echo "   3. Run 'base fix' to test AI fixing"
```

## 🌐 Environment-specific Configurations

### Development Environment

```json
{
  "targets": ["chrome baseline", "firefox baseline"],
  "automation": {
    "enabled": true,
    "trigger": "pre-commit",
    "autoFix": true
  },
  "debug": true
}
```

### Staging Environment

```json
{
  "targets": ["baseline-widely"],
  "automation": {
    "enabled": true,
    "trigger": "pre-push",
    "autoFix": false
  },
  "strict": true
}
```

### Production Environment

```json
{
  "targets": ["chrome 88", "firefox 78", "safari 14"],
  "automation": {
    "enabled": false
  },
  "offline": true
}
```

## 📊 Monitoring & Reporting

### Custom Reporting Script

Create `scripts/baseguard-report.js`:

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

async function generateReport() {
  try {
    // Run BaseGuard check
    const result = execSync('base check --format json', { encoding: 'utf8' });
    const violations = JSON.parse(result);
    
    // Generate HTML report
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>BaseGuard Compatibility Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .violation { border: 1px solid #ddd; margin: 10px 0; padding: 15px; }
        .error { border-color: #ff6b6b; background: #ffe0e0; }
        .warning { border-color: #ffa726; background: #fff3e0; }
      </style>
    </head>
    <body>
      <h1>🛡️ BaseGuard Compatibility Report</h1>
      <p>Generated: ${new Date().toISOString()}</p>
      <p>Total Violations: ${violations.length}</p>
      
      ${violations.map(v => `
        <div class="violation ${v.severity || 'error'}">
          <h3>${v.feature} in ${v.file}</h3>
          <p><strong>Browser:</strong> ${v.browser}</p>
          <p><strong>Line:</strong> ${v.line}</p>
          <p><strong>Reason:</strong> ${v.reason}</p>
        </div>
      `).join('')}
    </body>
    </html>
    `;
    
    fs.writeFileSync('baseguard-report.html', html);
    console.log('📊 Report generated: baseguard-report.html');
    
  } catch (error) {
    console.error('❌ Report generation failed:', error.message);
    process.exit(1);
  }
}

generateReport();
```

### Slack Integration

Create `scripts/slack-notify.js`:

```javascript
#!/usr/bin/env node

const https = require('https');
const { execSync } = require('child_process');

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

async function notifySlack() {
  try {
    const result = execSync('base check --format json', { encoding: 'utf8' });
    const violations = JSON.parse(result);
    
    const message = {
      text: `🛡️ BaseGuard Report`,
      attachments: [{
        color: violations.length > 0 ? 'danger' : 'good',
        fields: [{
          title: 'Compatibility Check Results',
          value: violations.length > 0 
            ? `❌ Found ${violations.length} compatibility violations`
            : `✅ No compatibility violations found`,
          short: false
        }]
      }]
    };
    
    // Send to Slack
    const data = JSON.stringify(message);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(SLACK_WEBHOOK, options);
    req.write(data);
    req.end();
    
    console.log('📢 Slack notification sent');
    
  } catch (error) {
    console.error('❌ Slack notification failed:', error.message);
  }
}

if (SLACK_WEBHOOK) {
  notifySlack();
} else {
  console.log('⚠️ SLACK_WEBHOOK_URL not configured');
}
```

## 🔐 Security Considerations

### API Key Management

**Environment Variables:**
```bash
# Set in CI/CD environment
export GEMINI_API_KEY="your-gemini-key"
export JULES_API_KEY="your-jules-key"
```

**Secrets Management:**
```bash
# GitHub Actions
# Add secrets in repository settings
# Use ${{ secrets.GEMINI_API_KEY }}

# GitLab CI
# Add variables in project settings
# Use $GEMINI_API_KEY

# Jenkins
# Use credentials plugin
# Reference as environment variables
```

### Configuration Security

**Gitignore Rules:**
```gitignore
# BaseGuard configuration (contains API keys)
.baseguardrc.json

# BaseGuard logs and cache
.baseguard/

# Environment files
.env.local
.env.*.local
```

**Team Configuration:**
```bash
# Use template without API keys
cp .baseguardrc.template.json .baseguardrc.json

# Configure API keys separately
base config set-keys
```

## 🚀 Performance Optimization

### Large Codebases

```bash
# Limit file processing
export BASEGUARD_MAX_FILES=1000
export BASEGUARD_MAX_WORKERS=4

# Use specific file patterns
base check --files "src/**/*.{ts,tsx}" --files "!src/**/*.test.ts"
```

### Memory Optimization

```bash
# Limit Node.js memory usage
export NODE_OPTIONS="--max-old-space-size=512"

# Use streaming for large files
export BASEGUARD_STREAM_THRESHOLD=10485760  # 10MB
```

### Caching Strategy

```bash
# Configure cache size
export BASEGUARD_CACHE_SIZE=1000

# Cache directory (optional)
export BASEGUARD_CACHE_DIR="/tmp/baseguard-cache"
```

## 🔄 Migration Guide

### From Version 1.0.1 to 1.0.2

1. **Update BaseGuard:**
   ```bash
   npm update -g baseguard
   ```

2. **Update Configuration:**
   ```bash
   base config recover --backup
   ```

3. **Configure Coding Agents:**
   ```bash
   base config coding-agent
   ```

4. **Test New Features:**
   ```bash
   base status
   base diagnostics
   ```

### Configuration Migration

The new version automatically migrates old configurations, but you can manually update:

```json
{
  "version": "1.0.2",
  "targets": ["baseline-widely"],
  "codingAgent": {
    "primary": "gemini",
    "fallback": "jules"
  },
  "automation": {
    "enabled": true,
    "trigger": "pre-commit"
  }
}
```

## 📞 Support & Troubleshooting

### Common Deployment Issues

**Permission Errors:**
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
npm install -g baseguard
```

**Git Hook Issues:**
```bash
# Reinstall hooks
base automation disable
base automation enable
```

**API Key Problems:**
```bash
# Reconfigure keys
base config set-keys

# Validate configuration
base config validate
```

### Getting Help

```bash
# System diagnostics
base diagnostics

# Verbose status
base status --verbose

# Debug mode
base check --debug
```

### Support Channels

- **GitHub Issues:** [Report bugs and request features](https://github.com/ebuka1017/baseguard/issues)
- **Documentation:** [Complete documentation](https://github.com/ebuka1017/baseguard#readme)
- **Community:** [Discussions and Q&A](https://github.com/ebuka1017/baseguard/discussions)

---

**Happy Deploying! 🚀**

*Never ship incompatible code again with BaseGuard!* 🛡️