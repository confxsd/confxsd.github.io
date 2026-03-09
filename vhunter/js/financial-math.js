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
  if (!arr || arr.length === 0) return NaN;

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
  if (!arr || arr.length < 2) return NaN;

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
// PROFESSIONAL VOLATILITY ESTIMATORS
// Used by Bloomberg, QuantLib, and institutional trading systems
// ============================================

/**
 * PARKINSON VOLATILITY ESTIMATOR
 * Uses high-low range - ~5x more efficient than close-to-close
 *
 * Formula: σ² = (1/4n×ln2) × Σ[ln(H/L)]²
 *
 * Reference: Parkinson, M. (1980) "The Extreme Value Method for Estimating
 * the Variance of the Rate of Return"
 *
 * @param {Object[]} bars - Array of OHLC bars {o, h, l, c}
 * @param {number} window - Lookback window
 * @returns {number|null} Annualized volatility as percentage
 */
export function calcParkinsonVolatility(bars, window = 30) {
  if (!bars || bars.length < window) return null;

  const windowBars = bars.slice(-window);
  const ln2 = Math.log(2);

  let sumSquares = 0;
  let validCount = 0;

  for (const bar of windowBars) {
    if (bar.h > 0 && bar.l > 0 && bar.h >= bar.l) {
      const hlRatio = Math.log(bar.h / bar.l);
      sumSquares += hlRatio * hlRatio;
      validCount++;
    }
  }

  if (validCount < window * 0.8) return null; // Need at least 80% valid data

  // Parkinson variance
  const variance = sumSquares / (4 * validCount * ln2);

  // Annualize and convert to percentage
  return Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * GARMAN-KLASS VOLATILITY ESTIMATOR
 * Uses OHLC data - ~7x more efficient than close-to-close
 *
 * Formula: σ² = 0.5×[ln(H/L)]² - (2ln2-1)×[ln(C/O)]²
 *
 * Reference: Garman, M. & Klass, M. (1980) "On the Estimation of Security
 * Price Volatilities from Historical Data"
 *
 * @param {Object[]} bars - Array of OHLC bars {o, h, l, c}
 * @param {number} window - Lookback window
 * @returns {number|null} Annualized volatility as percentage
 */
export function calcGarmanKlassVolatility(bars, window = 30) {
  if (!bars || bars.length < window) return null;

  const windowBars = bars.slice(-window);
  const coeff = 2 * Math.log(2) - 1; // ≈ 0.386

  let sum = 0;
  let validCount = 0;

  for (const bar of windowBars) {
    if (bar.h > 0 && bar.l > 0 && bar.o > 0 && bar.c > 0 && bar.h >= bar.l) {
      const hlTerm = Math.pow(Math.log(bar.h / bar.l), 2);
      const ocTerm = Math.pow(Math.log(bar.c / bar.o), 2);
      sum += 0.5 * hlTerm - coeff * ocTerm;
      validCount++;
    }
  }

  if (validCount < window * 0.8) return null;

  const variance = sum / validCount;

  // Handle negative variance (can happen with extreme moves)
  if (variance <= 0) {
    return calcParkinsonVolatility(bars, window);
  }

  return Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * ROGERS-SATCHELL VOLATILITY ESTIMATOR
 * Handles drift (trending markets) - doesn't assume zero mean
 *
 * Formula: σ² = ln(H/C)×ln(H/O) + ln(L/C)×ln(L/O)
 *
 * Reference: Rogers, L.C.G. & Satchell, S.E. (1991) "Estimating Variance
 * from High, Low and Closing Prices"
 *
 * @param {Object[]} bars - Array of OHLC bars {o, h, l, c}
 * @param {number} window - Lookback window
 * @returns {number|null} Annualized volatility as percentage
 */
export function calcRogersSatchellVolatility(bars, window = 30) {
  if (!bars || bars.length < window) return null;

  const windowBars = bars.slice(-window);

  let sum = 0;
  let validCount = 0;

  for (const bar of windowBars) {
    if (bar.h > 0 && bar.l > 0 && bar.o > 0 && bar.c > 0 && bar.h >= bar.l) {
      const hc = Math.log(bar.h / bar.c);
      const ho = Math.log(bar.h / bar.o);
      const lc = Math.log(bar.l / bar.c);
      const lo = Math.log(bar.l / bar.o);
      sum += hc * ho + lc * lo;
      validCount++;
    }
  }

  if (validCount < window * 0.8) return null;

  const variance = sum / validCount;

  if (variance <= 0) {
    return calcParkinsonVolatility(bars, window);
  }

  return Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * YANG-ZHANG VOLATILITY ESTIMATOR (GOLD STANDARD)
 * The most efficient estimator for stocks - handles overnight gaps AND drift
 * Combines overnight, open-to-close, and Rogers-Satchell components
 *
 * Formula: σ²_YZ = σ²_overnight + k×σ²_open-to-close + (1-k)×σ²_RS
 * where k = 0.34 / (1.34 + (n+1)/(n-1))
 *
 * Reference: Yang, D. & Zhang, Q. (2000) "Drift Independent Volatility
 * Estimation Based on High, Low, Open, and Close Prices"
 *
 * This is what Bloomberg Terminal and professional systems use.
 *
 * @param {Object[]} bars - Array of OHLC bars {o, h, l, c}
 * @param {number} window - Lookback window (default 30)
 * @returns {number|null} Annualized volatility as percentage
 */
export function calcYangZhangVolatility(bars, window = 30) {
  if (!bars || bars.length < window + 1) return null;

  // Need window+1 bars to calculate overnight returns
  const windowBars = bars.slice(-(window + 1));

  // Step 1: Calculate overnight returns (close-to-open)
  const overnightReturns = [];
  for (let i = 1; i < windowBars.length; i++) {
    const prevClose = windowBars[i - 1].c;
    const currOpen = windowBars[i].o;
    if (prevClose > 0 && currOpen > 0) {
      overnightReturns.push(Math.log(currOpen / prevClose));
    }
  }

  // Step 2: Calculate open-to-close returns
  const openCloseReturns = [];
  for (let i = 1; i < windowBars.length; i++) {
    const bar = windowBars[i];
    if (bar.o > 0 && bar.c > 0) {
      openCloseReturns.push(Math.log(bar.c / bar.o));
    }
  }

  if (overnightReturns.length < window * 0.8 || openCloseReturns.length < window * 0.8) {
    return calcGarmanKlassVolatility(bars, window);
  }

  const n = overnightReturns.length;

  // Overnight variance
  const overnightMean = mean(overnightReturns);
  const overnightVar = overnightReturns.reduce((sum, r) =>
    sum + Math.pow(r - overnightMean, 2), 0) / (n - 1);

  // Open-to-close variance
  const ocMean = mean(openCloseReturns);
  const ocVar = openCloseReturns.reduce((sum, r) =>
    sum + Math.pow(r - ocMean, 2), 0) / (n - 1);

  // Rogers-Satchell variance (for the windowed bars, excluding first)
  let rsSum = 0;
  let rsCount = 0;
  for (let i = 1; i < windowBars.length; i++) {
    const bar = windowBars[i];
    if (bar.h > 0 && bar.l > 0 && bar.o > 0 && bar.c > 0 && bar.h >= bar.l) {
      const hc = Math.log(bar.h / bar.c);
      const ho = Math.log(bar.h / bar.o);
      const lc = Math.log(bar.l / bar.c);
      const lo = Math.log(bar.l / bar.o);
      rsSum += hc * ho + lc * lo;
      rsCount++;
    }
  }
  const rsVar = rsCount > 0 ? rsSum / rsCount : 0;

  // Yang-Zhang weighting factor
  // k optimizes efficiency: k = 0.34 / (1.34 + (n+1)/(n-1))
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));

  // Combined Yang-Zhang variance
  const yzVariance = overnightVar + k * ocVar + (1 - k) * rsVar;

  if (yzVariance <= 0) {
    return calcGarmanKlassVolatility(bars, window);
  }

  // Annualize and convert to percentage
  return Math.sqrt(yzVariance * TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * PRIMARY VOLATILITY FUNCTION
 * Uses Yang-Zhang when OHLC data available, falls back to close-to-close
 *
 * @param {number[]|Object[]} data - Either array of closes OR array of OHLC bars
 * @param {number} window - Lookback window
 * @returns {number|null} Annualized volatility as percentage
 */
export function calcRealizedVolatility(data, window = 30) {
  if (!data || data.length < window) return null;

  // Check if we have OHLC data (array of objects with o, h, l, c)
  if (typeof data[0] === 'object' && data[0].h !== undefined) {
    // Use Yang-Zhang (professional grade)
    return calcYangZhangVolatility(data, window);
  }

  // Fallback to close-to-close for simple price arrays
  return calcCloseToCloseVolatility(data, window);
}

/**
 * Close-to-Close Volatility (basic method)
 * Used as fallback when only closing prices available
 */
export function calcCloseToCloseVolatility(prices, window = 30) {
  if (!prices || prices.length < window + 1) {
    return null;
  }

  const windowPrices = prices.slice(-(window + 1));
  const returns = calcLogReturns(windowPrices);

  if (returns.length < window) {
    return null;
  }

  const volatility = stdDev(returns, true);

  if (D) {
    const annualized = new D(volatility).times(sqrt(TRADING_DAYS_PER_YEAR)).times(100);
    return fromDecimal(annualized);
  }

  return volatility * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * Calculate RV for multiple windows using best available method
 * @param {number[]|Object[]} data - Price data (closes or OHLC bars)
 * @returns {Object} RV for each window
 */
export function calcRealizedVolatilityMulti(data) {
  return {
    rv5: calcRealizedVolatility(data, 5),
    rv10: calcRealizedVolatility(data, 10),
    rv20: calcRealizedVolatility(data, 20),
    rv30: calcRealizedVolatility(data, 30),
    rv60: data?.length >= 61 ? calcRealizedVolatility(data, 60) : null
  };
}

/**
 * Get all volatility estimates for comparison
 * Useful for analyzing which estimator works best for a given asset
 */
export function calcAllVolatilityEstimates(bars, window = 30) {
  if (!bars || bars.length < window + 1) return null;

  const closes = bars.map(b => b.c);

  return {
    closeToClose: calcCloseToCloseVolatility(closes, window),
    parkinson: calcParkinsonVolatility(bars, window),
    garmanKlass: calcGarmanKlassVolatility(bars, window),
    rogersSatchell: calcRogersSatchellVolatility(bars, window),
    yangZhang: calcYangZhangVolatility(bars, window),
    // The recommended one
    best: calcYangZhangVolatility(bars, window)
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
// BLACK-SCHOLES OPTION PRICING
// Professional grade - used by Bloomberg, QuantLib
// ============================================

// Current risk-free rate (update from market data)
let RISK_FREE_RATE = 0.04; // ~4.0% - update via setRiskFreeRate()

export function setRiskFreeRate(rate) {
  RISK_FREE_RATE = rate;
}

export function getRiskFreeRate() {
  return RISK_FREE_RATE;
}

/**
 * Black-Scholes Call Option Price
 * C = S×N(d1) - K×e^(-rT)×N(d2)
 *
 * @param {number} S - Spot price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiry in years
 * @param {number} r - Risk-free rate (decimal)
 * @param {number} sigma - Volatility (decimal)
 * @returns {number} Call option price
 */
export function blackScholesCall(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, S - K); // Intrinsic value at expiry
  if (sigma <= 0) return Math.max(0, S - K * Math.exp(-r * T));

  const d1 = calcD1(S, K, sigma, T, r);
  const d2 = d1 - sigma * Math.sqrt(T);

  return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
}

/**
 * Black-Scholes Put Option Price
 * P = K×e^(-rT)×N(-d2) - S×N(-d1)
 *
 * @param {number} S - Spot price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiry in years
 * @param {number} r - Risk-free rate (decimal)
 * @param {number} sigma - Volatility (decimal)
 * @returns {number} Put option price
 */
export function blackScholesPut(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, K - S); // Intrinsic value at expiry
  if (sigma <= 0) return Math.max(0, K * Math.exp(-r * T) - S);

  const d1 = calcD1(S, K, sigma, T, r);
  const d2 = d1 - sigma * Math.sqrt(T);

  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

/**
 * Calculate ATM Straddle Price using Black-Scholes
 * Straddle = Call + Put (at the same strike, typically ATM)
 *
 * This is the PROFESSIONAL method - not the 0.8 approximation
 *
 * @param {number} spotPrice - Current price
 * @param {number} iv - Implied volatility as percentage
 * @param {number} days - Days to expiration
 * @param {number} r - Risk-free rate (optional, uses default)
 * @returns {number} Straddle price
 */
export function calcStraddlePrice(spotPrice, iv, days, r = null) {
  const T = days / CALENDAR_DAYS_PER_YEAR;
  const sigma = iv / 100;
  const rate = r !== null ? r : RISK_FREE_RATE;

  // ATM strike = forward price for true ATM
  const atmStrike = spotPrice * Math.exp(rate * T);

  const call = blackScholesCall(spotPrice, atmStrike, T, rate, sigma);
  const put = blackScholesPut(spotPrice, atmStrike, T, rate, sigma);

  return call + put;
}

/**
 * Quick straddle approximation (for UI where speed matters)
 * Uses the 0.8 coefficient but with proper calibration
 * Straddle ≈ 0.798 × S × σ × √T (for ATM, at-the-money forward)
 */
export function calcStraddlePriceQuick(spotPrice, iv, days) {
  const sigma = iv / 100;
  const T = days / CALENDAR_DAYS_PER_YEAR;
  // 0.798 comes from: 2 × N(σ√T/2) × S ≈ 0.798 × S × σ × √T for small σ√T
  return 0.798 * spotPrice * sigma * Math.sqrt(T);
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
// DELTA-BASED STRIKE SELECTION
// Professional skew analysis uses delta-normalized strikes
// ============================================

/**
 * Find the option closest to a target delta
 * Used for proper skew calculation (25-delta put, 25-delta call, etc.)
 *
 * @param {number} targetDelta - Target delta (e.g., 0.25 for 25-delta call, -0.25 for 25-delta put)
 * @param {Array} options - Array of option contracts
 * @param {number} spotPrice - Current spot price
 * @param {string} type - 'call' or 'put'
 * @returns {Object|null} Option closest to target delta
 */
export function findOptionByDelta(targetDelta, options, spotPrice, type) {
  if (!options || options.length === 0) return null;

  const filteredOptions = options.filter(o =>
    o.details?.contract_type === type &&
    o.implied_volatility > 0
  );

  if (filteredOptions.length === 0) return null;

  let closest = null;
  let minDiff = Infinity;

  for (const opt of filteredOptions) {
    const strike = opt.details.strike_price;
    const iv = opt.implied_volatility;
    const expDate = opt.details.expiration_date;
    const dte = Math.max(1, Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24)));

    // Get delta from API or estimate
    let delta = opt.greeks?.delta;
    if (delta === undefined || delta === null) {
      delta = estimateDelta(type, spotPrice, strike, iv * 100, dte);
    }

    const diff = Math.abs(delta - targetDelta);
    if (diff < minDiff) {
      minDiff = diff;
      closest = { ...opt, calculatedDelta: delta };
    }
  }

  return closest;
}

/**
 * Find ATM strike using delta (50-delta)
 * More accurate than spot% method
 */
export function findATMStrike(options, spotPrice) {
  // Try to find 50-delta call
  const atmCall = findOptionByDelta(0.5, options, spotPrice, 'call');
  if (atmCall) return atmCall.details.strike_price;

  // Fallback to closest strike to spot
  const strikes = [...new Set(options.map(o => o.details?.strike_price).filter(Boolean))];
  return strikes.reduce((prev, curr) =>
    Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
  );
}

/**
 * Calculate proper delta-normalized skew
 * Returns 25-delta put IV, ATM IV, 25-delta call IV
 */
export function calcDeltaNormalizedSkew(options, spotPrice) {
  // Find 25-delta put (delta ≈ -0.25)
  const put25d = findOptionByDelta(-0.25, options, spotPrice, 'put');

  // Find 25-delta call (delta ≈ 0.25)
  const call25d = findOptionByDelta(0.25, options, spotPrice, 'call');

  // Find ATM (50-delta call)
  const atmCall = findOptionByDelta(0.5, options, spotPrice, 'call');

  const put25dIV = put25d?.implied_volatility ? put25d.implied_volatility * 100 : null;
  const call25dIV = call25d?.implied_volatility ? call25d.implied_volatility * 100 : null;
  const atmIV = atmCall?.implied_volatility ? atmCall.implied_volatility * 100 : null;

  if (!atmIV) {
    return { error: 'Cannot find ATM IV' };
  }

  // Calculate normalized skew
  const putSkew = put25dIV ? ((put25dIV / atmIV) - 1) * 100 : null;
  const callSkew = call25dIV ? ((call25dIV / atmIV) - 1) * 100 : null;
  const skewDiff = putSkew !== null && callSkew !== null ? putSkew - callSkew : null;

  // Risk reversal = 25d call IV - 25d put IV (negative = put skew)
  const riskReversal = call25dIV && put25dIV ? call25dIV - put25dIV : null;

  // Butterfly = 25d put IV + 25d call IV - 2×ATM IV (convexity of smile)
  const butterfly = put25dIV && call25dIV && atmIV ?
    put25dIV + call25dIV - 2 * atmIV : null;

  return {
    put25dIV,
    put25dStrike: put25d?.details?.strike_price,
    put25dDelta: put25d?.calculatedDelta,
    atmIV,
    atmStrike: atmCall?.details?.strike_price,
    call25dIV,
    call25dStrike: call25d?.details?.strike_price,
    call25dDelta: call25d?.calculatedDelta,
    putSkew,
    callSkew,
    skewDiff,
    riskReversal,
    butterfly,
    interpretation: skewDiff > 5 ? 'PUT_SKEW (downside fear)' :
                    skewDiff < -5 ? 'CALL_SKEW (upside demand)' : 'BALANCED'
  };
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

  const min = validHistory.reduce((a, b) => Math.min(a, b), Infinity);
  const max = validHistory.reduce((a, b) => Math.max(a, b), -Infinity);

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
 * Using Abramowitz and Stegun approximation 7.1.26 for erf(x)
 *
 * Φ(x) = 0.5 × (1 + erf(x/√2))
 *
 * The coefficients below approximate erf(x), so we must scale x by √2
 * to get the standard normal CDF.
 */
export function normCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  // CRITICAL: Scale by √2 for CDF approximation via erf
  const scaledX = Math.abs(x) / Math.sqrt(2);

  const t = 1 / (1 + p * scaledX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-scaledX * scaledX);

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
  if (spot <= 0 || strike <= 0 || t <= 0 || iv <= 0) return NaN;

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
