// VHunter LLM Export Module
// Comprehensive data export for LLM consumption

import { fetchTickerData } from './api.js';
import * as finMath from './financial-math.js';
import * as indicators from './indicators.js';
import * as gammaTools from './gamma.js';
import { getFullIVAnalysis } from './iv-history.js';
import { calculateMaxPain } from './utils.js';

let llmData = null;
let llmFormattedOutput = '';

// Open LLM Modal
export function openLLMModal() {
  const modal = document.getElementById('llmModal');
  const tickerInput = document.getElementById('llmTicker');
  const preview = document.getElementById('llmPreview');
  const actions = document.getElementById('llmActions');
  const status = document.getElementById('llmStatus');

  // Reset state
  preview.classList.remove('visible');
  preview.textContent = '';
  actions.style.display = 'none';
  status.className = 'llm-status';
  status.textContent = '';
  llmData = null;
  llmFormattedOutput = '';

  // Pre-fill ticker from current page if available
  const currentTicker = document.getElementById('tk')?.value ||
                        document.getElementById('optTicker')?.value || '';
  tickerInput.value = currentTicker.toUpperCase();

  modal.style.display = 'flex';
  tickerInput.focus();
  tickerInput.select();
}

// Close LLM Modal
export function closeLLMModal() {
  document.getElementById('llmModal').style.display = 'none';
}

// Fetch data for LLM export
export async function fetchLLMData() {
  const ticker = document.getElementById('llmTicker').value.toUpperCase().trim();
  if (!ticker) {
    showStatus('Please enter a ticker symbol', 'error');
    return;
  }

  const fetchBtn = document.getElementById('llmFetchBtn');
  const status = document.getElementById('llmStatus');
  const preview = document.getElementById('llmPreview');
  const actions = document.getElementById('llmActions');

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Loading...';
  showStatus(`Fetching data for ${ticker}...`, 'loading');

  try {
    const { prev, aggs, options } = await fetchTickerData(ticker);

    if (!prev?.results?.[0]) {
      throw new Error('Ticker not found');
    }

    const spot = prev.results[0];
    const spotPrice = spot.c;
    const bars = aggs?.results || [];
    const prices = bars.map(d => d.c);

    // Calculate technical indicators
    const technicals = calculateTechnicals(bars, prices, spotPrice);

    // Calculate options metrics
    const optionsMetrics = calculateOptionsMetrics(options, spotPrice, bars, prices, ticker);

    // Store data
    llmData = {
      ticker,
      timestamp: new Date().toISOString(),
      price: {
        current: spotPrice,
        change: spot.todaysChange || (spot.c - (spot.prevClose || spot.o)),
        changePct: spot.todaysChangePerc || ((spot.c - (spot.prevClose || spot.o)) / (spot.prevClose || spot.o) * 100),
        volume: spot.v || bars[bars.length - 1]?.v || 0
      },
      technicals,
      options: optionsMetrics
    };

    // Format output
    llmFormattedOutput = formatForLLM(llmData);

    // Show preview
    preview.textContent = llmFormattedOutput;
    preview.classList.add('visible');
    actions.style.display = 'flex';

    const charCount = llmFormattedOutput.length;
    const lineCount = llmFormattedOutput.split('\n').length;
    showStatus(`Ready to copy: ${charCount.toLocaleString()} chars, ${lineCount} lines`, 'success');

  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
    preview.classList.remove('visible');
    actions.style.display = 'none';
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch Data';
  }
}

