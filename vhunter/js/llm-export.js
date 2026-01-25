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
    const tokenEst = Math.ceil(charCount / 3.5); // ~3.5 chars per token average
    showStatus(`Ready: ~${tokenEst} tokens (${charCount} chars)`, 'success');

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

// Format data for LLM consumption - Token-optimized compact format
function formatForLLM(data) {
  const d = data;
  const t = d.technicals;
  const o = d.options;

  const n = (v, dec = 2) => v != null ? (typeof v === 'number' ? +v.toFixed(dec) : v) : null;
  const vol = (v) => {
    if (v == null) return null;
    if (v >= 1e6) return +(v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return +(v / 1e3).toFixed(0) + 'K';
    return +v.toFixed(0);
  };
  const gex = (val) => {
    if (val == null) return null;
    const abs = Math.abs(val);
    if (abs >= 1e9) return +(val / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return +(val / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return +(val / 1e3).toFixed(0) + 'K';
    return +val.toFixed(0);
  };

  // Build compact data object
  const out = {
    ticker: d.ticker,
    price: n(d.price.current),
    chg: n(d.price.changePct, 1),
    vol: vol(d.price.volume)
  };

  // Technicals
  if (t && !t.error) {
    out.tech = {
      rsi: n(t.rsi, 1),
      macdH: n(t.macdH, 3),
      mfi: n(t.mfi, 1),
      adx: n(t.adx, 1),
      pdi: n(t.pdi, 1),
      mdi: n(t.mdi, 1),
      sma20: n(t.sma20),
      sma50: n(t.sma50),
      bbPct: n(t.bbPct, 0),
      atr: n(t.atr),
      hv30: n(t.hv30, 1),
      rvol: n(t.rvol, 1),
      buyPct: t.buyPct,
      adlChg: n(t.adlChange, 1)
    };
    // Signals
    out.sig = {
      mom: t.rsi > 70 ? 'OB' : t.rsi < 30 ? 'OS' : 'N',
      macd: t.macdH > 0 ? '+' : '-',
      trend: t.adx > 40 ? 'strong' : t.adx > 25 ? 'trend' : 'range',
      di: t.pdi > t.mdi ? '+' : '-',
      sma: d.price.current > t.sma20 && t.sma20 > t.sma50 ? 'bull' : d.price.current < t.sma20 && t.sma20 < t.sma50 ? 'bear' : 'mix',
      bb: t.bbPct > 80 ? 'hi' : t.bbPct < 20 ? 'lo' : 'mid',
      volFlow: t.rvol > 2 ? 'extreme' : t.rvol > 1.3 ? 'hi' : t.rvol < 0.7 ? 'lo' : 'norm',
      flow: t.buyPct > 55 ? 'accum' : t.buyPct < 45 ? 'dist' : 'N'
    };
  }

  // Options
  if (o && !o.error) {
    out.opt = {
      callVol: vol(o.callVol),
      putVol: vol(o.putVol),
      pcRatio: n(o.pcRatio),
      pcOI: n(o.pcOI),
      topCalls: o.topCalls?.map(c => c.strike) || [],
      topPuts: o.topPuts?.map(p => p.strike) || [],
      maxPain: { w: o.maxPain?.weekly, m: o.maxPain?.monthly },
      em30: n(o.expMove),
      emPct: n(o.expMove / d.price.current * 100, 1)
    };
    out.opt.sent = o.pcRatio > 1.2 ? 'bear' : o.pcRatio < 0.7 ? 'bull' : 'N';

    // Volatility
    if (o.avgIV) {
      const vrp = o.vrpMetrics;
      const ivA = o.ivAnalysis;
      out.vol = {
        iv: n(o.avgIV, 1),
        ivRank: n(ivA?.ivRank, 0),
        rv30: n(vrp?.rv30 || t?.hv30, 1),
        vrp: vrp?.vrp != null ? n(vrp.vrp, 1) : null,
        termSteep: vrp?.termSteepness != null ? n(vrp.termSteepness, 1) : null
      };
      // Vol signals
      out.vol.ivSig = ivA?.ivRank > 80 ? 'vhi' : ivA?.ivRank > 60 ? 'hi' : ivA?.ivRank < 20 ? 'vlo' : ivA?.ivRank < 40 ? 'lo' : 'mid';
      out.vol.vrpSig = vrp?.vrp > 10 ? 'sell' : vrp?.vrp > 5 ? 'slight+' : vrp?.vrp < -5 ? 'buy' : vrp?.vrp < 0 ? 'slight-' : 'N';
      if (vrp?.termSteepness != null) {
        out.vol.term = vrp.termSteepness > 10 ? 'contango' : vrp.termSteepness < -5 ? 'backwd' : 'flat';
      }
      if (o.volSetup) {
        out.vol.setup = o.volSetup.setup;
        out.vol.conf = o.volSetup.confidence;
      }
    }

    // GEX
    const gexM = o.gexMetrics;
    const gamma = o.gammaAnalysis;
    if (gexM && !gexM.error) {
      out.gex = {
        net: gexM.netGEXFormatted || gex(gexM.netGEX),
        regime: gexM.regime === 'POSITIVE_GAMMA' ? '+gamma' : gexM.regime === 'NEGATIVE_GAMMA' ? '-gamma' : 'neutral',
        zero: n(gexM.gexZeroLine, 0),
        callWall: n(gexM.callWall, 0),
        putWall: n(gexM.putWall, 0),
        spotVsZero: d.price.current > gexM.gexZeroLine ? 'above' : 'below'
      };
      if (gamma?.deltaFlow) {
        out.gex.deltaFlow = gamma.deltaFlow.hedgingPressure;
        out.gex.intensity = gamma.deltaFlow.intensity;
      }
      if (gamma?.charm?.pinningStrike) {
        out.gex.charm = gamma.charm.signal;
      }
    }
  }

  // Return as compact YAML-like format
  return formatCompact(out);
}

// Format as compact readable output
function formatCompact(obj) {
  const lines = [`# ${obj.ticker} Analysis`];
  lines.push(`price: ${obj.price} | chg: ${obj.chg}% | vol: ${obj.vol}`);

  if (obj.tech) {
    const t = obj.tech;
    const s = obj.sig;
    lines.push(`\n## Technicals`);
    lines.push(`RSI:${t.rsi}(${s.mom}) MACD:${t.macdH}(${s.macd}) MFI:${t.mfi}`);
    lines.push(`ADX:${t.adx}(${s.trend}) +DI:${t.pdi} -DI:${t.mdi}(${s.di})`);
    lines.push(`SMA20:${t.sma20} SMA50:${t.sma50}(${s.sma})`);
    lines.push(`BB%:${t.bbPct}(${s.bb}) ATR:${t.atr} HV30:${t.hv30}%`);
    lines.push(`RVol:${t.rvol}x(${s.volFlow}) Buy:${t.buyPct}%(${s.flow}) ADL:${t.adlChg}%`);
  }

  if (obj.opt) {
    const o = obj.opt;
    lines.push(`\n## Options`);
    lines.push(`Call:${o.callVol} Put:${o.putVol} P/C:${o.pcRatio}(${o.sent}) OI-P/C:${o.pcOI}`);
    if (o.topCalls.length) lines.push(`TopCalls:${o.topCalls.join(',')}`);
    if (o.topPuts.length) lines.push(`TopPuts:${o.topPuts.join(',')}`);
    lines.push(`MaxPain W:${o.maxPain.w} M:${o.maxPain.m}`);
    lines.push(`EM30: ±${o.em30}(±${o.emPct}%)`);
  }

  if (obj.vol) {
    const v = obj.vol;
    lines.push(`\n## Volatility`);
    lines.push(`IV:${v.iv}% Rank:${v.ivRank}%(${v.ivSig}) RV30:${v.rv30}%`);
    if (v.vrp != null) lines.push(`VRP:${v.vrp}%(${v.vrpSig})`);
    if (v.term) lines.push(`Term:${v.termSteep}%(${v.term})`);
    if (v.setup) lines.push(`Setup:${v.setup} Conf:${v.conf}%`);
  }

  if (obj.gex) {
    const g = obj.gex;
    lines.push(`\n## GEX`);
    lines.push(`Net:${g.net} Regime:${g.regime}`);
    lines.push(`Zero:${g.zero}(spot ${g.spotVsZero}) CallWall:${g.callWall} PutWall:${g.putWall}`);
    if (g.deltaFlow) lines.push(`DeltaFlow:${g.deltaFlow}(${g.intensity})`);
    if (g.charm) lines.push(`Charm:${g.charm}`);
  }

  return lines.join('\n');
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
