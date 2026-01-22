// VHunter Gamma Analytics Module
// Professional SIG-level GEX/Gamma calculations
// Based on dealer positioning and hedging mechanics

// ============================================
// CONFIGURATION
// ============================================

// Current Fed Funds rate - update quarterly or fetch dynamically
// As of Jan 2026: ~4.25-4.50% (should be updated based on Fed decisions)
let RISK_FREE_RATE = 0.0425;

// Set risk-free rate dynamically (can be called from API)
export function setRiskFreeRate(rate) {
  RISK_FREE_RATE = rate;
}

// Get current risk-free rate
export function getRiskFreeRate() {
  return RISK_FREE_RATE;
}

// ============================================
// CORE GEX CALCULATIONS
// ============================================

// Standard normal CDF approximation (Abramowitz-Stegun)
function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

// Standard normal PDF
function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Black-Scholes d1
function calcD1(spot, strike, t, r, iv) {
  if (t <= 0 || iv <= 0) return 0;
  return (Math.log(spot / strike) + (r + 0.5 * iv * iv) * t) / (iv * Math.sqrt(t));
}

// Estimate Delta if not provided by API
export function estimateDelta(spot, strike, dte, iv, isCall) {
  const t = Math.max(dte, 1) / 365;
  const r = RISK_FREE_RATE;
  const sigma = iv > 1 ? iv / 100 : iv; // Handle both 0.3 and 30% formats

  const d1 = calcD1(spot, strike, t, r, sigma);
  return isCall ? normCDF(d1) : normCDF(d1) - 1;
}

// Estimate Gamma if not provided by API
export function estimateGamma(spot, strike, dte, iv) {
  const t = Math.max(dte, 1) / 365;
  const r = RISK_FREE_RATE;
  const sigma = iv > 1 ? iv / 100 : iv;

  if (sigma <= 0 || t <= 0) return 0;

  const d1 = calcD1(spot, strike, t, r, sigma);
  return normPDF(d1) / (spot * sigma * Math.sqrt(t));
}

/**
 * Validate gamma value from API
 * Returns true if gamma seems reasonable, false if suspect
 */
function validateGamma(gamma, spot, strike, dte, iv) {
  if (gamma === null || gamma === undefined) return false;
  if (gamma < 0) return false; // Gamma is always positive
  if (gamma > 1) return false; // Gamma can't exceed 1 per share

  // Cross-check with estimated gamma (allow 50% tolerance)
  const estimated = estimateGamma(spot, strike, dte, iv);
  if (estimated > 0) {
    const ratio = gamma / estimated;
    if (ratio < 0.5 || ratio > 2.0) return false; // API gamma is way off
  }

  return true;
}

// ============================================
// GEX (GAMMA EXPOSURE) CALCULATIONS
// ============================================

/**
 * Calculate GEX for a single option contract
 *
 * PROFESSIONAL FORMULA:
 * GEX = Gamma × OI × 100 × Spot² × 0.01
 *
 * This gives us: $ of stock dealers must trade per 1% move in underlying
 *
 * Derivation:
 * - Gamma (Γ) = ∂Δ/∂S (change in delta per $1 move)
 * - For 1% move: ΔS = S × 0.01
 * - Change in delta = Γ × ΔS = Γ × S × 0.01
 * - $ of stock to trade = Δ change × S × OI × 100 shares
 * - GEX = Γ × S × 0.01 × S × OI × 100 = Γ × OI × 100 × S² × 0.01
 *
 * Key insight: Market makers are typically SHORT options
 * - When MM is short a CALL, they have NEGATIVE gamma exposure
 *   To hedge: MM must BUY stock as price rises, SELL as it falls (stabilizing)
 * - When MM is short a PUT, they have POSITIVE gamma exposure
 *   To hedge: MM must SELL stock as price falls, BUY as it rises (destabilizing when price drops)
 *
 * Convention: We flip signs so POSITIVE GEX = stabilizing (mean-reverting)
 */
