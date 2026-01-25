// Executive Summary Prompt
// Comprehensive yet concise summary for decision-making

import { buildVRPContext } from './builders/vrp.js';
import { buildGEXContext } from './builders/gex.js';
import { buildMacroContext } from './builders/macro.js';

/**
 * System role for summary generation
 */
export const SUMMARY_SYSTEM_ROLE =
  'You are a senior portfolio manager creating a concise executive summary';

/**
 * Build comprehensive summary prompt
 * @param {Object} data - Market data object
 * @param {string} data.ticker - Stock ticker symbol
 * @param {number} data.price - Current price
 * @param {number} data.change - Price change percentage
 * @param {number} data.sma20 - 20-day SMA
 * @param {number} data.sma50 - 50-day SMA
 * @param {string} data.range52w - 52-week range string
 * @param {number} data.rsi - RSI value
 * @param {number} data.macdH - MACD histogram
 * @param {number} data.adx - ADX value
 * @param {number} data.pdi - +DI value
 * @param {number} data.mdi - -DI value
 * @param {number} data.bbPct - Bollinger Band %
 * @param {number} data.mfi - Money Flow Index
 * @param {string} data.volume - Volume string
 * @param {number} data.rvol - Relative volume
 * @param {number} data.buyPct - Buy volume percentage
 * @param {number} data.adlTrend - A/D line trend
 * @param {number} data.callVol - Call volume
 * @param {number} data.putVol - Put volume
 * @param {number} data.pcRatio - Put/Call ratio
 * @param {number} data.maxPain - Weekly max pain
 * @param {number} data.maxPainMonthly - Monthly max pain
 * @param {string} data.topCalls - Top call strikes
 * @param {string} data.topPuts - Top put strikes
 * @returns {string} Complete prompt for Claude API
 */
export function buildSummaryPrompt(data) {
  const macroContext = buildMacroContext();
  const vrpContext = buildVRPContext(data);
  const gexContext = buildGEXContext(data);

  return `${SUMMARY_SYSTEM_ROLE} for ${data.ticker}.

${macroContext}

---

COMPLETE MARKET DATA FOR ${data.ticker}:

PRICE ACTION:
- Current: $${data.price} (${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%)
- SMA20: $${data.sma20?.toFixed(2) || '--'} | SMA50: $${data.sma50?.toFixed(2) || '--'}
- 52W Range: ${data.range52w || '--'}

MOMENTUM & TREND:
- RSI: ${data.rsi?.toFixed(1) || '--'} | MACD Histogram: ${data.macdH?.toFixed(2) || '--'}
- ADX: ${data.adx?.toFixed(1) || '--'} (+DI: ${data.pdi?.toFixed(1) || '--'} / -DI: ${data.mdi?.toFixed(1) || '--'})
- BB%: ${data.bbPct || '--'}% | MFI: ${data.mfi?.toFixed(1) || '--'}

VOLUME:
- Today: ${data.volume} (${data.rvol?.toFixed(1) || '--'}x avg)
- Buy Flow: ${data.buyPct || '--'}% | A/D Trend: ${data.adlTrend?.toFixed(1) || '--'}%

${vrpContext}

OPTIONS FLOW:
- Call Vol: ${data.callVol} | Put Vol: ${data.putVol} | P/C: ${data.pcRatio?.toFixed(2) || '--'}
- Max Pain: Weekly $${data.maxPain || '--'} | Monthly $${data.maxPainMonthly || '--'}
- Top Calls: ${data.topCalls} | Top Puts: ${data.topPuts}

${gexContext}

---

${OUTPUT_FORMAT}`;
}

/**
 * Output format specification
 */
const OUTPUT_FORMAT = `Create a comprehensive yet concise summary in this EXACT format:

**VERDICT:** [STRONG BUY | BUY | HOLD | SELL | STRONG SELL] - [one sentence thesis]

**SCORE:** [0-100] - [Brief justification]

**KEY INSIGHT:**
[2-3 sentences on the most important thing to know about this stock right now. Focus on what makes this setup unique.]

**TECHNICAL SETUP:**
- Trend: [BULLISH | BEARISH | NEUTRAL] - [why]
- Momentum: [STRONG | WEAKENING | BUILDING] - [key signal]
- Key Support: $[price] | Resistance: $[price]

**VOLATILITY EDGE:**
- Vol Regime: [HIGH | NORMAL | LOW] with [VRP assessment]
- Option Play: [SELL PREMIUM | BUY PREMIUM | NEUTRAL] - [specific structure suggestion]

**DEALER POSITIONING:**
[One sentence on GEX regime and what it means for expected price action]

**RISK/REWARD:**
- Risk: [Primary risk to this position]
- Catalyst: [Upcoming catalyst or driver]
- Timeframe: [SWING 1-5d | POSITION 1-4w | LONG-TERM]

**TRADE IDEA:**
[One specific, actionable trade with entry, stop, and target. Include option structure if applicable.]

Keep it punchy and actionable. No fluff.`;
