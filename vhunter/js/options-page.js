// VHunter Options Page Module
import { fetchTickerData, fetchClaude, fetchTickerDetails } from './api.js';
import { formatNum, avg, erf, calculateMaxPain, calculateHistoricalVolatility } from './utils.js';
import { getFullIVAnalysis, recordIV } from './iv-history.js';
import {
  calcVRP, calcVolatilityMetrics, classifyVolSetup, calcTermSteepness,
  calcGEX, calcDEX, calcGammaRatio, calcOptionsExposure, calcPriceTrend, calcVolTrend, calcPVGD
} from './indicators.js';
import * as volTools from './vol-tools.js';
import { getCurrentThesis } from './feed.js';
import { updateDynamicTooltips, updateSectionTooltips } from './teaching-tips.js';
// Advanced gamma analytics (SIG-level dealer positioning)
import * as gammaTools from './gamma.js';
import { addToHistory, setOptionsSearchCallback, renderOptionsHistory } from './history.js';
// Standardized financial calculations for consistency
import * as finMath from './financial-math.js';

// Live mode state
let liveInterval = null;
let isLiveMode = false;

export let optionsData = {
  ticker: null,
  spotPrice: 0,
  change: 0,
  changePct: 0,
  options: null,
  historicalIV: [],
  hv30: 0,
  bars: [], // Full OHLC bars for Yang-Zhang volatility
  prices: [],
  vrpMetrics: null,
  ivAnalysis: null,
  volSetup: null,
  // GEX/DEX metrics (institutional-grade)
  gexMetrics: null,
  dexMetrics: null,
  gammaRatio: null,
  exposure: null,
  pvgd: null,
  // Advanced gamma analytics
  gammaAnalysis: null,
  // Earnings data
  earningsDate: null,
  daysToEarnings: null
};

export async function loadOptionsData(skipAI = false) {
  const ticker = document.getElementById('optTicker').value.toUpperCase().trim();
  if (!ticker) {
    // Reset to empty state when no ticker
    stopLiveMode();
    resetOptionsDisplay();
    return;
  }

  // Stop live mode if ticker changed
  if (isLiveMode && optionsData.ticker && optionsData.ticker !== ticker) {
    stopLiveMode();
  }

  document.querySelector('.spot-price').textContent = 'Loading...';
  document.querySelector('.spot-change').textContent = '';
  document.getElementById('optChainBody').innerHTML = '<div class="chain-loading">Loading options data...</div>';

  try {
    // Fetch ticker data and details in parallel
    const [tickerResult, tickerDetails] = await Promise.all([
      fetchTickerData(ticker),
      fetchTickerDetails(ticker)
    ]);

    const { prev, aggs, options } = tickerResult;

    if (!prev?.results?.[0]) {
      alert('Ticker not found');
      return;
    }

    const spot = prev.results[0];
    optionsData.ticker = ticker;
    optionsData.spotPrice = spot.c;
    // Use real-time change data if available from snapshot, otherwise calculate from open
    if (spot.todaysChange != null && spot.todaysChangePerc != null) {
      optionsData.change = spot.todaysChange;
      optionsData.changePct = spot.todaysChangePerc;
    } else {
      optionsData.change = spot.c - (spot.prevClose || spot.o);
      optionsData.changePct = ((spot.c - (spot.prevClose || spot.o)) / (spot.prevClose || spot.o)) * 100;
    }
    optionsData.options = options;

    // Parse earnings date from ticker details
    // Polygon returns next_earnings_date in format "YYYY-MM-DD" or as ISO string
    const earningsDateRaw = tickerDetails?.results?.next_earnings_date;
    if (earningsDateRaw) {
      const earningsDate = new Date(earningsDateRaw);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysToEarnings = Math.ceil((earningsDate - today) / (1000 * 60 * 60 * 24));
      optionsData.earningsDate = earningsDate;
      optionsData.daysToEarnings = daysToEarnings > 0 ? daysToEarnings : null;
    } else {
      optionsData.earningsDate = null;
      optionsData.daysToEarnings = null;
    }

    if (aggs?.results?.length > 0) {
      const bars = aggs.results; // Full OHLC bars
      const prices = bars.map(d => d.c);
      optionsData.bars = bars; // Store for Yang-Zhang
      optionsData.prices = prices; // Keep for backwards compatibility
      // Use Yang-Zhang volatility (professional grade) when OHLC available
      optionsData.hv30 = finMath.calcRealizedVolatility(bars, 30) || 0;
    }

    updateSpotDisplay();
    processOptionsPageData(options, optionsData.spotPrice);
    populateExpiryDropdown(options);
    autoPopulateEarningsVol(options);

    // Skip AI analysis during live mode to avoid rate limits
    if (!skipAI) {
      runOptionsAiAnalysis(ticker);
    }

    // Add ticker to history and update the history strip
    addToHistory(ticker);

  } catch (e) {
    console.error('Options load error:', e);
    document.querySelector('.spot-price').textContent = 'Error';
    document.getElementById('optChainBody').innerHTML = `<div class="chain-loading" style="color:#ef4444">Failed to load: ${e.message}</div>`;
  }
}

function updateSpotDisplay() {
  document.querySelector('.spot-price').textContent = '$' + optionsData.spotPrice.toFixed(2);
  const changeEl = document.querySelector('.spot-change');
  const sign = optionsData.change >= 0 ? '+' : '';
  changeEl.textContent = `${sign}$${optionsData.change.toFixed(2)} (${sign}${optionsData.changePct.toFixed(2)}%)`;
  changeEl.className = 'spot-change ' + (optionsData.change >= 0 ? 'positive' : 'negative');
}

function processOptionsPageData(options, spotPrice) {
  if (!options?.all?.length) return;

  const allOptions = options.all;
  let callVol = 0, putVol = 0, callOI = 0, putOI = 0;
  let ivSum = 0, ivCount = 0;
  const strikeData = {};
  const expiryIV = { weekly: [], monthly: [], quarterly: [], sixMonth: [] };

  allOptions.forEach(o => {
    const details = o.details;
    const day = o.day;
    if (!details) return;

    const strike = details.strike_price;
    const type = details.contract_type;
    const vol = day?.volume || 0;
    const oi = o.open_interest || 0;
    const iv = o.implied_volatility || 0;

    if (type === 'call') {
      callVol += vol;
      callOI += oi;
    } else {
      putVol += vol;
      putOI += oi;
    }

    if (iv > 0) {
      ivSum += iv;
      ivCount++;

      const expDate = details.expiration_date;
      const daysToExp = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysToExp <= 7) expiryIV.weekly.push(iv);
      else if (daysToExp <= 30) expiryIV.monthly.push(iv);
      else if (daysToExp <= 90) expiryIV.quarterly.push(iv);
      else expiryIV.sixMonth.push(iv);
    }

    if (!strikeData[strike]) strikeData[strike] = { callOI: 0, putOI: 0, callVol: 0, putVol: 0, callIV: [], putIV: [] };
    if (type === 'call') {
      strikeData[strike].callOI += oi;
      strikeData[strike].callVol += vol;
      if (iv > 0) strikeData[strike].callIV.push(iv);
    } else {
      strikeData[strike].putOI += oi;
      strikeData[strike].putVol += vol;
      if (iv > 0) strikeData[strike].putIV.push(iv);
    }
  });

  const avgIV = ivCount > 0 ? (ivSum / ivCount) * 100 : 0;
  const pcRatioVol = putVol / (callVol || 1);
  const pcRatioOI = putOI / (callOI || 1);

  // Calculate term structure for VRP analysis
  const termStructure = {
    weekly: expiryIV.weekly.length > 0 ? avg(expiryIV.weekly) * 100 : null,
    monthly: expiryIV.monthly.length > 0 ? avg(expiryIV.monthly) * 100 : null,
    quarterly: expiryIV.quarterly.length > 0 ? avg(expiryIV.quarterly) * 100 : null,
    sixMonth: expiryIV.sixMonth.length > 0 ? avg(expiryIV.sixMonth) * 100 : null
  };

  updateQuickStats(avgIV, optionsData.hv30, spotPrice, pcRatioVol, termStructure);
  updateVolatilitySection(expiryIV, avgIV, spotPrice, strikeData);
  updateFlowSection(callVol, putVol, callOI, putOI, pcRatioVol, pcRatioOI);
  updateStrikesSection(options, spotPrice, strikeData);

  // Update Vol Tools UI
  const skew = calculateSkewData(strikeData, spotPrice, avgIV);
  updateVolToolsUI(avgIV, termStructure, skew, pcRatioVol);

  // Update section tooltips with actual data
  updateSectionTooltips({
    ticker: optionsData.ticker,
    termStructure,
    skew,
    spotPrice,
    avgIV,
    hv30: optionsData.hv30,
    gammaAnalysis: optionsData.gammaAnalysis
  });

  // Update educational components
  updateThreeLenses();
  updateVolatilityCone();
}

