// Technical Indicators Module
import * as finMath from './financial-math.js';
import { estimateGamma as estimateGammaFromBS } from './gamma.js';

export function average(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function calcRSI(prices, period) {
  const result = [];
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    change > 0 ? gains += change : losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.001)));

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
    result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.001)));
  }

  return result;
}

export function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calcMACD(prices) {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

export function calcATR(data, period) {
  const tr = [0];
  for (let i = 1; i < data.length; i++) {
    tr.push(Math.max(
      data[i].h - data[i].l,
      Math.abs(data[i].h - data[i - 1].c),
      Math.abs(data[i].l - data[i - 1].c)
    ));
  }

  const result = [];
  for (let i = 0; i < tr.length; i++) {
    result.push(i >= period ? average(tr.slice(i - period + 1, i + 1)) : null);
  }
  return result;
}

export function calcMFI(data, period) {
  const result = [null];

  for (let i = 1; i < data.length; i++) {
    if (i < period) {
      result.push(null);
      continue;
    }

    const slice = [];
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (data[j].h + data[j].l + data[j].c) / 3;
      const prevTp = (data[j - 1].h + data[j - 1].l + data[j - 1].c) / 3;
      slice.push({
        pos: tp > prevTp ? tp * data[j].v : 0,
        neg: tp < prevTp ? tp * data[j].v : 0
      });
    }

    const posFlow = slice.reduce((s, x) => s + x.pos, 0);
    const negFlow = slice.reduce((s, x) => s + x.neg, 0);
    result.push(100 - 100 / (1 + posFlow / (negFlow || 1)));
  }

  return result;
}

export function calcADX(data, period) {
  // Standard Wilder ADX (matches TradingView)
  // Step 1: Calculate raw +DM, -DM, TR for each bar
  const rawPDM = [], rawMDM = [], rawTR = [];
  for (let i = 1; i < data.length; i++) {
    const upMove = data[i].h - data[i - 1].h;
    const downMove = data[i - 1].l - data[i].l;
    rawPDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    rawMDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    rawTR.push(Math.max(
      data[i].h - data[i].l,
      Math.abs(data[i].h - data[i - 1].c),
      Math.abs(data[i].l - data[i - 1].c)
    ));
  }

  const n = rawPDM.length;
  const pdi = [], mdi = [], adx = [];

  // Step 2: Wilder smooth +DM, -DM, TR (running sum method)
  // First value = sum of first `period` values
  // Subsequent = prev - prev/period + current
  let sPDM = 0, sMDM = 0, sTR = 0;
  const dxValues = [];

  for (let i = 0; i < n; i++) {
    if (i < period) {
      // Accumulate first period
      sPDM += rawPDM[i];
      sMDM += rawMDM[i];
      sTR += rawTR[i];
      if (i < period - 1) {
        pdi.push(null);
        mdi.push(null);
        dxValues.push(null);
      } else {
        // First smoothed DI values
        const p = sTR > 0 ? 100 * sPDM / sTR : 0;
        const m = sTR > 0 ? 100 * sMDM / sTR : 0;
        pdi.push(p);
        mdi.push(m);
        dxValues.push((p + m) > 0 ? 100 * Math.abs(p - m) / (p + m) : 0);
      }
    } else {
      // Wilder smoothing: smooth = prev - prev/period + current
      sPDM = sPDM - sPDM / period + rawPDM[i];
      sMDM = sMDM - sMDM / period + rawMDM[i];
      sTR = sTR - sTR / period + rawTR[i];
      const p = sTR > 0 ? 100 * sPDM / sTR : 0;
      const m = sTR > 0 ? 100 * sMDM / sTR : 0;
      pdi.push(p);
      mdi.push(m);
      dxValues.push((p + m) > 0 ? 100 * Math.abs(p - m) / (p + m) : 0);
    }
  }

  // Step 3: Smooth DX into ADX using same Wilder method
  let adxSmooth = 0;
  let validDX = 0;
  for (let i = 0; i < dxValues.length; i++) {
    if (dxValues[i] === null) {
      adx.push(null);
    } else {
      validDX++;
      if (validDX <= period) {
        adxSmooth += dxValues[i];
        if (validDX < period) {
          adx.push(null);
        } else {
          adxSmooth = adxSmooth / period; // First ADX = simple average
          adx.push(adxSmooth);
        }
      } else {
        adxSmooth = (adxSmooth * (period - 1) + dxValues[i]) / period;
        adx.push(adxSmooth);
      }
    }
  }

  return { pdi, mdi, adx };
}

