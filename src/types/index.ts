/**
 * Core data models for BaseGuard
 */

export interface Violation {
  feature: string;           // 'container-type'
  featureId: string;         // 'container-queries' (web-features ID)
  file: string;              // 'src/Card.css'
  line: number;              // 15
  column: number;            // 5
  context: string;           // '  container-type: inline-size;'
  browser: string;           // 'safari'
  required: string;          // '15'
  actual: string | false;    // '16' or false
  baselineStatus: string;    // 'newly' | 'widely' | false
  reason: string;            // Human-readable explanation
}

export interface Analysis {
  violation: Violation;
  userImpact: string;        // "8% of users on Safari 15"
  marketShare: number;       // 0.08
  fixStrategy: string;       // "progressive enhancement"
  bestPractices: string[];   // ["Use @supports", "Add fallback"]
  sources: string[];         // ["https://web.dev/...", "https://mdn..."]
  plainEnglish: string;      // Full explanation
  confidence: number;        // 0.0-1.0
}

export interface Fix {
  violation: Violation;
  analysis: Analysis;
  patch: string;             // Unified diff format
  explanation: string;       // What the fix does
  filePath: string;          // Target file
  preview: string;           // Human-readable preview
  confidence: number;        // 0.0-1.0
  testable: boolean;         // Can be automatically tested
}

export interface BrowserTarget {
  browser: string; // 'chrome', 'safari', 'firefox', etc.
  minVersion: string | 'baseline' | 'baseline-newly';
}

export interface Configuration {
  version: string;
  targets: BrowserTarget[];
  apiKeys: {
    jules: string | null;
    gemini: string | null;
  };
  automation: {
    enabled: boolean;
    trigger: 'pre-commit' | 'pre-push';
    autoAnalyze: boolean;
    autoFix: boolean;
    blockCommit: boolean;
  };
}

export interface DetectedFeature {
  feature: string;        // e.g., 'container-type', 'dialog.showModal'
  type: 'css' | 'js' | 'html';
  line: number;
  column: number;
  context: string;        // surrounding code for display
  file?: string;          // file path where feature was detected
}

export interface CompatibilityResult {
  violations: Violation[];
  featureData: any; // web-features data structure
}

export interface AutomationOptions {
  trigger: 'pre-commit' | 'pre-push';
  strict?: boolean;
}

export interface JulesSession {
  id: string;
  status: string;
  title: string;
}

export interface JulesActivity {
  id: string;
  type: string;
  status: string;
  timestamp: string;
}