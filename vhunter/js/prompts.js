// AI Prompts Module
// Dynamic macro thesis from feed system

import { getCurrentThesis } from './feed.js';

// Build macro context from thesis
function buildMacroContext() {
  const thesis = getCurrentThesis();
  if (!thesis || !thesis.thesis_data) {
    // Fallback to default thesis
    return `MACRO CONTEXT: neutral | neutral
No thesis established. Using default: Monitor for opportunities.
Themes: awaiting signal
OW: -- | UW: --
Catalysts: --
Risks: --`;
  }

  const t = thesis.thesis_data;
  return `MACRO CONTEXT: ${t.regime} | ${t.bias}
${t.narrative}
Themes: ${(t.themes || []).join(', ')}
OW: ${(t.sectors?.ow || []).join(', ')} | UW: ${(t.sectors?.uw || []).join(', ')}
Catalysts: ${(t.catalysts || []).join(', ')}
Risks: ${(t.risks || []).join(', ')}`;
}

// Combined prompt for both analysis and trade ideas (single API call)
export function buildCombinedPrompt(data) {
  const macroContext = buildMacroContext();

  return `You are an institutional macro strategist and trader.

${macroContext}

---

MARKET DATA FOR ${data.ticker}:
- Price: $${data.price} (${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%) | Vol: ${data.volume} (${data.rvol.toFixed(1)}x avg)
- RSI: ${data.rsi.toFixed(1)} | MACD: ${data.macdH.toFixed(2)} | ADX: ${data.adx.toFixed(1)} (+DI:${data.pdi.toFixed(1)}/-DI:${data.mdi.toFixed(1)})
- BB%: ${data.bbPct}% | MFI: ${data.mfi.toFixed(1)} | ATR: $${data.atr.toFixed(2)} | HV: ${data.vol.toFixed(0)}%
- SMA20: $${data.sma20.toFixed(2)} | SMA50: $${data.sma50.toFixed(2)}
- Flow: ${data.buyPct}% buy (${data.buyPct < 45 ? 'DISTRIBUTION' : data.buyPct > 55 ? 'ACCUMULATION' : 'NEUTRAL'}) | A/D: ${data.adlTrend > 0 ? '+' : ''}${data.adlTrend.toFixed(1)}%

OPTIONS:
- Call Vol: ${data.callVol} | Put Vol: ${data.putVol} | P/C: ${data.pcRatio.toFixed(2)}
- Calls: ${data.topCalls} | Puts: ${data.topPuts} | Max Pain: $${data.maxPain}

Provide output in EXACTLY this format with === separators:

**FRAGILITY SCORE:** [1-10, 10=extremely fragile short candidate, 1=fortress]

**CLASSIFICATION:** [FRAGILE GROWTH | STABLE GROWTH | DEFENSIVE | MAG7-TIER]

**THESIS:** [2-3 sentences: Is this stock vulnerable to rotation? Why?]

**WEAKNESS SIGNALS:**
- [Technical weakness 1 - or "None" if strong]
- [Technical weakness 2]
- [Distribution/smart money signs]

**RISK FOR SHORTS:** [What could squeeze shorts?]

===TRADES===

**TRADE 1:** [SHORT/LONG] [Stock/Puts/Calls/Spread]
- Entry: $[price] | Stop: $[price] | Target: $[price]
- R/R: [ratio] | Thesis: [brief reason]

**TRADE 2:** [Alternative setup with same format]

If TOO STRONG to short: "NO SHORT EDGE - FORTRESS STOCK" with wait/hedge suggestion.
Be specific with strike prices and expirations for options.`;
}

// Legacy functions for backward compatibility (deprecated)
export function buildAnalysisPrompt(data) {
  return buildCombinedPrompt(data);
}

export function buildTradePrompt(data) {
  return buildCombinedPrompt(data);
}