export function calcADL(data, debug = false) {
  const adl = [];
  let cumulative = 0;

  if (debug) {
    console.log('=== A/D Line Debug (first 10 bars) ===');
    console.log('Date, Open, High, Low, Close, Volume, MFV, ADL');
  }

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const range = bar.h - bar.l;
    // MFV = Volume * (2*Close - High - Low) / (High - Low)
    // When High = Low (flat bar), MFV = 0
    const mfv = range === 0 ? 0 : bar.v * (2 * bar.c - bar.h - bar.l) / range;
    cumulative += mfv;
    adl.push(cumulative);

    if (debug && i < 10) {
      const date = bar.t ? new Date(bar.t).toISOString().split('T')[0] : i;
      console.log(`${date}, ${bar.o}, ${bar.h}, ${bar.l}, ${bar.c}, ${bar.v}, ${mfv.toFixed(0)}, ${cumulative.toFixed(0)}`);
    }
  }

  return adl;
}

export function calcBollingerBands(prices, period = 20) {
  const upper = [], middle = [], lower = [];

  for (let i = 0; i < prices.length; i++) {
    if (i >= period - 1) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = average(slice);
      const std = Math.sqrt(slice.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / period);
      middle.push(mean);
      upper.push(mean + 2 * std);
      lower.push(mean - 2 * std);
    } else {
      middle.push(null);
      upper.push(null);
      lower.push(null);
    }
  }

  return { upper, middle, lower };
}

export function calcSMA(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    result.push(i >= period - 1 ? average(prices.slice(i - period + 1, i + 1)) : null);
  }
  return result;
}

// ============================================
// VOLATILITY RISK PREMIUM (VRP) ANALYTICS
// ============================================

// Calculate Realized Volatility using standardized calculation
// Uses Yang-Zhang when OHLC bars provided, close-to-close otherwise
// Wrapper around financial-math for backwards compatibility
export function calcRealizedVol(data, window = 30) {
  return finMath.calcRealizedVolatility(data, window);
}

// Calculate multiple RV windows for comparison
// Wrapper around financial-math for backwards compatibility
export function calcRealizedVolMulti(prices) {
  return finMath.calcRealizedVolatilityMulti(prices);
}

// VRP = IV - RV (positive = options expensive, negative = cheap)
// Wrapper around financial-math for backwards compatibility
export function calcVRP(impliedVol, realizedVol) {
  return finMath.calcVRP(impliedVol, realizedVol);
}

// VRP as percentage of IV
// Wrapper around financial-math for backwards compatibility
export function calcVRPRatio(impliedVol, realizedVol) {
  return finMath.calcVRPRatio(impliedVol, realizedVol);
}

// IV Rank: Where is current IV relative to 52-week range?
// Wrapper around financial-math for backwards compatibility
export function calcIVRank(currentIV, ivHistory) {
  return finMath.calcIVRank(currentIV, ivHistory);
}

// IV Percentile: What % of historical IV readings are below current?
// Wrapper around financial-math for backwards compatibility
export function calcIVPercentile(currentIV, ivHistory) {
  return finMath.calcIVPercentile(currentIV, ivHistory);
}

// Term Structure Steepness: (Back month IV - Front month IV) / Front month IV
// Wrapper around financial-math for backwards compatibility
export function calcTermSteepness(frontIV, backIV) {
  return finMath.calcTermSteepness(frontIV, backIV);
}

