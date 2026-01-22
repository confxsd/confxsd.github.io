// VHunter Financial Math Module
// Industry-standard calculations using Decimal.js for precision
// This is the single source of truth for all financial calculations

// Use Decimal.js if available, otherwise fallback to native Math
const D = typeof Decimal !== 'undefined' ? Decimal : null;

// Configuration for precision
const PRECISION = 10;
const TRADING_DAYS_PER_YEAR = 252;
const CALENDAR_DAYS_PER_YEAR = 365;

// Helper: Use Decimal if available, otherwise native number
function toDecimal(value) {
  if (D) {
    return new D(value);
  }
  return value;
}

function fromDecimal(value) {
  if (D && value instanceof D) {
    return value.toNumber();
  }
  return value;
}

// ============================================
// CORE STATISTICAL FUNCTIONS
// ============================================

/**
 * Calculate natural logarithm (log returns are industry standard)
 */
export function ln(value) {
  if (D) {
    return new D(value).ln();
  }
  return Math.log(value);
}

/**
 * Calculate square root with precision
 */
export function sqrt(value) {
  if (D) {
    return new D(value).sqrt();
  }
  return Math.sqrt(value);
}

/**
 * Calculate mean of an array
 */
export function mean(arr) {
  if (!arr || arr.length === 0) return 0;

  if (D) {
    const sum = arr.reduce((acc, val) => acc.plus(toDecimal(val)), new D(0));
    return fromDecimal(sum.div(arr.length));
  }

  return arr.reduce((acc, val) => acc + val, 0) / arr.length;
}

/**
 * Calculate standard deviation (population) - industry standard for volatility
 * Uses N in denominator (population SD), not N-1 (sample SD)
 */
export function stdDev(arr, useSample = false) {
  if (!arr || arr.length < 2) return 0;

  const avg = mean(arr);
  const n = useSample ? arr.length - 1 : arr.length;

  if (D) {
    const avgD = toDecimal(avg);
    const sumSquares = arr.reduce((acc, val) => {
      const diff = toDecimal(val).minus(avgD);
      return acc.plus(diff.pow(2));
    }, new D(0));
    return fromDecimal(sumSquares.div(n).sqrt());
  }

  const sumSquares = arr.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0);
  return Math.sqrt(sumSquares / n);
}

// ============================================
// LOG RETURNS CALCULATION
// Industry standard: r = ln(P_t / P_{t-1})
// ============================================

/**
 * Calculate log returns from price series
 * @param {number[]} prices - Array of prices (oldest to newest)
 * @returns {number[]} Array of log returns
 */
export function calcLogReturns(prices) {
  if (!prices || prices.length < 2) return [];

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      if (D) {
        const ret = new D(prices[i]).div(prices[i - 1]).ln();
        returns.push(fromDecimal(ret));
      } else {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }
  }
  return returns;
}

/**
 * Calculate simple returns from price series
 * @param {number[]} prices - Array of prices (oldest to newest)
 * @returns {number[]} Array of simple returns
 */
export function calcSimpleReturns(prices) {
  if (!prices || prices.length < 2) return [];

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] !== 0) {
      if (D) {
        const ret = new D(prices[i]).minus(prices[i - 1]).div(prices[i - 1]);
        returns.push(fromDecimal(ret));
      } else {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
  }
  return returns;
}

// ============================================
// REALIZED VOLATILITY (Historical Volatility)
// Standard: Annualized standard deviation of log returns
// ============================================

/**
 * Calculate Realized Volatility (Historical Volatility)
 * Uses log returns and annualizes by sqrt(252)
 *
 * @param {number[]} prices - Array of closing prices (oldest to newest)
 * @param {number} window - Lookback window in trading days (default 30)
 * @returns {number|null} Annualized volatility as percentage (e.g., 25.5 means 25.5%)
 */
