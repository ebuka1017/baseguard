# BaseGuard 🛡️

**Never ship incompatible code again** - Intelligent browser compatibility enforcement with AI-powered analysis and autonomous fixing.

## What is BaseGuard?

BaseGuard is a comprehensive browser compatibility tool that prevents incompatible code from reaching production. It combines official Baseline data with AI-powered analysis and code fixing to ensure your web applications work across all target browsers.

### Key Features

- 🔍 **Universal Framework Support** - Works with React, Vue, Svelte, vanilla JS/CSS, and more
- 🤖 **Dual AI Coding Agents** - Choose between Jules (GitHub repos) or Gemini 2.5 Pro (any files)
- 📊 **Official Baseline Data** - Uses web-features package for accurate compatibility checking
- 🔧 **Intelligent Code Fixing** - AI generates progressive enhancement and polyfill solutions
- 🪝 **Git Integration** - Automated pre-commit/pre-push hooks with violation blocking
- 📈 **Graceful Degradation** - Works offline and handles service failures intelligently
- 🎨 **Beautiful CLI** - Colorful terminal output with progress indicators and detailed reports

## Installation

```bash
npm install -g baseguard
```

**Requirements:**
- Node.js 18 or higher
- Git (for automation features)
- API keys for AI services (setup guide below)

## Quick Start

### 1. Initialize BaseGuard in Your Project

```bash
cd your-project
base init
```

This will:
- Create `.baseguardrc.json` configuration file
- Set up browser compatibility targets
- Guide you through API key setup
- Optionally install git hooks for automation

### 2. Check for Compatibility Issues

```bash
# Check all supported files
base check

# Check specific files or patterns
base check --files "src/**/*.ts"

# Strict mode (exit with error if violations found)
base check --strict
```

### 3. Fix Issues with AI

```bash
# Interactive fixing with preview
base fix

# Automatic fixing (no prompts)
base fix --auto

# Analysis only (no code changes)
base fix --analyze-only
```

## 🚀 Getting Started with AI Services

BaseGuard offers two AI coding agents for fixing compatibility issues. You can choose the one that best fits your workflow:

### Option 1: Gemini 2.5 Pro (Recommended for Most Users)

**Best for:** Any codebase, local development, uncommitted files

**Setup Steps:**