export function calcContractGEX(option, spotPrice) {
  const details = option.details;
  if (!details) return 0;

  const strike = details.strike_price;
  const isCall = details.contract_type === 'call';
  const oi = option.open_interest || 0;
  const iv = option.implied_volatility || 0.3;

  if (oi === 0) return 0;

  const expDate = details.expiration_date;
  const dte = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24));

  // Get gamma from API or estimate
  let gamma = option.greeks?.gamma;

  // Validate API gamma - if suspect, use our estimate
  if (!validateGamma(gamma, spotPrice, strike, dte, iv)) {
    gamma = estimateGamma(spotPrice, strike, dte, iv);
  }

  // CORRECT PROFESSIONAL GEX FORMULA:
  // GEX = Gamma × OI × 100 × Spot² × 0.01 ($ per 1% move)
  const gex = gamma * oi * 100 * spotPrice * spotPrice * 0.01;

  // Calls: MM is short calls → negative gamma → flip to positive (stabilizing)
  // Puts: MM is short puts → positive gamma → flip to negative (destabilizing below)
  return isCall ? gex : -gex;
}

/**
 * Calculate GEX profile across all strikes
 */
export function calcGEXProfile(options, spotPrice) {
  const gexByStrike = {};
  const callGexByStrike = {};
  const putGexByStrike = {};

  let totalCallGEX = 0;
  let totalPutGEX = 0;

  options.forEach(o => {
    const strike = o.details?.strike_price;
    if (!strike) return;

    const gex = calcContractGEX(o, spotPrice);
    const isCall = o.details.contract_type === 'call';

    gexByStrike[strike] = (gexByStrike[strike] || 0) + gex;

    if (isCall) {
      callGexByStrike[strike] = (callGexByStrike[strike] || 0) + gex;
      totalCallGEX += gex;
    } else {
      putGexByStrike[strike] = (putGexByStrike[strike] || 0) + gex;
      totalPutGEX += gex;
    }
  });

  return {
    byStrike: gexByStrike,
    callsByStrike: callGexByStrike,
    putsByStrike: putGexByStrike,
    totalCallGEX,
    totalPutGEX,
    netGEX: totalCallGEX + totalPutGEX
  };
}

/**
 * Find Zero Gamma (Gamma Flip) level
 * This is where cumulative GEX crosses from positive to negative
 */
export function findZeroGamma(gexByStrike, spotPrice) {
  const strikes = Object.keys(gexByStrike).map(Number).sort((a, b) => a - b);

  if (strikes.length === 0) return null;

  // Calculate cumulative GEX from lowest strike upward
  let cumGex = 0;
  let zeroGammaStrike = null;
  let prevCumGex = 0;

  for (const strike of strikes) {
    prevCumGex = cumGex;
    cumGex += gexByStrike[strike];

    // Find where cumulative GEX crosses zero
    if (prevCumGex <= 0 && cumGex > 0) {
      // Interpolate the exact crossing point
      const ratio = Math.abs(prevCumGex) / (Math.abs(prevCumGex) + cumGex);
      const prevStrike = strikes[strikes.indexOf(strike) - 1] || strike;
      zeroGammaStrike = prevStrike + ratio * (strike - prevStrike);
      break;
    }
  }

  // If no crossing found, use the strike with GEX closest to zero
  if (!zeroGammaStrike) {
    let minAbsGex = Infinity;
    for (const strike of strikes) {
      if (Math.abs(gexByStrike[strike]) < minAbsGex) {
        minAbsGex = Math.abs(gexByStrike[strike]);
        zeroGammaStrike = strike;
      }
    }
  }

  return zeroGammaStrike;
}

/**
 * Find Call Wall (highest positive gamma strike above spot)
 * This acts as RESISTANCE - MMs sell into rallies here
 */
export function findCallWall(callGexByStrike, spotPrice) {
  const strikes = Object.keys(callGexByStrike)
    .map(Number)
    .filter(s => s >= spotPrice)
    .sort((a, b) => callGexByStrike[b] - callGexByStrike[a]);

  return strikes[0] || null;
}

/**
 * Find Put Wall (highest absolute gamma strike below spot)
 * This acts as SUPPORT - MMs buy on dips here
 */