function calculateSkewData(strikeData, spotPrice, avgIV) {
  // Use delta-normalized skew (professional method)
  // This finds actual 25-delta options instead of arbitrary % bands
  const allOptions = optionsData.options?.all || [];

  if (allOptions.length > 0) {
    // PROFESSIONAL: Use delta-based strike selection
    const deltaSkew = finMath.calcDeltaNormalizedSkew(allOptions, spotPrice);

    if (!deltaSkew.error) {
      return {
        putSkew: deltaSkew.putSkew,
        callSkew: deltaSkew.callSkew,
        skewDiff: deltaSkew.skewDiff,
        interpretation: deltaSkew.interpretation,
        putIV: deltaSkew.put25dIV,
        atmIV: deltaSkew.atmIV,
        callIV: deltaSkew.call25dIV,
        pcSkew: deltaSkew.riskReversal, // Risk reversal = call IV - put IV
        riskReversal: deltaSkew.riskReversal,
        butterfly: deltaSkew.butterfly,
        // Include strikes for display
        put25dStrike: deltaSkew.put25dStrike,
        atmStrike: deltaSkew.atmStrike,
        call25dStrike: deltaSkew.call25dStrike,
        method: 'delta-normalized' // Flag for UI
      };
    }
  }

  // FALLBACK: Use old method if delta-based fails
  const strikes = Object.keys(strikeData).map(Number).sort((a, b) => a - b);
  const atmStrike = strikes.reduce((prev, curr) =>
    Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev, strikes[0]);
  const otmPutStrike = strikes.filter(s => s < atmStrike * 0.92).pop() || atmStrike;
  const otmCallStrike = strikes.filter(s => s > atmStrike * 1.08)[0] || atmStrike;

  const atmIV = strikeData[atmStrike] ?
    avg([...strikeData[atmStrike].callIV, ...strikeData[atmStrike].putIV]) * 100 : avgIV;
  const putIV = strikeData[otmPutStrike]?.putIV.length > 0 ?
    avg(strikeData[otmPutStrike].putIV) * 100 : atmIV;
  const callIV = strikeData[otmCallStrike]?.callIV.length > 0 ?
    avg(strikeData[otmCallStrike].callIV) * 100 : atmIV;

  const skewResult = volTools.calcPutCallSkew(putIV, callIV, atmIV);
  return {
    ...skewResult,
    putIV,
    atmIV,
    callIV,
    pcSkew: callIV - putIV, // Match delta-normalized convention: call IV - put IV
    method: 'spot-percent' // Flag that this is fallback
  };
}

function updateQuickStats(avgIV, hv30, spotPrice, pcRatio, termStructure) {
  // Get IV analysis from history (includes IV Rank and Percentile)
  const ivAnalysis = getFullIVAnalysis(optionsData.ticker, avgIV);
  optionsData.ivAnalysis = ivAnalysis;

  // Calculate VRP (IV - RV)
  const vrp = calcVRP(avgIV, hv30);

  // Calculate term steepness if we have term structure data
  let termSteepness = null;
  if (termStructure?.weekly && termStructure?.sixMonth) {
    termSteepness = calcTermSteepness(termStructure.weekly, termStructure.sixMonth);
  }

  // Classify the volatility setup
  const volSetup = classifyVolSetup({
    ivRank: ivAnalysis.ivRank,
    vrp: vrp,
    iv: avgIV, // Current IV for fallback estimation
    rvRank: null,
    termSteepness: termSteepness
  });
  optionsData.volSetup = volSetup;
  optionsData.vrpMetrics = { iv: avgIV, rv30: hv30, vrp, termSteepness };

  // IV Rank display (from actual history if available, otherwise use current IV as estimate)
  const ivRank = ivAnalysis.ivRank != null ? ivAnalysis.ivRank : null;
  const ivRankClass = ivRank != null ? (ivRank > 60 ? 'high' : ivRank < 30 ? 'low' : 'neutral') : '';
  document.getElementById('optIvRank').textContent = ivRank != null ? ivRank.toFixed(0) + '%' : '--';
  document.getElementById('optIvRank').className = 'opt-stat-value ' + ivRankClass;
  document.getElementById('optIvRank').title = ivAnalysis.historyDays > 0 ?
    `Based on ${ivAnalysis.historyDays} days of history` : 'Building history - check back tomorrow';

  // IV Percentile
  const ivPct = ivAnalysis.ivPercentile != null ? ivAnalysis.ivPercentile : ivRank;
  document.getElementById('optIvPct').textContent = ivPct.toFixed(0) + '%';
  document.getElementById('optIvPct').className = 'opt-stat-value ' + ivRankClass;

  // HV 30d
  document.getElementById('optHv30').textContent = hv30.toFixed(0) + '%';

  // VRP (IV - HV) - The key metric
  const vrpClass = vrp > 10 ? 'high' : vrp < -5 ? 'low' : 'neutral';
  const vrpEl = document.getElementById('optIvHvDiff');
  vrpEl.textContent = (vrp >= 0 ? '+' : '') + vrp.toFixed(0) + '%';
  vrpEl.className = 'opt-stat-value ' + vrpClass;
  vrpEl.title = vrp > 10 ? 'Options expensive - consider selling premium' :
    vrp < -5 ? 'Options cheap - consider buying premium' : 'Fair value';

  // Expected move (weekly) using standardized calculation
  // Use 7 calendar days (not 5 trading days) since calcExpectedMove divides by 365
  const expMove = finMath.calcExpectedMove(spotPrice, avgIV, 7);
  document.getElementById('optExpMove').textContent = '±$' + expMove.toFixed(2);

  // P/C Ratio
  const pcClass = pcRatio > 1.2 ? 'high' : pcRatio < 0.8 ? 'low' : 'neutral';
  document.getElementById('optPcRatio').textContent = pcRatio.toFixed(2);
  document.getElementById('optPcRatio').className = 'opt-stat-value ' + pcClass;

  // Add VRP setup badge if element exists
  const setupBadge = document.getElementById('optVolSetup');
  if (setupBadge) {
    setupBadge.textContent = volSetup.setup.replace('_', ' ');
    setupBadge.className = 'vrp-badge ' + (
      volSetup.setup.includes('SELL') || volSetup.setup === 'HIGH_VRP' ? 'r' :
        volSetup.setup.includes('BUY') || volSetup.setup === 'NEGATIVE_VRP' ? 'g' : 'y'
    );
    setupBadge.title = volSetup.description;
  }

  // Update dynamic tooltips with current data
  updateDynamicTooltips({
    ticker: optionsData.ticker,
    ivRank,
    ivPct,
    hv30,
    vrp,
    expMove,
    pcRatio,
    volSetup,
    spotPrice,
    avgIV
  });
}

