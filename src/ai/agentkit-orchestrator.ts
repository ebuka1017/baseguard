/**
 * AgentKit-inspired orchestrator for managing multiple coding agents
 * Based on OpenAI's AgentKit principles for production-ready agent workflows
 */

import type { Violation, Analysis, Fix } from '../types/index.js';
import { GeminiCodeFixer } from './gemini-code-fixer.js';
import { JulesImplementer } from './jules-implementer.js';
import { logger } from '../core/debug-logger.js';
import chalk from 'chalk';

export interface AgentCapabilities {
    codeGeneration: boolean;
    fileAnalysis: boolean;
    webSearch: boolean;
    repositoryAccess: boolean;
    realTimeProcessing: boolean;
    autonomousExecution: boolean;
}

export interface AgentMetrics {
    successRate: number;
    averageResponseTime: number;
    totalExecutions: number;
    lastUsed: Date;
    reliability: number;
}

export interface AgentStatus {
    available: boolean;
    capabilities: AgentCapabilities;
    metrics: AgentMetrics;
    lastError?: string;
    configurationValid: boolean;
}

/**
 * AgentKit-inspired orchestrator for intelligent agent selection and workflow optimization
 */
export class AgentKitOrchestrator {
    private geminiAgent: GeminiCodeFixer | null = null;
    private julesAgent: JulesImplementer | null = null;
    private agentMetrics: Map<string, AgentMetrics>;
    private categoryLogger: ReturnType<typeof logger.createCategoryLogger>;
    private geminiApiKey: string | null;
    private julesApiKey: string | null;

    constructor(geminiApiKey: string | null, julesApiKey: string | null) {
        this.geminiApiKey = geminiApiKey;
        this.julesApiKey = julesApiKey;
        this.agentMetrics = new Map();
        this.categoryLogger = logger.createCategoryLogger('agentkit-orchestrator');

        // Initialize agents if API keys are available
        if (geminiApiKey) {
            this.geminiAgent = new GeminiCodeFixer(geminiApiKey);
        }
        if (julesApiKey) {
            this.julesAgent = new JulesImplementer(julesApiKey);
        }

        // Initialize metrics
        this.initializeMetrics();
    }

    /**
     * Initialize agent metrics tracking
     */
    private initializeMetrics(): void {
        this.agentMetrics.set('gemini', {
            successRate: 0.95,
            averageResponseTime: 2500, // ms
            totalExecutions: 0,
            lastUsed: new Date(),
            reliability: 0.95
        });

        this.agentMetrics.set('jules', {
            successRate: 0.88,
            averageResponseTime: 15000, // ms (async processing)
            totalExecutions: 0,
            lastUsed: new Date(),
            reliability: 0.88
        });
    }

