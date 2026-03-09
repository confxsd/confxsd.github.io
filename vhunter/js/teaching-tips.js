// VHunter Teaching Tips Module
// Educational content for options volatility trading

// ============================================
// TEACHING TIPS DATABASE
// ============================================

export const TEACHING_TIPS = {
  // Core Volatility Concepts
  vrp: {
    title: 'Volatility Risk Premium (VRP)',
    short: 'IV - RV = Premium sellers earn',
    detail: `VRP is the difference between Implied Volatility (what the market expects) and Realized Volatility (what actually happened).

When VRP > 0: Options are "expensive" - sellers have edge
When VRP < 0: Options are "cheap" - buyers have edge

Key insight: VRP is like a point spread in sports betting. It represents the market's assessment of relative value between buyers and sellers.`
  },

  ivRank: {
    title: 'IV Rank',
    short: 'Where IV sits in its 52-week range',
    detail: `IV Rank = (Current IV - 52wk Low) / (52wk High - 52wk Low) × 100

Example: If IV ranged from 20% to 80% over the past year, and current IV is 50%:
IV Rank = (50-20)/(80-20) = 50%

IV Rank > 50: IV is elevated relative to history
IV Rank < 30: IV is relatively low`
  },

  ivPercentile: {
    title: 'IV Percentile',
    short: '% of days IV was lower than today',
    detail: `IV Percentile counts what percentage of days over the past year had lower IV than today.

IV Percentile = 80% means: Current IV is higher than 80% of historical readings.

Why it matters: IV Rank can be skewed by outliers. IV Percentile gives you a cleaner picture of how often IV has been this high.`
  },

  // Win Rates & Expectancy
  straddleWinRate: {
    title: 'Straddle Win Rate Reality',
    short: 'Fairly priced straddle loses 58% of the time',
    detail: `In Black-Scholes world, if you buy a straddle at fairly priced vol, your expectancy is zero BUT you expect to lose ~58% of the time.

Why? The most you can lose is the premium paid, but wins are theoretically unlimited. So wins are larger but less frequent.

For sellers: 58% win rate, but each loss can exceed your wins.
For buyers: 42% win rate, but winners are bigger.

Zero expectancy doesn't mean equal outcomes!`
  },

  expectedMove: {
    title: 'Expected Move (1 SD)',
    short: 'Range where stock lands 68% of the time',
    detail: `Expected Move = Stock Price × IV × √(Days/365)

This gives you the 1 standard deviation range. Statistically, the stock should stay within this range about 68% of the time.

ATM Straddle ≈ 0.8 × Expected Move

So if expected move is $10, the ATM straddle should cost about $8.`
  },

  // Term Structure
  termStructure: {
    title: 'Term Structure (Contango vs Backwardation)',
    short: 'How IV changes across expirations',
    detail: `Normal (Contango): Longer-dated options have higher IV
- Market expects current calm to persist
- Calendars are cheap (buy back, sell front)

Inverted (Backwardation): Short-dated options have higher IV
- Fear of imminent move (earnings, event)
- Front month premium is elevated

Forward Vol: The implied vol between two expirations
If 30-day IV is 42% and 20-day IV is 40%, the 20-30 day forward vol must be HIGHER than 42%.`
  },

  // Vega & Greeks
  vegaRisk: {
    title: 'Vega Risk Context',
    short: 'Same vega, different risk',
    detail: `Key insight: 100k vega means very different things for 1-week vs 1-year options.

Near-term vols fluctuate more. A 1-week option might see IV move 10 points, while a 1-year option's IV only moves 2 points.

Normalized Vega: Scale vega by √time to compare risk across tenors.

A 4x longer option has 2x the vega, but if short-term IV is twice as volatile, they carry EQUAL practical risk.`
  },

  greeksAsPnL: {
    title: 'Greeks as P&L Drivers',
    short: 'Delta = direction, Gamma/Theta = vol, Vega = IV change',
    detail: `Option P&L decomposes into:

Delta P&L: How much you made from direction
Gamma P&L: Profit from realized moves (gamma scalping)
Theta P&L: Time decay (your cost of gamma)
Vega P&L: Profit from IV changes

For delta-hedged positions, Gamma vs Theta is your realized vol bet.
If RV > IV, gamma profits exceed theta decay = profit.`
  },

  // Three Lenses Framework
  threeLenses: {
    title: 'Three Lenses for Options',
    short: 'Cross-sectional, Time Series, Fundamental',
    detail: `Cross-Sectional: Compare current IV vs other tickers
- Is TSLA IV high relative to the market?
- Which stock has the best VRP?

Time Series: Compare current IV vs its own history
- Is TSLA IV high for TSLA?
- IV Rank and IV Percentile

Fundamental: What justifies the volatility?
- Is there an event (earnings, FDA)?
- Has the business changed?

Use all three lenses before trading.`
  },

  // Edge Sources
  edgeSources: {
    title: 'Where Does Your Edge Come From?',
    short: 'Know your P&L driver',
    detail: `1. DISTRIBUTIONAL (destination-based)
   - You think stock will end up somewhere specific
   - Use vertical spreads, unhedged options
   - Edge: probability assessment

2. VRP/CARRY (realized vol vs implied)
   - You think RV will differ from IV
   - Use delta-hedged straddles, condors
   - Edge: volatility forecasting

3. SURFACE REPRICING (IV changes)
   - You think IV will change
   - Use longer-dated options, vega plays
   - Edge: timing IV moves

Knowing your edge keeps you from drifting.`
  },

  // Skew
  skew: {
    title: 'Volatility Skew',
    short: 'OTM puts usually cost more than OTM calls',
    detail: `Put Skew: OTM puts trade at higher IV than ATM
- Market fears crashes more than rallies
- "Normal" for equity indices

Call Skew: OTM calls trade at higher IV
- Indicates fear of upside gaps
- Common in M&A targets, meme stocks

Skew flattening often precedes big moves.`
  },

  // Risk Management
  positionSizing: {
    title: 'Position Sizing',
    short: 'Trade small as you learn',
    detail: `If you are uncomfortable, you are too big.

Work backward from acceptable risk:
1. Define max loss you can tolerate
2. Calculate position size from that
3. NOT the other way around

Don't size from "how much premium can I collect."
Size from "how much can I afford to lose."`
  },

  // Covered Calls Reality
  coveredCalls: {
    title: 'Covered Call Reality Check',
    short: 'Not an income strategy',
    detail: `Reframe: Stop thinking of covered calls as "income."

A covered call = long stock + short call
You're still betting on volatility!

Ask: Is the IV I'm selling at actually expensive?
If IV is at 30% and historical RV is 35%, you're GIVING away edge.

Evaluate covered calls the same way you'd evaluate any vol trade.`
  },

  // Multiple VRPs
  multiWindowVRP: {
    title: 'The Multiple VRP Problem',
    short: 'RV depends on how you measure it',
    detail: `There's no single "correct" realized volatility!

Daily sampling: One measurement
Weekly sampling: Different number
Point-to-point: Yet another

A stock with 16% daily RV might show:
- 35% weekly RV
- 78% point-to-point

This creates a RANGE of possible VRPs, not a single reference. Professional traders monitor all windows.`
  },

  // Volatility Cone
  volCone: {
    title: 'Volatility Cone',
    short: 'Historical RV distribution by lookback',
    detail: `The volatility cone shows percentile ranges of historical realized volatility for different lookback periods.

Key insight: Short-term RV (5-day) has a wider range than long-term RV (60-day). This is mean reversion at work.

Use the cone to:
1. See if current RV is extreme
2. Understand typical RV ranges
3. Identify when IV is mispriced vs RV`
  },

  // Dealer Positioning (SIG-Level)
  dealerPositioning: {
    title: 'Dealer Positioning',
    short: 'How market makers hedge creates price magnets and volatility regimes',
    detail: `DEALER HEDGING MECHANICS (SIG-Level):

Market makers (MMs) are typically SHORT options to retail. Their hedging creates predictable price dynamics.

KEY CONCEPTS:

• GEX (Gamma Exposure):
  +GEX = MMs long gamma → DAMPENS moves (mean-reversion)
  -GEX = MMs short gamma → AMPLIFIES moves (trending)

• Delta Flow:
  When customers buy calls → MMs short calls → MMs buy stock to hedge
  When customers buy puts → MMs short puts → MMs sell stock to hedge
  Net hedging pressure moves the underlying!

• Charm (Delta Decay):
  Near-expiry ATM options have massive charm
  As expiry approaches, gamma concentrates → PINNING effect
  Stock gravitates toward high-OI strikes on Friday PM

• G-Ratio (Call GEX / Put GEX):
  >1 = Call gamma dominates → resistance is real
  <1 = Put gamma dominates → support may break

TRADING REGIMES:
+GEX: Fade moves, sell vol, mean-reversion works
-GEX: Follow trend, buy vol, breakouts are real
Near zero: Transitional, be nimble`
  },

  // Path Dependence
  pathDependence: {
    title: 'Path Dependence',
    short: 'How you get there matters',
    detail: `Options are path dependent:
A stock going from 100 to 110 in a straight line vs whipsawing wildly to 110 produce VERY different option P&Ls.

Gamma scalpers profit from whipsaw.
Theta collectors hate it.

Even "right" directional calls can lose money if the path is wrong or IV collapses.`
  },

  // Exit Discipline
  exitDiscipline: {
    title: 'Exit Discipline',
    short: 'Reassess continuously',
    detail: `Don't anchor to your entry price!

Continuously ask: "Is vol still expensive/cheap?"

Exit if:
- Your thesis is disproven
- Vol has normalized
- Better opportunities exist elsewhere

The market's current valuation matters more than what you paid.`
  }
};

