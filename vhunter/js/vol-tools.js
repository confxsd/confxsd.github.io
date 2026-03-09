// VHunter Volatility Tools Module
// Advanced volatility analytics for options trading
import * as finMath from './financial-math.js';

// ============================================
// STRADDLE & EXPECTED MOVE CALCULATIONS
// Using standardized calculations from financial-math.js
// ============================================

// ATM Straddle Approximation: Straddle = 0.8 × S × σ × √T
export function calcStraddlePrice(spotPrice, iv, daysToExpiry) {
  return finMath.calcStraddlePrice(spotPrice, iv, daysToExpiry);
}

// Expected Move (1 SD): EM = S × σ × √T
export function calcExpectedMove(spotPrice, iv, daysToExpiry) {
  return finMath.calcExpectedMove(spotPrice, iv, daysToExpiry);
}

// Expected Move as percentage
export function calcExpectedMovePct(iv, daysToExpiry) {
  return finMath.calcExpectedMovePercent(iv, daysToExpiry);
}

// Derive IV from straddle price using 0.798 coefficient (ATM BS approximation)
export function calcIVFromStraddle(straddlePrice, spotPrice, daysToExpiry) {
  const timeYears = daysToExpiry / 365;
  if (timeYears <= 0 || spotPrice <= 0) return 0;
  // ATM straddle ≈ 0.798 × S × σ × √T (from Black-Scholes)
  return (straddlePrice / (0.798 * spotPrice * Math.sqrt(timeYears))) * 100;
}

// Daily expected move from IV
export function calcDailyMove(iv) {
  return finMath.calcDailyMove(iv);
}

// ============================================
// EARNINGS VOLATILITY EXTRACTION
// Using variance additivity: (Term σ)² × T = (Base σ)² × (T-1) + (Event σ)² × 1
// ============================================

export function extractEarningsVol(termIV, daysToExpiry, baseIV = null, daysToEarnings = null) {
  // If no base IV provided, estimate from typical vol ratio
  if (baseIV === null) {
    // Assume base vol is ~70% of term vol as starting estimate
    baseIV = termIV * 0.7;
  }

  // Default: earnings is on the last day before expiry
  const eventDays = 1;
  const regularDays = daysToExpiry - eventDays;

  if (regularDays <= 0) {
    return {
      eventVol: termIV,
      eventMove: calcDailyMove(termIV) * 0.8,
      varianceWeight: 100
    };
  }

  // Variance additivity: termVar × T = baseVar × regularDays + eventVar × eventDays
  const termVar = Math.pow(termIV / 100, 2);
  const baseVar = Math.pow(baseIV / 100, 2);

  // Solve for event variance
  const totalTermVar = termVar * daysToExpiry;
  const totalBaseVar = baseVar * regularDays;
  const eventVar = (totalTermVar - totalBaseVar) / eventDays;

  if (eventVar <= 0) {
    return {
      eventVol: 0,
      eventMove: 0,
      varianceWeight: 0,
      error: 'Base vol too high for term vol'
    };
  }

  const eventVol = Math.sqrt(eventVar) * 100; // Annualized event vol
  const dailyEventVol = eventVol / Math.sqrt(365); // Daily event vol (annualized / sqrt(365), calendar days for consistency)
  const expectedMove = dailyEventVol; // 1-SD daily expected move (percentage)

  // Variance weight: how much of total variance is from the event?
  const varianceWeight = (eventVar * eventDays) / totalTermVar * 100;

  return {
    eventVol: eventVol.toFixed(1),
    dailyEventVol: dailyEventVol.toFixed(2),
    expectedMove: expectedMove.toFixed(2),
    varianceWeight: varianceWeight.toFixed(1),
    regularDays,
    baseIV
  };
}

// ============================================
// SKEW ANALYSIS
// ============================================

// Normalized skew: (OTM IV / ATM IV) - 1
export function calcNormalizedSkew(otmIV, atmIV) {
  if (!atmIV || atmIV === 0) return null;
  return ((otmIV / atmIV) - 1) * 100;
}

// Put-Call skew difference
export function calcPutCallSkew(put25dIV, call25dIV, atmIV) {
  const putSkew = calcNormalizedSkew(put25dIV, atmIV);
  const callSkew = calcNormalizedSkew(call25dIV, atmIV);
  return {
    putSkew,
    callSkew,
    skewDiff: putSkew - callSkew, // Positive = put skew higher (normal)
    interpretation: putSkew > callSkew ? 'NORMAL (put premium)' :
      putSkew < callSkew ? 'INVERTED (call premium)' : 'FLAT'
  };
}