export function findPutWall(putGexByStrike, spotPrice) {
  const strikes = Object.keys(putGexByStrike)
    .map(Number)
    .filter(s => s <= spotPrice)
    .sort((a, b) => Math.abs(putGexByStrike[b]) - Math.abs(putGexByStrike[a]));

  return strikes[0] || null;
}

/**
 * Calculate Volatility Trigger
 * The level below which negative gamma accelerates (vol expansion zone)
 */
export function findVolatilityTrigger(gexProfile, spotPrice) {
  const { byStrike, putsByStrike } = gexProfile;
  const strikes = Object.keys(byStrike).map(Number).sort((a, b) => b - a); // Descending

  // Find the highest strike below spot where net GEX becomes significantly negative
  let volTrigger = null;
  let cumPutGex = 0;

  for (const strike of strikes) {
    if (strike > spotPrice) continue;

    cumPutGex += Math.abs(putsByStrike[strike] || 0);
    const netAtStrike = byStrike[strike] || 0;

    // Vol trigger = where put gamma starts to dominate
    if (netAtStrike < 0 && cumPutGex > gexProfile.totalCallGEX * 0.3) {
      volTrigger = strike;
      break;
    }
  }

  // Fallback: 2% below spot or put wall
  if (!volTrigger) {
    const putWall = findPutWall(putsByStrike, spotPrice);
    volTrigger = putWall || spotPrice * 0.98;
  }

  return volTrigger;
}

/**
 * Determine GEX Regime
 */
export function determineGEXRegime(spotPrice, zeroGamma, volTrigger, netGEX) {
  if (netGEX > 0 && spotPrice > zeroGamma) {
    return {
      regime: 'POSITIVE',
      label: '+GEX',
      description: 'Dealers long gamma. Hedging DAMPENS moves. Mean-reverting.',
      color: 'g',
      volatilityBias: 'LOW',
      tradingStyle: 'FADE MOVES / SELL VOL'
    };
  } else if (spotPrice < volTrigger) {
    return {
      regime: 'NEGATIVE_DEEP',
      label: '-GEX DEEP',
      description: 'Below vol trigger. Hedging AMPLIFIES moves. Trend-following.',
      color: 'r',
      volatilityBias: 'VERY HIGH',
      tradingStyle: 'TREND FOLLOW / BUY VOL'
    };
  } else if (spotPrice < zeroGamma || netGEX < 0) {
    return {
      regime: 'NEGATIVE',
      label: '-GEX',
      description: 'Dealers short gamma. Hedging AMPLIFIES moves. Directional.',
      color: 'y',
      volatilityBias: 'HIGH',
      tradingStyle: 'MOMENTUM / CAUTION'
    };
  } else {
    return {
      regime: 'NEUTRAL',
      label: '~GEX',
      description: 'Near gamma neutral. Mixed hedging dynamics.',
      color: '',
      volatilityBias: 'NORMAL',
      tradingStyle: 'STANDARD'
    };
  }
}

// ============================================
// DELTA FLOW (HIRO-STYLE)
// ============================================

/**
 * Calculate net delta from options flow
 * Positive = dealers need to buy stock (bullish pressure)
 * Negative = dealers need to sell stock (bearish pressure)
 */