    /**
     * Get comprehensive status of all agents
     */
    async getAgentStatus(): Promise<Record<string, AgentStatus>> {
        const status: Record<string, AgentStatus> = {};

        // Check Gemini status
        if (this.geminiAgent) {
            try {
                const testResult = await this.geminiAgent.testConnection();
                status.gemini = {
                    available: testResult.success,
                    capabilities: {
                        codeGeneration: true,
                        fileAnalysis: true,
                        webSearch: true,
                        repositoryAccess: false,
                        realTimeProcessing: true,
                        autonomousExecution: false
                    },
                    metrics: this.agentMetrics.get('gemini')!,
                    configurationValid: testResult.success,
                    lastError: testResult.error
                };
            } catch (error) {
                status.gemini = {
                    available: false,
                    capabilities: {
                        codeGeneration: false,
                        fileAnalysis: false,
                        webSearch: false,
                        repositoryAccess: false,
                        realTimeProcessing: false,
                        autonomousExecution: false
                    },
                    metrics: this.agentMetrics.get('gemini')!,
                    lastError: error instanceof Error ? error.message : 'Unknown error',
                    configurationValid: false
                };
            }
        } else {
            status.gemini = {
                available: false,
                capabilities: {
                    codeGeneration: false,
                    fileAnalysis: false,
                    webSearch: false,
                    repositoryAccess: false,
                    realTimeProcessing: false,
                    autonomousExecution: false
                },
                metrics: this.agentMetrics.get('gemini')!,
                lastError: 'Gemini API key not configured',
                configurationValid: false
            };
        }

        // Check Jules status
        if (this.julesAgent) {
            try {
                const testResult = await this.julesAgent.testConnection();
                const hasRepository = await this.julesAgent.isRepositoryDetected();

                status.jules = {
                    available: testResult.success && hasRepository,
                    capabilities: {
                        codeGeneration: true,
                        fileAnalysis: true,
                        webSearch: false,
                        repositoryAccess: true,
                        realTimeProcessing: false,
                        autonomousExecution: true
                    },
                    metrics: this.agentMetrics.get('jules')!,
                    configurationValid: testResult.success,
                    lastError: testResult.error || (!hasRepository ? 'No GitHub repository detected' : undefined)
                };
            } catch (error) {
                status.jules = {
                    available: false,
                    capabilities: {
                        codeGeneration: false,
                        fileAnalysis: false,
                        webSearch: false,
                        repositoryAccess: false,
                        realTimeProcessing: false,
                        autonomousExecution: false
                    },
                    metrics: this.agentMetrics.get('jules')!,
                    lastError: error instanceof Error ? error.message : 'Unknown error',
                    configurationValid: false
                };
            }
        } else {
            status.jules = {
                available: false,
                capabilities: {
                    codeGeneration: false,
                    fileAnalysis: false,
                    webSearch: false,
                    repositoryAccess: false,
                    realTimeProcessing: false,
                    autonomousExecution: false
                },
                metrics: this.agentMetrics.get('jules')!,
                lastError: 'Jules API key not configured',
                configurationValid: false
            };
        }

        return status;
    }

    /**
     * Intelligent agent selection based on context and requirements
     */
    async selectOptimalAgent(
        violations: Violation[],
        context: {
            hasRepository: boolean;
            requiresRealTime: boolean;
            complexityLevel: 'low' | 'medium' | 'high';
            userPreference?: 'gemini' | 'jules';
        }
    ): Promise<{
        primary: 'gemini' | 'jules';
        fallback: 'gemini' | 'jules';
        reasoning: string;
        confidence: number;
    }> {
        const agentStatus = await this.getAgentStatus();
        const geminiMetrics = this.agentMetrics.get('gemini')!;
        const julesMetrics = this.agentMetrics.get('jules')!;

        // Calculate scores for each agent
        let geminiScore = 0;
        let julesScore = 0;

        // Availability scoring
        if (agentStatus.gemini?.available) geminiScore += 30;
        if (agentStatus.jules?.available) julesScore += 30;

        // Capability scoring
        if (context.requiresRealTime) {
            geminiScore += 25; // Gemini is real-time
            julesScore += 5;   // Jules is async
        }

        if (context.hasRepository) {
            julesScore += 20;  // Jules excels with repositories
            geminiScore += 10; // Gemini can work with repos but not optimized
        } else {
            geminiScore += 25; // Gemini works with any files
            julesScore += 0;   // Jules requires repository
        }

        // Complexity scoring
        switch (context.complexityLevel) {
            case 'low':
                geminiScore += 15; // Gemini is faster for simple fixes
                julesScore += 10;
                break;
            case 'medium':
                geminiScore += 12;
                julesScore += 12;
                break;
            case 'high':
                geminiScore += 8;
                julesScore += 18; // Jules better for complex autonomous work
                break;
        }

        // Reliability scoring
        geminiScore += geminiMetrics.reliability * 10;
        julesScore += julesMetrics.reliability * 10;

        // User preference bonus
        if (context.userPreference === 'gemini') geminiScore += 15;
        if (context.userPreference === 'jules') julesScore += 15;

        // Determine primary and fallback
        const primary = geminiScore >= julesScore ? 'gemini' : 'jules';
        const fallback = primary === 'gemini' ? 'jules' : 'gemini';

        const confidence = Math.max(geminiScore, julesScore) / 100;

        let reasoning = '';
        if (primary === 'gemini') {
            reasoning = `Gemini selected: ${context.requiresRealTime ? 'real-time processing needed, ' : ''}${!context.hasRepository ? 'works with local files, ' : ''}high reliability (${Math.round(geminiMetrics.reliability * 100)}%)`;
        } else {
            reasoning = `Jules selected: ${context.hasRepository ? 'repository context available, ' : ''}${context.complexityLevel === 'high' ? 'complex autonomous work, ' : ''}good for comprehensive fixes`;
        }

        this.categoryLogger.info('Agent selection completed', {
            primary,
            fallback,
            geminiScore,
            julesScore,
            confidence,
            reasoning
        });

        return { primary, fallback, reasoning, confidence };
    }

