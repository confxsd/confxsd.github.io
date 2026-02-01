/**
 * @fileoverview Scoring algorithms for opportunities and trades
 * Unix philosophy: Do math, nothing else
 */

import config from './config.js';

const { asymmetry_weights, kelly, risk } = config;

/**
 * Calculate asymmetry score for a trade setup
 * @param {Object} trade - Trade setup with risk/reward data
 * @returns {number} - Score 1-10
 */
export function calculateAsymmetry(trade) {
  const {
    maxLoss,
    expectedGain,
    potentialGain,
    probabilityOfProfit,
    catalystClarity = 'unclear'
  } = trade;

  if (!maxLoss || maxLoss <= 0) return 1;

  // Base risk/reward ratio
  const riskRewardRatio = Math.min(10, expectedGain / maxLoss);

  // Upside optionality multiplier
  const upsideMultiple = potentialGain > expectedGain
    ? Math.min(5, potentialGain / expectedGain)
    : 1;

  // Kelly-adjusted expected value
  const kellyEV = (probabilityOfProfit * expectedGain) -
    ((1 - probabilityOfProfit) * maxLoss);
  const normalizedKellyEV = Math.max(0, Math.min(10, kellyEV / maxLoss));

  // Catalyst premium
  const catalystMultiplier = {
    'clear': 1.5,
    'probable': 1.2,
    'unclear': 1.0
  }[catalystClarity] || 1.0;

  // Weighted composite
  const rawScore =
    (riskRewardRatio * asymmetry_weights.risk_reward) +
    (upsideMultiple * asymmetry_weights.upside_multiple) +
    (normalizedKellyEV * asymmetry_weights.kelly_ev) +
    (catalystMultiplier * asymmetry_weights.catalyst * 3);

  return Math.min(10, Math.max(1, Math.round(rawScore * 10) / 10));
}

/**
 * Calculate Kelly fraction for position sizing
 * @param {number} winRate - Probability of winning (0-1)
 * @param {number} winLossRatio - Average win / average loss
 * @returns {number} - Kelly fraction (capped)
 */
export function calculateKelly(winRate, winLossRatio) {
  if (winRate <= 0 || winRate >= 1 || winLossRatio <= 0) return 0;

  const kellyFraction = winRate - ((1 - winRate) / winLossRatio);

  // Cap between min and max
  return Math.max(
    kelly.min_fraction,
    Math.min(kelly.max_fraction, kellyFraction)
  );
}

/**
 * Calculate position size based on risk budget
 * @param {number} portfolioValue - Total portfolio value
 * @param {number} maxLossPerTrade - Max loss on this trade
 * @param {number} stopLossPct - Stop loss percentage (e.g., 0.5 for 50%)
 * @returns {Object} - Position sizing details
 */
export function calculatePositionSize(portfolioValue, maxLossPerTrade, stopLossPct = 0.5) {
  const maxRiskDollars = portfolioValue * (risk.max_loss_per_trade_pct / 100);
  const positionValue = maxRiskDollars / stopLossPct;

  return {
    maxRiskDollars,
    positionValue,
    portfolioPct: (positionValue / portfolioValue) * 100,
    capped: positionValue > portfolioValue * (risk.max_position_pct / 100)
  };
}

/**
 * Score edge based on information advantage
 * @param {Object} factors - Edge factors
 * @returns {number} - Edge score 1-10
 */
export function calculateEdge(factors) {
  const {
    informationLag = 0,      // Days ahead of consensus
    crowdPositioning = 0,    // -100 to +100 (extreme = contrarian opportunity)
    insiderActivity = 0,     // Net insider buying/selling
    unusualFlow = false,     // Unusual options activity
    analystMomentum = 0      // Change in analyst estimates
  } = factors;

  let score = 5; // Baseline

  // Information advantage
  if (informationLag > 0) score += Math.min(2, informationLag * 0.5);

  // Contrarian opportunity (extreme positioning = higher edge)
  if (Math.abs(crowdPositioning) > 70) score += 1.5;
  if (Math.abs(crowdPositioning) > 90) score += 1;

  // Smart money signals
  if (insiderActivity > 0) score += Math.min(1.5, insiderActivity / 100);
  if (unusualFlow) score += 1;

  // Analyst momentum
  if (analystMomentum !== 0) score += Math.min(1, Math.abs(analystMomentum) * 0.5);

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

/**
 * Score timing based on catalyst proximity
 * @param {Object} timing - Timing factors
 * @returns {number} - Timing score 1-10
 */
export function calculateTiming(timing) {
  const {
    daysToEarnings = null,
    daysToEvent = null,
    ivRank = 50,
    trendStrength = 5,
    momentumScore = 5
  } = timing;

  let score = 5;

  // Catalyst proximity bonus
  if (daysToEarnings !== null && daysToEarnings <= 30) {
    score += Math.min(2, (30 - daysToEarnings) / 15);
  }
  if (daysToEvent !== null && daysToEvent <= 14) {
    score += Math.min(2, (14 - daysToEvent) / 7);
  }

  // Volatility opportunity (low IV = cheap options)
  if (ivRank < 30) score += 1.5;
  else if (ivRank > 80) score += 1; // High IV can mean sell premium opportunity

  // Trend alignment
  if (trendStrength > 7) score += 1;

  // Momentum confirmation
  if (momentumScore > 7) score += 1;

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

/**
 * Composite opportunity score
 * @param {Object} opportunity - Opportunity with all factors
 * @returns {Object} - All scores and composite
 */
export function scoreOpportunity(opportunity) {
  const edge = calculateEdge(opportunity.edgeFactors || {});
  const timing = calculateTiming(opportunity.timingFactors || {});
  const asymmetry = opportunity.asymmetryData
    ? calculateAsymmetry(opportunity.asymmetryData)
    : 5;

  // Weighted composite (edge most important)
  const composite = (edge * 0.4) + (timing * 0.3) + (asymmetry * 0.3);

  return {
    edge,
    timing,
    asymmetry,
    composite: Math.round(composite * 10) / 10,
    meetsThreshold: edge >= config.thresholds.min_edge_score &&
      asymmetry >= config.thresholds.min_asymmetry_score
  };
}

/**
 * Risk-adjusted return score
 * @param {number} expectedReturn - Expected return percentage
 * @param {number} volatility - Expected volatility
 * @param {number} maxDrawdown - Maximum expected drawdown
 * @returns {number} - Risk-adjusted score
 */
export function riskAdjustedScore(expectedReturn, volatility, maxDrawdown) {
  if (volatility <= 0 || maxDrawdown >= expectedReturn) return 0;

  const sharpe = expectedReturn / volatility;
  const calmar = expectedReturn / maxDrawdown;

  return Math.min(10, (sharpe * 2 + calmar) / 2);
}

export default {
  calculateAsymmetry,
  calculateKelly,
  calculatePositionSize,
  calculateEdge,
  calculateTiming,
  scoreOpportunity,
  riskAdjustedScore
};