export function calcDeltaFlow(options, spotPrice) {
  let callBuyDelta = 0;  // Calls bought by customers → dealers short → dealers buy stock
  let callSellDelta = 0; // Calls sold by customers → dealers long → dealers sell stock
  let putBuyDelta = 0;   // Puts bought → dealers short → dealers sell stock
  let putSellDelta = 0;  // Puts sold → dealers long → dealers buy stock

  let totalCallDelta = 0;
  let totalPutDelta = 0;

  options.forEach(o => {
    const details = o.details;
    if (!details) return;

    const vol = o.day?.volume || 0;
    if (vol === 0) return;

    const strike = details.strike_price;
    const isCall = details.contract_type === 'call';
    const iv = o.implied_volatility || 0.3;
    const expDate = details.expiration_date;
    const dte = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24));

    // Get delta from API or estimate
    let delta = o.greeks?.delta;
    if (delta === undefined || delta === null) {
      delta = estimateDelta(spotPrice, strike, dte, iv, isCall);
    }

    const absDelta = Math.abs(delta);
    const notionalDelta = vol * absDelta * 100; // Shares equivalent

    if (isCall) {
      totalCallDelta += notionalDelta;
      // Assume 60% of volume is buying (conservative estimate)
      callBuyDelta += notionalDelta * 0.6;
      callSellDelta += notionalDelta * 0.4;
    } else {
      totalPutDelta += notionalDelta;
      putBuyDelta += notionalDelta * 0.6;
      putSellDelta += notionalDelta * 0.4;
    }
  });

  // Net hedging pressure
  // Call buys → dealers buy stock (+)
  // Call sells → dealers sell stock (-)
  // Put buys → dealers sell stock (-)
  // Put sells → dealers buy stock (+)
  const netHedgingDelta = (callBuyDelta - callSellDelta) + (putSellDelta - putBuyDelta);

  return {
    callDelta: totalCallDelta,
    putDelta: totalPutDelta,
    netDelta: netHedgingDelta,
    callBias: callBuyDelta > callSellDelta ? 'BUY' : 'SELL',
    putBias: putBuyDelta > putSellDelta ? 'BUY' : 'SELL',
    hedgingPressure: netHedgingDelta > 0 ? 'DEALERS BUYING' : 'DEALERS SELLING',
    intensity: Math.abs(netHedgingDelta) > 1000000 ? 'HIGH' :
               Math.abs(netHedgingDelta) > 500000 ? 'MODERATE' : 'LOW'
  };
}

// ============================================
// CHARM (DELTA DECAY) PRESSURE
// ============================================

/**
 * Calculate charm pressure from near-expiry options
 * Charm = rate of change of delta with respect to time
 * Near-expiry ATM options have massive charm → pinning effect
 */
export function calcCharmPressure(options, spotPrice) {
  const today = new Date();

  // Filter to 0-3 DTE options (highest charm)
  const nearExpiry = options.filter(o => {
    const expDate = o.details?.expiration_date;
    if (!expDate) return false;
    const dte = Math.ceil((new Date(expDate) - today) / (1000 * 60 * 60 * 24));
    return dte >= 0 && dte <= 3;
  });

  if (nearExpiry.length === 0) {
    return {
      pinningStrike: null,
      pinningStrength: 0,
      nearExpiryOI: 0,
      charmPressure: 'NONE',
      signal: 'No near-term expiries'
    };
  }

  // Group by strike and find max OI near ATM
  const strikeOI = {};
  let totalNearOI = 0;

  nearExpiry.forEach(o => {
    const strike = o.details.strike_price;
    const oi = o.open_interest || 0;
    strikeOI[strike] = (strikeOI[strike] || 0) + oi;
    totalNearOI += oi;
  });

  // Find ATM strikes (within 2% of spot)
  const atmStrikes = Object.keys(strikeOI)
    .map(Number)
    .filter(s => Math.abs(s - spotPrice) / spotPrice < 0.02);

  const atmOI = atmStrikes.reduce((sum, s) => sum + strikeOI[s], 0);

  // Find the strike with highest OI near ATM
  let maxOI = 0;
  let pinningStrike = null;
  atmStrikes.forEach(s => {
    if (strikeOI[s] > maxOI) {
      maxOI = strikeOI[s];
      pinningStrike = s;
    }
  });

  const pinningStrength = totalNearOI > 0 ? atmOI / totalNearOI : 0;

  return {
    pinningStrike,
    pinningStrength,
    nearExpiryOI: totalNearOI,
    atmOI,
    charmPressure: pinningStrength > 0.4 ? 'STRONG' :
                   pinningStrength > 0.2 ? 'MODERATE' : 'WEAK',
    signal: pinningStrike ?
      `Pinning toward $${pinningStrike} (${(pinningStrength * 100).toFixed(0)}% concentration)` :
      'No clear pin'
  };
}

// ============================================
// COMPREHENSIVE GAMMA ANALYSIS
// ============================================

/**
 * Full gamma analysis - combines all metrics
 */
