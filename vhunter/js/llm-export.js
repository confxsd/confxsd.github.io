// VHunter LLM Export Module
// Comprehensive data export for LLM consumption

import { fetchTickerData } from './api.js';
import * as finMath from './financial-math.js';
import * as indicators from './indicators.js';
import * as gammaTools from './gamma.js';
import { getFullIVAnalysis } from './iv-history.js';
import { calculateMaxPain } from './utils.js';
import { getDailyChecks } from './db.js';
import { getMemories } from './memory-map.js';

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

    // Fetch daily checker results and memory map for this ticker (parallel, non-blocking)
    let dailyChecks = [];
    let memories = [];
    try {
      const [dcResult, memResult] = await Promise.allSettled([
        getDailyChecks(),
        getMemories('active')
      ]);
      if (dcResult.status === 'fulfilled') {
        const all = Array.isArray(dcResult.value) ? dcResult.value : (dcResult.value?.data || []);
        dailyChecks = all.filter(c => c.ticker === ticker);
      }
      if (memResult.status === 'fulfilled') {
        const all = Array.isArray(memResult.value) ? memResult.value : (memResult.value?.data || []);
        memories = all.filter(m => (m.affected_assets || []).includes(ticker));
      }
    } catch (_) {}

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
      options: optionsMetrics,
      dailyChecks,
      memories
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