    /**
     * Execute fixes using the optimal agent with fallback
     */
    async executeFixes(
        violations: Violation[],
        analyses: Analysis[],
        options: {
            auto?: boolean;
            userPreference?: 'gemini' | 'jules';
            requiresRealTime?: boolean;
        } = {}
    ): Promise<{
        fixes: Fix[];
        agentUsed: 'gemini' | 'jules';
        executionTime: number;
        success: boolean;
        error?: string;
    }> {
        const startTime = Date.now();

        // Determine context
        const hasRepository = this.julesAgent ? await this.julesAgent.isRepositoryDetected() : false;
        const context = {
            hasRepository,
            requiresRealTime: options.requiresRealTime ?? true,
            complexityLevel: this.assessComplexity(violations),
            userPreference: options.userPreference
        };

        // Select optimal agent
        const selection = await this.selectOptimalAgent(violations, context);

        console.log(chalk.cyan(`🤖 Using ${selection.primary} agent (${Math.round(selection.confidence * 100)}% confidence)`));
        console.log(chalk.dim(`   Reasoning: ${selection.reasoning}`));

        try {
            // Try primary agent
            const result = await this.executeWithAgent(
                selection.primary,
                violations,
                analyses,
                options
            );

            // Update metrics
            this.updateAgentMetrics(selection.primary, true, Date.now() - startTime);

            return {
                ...result,
                agentUsed: selection.primary,
                executionTime: Date.now() - startTime,
                success: true
            };

        } catch (primaryError) {
            this.categoryLogger.warn(`Primary agent ${selection.primary} failed`, { error: primaryError });

            // Update metrics for failure
            this.updateAgentMetrics(selection.primary, false, Date.now() - startTime);

            console.log(chalk.yellow(`⚠️ ${selection.primary} failed, trying ${selection.fallback}...`));

            try {
                // Try fallback agent
                const result = await this.executeWithAgent(
                    selection.fallback,
                    violations,
                    analyses,
                    options
                );

                // Update metrics
                this.updateAgentMetrics(selection.fallback, true, Date.now() - startTime);

                return {
                    ...result,
                    agentUsed: selection.fallback,
                    executionTime: Date.now() - startTime,
                    success: true
                };

            } catch (fallbackError) {
                this.categoryLogger.error('Both agents failed', {
                    primaryError,
                    fallbackError
                });

                // Update metrics for failure
                this.updateAgentMetrics(selection.fallback, false, Date.now() - startTime);

                return {
                    fixes: [],
                    agentUsed: selection.primary,
                    executionTime: Date.now() - startTime,
                    success: false,
                    error: `Both agents failed. Primary (${selection.primary}): ${primaryError instanceof Error ? primaryError.message : 'Unknown error'}. Fallback (${selection.fallback}): ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`
                };
            }
        }
    }

    /**
     * Execute fixes with a specific agent
     */
    private async executeWithAgent(
        agentType: 'gemini' | 'jules',
        violations: Violation[],
        analyses: Analysis[],
        _options: { auto?: boolean } = {}
    ): Promise<{ fixes: Fix[] }> {
        const fixes: Fix[] = [];

        if (agentType === 'gemini' && this.geminiAgent) {
            // Generate fixes one by one for Gemini
            for (let i = 0; i < violations.length; i++) {
                const violation = violations[i];
                const analysis = analyses[i];
                if (violation && analysis) {
                    const fix = await this.geminiAgent.generateFix(violation, analysis);
                    fixes.push(fix);
                }
            }
        } else if (agentType === 'jules' && this.julesAgent) {
            // Generate fixes one by one for Jules
            for (let i = 0; i < violations.length; i++) {
                const violation = violations[i];
                const analysis = analyses[i];
                if (violation && analysis) {
                    const fix = await this.julesAgent.generateFix(violation, analysis);
                    fixes.push(fix);
                }
            }
        } else {
            throw new Error(`Agent ${agentType} is not available or not configured`);
        }

        return { fixes };
    }