// ============================================
// TOOLTIP GENERATOR
// ============================================

export function createTooltip(tipKey) {
  const tip = TEACHING_TIPS[tipKey];
  if (!tip) return '';

  return `
    <div class="teaching-tooltip" data-tip="${tipKey}">
      <span class="tip-icon">?</span>
      <div class="tip-popup" id="sectionTip_${tipKey}">
        <div class="tip-title">${tip.title}</div>
        <div class="tip-short">${tip.short}</div>
        <div class="tip-detail">${tip.detail}</div>
      </div>
    </div>
  `;
}

// ============================================
// INLINE TEACHING HINTS
// ============================================

export function getQuickHint(tipKey) {
  const tip = TEACHING_TIPS[tipKey];
  return tip ? tip.short : '';
}

export function getDetailedTip(tipKey) {
  const tip = TEACHING_TIPS[tipKey];
  return tip ? tip.detail : '';
}

// ============================================
// WIN RATE CALCULATOR
// ============================================

export function getStraddleWinRateInfo(straddlePct) {
  // Fair straddle loses ~58% of the time
  // But if straddle is cheap/expensive, win rate shifts

  const fairWinRate = 42; // For buyer
  const fairLoseRate = 58; // For buyer

  // Straddle is 0.8 SD of expected move
  // If market is pricing correctly, straddle = 0.8 × vol × sqrt(t)

  return {
    buyerWinRate: fairWinRate,
    sellerWinRate: fairLoseRate,
    explanation: `A fairly priced straddle has 0 expectancy but loses ${fairLoseRate}% of the time. Wins are larger but less frequent.`,
    sellerAdvice: `Sellers win ${fairLoseRate}% of the time, but each loss can exceed cumulative wins.`,
    buyerAdvice: `Buyers win only ${fairWinRate}% of the time, but big moves pay off handsomely.`
  };
}

// ============================================
// THREE LENSES ANALYSIS
// ============================================

export function analyzeThreeLenses(metrics) {
  const { iv, ivRank, vrp, sectorAvgIV, historicalAvgIV } = metrics;

  const lenses = {
    crossSectional: {
      lens: 'Cross-Sectional',
      question: 'Is IV high vs peers?',
      value: sectorAvgIV ? `${((iv / sectorAvgIV) * 100 - 100).toFixed(0)}% vs sector` : 'N/A',
      signal: sectorAvgIV && iv > sectorAvgIV * 1.2 ? 'EXPENSIVE' :
        sectorAvgIV && iv < sectorAvgIV * 0.8 ? 'CHEAP' : 'FAIR'
    },
    timeSeries: {
      lens: 'Time Series',
      question: 'Is IV high for this stock?',
      value: ivRank ? `Rank: ${ivRank.toFixed(0)}%` : 'N/A',
      signal: ivRank > 70 ? 'HIGH' : ivRank < 30 ? 'LOW' : 'NORMAL'
    },
    fundamental: {
      lens: 'Fundamental',
      question: 'Is there a reason for elevated vol?',
      value: vrp > 15 ? 'Large VRP - check for events' : vrp < -5 ? 'Low VRP - market calm' : 'Normal VRP',
      signal: vrp > 15 ? 'CHECK EVENTS' : 'NO UNUSUAL FACTORS'
    }
  };

  // Combined signal
  let bullishCount = 0;
  let bearishCount = 0;

  if (lenses.crossSectional.signal === 'EXPENSIVE') bullishCount++;
  if (lenses.crossSectional.signal === 'CHEAP') bearishCount++;
  if (lenses.timeSeries.signal === 'HIGH') bullishCount++;
  if (lenses.timeSeries.signal === 'LOW') bearishCount++;

  lenses.combined = {
    sellVol: bullishCount >= 2,
    buyVol: bearishCount >= 2,
    signal: bullishCount >= 2 ? 'SELL VOL' : bearishCount >= 2 ? 'BUY VOL' : 'NEUTRAL'
  };

  return lenses;
}

// ============================================
// EDGE SOURCE CLASSIFIER
// ============================================