function updateVolatilitySection(expiryIV, avgIV, spotPrice, strikeData) {
  const termStructure = document.getElementById('optTermStructure');
  const avgWeekly = expiryIV.weekly.length > 0 ? avg(expiryIV.weekly) * 100 : 0;
  const avgMonthly = expiryIV.monthly.length > 0 ? avg(expiryIV.monthly) * 100 : 0;
  const avgQuarterly = expiryIV.quarterly.length > 0 ? avg(expiryIV.quarterly) * 100 : 0;
  const avgSixMonth = expiryIV.sixMonth.length > 0 ? avg(expiryIV.sixMonth) * 100 : 0;
  const maxIV = Math.max(avgWeekly, avgMonthly, avgQuarterly, avgSixMonth, 1);

  const termBars = termStructure.querySelectorAll('.term-bar');
  const ivs = [avgWeekly, avgMonthly, avgQuarterly, avgSixMonth];
  termBars.forEach((bar, i) => {
    bar.querySelector('.term-value').textContent = ivs[i] ? ivs[i].toFixed(0) + '%' : '--';
    bar.querySelector('.term-fill').style.width = (ivs[i] / maxIV * 100) + '%';
  });

  // Use delta-normalized skew (professional method)
  const skewData = calculateSkewData(strikeData, spotPrice, avgIV);

  const skewItems = document.querySelectorAll('#optSkewDisplay .skew-item');
  if (skewItems[0]) {
    const label = skewData.method === 'delta-normalized' ? '25Δ Put' : 'OTM Put';
    skewItems[0].querySelector('.skew-label').textContent = label;
    skewItems[0].querySelector('.skew-value').textContent = skewData.putIV != null ? skewData.putIV.toFixed(0) + '%' : '--';
  }
  if (skewItems[1]) {
    skewItems[1].querySelector('.skew-value').textContent = skewData.atmIV != null ? skewData.atmIV.toFixed(0) + '%' : '--';
  }
  if (skewItems[2]) {
    const label = skewData.method === 'delta-normalized' ? '25Δ Call' : 'OTM Call';
    skewItems[2].querySelector('.skew-label').textContent = label;
    skewItems[2].querySelector('.skew-value').textContent = skewData.callIV != null ? skewData.callIV.toFixed(0) + '%' : '--';
  }

  // Show risk reversal (call IV - put IV) for professional display
  const rr = skewData.riskReversal || (skewData.callIV != null && skewData.putIV != null ? skewData.callIV - skewData.putIV : null);
  document.getElementById('optPcSkew').textContent = rr != null ? (rr >= 0 ? '+' : '') + rr.toFixed(1) + '%' : '--';

  // Use standardized expected move calculations for consistency
  // Calendar days (not trading days) since calcExpectedMove divides by 365
  const daily = finMath.calcExpectedMove(spotPrice, avgIV, 1);
  const weekly = finMath.calcExpectedMove(spotPrice, avgIV, 7);
  const monthly = finMath.calcExpectedMove(spotPrice, avgIV, 30);
  document.getElementById('optExpDaily').textContent = `$${(spotPrice - daily).toFixed(2)} - $${(spotPrice + daily).toFixed(2)}`;
  document.getElementById('optExpWeekly').textContent = `$${(spotPrice - weekly).toFixed(2)} - $${(spotPrice + weekly).toFixed(2)}`;
  document.getElementById('optExpMonthly').textContent = `$${(spotPrice - monthly).toFixed(2)} - $${(spotPrice + monthly).toFixed(2)}`;
}

function updateFlowSection(callVol, putVol, callOI, putOI, pcRatioVol, pcRatioOI) {
  const totalVol = callVol + putVol || 1;
  const totalOI = callOI + putOI || 1;

  document.getElementById('optCallVolBar').style.width = (callVol / totalVol * 100) + '%';
  document.getElementById('optPutVolBar').style.width = (putVol / totalVol * 100) + '%';
  document.getElementById('optCallVol').textContent = formatNum(callVol);
  document.getElementById('optPutVol').textContent = formatNum(putVol);

  document.getElementById('optCallOiBar').style.width = (callOI / totalOI * 100) + '%';
  document.getElementById('optPutOiBar').style.width = (putOI / totalOI * 100) + '%';
  document.getElementById('optCallOi').textContent = formatNum(callOI);
  document.getElementById('optPutOi').textContent = formatNum(putOI);

  const netFlow = callVol - putVol;
  document.getElementById('optNetFlow').textContent = (netFlow >= 0 ? '+' : '') + formatNum(netFlow);
  document.getElementById('optNetFlow').className = netFlow >= 0 ? 'g' : 'r';
  document.getElementById('optVolRatio').textContent = (1 / pcRatioVol).toFixed(2) + ':1';
  document.getElementById('optOiRatio').textContent = pcRatioOI.toFixed(2);
  document.getElementById('optOiChange').textContent = '--';

  const sentiment = 50 + (1 / pcRatioVol - 1) * 25 + (1 / pcRatioOI - 1) * 15;
  const clampedSentiment = Math.max(0, Math.min(100, sentiment));
  document.getElementById('optSentimentMarker').style.left = clampedSentiment + '%';
  const sentimentLabel = clampedSentiment > 60 ? 'Bullish' : clampedSentiment < 40 ? 'Bearish' : 'Neutral';
  const sentimentClass = clampedSentiment > 60 ? 'g' : clampedSentiment < 40 ? 'r' : '';
  document.getElementById('optSentimentValue').textContent = sentimentLabel;
  document.getElementById('optSentimentValue').className = 'gauge-value ' + sentimentClass;
}

function updateStrikesSection(options, spotPrice, strikeData) {
  const weeklyMaxPain = calculateMaxPain(options.weekly);
  const monthlyMaxPain = calculateMaxPain(options.monthly);
  const quarterlyMaxPain = calculateMaxPain(options.quarterly || options.sixMonth);

  updateMaxPainDisplay('optMpWeekly', 'optMpWeeklyDist', weeklyMaxPain, spotPrice);
  updateMaxPainDisplay('optMpMonthly', 'optMpMonthlyDist', monthlyMaxPain, spotPrice);
  updateMaxPainDisplay('optMpQuarterly', 'optMpQuarterlyDist', quarterlyMaxPain, spotPrice);

  // Calculate real GEX using Polygon's greeks (institutional-grade)
  const allOptions = options.all || [];
  const gexMetrics = calcGEX(allOptions, spotPrice);
  const dexMetrics = calcDEX(allOptions, spotPrice);
  const gammaRatio = calcGammaRatio(allOptions);
  const exposure = calcOptionsExposure(allOptions, spotPrice);

  // Advanced gamma analytics (SIG-level)
  const gammaAnalysis = gammaTools.analyzeGamma(allOptions, spotPrice);

  // Store for AI analysis
  optionsData.gexMetrics = gexMetrics;
  optionsData.dexMetrics = dexMetrics;
  optionsData.gammaRatio = gammaRatio;
  optionsData.exposure = exposure;
  optionsData.gammaAnalysis = gammaAnalysis;

  // Calculate PVGD if we have prices
  if (optionsData.prices?.length > 30) {
    optionsData.pvgd = calcPVGD(optionsData.prices, allOptions, spotPrice);
  }

  // OI-based walls (legacy display)
  const strikes = Object.entries(strikeData).map(([strike, data]) => ({
    strike: parseFloat(strike),
    ...data
  })).filter(s => s.strike > spotPrice * 0.8 && s.strike < spotPrice * 1.2);

  const topCallWalls = [...strikes].sort((a, b) => b.callOI - a.callOI).slice(0, 3);
  const topPutWalls = [...strikes].sort((a, b) => b.putOI - a.putOI).slice(0, 3);

  document.getElementById('optCallWalls').innerHTML = topCallWalls.map(w =>
    `<div>$${w.strike} <span style="color:#94a3b8">(${formatNum(w.callOI)})</span></div>`
  ).join('') || '--';

  document.getElementById('optPutWalls').innerHTML = topPutWalls.map(w =>
    `<div>$${w.strike} <span style="color:#94a3b8">(${formatNum(w.putOI)})</span></div>`
  ).join('') || '--';

  // Use advanced gamma analysis for flip point and walls
  const levels = gammaAnalysis.levels || {};
  const gexZero = levels.zeroGamma || gexMetrics.gexZeroLine || spotPrice;
  const callWall = levels.callWall || gexMetrics.callWall || topCallWalls[0]?.strike || spotPrice;
  const putWall = levels.putWall || gexMetrics.putWall || topPutWalls[0]?.strike || spotPrice;
  const volTrigger = levels.volTrigger;

  document.getElementById('optGexFlip').textContent = '$' + gexZero.toFixed(0);
  document.getElementById('optGexFlip').title = `Zero Gamma: ${levels.zeroGammaDist || '--'}% from spot`;

  document.getElementById('optGexCallWall').textContent = '$' + callWall.toFixed(0);
  document.getElementById('optGexCallWall').title = `Call Wall: ${levels.callWallDist || '--'}% above spot - RESISTANCE`;
  document.getElementById('optGexPutWall').textContent = '$' + putWall.toFixed(0);
  document.getElementById('optGexPutWall').title = `Put Wall: ${levels.putWallDist || '--'}% below spot - SUPPORT`;

  // Vol Trigger display (if element exists)
  const volTriggerEl = document.getElementById('optVolTrigger');
  if (volTriggerEl && volTrigger) {
    volTriggerEl.textContent = '$' + volTrigger.toFixed(0);
    volTriggerEl.title = `${levels.volTriggerDist}% below spot - Below = volatility expansion`;
    volTriggerEl.className = spotPrice < volTrigger ? 'r' : 'y';
  }

  // Real GEX regime display using advanced analytics
  const regime = gammaAnalysis.regime || {};
  const gexEl = document.getElementById('optNetGex');
  const netGEXFormatted = gammaTools.formatGEX(gammaAnalysis.netGEX);

  if (regime.regime === 'POSITIVE' || gexMetrics.regime === 'POSITIVE_GAMMA') {
    gexEl.textContent = `+GEX ${netGEXFormatted}`;
    gexEl.className = 'g';
    gexEl.title = regime.description || gexMetrics.regimeDesc;
  } else if (regime.regime === 'NEGATIVE_DEEP') {
    gexEl.textContent = `-GEX DEEP ${netGEXFormatted}`;
    gexEl.className = 'r';
    gexEl.title = regime.description || 'Below vol trigger - amplified moves';
  } else if (regime.regime === 'NEGATIVE' || gexMetrics.regime === 'NEGATIVE_GAMMA') {
    gexEl.textContent = `-GEX ${netGEXFormatted}`;
    gexEl.className = 'y';
    gexEl.title = regime.description || gexMetrics.regimeDesc;
  } else {
    gexEl.textContent = `GEX ${netGEXFormatted}`;
    gexEl.className = '';
    gexEl.title = 'Neutral gamma regime';
  }

  // Delta Flow display (if element exists)
  const deltaFlow = gammaAnalysis.deltaFlow;
  const deltaFlowEl = document.getElementById('optDeltaFlow');
  if (deltaFlowEl && deltaFlow) {
    deltaFlowEl.textContent = deltaFlow.hedgingPressure;
    deltaFlowEl.className = deltaFlow.netDelta > 0 ? 'g' : deltaFlow.netDelta < 0 ? 'r' : '';
    deltaFlowEl.title = `Intensity: ${deltaFlow.intensity} | Call: ${deltaFlow.callBias} | Put: ${deltaFlow.putBias}`;
  }

  // Charm/Pinning display (if element exists)
  const charm = gammaAnalysis.charm;
  const charmEl = document.getElementById('optCharmPin');
  if (charmEl && charm && charm.pinningStrike) {
    charmEl.textContent = charm.charmPressure !== 'NONE' ? `$${charm.pinningStrike}` : '--';
    charmEl.title = charm.signal;
    charmEl.className = charm.charmPressure === 'STRONG' ? 'y' : '';
  }

  // Update Gamma Ratio display if element exists
  const gammaRatioEl = document.getElementById('optGammaRatio');
  if (gammaRatioEl) {
    gammaRatioEl.textContent = gammaRatio.gammaRatioFormatted;
    gammaRatioEl.className = gammaRatio.signal === 'BULLISH' ? 'g' :
                              gammaRatio.signal === 'BEARISH' ? 'r' : '';
    gammaRatioEl.title = `${gammaRatio.interpretation} - ${gammaRatio.signal}`;
  }

  // Update DEX display if element exists
  const dexEl = document.getElementById('optNetDex');
  if (dexEl) {
    dexEl.textContent = dexMetrics.bias;
    dexEl.className = dexMetrics.bias === 'BULLISH' ? 'g' :
                       dexMetrics.bias === 'BEARISH' ? 'r' : '';
  }

  // Update trading style recommendation
  const tradingStyleEl = document.getElementById('optGexTradingStyle');
  if (tradingStyleEl && regime.tradingStyle) {
    tradingStyleEl.textContent = regime.tradingStyle;
  }
}

