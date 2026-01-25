// Combined Analysis & Trade Ideas Prompt
// Single API call for comprehensive analysis

import { buildVRPContext } from './builders/vrp.js';
import { buildGEXContext } from './builders/gex.js';
import { buildMacroContext } from './builders/macro.js';

/**
 * System role for combined analysis
 */
export const COMBINED_SYSTEM_ROLE =
  'You are a professional options trader at a prop firm (SIG/Citadel-level). ' +
  'Your edge: Understanding DEALER POSITIONING via GEX and volatility regimes.';

/**
 * Build combined prompt for analysis and trade ideas
 * @param {Object} data - Market data object
 * @param {string} data.ticker - Stock ticker symbol
 * @param {number} data.price - Current price
 * @param {number} data.change - Price change percentage
 * @param {string} data.volume - Volume string
 * @param {number} data.rvol - Relative volume
 * @param {number} data.rsi - RSI value
 * @param {number} data.macdH - MACD histogram
 * @param {number} data.adx - ADX value
 * @param {number} data.pdi - +DI value
 * @param {number} data.mdi - -DI value
 * @param {number} data.bbPct - Bollinger Band %
 * @param {number} data.mfi - Money Flow Index
 * @param {number} data.atr - ATR value
 * @param {number} data.vol - Historical volatility
 * @param {number} data.sma20 - 20-day SMA
 * @param {number} data.sma50 - 50-day SMA
 * @param {number} data.buyPct - Buy volume percentage
 * @param {number} data.adlTrend - A/D line trend
 * @param {number} data.callVol - Call volume
 * @param {number} data.putVol - Put volume
 * @param {number} data.pcRatio - Put/Call ratio
 * @param {string} data.topCalls - Top call strikes
 * @param {string} data.topPuts - Top put strikes
 * @param {number} data.maxPain - Weekly max pain
 * @param {number} data.maxPainMonthly - Monthly max pain
 * @returns {string} Complete prompt for Claude API
 */
export function buildCombinedPrompt(data) {
  const macroContext = buildMacroContext();
  const vrpContext = buildVRPContext(data);
  const gexContext = buildGEXContext(data);

  return `${COMBINED_SYSTEM_ROLE}

${macroContext}

---

MARKET DATA FOR ${data.ticker}:
- Price: $${data.price} (${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%) | Vol: ${data.volume} (${data.rvol.toFixed(1)}x avg)
- RSI: ${data.rsi.toFixed(1)} | MACD: ${data.macdH.toFixed(2)} | ADX: ${data.adx.toFixed(1)} (+DI:${data.pdi.toFixed(1)}/-DI:${data.mdi.toFixed(1)})
- BB%: ${data.bbPct}% | MFI: ${data.mfi.toFixed(1)} | ATR: $${data.atr.toFixed(2)} | HV: ${data.vol.toFixed(0)}%
- SMA20: $${data.sma20.toFixed(2)} | SMA50: $${data.sma50.toFixed(2)}
- Flow: ${data.buyPct}% buy (${data.buyPct < 45 ? 'DISTRIBUTION' : data.buyPct > 55 ? 'ACCUMULATION' : 'NEUTRAL'}) | A/D: ${data.adlTrend > 0 ? '+' : ''}${data.adlTrend.toFixed(1)}%

OPTIONS FLOW:
- Call Vol: ${data.callVol} | Put Vol: ${data.putVol} | P/C: ${data.pcRatio.toFixed(2)}
- Active Strikes - Calls: ${data.topCalls} | Puts: ${data.topPuts}
- Max Pain: $${data.maxPain} ${data.maxPainMonthly ? `| Monthly MP: $${data.maxPainMonthly}` : ''}

${vrpContext}
${gexContext}

${OUTPUT_FORMAT}`;
}

/**
 * Output format specification
 */
const OUTPUT_FORMAT = `Provide output in EXACTLY this format with === separators:

**DEALER REGIME:** [+GEX STABILIZING | -GEX AMPLIFYING | NEUTRAL] - [1 sentence on expected behavior]

**VOL ASSESSMENT:** [HIGH VRP SELL | LOW VRP BUY | NEUTRAL] - [IV vs RV edge]

**FRAGILITY SCORE:** [1-10, 10=extremely fragile short candidate]

**CLASSIFICATION:** [FRAGILE GROWTH | STABLE GROWTH | DEFENSIVE | MAG7-TIER]

**THESIS:** [2-3 sentences integrating GEX regime + VRP + technicals]

**KEY LEVELS:**
- Call Wall/Resistance: $[price] - [significance]
- Put Wall/Support: $[price] - [significance]
- Zero Gamma: $[price] - [above/below spot implications]

**RISK FACTORS:** [What could squeeze/invalidate the setup?]

===TRADES===

**TRADE 1:** [SHORT/LONG] [Stock/Puts/Calls/Spread]
- Entry: $[price] | Stop: $[price] | Target: $[price]
- Structure: [specific strikes/expiries]
- R/R: [ratio] | Vol Edge: [why this structure given VRP/GEX]

**TRADE 2:** [Alternative - different vol exposure or direction]

IMPORTANT:
- In +GEX regime: Prefer selling premium, credit spreads, mean-reversion
- In -GEX regime: Prefer buying options, debit spreads, momentum plays
- Match trade structure to vol regime, not just direction`;

// Legacy aliases for backward compatibility
export const buildAnalysisPrompt = buildCombinedPrompt;
export const buildTradePrompt = buildCombinedPrompt;