export function classifyEdgeSource(tradeType, isHedged, expiry) {
  const daysToExpiry = typeof expiry === 'number' ? expiry :
    (new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24);

  // Distributional edge
  if (!isHedged && (tradeType === 'vertical' || tradeType === 'outright')) {
    return {
      source: 'DISTRIBUTIONAL',
      description: 'You\'re betting on where the stock ends up',
      advice: 'Your edge must come from probability assessment',
      risk: 'Directional and vol risk combined'
    };
  }

  // VRP/Carry edge
  if (isHedged || tradeType === 'straddle' || tradeType === 'condor') {
    return {
      source: 'VRP/CARRY',
      description: 'You\'re betting on realized vol vs implied vol',
      advice: 'Your edge must come from vol forecasting',
      risk: 'Path dependent - whipsaw kills premium'
    };
  }

  // Surface repricing
  if (daysToExpiry > 45 || tradeType === 'calendar') {
    return {
      source: 'SURFACE REPRICING',
      description: 'You\'re betting on IV level changes',
      advice: 'Your edge must come from timing IV moves',
      risk: 'Theta decay while waiting for IV move'
    };
  }

  return {
    source: 'MIXED',
    description: 'Multiple edge sources - know your primary driver',
    advice: 'Clarify which lens you\'re trading through',
    risk: 'Drift between strategies clouds P&L attribution'
  };
}

// ============================================
// RISK CONTEXT
// ============================================

export function getRiskContext(position, portfolioSize) {
  const positionValue = position.quantity * position.entry_price *
    (position.type === 'call' || position.type === 'put' ? 100 : 1);

  const positionPct = (positionValue / portfolioSize) * 100;

  let riskLevel = 'NORMAL';
  let advice = '';

  if (positionPct > 10) {
    riskLevel = 'HIGH';
    advice = 'Position > 10% of portfolio. If uncomfortable, you\'re too big.';
  } else if (positionPct > 5) {
    riskLevel = 'ELEVATED';
    advice = 'Moderate concentration. Monitor closely.';
  } else {
    riskLevel = 'APPROPRIATE';
    advice = 'Well-sized position relative to portfolio.';
  }

  return {
    riskLevel,
    positionPct: positionPct.toFixed(1),
    advice
  };
}

// ============================================
// DYNAMIC STAT TOOLTIPS
// ============================================