function updateMaxPainDisplay(priceId, distId, maxPain, spotPrice) {
  const priceEl = document.getElementById(priceId);
  const distEl = document.getElementById(distId);
  if (maxPain) {
    priceEl.textContent = '$' + maxPain.toFixed(0);
    const dist = ((maxPain - spotPrice) / spotPrice) * 100;
    distEl.textContent = (dist >= 0 ? '↑' : '↓') + Math.abs(dist).toFixed(1) + '%';
    distEl.className = 'mp-dist ' + (dist >= 0 ? 'up' : 'down');
  } else {
    priceEl.textContent = '--';
    distEl.textContent = '';
  }
}

function populateExpiryDropdown(options) {
  const select = document.getElementById('optExpSelect');
  select.innerHTML = '<option value="">Select Expiry</option>';

  const expirations = new Set();
  options.all.forEach(o => {
    if (o.details?.expiration_date) expirations.add(o.details.expiration_date);
  });

  [...expirations].sort().forEach(exp => {
    const d = new Date(exp);
    const dte = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
    const opt = document.createElement('option');
    opt.value = exp;
    opt.textContent = `${exp} (${dte}d)`;
    select.appendChild(opt);
  });

  // Auto-select first expiry and load chain
  if (select.options.length > 1) {
    select.selectedIndex = 1;
    loadChainForExpiry();
  } else {
    document.getElementById('optChainBody').innerHTML = '<div class="chain-loading">No options data available</div>';
  }
}

export function loadChainForExpiry() {
  const expiry = document.getElementById('optExpSelect').value;
  if (!expiry || !optionsData.options) return;

  const allOptions = optionsData.options.all;
  const filtered = allOptions.filter(o => o.details?.expiration_date === expiry);

  if (filtered.length === 0) {
    document.getElementById('optChainBody').innerHTML = '<div class="chain-loading">No data for this expiry</div>';
    return;
  }

  const chainData = {};
  filtered.forEach(o => {
    const strike = o.details.strike_price;
    if (!chainData[strike]) chainData[strike] = { call: null, put: null };
    if (o.details.contract_type === 'call') chainData[strike].call = o;
    else chainData[strike].put = o;
  });

  const strikes = Object.keys(chainData).map(Number).sort((a, b) => a - b);
  const spotPrice = optionsData.spotPrice;

  let html = '';
  strikes.forEach(strike => {
    const call = chainData[strike].call;
    const put = chainData[strike].put;

    const isATM = Math.abs(strike - spotPrice) < spotPrice * 0.02;
    const itmCall = strike < spotPrice;
    const itmPut = strike > spotPrice;

    let rowClass = '';
    if (isATM) rowClass = 'atm';
    else if (itmCall) rowClass = 'itm-call';
    else if (itmPut) rowClass = 'itm-put';

    const callData = formatChainOption(call, 'call', spotPrice);
    const putData = formatChainOption(put, 'put', spotPrice);

    html += `
      <div class="chain-row ${rowClass}">
        <div class="chain-calls">
          <span>${callData.bid}</span>
          <span>${callData.ask}</span>
          <span>${callData.last}</span>
          <span>${callData.vol}</span>
          <span>${callData.oi}</span>
          <span class="p">${callData.iv}</span>
          <span class="g">${callData.delta}</span>
        </div>
        <div class="chain-strike">${strike.toFixed(strike % 1 === 0 ? 0 : 2)}</div>
        <div class="chain-puts">
          <span class="r">${putData.delta}</span>
          <span class="p">${putData.iv}</span>
          <span>${putData.oi}</span>
          <span>${putData.vol}</span>
          <span>${putData.last}</span>
          <span>${putData.bid}</span>
          <span>${putData.ask}</span>
        </div>
      </div>
    `;
  });

  document.getElementById('optChainBody').innerHTML = html;
}

function formatChainOption(o, type, spotPrice) {
  if (!o) return { bid: '--', ask: '--', last: '--', vol: '--', oi: '--', iv: '--', delta: '--', gamma: '--', theta: '--', vega: '--' };
  const q = o.last_quote || {};
  const d = o.day || {};
  const greeks = o.greeks || {};

  // Use Polygon's pre-computed greeks (institutional-grade accuracy)
  // Falls back to manual calculation only if API doesn't provide greeks
  let delta = greeks.delta;
  if (delta == null) {
    const strike = o.details.strike_price;
    const iv = o.implied_volatility || 0;
    const dte = Math.max(1, Math.ceil((new Date(o.details.expiration_date) - new Date()) / (1000 * 60 * 60 * 24)));
    const t = dte / 365;
    // Use proper Black-Scholes delta estimation from financial-math module
    const ivPct = iv * 100; // estimateDelta expects IV as percentage
    delta = finMath.estimateDelta(type, spotPrice, strike, ivPct, dte);
    if (delta == null || isNaN(delta)) {
      // Final fallback: simple moneyness approximation
      const moneyness = Math.log(spotPrice / strike) / (iv * Math.sqrt(t) + 0.001);
      delta = 0.5 * (1 + erf(moneyness / Math.sqrt(2)));
      if (type === 'put') delta = delta - 1;
    }
  }

  const iv = o.implied_volatility || 0;

  return {
    bid: q.bid?.toFixed(2) || '--',
    ask: q.ask?.toFixed(2) || '--',
    last: d.close?.toFixed(2) || '--',
    vol: formatNum(d.volume || 0),
    oi: formatNum(o.open_interest || 0),
    iv: iv ? (iv * 100).toFixed(0) + '%' : '--',
    delta: delta != null ? delta.toFixed(2) : '--',
    gamma: greeks.gamma != null ? greeks.gamma.toFixed(4) : '--',
    theta: greeks.theta != null ? greeks.theta.toFixed(2) : '--',
    vega: greeks.vega != null ? greeks.vega.toFixed(2) : '--'
  };
}

