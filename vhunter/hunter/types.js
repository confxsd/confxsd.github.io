/**
 * @fileoverview Type definitions for the Hunter system
 * Unix philosophy: Do one thing well - define types
 */

/**
 * @typedef {Object} MacroTheme
 * @property {string} name
 * @property {string} description
 * @property {number} conviction - 1-10
 * @property {'days'|'weeks'|'months'} timeframe
 * @property {string[]} affected_sectors
 * @property {string[]} catalysts
 */

/**
 * @typedef {Object} RiskSignal
 * @property {'geopolitical'|'financial'|'liquidity'|'sentiment'} type
 * @property {'low'|'medium'|'high'|'critical'} severity
 * @property {string} description
 */

/**
 * @typedef {Object} MacroReport
 * @property {Date} timestamp
 * @property {'risk-on'|'risk-off'|'transition'} regime
 * @property {MacroTheme[]} themes
 * @property {RiskSignal[]} risk_signals
 * @property {Object} key_levels
 */

/**
 * @typedef {Object} Opportunity
 * @property {string} id
 * @property {string} ticker
 * @property {string} name
 * @property {'industry'|'financial'|'trend'|'retail'|'fineng'} thesis_type
 * @property {string} thesis_summary
 * @property {number} edge_score
 * @property {number} timing_score
 * @property {number} asymmetry_score
 * @property {string[]} catalysts
 * @property {string[]} risks
 * @property {string[]} related_tickers
 * @property {boolean} requires_deep_dive
 * @property {'high'|'medium'|'low'} priority
 */

/**
 * @typedef {Object} EquityAnalysis
 * @property {string} ticker
 * @property {Object} valuation
 * @property {Object} financials
 * @property {Object[]} upcoming_events
 * @property {string} sentiment
 */

/**
 * @typedef {Object} OptionsAnalysis
 * @property {string} ticker
 * @property {number} iv_rank
 * @property {number} iv_percentile
 * @property {number} hv_20
 * @property {'contango'|'backwardation'|'flat'} term_structure
 * @property {Object[]} unusual_activity
 * @property {Object[]} recommended_structures
 */

/**
 * @typedef {Object} TradeLeg
 * @property {'buy'|'sell'} action
 * @property {number} strike
 * @property {string} expiry
 * @property {'call'|'put'|'stock'} type
 * @property {number} [quantity]
 */

/**
 * @typedef {Object} TradeRecommendation
 * @property {string} id
 * @property {Date} timestamp
 * @property {string} ticker
 * @property {string} thesis
 * @property {string} thesis_type
 * @property {Object} instrument
 * @property {Object} asymmetry
 * @property {Object} entry
 * @property {Object} stop_loss
 * @property {Object} take_profit
 * @property {Object} catalyst
 * @property {Object} sizing
 * @property {Object} invalidation
 * @property {'low'|'medium'|'high'|'max'} conviction
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} AgentContext
 * @property {MacroReport} [macroState]
 * @property {Object} providers
 * @property {Object} config
 */

export const ThesisTypes = {
  INDUSTRY: 'industry',
  FINANCIAL: 'financial',
  TREND: 'trend',
  RETAIL: 'retail',
  FINENG: 'fineng'
};

export const Regimes = {
  RISK_ON: 'risk-on',
  RISK_OFF: 'risk-off',
  TRANSITION: 'transition'
};

export const Priorities = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};