export function updateDynamicTooltips(metrics) {
  const { ticker, ivRank, ivPct, hv30, vrp, expMove, pcRatio, volSetup, spotPrice, avgIV } = metrics;

  // Update dynamic hints below stat values
  updateDynamicHints(metrics);

  // IV Rank tooltip
  const tipIvRank = document.getElementById('tipIvRank');
  if (tipIvRank && ivRank != null) {
    const ivRankLevel = ivRank > 70 ? 'HIGH' : ivRank > 50 ? 'ELEVATED' : ivRank > 30 ? 'MODERATE' : 'LOW';
    const ivRankSignal = ivRank > 70 ? '🔴 Premium selling favorable' :
                         ivRank < 30 ? '🟢 Premium buying favorable' : '🟡 Neutral zone';
    tipIvRank.innerHTML = `
      <div class="tip-title">IV Rank: ${ivRank.toFixed(0)}% - ${ivRankLevel}</div>
      <div class="tip-detail">
<strong>What it means:</strong>
Current IV is higher than ${ivRank.toFixed(0)}% of readings over the past year.

<strong>Signal:</strong> ${ivRankSignal}

<strong>Context for ${ticker}:</strong>
${ivRank > 70 ? `IV is near 52-week highs. Options are relatively expensive. Consider selling premium if thesis supports.` :
  ivRank < 30 ? `IV is near 52-week lows. Options are relatively cheap. Good time to buy protection or speculate.` :
  `IV is in the middle of its historical range. No strong directional bias from IV alone.`}
      </div>
    `;
  }

  // IV Percentile tooltip
  const tipIvPct = document.getElementById('tipIvPct');
  if (tipIvPct && ivPct != null) {
    tipIvPct.innerHTML = `
      <div class="tip-title">IV Percentile: ${ivPct.toFixed(0)}%</div>
      <div class="tip-detail">
<strong>What it means:</strong>
${ivPct.toFixed(0)}% of trading days had lower IV than today.

<strong>Why it matters:</strong>
IV Percentile is less affected by outliers than IV Rank.
${ivPct > ivRank + 10 ? `\n⚠️ Percentile > Rank suggests a few extreme spikes skewed the range.` : ''}
${ivPct < ivRank - 10 ? `\n⚠️ Percentile < Rank suggests IV spent most time near current levels.` : ''}

<strong>Trading implication:</strong>
${ivPct > 80 ? `Very elevated - strong premium selling setup` :
  ivPct < 20 ? `Very low - consider buying options` :
  `Moderate - look at other factors`}
      </div>
    `;
  }

  // VRP tooltip
  const tipVrp = document.getElementById('tipVrp');
  if (tipVrp && vrp != null) {
    const vrpSignal = vrp > 15 ? 'SELL VOL' : vrp > 5 ? 'SLIGHT SELL' : vrp < -10 ? 'BUY VOL' : vrp < 0 ? 'SLIGHT BUY' : 'NEUTRAL';
    tipVrp.innerHTML = `
      <div class="tip-title">VRP: ${vrp >= 0 ? '+' : ''}${vrp.toFixed(1)}% - ${vrpSignal}</div>
      <div class="tip-detail">
<strong>Formula:</strong> IV (${avgIV?.toFixed(1) || '--'}%) - HV30 (${hv30?.toFixed(1) || '--'}%) = ${vrp.toFixed(1)}%

<strong>Interpretation:</strong>
${vrp > 15 ? `🔴 Options are EXPENSIVE
Market is pricing in ${vrp.toFixed(0)}% more vol than realized.
Edge: Premium sellers` :
  vrp > 5 ? `🟡 Options slightly expensive
Modest edge for premium sellers.` :
  vrp < -10 ? `🟢 Options are CHEAP
Market is underpricing realized vol by ${Math.abs(vrp).toFixed(0)}%.
Edge: Premium buyers` :
  vrp < 0 ? `🟡 Options slightly cheap
Modest edge for premium buyers.` :
  `⚪ Options fairly priced
No clear edge from VRP alone.`}

<strong>Win Rate Context:</strong>
At-the-money straddle sellers win ~58% of the time but each loss can exceed wins. VRP tells you if the odds are tilted further in your favor.
      </div>
    `;
  }

  // Expected Move tooltip
  const tipExpMove = document.getElementById('tipExpMove');
  if (tipExpMove && expMove != null && spotPrice) {
    const expMovePct = (expMove / spotPrice * 100).toFixed(1);
    const upperBound = (spotPrice + expMove).toFixed(2);
    const lowerBound = (spotPrice - expMove).toFixed(2);
    tipExpMove.innerHTML = `
      <div class="tip-title">Expected Move: ±$${expMove.toFixed(2)} (${expMovePct}%)</div>
      <div class="tip-detail">
<strong>1 SD Range (68% probability):</strong>
$${lowerBound} to $${upperBound}

<strong>What this means:</strong>
Based on current IV, ${ticker} is expected to stay within ±$${expMove.toFixed(2)} about 68% of the time by next weekly expiration.

<strong>ATM Straddle estimate:</strong>
≈ $${(expMove * 0.8).toFixed(2)} (0.8 × expected move)

<strong>Trading use:</strong>
• Selling iron condors? Place wings outside this range
• Buying straddles? You need a move > this to profit
• Setting stops? This range guides realistic targets
      </div>
    `;
  }

  // Vol Setup tooltip
  const tipVolSetup = document.getElementById('tipVolSetup');
  if (tipVolSetup && volSetup) {
    const setupName = typeof volSetup === 'object' ? volSetup.setup : volSetup;
    const setupReason = typeof volSetup === 'object' ? volSetup.reason : '';

    let setupAdvice = '';
    if (setupName.includes('SELL') || setupName === 'HIGH_VRP') {
      setupAdvice = `
<strong>🔴 Sell Premium Setup</strong>
Consider: Short straddles, iron condors, credit spreads
Target: Collect premium, profit from time decay
Risk: Large moves against position`;
    } else if (setupName.includes('BUY') || setupName === 'NEGATIVE_VRP') {
      setupAdvice = `
<strong>🟢 Buy Premium Setup</strong>
Consider: Long straddles, debit spreads, protective puts
Target: Profit from large moves or IV expansion
Risk: Time decay works against you`;
    } else {
      setupAdvice = `
<strong>🟡 Neutral / Mixed Setup</strong>
No strong directional vol bias.
Consider: Wait for better setup or trade directionally`;
    }

    tipVolSetup.innerHTML = `
      <div class="tip-title">Vol Setup: ${setupName.replace(/_/g, ' ')}</div>
      <div class="tip-detail">
${setupReason ? `<strong>Why:</strong> ${setupReason}\n\n` : ''}${setupAdvice}

<strong>Key Metrics:</strong>
• IV Rank: ${ivRank?.toFixed(0) || '--'}%
• VRP: ${vrp >= 0 ? '+' : ''}${vrp?.toFixed(0) || '--'}%
• P/C Ratio: ${pcRatio?.toFixed(2) || '--'}
      </div>
    `;
  }

  // P/C Ratio tooltip
  const tipPcRatio = document.getElementById('tipPcRatio');
  if (tipPcRatio && pcRatio != null) {
    let biasLabel = '';
    let biasColor = '#94a3b8';
    let biasExplanation = '';

    if (pcRatio > 1.5) {
      biasLabel = 'HEAVY PUT BUYING';
      biasColor = '#ef4444';
      biasExplanation = `🔴 Aggressive bearish sentiment. Traders are paying up for downside protection or betting on a drop.`;
    } else if (pcRatio > 1.0) {
      biasLabel = 'BEARISH BIAS';
      biasColor = '#f59e0b';
      biasExplanation = `🟠 More puts trading than calls. Slightly cautious sentiment - could be hedging or directional bets.`;
    } else if (pcRatio < 0.5) {
      biasLabel = 'HEAVY CALL BUYING';
      biasColor = '#10b981';
      biasExplanation = `🟢 Aggressive bullish sentiment. Traders are paying up for upside exposure.`;
    } else if (pcRatio < 0.8) {
      biasLabel = 'BULLISH BIAS';
      biasColor = '#06b6d4';
      biasExplanation = `🔵 More calls trading than puts. Optimistic sentiment - traders positioning for upside.`;
    } else {
      biasLabel = 'BALANCED';
      biasColor = '#94a3b8';
      biasExplanation = `⚪ Roughly equal put and call volume. No strong directional signal from flow.`;
    }

    tipPcRatio.innerHTML = `
      <div class="tip-title" style="color:${biasColor}">${ticker}: P/C Ratio ${pcRatio.toFixed(2)} - ${biasLabel}</div>
      <div class="tip-detail">
<strong>Timeline:</strong> ALL expirations combined (aggregate volume)

<strong>What This Means:</strong>
${biasExplanation}

<strong>How to Interpret:</strong>
• < 0.5: Heavy call buying - very bullish
• 0.5 - 0.8: Bullish bias - more call activity
• 0.8 - 1.0: Balanced - neutral flow
• 1.0 - 1.5: Bearish bias - more put activity
• > 1.5: Heavy put buying - very bearish

<strong>Context:</strong>
This ratio uses total volume across all expirations, giving you a snapshot of overall market sentiment today.
${pcRatio < 0.7 ? `\n⚠️ Very low P/C often seen at local tops. Contrarians watch for reversal.` : ''}
${pcRatio > 1.3 ? `\n⚠️ Very high P/C can signal fear. Contrarians may see opportunity.` : ''}
      </div>
    `;
  }
}

// ============================================
// EDUCATIONAL ALERTS
// ============================================

export function getEducationalAlert(metrics) {
  const alerts = [];

  // VRP alert
  if (metrics.vrp > 15) {
    alerts.push({
      type: 'OPPORTUNITY',
      title: 'High VRP Detected',
      message: `VRP of ${metrics.vrp.toFixed(0)}% suggests options are expensive. Premium sellers have edge.`,
      tip: TEACHING_TIPS.vrp.short
    });
  } else if (metrics.vrp < -5) {
    alerts.push({
      type: 'OPPORTUNITY',
      title: 'Low VRP Detected',
      message: `Negative VRP of ${metrics.vrp.toFixed(0)}% suggests options are cheap. Consider buying protection.`,
      tip: TEACHING_TIPS.vrp.short
    });
  }

  // IV Rank alert
  if (metrics.ivRank > 80) {
    alerts.push({
      type: 'INFO',
      title: 'Elevated IV Rank',
      message: `IV Rank at ${metrics.ivRank.toFixed(0)}% - near 52-week highs. Good for premium selling if VRP supports.`,
      tip: TEACHING_TIPS.ivRank.short
    });
  }

  // Term structure alert
  if (metrics.termStructure === 'BACKWARDATION') {
    alerts.push({
      type: 'WARNING',
      title: 'Inverted Term Structure',
      message: 'Front-month IV exceeds back months. Market pricing near-term event risk.',
      tip: TEACHING_TIPS.termStructure.short
    });
  }

  return alerts;
}

// ============================================
// SECTION TOOLTIP UPDATES
// Updates section tooltips (Term Structure, Skew, etc.) with actual data
// ============================================

