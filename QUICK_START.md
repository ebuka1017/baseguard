# BaseGuard Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install BaseGuard

```bash
npm install -g baseguard
```

### Step 2: Initialize in Your Project

```bash
cd your-project
base init
```

Follow the prompts to:
- Choose browser targets (recommended: baseline-widely)
- Set up API keys (optional, for AI features)
- Install git hooks (optional, for automation)

### Step 3: Check for Issues

```bash
base check
```

This will scan your code and show any compatibility violations.

### Step 4: Fix Issues (Optional)

If you have API keys configured:

```bash
base fix
```

This will use AI to analyze and fix compatibility issues.

## 🔑 Setting Up AI Features

### Option 1: Gemini (Recommended)

**Best for:** Any codebase, works with local files

1. Go to https://aistudio.google.com
2. Click "Get API key" → "Create API key"
3. Copy your API key
4. Run: `base config set-keys`
5. Paste your Gemini API key when prompted

### Option 2: Jules

**Best for:** GitHub repositories only

1. Go to https://jules.google.com
2. Connect your GitHub account
3. Get your API key from the dashboard
4. Run: `base config set-keys`
5. Paste your Jules API key when prompted

## 📋 Essential Commands

```bash
# Check for violations
base check

# Fix violations with AI
base fix

# View configuration
base config show

# Enable git automation
base automation enable

# Get help
base help
```

## 🎯 Common Use Cases

### Use Case 1: Pre-Commit Checks

```bash
# Enable automation
base automation enable

# Choose "pre-commit" when prompted
# Now BaseGuard runs automatically before each commit!
```

### Use Case 2: CI/CD Integration

```bash
# In your CI pipeline
base check --strict --format junit > results.xml

# Exit code 1 if violations found
```

### Use Case 3: Specific File Patterns

```bash
# Check only TypeScript files
base check --files "src/**/*.ts"

# Check only CSS files
base check --files "**/*.css"
```

## 🔧 Troubleshooting

### "No files found"
Make sure you're in your project directory with source files.

### "Configuration not found"
Run `base init` to create configuration.

### "API key invalid"
Run `base config set-keys` to reconfigure your API keys.

## 📚 Learn More

- Full documentation: [README.md](README.md)
- Command reference: `base help [command]`
- System status: `base status`

---

**That's it! You're ready to use BaseGuard.** 🛡️

*Questions? Run `base help` or check the full README.*