// ============================================
// MULTI-WINDOW VRP ANALYSIS
// Compare IV vs RV across multiple lookback windows
// ============================================

export function calcMultiWindowVRP(iv, data) {
  if (!data || data.length < 60) {
    return { error: 'Insufficient price history' };
  }

  // Use standardized RV calculation from financial-math module
  // Accepts either OHLC bars or close prices (Yang-Zhang when available)
  const windows = finMath.calcRealizedVolatilityMulti(data);

  // Calculate VRP for each window
  const vrp = {};
  Object.entries(windows).forEach(([key, rv]) => {
    if (rv !== null) {
      vrp[key.replace('rv', 'vrp')] = iv - rv;
    }
  });

  // Find which window shows most extreme VRP
  const vrpValues = Object.values(vrp).filter(v => v !== null);
  const avgVRP = vrpValues.reduce((a, b) => a + b, 0) / vrpValues.length;

  // Trend detection: is short-term RV diverging from long-term?
  const shortTermRV = windows.rv5 || windows.rv10;
  const longTermRV = windows.rv30 || windows.rv60;
  let volTrend = 'STABLE';
  if (shortTermRV && longTermRV) {
    const diff = shortTermRV - longTermRV;
    if (diff > 10) volTrend = 'EXPANDING';
    else if (diff < -10) volTrend = 'CONTRACTING';
  }

  return {
    iv,
    ...windows,
    ...vrp,
    avgVRP,
    volTrend,
    // Best window to use
    bestWindow: windows.rv10 !== null ? 'rv10' : 'rv30',
    signal: avgVRP > 10 ? 'SELL_PREMIUM' :
      avgVRP < -5 ? 'BUY_PREMIUM' : 'NEUTRAL'
  };
}

// ============================================
// VOLATILITY CONE
// Shows typical RV ranges for different lookback periods
// ============================================

export function buildVolatilityCone(data, currentIV) {
  // Reduced requirement to 60 days for more practical use
  if (!data || data.length < 60) {
    return { error: 'Need at least 60 days of data for volatility cone' };
  }

  // Calculate RV for each window at each historical point
  const windows = [5, 10, 20, 30, 60];
  const cone = {};

  windows.forEach(window => {
    const rvSeries = [];
    for (let i = window + 1; i <= data.length; i++) {
      // Use standardized RV calculation (Yang-Zhang when OHLC available)
      const slice = data.slice(0, i);
      const rv = finMath.calcRealizedVolatility(slice, window);
      if (rv !== null) {
        rvSeries.push(rv);
      }
    }

    // Calculate percentiles
    if (rvSeries.length === 0) {
      cone[`${window}d`] = { current: null, p10: null, p25: null, p50: null, p75: null, p90: null, percentile: null, vsIV: null };
      return;
    }
    const sorted = [...rvSeries].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const current = rvSeries[rvSeries.length - 1];

    // Where does current RV sit?
    const percentile = (sorted.filter(v => v < current).length / sorted.length) * 100;

    cone[`${window}d`] = {
      current,
      p10,
      p25,
      p50,
      p75,
      p90,
      percentile,
      vsIV: currentIV - current
    };
  });

  return {
    cone,
    currentIV,
    interpretation: interpretVolCone(cone, currentIV)
  };
}

function interpretVolCone(cone, iv) {
  const signals = [];

  // Check each window
  Object.entries(cone).forEach(([period, data]) => {
    if (data.percentile < 20) {
      signals.push(`${period} RV at low extreme (${data.percentile.toFixed(0)}%ile)`);
    } else if (data.percentile > 80) {
      signals.push(`${period} RV elevated (${data.percentile.toFixed(0)}%ile)`);
    }

    if (data.vsIV > 15) {
      signals.push(`IV ${data.vsIV.toFixed(0)}pts above ${period} RV - expensive`);
    } else if (data.vsIV < -10) {
      signals.push(`IV ${Math.abs(data.vsIV).toFixed(0)}pts below ${period} RV - cheap`);
    }
  });

  return signals.length > 0 ? signals : ['Volatility within normal ranges'];
}

// ============================================
// STRADDLE WIN RATE ANALYSIS
// ============================================