export function updateSectionTooltips(data) {
  const { termStructure, skew, spotPrice, avgIV, hv30, ticker, gammaAnalysis } = data;

  // Term Structure tooltip - ACTIONABLE DATA INTERPRETATION
  const termTip = document.getElementById('sectionTip_termStructure');
  const termHint = document.getElementById('termStructureHint');
  if (termTip) {
    if (ticker && termStructure) {
      const weekly = termStructure.weekly || 0;
      const monthly = termStructure.monthly || 0;
      const quarterly = termStructure.quarterly || 0;
      const sixMonth = termStructure.sixMonth || 0;

      // Calculate forward vol (what market implies for period between monthly and quarterly)
      const forwardVol = monthly > 0 && quarterly > 0 ?
        Math.sqrt((quarterly * quarterly * 90 - monthly * monthly * 30) / 60) : 0;

      let actionTitle = '';
      let actionColor = '#94a3b8';
      let whatItMeans = '';
      let howToTrade = '';
      let hintText = '';

      if (weekly > monthly * 1.15) {
        actionColor = '#ef4444';
        actionTitle = `${ticker}: EVENT RISK PRICED IN`;
        hintText = `⚠️ BACKWARDATION - Front ${weekly.toFixed(0)}% > Back ${monthly.toFixed(0)}%`;
        whatItMeans = `Front-month IV (${weekly.toFixed(0)}%) is ${((weekly/monthly - 1) * 100).toFixed(0)}% HIGHER than back months. Market is pricing a near-term catalyst (earnings? news?). This is UNUSUAL.`;
        howToTrade = `→ DON'T sell front-month premium blindly - event risk is real
→ Calendars are EXPENSIVE (you're buying high front vol)
→ If you think event is overpriced: front-month butterflies
→ If you think event is underpriced: straddles/strangles`;
      } else if (sixMonth > weekly * 1.1) {
        actionColor = '#10b981';
        actionTitle = `${ticker}: NORMAL STRUCTURE - CALENDARS WORK`;
        hintText = `✓ CONTANGO - Weekly ${weekly.toFixed(0)}% < 6M ${sixMonth.toFixed(0)}%`;
        whatItMeans = `Back-month IV (${sixMonth.toFixed(0)}%) exceeds front (${weekly.toFixed(0)}%). This is NORMAL - longer-dated options should cost more. No event risk priced.`;
        howToTrade = `→ Calendar spreads are ATTRACTIVE (sell back, buy front)
→ You're selling expensive back-month vol
→ Front-month premium selling has normal theta
→ No urgency - standard vol selling works`;
      } else {
        actionTitle = `${ticker}: FLAT STRUCTURE - NO EDGE`;
        hintText = `FLAT - ${weekly.toFixed(0)}% to ${sixMonth.toFixed(0)}%`;
        whatItMeans = `IV is similar across all expirations (${weekly.toFixed(0)}% - ${sixMonth.toFixed(0)}%). No term structure trade here.`;
        howToTrade = `→ No calendar spread edge
→ Pick expiration based on your thesis, not structure
→ Focus on VRP and skew instead`;
      }

      if (termHint) {
        termHint.textContent = hintText;
        termHint.style.color = actionColor;
      }

      termTip.innerHTML = `
        <div class="tip-title" style="color:${actionColor}">${actionTitle}</div>
        <div class="tip-short">Weekly ${weekly.toFixed(0)}% | Monthly ${monthly.toFixed(0)}% | 6M ${sixMonth.toFixed(0)}%</div>
        <div class="tip-detail">
<strong>What This Means for ${ticker}:</strong>
${whatItMeans}

<strong>How to Trade It:</strong>
${howToTrade}
${forwardVol > 0 ? `
<strong>Forward Vol (30-90 day):</strong> ${forwardVol.toFixed(0)}%
${forwardVol > quarterly ? `→ Market expects vol to RISE after month 1` : `→ Market expects vol to STAY FLAT`}` : ''}
        </div>
      `;
    } else {
      // Reset to static default
      const defaultTip = TEACHING_TIPS.termStructure;
      termTip.innerHTML = `
        <div class="tip-title">${defaultTip.title}</div>
        <div class="tip-short">${defaultTip.short}</div>
        <div class="tip-detail">${defaultTip.detail}</div>
      `;
      if (termHint) {
        termHint.textContent = 'Load a ticker to see term structure';
        termHint.style.color = '#94a3b8';
      }
    }
  }

  // Skew tooltip - ACTIONABLE DATA INTERPRETATION
  const skewTip = document.getElementById('sectionTip_skew');
  const skewHint = document.getElementById('skewHint');
  if (skewTip) {
    if (ticker && skew) {
      const putIV = skew.putIV || 0;
      const atmIV = skew.atmIV || avgIV || 0;
      const callIV = skew.callIV || 0;
      const pcSkew = skew.pcSkew || (putIV - callIV);

      let actionTitle = '';
      let actionColor = '#94a3b8';
      let whatItMeans = '';
      let howToTrade = '';
      let skewHintText = '';

      if (pcSkew > 8) {
        actionColor = '#ef4444';
        actionTitle = `${ticker}: PUTS ARE EXPENSIVE - SELL THEM`;
        skewHintText = `🔴 HIGH PUT SKEW +${pcSkew.toFixed(0)}% - puts overpriced`;
        whatItMeans = `OTM puts cost ${pcSkew.toFixed(0)}% MORE than OTM calls. Someone is paying up for downside protection. This is either FEAR or large hedging. Puts are relatively EXPENSIVE.`;
        howToTrade = `→ SELL put skew: Put ratio spreads (sell 2 OTM, buy 1 ATM)
→ Risk reversals: Sell OTM put, buy OTM call
→ Put credit spreads have edge
→ DON'T buy put spreads - you're paying up`;
      } else if (pcSkew > 3) {
        actionTitle = `${ticker}: NORMAL SKEW - NO EDGE`;
        skewHintText = `Put +${pcSkew.toFixed(0)}% vs Call (normal)`;
        whatItMeans = `Standard equity skew. Puts are ${pcSkew.toFixed(0)}% richer than calls - this is NORMAL for stocks (crash risk premium).`;
        howToTrade = `→ No skew edge to exploit
→ Trade based on direction/vol view
→ Neither puts nor calls are mispriced`;
      } else if (pcSkew < -3) {
        actionColor = '#10b981';
        actionTitle = `${ticker}: CALLS ARE EXPENSIVE - UNUSUAL`;
        skewHintText = `🟢 CALL SKEW ${pcSkew.toFixed(0)}% - calls overpriced`;
        whatItMeans = `OTM calls cost ${Math.abs(pcSkew).toFixed(0)}% MORE than OTM puts. This is RARE for equities. Someone is paying up for upside (M&A? squeeze? momentum?).`;
        howToTrade = `→ SELL call skew: Call ratio spreads
→ If bullish, buy stock + sell calls (overpriced)
→ DON'T buy call spreads - you're overpaying
→ Investigate WHY - could signal news`;
      } else {
        actionTitle = `${ticker}: FLAT SKEW - BALANCED`;
        skewHintText = `FLAT skew (${pcSkew >= 0 ? '+' : ''}${pcSkew.toFixed(0)}%)`;
        whatItMeans = `Puts and calls priced similarly. No fear, no greed - market is balanced.`;
        howToTrade = `→ No skew edge
→ Straddles/strangles fairly priced
→ Direction bet = buy calls or puts at fair value`;
      }

      if (skewHint) {
        skewHint.textContent = skewHintText;
        skewHint.style.color = actionColor;
      }

      skewTip.innerHTML = `
        <div class="tip-title" style="color:${actionColor}">${actionTitle}</div>
        <div class="tip-short">Put ${putIV.toFixed(0)}% | ATM ${atmIV.toFixed(0)}% | Call ${callIV.toFixed(0)}%</div>
        <div class="tip-detail">
<strong>What This Means for ${ticker}:</strong>
${whatItMeans}

<strong>How to Trade It:</strong>
${howToTrade}

<strong>Raw Numbers:</strong>
• 25Δ Put IV: ${putIV.toFixed(0)}%
• ATM IV: ${atmIV.toFixed(0)}%
• 25Δ Call IV: ${callIV.toFixed(0)}%
• Skew: ${pcSkew >= 0 ? '+' : ''}${pcSkew.toFixed(1)}%
        </div>
      `;
    } else {
      // Reset to static default
      const defaultTip = TEACHING_TIPS.skew;
      skewTip.innerHTML = `
        <div class="tip-title">${defaultTip.title}</div>
        <div class="tip-short">${defaultTip.short}</div>
        <div class="tip-detail">${defaultTip.detail}</div>
      `;
      if (skewHint) {
        skewHint.textContent = 'Load a ticker to see skew';
        skewHint.style.color = '#94a3b8';
      }
    }
  }

  // Expected Move tooltip - ACTIONABLE DATA INTERPRETATION
  const expMoveTip = document.getElementById('sectionTip_expectedMove');
  if (expMoveTip) {
    if (ticker && spotPrice && avgIV) {
      const daily = spotPrice * (avgIV / 100) * Math.sqrt(1 / 365);
      const weekly = spotPrice * (avgIV / 100) * Math.sqrt(7 / 365); // 7 calendar days
      const monthly = spotPrice * (avgIV / 100) * Math.sqrt(30 / 365); // 30 calendar days

      const dailyPct = (daily / spotPrice * 100).toFixed(2);
      const weeklyPct = (weekly / spotPrice * 100).toFixed(2);
      const monthlyPct = (monthly / spotPrice * 100).toFixed(2);

      const straddleCost = weekly * 0.8;
      const straddlePct = (straddleCost / spotPrice * 100).toFixed(1);

      const upperWeekly = (spotPrice + weekly).toFixed(2);
      const lowerWeekly = (spotPrice - weekly).toFixed(2);

      expMoveTip.innerHTML = `
        <div class="tip-title">${ticker}: EXPECTED RANGE THIS WEEK</div>
        <div class="tip-short">$${lowerWeekly} - $${upperWeekly} (68% confidence)</div>
        <div class="tip-detail">
<strong>What This Means:</strong>
Based on ${avgIV.toFixed(0)}% IV, ${ticker} should stay between $${lowerWeekly} and $${upperWeekly} about 68% of the time by Friday.

<strong>Practical Ranges:</strong>
• Today: ±$${daily.toFixed(2)} (±${dailyPct}%)
• This Week: ±$${weekly.toFixed(2)} (±${weeklyPct}%)
• This Month: ±$${monthly.toFixed(2)} (±${monthlyPct}%)

<strong>How to Use This:</strong>
→ IRON CONDOR: Sell wings OUTSIDE $${lowerWeekly}/$${upperWeekly}
→ STRADDLE BUYER: You need ${ticker} to move MORE than ±$${weekly.toFixed(2)} to profit
→ STRADDLE SELLER: You profit if ${ticker} stays INSIDE this range
→ STOP LOSS: Set stops >${weekly.toFixed(2)} away for breathing room

<strong>ATM Straddle Cost:</strong>
≈ $${straddleCost.toFixed(2)}/share (${straddlePct}% of stock price)
→ Buyer needs ${straddlePct}%+ move to break even
        </div>
      `;
    } else {
      const defaultTip = TEACHING_TIPS.expectedMove;
      expMoveTip.innerHTML = `
        <div class="tip-title">${defaultTip.title}</div>
        <div class="tip-short">${defaultTip.short}</div>
        <div class="tip-detail">${defaultTip.detail}</div>
      `;
    }
  }

  // Vol Cone tooltip - ACTIONABLE DATA INTERPRETATION
  const volConeTip = document.getElementById('sectionTip_volCone');
  if (volConeTip) {
    if (ticker && hv30 != null && avgIV != null) {
      const vrp = avgIV - hv30;
      const rvLevel = hv30 > 40 ? 'HIGH' : hv30 > 25 ? 'MODERATE' : 'LOW';

      let actionTitle = '';
      let actionColor = '#94a3b8';
      let whatItMeans = '';
      let howToTrade = '';

      if (vrp > 15) {
        actionColor = '#10b981';
        actionTitle = `${ticker}: OPTIONS ARE EXPENSIVE - SELL PREMIUM`;
        whatItMeans = `IV (${avgIV.toFixed(0)}%) is ${vrp.toFixed(0)} points ABOVE realized vol (${hv30.toFixed(0)}%). The market is pricing in MORE volatility than ${ticker} has actually delivered. You're getting PAID to sell vol.`;
        howToTrade = `→ SELL PREMIUM: Iron condors, strangles, covered calls
→ Edge: You're selling vol at ${avgIV.toFixed(0)}%, stock only moves at ${hv30.toFixed(0)}%
→ Win rate favors sellers here
→ Watch for: earnings, events that could spike RV`;
      } else if (vrp > 5) {
        actionColor = '#a3e635';
        actionTitle = `${ticker}: OPTIONS SLIGHTLY RICH`;
        whatItMeans = `IV (${avgIV.toFixed(0)}%) is ${vrp.toFixed(0)} points above RV (${hv30.toFixed(0)}%). Modest premium selling edge.`;
        howToTrade = `→ Slight edge for premium sellers
→ Not a strong signal alone
→ Combine with term structure/skew for conviction`;
      } else if (vrp < -10) {
        actionColor = '#ef4444';
        actionTitle = `${ticker}: OPTIONS ARE CHEAP - BUY VOL`;
        whatItMeans = `IV (${avgIV.toFixed(0)}%) is ${Math.abs(vrp).toFixed(0)} points BELOW realized vol (${hv30.toFixed(0)}%). Market is UNDERPRICING volatility. ${ticker} has been moving MORE than options imply.`;
        howToTrade = `→ BUY PREMIUM: Straddles, strangles, long options
→ Edge: You're buying vol at ${avgIV.toFixed(0)}%, stock moves at ${hv30.toFixed(0)}%
→ Even "expensive" looking options may be cheap
→ Great for gamma scalping`;
      } else if (vrp < -3) {
        actionColor = '#fbbf24';
        actionTitle = `${ticker}: OPTIONS SLIGHTLY CHEAP`;
        whatItMeans = `IV (${avgIV.toFixed(0)}%) is ${Math.abs(vrp).toFixed(0)} points below RV (${hv30.toFixed(0)}%). Modest edge for vol buyers.`;
        howToTrade = `→ Slight edge for premium buyers
→ Long options have tailwind
→ Combine with direction for best trades`;
      } else {
        actionTitle = `${ticker}: FAIR VALUE - NO VRP EDGE`;
        whatItMeans = `IV (${avgIV.toFixed(0)}%) ≈ RV (${hv30.toFixed(0)}%). Options are fairly priced relative to recent realized volatility.`;
        howToTrade = `→ No edge from vol mispricing
→ Trade on direction, not vol view
→ Focus on skew/structure instead`;
      }

      volConeTip.innerHTML = `
        <div class="tip-title" style="color:${actionColor}">${actionTitle}</div>
        <div class="tip-short">IV: ${avgIV.toFixed(0)}% | RV: ${hv30.toFixed(0)}% | VRP: ${vrp >= 0 ? '+' : ''}${vrp.toFixed(0)}%</div>
        <div class="tip-detail">
<strong>What This Means for ${ticker}:</strong>
${whatItMeans}

<strong>How to Trade It:</strong>
${howToTrade}

<strong>Reading the Cone:</strong>
• Red marker = current 30-day realized vol (${hv30.toFixed(0)}%)
• Purple marker = current implied vol (${avgIV.toFixed(0)}%)
• Blue band = where RV typically falls (10th-90th percentile)
${hv30 > 40 ? `\n⚠️ RV is HIGH (${hv30.toFixed(0)}%) - ${ticker} has been volatile. Be careful sizing.` : ''}
        </div>
      `;
    } else {
      // Reset to static default when no data
      const defaultTip = TEACHING_TIPS.volCone;
      volConeTip.innerHTML = `
        <div class="tip-title">${defaultTip.title}</div>
        <div class="tip-short">${defaultTip.short}</div>
        <div class="tip-detail">${defaultTip.detail}</div>
      `;
    }
  }

  // Dealer Positioning tooltip (SIG-Level) - ACTIONABLE DATA INTERPRETATION
  const dealerTip = document.getElementById('sectionTip_dealerPositioning');
  if (dealerTip) {
    if (ticker && gammaAnalysis && gammaAnalysis.regime) {
      const regime = gammaAnalysis.regime;
      const deltaFlow = gammaAnalysis.deltaFlow || {};
      const charm = gammaAnalysis.charm || {};
      const levels = gammaAnalysis.levels || {};
      const gexProfile = gammaAnalysis.gexProfile || {};

      // Format GEX values
      const formatGex = (gex) => {
        if (!gex && gex !== 0) return '--';
        const absGex = Math.abs(gex);
        if (absGex >= 1e9) return (gex / 1e9).toFixed(1) + 'B';
        if (absGex >= 1e6) return (gex / 1e6).toFixed(1) + 'M';
        if (absGex >= 1e3) return (gex / 1e3).toFixed(0) + 'K';
        return gex.toFixed(0);
      };

      const netGex = gexProfile.netGEX || 0;
      const gRatio = parseFloat(gammaAnalysis.callPutGEXRatio) || 0;

      // Build ACTIONABLE interpretation based on current data
      let actionTitle = '';
      let actionColor = '#94a3b8';
      let whatItMeans = '';
      let howToTrade = '';

      if (regime.regime === 'POSITIVE') {
        actionColor = '#10b981';
        actionTitle = `${ticker}: SELL THE RIPS, BUY THE DIPS`;
        whatItMeans = `Dealers are LONG gamma → they sell into rallies, buy into dips. This SUPPRESSES volatility. ${ticker} will likely mean-revert today.`;
        howToTrade = `→ FADE moves toward $${levels.callWall?.toFixed(0) || '--'} (call wall)
→ Iron condors/butterflies WORK in this regime
→ Don't chase breakouts - they'll likely fail
→ Short straddles have tailwind`;
      } else if (regime.regime === 'NEGATIVE_DEEP') {
        actionColor = '#ef4444';
        actionTitle = `${ticker}: DANGER - FOLLOW THE TREND`;
        whatItMeans = `Dealers are deeply SHORT gamma below $${levels.volTrigger?.toFixed(0) || '--'}. Every move forces MORE hedging in the SAME direction. Moves ACCELERATE here.`;
        howToTrade = `→ DO NOT fade moves - breakouts are REAL
→ If it breaks $${levels.putWall?.toFixed(0) || '--'}, expect acceleration
→ Straddles/strangles may pay off
→ Short premium is DANGEROUS here`;
      } else if (regime.regime === 'NEGATIVE') {
        actionColor = '#f59e0b';
        actionTitle = `${ticker}: MOMENTUM MODE - BE DIRECTIONAL`;
        whatItMeans = `Dealers are SHORT gamma → hedging AMPLIFIES moves. ${ticker} is more likely to trend than mean-revert today.`;
        howToTrade = `→ Trade WITH momentum, not against
→ Breakout above $${levels.callWall?.toFixed(0) || '--'} = chase it
→ Breakdown below $${levels.putWall?.toFixed(0) || '--'} = don't catch the knife
→ Directional plays > premium selling`;
      } else {
        actionTitle = `${ticker}: NO CLEAR EDGE FROM POSITIONING`;
        whatItMeans = `Near gamma-neutral. Dealer hedging won't strongly push price either way.`;
        howToTrade = `→ Trade on fundamentals/technicals instead
→ No strong gamma tailwind either direction
→ Standard vol assumptions apply`;
      }

      // G-Ratio interpretation
      let gRatioAction = '';
      if (gRatio > 1.5) {
        gRatioAction = `G-Ratio ${gRatio.toFixed(1)}x → Call gamma dominates. $${levels.callWall?.toFixed(0) || '--'} is STRONG resistance.`;
      } else if (gRatio < 0.7 && gRatio > 0) {
        gRatioAction = `G-Ratio ${gRatio.toFixed(1)}x → Put gamma dominates. $${levels.putWall?.toFixed(0) || '--'} support may BREAK if tested.`;
      } else if (gRatio > 0) {
        gRatioAction = `G-Ratio ${gRatio.toFixed(1)}x → Balanced. Neither wall dominates.`;
      }

      // Delta flow interpretation
      let deltaAction = '';
      if (deltaFlow.hedgingPressure) {
        if (deltaFlow.netDelta > 0 && deltaFlow.intensity === 'HIGH') {
          deltaAction = `🟢 ${deltaFlow.hedgingPressure} (${deltaFlow.intensity}) → Bullish pressure from hedging flows today.`;
        } else if (deltaFlow.netDelta < 0 && deltaFlow.intensity === 'HIGH') {
          deltaAction = `🔴 ${deltaFlow.hedgingPressure} (${deltaFlow.intensity}) → Bearish pressure from hedging flows today.`;
        } else {
          deltaAction = `${deltaFlow.hedgingPressure} (${deltaFlow.intensity}) → Moderate hedging impact.`;
        }
      }

      // Charm/pinning interpretation
      let charmAction = '';
      if (charm.pinningStrike && charm.charmPressure !== 'WEAK') {
        const pinDist = ((charm.pinningStrike - spotPrice) / spotPrice * 100).toFixed(1);
        charmAction = `📌 PINNING: ${ticker} likely to gravitate toward $${charm.pinningStrike} by Friday close (${charm.charmPressure} - ${(charm.pinningStrength * 100).toFixed(0)}% near-term OI concentrated here).`;
      }

      dealerTip.innerHTML = `
        <div class="tip-title" style="color:${actionColor}">${actionTitle}</div>
        <div class="tip-short">Net GEX: ${formatGex(netGex)} | ${regime.label} regime</div>
        <div class="tip-detail">
<strong>What This Means for ${ticker} TODAY:</strong>
${whatItMeans}

<strong>How to Trade It:</strong>
${howToTrade}

<strong>Key Levels to Watch:</strong>
• $${levels.callWall?.toFixed(0) || '--'} (${levels.callWallDist || '--'}%) = Call Wall (RESISTANCE)
• $${levels.putWall?.toFixed(0) || '--'} (${levels.putWallDist || '--'}%) = Put Wall (SUPPORT)
• $${levels.volTrigger?.toFixed(0) || '--'} (${levels.volTriggerDist || '--'}%) = Vol Trigger (DANGER if broken)
${gRatioAction ? '\n' + gRatioAction : ''}
${deltaAction ? '\n' + deltaAction : ''}
${charmAction ? '\n' + charmAction : ''}
        </div>
      `;
    } else {
      // Reset to static default
      const defaultTip = TEACHING_TIPS.dealerPositioning;
      dealerTip.innerHTML = `
        <div class="tip-title">${defaultTip.title}</div>
        <div class="tip-short">${defaultTip.short}</div>
        <div class="tip-detail">${defaultTip.detail}</div>
      `;
    }
  }
}