// Calculate technical indicators
function calculateTechnicals(bars, prices, spotPrice) {
  if (!prices || prices.length < 30) {
    return { error: 'Insufficient price data' };
  }

  const lastBar = bars[bars.length - 1] || {};

  // Core indicators
  const rsiValues = indicators.calcRSI(prices, 14);
  const rsi = rsiValues[rsiValues.length - 1];

  const macd = indicators.calcMACD(prices);
  const macdH = macd.histogram[macd.histogram.length - 1];

  const adxData = indicators.calcADX(bars, 14);
  const adx = adxData.adx[adxData.adx.length - 1];
  const pdi = adxData.pdi[adxData.pdi.length - 1];
  const mdi = adxData.mdi[adxData.mdi.length - 1];

  const atrValues = indicators.calcATR(bars, 14);
  const atr = atrValues[atrValues.length - 1];

  const mfiValues = indicators.calcMFI(bars, 14);
  const mfi = mfiValues[mfiValues.length - 1];

  const sma20 = indicators.average(prices.slice(-20));
  const sma50 = prices.length >= 50 ? indicators.average(prices.slice(-50)) : sma20;

  // Bollinger Bands
  const bbStd = Math.sqrt(prices.slice(-20).reduce((s, x) => s + Math.pow(x - sma20, 2), 0) / 20);
  const bbUpper = sma20 + 2 * bbStd;
  const bbLower = sma20 - 2 * bbStd;
  const bbPct = ((spotPrice - bbLower) / (bbUpper - bbLower) * 100);

  // Volatility (Yang-Zhang when OHLC available)
  const hv30 = finMath.calcRealizedVolatility(bars, 30) || 0;

  // Volume analysis
  const volumes = bars.map(d => d.v);
  const avgVol = indicators.average(volumes.slice(-20));
  const rvol = lastBar.v / avgVol;

  // Money flow
  const upDays = bars.slice(-20).filter(d => d.c > d.o);
  const downDays = bars.slice(-20).filter(d => d.c <= d.o);
  const buyVol = upDays.reduce((s, d) => s + d.v, 0);
  const sellVol = downDays.reduce((s, d) => s + d.v, 0);
  const buyPct = parseInt((buyVol / (buyVol + sellVol) * 100));

  // A/D Line
  const adl = indicators.calcADL(bars);
  const adlChange = adl.length >= 10 ?
    ((adl[adl.length - 1] - adl[adl.length - 10]) / Math.abs(adl[adl.length - 10]) * 100) : 0;

  return {
    rsi,
    macdH,
    adx,
    pdi,
    mdi,
    atr,
    mfi,
    sma20,
    sma50,
    bbPct,
    hv30,
    rvol,
    buyPct,
    adlChange
  };
}

// Calculate options metrics
function calculateOptionsMetrics(options, spotPrice, bars, prices, ticker) {
  if (!options?.all?.length) {
    return { error: 'No options data available' };
  }

  const allOptions = options.all;
  let callVol = 0, putVol = 0, callOI = 0, putOI = 0;
  let ivSum = 0, ivCount = 0;
  const expiryIV = { weekly: [], monthly: [], quarterly: [], sixMonth: [] };

  allOptions.forEach(o => {
    const details = o.details;
    const day = o.day;
    if (!details) return;

    const vol = day?.volume || 0;
    const oi = o.open_interest || 0;

    if (details.contract_type === 'call') {
      callVol += vol;
      callOI += oi;
    } else {
      putVol += vol;
      putOI += oi;
    }

    if (o.implied_volatility) {
      ivSum += o.implied_volatility;
      ivCount++;

      const expDate = details.expiration_date;
      const daysToExp = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysToExp <= 7) expiryIV.weekly.push(o.implied_volatility * 100);
      else if (daysToExp <= 30) expiryIV.monthly.push(o.implied_volatility * 100);
      else if (daysToExp <= 90) expiryIV.quarterly.push(o.implied_volatility * 100);
      else expiryIV.sixMonth.push(o.implied_volatility * 100);
    }
  });

  const avgIV = ivCount > 0 ? (ivSum / ivCount * 100) : 0;
  const pcRatio = putVol / (callVol || 1);
  const pcOI = putOI / (callOI || 1);

  // Term structure
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const termStructure = {
    weekly: avg(expiryIV.weekly),
    monthly: avg(expiryIV.monthly),
    quarterly: avg(expiryIV.quarterly),
    sixMonth: avg(expiryIV.sixMonth)
  };

  // VRP calculation
  const volData = bars?.length > 0 ? bars : prices;
  let vrpMetrics = null;
  if (volData && avgIV > 0) {
    vrpMetrics = indicators.calcVolatilityMetrics(volData, avgIV, termStructure);
  }

  // IV analysis
  const ivAnalysis = getFullIVAnalysis(ticker, avgIV);

  // Vol setup classification
  const volSetup = indicators.classifyVolSetup({
    ivRank: ivAnalysis?.ivRank,
    vrp: vrpMetrics?.vrp,
    iv: avgIV,
    termSteepness: vrpMetrics?.termSteepness
  });

  // Max pain
  const weeklyMaxPain = calculateMaxPain(options.weekly);
  const monthlyMaxPain = calculateMaxPain(options.monthly);

  // GEX analysis
  const gexMetrics = indicators.calcGEX(allOptions, spotPrice);
  const gammaAnalysis = gammaTools.analyzeGamma(allOptions, spotPrice);

  // Expected move
  const expMove = finMath.calcExpectedMove(spotPrice, avgIV, 30);

  // Top strikes
  const nearMoney = allOptions.filter(o => {
    const strike = o.details?.strike_price;
    if (!strike) return false;
    return Math.abs(strike - spotPrice) / spotPrice < 0.15;
  });

  const calls = [], puts = [];
  nearMoney.forEach(o => {
    const details = o.details;
    const vol = o.day?.volume || 0;
    if (vol > 10) {
      if (details.contract_type === 'call') {
        calls.push({ strike: details.strike_price, volume: vol });
      } else {
        puts.push({ strike: details.strike_price, volume: vol });
      }
    }
  });
  calls.sort((a, b) => b.volume - a.volume);
  puts.sort((a, b) => b.volume - a.volume);

  return {
    callVol,
    putVol,
    pcRatio,
    pcOI,
    avgIV,
    expMove,
    termStructure,
    vrpMetrics,
    ivAnalysis,
    volSetup,
    maxPain: { weekly: weeklyMaxPain, monthly: monthlyMaxPain },
    gexMetrics,
    gammaAnalysis,
    topCalls: calls.slice(0, 3),
    topPuts: puts.slice(0, 3)
  };
}