export function calcStraddleStats(iv, daysToExpiry, spotPrice) {
  const straddle = calcStraddlePrice(spotPrice, iv, daysToExpiry);
  const straddlePct = (straddle / spotPrice) * 100;
  const expectedMove = calcExpectedMove(spotPrice, iv, daysToExpiry);
  const expectedMovePct = (expectedMove / spotPrice) * 100;

  // Break-even move needed
  const breakeven = straddlePct;

  // Dynamic win rate based on straddle vs expected move
  // Base: 42% buyer / 58% seller for fairly priced straddle
  // Ratio < 1: straddle cheap vs expected move → buyer edge
  // Ratio > 1: straddle expensive vs expected move → seller edge
  const ratio = straddle / expectedMove;
  const baseWinRate = 42;

  // Adjust win rate: ~5% shift per 0.1 deviation from fair (capped)
  const adjustment = Math.min(15, Math.max(-15, (1 - ratio) * 50));
  const buyerWinRate = Math.round(baseWinRate + adjustment);
  const sellerWinRate = 100 - buyerWinRate;

  // Generate insight based on pricing
  let insight;
  if (ratio < 0.9) {
    insight = `Straddle is CHEAP vs expected move (${(ratio * 100).toFixed(0)}%). Buyer edge: wins ${buyerWinRate}% of the time with larger payoffs.`;
  } else if (ratio > 1.1) {
    insight = `Straddle is EXPENSIVE vs expected move (${(ratio * 100).toFixed(0)}%). Seller edge: wins ${sellerWinRate}% of the time.`;
  } else {
    insight = `Fairly priced straddle. Buyers win ${buyerWinRate}% but wins are larger. Zero expectancy ≠ equal outcomes!`;
  }

  return {
    straddlePrice: straddle.toFixed(2),
    straddlePct: straddlePct.toFixed(2),
    expectedMove: expectedMove.toFixed(2),
    expectedMovePct: expectedMovePct.toFixed(2),
    breakeven: breakeven.toFixed(2),
    buyerWinRate,
    sellerWinRate,
    payoffRatio: ratio.toFixed(2),
    insight,
    interpretation: `Need ${breakeven.toFixed(1)}% move to break even. ~${buyerWinRate}% buyer win rate.`
  };
}

// ============================================
// TERM STRUCTURE ANALYSIS
// ============================================

export function analyzeTermStructure(weeklyIV, monthlyIV, quarterlyIV, sixMonthIV) {
  const ivs = [
    { period: 'weekly', iv: weeklyIV, days: 7 },
    { period: 'monthly', iv: monthlyIV, days: 30 },
    { period: 'quarterly', iv: quarterlyIV, days: 90 },
    { period: 'sixMonth', iv: sixMonthIV, days: 180 }
  ].filter(x => x.iv != null);

  if (ivs.length < 2) return { error: 'Need at least 2 expirations' };

  // Calculate term structure slope
  const front = ivs[0];
  const back = ivs[ivs.length - 1];
  const slope = ((back.iv - front.iv) / front.iv) * 100;

  // Contango (normal): back > front
  // Backwardation (fear): front > back
  let structure = 'FLAT';
  if (slope > 5) structure = 'CONTANGO';
  else if (slope < -5) structure = 'BACKWARDATION';

  // Forward volatility between periods
  const forwards = [];
  for (let i = 1; i < ivs.length; i++) {
    const prev = ivs[i - 1];
    const curr = ivs[i];

    // Forward variance: (σ₂² × T₂ - σ₁² × T₁) / (T₂ - T₁)
    const prevVar = Math.pow(prev.iv / 100, 2) * (prev.days / 365);
    const currVar = Math.pow(curr.iv / 100, 2) * (curr.days / 365);
    const forwardVar = (currVar - prevVar) / ((curr.days - prev.days) / 365);

    if (forwardVar > 0) {
      const forwardIV = Math.sqrt(forwardVar) * 100;
      forwards.push({
        period: `${prev.period}-${curr.period}`,
        forwardIV: forwardIV.toFixed(1)
      });
    }
  }

  return {
    structure,
    slope: slope.toFixed(1),
    frontIV: front.iv.toFixed(1),
    backIV: back.iv.toFixed(1),
    forwards,
    signal: structure === 'BACKWARDATION' ? 'FEAR_ELEVATED' :
      structure === 'CONTANGO' && slope > 15 ? 'COMPLACENT' : 'NORMAL',
    tradingImplication: structure === 'BACKWARDATION' ?
      'Front-month premium elevated. Calendar spreads less attractive.' :
      structure === 'CONTANGO' && slope > 10 ?
        'Back months expensive. Short calendars or ratio spreads.' :
        'Normal term structure. Standard strategies apply.'
  };
}