// ============================================
// DYNAMIC HINT UPDATES
// Updates the small hint text below each stat value
// ============================================

function updateDynamicHints(metrics) {
  const { ticker, ivRank, ivPct, hv30, vrp, expMove, pcRatio, volSetup, spotPrice, avgIV } = metrics;

  // IV Rank hint
  const ivRankHint = document.getElementById('optIvRankHint');
  if (ivRankHint && ivRank != null) {
    if (ivRank > 70) {
      ivRankHint.textContent = 'HIGH - sell premium';
      ivRankHint.style.color = '#ef4444';
    } else if (ivRank < 30) {
      ivRankHint.textContent = 'LOW - buy premium';
      ivRankHint.style.color = '#10b981';
    } else {
      ivRankHint.textContent = 'NEUTRAL zone';
      ivRankHint.style.color = '#f59e0b';
    }
  }

  // IV Percentile hint
  const ivPctHint = document.getElementById('optIvPctHint');
  if (ivPctHint && ivPct != null) {
    if (ivPct > 80) {
      ivPctHint.textContent = 'rarely this high';
      ivPctHint.style.color = '#ef4444';
    } else if (ivPct < 20) {
      ivPctHint.textContent = 'rarely this low';
      ivPctHint.style.color = '#10b981';
    } else {
      ivPctHint.textContent = `>${ivPct.toFixed(0)}% of days`;
      ivPctHint.style.color = '#94a3b8';
    }
  }

  // HV30 hint
  const hv30Hint = document.getElementById('optHv30Hint');
  if (hv30Hint && hv30 != null && avgIV != null) {
    const diff = avgIV - hv30;
    if (diff > 10) {
      hv30Hint.textContent = `IV +${diff.toFixed(0)}% above`;
      hv30Hint.style.color = '#ef4444';
    } else if (diff < -5) {
      hv30Hint.textContent = `IV ${diff.toFixed(0)}% below`;
      hv30Hint.style.color = '#10b981';
    } else {
      hv30Hint.textContent = 'IV ≈ HV';
      hv30Hint.style.color = '#94a3b8';
    }
  }

  // VRP hint
  const vrpHint = document.getElementById('optVrpHint');
  if (vrpHint && vrp != null) {
    if (vrp > 15) {
      vrpHint.textContent = 'EXPENSIVE';
      vrpHint.style.color = '#ef4444';
    } else if (vrp > 5) {
      vrpHint.textContent = 'slight seller edge';
      vrpHint.style.color = '#f59e0b';
    } else if (vrp < -10) {
      vrpHint.textContent = 'CHEAP';
      vrpHint.style.color = '#10b981';
    } else if (vrp < 0) {
      vrpHint.textContent = 'slight buyer edge';
      vrpHint.style.color = '#06b6d4';
    } else {
      vrpHint.textContent = 'fair value';
      vrpHint.style.color = '#94a3b8';
    }
  }

  // Expected Move hint
  const expMoveHint = document.getElementById('optExpMoveHint');
  if (expMoveHint && expMove != null && spotPrice) {
    const pct = (expMove / spotPrice * 100).toFixed(1);
    expMoveHint.textContent = `±${pct}% weekly`;
    expMoveHint.style.color = '#94a3b8';
  }

  // P/C Ratio hint - shows timeline + bias
  const pcRatioHint = document.getElementById('optPcRatioHint');
  if (pcRatioHint && pcRatio != null) {
    if (pcRatio > 1.5) {
      pcRatioHint.textContent = 'all exp • heavy puts';
      pcRatioHint.style.color = '#ef4444';
    } else if (pcRatio > 1.0) {
      pcRatioHint.textContent = 'all exp • bearish';
      pcRatioHint.style.color = '#f59e0b';
    } else if (pcRatio < 0.5) {
      pcRatioHint.textContent = 'all exp • heavy calls';
      pcRatioHint.style.color = '#10b981';
    } else if (pcRatio < 0.8) {
      pcRatioHint.textContent = 'all exp • bullish';
      pcRatioHint.style.color = '#06b6d4';
    } else {
      pcRatioHint.textContent = 'all exp • balanced';
      pcRatioHint.style.color = '#94a3b8';
    }
  }

  // Vol Setup hint
  const volSetupHint = document.getElementById('optVolSetupHint');
  if (volSetupHint && volSetup) {
    const setupName = typeof volSetup === 'object' ? volSetup.setup : volSetup;
    if (setupName.includes('SELL') || setupName === 'HIGH_VRP') {
      volSetupHint.textContent = 'sell premium';
      volSetupHint.style.color = '#ef4444';
    } else if (setupName.includes('BUY') || setupName === 'NEGATIVE_VRP') {
      volSetupHint.textContent = 'buy premium';
      volSetupHint.style.color = '#10b981';
    } else {
      volSetupHint.textContent = 'no clear edge';
      volSetupHint.style.color = '#94a3b8';
    }
  }
}