// Classify volatility trade setup based on VRP metrics
export function classifyVolSetup(metrics) {
  const { ivRank, vrp, rvRank, termSteepness, iv } = metrics;

  // If no VRP data at all, we can't classify
  if (vrp == null) {
    return { setup: 'NO_DATA', confidence: 0, description: 'Awaiting volatility data' };
  }

  // Use estimated IV rank if not available (based on typical IV ranges)
  // Most stocks: 15-50% IV is normal, <15% is low, >50% is high
  let effectiveIvRank = ivRank;
  if (ivRank == null && iv != null) {
    // Estimate based on absolute IV levels
    if (iv > 80) effectiveIvRank = 95;
    else if (iv > 60) effectiveIvRank = 80;
    else if (iv > 45) effectiveIvRank = 65;
    else if (iv > 30) effectiveIvRank = 50;
    else if (iv > 20) effectiveIvRank = 35;
    else if (iv > 15) effectiveIvRank = 20;
    else effectiveIvRank = 10;
  }

  // If still no IV rank, use VRP-only classification
  if (effectiveIvRank == null) {
    // VRP-only signals
    if (vrp > 15) {
      return {
        setup: 'HIGH_VRP',
        confidence: 70,
        description: `VRP +${vrp.toFixed(0)}% - Options expensive vs realized. Sell premium.`,
        action: 'SELL_PREMIUM'
      };
    }
    if (vrp > 8) {
      return {
        setup: 'MODERATE_VRP',
        confidence: 55,
        description: `VRP +${vrp.toFixed(0)}% - Slight premium in options.`,
        action: 'LEAN_SELL'
      };
    }
    if (vrp < -10) {
      return {
        setup: 'NEGATIVE_VRP',
        confidence: 70,
        description: `VRP ${vrp.toFixed(0)}% - Options cheap vs realized. Buy premium.`,
        action: 'BUY_PREMIUM'
      };
    }
    if (vrp < -3) {
      return {
        setup: 'LOW_VRP',
        confidence: 50,
        description: `VRP ${vrp.toFixed(0)}% - Slight discount in options.`,
        action: 'LEAN_BUY'
      };
    }
    return {
      setup: 'NEUTRAL',
      confidence: 40,
      description: 'VRP near zero. No vol edge. Building IV history...',
      action: 'WAIT'
    };
  }

  const ivRankToUse = effectiveIvRank;

  // Long Calendar: High VRP + Low IV + Flat term structure
  // "IV is cheap but options are rich relative to RV - sell front month"
  if (ivRankToUse < 35 && vrp > 5 && Math.abs(termSteepness || 0) < 10) {
    return {
      setup: 'LONG_CALENDAR',
      confidence: Math.min(100, 50 + (30 - ivRankToUse) + vrp),
      description: 'Low IV + High VRP + Flat term. Sell front month, buy back month.',
      action: 'SELL_FRONT_BUY_BACK'
    };
  }

  // Sell Vega: High VRP + High IV + High RV
  // "Everything is volatile but options are even more expensive - sell premium"
  if (ivRankToUse > 60 && vrp > 8 && (rvRank || 50) > 40) {
    return {
      setup: 'SELL_VEGA',
      confidence: Math.min(100, 40 + ivRankToUse * 0.3 + vrp),
      description: 'High IV + High VRP. Options expensive. Sell premium (strangles, iron condors).',
      action: 'SELL_PREMIUM'
    };
  }

  // Buy Gamma/Vega: Low VRP + Low IV + Low RV (coiled spring)
  // "Nothing is priced - cheap options before potential move"
  if (ivRankToUse < 25 && vrp < 3 && (rvRank || 50) < 30) {
    return {
      setup: 'BUY_GAMMA',
      confidence: Math.min(100, 60 + (25 - ivRankToUse) + (3 - vrp) * 5),
      description: 'Coiled spring. Low IV, low RV, low VRP. Buy cheap options.',
      action: 'BUY_STRADDLE'
    };
  }

  // Short Calendar: Low VRP + High IV + Steep term structure
  // "Back months are too expensive relative to fronts"
  if (ivRankToUse > 50 && vrp < 5 && (termSteepness || 0) > 15) {
    return {
      setup: 'SHORT_CALENDAR',
      confidence: Math.min(100, 40 + (termSteepness || 0) * 2),
      description: 'High IV + Steep term. Back months overpriced. Sell back, buy front.',
      action: 'SELL_BACK_BUY_FRONT'
    };
  }

  // High VRP (general premium selling opportunity)
  if (vrp > 10) {
    return {
      setup: 'HIGH_VRP',
      confidence: Math.min(100, 50 + vrp * 2),
      description: `VRP +${vrp.toFixed(0)}% - Options expensive. Sell premium.`,
      action: 'SELL_PREMIUM'
    };
  }

  // Moderate VRP
  if (vrp > 5) {
    return {
      setup: 'MODERATE_VRP',
      confidence: Math.min(100, 40 + vrp * 2),
      description: `VRP +${vrp.toFixed(0)}% - Slight edge for selling.`,
      action: 'LEAN_SELL'
    };
  }

  // Negative VRP (premium buying opportunity)
  if (vrp < -5) {
    return {
      setup: 'NEGATIVE_VRP',
      confidence: Math.min(100, 50 + Math.abs(vrp) * 3),
      description: `VRP ${vrp.toFixed(0)}% - Options cheap. Buy premium.`,
      action: 'BUY_PREMIUM'
    };
  }

  // Low VRP
  if (vrp < 0) {
    return {
      setup: 'LOW_VRP',
      confidence: Math.min(100, 40 + Math.abs(vrp) * 3),
      description: `VRP ${vrp.toFixed(0)}% - Slight edge for buying.`,
      action: 'LEAN_BUY'
    };
  }

  return {
    setup: 'NEUTRAL',
    confidence: 35,
    description: 'VRP near zero. No clear vol edge.',
    action: 'WAIT'
  };
}

