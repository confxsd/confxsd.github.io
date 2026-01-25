// Portfolio Risk Analysis Prompt

import { buildMacroContext } from './builders/macro.js';

/**
 * System role for portfolio analysis
 */
export const PORTFOLIO_SYSTEM_ROLE =
  'You are a portfolio risk manager analyzing this trading portfolio.';

/**
 * Build portfolio analysis prompt
 * @param {Object} portfolioData - Portfolio data object
 * @param {Array} portfolioData.positions - Array of position objects
 * @param {Object} portfolioData.marketData - Market data by ticker
 * @param {number} portfolioData.totalUnrealized - Total unrealized P&L
 * @param {number} portfolioData.totalValue - Total portfolio value
 * @returns {string} Complete prompt for Claude API
 */
export function buildPortfolioPrompt(portfolioData) {
  const { positions, marketData, totalUnrealized, totalValue } = portfolioData;

  const positionSummary = buildPositionSummary(positions, marketData);
  const metrics = calculatePortfolioMetrics(positions);
  const macroContext = buildMacroContext();

  return `${PORTFOLIO_SYSTEM_ROLE}

${macroContext}

---

PORTFOLIO OVERVIEW:
- Total Positions: ${positions.length} (${metrics.shortBias} bearish, ${metrics.longBias} bullish)
- Composition: ${metrics.optionsCount} options, ${metrics.stocksCount} stock positions
- Total Unrealized P&L: ${totalUnrealized >= 0 ? '+' : ''}$${totalUnrealized.toFixed(0)}
- Portfolio Value: ~$${totalValue.toFixed(0)}

POSITIONS:
${positionSummary}

${metrics.expiringPositions ? `OPTIONS EXPIRING SOON: ${metrics.expiringPositions}` : ''}

${metrics.winners.length > 0 ? `TOP WINNERS: ${metrics.winners.slice(0, 3).map(p => `${p.ticker} +$${p.unrealizedPnL.toFixed(0)}`).join(', ')}` : ''}
${metrics.losers.length > 0 ? `BIGGEST LOSERS: ${metrics.losers.slice(0, 3).map(p => `${p.ticker} $${p.unrealizedPnL.toFixed(0)}`).join(', ')}` : ''}

${OUTPUT_FORMAT}`;
}

/**
 * Build position summary string
 */
function buildPositionSummary(positions, marketData) {
  return positions.map(p => {
    const pnlPct = p.costBasis > 0 ? ((p.unrealizedPnL / p.costBasis) * 100).toFixed(1) : 0;
    const mktData = marketData[p.underlyingTicker] || {};
    const daysToExpiry = p.daysToExpiry !== null ? `${p.daysToExpiry}d to exp` : '';

    return `- ${p.ticker} ${p.type.toUpperCase()} ${p.quantity}x @ $${p.entry_price.toFixed(2)}
  Current: $${(p.displayPrice || 0).toFixed(2)} | P&L: ${p.unrealizedPnL >= 0 ? '+' : ''}$${p.unrealizedPnL.toFixed(0)} (${pnlPct}%)
  ${p.optionInfo ? `Strike: $${p.optionInfo.strike} | ${daysToExpiry}` : ''}
  ${mktData.rsi ? `RSI: ${mktData.rsi.toFixed(0)} | MACD: ${mktData.macdH >= 0 ? '+' : ''}${mktData.macdH?.toFixed(2) || '--'}` : 'Technical data loading...'}`;
  }).join('\n');
}

/**
 * Calculate portfolio metrics
 */
function calculatePortfolioMetrics(positions) {
  const shortBias = positions.filter(p => p.type === 'short' || p.type === 'put').length;
  const longBias = positions.filter(p => p.type === 'long' || p.type === 'call').length;
  const optionsCount = positions.filter(p => p.type === 'put' || p.type === 'call').length;
  const stocksCount = positions.filter(p => p.type === 'long' || p.type === 'short').length;

  const expiringPositions = positions
    .filter(p => p.daysToExpiry !== null && p.daysToExpiry <= 14)
    .map(p => `${p.ticker} (${p.daysToExpiry}d)`)
    .join(', ');

  const winners = positions.filter(p => p.unrealizedPnL > 0).sort((a, b) => b.unrealizedPnL - a.unrealizedPnL);
  const losers = positions.filter(p => p.unrealizedPnL < 0).sort((a, b) => a.unrealizedPnL - b.unrealizedPnL);

  return { shortBias, longBias, optionsCount, stocksCount, expiringPositions, winners, losers };
}

/**
 * Output format specification
 */
const OUTPUT_FORMAT = `Analyze this portfolio and provide output in EXACTLY this format:

**RISK_SCORE:** [1-10 number only, where 10=extreme risk, 1=very safe]

**RISK_LEVEL:** [LOW|MEDIUM|HIGH]

**THESIS_STATUS:** [ALIGNED|PARTIAL|DIVERGENT]

**THESIS_DETAIL:** [One sentence on how well positions align with current macro thesis]

**EXPIRY_STATUS:** [SAFE|WARNING|URGENT]

**EXPIRY_DETAIL:** [One sentence about time decay risk or "No imminent expirations"]

**PORTFOLIO_ANALYSIS:**
[2-3 sentences on overall portfolio health, concentration risk, and macro alignment]

**POSITION_SIGNALS:**
[For each position, one line with format: TICKER: [TAKE_PROFIT|HOLD|CUT_LOSS|ADD] - brief reason]

**RECOMMENDATIONS:**
[3-4 specific, actionable recommendations prioritized by urgency. Include specific prices/levels where applicable]`;
