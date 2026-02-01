/**
 * @fileoverview Hunter - Asymmetric Trade Hunter System
 * Unix philosophy: Small modules composed into a pipeline
 *
 * THESIS-DRIVEN FLOW:
 *   1. Macro agent reads world → identifies themes ("ai_infrastructure", "rates_sensitive")
 *   2. Themes auto-expand to tickers via config.universe.theme_tickers
 *   3. Opportunity agent scans those tickers
 *   4. Best opportunities → Deep analysis → Trade construction
 *
 * Usage:
 *   import hunter from './hunter/index.js';
 *
 *   // Full pipeline - NO watchlist needed, thesis drives everything
 *   const result = await hunter.run({ portfolioValue: 100000 });
 *
 *   // With optional additional tickers
 *   const result = await hunter.run({ watchlist: ['AAPL'], portfolioValue: 100000 });
 *
 *   // Quick scan specific tickers (bypasses macro)
 *   const opps = await hunter.scan(['TSLA', 'META']);
 *
 *   // Single ticker deep analysis
 *   const analysis = await hunter.analyze('NVDA', { thesis: 'AI datacenter play' });
 */

import config from './config.js';
import * as pipeline from './pipeline.js';
import * as scoring from './scoring.js';
import { data as providers } from './providers/index.js';

/**
 * Hunter API
 */
export const hunter = {
  /**
   * Run full pipeline
   * @param {Object} options - Pipeline options
   * @returns {Promise<Object>} - Trade manifest
   */
  async run(options = {}) {
    return pipeline.runPipeline(options);
  },

  /**
   * Quick scan tickers for opportunities
   * @param {string[]} tickers - Tickers to scan
   * @returns {Promise<Object>} - Opportunities
   */
  async scan(tickers) {
    return pipeline.quickScan(tickers);
  },

  /**
   * Full analysis on single ticker
   * @param {string} ticker - Ticker symbol
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} - Analysis + trade
   */
  async analyze(ticker, options = {}) {
    return pipeline.analyzeTicker(ticker, options);
  },

  /**
   * Get current macro thesis
   * @returns {Object|null} - Macro report
   */
  getMacro() {
    return pipeline.getMacro();
  },

  /**
   * Get current opportunities
   * @returns {Object|null} - Opportunities
   */
  getOpportunities() {
    return pipeline.getOpportunities();
  },

  /**
   * Get current trade recommendations
   * @returns {Object|null} - Trades
   */
  getTrades() {
    return pipeline.getTrades();
  },

  /**
   * Get full state
   * @returns {Object} - Current state
   */
  getState() {
    return pipeline.getState();
  },

  /**
   * Reset all state
   */
  reset() {
    pipeline.reset();
  },

  /**
   * Get agent metrics
   * @returns {Object} - Metrics per agent
   */
  getMetrics() {
    return pipeline.getMetrics();
  },

  /**
   * Run specific stage
   * @param {string} stage - Stage name
   * @param {Object} input - Stage input
   * @returns {Promise<Object>} - Stage output
   */
  async runStage(stage, input = {}) {
    return pipeline.runStage(stage, input);
  },

  /**
   * Score an opportunity
   * @param {Object} opportunity - Opportunity to score
   * @returns {Object} - Scores
   */
  score(opportunity) {
    return scoring.scoreOpportunity(opportunity);
  },

  /**
   * Calculate position size
   * @param {number} portfolioValue - Total portfolio
   * @param {number} maxLoss - Max loss on trade
   * @param {number} stopPct - Stop loss percentage
   * @returns {Object} - Sizing details
   */
  size(portfolioValue, maxLoss, stopPct = 0.5) {
    return scoring.calculatePositionSize(portfolioValue, maxLoss, stopPct);
  },

  // Config access
  config,

  // Providers access
  providers
};

// Also export individual modules for advanced usage
export { default as config } from './config.js';
export * as pipeline from './pipeline.js';
export * as scoring from './scoring.js';
export * as providers from './providers/index.js';
export * as agents from './agents/index.js';
export * from './types.js';

export default hunter;