export function toggleChainView(view) {
  document.querySelectorAll('.chain-toggle').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.show === view);
  });

  const rows = document.querySelectorAll('.chain-row');
  rows.forEach(row => {
    if (view === 'all') {
      row.style.display = '';
    } else if (view === 'itm') {
      // ITM: strikes at or below spot (ITM calls, includes ATM as reference)
      row.style.display = (row.classList.contains('itm-call') || row.classList.contains('atm')) ? '' : 'none';
    } else if (view === 'otm') {
      // OTM: strikes at or above spot (OTM calls, includes ATM as reference)
      row.style.display = (row.classList.contains('itm-put') || row.classList.contains('atm')) ? '' : 'none';
    }
  });
}

export function runOptionsScanner() {
  if (!optionsData.options?.all) {
    document.getElementById('optScanResults').innerHTML = '<div class="scan-empty">Load options data first</div>';
    return;
  }

  const type = document.getElementById('scanType').value;
  const deltaFilter = document.getElementById('scanDelta').value;
  const dteFilter = document.getElementById('scanDte').value;
  const ivFilter = document.getElementById('scanIv').value;

  const spotPrice = optionsData.spotPrice;

  let results = optionsData.options.all.filter(o => {
    const details = o.details;
    if (!details) return false;

    if (type !== 'all' && details.contract_type !== type) return false;

    const dte = Math.ceil((new Date(details.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (dteFilter === 'weekly' && dte > 7) return false;
    if (dteFilter === 'monthly' && (dte < 7 || dte > 45)) return false;
    if (dteFilter === 'leap' && dte < 45) return false;

    const iv = o.implied_volatility || 0;
    if (ivFilter === 'high' && iv < 0.5) return false;
    if (ivFilter === 'low' && iv > 0.3) return false;

    const strike = details.strike_price;
    const moneyness = strike / spotPrice;
    if (deltaFilter === 'high' && moneyness > 0.85) return false;
    if (deltaFilter === 'atm' && (moneyness < 0.95 || moneyness > 1.05)) return false;
    if (deltaFilter === 'otm' && (moneyness < 1.05 || moneyness > 1.25)) return false;
    if (deltaFilter === 'deep-otm' && moneyness < 1.25) return false;

    if ((o.day?.volume || 0) < 10 && (o.open_interest || 0) < 100) return false;

    return true;
  });

  results.sort((a, b) => (b.day?.volume || 0) - (a.day?.volume || 0));
  results = results.slice(0, 10);

  if (results.length === 0) {
    document.getElementById('optScanResults').innerHTML = '<div class="scan-empty">No options match your criteria</div>';
    return;
  }

  document.getElementById('optScanResults').innerHTML = results.map(o => {
    const d = o.details;
    const dte = Math.ceil((new Date(d.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));
    const iv = (o.implied_volatility || 0) * 100;
    const midPrice = o.last_quote ? ((o.last_quote.bid + o.last_quote.ask) / 2).toFixed(2) : (o.day?.close?.toFixed(2) || '--');

    return `
      <div class="scan-result">
        <div class="scan-contract">
          <span class="scan-ticker">${optionsData.ticker} $${d.strike_price} ${d.contract_type.toUpperCase()}</span>
          <span class="scan-details">${d.expiration_date} (${dte}d)</span>
        </div>
        <div class="scan-metrics">
          <div class="scan-metric"><span class="scan-metric-label">Price</span><span class="scan-metric-value">$${midPrice}</span></div>
          <div class="scan-metric"><span class="scan-metric-label">IV</span><span class="scan-metric-value">${iv.toFixed(0)}%</span></div>
          <div class="scan-metric"><span class="scan-metric-label">Vol</span><span class="scan-metric-value">${formatNum(o.day?.volume || 0)}</span></div>
        </div>
      </div>
    `;
  }).join('');
}

async function runOptionsAiAnalysis(ticker) {
  document.getElementById('optAiInsight').innerHTML = '<div class="ai-loading">Analyzing options positioning...</div>';
  document.getElementById('optAiOpportunities').innerHTML = '<div class="ai-loading">Finding opportunities...</div>';

  const data = optionsData;
  const gex = data.gexMetrics || {};
  const gammaRatio = data.gammaRatio || {};
  const pvgd = data.pvgd || {};

  // Build thesis context from centralized feed system
  const thesisContext = buildThesisContext();

  const prompt = `You are a professional options quant analyst at a prop trading firm. Analyze ${ticker} using institutional-grade metrics:

${thesisContext}

---

SPOT & VOLATILITY:
- Spot: $${data.spotPrice.toFixed(2)}
- 30-Day HV: ${data.hv30.toFixed(0)}%
- IV Rank: ${data.ivAnalysis?.ivRank?.toFixed(0) || '--'}%
- VRP (IV-RV): ${data.vrpMetrics?.vrp?.toFixed(1) || '--'}%

GAMMA EXPOSURE (GEX) - Key for predicting vol regime:
- Net GEX: ${gex.netGEXFormatted || '--'} (${gex.regime || 'UNKNOWN'})
- GEX Zero Line: $${gex.gexZeroLine?.toFixed(0) || '--'} (spot ${gex.isAboveZero ? 'ABOVE' : 'BELOW'} zero)
- Call Wall: $${gex.callWall?.toFixed(0) || '--'} | Put Wall: $${gex.putWall?.toFixed(0) || '--'}
- Gamma Ratio: ${gammaRatio.gammaRatioFormatted || '--'} (${gammaRatio.interpretation || '--'})

PRICE & VOL TRENDS (SqueezeMetrics-style):
- P (Price-Trend): ${pvgd.P?.p?.toFixed(2) || '--'} (${pvgd.P?.interpretation || '--'})
- V (Vol-Trend): ${pvgd.V?.v?.toFixed(1) || '--'}% (${pvgd.V?.regime || '--'})

P/C FLOW:
- Volume Ratio: ${(data.options.all.filter(o => o.details?.contract_type === 'put').reduce((s, o) => s + (o.day?.volume || 0), 0) /
    Math.max(1, data.options.all.filter(o => o.details?.contract_type === 'call').reduce((s, o) => s + (o.day?.volume || 0), 0))).toFixed(2)}

Provide BRIEF, actionable analysis aligned with the thesis:

**DEALER POSITIONING & VOL REGIME:**
- What does GEX tell us about expected vol?
- Key pinning levels and gamma walls
- Near-term directional bias from positioning

**TRADE STRUCTURE:**
- Specific trade structure aligned with thesis (strikes, expiry)
- Entry timing based on gamma/vol regime
- Risk/reward with max loss defined`;

  try {
    const analysis = await fetchClaude(prompt, true);

    const parts = analysis.split('**');
    let mmAnalysis = 'Analysis not available';
    let opportunities = 'No opportunities identified';

    parts.forEach((part, i) => {
      if (part.includes('MARKET MAKER') || part.includes('POSITIONING')) {
        mmAnalysis = parts[i + 1] || mmAnalysis;
      }
      if (part.includes('TRADE IDEAS') || part.includes('OPPORTUNITIES')) {
        opportunities = parts[i + 1] || opportunities;
      }
    });

    document.getElementById('optAiInsight').innerHTML = `<div style="white-space:pre-wrap">${mmAnalysis.trim()}</div>`;
    document.getElementById('optAiOpportunities').innerHTML = `<div style="white-space:pre-wrap">${opportunities.trim()}</div>`;
  } catch (e) {
    document.getElementById('optAiInsight').innerHTML = `<div class="ai-loading" style="color:#ef4444">AI Error: ${e.message}</div>`;
    document.getElementById('optAiOpportunities').innerHTML = '';
  }
}

export function refreshOptionsAi() {
  if (optionsData.ticker) runOptionsAiAnalysis(optionsData.ticker);
}

// ============================================
// VOL-TOOLS INTEGRATION
// ============================================

function updateVolToolsUI(avgIV, termStructure, skew, pcRatio) {
  // Update Multi-Window VRP
  updateMultiWindowVRP(avgIV);

  // Update Straddle Calculator
  updateStraddleCalc(avgIV);

  // Update Vol Trade Ideas
  updateVolTradeIdeas(avgIV, termStructure, skew, pcRatio);
}

function updateMultiWindowVRP(iv) {
  // Use bars for Yang-Zhang if available, otherwise fall back to prices
  const data = optionsData.bars?.length >= 60 ? optionsData.bars : optionsData.prices;
  if (!data || data.length < 60) {
    return;
  }

  const result = volTools.calcMultiWindowVRP(iv, data);
  if (result.error) return;

  // Update each window row
  const windows = [
    { key: '5d', rv: result.rv5, vrp: result.vrp5 },
    { key: '10d', rv: result.rv10, vrp: result.vrp10 },
    { key: '20d', rv: result.rv20, vrp: result.vrp20 },
    { key: '30d', rv: result.rv30, vrp: result.vrp30 }
  ];

  windows.forEach(w => {
    const rvEl = document.getElementById(`rv${w.key}`);
    const vrpEl = document.getElementById(`vrp${w.key}`);
    if (rvEl && w.rv != null) {
      rvEl.textContent = w.rv.toFixed(1) + '%';
    }
    if (vrpEl && w.vrp != null) {
      vrpEl.textContent = (w.vrp >= 0 ? '+' : '') + w.vrp.toFixed(1) + '%';
      vrpEl.className = 'vrp-window-vrp ' + (w.vrp > 5 ? 'high' : w.vrp < -5 ? 'low' : '');
    }
  });

  // Update summary
  const summaryEl = document.getElementById('vrpSummary');
  if (summaryEl) {
    const trendEl = summaryEl.querySelector('.vrp-trend');
    const signalEl = summaryEl.querySelector('.vrp-signal');
    if (trendEl) trendEl.textContent = result.volTrend;
    if (signalEl) {
      signalEl.textContent = result.signal.replace('_', ' ');
      signalEl.className = 'vrp-signal ' + (
        result.signal === 'SELL_PREMIUM' ? 'sell' :
          result.signal === 'BUY_PREMIUM' ? 'buy' : ''
      );
    }
  }
}

function updateStraddleCalc(iv, daysToExpiry = 30) {
  const spot = optionsData.spotPrice;
  if (!spot || !iv) return;

  const stats = volTools.calcStraddleStats(iv, daysToExpiry, spot);

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('straddlePrice', '$' + stats.straddlePrice);
  setEl('straddlePct', stats.straddlePct + '%');
  setEl('expMoveAmt', '$' + stats.expectedMove);
  setEl('straddleBE', '±' + stats.breakeven + '%');

  // Update dynamic win rates
  setEl('buyerWinRate', stats.buyerWinRate + '%');
  setEl('sellerWinRate', stats.sellerWinRate + '%');
  setEl('winrateInsight', stats.insight);
}

// Auto-populate Earnings Vol Extractor from options data
function autoPopulateEarningsVol(options) {
  const dteInput = document.getElementById('earningsDTE');
  const termIVInput = document.getElementById('earningsTermIV');
  const baseIVInput = document.getElementById('earningsBaseIV');

  if (!dteInput || !termIVInput || !options?.all?.length) return;

  // Group options by expiration and calculate average IV for each
  const expiryIVMap = {};
  options.all.forEach(o => {
    const expDate = o.details?.expiration_date;
    const iv = o.implied_volatility;
    if (!expDate || !iv || iv <= 0) return;

    if (!expiryIVMap[expDate]) {
      expiryIVMap[expDate] = { ivSum: 0, count: 0 };
    }
    expiryIVMap[expDate].ivSum += iv;
    expiryIVMap[expDate].count++;
  });

  // Convert to sorted array with average IV
  const expiries = Object.entries(expiryIVMap)
    .map(([date, data]) => ({
      date,
      dateObj: new Date(date),
      avgIV: (data.ivSum / data.count) * 100
    }))
    .sort((a, b) => a.dateObj - b.dateObj);

  if (expiries.length < 2) {
    // Not enough expiries to extract earnings vol
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let termExpiry, baseExpiry, dte;

  // If we have earnings date, find the expiry that spans it
  if (optionsData.daysToEarnings && optionsData.daysToEarnings > 0) {
    const earningsDate = optionsData.earningsDate;

    // Term expiry = first expiry AFTER earnings
    termExpiry = expiries.find(e => e.dateObj >= earningsDate);
    if (!termExpiry) {
      // No expiry after earnings, use the last available
      termExpiry = expiries[expiries.length - 1];
    }

    // Base expiry = next expiry after term (post-earnings, cleaner vol)
    const termIdx = expiries.indexOf(termExpiry);
    baseExpiry = expiries[termIdx + 1] || null;

    // DTE to term expiry
    dte = Math.ceil((termExpiry.dateObj - today) / (1000 * 60 * 60 * 24));
  } else {
    // No earnings date available - use front two expiries
    // Assume front-month might have event premium
    termExpiry = expiries[0];
    baseExpiry = expiries[1] || null;
    dte = Math.ceil((termExpiry.dateObj - today) / (1000 * 60 * 60 * 24));
  }

  // Populate the inputs
  dteInput.value = dte;
  termIVInput.value = termExpiry.avgIV.toFixed(1);

  if (baseExpiry) {
    baseIVInput.value = baseExpiry.avgIV.toFixed(1);
  } else if (optionsData.hv30) {
    // Fall back to HV30 as base IV proxy
    baseIVInput.value = optionsData.hv30.toFixed(1);
  }

  // Auto-calculate
  calcEarningsMove();

  // Update hint with earnings info
  const hintEl = document.querySelector('.earnings-calc')?.previousElementSibling;
  if (hintEl && optionsData.daysToEarnings) {
    const earningsDateStr = optionsData.earningsDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    hintEl.innerHTML = `Earnings <strong>${earningsDateStr}</strong> (${optionsData.daysToEarnings}d) • Using ${termExpiry.date} expiry`;
  }
}

export function calcEarningsMove() {
  const dte = parseInt(document.getElementById('earningsDTE').value) || 30;
  const termIV = parseFloat(document.getElementById('earningsTermIV').value);
  const baseIV = parseFloat(document.getElementById('earningsBaseIV').value) || null;

  if (!termIV || termIV <= 0) {
    document.getElementById('earningsMove').textContent = 'Enter Term IV';
    return;
  }

  const result = volTools.extractEarningsVol(termIV, dte, baseIV);

  if (result.error) {
    document.getElementById('earningsMove').textContent = result.error;
    document.getElementById('eventVol').textContent = '--';
    document.getElementById('varWeight').textContent = '--';
    return;
  }

  document.getElementById('earningsMove').textContent = '±' + result.expectedMove + '%';
  document.getElementById('eventVol').textContent = result.eventVol + '%';
  document.getElementById('varWeight').textContent = result.varianceWeight + '%';
}

function updateVolTradeIdeas(iv, termStructure, skew, pcRatio) {
  const volIdeasEl = document.getElementById('volIdeas');
  if (!volIdeasEl) return;

  const ivRank = optionsData.ivAnalysis?.ivRank || 50;
  const vrp = optionsData.vrpMetrics?.vrp || 0;

  const ideas = volTools.generateVolTradeIdeas({
    iv,
    ivRank,
    vrp,
    termStructure,
    skew,
    pcRatio
  });

  if (!ideas || ideas.length === 0 || ideas[0].strategy === 'NO_CLEAR_SETUP') {
    volIdeasEl.innerHTML = '<div class="vol-idea-empty">No clear vol setup detected</div>';
    return;
  }

  volIdeasEl.innerHTML = ideas.map(idea => `
    <div class="vol-idea ${idea.conviction.toLowerCase()}">
      <div class="vol-idea-header">
        <span class="vol-idea-strategy">${idea.strategy.replace(/_/g, ' ')}</span>
        <span class="vol-idea-conviction">${idea.conviction}</span>
      </div>
      <div class="vol-idea-rationale">${idea.rationale}</div>
      <div class="vol-idea-structure">${idea.structure}</div>
      <div class="vol-idea-risk">Risk: ${idea.risk}</div>
    </div>
  `).join('');
}

// ============================================
// THREE LENSES FRAMEWORK UPDATE
// ============================================

function updateThreeLenses() {
  const iv = optionsData.ivAnalysis?.currentIV || 0;
  const ivRank = optionsData.ivAnalysis?.ivRank || 50;
  const vrp = optionsData.vrpMetrics?.vrp || 0;

  // Cross-sectional lens - IV vs typical market (simplified: using VRP as proxy)
  const xsEl = document.getElementById('lensXs');
  const xsSignalEl = document.getElementById('lensXsSignal');
  if (xsEl && xsSignalEl) {
    if (vrp > 15) {
      xsEl.textContent = `+${vrp.toFixed(0)}% vs RV`;
      xsSignalEl.textContent = 'EXPENSIVE';
      xsSignalEl.className = 'lens-signal expensive';
    } else if (vrp < -5) {
      xsEl.textContent = `${vrp.toFixed(0)}% vs RV`;
      xsSignalEl.textContent = 'CHEAP';
      xsSignalEl.className = 'lens-signal cheap';
    } else {
      xsEl.textContent = `${vrp >= 0 ? '+' : ''}${vrp.toFixed(0)}% vs RV`;
      xsSignalEl.textContent = 'FAIR';
      xsSignalEl.className = 'lens-signal normal';
    }
  }

  // Time series lens - IV Rank
  const tsEl = document.getElementById('lensTs');
  const tsSignalEl = document.getElementById('lensTsSignal');
  if (tsEl && tsSignalEl) {
    tsEl.textContent = `Rank: ${ivRank.toFixed(0)}%`;
    if (ivRank > 70) {
      tsSignalEl.textContent = 'HIGH';
      tsSignalEl.className = 'lens-signal high';
    } else if (ivRank < 30) {
      tsSignalEl.textContent = 'LOW';
      tsSignalEl.className = 'lens-signal low';
    } else {
      tsSignalEl.textContent = 'NORMAL';
      tsSignalEl.className = 'lens-signal normal';
    }
  }

  // Fundamental lens - Check for events or unusual factors
  const fundEl = document.getElementById('lensFund');
  const fundSignalEl = document.getElementById('lensFundSignal');
  if (fundEl && fundSignalEl) {
    if (vrp > 20 && ivRank > 70) {
      fundEl.textContent = 'Check for events';
      fundSignalEl.textContent = 'CHECK CATALYST';
      fundSignalEl.className = 'lens-signal expensive';
    } else if (vrp < -10) {
      fundEl.textContent = 'Market calm';
      fundSignalEl.textContent = 'LOW CONCERN';
      fundSignalEl.className = 'lens-signal cheap';
    } else {
      fundEl.textContent = 'No unusual factors';
      fundSignalEl.textContent = 'NORMAL';
      fundSignalEl.className = 'lens-signal normal';
    }
  }
}

// ============================================
// VOLATILITY CONE UPDATE
// ============================================

function updateVolatilityCone() {
  // Use bars for Yang-Zhang if available, otherwise fall back to prices
  const data = optionsData.bars?.length >= 60 ? optionsData.bars : optionsData.prices;
  const iv = optionsData.ivAnalysis?.currentIV || 0;

  if (!data || data.length < 60) {
    // Not enough data for cone
    return;
  }

  const cone = volTools.buildVolatilityCone(data, iv);
  if (cone.error) return;

  const periods = ['5d', '10d', '20d', '30d'];
  const maxVol = Math.max(
    ...periods.map(p => cone.cone[p]?.p90 || 0),
    iv,
    60 // Minimum scale
  );

  periods.forEach(period => {
    const data = cone.cone[period];
    if (!data) return;

    const rangeEl = document.getElementById(`cone${period.replace('d', 'd')}Range`);
    const rvEl = document.getElementById(`cone${period.replace('d', 'd')}Rv`);
    const ivEl = document.getElementById(`cone${period.replace('d', 'd')}Iv`);
    const pctEl = document.getElementById(`cone${period.replace('d', 'd')}Pct`);

    // Fix element IDs (5d -> 5d, etc)
    const rangeElFixed = document.getElementById(`cone${period}Range`);
    const rvElFixed = document.getElementById(`cone${period}Rv`);
    const ivElFixed = document.getElementById(`cone${period}Iv`);
    const pctElFixed = document.getElementById(`cone${period}Pct`);

    if (rangeElFixed) {
      const left = (data.p10 / maxVol) * 100;
      const width = ((data.p90 - data.p10) / maxVol) * 100;
      rangeElFixed.style.left = left + '%';
      rangeElFixed.style.width = width + '%';
    }

    if (rvElFixed) {
      rvElFixed.style.left = (data.current / maxVol) * 100 + '%';
    }

    if (ivElFixed) {
      ivElFixed.style.left = (iv / maxVol) * 100 + '%';
    }

    if (pctElFixed) {
      pctElFixed.textContent = data.percentile.toFixed(0) + '%ile';
      pctElFixed.className = 'cone-percentile ' + (
        data.percentile > 80 ? 'r' : data.percentile < 20 ? 'g' : ''
      );
    }
  });
}

// ============================================
// THESIS CONTEXT BUILDER
// Pulls from centralized feed system
// ============================================

function buildThesisContext() {
  const thesis = getCurrentThesis();

  if (!thesis || !thesis.thesis_data) {
    return `MACRO CONTEXT: No thesis established
Monitor for opportunities. Analysis will be market-neutral.
Use technicals and GEX positioning to guide trade structure.`;
  }

  const t = thesis.thesis_data;

  // Build comprehensive thesis context
  let context = `MACRO THESIS (v${thesis.version} - ${thesis.signals_count} signals):
Regime: ${t.regime?.toUpperCase() || 'NEUTRAL'} | Bias: ${t.bias?.toUpperCase() || 'NEUTRAL'}

NARRATIVE:
${t.narrative || 'No narrative established.'}

KEY THEMES:
${(t.themes || []).map(theme => `- ${theme}`).join('\n') || '- None identified'}

SECTOR POSITIONING:
- Overweight: ${(t.sectors?.ow || []).join(', ') || 'None'}
- Underweight: ${(t.sectors?.uw || []).join(', ') || 'None'}

CATALYSTS TO WATCH:
${(t.catalysts || []).map(c => `- ${c}`).join('\n') || '- None identified'}

KEY RISKS:
${(t.risks || []).map(r => `- ${r}`).join('\n') || '- None identified'}`;

  // Add conviction levels if available
  if (t.conviction) {
    context += `\n\nCONVICTION: ${t.conviction}/10`;
  }

  // Add time horizon if available
  if (t.timeHorizon) {
    context += `\nTIME HORIZON: ${t.timeHorizon}`;
  }

  return context;
}

// Chain Modal functions
export function openChainModal() {
  document.getElementById('chainModal').classList.add('active');
}

export function closeChainModal() {
  document.getElementById('chainModal').classList.remove('active');
}

// Reset options display to empty state
function resetOptionsDisplay() {
  // Reset optionsData
  optionsData.ticker = null;
  optionsData.spotPrice = 0;
  optionsData.options = null;
  optionsData.ivAnalysis = null;
  optionsData.vrpMetrics = null;
  optionsData.gexMetrics = null;
  optionsData.gammaAnalysis = null;

  // Reset spot display
  document.querySelector('.spot-price').textContent = '--';
  document.querySelector('.spot-change').textContent = '';
  document.querySelector('.spot-change').className = 'spot-change';

  // Reset quick stats
  const statIds = ['optIvRank', 'optIvPct', 'optHv30', 'optIvHvDiff', 'optExpMove', 'optPcRatio', 'optVolSetup'];
  statIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '--';
      el.className = el.className.replace(/\s*(high|low|neutral|g|r|y)\s*/g, ' ').trim();
    }
  });

  // Reset term structure
  document.querySelectorAll('#optTermStructure .term-value').forEach(el => el.textContent = '--');
  document.querySelectorAll('#optTermStructure .term-fill').forEach(el => el.style.width = '0%');

  // Reset skew
  document.querySelectorAll('#optSkewDisplay .skew-value').forEach(el => el.textContent = '--');
  const pcSkew = document.getElementById('optPcSkew');
  if (pcSkew) pcSkew.textContent = '--';

  // Reset expected moves
  ['optExpDaily', 'optExpWeekly', 'optExpMonthly'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '--';
  });

  // Reset flow section
  ['optCallVol', 'optPutVol', 'optCallOi', 'optPutOi', 'optNetFlow', 'optVolRatio', 'optOiRatio', 'optOiChange'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '--';
  });
  document.getElementById('optCallVolBar')?.style.setProperty('width', '50%');
  document.getElementById('optPutVolBar')?.style.setProperty('width', '50%');
  document.getElementById('optCallOiBar')?.style.setProperty('width', '50%');
  document.getElementById('optPutOiBar')?.style.setProperty('width', '50%');
  document.getElementById('optSentimentMarker')?.style.setProperty('left', '50%');
  const sentimentVal = document.getElementById('optSentimentValue');
  if (sentimentVal) sentimentVal.textContent = '--';

  // Reset strikes/levels
  ['optMpWeekly', 'optMpMonthly', 'optMpQuarterly', 'optGexFlip', 'optGexCallWall', 'optGexPutWall', 'optNetGex'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '--';
  });
  ['optMpWeeklyDist', 'optMpMonthlyDist', 'optMpQuarterlyDist'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  ['optCallWalls', 'optPutWalls'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '--';
  });

  // Reset chain
  document.getElementById('optChainBody').innerHTML = '<div class="chain-loading">Enter a ticker to analyze options</div>';
  const expSelect = document.getElementById('optExpSelect');
  if (expSelect) expSelect.innerHTML = '<option value="">Select Expiry</option>';

  // Reset AI sections
  document.getElementById('optAiInsight').innerHTML = '<div class="ai-loading" style="color:#94a3b8">Enter a ticker to get AI analysis</div>';
  document.getElementById('optAiOpportunities').innerHTML = '';

  // Hide summary section
  const summarySection = document.getElementById('summarySection');
  if (summarySection) summarySection.style.display = 'none';

  // Reset section tooltips to static defaults
  updateSectionTooltips({
    ticker: null,
    termStructure: null,
    skew: null,
    spotPrice: null,
    avgIV: null,
    hv30: null,
    gammaAnalysis: null
  });
}