    /**
     * Assess complexity level of violations
     */
    private assessComplexity(violations: Violation[]): 'low' | 'medium' | 'high' {
        if (violations.length <= 3) return 'low';
        if (violations.length <= 10) return 'medium';
        return 'high';
    }

    /**
     * Update agent performance metrics
     */
    private updateAgentMetrics(
        agentType: 'gemini' | 'jules',
        success: boolean,
        responseTime: number
    ): void {
        const metrics = this.agentMetrics.get(agentType);
        if (!metrics) return;

        metrics.totalExecutions++;
        metrics.lastUsed = new Date();

        // Update success rate (exponential moving average)
        const alpha = 0.1;
        metrics.successRate = success
            ? metrics.successRate + alpha * (1 - metrics.successRate)
            : metrics.successRate + alpha * (0 - metrics.successRate);

        // Update average response time (exponential moving average)
        metrics.averageResponseTime = metrics.averageResponseTime + alpha * (responseTime - metrics.averageResponseTime);

        // Update reliability (combination of success rate and consistency)
        metrics.reliability = metrics.successRate * 0.8 + (1 - Math.min(responseTime / 10000, 1)) * 0.2;

        this.agentMetrics.set(agentType, metrics);
    }

    /**
     * Get performance analytics for all agents
     */
    getPerformanceAnalytics(): {
        gemini: AgentMetrics & { recommendation: string };
        jules: AgentMetrics & { recommendation: string };
        overall: {
            totalExecutions: number;
            averageSuccessRate: number;
            recommendedPrimary: 'gemini' | 'jules';
        };
    } {
        const geminiMetrics = this.agentMetrics.get('gemini')!;
        const julesMetrics = this.agentMetrics.get('jules')!;

        const geminiRecommendation = this.getAgentRecommendation('gemini', geminiMetrics);
        const julesRecommendation = this.getAgentRecommendation('jules', julesMetrics);

        const totalExecutions = geminiMetrics.totalExecutions + julesMetrics.totalExecutions;
        const averageSuccessRate = (geminiMetrics.successRate + julesMetrics.successRate) / 2;
        const recommendedPrimary = geminiMetrics.reliability >= julesMetrics.reliability ? 'gemini' : 'jules';

        return {
            gemini: { ...geminiMetrics, recommendation: geminiRecommendation },
            jules: { ...julesMetrics, recommendation: julesRecommendation },
            overall: {
                totalExecutions,
                averageSuccessRate,
                recommendedPrimary
            }
        };
    }

    /**
     * Get recommendation for specific agent
     */
    private getAgentRecommendation(agentType: 'gemini' | 'jules', metrics: AgentMetrics): string {
        if (metrics.reliability > 0.9) {
            return `Excellent performance - recommended for ${agentType === 'gemini' ? 'real-time fixes' : 'complex autonomous work'}`;
        } else if (metrics.reliability > 0.8) {
            return `Good performance - suitable for most tasks`;
        } else if (metrics.reliability > 0.6) {
            return `Moderate performance - consider as fallback option`;
        } else {
            return `Poor performance - check configuration and API keys`;
        }
    }

    /**
     * Reset metrics (useful for testing or fresh start)
     */
    resetMetrics(): void {
        this.initializeMetrics();
        this.categoryLogger.info('Agent metrics reset');
    }

    /**
     * Export metrics for external analysis
     */
    exportMetrics(): Record<string, AgentMetrics> {
        return {
            gemini: { ...this.agentMetrics.get('gemini')! },
            jules: { ...this.agentMetrics.get('jules')! }
        };
    }
}