export function calcRealizedVolatility(prices, window = 30) {
  if (!prices || prices.length < window + 1) {
    return null;
  }

  // Get the last 'window' prices plus one for returns calculation
  const windowPrices = prices.slice(-(window + 1));
  const returns = calcLogReturns(windowPrices);

  if (returns.length < window) {
    return null;
  }

  // Standard deviation of returns
  const volatility = stdDev(returns);

  // Annualize: multiply by sqrt(trading days per year)
  // Convert to percentage
  if (D) {
    const annualized = new D(volatility).times(sqrt(TRADING_DAYS_PER_YEAR)).times(100);
    return fromDecimal(annualized);
  }

  return volatility * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * Calculate RV for multiple windows
 * @param {number[]} prices - Array of closing prices
 * @returns {Object} RV for each window
 */
export function calcRealizedVolatilityMulti(prices) {
  return {
    rv5: calcRealizedVolatility(prices, 5),
    rv10: calcRealizedVolatility(prices, 10),
    rv20: calcRealizedVolatility(prices, 20),
    rv30: calcRealizedVolatility(prices, 30),
    rv60: prices?.length >= 61 ? calcRealizedVolatility(prices, 60) : null
  };
}

// ============================================
// VOLATILITY RISK PREMIUM (VRP)
// VRP = IV - RV
// ============================================

/**
 * Calculate Volatility Risk Premium
 * Positive VRP = options expensive relative to realized vol
 * Negative VRP = options cheap relative to realized vol
 *
 * @param {number} impliedVol - Implied volatility as percentage
 * @param {number} realizedVol - Realized volatility as percentage
 * @returns {number|null} VRP in percentage points
 */
export function calcVRP(impliedVol, realizedVol) {
  if (impliedVol == null || realizedVol == null) return null;

  if (D) {
    return fromDecimal(new D(impliedVol).minus(realizedVol));
  }
  return impliedVol - realizedVol;
}

/**
 * Calculate VRP as percentage of IV
 */
export function calcVRPRatio(impliedVol, realizedVol) {
  if (impliedVol == null || realizedVol == null || impliedVol === 0) return null;

  if (D) {
    return fromDecimal(
      new D(impliedVol).minus(realizedVol).div(impliedVol).times(100)
    );
  }
  return ((impliedVol - realizedVol) / impliedVol) * 100;
}

// ============================================
// EXPECTED MOVE CALCULATIONS
// Industry standard formulas
// ============================================

/**
 * Calculate Expected Move (1 standard deviation)
 * EM = Spot × IV × √(T/365)
 *
 * @param {number} spotPrice - Current price
 * @param {number} iv - Implied volatility as percentage (e.g., 30 for 30%)
 * @param {number} days - Days to expiration
 * @returns {number} Expected move in dollars
 */
export function calcExpectedMove(spotPrice, iv, days) {
  if (D) {
    const ivDecimal = new D(iv).div(100);
    const timeYears = new D(days).div(CALENDAR_DAYS_PER_YEAR);
    return fromDecimal(
      new D(spotPrice).times(ivDecimal).times(timeYears.sqrt())
    );
  }

  const ivDecimal = iv / 100;
  const timeYears = days / CALENDAR_DAYS_PER_YEAR;
  return spotPrice * ivDecimal * Math.sqrt(timeYears);
}

/**
 * Calculate Expected Move as percentage
 * EM% = IV × √(T/365)
 *
 * @param {number} iv - Implied volatility as percentage
 * @param {number} days - Days to expiration
 * @returns {number} Expected move as percentage
 */
export function calcExpectedMovePercent(iv, days) {
  if (D) {
    const ivDecimal = new D(iv).div(100);
    const timeYears = new D(days).div(CALENDAR_DAYS_PER_YEAR);
    return fromDecimal(ivDecimal.times(timeYears.sqrt()).times(100));
  }

  const ivDecimal = iv / 100;
  const timeYears = days / CALENDAR_DAYS_PER_YEAR;
  return ivDecimal * Math.sqrt(timeYears) * 100;
}

/**
 * Calculate ATM Straddle Price approximation
 * Straddle ≈ 0.8 × Spot × IV × √T
 *
 * @param {number} spotPrice - Current price
 * @param {number} iv - Implied volatility as percentage
 * @param {number} days - Days to expiration
 * @returns {number} Approximate straddle price
 */
export function calcStraddlePrice(spotPrice, iv, days) {
  if (D) {
    const ivDecimal = new D(iv).div(100);
    const timeYears = new D(days).div(CALENDAR_DAYS_PER_YEAR);
    return fromDecimal(
      new D(0.8).times(spotPrice).times(ivDecimal).times(timeYears.sqrt())
    );
  }

  const ivDecimal = iv / 100;
  const timeYears = days / CALENDAR_DAYS_PER_YEAR;
  return 0.8 * spotPrice * ivDecimal * Math.sqrt(timeYears);
}

/**
 * Calculate daily expected move from annualized IV
 * Daily vol = Annual vol / √252
 */
export function calcDailyMove(iv) {
  if (D) {
    return fromDecimal(new D(iv).div(sqrt(TRADING_DAYS_PER_YEAR)));
  }
  return iv / Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// ============================================
// IV RANK AND PERCENTILE
// ============================================

/**
 * Calculate IV Rank
 * IV Rank = (Current IV - Min IV) / (Max IV - Min IV) × 100
 *
 * @param {number} currentIV - Current implied volatility
 * @param {number[]} ivHistory - Array of historical IV values
 * @returns {number|null} IV Rank as percentage (0-100)
 */
export function calcIVRank(currentIV, ivHistory) {
  if (!ivHistory || ivHistory.length === 0 || currentIV == null) return null;

  const validHistory = ivHistory.filter(v => v != null && !isNaN(v));
  if (validHistory.length === 0) return null;

  const min = Math.min(...validHistory);
  const max = Math.max(...validHistory);

  if (max === min) return 50; // No range

  if (D) {
    return fromDecimal(
      new D(currentIV).minus(min).div(new D(max).minus(min)).times(100)
    );
  }

  return ((currentIV - min) / (max - min)) * 100;
}

/**
 * Calculate IV Percentile
 * What percentage of historical readings are below current?
 *
 * @param {number} currentIV - Current implied volatility
 * @param {number[]} ivHistory - Array of historical IV values
 * @returns {number|null} IV Percentile as percentage (0-100)
 */
export function calcIVPercentile(currentIV, ivHistory) {
  if (!ivHistory || ivHistory.length === 0 || currentIV == null) return null;

  const validHistory = ivHistory.filter(v => v != null && !isNaN(v));
  if (validHistory.length === 0) return null;

  const below = validHistory.filter(iv => iv < currentIV).length;

  if (D) {
    return fromDecimal(new D(below).div(validHistory.length).times(100));
  }

  return (below / validHistory.length) * 100;
}

// ============================================
// TERM STRUCTURE ANALYSIS
// ============================================

/**
 * Calculate term structure steepness
 * Positive = contango (normal), Negative = backwardation
 *
 * @param {number} frontIV - Front month IV
 * @param {number} backIV - Back month IV
 * @returns {number|null} Steepness as percentage
 */
export function calcTermSteepness(frontIV, backIV) {
  if (frontIV == null || backIV == null || frontIV === 0) return null;

  if (D) {
    return fromDecimal(
      new D(backIV).minus(frontIV).div(frontIV).times(100)
    );
  }

  return ((backIV - frontIV) / frontIV) * 100;
}

// ============================================
// BLACK-SCHOLES COMPONENTS
// For delta estimation when API doesn't provide greeks
// ============================================

/**
 * Standard normal CDF approximation
 * Using Abramowitz and Stegun approximation
 */
export function normCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * y);
}