// Copy all options data to clipboard for AI prompt
export function copyOptionsData() {
  if (!optionsData.ticker) {
    alert('Load a ticker first');
    return;
  }

  const d = optionsData;
  const gex = d.gexMetrics || {};
  const gamma = d.gammaAnalysis || {};
  const levels = gamma.levels || {};
  const regime = gamma.regime || {};
  const iv = d.ivAnalysis || {};
  const vrp = d.vrpMetrics || {};

  // Get flow data from DOM
  const callVol = document.getElementById('optCallVol')?.textContent || '--';
  const putVol = document.getElementById('optPutVol')?.textContent || '--';
  const callOI = document.getElementById('optCallOi')?.textContent || '--';
  const putOI = document.getElementById('optPutOi')?.textContent || '--';
  const pcRatioVol = document.getElementById('optVolRatio')?.textContent || '--';
  const pcRatioOI = document.getElementById('optOiRatio')?.textContent || '--';
  const sentiment = document.getElementById('optSentimentValue')?.textContent || '--';

  // Get term structure
  const termBars = document.querySelectorAll('#optTermStructure .term-bar');
  const termValues = Array.from(termBars).map(bar =>
    bar.querySelector('.term-value')?.textContent || '--'
  );

  // Get skew data
  const skewItems = document.querySelectorAll('#optSkewDisplay .skew-value');
  const putIV = skewItems[0]?.textContent || '--';
  const atmIV = skewItems[1]?.textContent || '--';
  const callIV = skewItems[2]?.textContent || '--';
  const pcSkew = document.getElementById('optPcSkew')?.textContent || '--';

  // Get max pain
  const mpWeekly = document.getElementById('optMpWeekly')?.textContent || '--';
  const mpMonthly = document.getElementById('optMpMonthly')?.textContent || '--';

  // Get OI walls
  const callWalls = document.getElementById('optCallWalls')?.textContent?.trim() || '--';
  const putWalls = document.getElementById('optPutWalls')?.textContent?.trim() || '--';

  // Format the data
  const text = `OPTIONS DATA: ${d.ticker}
====================

SPOT & PRICE
- Price: $${d.spotPrice.toFixed(2)}
- Change: ${d.change >= 0 ? '+' : ''}$${d.change.toFixed(2)} (${d.changePct >= 0 ? '+' : ''}${d.changePct.toFixed(2)}%)

VOLATILITY
- IV Rank: ${iv.ivRank?.toFixed(0) || '--'}%
- IV Percentile: ${iv.ivPercentile?.toFixed(0) || '--'}%
- HV (30d): ${d.hv30?.toFixed(0) || '--'}%
- VRP (IV-HV): ${vrp.vrp != null ? (vrp.vrp >= 0 ? '+' : '') + vrp.vrp.toFixed(0) : '--'}%
- Vol Setup: ${d.volSetup?.setup || '--'}

TERM STRUCTURE
- Weekly: ${termValues[0]}
- Monthly: ${termValues[1]}
- Quarterly: ${termValues[2]}
- 6-Month: ${termValues[3]}

VOLATILITY SKEW
- 25Δ Put IV: ${putIV}
- ATM IV: ${atmIV}
- 25Δ Call IV: ${callIV}
- Put-Call Skew: ${pcSkew}

EXPECTED MOVE (1 SD)
- Daily: ${document.getElementById('optExpDaily')?.textContent || '--'}
- Weekly: ${document.getElementById('optExpWeekly')?.textContent || '--'}
- Monthly: ${document.getElementById('optExpMonthly')?.textContent || '--'}

FLOW & SENTIMENT
- Call Volume: ${callVol}
- Put Volume: ${putVol}
- Volume Ratio (C/P): ${pcRatioVol}
- Call OI: ${callOI}
- Put OI: ${putOI}
- OI Ratio (P/C): ${pcRatioOI}
- Sentiment: ${sentiment}

KEY STRIKES & LEVELS
- Max Pain (Weekly): ${mpWeekly}
- Max Pain (Monthly): ${mpMonthly}
- Call Walls: ${callWalls.replace(/\n/g, ', ')}
- Put Walls: ${putWalls.replace(/\n/g, ', ')}

GAMMA EXPOSURE (GEX)
- Net GEX: ${gamma.netGEX ? gammaTools.formatGEX(gamma.netGEX) : gex.netGEXFormatted || '--'}
- Regime: ${regime.regime || gex.regime || '--'}
- Zero Gamma: $${levels.zeroGamma?.toFixed(0) || gex.gexZeroLine?.toFixed(0) || '--'}
- Call Wall: $${levels.callWall?.toFixed(0) || gex.callWall?.toFixed(0) || '--'}
- Put Wall: $${levels.putWall?.toFixed(0) || gex.putWall?.toFixed(0) || '--'}
- Vol Trigger: $${levels.volTrigger?.toFixed(0) || '--'}

DEALER POSITIONING
- Delta Flow: ${gamma.deltaFlow?.hedgingPressure || '--'}
- Charm Pin: $${gamma.charm?.pinningStrike || '--'}
- G-Ratio: ${d.gammaRatio?.gammaRatioFormatted || '--'}
- Trading Style: ${regime.tradingStyle || '--'}

${d.earningsDate ? `EARNINGS
- Date: ${d.earningsDate.toLocaleDateString()}
- Days to Earnings: ${d.daysToEarnings}
` : ''}
---
Analyze this options data and provide insights on positioning, potential moves, and trade ideas.`;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btnCopyData');
    btn.classList.add('copied');
    btn.textContent = '✓';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = '📋';
    }, 2000);
  }).catch(err => {
    console.error('Copy failed:', err);
    alert('Failed to copy to clipboard');
  });
}