// Cross-sectional ranking: Rank metrics across a universe of tickers
export function crossSectionalRank(tickers, metricKey) {
  const validTickers = tickers.filter(t => t[metricKey] != null);
  const sorted = [...validTickers].sort((a, b) => a[metricKey] - b[metricKey]);

  return sorted.map((ticker, i) => ({
    ticker: ticker.ticker,
    value: ticker[metricKey],
    rank: Math.round((i / (sorted.length - 1 || 1)) * 100)
  }));
}

// Calculate volatility metrics bundle for a ticker
// Accepts either close prices or OHLC bars (Yang-Zhang when bars provided)
export function calcVolatilityMetrics(data, avgIV, termStructure = null) {
  const rvMulti = calcRealizedVolMulti(data);
  const rv30 = rvMulti.rv30;
  const vrp = calcVRP(avgIV, rv30);
  const vrpRatio = calcVRPRatio(avgIV, rv30);

  // Term structure steepness (if available)
  let termSteepness = null;
  if (termStructure?.weekly && termStructure?.sixMonth) {
    termSteepness = calcTermSteepness(termStructure.weekly, termStructure.sixMonth);
  }

  return {
    iv: avgIV,
    ...rvMulti,
    vrp,
    vrpRatio,
    termSteepness,
    // Labels for UI
    vrpLabel: vrp != null ? (vrp > 0 ? 'Premium' : 'Discount') : '--',
    vrpSignal: vrp != null ? (vrp > 10 ? 'SELL' : vrp < -5 ? 'BUY' : 'NEUTRAL') : '--'
  };
}

// ============================================
// GAMMA EXPOSURE (GEX) & DEALER POSITIONING
// Institutional-grade options flow analytics
// Based on SqueezeMetrics methodology
// ============================================

/**
 * Calculate Gamma Exposure (GEX) from options chain
 *
 * GEX measures the $ amount of stock dealers must buy/sell to delta-hedge
 * for a 1% move in the underlying. Key insights:
 *
 * - Positive GEX: Dealers are LONG gamma (bought options from customers)
 *   They hedge BY selling into rallies, buying dips = STABILIZING
 *
 * - Negative GEX: Dealers are SHORT gamma (sold options to customers)
 *   They hedge BY buying into rallies, selling dips = AMPLIFYING
 *
 * Formula: GEX = Gamma × OI × 100 × Spot²  × 0.01
 * (The 0.01 converts to "per 1% move" and Spot² accounts for $ gamma)
 *
 * @param {Array} options - Array of option contracts from Polygon
 * @param {number} spotPrice - Current underlying price
 * @returns {Object} GEX metrics
 */