/**
 * Standard normal PDF
 */
export function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Error function approximation (for backwards compatibility)
 */
export function erf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return sign * y;
}

/**
 * Calculate d1 for Black-Scholes
 * d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
 *
 * @param {number} spot - Spot price
 * @param {number} strike - Strike price
 * @param {number} iv - Implied volatility as decimal (e.g., 0.30)
 * @param {number} t - Time to expiry in years
 * @param {number} r - Risk-free rate (default 0.05)
 * @returns {number} d1 value
 */
export function calcD1(spot, strike, iv, t, r = 0.05) {
  if (spot <= 0 || strike <= 0 || t <= 0 || iv <= 0) return 0;

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * t) / (iv * sqrtT);

  return d1;
}

/**
 * Estimate delta using Black-Scholes
 *
 * @param {string} type - 'call' or 'put'
 * @param {number} spot - Spot price
 * @param {number} strike - Strike price
 * @param {number} iv - Implied volatility as percentage
 * @param {number} daysToExpiry - Days until expiration
 * @returns {number} Estimated delta
 */
export function estimateDelta(type, spot, strike, iv, daysToExpiry) {
  const t = Math.max(daysToExpiry / CALENDAR_DAYS_PER_YEAR, 0.001);
  const ivDecimal = iv / 100;

  const d1 = calcD1(spot, strike, ivDecimal, t);

  if (type === 'call') {
    return normCDF(d1);
  } else {
    return normCDF(d1) - 1;
  }
}

/**
 * Estimate gamma using Black-Scholes
 * Gamma = N'(d1) / (S × σ × √T)
 */
export function estimateGamma(spot, strike, iv, daysToExpiry) {
  const t = Math.max(daysToExpiry / CALENDAR_DAYS_PER_YEAR, 0.001);
  const ivDecimal = iv / 100;

  const d1 = calcD1(spot, strike, ivDecimal, t);
  const sqrtT = Math.sqrt(t);

  return normPDF(d1) / (spot * ivDecimal * sqrtT);
}

// ============================================
// UTILITY EXPORTS
// ============================================

export const CONSTANTS = {
  TRADING_DAYS_PER_YEAR,
  CALENDAR_DAYS_PER_YEAR,
  PRECISION
};