// Initialize options page history
export function initOptionsPage() {
  setOptionsSearchCallback(loadOptionsData);
  renderOptionsHistory();
}

// Live mode functions
export function toggleLiveMode() {
  const btn = document.getElementById('btnLive');
  const ticker = document.getElementById('optTicker').value.toUpperCase().trim();

  if (!isLiveMode) {
    if (!ticker) {
      alert('Enter a ticker first');
      return;
    }
    // Start live mode
    isLiveMode = true;
    btn.classList.add('active');
    btn.textContent = 'LIVE';

    // Initial load if not already loaded
    if (!optionsData.ticker || optionsData.ticker !== ticker) {
      loadOptionsData(false);
    }

    // Start 1-second refresh interval
    liveInterval = setInterval(() => {
      loadOptionsData(true); // Skip AI during live updates
    }, 1000);
  } else {
    stopLiveMode();
  }
}

export function stopLiveMode() {
  isLiveMode = false;
  const btn = document.getElementById('btnLive');
  if (btn) {
    btn.classList.remove('active');
    btn.textContent = 'Live';
  }
  if (liveInterval) {
    clearInterval(liveInterval);
    liveInterval = null;
  }
}

// Expose to window for onclick handlers
window.loadOptionsData = loadOptionsData;
window.toggleLiveMode = toggleLiveMode;
window.stopLiveMode = stopLiveMode;
window.loadChainForExpiry = loadChainForExpiry;
window.toggleChainView = toggleChainView;
window.runOptionsScanner = runOptionsScanner;
window.refreshOptionsAi = refreshOptionsAi;
window.calcEarningsMove = calcEarningsMove;
window.openChainModal = openChainModal;
window.closeChainModal = closeChainModal;
window.copyOptionsData = copyOptionsData;