export function buildPortfolioPrompt(portfolioData) {
  const { positions, marketData, totalUnrealized, totalValue } = portfolioData;

  // Build position summary
  const positionSummary = positions.map(p => {
    const pnlPct = p.costBasis > 0 ? ((p.unrealizedPnL / p.costBasis) * 100).toFixed(1) : 0;
    const mktData = marketData[p.underlyingTicker] || {};
    const daysToExpiry = p.daysToExpiry !== null ? `${p.daysToExpiry}d to exp` : '';

    return `- ${p.ticker} ${p.type.toUpperCase()} ${p.quantity}x @ $${p.entry_price.toFixed(2)}
  Current: $${(p.displayPrice || 0).toFixed(2)} | P&L: ${p.unrealizedPnL >= 0 ? '+' : ''}$${p.unrealizedPnL.toFixed(0)} (${pnlPct}%)
  ${p.optionInfo ? `Strike: $${p.optionInfo.strike} | ${daysToExpiry}` : ''}
  ${mktData.rsi ? `RSI: ${mktData.rsi.toFixed(0)} | MACD: ${mktData.macdH >= 0 ? '+' : ''}${mktData.macdH?.toFixed(2) || '--'}` : 'Technical data loading...'}`;
  }).join('\n');

  // Calculate portfolio metrics
  const shortBias = positions.filter(p => p.type === 'short' || p.type === 'put').length;
  const longBias = positions.filter(p => p.type === 'long' || p.type === 'call').length;
  const optionsCount = positions.filter(p => p.type === 'put' || p.type === 'call').length;
  const stocksCount = positions.filter(p => p.type === 'long' || p.type === 'short').length;

  // Find positions expiring soon
  const expiringPositions = positions
    .filter(p => p.daysToExpiry !== null && p.daysToExpiry <= 14)
    .map(p => `${p.ticker} (${p.daysToExpiry}d)`)
    .join(', ');

  // Find winners and losers
  const winners = positions.filter(p => p.unrealizedPnL > 0).sort((a, b) => b.unrealizedPnL - a.unrealizedPnL);
  const losers = positions.filter(p => p.unrealizedPnL < 0).sort((a, b) => a.unrealizedPnL - b.unrealizedPnL);

  const macroContext = buildMacroContext();

  return `You are a portfolio risk manager analyzing this trading portfolio.

${macroContext}

---

PORTFOLIO OVERVIEW:
- Total Positions: ${positions.length} (${shortBias} bearish, ${longBias} bullish)
- Composition: ${optionsCount} options, ${stocksCount} stock positions
- Total Unrealized P&L: ${totalUnrealized >= 0 ? '+' : ''}$${totalUnrealized.toFixed(0)}
- Portfolio Value: ~$${totalValue.toFixed(0)}

POSITIONS:
${positionSummary}

${expiringPositions ? `OPTIONS EXPIRING SOON: ${expiringPositions}` : ''}

${winners.length > 0 ? `TOP WINNERS: ${winners.slice(0, 3).map(p => `${p.ticker} +$${p.unrealizedPnL.toFixed(0)}`).join(', ')}` : ''}
${losers.length > 0 ? `BIGGEST LOSERS: ${losers.slice(0, 3).map(p => `${p.ticker} $${p.unrealizedPnL.toFixed(0)}`).join(', ')}` : ''}

Analyze this portfolio and provide output in EXACTLY this format:

**RISK_SCORE:** [1-10 number only, where 10=extreme risk, 1=very safe]

**RISK_LEVEL:** [LOW|MEDIUM|HIGH]

**THESIS_STATUS:** [ALIGNED|PARTIAL|DIVERGENT]

**THESIS_DETAIL:** [One sentence on how well positions align with bearish rotation thesis]

**EXPIRY_STATUS:** [SAFE|WARNING|URGENT]

**EXPIRY_DETAIL:** [One sentence about time decay risk or "No imminent expirations"]

**PORTFOLIO_ANALYSIS:**
[2-3 sentences on overall portfolio health, concentration risk, and macro alignment]

**POSITION_SIGNALS:**
[For each position, one line with format: TICKER: [TAKE_PROFIT|HOLD|CUT_LOSS|ADD] - brief reason]

**RECOMMENDATIONS:**
[3-4 specific, actionable recommendations prioritized by urgency. Include specific prices/levels where applicable]`;
}
