/**
 * @fileoverview Pipeline Orchestrator
 * Unix philosophy: Pipe agents together
 */

import config from './config.js';
import macroAgent from './agents/macro.js';
import opportunityAgent from './agents/opportunity.js';
import analystAgent from './agents/analyst.js';
import traderAgent from './agents/trader.js';

/**
 * Pipeline state
 */
let state = {
  macroReport: null,
  opportunities: null,
  enrichedOpportunities: null,
  trades: null,
  lastRun: null
};

/**
 * Run the full pipeline
 * @param {Object} options - Pipeline options
 * @returns {Promise<Object>} - Final trade manifest
 */
export async function runPipeline(options = {}) {
  const {
    universe = [],
    watchlist = [],
    portfolioValue = 100000,
    riskBudget = 0.02,
    skipStages = []
  } = options;

  const results = { stages: {}, errors: [] };
  const start = Date.now();

  try {
    // Stage 1: Macro Thesis
    if (!skipStages.includes('macro')) {
      console.log('[Pipeline] Stage 1: Macro thesis...');
      state.macroReport = await macroAgent.run({
        context: options.macroContext
      });
      results.stages.macro = {
        regime: state.macroReport.regime,
        themes: state.macroReport.themes?.length || 0,
        risks: state.macroReport.risk_signals?.length || 0
      };
    }

    // Stage 2: Opportunity Hunting (thesis-driven)
    if (!skipStages.includes('opportunity')) {
      console.log('[Pipeline] Stage 2: Hunting opportunities...');
      console.log(`[Pipeline] Scanning ${state.macroReport?.targetTickers?.length || 0} theme-driven tickers`);
      state.opportunities = await opportunityAgent.run({
        macroReport: state.macroReport,
        universe,      // Additional tickers to scan
        watchlist      // User watchlist additions
      });
      results.stages.opportunity = {
        screened: state.opportunities.screened_count,
        passed: state.opportunities.passed_count,
        fromThemes: state.macroReport?.targetTickers?.length || 0
      };
    }

    // Stage 3: Deep Analysis
    if (!skipStages.includes('analyst') && state.opportunities?.opportunities?.length) {
      console.log('[Pipeline] Stage 3: Deep analysis...');
      const analysisResult = await analystAgent.run({
        opportunities: state.opportunities.opportunities.filter(o => o.priority === 'high')
      });
      state.enrichedOpportunities = analysisResult.enriched;
      results.stages.analyst = {
        analyzed: analysisResult.analyzed_count,
        enriched: analysisResult.enriched?.length || 0
      };
    }

    // Stage 4: Trade Construction
    if (!skipStages.includes('trader') && state.enrichedOpportunities?.length) {
      console.log('[Pipeline] Stage 4: Constructing trades...');
      state.trades = await traderAgent.run({
        enrichedOpportunities: state.enrichedOpportunities,
        portfolioValue,
        riskBudget
      });
      results.stages.trader = {
        trades: state.trades.trades?.length || 0
      };
    }

    state.lastRun = new Date();
    results.duration = Date.now() - start;
    results.success = true;

  } catch (error) {
    results.errors.push(error.message);
    results.success = false;
    console.error('[Pipeline] Error:', error);
  }

  return {
    ...results,
    manifest: state.trades,
    state: getState()
  };
}

/**
 * Run single stage
 */
export async function runStage(stage, input = {}) {
  switch (stage) {
    case 'macro':
      state.macroReport = await macroAgent.run(input);
      return state.macroReport;

    case 'opportunity':
      state.opportunities = await opportunityAgent.run({
        macroReport: state.macroReport,
        ...input
      });
      return state.opportunities;

    case 'analyst':
      const opportunities = input.opportunities || state.opportunities?.opportunities;
      if (!opportunities?.length) throw new Error('No opportunities to analyze');
      const analysis = await analystAgent.run({ opportunities, ...input });
      state.enrichedOpportunities = analysis.enriched;
      return analysis;

    case 'trader':
      const enriched = input.enrichedOpportunities || state.enrichedOpportunities;
      if (!enriched?.length) throw new Error('No enriched opportunities');
      state.trades = await traderAgent.run({ enrichedOpportunities: enriched, ...input });
      return state.trades;

    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}

/**
 * Get current state
 */
export function getState() {
  return { ...state };
}

/**
 * Get macro report
 */
export function getMacro() {
  return state.macroReport;
}

/**
 * Get opportunities
 */
export function getOpportunities() {
  return state.opportunities;
}

/**
 * Get trades
 */
export function getTrades() {
  return state.trades;
}

/**
 * Reset state
 */
export function reset() {
  state = {
    macroReport: null,
    opportunities: null,
    enrichedOpportunities: null,
    trades: null,
    lastRun: null
  };
}

/**
 * Quick scan - lighter weight opportunity scan
 * @param {string[]} tickers - Tickers to scan
 * @returns {Promise<Object>} - Scan results
 */
export async function quickScan(tickers) {
  const macro = state.macroReport || await runStage('macro');
  return runStage('opportunity', {
    macroReport: macro,
    watchlist: tickers
  });
}

/**
 * Full analysis on single ticker
 * @param {string} ticker - Ticker to analyze
 * @returns {Promise<Object>} - Full analysis with trade recommendation
 */
export async function analyzeTicker(ticker, options = {}) {
  // Create synthetic opportunity
  const opportunity = {
    id: `opp-${ticker}-${Date.now()}`,
    ticker,
    name: ticker,
    thesis_type: 'manual',
    thesis_summary: options.thesis || `Manual analysis of ${ticker}`,
    catalysts: options.catalysts || [],
    risks: [],
    requires_deep_dive: true,
    priority: 'high',
    edgeFactors: {},
    timingFactors: {}
  };

  // Run through analyst
  const analysis = await analystAgent.run({
    opportunities: [opportunity]
  });

  if (!analysis.enriched?.length) {
    return { ticker, error: 'Analysis failed' };
  }

  // Construct trade
  const tradeResult = await traderAgent.run({
    enrichedOpportunities: analysis.enriched,
    portfolioValue: options.portfolioValue || 100000,
    riskBudget: options.riskBudget || 0.02
  });

  return {
    ticker,
    analysis: analysis.enriched[0],
    trade: tradeResult.trades?.[0] || null
  };
}

/**
 * Get agent metrics
 */
export function getMetrics() {
  return {
    macro: macroAgent.getMetrics(),
    opportunity: opportunityAgent.getMetrics(),
    analyst: analystAgent.getMetrics(),
    trader: traderAgent.getMetrics()
  };
}

export default {
  runPipeline,
  runStage,
  getState,
  getMacro,
  getOpportunities,
  getTrades,
  reset,
  quickScan,
  analyzeTicker,
  getMetrics
};
