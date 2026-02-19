import chalk from 'chalk';
import { UIComponents } from '../ui/index.js';
import { BaseGuard } from '../core/index.js';
import { ConfigurationManager } from '../core/configuration.js';
import { ErrorHandler } from '../core/error-handler.js';
import { UnifiedCodeFixer } from '../ai/unified-code-fixer.js';
import { GeminiAnalyzer } from '../ai/gemini-analyzer.js';
import { FixManager } from '../ai/fix-manager.js';
import { glob } from 'glob';

/**
 * Fix violations with AI analysis and implementation
 */
export async function fix(options: {
  auto?: boolean;
  analyzeOnly?: boolean;
  files?: string;
}): Promise<void> {
  try {
    console.log(chalk.cyan('🔧 BaseGuard AI Fix\n'));
    
    // Load configuration
    const config = await ConfigurationManager.load();
    
    // Initialize services
    const baseGuard = new BaseGuard(config);
    const unifiedCodeFixer = new UnifiedCodeFixer(config);
    const fixManager = new FixManager();
    const geminiAnalyzer = config.apiKeys.gemini ? new GeminiAnalyzer(config.apiKeys.gemini) : null;
    
    // Show agent status and recommendations
    console.log(chalk.cyan('🤖 Coding Agent Status:'));
    const agentStatus = await unifiedCodeFixer.getAgentStatus();
    
    const primaryAvailable = agentStatus.primary === 'jules' ? agentStatus.jules.available : agentStatus.gemini.available;
    const fallbackAvailable = agentStatus.fallback === 'jules' ? agentStatus.jules.available : agentStatus.gemini.available;
    
    console.log(`   Primary: ${agentStatus.primary} ${primaryAvailable ? '✅' : '❌'}`);
    console.log(`   Fallback: ${agentStatus.fallback} ${fallbackAvailable ? '✅' : '❌'}`);
    
    if (!agentStatus.jules.configured && !agentStatus.gemini.configured) {
      console.log(chalk.red('\n❌ No coding agents are available'));
      console.log(chalk.cyan('💡 Configure API keys to enable code fixing:'));
      console.log(chalk.cyan('   • Run "base config set-keys" to configure API keys'));
      console.log(chalk.cyan('   • Get Gemini API key: https://aistudio.google.com'));
      console.log(chalk.cyan('   • Get Jules API key: https://jules.google.com/settings#api'));
      process.exit(1);
    }
    
    // Show agent-specific information
    if (agentStatus.primary === 'jules' && agentStatus.jules.repoDetected) {
      console.log(chalk.cyan('🔗 GitHub repository detected - Jules available for autonomous fixing'));
    } else if (agentStatus.primary === 'gemini' || !agentStatus.jules.repoDetected) {
      console.log(chalk.cyan('💎 Using Gemini 2.5 Pro for local file fixing'));
      console.log(chalk.dim('   This works with any local files, no GitHub required'));
    }
    
    // Step 1: Check for violations
    console.log(chalk.cyan('🔍 Scanning for compatibility violations...'));
    
    // Get files to fix
    const filePattern = options.files || '**/*.{js,jsx,ts,tsx,vue,svelte,css,html}';
    const files = await glob(filePattern, {
      ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '.git/**',
        '**/*.min.js',
        '**/*.min.css'
      ]
    });
    
    const violations = await baseGuard.checkViolations(files);
    
    if (violations.length === 0) {
      UIComponents.showSuccessBox('No compatibility violations found!');
      return;
    }
    
    console.log(chalk.yellow(`\n⚠️ Found ${violations.length} compatibility violations\n`));
    UIComponents.showViolations(violations);
    
    // Step 2: Analyze violations with Gemini
    let analyses;
    if (geminiAnalyzer) {
      console.log(chalk.cyan('\n🧠 Analyzing violations with AI...'));
      analyses = await geminiAnalyzer.analyzeViolations(violations);
    } else {
      console.log(chalk.yellow('\n⚠️ Gemini API key not configured, using fallback analysis...'));
      analyses = await baseGuard.analyzeViolations(violations);
    }
    
    // If analyze-only mode, show analysis and exit
    if (options.analyzeOnly) {
      console.log(chalk.cyan('\n📋 Analysis Results:\n'));
      analyses.forEach((analysis, index) => {
        console.log(chalk.yellow(`${index + 1}. ${analysis.violation.feature} in ${analysis.violation.file}`));
        console.log(`   Impact: ${analysis.userImpact}`);
        console.log(`   Strategy: ${analysis.fixStrategy}`);
        console.log(`   Confidence: ${Math.round(analysis.confidence * 100)}%\n`);
      });
      return;
    }
    
    // Step 3: Generate fixes with unified code fixer
    console.log(chalk.cyan(`\n🤖 Generating fixes with ${agentStatus.primary}...`));
    
    const fixes = [];
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < violations.length; i++) {
      const violation = violations[i];
      const analysis = analyses[i];
      
      if (!violation || !analysis) continue;
      
      try {
        console.log(chalk.cyan(`\n🔧 Fixing ${violation.feature} in ${violation.file}...`));
        
        const fix = await unifiedCodeFixer.generateFix(violation, analysis);
        fixes.push(fix);
        successCount++;
        
        console.log(chalk.green(`✅ Fix generated (confidence: ${Math.round(fix.confidence * 100)}%)`));
        
        // Show preview if not in auto mode
        if (!options.auto) {
          console.log(chalk.dim('\nPreview:'));
          console.log(chalk.dim(fix.preview.substring(0, 200) + (fix.preview.length > 200 ? '...' : '')));
        }
        
      } catch (error) {
        failedCount++;
        console.log(chalk.red(`❌ Failed to generate fix: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
    
    if (fixes.length === 0) {
      console.log(chalk.yellow('\n⚠️ No fixes were generated'));
      return;
    }
    
    // Show results summary
    console.log(chalk.cyan('\n📊 Fix Generation Results:\n'));
    console.log(chalk.green(`✅ Generated ${successCount} fixes`));
    if (failedCount > 0) {
      console.log(chalk.red(`❌ Failed to generate ${failedCount} fixes`));
    }
    
    // Show fixes with previews
    if (!options.auto && fixes.length > 0) {
      console.log(chalk.cyan('\n🔍 Generated Fixes:\n'));
      fixes.forEach((fix, index) => {
        console.log(chalk.white(`${index + 1}. ${fix.violation.feature} in ${fix.filePath}`));
        console.log(chalk.dim(`   Confidence: ${Math.round(fix.confidence * 100)}%`));
        console.log(chalk.dim(`   Strategy: ${fix.analysis.fixStrategy}`));
        
        // Show a snippet of the explanation
        const explanation = fix.explanation?.split('\n')[0] || 'No explanation available';
        if (explanation.length > 80) {
          console.log(chalk.dim(`   ${explanation.substring(0, 80)}...`));
        } else {
          console.log(chalk.dim(`   ${explanation}`));
        }
        console.log();
      });
    }
    
    // Step 4: Apply fixes
    let appliedCount = 0;
    let skippedCount = 0;
    let applyFailedCount = 0;
    
    if (options.auto) {
      console.log(chalk.cyan('\n⚡ Applying fixes automatically...'));
      for (const fix of fixes) {
        try {
          await fixManager.applyFix(fix);
          appliedCount++;
        } catch (error) {
          applyFailedCount++;
          console.log(chalk.red(`❌ Failed to apply fix for ${fix.filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    } else {
      console.log(chalk.cyan('\n🧩 Review and apply fixes:'));
      const results = await fixManager.applyFixes(fixes);
      appliedCount = results.applied.length;
      skippedCount = results.skipped.length;
      applyFailedCount = results.failed.length;
    }
    
    // Show summary
    console.log(chalk.cyan(`\n📈 Summary: ${successCount}/${violations.length} fixes generated successfully`));
    console.log(chalk.green(`✅ Applied fixes: ${appliedCount}`));
    if (skippedCount > 0) {
      console.log(chalk.yellow(`⏭️ Skipped fixes: ${skippedCount}`));
    }
    if (applyFailedCount > 0) {
      console.log(chalk.red(`❌ Failed to apply: ${applyFailedCount}`));
    }
    
    if (failedCount > 0) {
      console.log(chalk.yellow(`\n⚠️ ${failedCount} fixes failed to generate. This may be due to:`));
      console.log(chalk.yellow('   • Complex compatibility issues requiring manual review'));
      console.log(chalk.yellow('   • API rate limits or temporary service issues'));
      console.log(chalk.yellow('   • Files that couldn\'t be read or analyzed'));
    }
    
    // Show next steps
    console.log(chalk.cyan('\n💡 Next Steps:'));
    console.log(chalk.cyan('   • Test your application after applying fixes'));
    console.log(chalk.cyan('   • Run "base check" to verify fixes resolve violations'));
    
    UIComponents.showSuccessBox('Fix process completed!');
    
  } catch (error) {
    const apiError = ErrorHandler.handleAPIError(error);
    ErrorHandler.displayError(apiError);
    
    // Provide specific help for fix command issues
    console.log('\n💡 Troubleshooting:');
    if (apiError.type === 'authentication') {
      UIComponents.showList([
        'Check your API keys with "base config show"',
        'Update API keys with "base config set-keys"',
        'Verify API keys are valid and not expired',
        'Ensure you have proper permissions for Jules and Gemini'
      ]);
    } else if (apiError.type === 'configuration') {
      UIComponents.showList([
        'Run "base init" to set up BaseGuard configuration',
        'Configure API keys with "base config set-keys"',
        'Ensure you are in a GitHub repository for Jules fixing'
      ]);
    } else if (apiError.type === 'network') {
      UIComponents.showList([
        'Check your internet connection',
        'Verify firewall allows access to AI services',
        'Try again when network connection is stable'
      ]);
    } else {
      UIComponents.showList([
        'Try running "base check" for basic violation detection',
        'Verify your API keys are configured correctly',
        'Check the documentation for troubleshooting steps'
      ]);
    }
    
    // Show fallback suggestions
    if (ErrorHandler.shouldUseFallbackMode(apiError)) {
      console.log('\n🔄 Alternative options:');
      UIComponents.showList([
        'Run "base check" for offline compatibility checking',
        'Review violations manually using browser compatibility tables',
        'Try AI features again when services are available'
      ]);
    }
    
    process.exit(1);
  }
}
