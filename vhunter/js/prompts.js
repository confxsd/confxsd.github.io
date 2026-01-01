// AI Prompts Module
// Dynamic macro thesis from feed system

import { getCurrentThesis } from './feed.js';

// Build VRP (Volatility Risk Premium) context for AI
function buildVRPContext(data) {
  if (!data.vrp && !data.ivRank) {
    return 'VOLATILITY: No VRP data available';
  }

  const vrp = data.vrp;
  const ivRank = data.ivRank;
  const rv30 = data.rv30;
  const avgIV = data.avgIV;
  const termSteepness = data.termSteepness;
  const volSetup = data.volSetup;

  let vrpSignal = 'NEUTRAL';
  if (vrp > 10) vrpSignal = 'SELL PREMIUM (options expensive)';
  else if (vrp > 5) vrpSignal = 'SLIGHT PREMIUM (lean toward selling)';
  else if (vrp < -5) vrpSignal = 'BUY PREMIUM (options cheap)';
  else if (vrp < 0) vrpSignal = 'SLIGHT DISCOUNT (lean toward buying)';

  let ivRankSignal = '';
  if (ivRank > 80) ivRankSignal = 'VERY HIGH (top 20% of 52w range)';
  else if (ivRank > 60) ivRankSignal = 'HIGH';
  else if (ivRank < 20) ivRankSignal = 'VERY LOW (bottom 20% of 52w range)';
  else if (ivRank < 40) ivRankSignal = 'LOW';
  else ivRankSignal = 'MEDIUM';

  let context = `VOLATILITY ANALYSIS:
- IV (Implied): ${avgIV?.toFixed(1) || '--'}% | RV (30d Realized): ${rv30?.toFixed(1) || '--'}%
- VRP (IV - RV): ${vrp != null ? (vrp >= 0 ? '+' : '') + vrp.toFixed(1) + '%' : '--'} → ${vrpSignal}
- IV Rank (52w): ${ivRank?.toFixed(0) || '--'}% → ${ivRankSignal}`;

  if (termSteepness != null) {
    const termSignal = termSteepness > 10 ? 'STEEP (contango - back months expensive)' :
      termSteepness < -5 ? 'INVERTED (backwardation - fear)' : 'FLAT';
    context += `\n- Term Structure: ${termSteepness >= 0 ? '+' : ''}${termSteepness.toFixed(1)}% → ${termSignal}`;
  }

  if (volSetup) {
    context += `\n- Vol Setup: ${volSetup.setup.replace('_', ' ')} (${volSetup.confidence}% confidence)`;
    context += `\n- Recommendation: ${volSetup.description}`;
  }

  return context;
}