1. **Get your Gemini API key:**
   - Go to [Google AI Studio](https://aistudio.google.com)
   - Sign in with your Google account
   - Click "Get API key" in the left sidebar
   - Click "Create API key" → "Create API key in new project"
   - Copy your API key

2. **Configure BaseGuard:**
   ```bash
   base config set-keys
   # Follow the prompts to enter your Gemini API key
   
   # Set Gemini as your primary coding agent
   base config coding-agent --agent gemini
   ```

**Advantages:**
- ✅ Works with any files (GitHub, local, uncommitted)
- ✅ Immediate processing and results
- ✅ No repository requirements
- ✅ Grounded with real-time web search
- ✅ Perfect for local development

### Option 2: Jules (Google's Autonomous Coding Agent)

**Best for:** GitHub repositories, autonomous cloud-based fixing

**Setup Steps:**

1. **Get your Jules API key:**
   - Go to [Jules Dashboard](https://jules.google.com)
   - Sign in with your Google account
   - Connect your GitHub account and authorize repositories
   - Get your API key from the dashboard

2. **Configure BaseGuard:**
   ```bash
   base config set-keys
   # Follow the prompts to enter your Jules API key
   
   # Set Jules as your primary coding agent
   base config coding-agent --agent jules
   ```

**Advantages:**
- ✅ Autonomous operation in cloud VMs
- ✅ Full repository context understanding
- ✅ Asynchronous processing
- ❌ Requires GitHub repository
- ❌ Cannot work with local/uncommitted files

### Dual Agent Setup (Recommended)

You can configure both agents and BaseGuard will automatically choose the best one:

```bash
base config set-keys
# Enter both Gemini and Jules API keys

base config coding-agent
# Choose your preferred primary agent
# BaseGuard will fallback to the other when needed
```

## 📋 Complete Command Reference

### Core Commands

```bash
# Project initialization
base init                           # Interactive setup
base init --preset baseline-widely  # Use specific browser preset
base init --skip-hooks             # Skip git hook installation

# Compatibility checking
base check                          # Check all supported files
base check --strict                 # Exit with error if violations found
base check --files "src/**/*.ts"    # Check specific file patterns
base check --format json           # Output results as JSON
base check --offline                # Run without network requests

# AI-powered fixing
base fix                            # Interactive fixing with previews
base fix --auto                     # Apply all fixes automatically
base fix --analyze-only             # Only analyze, don't generate fixes
base fix --files "src/**/*.css"     # Fix specific file patterns
```

### Configuration Management

```bash
# View configuration
base config show                    # Detailed configuration display
base config list                    # Quick configuration summary
base config list --format json     # Export configuration as JSON

# API key management
base config set-keys                # Interactive API key setup
base config coding-agent            # Manage coding agent selection
base config coding-agent --show     # Show current agent configuration
base config coding-agent --agent gemini  # Set specific agent

# Browser targets
base config targets --add "chrome 100"           # Add browser target
base config targets --remove chrome              # Remove browser targets
base config targets --preset baseline-widely    # Set browser preset

# Configuration maintenance
base config validate               # Check configuration for errors
base config recover                # Attempt automatic recovery
base config recover --backup       # Create backup before recovery
```

### Git Automation

```bash
# Automation control
base automation enable              # Enable git hooks with setup wizard
base automation enable --trigger pre-push  # Enable with specific trigger
base automation disable            # Disable automation and remove hooks
base automation status             # Show detailed automation status
base automation configure          # Interactive automation setup

# Manual automation testing
base automation run --trigger pre-commit   # Test pre-commit behavior
base automation run --trigger pre-push     # Test pre-push behavior
```

### System Management

```bash
# System health and diagnostics
base status                         # Show system health overview
base status --verbose               # Detailed system information
base status --services              # Check external service availability
base diagnostics                    # Run comprehensive system diagnostics

# Quick shortcuts
base add "firefox 90"              # Quick browser target addition
base remove safari                  # Quick browser target removal
base list                          # Quick configuration summary
base version                       # Show version information
base help [command]                # Get help for specific commands
```

## 🎯 Browser Compatibility Targets

BaseGuard supports flexible browser targeting strategies:

### Preset Configurations

```bash
# Baseline Widely (Recommended)
# Features supported across browsers for 30+ months
base config targets --preset baseline-widely

# Baseline Newly  
# Recently available Baseline features (cutting-edge)
base config targets --preset baseline-newly

# Last 2 Years
# Browsers released in the last 2 years
base config targets --preset last-2-years
```

### Custom Browser Targets

```bash
# Specific browser versions
base add "chrome 100"              # Chrome 100 and above
base add "firefox 90"              # Firefox 90 and above
base add "safari 15"               # Safari 15 and above

# Baseline keyword support
base add "chrome baseline"         # Chrome with Baseline support
base add "safari baseline"         # Safari with Baseline support
```

### Example Configurations

**Conservative (Maximum Compatibility):**
```json
{
  "targets": [
    "chrome 88",
    "firefox 78", 
    "safari 14",
    "edge 88"
  ]
}
```

**Modern (Baseline Widely):**
```json
{
  "targets": [
    "chrome baseline",
    "firefox baseline",
    "safari baseline"
  ]
}
```

**Cutting-edge (Latest Features):**
```json
{
  "targets": [
    "chrome 120",
    "firefox 120",
    "safari 17"
  ]
}
```

## 🔧 Git Integration & Automation

BaseGuard can automatically check your code before commits or pushes:

### Setup Git Hooks

```bash
# Enable automation with interactive setup
base automation enable

# Choose your trigger:
# - pre-commit: Check before each commit (faster feedback)
# - pre-push: Check before each push (less frequent)

# Enable with specific settings
base automation enable --trigger pre-commit --auto-fix
```

### Automation Features

- **Violation Detection:** Automatically scans staged files (pre-commit) or all files (pre-push)
- **Commit Blocking:** Prevents commits/pushes when violations are found
- **Auto-fixing:** Optionally applies AI fixes automatically
- **Manual Override:** Use `git commit --no-verify` to bypass when needed

### Automation Workflow

1. **Developer makes changes** and runs `git commit`
2. **BaseGuard hook triggers** and scans the staged files
3. **If violations found:**
   - Shows detailed violation report
   - Blocks the commit
   - Suggests running `base fix` to resolve issues
4. **If no violations:** Commit proceeds normally

## 🛠️ Advanced Usage

### Environment Variables

```bash
# Performance tuning
export BASEGUARD_MAX_WORKERS=4      # Limit concurrent file processing
export BASEGUARD_MAX_FILES=1000     # Limit total files processed
export BASEGUARD_CACHE_SIZE=500     # Limit cache size

# Memory optimization
export NODE_OPTIONS="--max-old-space-size=512"  # Limit Node.js memory
```

### CI/CD Integration

```bash
# In your CI pipeline
base check --strict --format junit > baseguard-results.xml

# Exit codes:
# 0 = No violations found
# 1 = Violations found (in strict mode)
```

### Offline Development

BaseGuard works offline for baseline checking:

```bash
# Run in offline mode (no AI analysis)
base check --offline

# Baseline checking works without network
# AI features require internet connection
```

## 🔍 What BaseGuard Checks

BaseGuard analyzes your code for browser compatibility issues across:

### Web Platform Features
- **CSS Properties & Selectors:** Grid, Flexbox, custom properties, modern selectors
- **JavaScript APIs:** Fetch, Promises, async/await, ES6+ features
- **HTML Elements & Attributes:** Modern form inputs, semantic elements
- **Web APIs:** Canvas, WebGL, WebRTC, WebAssembly, Service Workers

### Framework Support
- **React/JSX:** Ignores React-specific syntax, focuses on web platform usage
- **Vue:** Analyzes `<script>` and `<style>` blocks for web platform features  
- **Svelte:** Extracts web platform usage from component files
- **Vanilla:** Direct analysis of JS, CSS, and HTML files

### Example Violations

```javascript
// ❌ Will be flagged for older browsers
const data = await fetch('/api/data');
const result = data.json();

// ✅ BaseGuard can suggest fixes like:
const data = window.fetch ? 
  await fetch('/api/data') : 
  await fetchPolyfill('/api/data');
```

```css
/* ❌ Will be flagged for older browsers */
.container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

/* ✅ BaseGuard can suggest progressive enhancement */
.container {
  display: flex; /* Fallback */
  flex-wrap: wrap;
}

@supports (display: grid) {
  .container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
}
```

## 🚨 Troubleshooting

### Common Issues

**"No files found to check"**
```bash
# Check your file pattern
base check --files "**/*.{js,ts,jsx,tsx}"

# Verify you're in the right directory
ls -la  # Should see your source files
```

**"Configuration not found"**
```bash
# Initialize BaseGuard in your project
base init

# Or recover corrupted configuration
base config recover
```

**"API key invalid"**
```bash
# Reconfigure your API keys
base config set-keys

# Verify your keys are correct:
# - Gemini: Should start with "AIza"
# - Jules: Get from jules.google.com dashboard
```

**"Git hooks not working"**
```bash
# Check automation status
base automation status

# Reinstall hooks
base automation disable
base automation enable
```

### Getting Help

```bash
# System health check
base status --verbose

# Comprehensive diagnostics
base diagnostics

# Debug mode for detailed logging
base check --debug
base fix --debug
```

### Support Resources

- **Documentation:** [GitHub Repository](https://github.com/ebuka1017/baseguard)
- **Issues:** [Report bugs and request features](https://github.com/ebuka1017/baseguard/issues)
- **API Documentation:**
  - [Gemini API](https://ai.google.dev/docs)
  - [Jules Documentation](https://jules.google.com/docs)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ by the BaseGuard Team**

*Never ship incompatible code again!* 🛡️