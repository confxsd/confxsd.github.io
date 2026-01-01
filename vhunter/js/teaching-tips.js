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
      <div class="tip-popup">
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