export function calcGEX(options, spotPrice) {
  if (!options?.length || !spotPrice) {
    return { error: 'Insufficient data', netGEX: 0 };
  }

  let callGEX = 0;
  let putGEX = 0;
  const strikeGEX = {};

  for (const o of options) {
    let gamma = o.greeks?.gamma;
    const oi = o.open_interest || 0;
    const type = o.details?.contract_type;
    const strike = o.details?.strike_price;
    const iv = o.implied_volatility || 0.3;

    // Skip if no OI or missing required data
    if (oi <= 0 || !type || !strike) continue;

    // Calculate DTE for gamma estimation
    const expDate = o.details?.expiration_date;
    const dte = expDate ? Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24)) : 30;

    // If gamma is missing or invalid, estimate it using Black-Scholes
    // This aligns with gamma.js approach for consistency
    if (!gamma || gamma <= 0 || gamma > 5) {
      gamma = estimateGammaFromBS(spotPrice, strike, dte, iv);
      if (!gamma || gamma <= 0) continue; // Skip if estimation also fails
    }

    // GEX formula: gamma × OI × 100 shares × spot² × 0.01
    // This gives us $ of stock to trade per 1% underlying move
    const contractGEX = gamma * oi * 100 * spotPrice * spotPrice * 0.01;

    // Dealer positioning assumption:
    // - Calls: Dealers are typically SHORT calls (sold to customers) = SHORT gamma
    //   When they're short calls, they have NEGATIVE gamma exposure
    //   But we flip the sign: customer long call = dealer short = we show as POSITIVE GEX
    //   because net market positioning from calls adds positive gamma pressure
    //
    // - Puts: Dealers are typically SHORT puts (sold to customers) = LONG gamma
    //   Short puts = positive gamma for the dealer
    //   We show this as NEGATIVE GEX because puts add negative gamma pressure
    //
    // Net effect: Above GEX flip, market is stabilized. Below, it's amplified.

    if (type === 'call') {
      callGEX += contractGEX;
      strikeGEX[strike] = (strikeGEX[strike] || 0) + contractGEX;
    } else {
      putGEX -= contractGEX;
      strikeGEX[strike] = (strikeGEX[strike] || 0) - contractGEX;
    }
  }

  const netGEX = callGEX + putGEX;

  // Find key levels
  const strikes = Object.entries(strikeGEX)
    .map(([strike, gex]) => ({ strike: parseFloat(strike), gex }))
    .sort((a, b) => a.strike - b.strike);

  // GEX Zero Line: Price level where net GEX flips sign
  // Above this = positive gamma (stabilizing), Below = negative gamma (amplifying)
  const gexZeroLine = findGEXZeroLine(strikes, spotPrice);

  // Gamma walls: Strikes with highest absolute GEX
  const sortedByGEX = [...strikes].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex));
  const callWall = sortedByGEX.find(s => s.gex > 0 && s.strike > spotPrice);
  const putWall = sortedByGEX.find(s => s.gex < 0 && s.strike < spotPrice);

  // Regime classification
  let regime = 'NEUTRAL';
  let regimeDesc = '';

  if (netGEX > 0 && spotPrice > (gexZeroLine || spotPrice)) {
    regime = 'POSITIVE_GAMMA';
    regimeDesc = 'Dealers long gamma. Expect mean reversion, lower vol.';
  } else if (netGEX < 0 && spotPrice < (gexZeroLine || 0)) {
    regime = 'NEGATIVE_GAMMA';
    regimeDesc = 'Dealers short gamma. Expect trend continuation, higher vol.';
  }

  // Normalize GEX to millions for readability
  const formatGEX = (gex) => {
    const absGex = Math.abs(gex);
    if (absGex >= 1e9) return (gex / 1e9).toFixed(2) + 'B';
    if (absGex >= 1e6) return (gex / 1e6).toFixed(2) + 'M';
    if (absGex >= 1e3) return (gex / 1e3).toFixed(0) + 'K';
    return gex.toFixed(0);
  };

  return {
    callGEX,
    putGEX,
    netGEX,
    netGEXFormatted: formatGEX(netGEX),
    gexZeroLine,
    callWall: callWall?.strike || null,
    putWall: putWall?.strike || null,
    regime,
    regimeDesc,
    strikeGEX: strikes,
    // Key insight: distance from zero line
    distFromZero: gexZeroLine ? ((spotPrice - gexZeroLine) / spotPrice * 100).toFixed(2) : null,
    isAboveZero: gexZeroLine ? spotPrice > gexZeroLine : netGEX > 0
  };
}

