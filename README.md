# BaseGuard 🛡️

Never ship incompatible code again - AI-powered browser compatibility enforcement

## Overview

BaseGuard is an intelligent browser compatibility enforcement tool that prevents incompatible code from reaching production by combining three AI layers:

1. **Baseline Detection** - Uses the official web-features package for instant compatibility checking
2. **Gemini Analysis** - AI-powered research and fix strategy recommendations  
3. **Jules Implementation** - Autonomous code fixing with progressive enhancement

## Features

- 🔍 **Universal Framework Support** - React, Vue, Svelte, Angular, vanilla JS/CSS
- 🤖 **AI-Powered Analysis** - Research user impact and best practices
- 🔧 **Autonomous Fixing** - Generate and apply compatibility fixes automatically
- 🪝 **Git Integration** - Pre-commit/pre-push hooks for automated enforcement
- 📊 **Beautiful CLI** - Colorful output with progress indicators and tables
- ⚡ **Offline-First** - Baseline checking works without network connectivity

## Installation

```bash
npm install -g baseguard
```

## Quick Start

```bash
# Initialize in your project
base init

# Check for violations
base check

# Fix violations with AI
base fix

# Enable git automation
base automation enable --auto-fix
```

## Commands

### Core Commands
- `base init` - Initialize BaseGuard in your project
- `base check` - Check for compatibility violations
- `base fix` - Fix violations with AI analysis and implementation

### Configuration
- `base config show` - Show current configuration
- `base config set-keys` - Set up API keys for Jules and Gemini
- `base config targets` - Manage browser targets

### Automation
- `base automation enable` - Enable git hooks
- `base automation disable` - Disable git hooks
- `base automation status` - Show automation status

## Browser Targets

BaseGuard supports flexible browser targeting:

- **Baseline Widely** - Features supported for 30+ months
- **Baseline Newly** - Recently available baseline features
- **Custom Versions** - Specific browser versions (e.g., "chrome 100")
- **Baseline Keyword** - Use "baseline" for automatic baseline targeting

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Development mode
npm run dev
```

## Requirements

- Node.js 18+
- Git (for automation features)
- API keys for Jules and Gemini (for AI features)

## License

MIT