export function analyzeGamma(options, spotPrice) {
  if (!options || options.length === 0) {
    return {
      error: 'No options data',
      gexProfile: null,
      levels: null,
      regime: null,
      deltaFlow: null,
      charm: null
    };
  }

  // Calculate GEX profile
  const gexProfile = calcGEXProfile(options, spotPrice);

  // Find key levels
  const zeroGamma = findZeroGamma(gexProfile.byStrike, spotPrice);
  const callWall = findCallWall(gexProfile.callsByStrike, spotPrice);
  const putWall = findPutWall(gexProfile.putsByStrike, spotPrice);
  const volTrigger = findVolatilityTrigger(gexProfile, spotPrice);

  // Determine regime
  const regime = determineGEXRegime(spotPrice, zeroGamma, volTrigger, gexProfile.netGEX);

  // Calculate delta flow
  const deltaFlow = calcDeltaFlow(options, spotPrice);

  // Calculate charm/pinning
  const charm = calcCharmPressure(options, spotPrice);

  // Calculate distances from spot
  const levels = {
    zeroGamma,
    zeroGammaDist: zeroGamma ? ((zeroGamma - spotPrice) / spotPrice * 100).toFixed(2) : null,
    callWall,
    callWallDist: callWall ? ((callWall - spotPrice) / spotPrice * 100).toFixed(2) : null,
    callWallGEX: callWall ? gexProfile.callsByStrike[callWall] : null,
    putWall,
    putWallDist: putWall ? ((putWall - spotPrice) / spotPrice * 100).toFixed(2) : null,
    putWallGEX: putWall ? gexProfile.putsByStrike[putWall] : null,
    volTrigger,
    volTriggerDist: volTrigger ? ((volTrigger - spotPrice) / spotPrice * 100).toFixed(2) : null
  };

  return {
    spotPrice,
    gexProfile,
    levels,
    regime,
    deltaFlow,
    charm,
    // Summary metrics
    netGEX: gexProfile.netGEX,
    callPutGEXRatio: gexProfile.totalPutGEX !== 0 ?
      (gexProfile.totalCallGEX / Math.abs(gexProfile.totalPutGEX)).toFixed(2) : 'N/A'
  };
}

/**
 * Format GEX value for display
 */
export function formatGEX(gex) {
  if (gex === null || gex === undefined) return '--';
  const absGex = Math.abs(gex);
  if (absGex >= 1e9) return (gex / 1e9).toFixed(1) + 'B';
  if (absGex >= 1e6) return (gex / 1e6).toFixed(1) + 'M';
  if (absGex >= 1e3) return (gex / 1e3).toFixed(0) + 'K';
  return gex.toFixed(0);
}

/**
 * Build GEX context for AI prompts
 */
export function buildGEXContext(analysis) {
  if (!analysis || analysis.error) {
    return 'GAMMA: No GEX data available';
  }

  const { levels, regime, deltaFlow, charm, netGEX } = analysis;

  let context = `GAMMA EXPOSURE (GEX):
- Net GEX: ${formatGEX(netGEX)} (${regime.label})
- Regime: ${regime.description}
- Zero Gamma: $${levels.zeroGamma?.toFixed(0) || '--'} (${levels.zeroGammaDist || '--'}% from spot)
- Call Wall: $${levels.callWall?.toFixed(0) || '--'} (${levels.callWallDist || '--'}%) - RESISTANCE
- Put Wall: $${levels.putWall?.toFixed(0) || '--'} (${levels.putWallDist || '--'}%) - SUPPORT
- Vol Trigger: $${levels.volTrigger?.toFixed(0) || '--'} (${levels.volTriggerDist || '--'}%) - Below = volatility expansion`;

  context += `\n\nDELTA FLOW:
- Hedging Pressure: ${deltaFlow.hedgingPressure} (${deltaFlow.intensity})
- Call Bias: ${deltaFlow.callBias} | Put Bias: ${deltaFlow.putBias}`;

  if (charm.pinningStrike) {
    context += `\n\nCHARM/PINNING:
- ${charm.signal}
- Pressure: ${charm.charmPressure}`;
  }

  context += `\n\nTRADING IMPLICATION: ${regime.tradingStyle}`;

  return context;
}