// Build GEX (Gamma Exposure) context for AI - SIG-level dealer positioning analysis
function buildGEXContext(data) {
  if (!data.gexMetrics && !data.gammaLevels) {
    return '';
  }

  const gex = data.gexMetrics || data.gammaLevels || {};
  const dex = data.dexMetrics || {};
  const deltaFlow = data.deltaFlow || {};
  const charm = data.charmPressure || {};

  // Skip if no meaningful data
  if (!gex.netGEX && !gex.zeroGamma && !gex.gexZeroLine) {
    return '';
  }

  // Format GEX for display
  const formatGEX = (val) => {
    if (val == null) return '--';
    const abs = Math.abs(val);
    if (abs >= 1e9) return (val / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return (val / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (val / 1e3).toFixed(0) + 'K';
    return val.toFixed(0);
  };

  const netGEX = gex.netGEX || gex.netGEXFormatted;
  const zeroGamma = gex.zeroGamma || gex.gexZeroLine;
  const callWall = gex.callWall || gex.levels?.callWall;
  const putWall = gex.putWall || gex.levels?.putWall;
  const volTrigger = gex.volTrigger || gex.levels?.volTrigger;
  const regime = gex.regime?.regime || gex.regime || 'UNKNOWN';

  // Regime interpretation for trading
  let regimeSignal = '';
  let tradingImplication = '';

  if (regime === 'POSITIVE' || regime === 'POSITIVE_GAMMA') {
    regimeSignal = '+GEX (Dealers LONG gamma)';
    tradingImplication = 'MEAN-REVERTING: Fade moves, sell vol, expect pinning. Dealers hedge BY SELLING rallies, BUYING dips.';
  } else if (regime === 'NEGATIVE' || regime === 'NEGATIVE_GAMMA') {
    regimeSignal = '-GEX (Dealers SHORT gamma)';
    tradingImplication = 'TRENDING: Follow momentum, buy vol. Dealers hedge BY BUYING rallies, SELLING dips = AMPLIFICATION.';
  } else if (regime === 'NEGATIVE_DEEP') {
    regimeSignal = '-GEX DEEP (Below Vol Trigger)';
    tradingImplication = 'HIGH VOL REGIME: Expect outsized moves. Dealer hedging creates feedback loop.';
  } else {
    regimeSignal = '~GEX (Near neutral)';
    tradingImplication = 'MIXED: No strong dealer-driven bias.';
  }

  let context = `
GAMMA EXPOSURE (GEX) - Dealer Positioning:
- Net GEX: ${typeof netGEX === 'string' ? netGEX : formatGEX(netGEX)} → ${regimeSignal}
- Zero Gamma: $${zeroGamma?.toFixed(0) || '--'} ${data.price > zeroGamma ? '(SPOT ABOVE - stabilizing zone)' : '(SPOT BELOW - amplifying zone)'}
- Call Wall: $${callWall?.toFixed(0) || '--'} (RESISTANCE - 83% hold rate)
- Put Wall: $${putWall?.toFixed(0) || '--'} (SUPPORT)`;

  if (volTrigger) {
    context += `\n- Vol Trigger: $${volTrigger.toFixed(0)} (Below = vol expansion zone)`;
  }

  context += `\n- TRADING IMPLICATION: ${tradingImplication}`;

  // Add delta flow if available
  if (deltaFlow.hedgingPressure) {
    context += `\n- Delta Flow: ${deltaFlow.hedgingPressure} (${deltaFlow.intensity || 'N/A'})`;
  }

  // Add pinning info if near expiry
  if (charm.pinningStrike && charm.charmPressure !== 'NONE') {
    context += `\n- Charm/Pinning: ${charm.signal} (${charm.charmPressure})`;
  }

  // Add wall shift data if available
  const wallShift = data.wallShift;
  if (wallShift?.shifts) {
    const { shifts, trends } = wallShift;
    if (shifts.callWall != null || shifts.putWall != null) {
      context += `\n\nWALL SHIFTS (vs yesterday):`;
      if (shifts.callWall != null) {
        const dir = shifts.callWall > 0 ? '↑' : shifts.callWall < 0 ? '↓' : '→';
        context += `\n- Call Wall: ${dir}$${Math.abs(shifts.callWall).toFixed(0)} (${shifts.callWallSignal})`;
      }
      if (shifts.putWall != null) {
        const dir = shifts.putWall > 0 ? '↑' : shifts.putWall < 0 ? '↓' : '→';
        context += `\n- Put Wall: ${dir}$${Math.abs(shifts.putWall).toFixed(0)} (${shifts.putWallSignal})`;
      }
      if (trends?.callWall5d != null) {
        context += `\n- 5d Trend: Call Wall ${trends.callWallSignal5d}, Put Wall ${trends.putWallSignal5d}`;
      }
    }
  }

  return context;
}

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

  // Build VRP context if available
  const vrpContext = buildVRPContext(data);

  // Build GEX context if available
  const gexContext = buildGEXContext(data);

  return `You are a professional options trader at a prop firm (SIG/Citadel-level).
Your edge: Understanding DEALER POSITIONING via GEX and volatility regimes.

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

Provide output in EXACTLY this format with === separators:

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

**THESIS_DETAIL:** [One sentence on how well positions align with current macro thesis]

**EXPIRY_STATUS:** [SAFE|WARNING|URGENT]

**EXPIRY_DETAIL:** [One sentence about time decay risk or "No imminent expirations"]

**PORTFOLIO_ANALYSIS:**
[2-3 sentences on overall portfolio health, concentration risk, and macro alignment]

**POSITION_SIGNALS:**
[For each position, one line with format: TICKER: [TAKE_PROFIT|HOLD|CUT_LOSS|ADD] - brief reason]

**RECOMMENDATIONS:**
[3-4 specific, actionable recommendations prioritized by urgency. Include specific prices/levels where applicable]`;
}