// Format data for LLM consumption - Token-optimized but readable
function formatForLLM(data) {
  const d = data;
  const t = d.technicals;
  const o = d.options;

  const fmt = (v, dec = 2) => v != null ? (typeof v === 'number' ? +v.toFixed(dec) : v) : '-';
  const fmtVol = (v) => {
    if (v == null) return '-';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toFixed(0);
  };
  const fmtGex = (val) => {
    if (val == null) return '-';
    const abs = Math.abs(val);
    if (abs >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (val / 1e3).toFixed(0) + 'K';
    return val.toFixed(0);
  };

  const lines = [];

  // Header
  lines.push(`${d.ticker} | $${fmt(d.price.current)} | ${d.price.changePct >= 0 ? '+' : ''}${fmt(d.price.changePct, 1)}% | Vol: ${fmtVol(d.price.volume)}`);
  lines.push('');

  // Technical Analysis
  if (t && !t.error) {
    lines.push('TECHNICALS');
    lines.push('-'.repeat(40));

    // Momentum
    const rsiSig = t.rsi > 70 ? 'overbought' : t.rsi < 30 ? 'oversold' : 'neutral';
    const macdSig = t.macdH > 0 ? 'bullish' : 'bearish';
    const mfiSig = t.mfi > 80 ? 'overbought' : t.mfi < 20 ? 'oversold' : 'neutral';
    lines.push(`Momentum: RSI ${fmt(t.rsi, 1)} (${rsiSig}) | MACD ${fmt(t.macdH, 3)} (${macdSig}) | MFI ${fmt(t.mfi, 1)} (${mfiSig})`);

    // Trend
    const trendStr = t.adx > 40 ? 'strong trend' : t.adx > 25 ? 'trending' : 'ranging';
    const diSig = t.pdi > t.mdi ? 'bullish' : 'bearish';
    lines.push(`Trend: ADX ${fmt(t.adx, 1)} (${trendStr}) | +DI ${fmt(t.pdi, 1)} vs -DI ${fmt(t.mdi, 1)} (${diSig})`);

    // Moving Averages
    const smaSig = d.price.current > t.sma20 && t.sma20 > t.sma50 ? 'bullish alignment' :
                   d.price.current < t.sma20 && t.sma20 < t.sma50 ? 'bearish alignment' : 'mixed';
    lines.push(`MAs: SMA20 $${fmt(t.sma20)} | SMA50 $${fmt(t.sma50)} | ${smaSig}`);

    // Volatility & Bands
    const bbSig = t.bbPct > 80 ? 'near upper band' : t.bbPct < 20 ? 'near lower band' : 'mid-band';
    lines.push(`Bands: BB% ${fmt(t.bbPct, 0)} (${bbSig}) | ATR $${fmt(t.atr)} | HV30 ${fmt(t.hv30, 1)}%`);

    // Volume Flow
    const rvolSig = t.rvol > 2 ? 'extreme' : t.rvol > 1.3 ? 'high' : t.rvol < 0.7 ? 'low' : 'normal';
    const flowSig = t.buyPct > 55 ? 'accumulation' : t.buyPct < 45 ? 'distribution' : 'neutral';
    lines.push(`Flow: RelVol ${fmt(t.rvol, 1)}x (${rvolSig}) | Buy ${t.buyPct}% (${flowSig}) | A/D ${fmt(t.adlChange, 1)}%`);
    lines.push('');
  }

  // Options Analysis
  if (o && !o.error) {
    lines.push('OPTIONS FLOW');
    lines.push('-'.repeat(40));

    // Volume & Sentiment
    const pcSig = o.pcRatio > 1.2 ? 'bearish' : o.pcRatio < 0.7 ? 'bullish' : 'neutral';
    lines.push(`Volume: Calls ${fmtVol(o.callVol)} | Puts ${fmtVol(o.putVol)} | P/C Ratio ${fmt(o.pcRatio)} (${pcSig})`);
    lines.push(`OI: P/C OI Ratio ${fmt(o.pcOI)}`);

    // Key Strikes
    if (o.topCalls?.length || o.topPuts?.length) {
      const callStr = o.topCalls?.length ? o.topCalls.map(c => '$' + c.strike).join(', ') : '-';
      const putStr = o.topPuts?.length ? o.topPuts.map(p => '$' + p.strike).join(', ') : '-';
      lines.push(`Active Strikes: Calls [${callStr}] | Puts [${putStr}]`);
    }

    // Max Pain & Expected Move
    lines.push(`Max Pain: Weekly $${o.maxPain?.weekly || '-'} | Monthly $${o.maxPain?.monthly || '-'}`);
    lines.push(`Expected Move (30d): ±$${fmt(o.expMove)} (±${fmt(o.expMove / d.price.current * 100, 1)}%)`);
    lines.push('');

    // Volatility Analysis
    if (o.avgIV) {
      lines.push('VOLATILITY');
      lines.push('-'.repeat(40));

      const vrp = o.vrpMetrics;
      const ivA = o.ivAnalysis;

      // IV & Rank
      const ivRankSig = ivA?.ivRank > 80 ? 'very high' : ivA?.ivRank > 60 ? 'high' :
                        ivA?.ivRank < 20 ? 'very low' : ivA?.ivRank < 40 ? 'low' : 'medium';
      lines.push(`IV: ${fmt(o.avgIV, 1)}% | IV Rank: ${fmt(ivA?.ivRank, 0)}% (${ivRankSig})`);
      lines.push(`RV (30d): ${fmt(vrp?.rv30 || t?.hv30, 1)}%`);

      // VRP
      if (vrp?.vrp != null) {
        const vrpSig = vrp.vrp > 10 ? 'options expensive - sell premium' :
                       vrp.vrp > 5 ? 'slight premium' :
                       vrp.vrp < -5 ? 'options cheap - buy premium' :
                       vrp.vrp < 0 ? 'slight discount' : 'fair';
        lines.push(`VRP: ${vrp.vrp >= 0 ? '+' : ''}${fmt(vrp.vrp, 1)}% (${vrpSig})`);
      }

      // Term Structure
      if (vrp?.termSteepness != null) {
        const termSig = vrp.termSteepness > 10 ? 'contango' :
                        vrp.termSteepness < -5 ? 'backwardation' : 'flat';
        lines.push(`Term Structure: ${vrp.termSteepness >= 0 ? '+' : ''}${fmt(vrp.termSteepness, 1)}% (${termSig})`);
      }

      // Term Structure Details
      if (o.termStructure) {
        const ts = o.termStructure;
        const tsVals = [];
        if (ts.weekly != null) tsVals.push(`Weekly ${fmt(ts.weekly, 1)}%`);
        if (ts.monthly != null) tsVals.push(`Monthly ${fmt(ts.monthly, 1)}%`);
        if (ts.quarterly != null) tsVals.push(`Quarterly ${fmt(ts.quarterly, 1)}%`);
        if (ts.sixMonth != null) tsVals.push(`6M ${fmt(ts.sixMonth, 1)}%`);
        if (tsVals.length > 1) {
          lines.push(`IV by Expiry: ${tsVals.join(' | ')}`);
        }
      }

      // Vol Setup
      if (o.volSetup?.setup) {
        lines.push(`Vol Setup: ${o.volSetup.setup.replace(/_/g, ' ')} (${o.volSetup.confidence}% confidence)`);
        if (o.volSetup.description) {
          lines.push(`  → ${o.volSetup.description}`);
        }
      }
      lines.push('');
    }

    // GEX Analysis
    const gexM = o.gexMetrics;
    const gamma = o.gammaAnalysis;
    if (gexM && !gexM.error) {
      lines.push('GAMMA EXPOSURE (GEX)');
      lines.push('-'.repeat(40));

      // Net GEX & Regime
      let regimeDesc = '';
      if (gexM.regime === 'POSITIVE_GAMMA') {
        regimeDesc = 'dealers long gamma → mean-reverting, fade moves';
      } else if (gexM.regime === 'NEGATIVE_GAMMA') {
        regimeDesc = 'dealers short gamma → trending, follow momentum';
      } else {
        regimeDesc = 'near neutral';
      }
      lines.push(`Net GEX: ${gexM.netGEXFormatted || fmtGex(gexM.netGEX)} | Regime: ${regimeDesc}`);

      // Key Levels
      const spotVsZero = d.price.current > gexM.gexZeroLine ? 'spot above → stabilizing' : 'spot below → amplifying';
      lines.push(`Zero Gamma: $${fmt(gexM.gexZeroLine, 0)} (${spotVsZero})`);
      lines.push(`Call Wall: $${fmt(gexM.callWall, 0)} (resistance) | Put Wall: $${fmt(gexM.putWall, 0)} (support)`);

      // Delta Flow
      if (gamma?.deltaFlow) {
        lines.push(`Delta Flow: ${gamma.deltaFlow.hedgingPressure} (${gamma.deltaFlow.intensity})`);
      }

      // Charm/Pinning
      if (gamma?.charm?.pinningStrike) {
        lines.push(`Charm: ${gamma.charm.signal}`);
      }
    }
  }

  // Daily Checker Results
  if (d.dailyChecks?.length) {
    lines.push('');
    lines.push('DAILY CHECKER ANALYSIS');
    lines.push('='.repeat(40));

    d.dailyChecks.forEach(check => {
      const r = check.latest_result;
      let market = null, opts2 = null, analysis = null;
      try {
        const raw = r?.market_snapshot ? JSON.parse(r.market_snapshot) : null;
        market = raw?.price != null ? raw : (raw?.daily ?? null);
      } catch (_) {}
      try { opts2 = r?.options_snapshot ? JSON.parse(r.options_snapshot) : null; } catch (_) {}
      try { analysis = r?.ai_analysis ? JSON.parse(r.ai_analysis) : null; } catch (_) {}

      lines.push(`Direction: ${(check.direction || '').toUpperCase()} | Priority: ${check.priority}/5 | Status: ${check.status}`);
      if (check.tags) lines.push(`Tags: ${check.tags}`);
      lines.push('');

      // Thesis
      lines.push('Thesis:');
      lines.push(check.thesis);
      if (analysis?.thesis_notes && analysis.thesis_notes !== check.thesis) {
        lines.push(`AI Thesis Notes: ${analysis.thesis_notes}`);
      }
      if (r) {
        lines.push(`Thesis Valid: ${r.thesis_valid ? 'YES' : 'NO'} | Macro Alignment: ${(r.macro_alignment || '--').toUpperCase()}`);
      }
      lines.push('');

      // Signal & Score
      if (r) {
        lines.push(`Signal: ${r.signal || 'NO DATA'} | Score: ${r.opportunity_score ?? '--'}/100`);
        if (analysis?.conviction) lines.push(`Conviction: ${analysis.conviction.toUpperCase()}`);
        if (r.ai_summary) lines.push(`Summary: ${r.ai_summary}`);
        if (analysis?.signal_reason) lines.push(`Signal Reason: ${analysis.signal_reason}`);
        lines.push('');
      }

      // Key Levels
      const levels = analysis?.key_levels;
      if (levels) {
        const parts = [];
        if (levels.entry != null) parts.push(`Entry: $${levels.entry}`);
        const tgt = levels.target ?? levels.target_1;
        if (tgt != null) parts.push(`Target: $${tgt}`);
        if (levels.stop != null) parts.push(`Stop: $${levels.stop}`);
        if (levels.risk_reward != null) parts.push(`R:R: ${parseFloat(levels.risk_reward).toFixed(1)}x`);
        if (levels.expected_hold_days != null) parts.push(`Hold: ${levels.expected_hold_days}d`);
        if (parts.length) lines.push(`Key Levels: ${parts.join(' | ')}`);
        if (levels.entry_zone) lines.push(`Entry Zone: ${levels.entry_zone}`);
        if (levels.stop_basis) lines.push(`Stop Basis: ${levels.stop_basis}`);
        lines.push('');
      }

      // Timeframe Alignment
      const tfa = analysis?.timeframe_alignment;
      if (tfa) {
        lines.push(`Timeframe: M:${tfa.monthly || '-'} W:${tfa.weekly || '-'} D:${tfa.daily || '-'} | Quality: ${tfa.alignment_quality || '-'}`);
        if (tfa.notes) lines.push(`TF Notes: ${tfa.notes}`);
      }

      // Position Sizing
      const ps = analysis?.position_sizing;
      if (ps) {
        const psParts = [];
        if (ps.suggested_size) psParts.push(`Size: ${ps.suggested_size.toUpperCase()}`);
        if (ps.max_risk_pct) psParts.push(`Max Risk: ${ps.max_risk_pct}`);
        if (psParts.length) lines.push(`Position: ${psParts.join(' | ')}`);
        if (ps.size_rationale) lines.push(`Sizing Rationale: ${ps.size_rationale}`);
        if (ps.scale_in_plan) lines.push(`Scale-in: ${ps.scale_in_plan}`);
      }

      // Technical & Options AI Summaries
      if (analysis?.technical_summary) {
        lines.push('');
        lines.push(`Technical Summary: ${analysis.technical_summary}`);
      }
      if (analysis?.options_summary) {
        lines.push(`Options Summary: ${analysis.options_summary}`);
      }

      // Short Interest
      const si = market?.shortInterest;
      if (si?.shortFloatPct != null) {
        const sqRisk = si.shortFloatPct >= 20 ? 'HIGH' : si.shortFloatPct >= 10 ? 'MODERATE' : 'LOW';
        lines.push(`Short Interest: ${si.shortFloatPct.toFixed(1)}% float | DTC: ${si.shortRatio?.toFixed(1) || '-'}d | Squeeze: ${sqRisk}`);
        if (si.insiderOwnPct != null || si.instOwnPct != null) {
          lines.push(`Ownership: Insider ${si.insiderOwnPct != null ? si.insiderOwnPct.toFixed(1) + '%' : '-'} | Institutional ${si.instOwnPct != null ? si.instOwnPct.toFixed(1) + '%' : '-'}`);
        }
      }

      // Trade Structure
      const ts = analysis?.trade_structure;
      if (ts) {
        lines.push('');
        lines.push('Trade Structure:');
        if (ts.instrument) lines.push(`  Instrument: ${ts.instrument}${ts.specific_structure ? ' — ' + ts.specific_structure : ''}`);
        if (ts.entry_condition) lines.push(`  Entry Trigger: ${ts.entry_condition}`);
        if (ts.exit_rules) lines.push(`  Exit Rules: ${ts.exit_rules}`);
        if (ts.avoid_if) lines.push(`  Avoid If: ${ts.avoid_if}`);
      }

      // Strategy Fit
      const sf = analysis?.strategy_fit;
      if (sf) {
        lines.push(`Strategy Fit: ${sf.still_fits ? 'FITS' : 'DRIFTED'}${sf.strategy_entry_met ? ' | ENTRY MET' : ''}${sf.strategy_exit_triggered ? ' | EXIT TRIGGERED' : ''}`);
        if (sf.fit_notes) lines.push(`  ${sf.fit_notes}`);
      }

      // Catalysts
      const cat = analysis?.catalysts;
      const cal = market?.catalystCalendar;
      if (cat || cal) {
        lines.push('');
        lines.push('Catalysts:');
        if (cal?.earnings) lines.push(`  Earnings: ${cal.earnings.date} (${cal.earnings.days}d)`);
        if (cal?.exDividend) lines.push(`  Ex-Div: ${cal.exDividend.date} (${cal.exDividend.days}d)${cal.exDividend.amount ? ' $' + cal.exDividend.amount : ''}`);
        if (cal?.split) lines.push(`  Split: ${cal.split.date} (${cal.split.days}d)${cal.split.ratio ? ' ' + cal.split.ratio : ''}`);
        if (cat?.catalyst_impact) lines.push(`  Impact: ${cat.catalyst_impact}`);
        if (cat?.timing_edge) lines.push(`  Edge: ${cat.timing_edge}`);
        if (cat?.news_assessment) lines.push(`  News: ${cat.news_assessment}`);
        const riskEvents = cat?.upcoming_risk_events || analysis?.risk_events || [];
        if (riskEvents.length) lines.push(`  Risk Events: ${riskEvents.join(', ')}`);
      }

      // Institutional
      if (analysis?.institutional_summary) {
        lines.push(`Institutional: ${analysis.institutional_summary}`);
      }

      // Fund Holders
      const fh = market?.fundHolders;
      if (fh?.length) {
        lines.push('Fund Holders:');
        fh.forEach(f => {
          const tag = f.isNew ? ' [NEW]' : f.isExit ? ' [EXIT]' : (f.pctChange ? ` [${f.pctChange > 0 ? '+' : ''}${f.pctChange}%]` : '');
          lines.push(`  ${f.name} — ${((f.shares || 0) / 1e3).toFixed(0)}K shares${tag}`);
        });
      }

      // Macro
      if (analysis?.macro_notes) {
        lines.push(`Macro Context: ${analysis.macro_notes}`);
      }

      // Counter-Check Review
      const review = analysis?._review;
      if (review) {
        lines.push('');
        lines.push(`Counter-Check: ${review.grade} — ${review.action}${review.adjusted_confidence != null ? ` (adj. confidence: ${(review.adjusted_confidence * 100).toFixed(0)}%)` : ''}`);
        if (review.key_concern) lines.push(`  Concern: ${review.key_concern}`);
        if (review.counter_thesis) lines.push(`  Counter-Thesis: ${review.counter_thesis}`);
        if (review.flags) {
          Object.entries(review.flags).filter(([, v]) => v?.found).forEach(([k, v]) => {
            lines.push(`  Flag — ${k.replace(/_/g, ' ')}: ${v.detail}`);
          });
        }
      }

      // Validation Override
      if (analysis?._validation) {
        lines.push(`VALIDATION: Signal demoted ${analysis._validation.original_signal} → ${analysis._validation.demoted_to}`);
      }

      // Confirmation Conditions
      const cc = analysis?.confirmation_conditions || [];
      const ce = analysis?.confirmation_evaluation || {};
      if (cc.length) {
        lines.push('Confirmation Conditions:');
        cc.forEach(cond => {
          const st = ce[cond] || 'pending';
          const icon = st === 'met' ? '[MET]' : st === 'invalidated' ? '[INVALIDATED]' : '[PENDING]';
          lines.push(`  ${icon} ${cond}`);
        });
      }

      // Memory context from checker
      if (analysis?.memory_relevance) {
        lines.push(`Memory Context: ${analysis.memory_relevance}`);
      }

      if (r?.created_at) lines.push(`Last Run: ${r.created_at}`);
    });
  }

  // Memory Map - Semantic Memories
  if (d.memories?.length) {
    lines.push('');
    lines.push('SEMANTIC MEMORY MAP');
    lines.push('='.repeat(40));

    d.memories.forEach(m => {
      lines.push('');
      lines.push(`[${m.category || 'general'}] ${m.name} (importance: ${m.importance_score}/10, sentiment: ${m.sentiment_score >= 0 ? '+' : ''}${m.sentiment_score}, confidence: ${m.confidence}/10)`);
      if (m.description) lines.push(`  ${m.description}`);
      if (m.market_relevance) lines.push(`  Market Relevance: ${m.market_relevance}`);
      if (m.current_thesis_impact) lines.push(`  Thesis Impact: ${m.current_thesis_impact}`);
      if (m.volatility_impact) lines.push(`  Volatility Impact: ${m.volatility_impact}`);
      if (m.timeframe) lines.push(`  Timeframe: ${m.timeframe}`);
      if (m.affected_assets?.length > 1) lines.push(`  Also affects: ${m.affected_assets.filter(a => a !== d.ticker).join(', ')}`);
      if (m.trade_implications?.length) {
        lines.push('  Trade Implications:');
        m.trade_implications.forEach(ti => lines.push(`    - ${ti}`));
      }
      // Sentiment history
      if (m.updates?.length) {
        const recent = m.updates.slice(0, 3);
        lines.push('  Recent Updates:');
        recent.forEach(u => {
          const delta = u.sentiment_delta >= 0 ? `+${u.sentiment_delta}` : `${u.sentiment_delta}`;
          lines.push(`    [${u.created_at?.split('T')[0] || '?'}] ${u.summary} (sentiment ${delta} → ${u.new_sentiment})`);
          if (u.reasoning) lines.push(`      Reasoning: ${u.reasoning}`);
        });
      }
    });
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
