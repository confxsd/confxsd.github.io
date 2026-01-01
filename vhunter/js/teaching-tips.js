// VHunter Teaching Tips Module
// Educational content inspired by Moontower.ai / Kris Abdelmessih
// "Options are ALWAYS about vol" - Kris Abdelmessih

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

Key insight: VRP is like a point spread in sports betting. It represents the market's assessment of relative value between buyers and sellers.`,
    moontower: 'The price of an option is primarily about volatility.',
    source: 'Using Options Better - Moontower'
  },

  ivRank: {
    title: 'IV Rank',
    short: 'Where IV sits in its 52-week range',
    detail: `IV Rank = (Current IV - 52wk Low) / (52wk High - 52wk Low) × 100

Example: If IV ranged from 20% to 80% over the past year, and current IV is 50%:
IV Rank = (50-20)/(80-20) = 50%

IV Rank > 50: IV is elevated relative to history
IV Rank < 30: IV is relatively low`,
    moontower: 'Context matters. A 30% IV is high for some stocks and low for others.',
    source: 'IV Rank Primer - Moontower'
  },

  ivPercentile: {
    title: 'IV Percentile',
    short: '% of days IV was lower than today',
    detail: `IV Percentile counts what percentage of days over the past year had lower IV than today.

IV Percentile = 80% means: Current IV is higher than 80% of historical readings.

Why it matters: IV Rank can be skewed by outliers. IV Percentile gives you a cleaner picture of how often IV has been this high.`,
    moontower: 'Both metrics have value. Rank shows range position; Percentile shows frequency.',
    source: 'IV Analytics - Moontower'
  },

  // Win Rates & Expectancy
  straddleWinRate: {
    title: 'Straddle Win Rate Reality',
    short: 'Fairly priced straddle loses 58% of the time',
    detail: `Critical insight from Moontower: In Black-Scholes world, if you buy a straddle at fairly priced vol, your expectancy is zero BUT you expect to lose ~58% of the time.

Why? The most you can lose is the premium paid, but wins are theoretically unlimited. So wins are larger but less frequent.

For sellers: 58% win rate, but each loss can exceed your wins.
For buyers: 42% win rate, but winners are bigger.

Zero expectancy doesn't mean equal outcomes!`,
    moontower: 'Expectancy and win rate are not the same. You should expect to lose more often than you win for your expectancy to be zero since your wins are larger than your losses.',
    source: 'Straddles, Volatility, and Win Rates - Moontower'
  },

  expectedMove: {
    title: 'Expected Move (1 SD)',
    short: 'Range where stock lands 68% of the time',
    detail: `Expected Move = Stock Price × IV × √(Days/365)

This gives you the 1 standard deviation range. Statistically, the stock should stay within this range about 68% of the time.

ATM Straddle ≈ 0.8 × Expected Move

So if expected move is $10, the ATM straddle should cost about $8.`,
    moontower: 'The straddle is the market\'s best guess at how much the stock will move.',
    source: 'Option Pricing Fundamentals - Moontower'
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
If 30-day IV is 42% and 20-day IV is 40%, the 20-30 day forward vol must be HIGHER than 42%.`,
    moontower: 'Volatility term structure from multiple angles shows you where the market\'s concerns are concentrated.',
    source: 'Understanding Implied Forwards - Moontower'
  },

  // Vega & Greeks
  vegaRisk: {
    title: 'Vega Risk Context',
    short: 'Same vega, different risk',
    detail: `Key insight: 100k vega means very different things for 1-week vs 1-year options.

Near-term vols fluctuate more. A 1-week option might see IV move 10 points, while a 1-year option's IV only moves 2 points.

Normalized Vega: Scale vega by √time to compare risk across tenors.

A 4x longer option has 2x the vega, but if short-term IV is twice as volatile, they carry EQUAL practical risk.`,
    moontower: 'Vega ≠ Vega Risk. Risk requires considering both vega magnitude AND volatility of volatility.',
    source: 'Understanding Vega Risk - Moontower'
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
If RV > IV, gamma profits exceed theta decay = profit.`,
    moontower: 'After stripping out delta, an option\'s return becomes a function of both implied and realized volatility.',
    source: 'Dynamic Hedging & P/L Decomposition - Moontower'
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

Use all three lenses before trading.`,
    moontower: 'A durable way of seeing based on lots of pain. This is the stuff of salt mines. The way traders think.',
    source: 'Primer Framework - Moontower'
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

Knowing your edge keeps you from drifting.`,
    moontower: 'Having a clear P/L driver keeps you from drifting into a driver that you didn\'t have an opinion on.',
    source: 'Trade Expressions & Structures - Moontower'
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

Skew flattening often precedes big moves.`,
    moontower: 'Skew "corrects" theoretical distributions to match real market behavior.',
    source: 'Option Education Screencast - Moontower'
  },

  // Risk Management
  positionSizing: {
    title: 'Position Sizing',
    short: 'Trade small as you learn',
    detail: `Kris's rule: "If you are uncomfortable you are too big."

Work backward from acceptable risk:
1. Define max loss you can tolerate
2. Calculate position size from that
3. NOT the other way around

Don't size from "how much premium can I collect."
Size from "how much can I afford to lose."`,
    moontower: 'Trade small as you learn. If you are uncomfortable you are too big.',
    source: 'VRP Trading Mission - Moontower'
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

Evaluate covered calls the same way you'd evaluate any vol trade.`,
    moontower: 'Evaluate covered call suitability the same way you\'d evaluate any volatility trade—based on whether implied volatility justifies the premium.',
    source: 'VRP Trading Mission - Moontower'
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

This creates a RANGE of possible VRPs, not a single reference. Professional traders monitor all windows.`,
    moontower: 'A stock showing 16% daily realized vol might display 35% when measured weekly, or 78% when annualizing point-to-point moves.',
    source: 'Option Market Point Spread - Moontower'
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
3. Identify when IV is mispriced vs RV`,
    moontower: 'The standard deviation of realized volatility itself declines as the sampling period lengthens.',
    source: 'Volatility Cones - Moontower'
  },

  // Path Dependence
  pathDependence: {
    title: 'Path Dependence',
    short: 'How you get there matters',
    detail: `Options are path dependent:
A stock going from 100 to 110 in a straight line vs whipsawing wildly to 110 produce VERY different option P&Ls.

Gamma scalpers profit from whipsaw.
Theta collectors hate it.

Even "right" directional calls can lose money if the path is wrong or IV collapses.`,
    moontower: 'If you sold that $150 strike call for $6 you still lose 10% of the time even if the long-run expectancy is positive.',
    source: 'VRP Trading - Moontower'
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

The market's current valuation matters more than what you paid.`,
    moontower: 'Exit if your thesis dissolves, regardless of current P&L. The market\'s valuation matters more than your entry price.',
    source: 'VRP Trading Mission - Moontower'
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
        ${tip.moontower ? `<div class="tip-quote">"${tip.moontower}"</div>` : ''}
        <div class="tip-source">- ${tip.source}</div>
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

export function getMoontowerQuote(tipKey) {
  const tip = TEACHING_TIPS[tipKey];
  return tip?.moontower || '';
}

// ============================================
// WIN RATE CALCULATOR
// ============================================

export function getStraddleWinRateInfo(straddlePct) {
  // Based on Moontower: Fair straddle loses ~58% of the time
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
    advice,
    moontower: 'Trade small as you learn. If you are uncomfortable you are too big.'
  };
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