/**
 * Find the price level where cumulative GEX flips from positive to negative
 */
function findGEXZeroLine(strikes, spotPrice) {
  if (!strikes.length) return null;

  // Find where cumulative GEX changes sign
  let cumulativeGEX = 0;
  let lastPositive = null;
  let firstNegative = null;

  for (const { strike, gex } of strikes) {
    const prevCumulative = cumulativeGEX;
    cumulativeGEX += gex;

    if (prevCumulative >= 0 && cumulativeGEX < 0) {
      lastPositive = strike;
    }
    if (prevCumulative < 0 && cumulativeGEX >= 0) {
      firstNegative = strike;
    }
  }

  // Alternative: find the strike closest to where net GEX = 0
  let runningGEX = 0;
  let zeroStrike = strikes[0]?.strike;
  let minAbsGEX = Infinity;

  for (const { strike, gex } of strikes) {
    runningGEX += gex;
    if (Math.abs(runningGEX) < minAbsGEX) {
      minAbsGEX = Math.abs(runningGEX);
      zeroStrike = strike;
    }
  }

  return zeroStrike || spotPrice;
}

/**
 * Calculate Delta Exposure (DEX) from options chain
 *
 * DEX measures net directional exposure from options positioning
 *
 * @param {Array} options - Array of option contracts
 * @param {number} spotPrice - Current underlying price
 * @returns {Object} DEX metrics
 */
export function calcDEX(options, spotPrice) {
  if (!options?.length || !spotPrice) {
    return { error: 'Insufficient data', netDEX: 0 };
  }

  let callDEX = 0;
  let putDEX = 0;

  for (const o of options) {
    const delta = o.greeks?.delta;
    const oi = o.open_interest || 0;
    const type = o.details?.contract_type;

    if (delta == null || oi <= 0) continue;

    // DEX = |delta| × OI × 100 × spot
    // This is the notional $ exposure
    const contractDEX = Math.abs(delta) * oi * 100 * spotPrice;

    if (type === 'call') {
      callDEX += contractDEX;
    } else {
      putDEX += contractDEX;
    }
  }

  const netDEX = callDEX - putDEX;
  const totalDEX = callDEX + putDEX;
  const dexRatio = totalDEX > 0 ? callDEX / totalDEX : 0.5;

  return {
    callDEX,
    putDEX,
    netDEX,
    totalDEX,
    dexRatio, // > 0.5 = call heavy, < 0.5 = put heavy
    bias: dexRatio > 0.55 ? 'BULLISH' : dexRatio < 0.45 ? 'BEARISH' : 'NEUTRAL'
  };
}

/**
 * Calculate Gamma Ratio (G) - SqueezeMetrics style
 *
 * G = Call Gamma / Total Gamma
 * Ranges 0 to 1:
 * - > 0.5: Call-heavy positioning (bullish)
 * - < 0.5: Put-heavy positioning (bearish)
 * - = 0.5: Balanced
 *
 * @param {Array} options - Array of option contracts
 * @returns {Object} Gamma ratio metrics
 */
export function calcGammaRatio(options) {
  if (!options?.length) {
    return { gammaRatio: 0.5, interpretation: 'NO_DATA' };
  }

  let callGamma = 0;
  let putGamma = 0;

  for (const o of options) {
    const gamma = o.greeks?.gamma || 0;
    const oi = o.open_interest || 0;
    const type = o.details?.contract_type;

    if (gamma <= 0 || oi <= 0) continue;

    const weightedGamma = gamma * oi;

    if (type === 'call') {
      callGamma += weightedGamma;
    } else {
      putGamma += weightedGamma;
    }
  }

  const totalGamma = callGamma + putGamma;
  const gammaRatio = totalGamma > 0 ? callGamma / totalGamma : 0.5;

  return {
    callGamma,
    putGamma,
    totalGamma,
    gammaRatio,
    gammaRatioFormatted: gammaRatio.toFixed(2),
    interpretation: gammaRatio > 0.55 ? 'CALL_HEAVY' :
                    gammaRatio < 0.45 ? 'PUT_HEAVY' : 'BALANCED',
    signal: gammaRatio > 0.6 ? 'BULLISH' : gammaRatio < 0.4 ? 'BEARISH' : 'NEUTRAL'
  };
}