// Format data for LLM consumption
function formatForLLM(data) {
  const d = data;
  const t = d.technicals;
  const o = d.options;

  const formatNum = (v, decimals = 2) => v != null ? (typeof v === 'number' ? v.toFixed(decimals) : v) : '--';
  const formatPct = (v) => v != null ? (v >= 0 ? '+' : '') + formatNum(v, 1) + '%' : '--';
  const formatVol = (v) => {
    if (v == null) return '--';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toFixed(0);
  };
  const formatGEX = (val) => {
    if (val == null) return '--';
    const abs = Math.abs(val);
    if (abs >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (val / 1e3).toFixed(0) + 'K';
    return val.toFixed(0);
  };

  let output = `═══════════════════════════════════════════════════════════════════
COMPREHENSIVE STOCK ANALYSIS: ${d.ticker}
Generated: ${d.timestamp}
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│ PRICE & OVERVIEW                                                │
└─────────────────────────────────────────────────────────────────┘
Price:          $${formatNum(d.price.current)}
Daily Change:   ${formatPct(d.price.changePct)}
Volume:         ${formatVol(d.price.volume)}`;

  // Technical Analysis
  if (t && !t.error) {
    output += `

┌─────────────────────────────────────────────────────────────────┐
│ TECHNICAL ANALYSIS                                              │
└─────────────────────────────────────────────────────────────────┘
MOMENTUM:
  RSI (14):     ${formatNum(t.rsi, 1)} ${t.rsi > 70 ? '[OVERBOUGHT]' : t.rsi < 30 ? '[OVERSOLD]' : '[NEUTRAL]'}
  MACD Hist:    ${formatNum(t.macdH, 3)} ${t.macdH > 0 ? '[BULLISH]' : '[BEARISH]'}
  MFI (14):     ${formatNum(t.mfi, 1)} ${t.mfi > 80 ? '[OVERBOUGHT]' : t.mfi < 20 ? '[OVERSOLD]' : '[NEUTRAL]'}

TREND:
  ADX:          ${formatNum(t.adx, 1)} ${t.adx > 40 ? '[STRONG TREND]' : t.adx > 25 ? '[TRENDING]' : '[WEAK/RANGING]'}
  +DI:          ${formatNum(t.pdi, 1)}
  -DI:          ${formatNum(t.mdi, 1)}
  DI Signal:    ${t.pdi > t.mdi ? '[BULLISH +DI > -DI]' : '[BEARISH +DI < -DI]'}

MOVING AVERAGES:
  SMA 20:       $${formatNum(t.sma20)}
  SMA 50:       $${formatNum(t.sma50)}
  Price vs SMA: ${d.price.current > t.sma20 && t.sma20 > t.sma50 ? '[BULLISH ALIGNMENT]' : d.price.current < t.sma20 && t.sma20 < t.sma50 ? '[BEARISH ALIGNMENT]' : '[MIXED]'}

VOLATILITY:
  Bollinger %B: ${formatNum(t.bbPct, 0)}% ${t.bbPct > 80 ? '[UPPER BAND]' : t.bbPct < 20 ? '[LOWER BAND]' : '[MID BAND]'}
  ATR (14):     $${formatNum(t.atr)}
  HV (30d):     ${formatNum(t.hv30, 1)}%

VOLUME & FLOW:
  Rel Volume:   ${formatNum(t.rvol, 1)}x ${t.rvol > 2 ? '[EXTREME]' : t.rvol > 1.3 ? '[HIGH]' : t.rvol < 0.7 ? '[LOW]' : '[NORMAL]'}
  Buy Flow:     ${t.buyPct}% ${t.buyPct > 55 ? '[ACCUMULATION]' : t.buyPct < 45 ? '[DISTRIBUTION]' : '[NEUTRAL]'}
  A/D Line:     ${formatPct(t.adlChange)} ${t.adlChange > 0 ? '[ACCUMULATING]' : '[DISTRIBUTING]'}`;
  }

  // Options Analysis
  if (o && !o.error) {
    output += `

┌─────────────────────────────────────────────────────────────────┐
│ OPTIONS ANALYSIS                                                │
└─────────────────────────────────────────────────────────────────┘
FLOW:
  Call Volume:  ${formatVol(o.callVol)}
  Put Volume:   ${formatVol(o.putVol)}
  P/C Ratio:    ${formatNum(o.pcRatio)} ${o.pcRatio > 1.2 ? '[BEARISH SENTIMENT]' : o.pcRatio < 0.7 ? '[BULLISH SENTIMENT]' : '[NEUTRAL]'}
  P/C OI:       ${formatNum(o.pcOI)}

KEY STRIKES:
  Top Calls:    ${o.topCalls?.map(c => '$' + c.strike).join(', ') || '--'}
  Top Puts:     ${o.topPuts?.map(p => '$' + p.strike).join(', ') || '--'}
  Max Pain:     Weekly $${o.maxPain?.weekly || '--'} | Monthly $${o.maxPain?.monthly || '--'}

EXPECTED MOVE:
  30-Day EM:    ±$${formatNum(o.expMove)} (±${formatNum(o.expMove / d.price.current * 100, 1)}%)`;

    // Volatility Analysis
    if (o.avgIV) {
      const vrp = o.vrpMetrics;
      const ivA = o.ivAnalysis;

      output += `

┌─────────────────────────────────────────────────────────────────┐
│ VOLATILITY ANALYSIS                                             │
└─────────────────────────────────────────────────────────────────┘
IMPLIED VOLATILITY:
  Current IV:   ${formatNum(o.avgIV, 1)}%
  IV Rank:      ${formatNum(ivA?.ivRank, 0)}% ${ivA?.ivRank > 80 ? '[VERY HIGH - Top 20%]' : ivA?.ivRank > 60 ? '[HIGH]' : ivA?.ivRank < 20 ? '[VERY LOW - Bottom 20%]' : ivA?.ivRank < 40 ? '[LOW]' : '[MEDIUM]'}

REALIZED VOLATILITY:
  RV (30d):     ${formatNum(vrp?.rv30 || t?.hv30, 1)}%

VRP (Volatility Risk Premium):
  VRP:          ${vrp?.vrp != null ? formatPct(vrp.vrp) : '--'}
  Signal:       ${vrp?.vrp > 10 ? '[SELL PREMIUM - Options Expensive]' : vrp?.vrp > 5 ? '[SLIGHT PREMIUM]' : vrp?.vrp < -5 ? '[BUY PREMIUM - Options Cheap]' : vrp?.vrp < 0 ? '[SLIGHT DISCOUNT]' : '[NEUTRAL]'}`;

      if (vrp?.termSteepness != null) {
        output += `

TERM STRUCTURE:
  Steepness:    ${formatPct(vrp.termSteepness)}
  Shape:        ${vrp.termSteepness > 10 ? '[CONTANGO - Back months expensive]' : vrp.termSteepness < -5 ? '[BACKWARDATION - Fear in market]' : '[FLAT]'}`;
      }

      if (o.volSetup) {
        output += `

VOL SETUP:
  Classification: ${o.volSetup.setup?.replace(/_/g, ' ') || '--'}
  Confidence:     ${o.volSetup.confidence || '--'}%
  Recommendation: ${o.volSetup.description || '--'}`;
      }
    }

    // GEX Analysis
    const gex = o.gexMetrics;
    const gamma = o.gammaAnalysis;
    if (gex && !gex.error) {
      const regime = gex.regime || 'UNKNOWN';
      let regimeExplanation = '';
      let tradingImplication = '';

      if (regime === 'POSITIVE_GAMMA') {
        regimeExplanation = '[DEALERS LONG GAMMA]';
        tradingImplication = 'MEAN-REVERTING: Fade moves, sell vol, expect pinning. Dealers hedge BY SELLING rallies, BUYING dips.';
      } else if (regime === 'NEGATIVE_GAMMA') {
        regimeExplanation = '[DEALERS SHORT GAMMA]';
        tradingImplication = 'TRENDING: Follow momentum, buy vol. Dealers hedge BY BUYING rallies, SELLING dips = AMPLIFICATION.';
      } else {
        regimeExplanation = '[NEAR NEUTRAL]';
        tradingImplication = 'MIXED: No strong dealer-driven bias.';
      }

      output += `

┌─────────────────────────────────────────────────────────────────┐
│ GAMMA EXPOSURE (GEX) - Dealer Positioning                       │
└─────────────────────────────────────────────────────────────────┘
NET GEX:        ${gex.netGEXFormatted || formatGEX(gex.netGEX)}
REGIME:         ${regime} ${regimeExplanation}

KEY LEVELS:
  Zero Gamma:   $${formatNum(gex.gexZeroLine, 0)} ${d.price.current > gex.gexZeroLine ? '[SPOT ABOVE - Stabilizing]' : '[SPOT BELOW - Amplifying]'}
  Call Wall:    $${formatNum(gex.callWall, 0)} [RESISTANCE]
  Put Wall:     $${formatNum(gex.putWall, 0)} [SUPPORT]

TRADING IMPLICATION:
${tradingImplication}`;

      // Delta flow from gamma analysis
      if (gamma?.deltaFlow) {
        output += `

DELTA FLOW:     ${gamma.deltaFlow.hedgingPressure} (${gamma.deltaFlow.intensity})`;
      }

      // Charm/pinning
      if (gamma?.charm?.pinningStrike) {
        output += `
CHARM/PINNING:  ${gamma.charm.signal}`;
      }
    }
  }

  output += `

═══════════════════════════════════════════════════════════════════
END OF ANALYSIS
═══════════════════════════════════════════════════════════════════`;

  return output;
}

// Form submit handler - fetches data and auto-copies
export async function submitLLMForm(event) {
  event.preventDefault();
  await fetchLLMData();

  // Auto-copy if fetch was successful
  if (llmFormattedOutput) {
    copyLLMData();
  }
}

// Copy to clipboard
export function copyLLMData() {
  if (!llmFormattedOutput) {
    showStatus('No data to copy. Fetch data first.', 'error');
    return;
  }

  navigator.clipboard.writeText(llmFormattedOutput).then(() => {
    showStatus('Copied to clipboard!', 'success');

    // Update FAB button briefly
    const fab = document.getElementById('fabButton');
    fab.classList.add('copied');
    setTimeout(() => fab.classList.remove('copied'), 2000);

    // Show actions for copying again
    document.getElementById('llmActions').style.display = 'flex';
  }).catch((err) => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = llmFormattedOutput;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showStatus('Copied to clipboard!', 'success');
    document.getElementById('llmActions').style.display = 'flex';
  });
}

// Helper: Show status message
function showStatus(message, type) {
  const status = document.getElementById('llmStatus');
  status.textContent = message;
  status.className = 'llm-status ' + type;
}

// Expose to window for onclick handlers
window.openLLMModal = openLLMModal;
window.closeLLMModal = closeLLMModal;
window.fetchLLMData = fetchLLMData;
window.copyLLMData = copyLLMData;
window.submitLLMForm = submitLLMForm;