// ============================================
// POSITION P&L ATTRIBUTION
// ============================================

export function attributePnL(position, priceChange, ivChange, daysElapsed, greeks) {
  const { delta, gamma, theta, vega } = greeks;

  // Delta P&L: Δ × ΔS
  const deltaPnL = delta * priceChange;

  // Gamma P&L: 0.5 × Γ × ΔS²
  const gammaPnL = 0.5 * gamma * Math.pow(priceChange, 2);

  // Theta P&L: Θ × days
  const thetaPnL = theta * daysElapsed;

  // Vega P&L: ν × ΔIV
  const vegaPnL = vega * ivChange;

  const totalPnL = deltaPnL + gammaPnL + thetaPnL + vegaPnL;

  return {
    deltaPnL: deltaPnL.toFixed(2),
    gammaPnL: gammaPnL.toFixed(2),
    thetaPnL: thetaPnL.toFixed(2),
    vegaPnL: vegaPnL.toFixed(2),
    totalPnL: totalPnL.toFixed(2),
    // Attribution percentages
    deltaContrib: totalPnL !== 0 ? ((deltaPnL / totalPnL) * 100).toFixed(0) : '0',
    gammaContrib: totalPnL !== 0 ? ((gammaPnL / totalPnL) * 100).toFixed(0) : '0',
    thetaContrib: totalPnL !== 0 ? ((thetaPnL / totalPnL) * 100).toFixed(0) : '0',
    vegaContrib: totalPnL !== 0 ? ((vegaPnL / totalPnL) * 100).toFixed(0) : '0'
  };
}

// ============================================
// TRADE IDEA GENERATOR
// Combines multiple signals into trade recommendations
// ============================================

export function generateVolTradeIdeas(metrics) {
  const { iv, ivRank, vrp, termStructure, skew, pcRatio } = metrics;
  const ideas = [];

  // High VRP + High IV Rank = Sell premium
  if (vrp > 10 && ivRank > 60) {
    ideas.push({
      strategy: 'SELL_STRADDLE',
      conviction: 'HIGH',
      rationale: `VRP of +${vrp.toFixed(0)}% with IV Rank at ${ivRank.toFixed(0)}%. Options expensive.`,
      structure: 'Short ATM straddle or iron condor',
      risk: 'Large directional move or vol spike'
    });
  }

  // Low VRP + Low IV Rank = Buy premium
  if (vrp < 0 && ivRank < 30) {
    ideas.push({
      strategy: 'BUY_STRADDLE',
      conviction: 'MEDIUM',
      rationale: `VRP of ${vrp.toFixed(0)}% with IV Rank at ${ivRank.toFixed(0)}%. Options cheap.`,
      structure: 'Long ATM straddle or strangle',
      risk: 'Time decay if no move materializes'
    });
  }

  // Steep term structure = Short calendar
  if (termStructure?.slope > 15) {
    ideas.push({
      strategy: 'SHORT_CALENDAR',
      conviction: 'MEDIUM',
      rationale: `Term structure ${termStructure.slope}% steep. Back months overpriced.`,
      structure: 'Sell back month, buy front month at same strike',
      risk: 'Term structure steepens further'
    });
  }

  // Backwardation = Long calendar
  if (termStructure?.structure === 'BACKWARDATION') {
    ideas.push({
      strategy: 'LONG_CALENDAR',
      conviction: 'MEDIUM',
      rationale: 'Inverted term structure. Front month elevated on fear.',
      structure: 'Sell front month, buy back month at same strike',
      risk: 'Near-term event causes further inversion'
    });
  }

  // High put skew + bearish flow
  if (skew?.putSkew > 10 && pcRatio > 1.3) {
    ideas.push({
      strategy: 'PUT_SPREAD',
      conviction: 'MEDIUM',
      rationale: 'Elevated put skew with bearish flow. Put spreads benefit from skew.',
      structure: 'Bear put spread (buy higher strike put, sell lower strike put)',
      risk: 'Market rallies or skew flattens'
    });
  }

  return ideas.length > 0 ? ideas : [{
    strategy: 'NO_CLEAR_SETUP',
    conviction: 'LOW',
    rationale: 'No obvious vol mispricing detected. Wait for better opportunity.',
    structure: 'Stay flat or use defined-risk directional trades',
    risk: 'Opportunity cost'
  }];
}