/**
 * Combined options exposure analysis
 * Aggregates GEX, DEX, and Gamma Ratio for complete picture
 */
export function calcOptionsExposure(options, spotPrice) {
  const gex = calcGEX(options, spotPrice);
  const dex = calcDEX(options, spotPrice);
  const gammaRatio = calcGammaRatio(options);

  // Composite score: -100 (max bearish) to +100 (max bullish)
  let compositeScore = 0;

  // GEX component: above zero line = bullish
  if (gex.isAboveZero) compositeScore += 25;
  else compositeScore -= 25;

  // GEX regime
  if (gex.regime === 'POSITIVE_GAMMA') compositeScore += 15;
  else if (gex.regime === 'NEGATIVE_GAMMA') compositeScore -= 15;

  // DEX component
  compositeScore += (dex.dexRatio - 0.5) * 60; // -30 to +30

  // Gamma ratio component
  compositeScore += (gammaRatio.gammaRatio - 0.5) * 60; // -30 to +30

  compositeScore = Math.max(-100, Math.min(100, compositeScore));

  return {
    gex,
    dex,
    gammaRatio,
    compositeScore: Math.round(compositeScore),
    compositeSignal: compositeScore > 25 ? 'BULLISH' :
                     compositeScore < -25 ? 'BEARISH' : 'NEUTRAL',
    volRegime: gex.regime,
    summary: `${gex.regime} | G-Ratio: ${gammaRatio.gammaRatioFormatted} | Net GEX: ${gex.netGEXFormatted}`
  };
}

// ============================================
// SQUEEZEMETRICS-STYLE TREND INDICATORS
// P (Price-Trend) and V (Volatility-Trend)
// ============================================

/**
 * Calculate Price-Trend (P) - Volatility-normalized momentum
 *
 * P = Recent % move / Realized Volatility
 *
 * Oscillates primarily between +1 and -1:
 * - P > +1: Strong upward momentum (move exceeds typical volatility)
 * - P < -1: Strong downward momentum
 * - |P| < 0.5: Subdued price action
 *
 * This normalizes moves across assets with different volatility profiles
 *
 * @param {Array} prices - Array of closing prices
 * @param {number} window - Lookback window (default 5 days)
 * @returns {Object} Price trend metrics
 */
export function calcPriceTrend(prices, window = 5) {
  if (!prices || prices.length < window + 10) {
    return { p: null, error: 'Insufficient data' };
  }

  const currentPrice = prices[prices.length - 1];
  const pastPrice = prices[prices.length - 1 - window];
  const pctMove = ((currentPrice - pastPrice) / pastPrice) * 100;

  // Use slightly longer window for RV to smooth it
  const rv = calcRealizedVol(prices, Math.max(window, 10));
  if (!rv || rv === 0) {
    return { p: null, error: 'Cannot calculate RV' };
  }

  // Daily vol from annualized
  const dailyVol = rv / Math.sqrt(252);

  // Expected move over window
  const expectedMove = dailyVol * Math.sqrt(window);

  // P = actual move / expected move
  const p = pctMove / expectedMove;

  return {
    p: parseFloat(p.toFixed(2)),
    pctMove: parseFloat(pctMove.toFixed(2)),
    rv,
    expectedMove: parseFloat(expectedMove.toFixed(2)),
    interpretation: Math.abs(p) > 1.5 ? 'EXTREME' :
                    Math.abs(p) > 1 ? 'STRONG' :
                    Math.abs(p) > 0.5 ? 'MODERATE' : 'SUBDUED',
    direction: p > 0 ? 'UP' : 'DOWN',
    // Signal: extreme readings tend to mean-revert
    signal: p > 1.5 ? 'OVERBOUGHT' : p < -1.5 ? 'OVERSOLD' : 'NEUTRAL'
  };
}

/**
 * Calculate Volatility-Trend (V) - RV direction indicator
 *
 * V = (Short-term RV - Long-term RV) / Long-term RV
 *
 * Indicates whether realized volatility is expanding or contracting:
 * - V > 0: Vol expanding (short-term > long-term)
 * - V < 0: Vol contracting (short-term < long-term)
 *
 * @param {Array} prices - Array of closing prices
 * @returns {Object} Volatility trend metrics
 */
export function calcVolTrend(prices) {
  if (!prices || prices.length < 30) {
    return { v: null, error: 'Insufficient data' };
  }

  const rv5 = calcRealizedVol(prices, 5);
  const rv10 = calcRealizedVol(prices, 10);
  const rv20 = calcRealizedVol(prices, 20);
  const rv30 = calcRealizedVol(prices, 30);

  if (!rv5 || !rv20) {
    return { v: null, error: 'Cannot calculate RV' };
  }

  // V = (RV5 - RV20) / RV20
  const v = ((rv5 - rv20) / rv20) * 100;

  // Term structure of RV
  const rvTermStructure = rv30 && rv5 ? ((rv30 - rv5) / rv5) * 100 : null;

  return {
    v: parseFloat(v.toFixed(1)),
    rv5,
    rv10,
    rv20,
    rv30,
    rvTermStructure: rvTermStructure?.toFixed(1),
    regime: v > 20 ? 'EXPANDING' : v < -20 ? 'CONTRACTING' : 'STABLE',
    interpretation: v > 30 ? 'VOL_SPIKE' :
                    v > 10 ? 'VOL_RISING' :
                    v < -30 ? 'VOL_CRUSH' :
                    v < -10 ? 'VOL_FALLING' : 'VOL_STABLE',
    // High short-term vol often precedes mean reversion
    signal: v > 40 ? 'EXPECT_VOL_DECREASE' :
            v < -40 ? 'EXPECT_VOL_INCREASE' : 'NEUTRAL'
  };
}

/**
 * Combined PVGD analysis (Price, Vol, Gamma, Dark-ratio)
 * Note: D (Dark-ratio) requires FINRA data not available via Polygon
 *
 * This combines all SqueezeMetrics-style indicators into one view
 */
export function calcPVGD(prices, options, spotPrice) {
  const pTrend = calcPriceTrend(prices, 5);
  const vTrend = calcVolTrend(prices);
  const exposure = options ? calcOptionsExposure(options, spotPrice) : null;

  // Combine signals for overall market read
  let overallScore = 0;
  let signals = [];

  // Price trend contribution
  if (pTrend.p != null) {
    if (pTrend.p > 1) { overallScore += 20; signals.push('Strong uptrend'); }
    else if (pTrend.p < -1) { overallScore -= 20; signals.push('Strong downtrend'); }
    else if (pTrend.p > 0.5) { overallScore += 10; signals.push('Mild uptrend'); }
    else if (pTrend.p < -0.5) { overallScore -= 10; signals.push('Mild downtrend'); }
  }

  // Vol trend contribution (high vol = bearish bias historically)
  if (vTrend.v != null) {
    if (vTrend.v > 30) { overallScore -= 15; signals.push('Vol spiking'); }
    else if (vTrend.v < -30) { overallScore += 15; signals.push('Vol crushing'); }
  }

  // Options exposure contribution
  if (exposure) {
    overallScore += exposure.compositeScore * 0.5;
    if (exposure.gex.regime === 'POSITIVE_GAMMA') signals.push('Positive GEX');
    else if (exposure.gex.regime === 'NEGATIVE_GAMMA') signals.push('Negative GEX');
  }

  overallScore = Math.max(-100, Math.min(100, overallScore));

  return {
    P: pTrend,
    V: vTrend,
    G: exposure?.gammaRatio || null,
    exposure,
    overallScore: Math.round(overallScore),
    overallSignal: overallScore > 30 ? 'BULLISH' :
                   overallScore < -30 ? 'BEARISH' : 'NEUTRAL',
    signals,
    summary: [
      `P: ${pTrend.p?.toFixed(2) || '--'} (${pTrend.direction || '--'})`,
      `V: ${vTrend.v?.toFixed(1) || '--'}% (${vTrend.regime || '--'})`,
      exposure ? `GEX: ${exposure.gex.netGEXFormatted}` : 'GEX: --'
    ].join(' | ')
  };
}
