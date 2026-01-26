// VHunter Analysis Module
import { fetchTickerData, fetchClaude, fetchNews, fetchTickerDetails } from './api.js';
import { updateCharts } from './charts.js';
import * as indicators from './indicators.js';
import * as gammaTools from './gamma.js';
import * as ui from './ui.js';
import { buildCombinedPrompt, buildSummaryPrompt } from './prompts.js';
import { calculateMaxPain } from './utils.js';
import { updateRoute } from './router.js';
import { addToHistory } from './history.js';
import { getFullIVAnalysis, recordIV } from './iv-history.js';
import { recordGammaLevels, getWallShiftAnalysis } from './db.js';
import { CONFIG } from './config.js';
import { getCurrentPage } from './pages.js';
import { optionsData } from './options-page.js';
import * as finMath from './financial-math.js';
import { getFinancials, renderFinancialsHTML } from './financials.js';

export let mktData = {};
let skipCache = false;

export function setSkipCache(value) {
  skipCache = value;
}

export async function run(forceRefresh = false) {
  skipCache = forceRefresh;
  const ticker = ui.$('tk').value.toUpperCase().trim();
  if (!ticker) return;

  ui.setStatus('...');
  ui.hideError();

  try {
    const { prev, aggs, options } = await fetchTickerData(ticker);

    if (!prev || !aggs) {
      ui.setStatus('');
      return;
    }

    updateRoute('analyze', ticker);
    addToHistory(ticker);

    if (prev.results?.[0]) {
      ui.updateCurrentPrice(prev.results[0]);
    }

    if (aggs.results?.length > 0) {
      processHistoricalData(ticker, aggs.results);
    }

    processOptionsData(options, aggs.results?.[aggs.results.length - 1]?.c || 0);

    loadNews(ticker);
    loadFinancials(ticker);

    ui.setStatus('');
  } catch (e) {
    ui.showError(e.message);
    ui.setStatus('');
  }
}

function processHistoricalData(ticker, data) {
  const prices = data.map(d => d.c);
  const highs = data.map(d => d.h);
  const lows = data.map(d => d.l);
  const volumes = data.map(d => d.v);
  const currentPrice = prices[prices.length - 1];
  const lastBar = data[data.length - 1];

  // Calculate indicators
  const sma20 = indicators.average(prices.slice(-20));
  const sma50 = prices.length >= 50 ? indicators.average(prices.slice(-50)) : sma20;
  const rsiValues = indicators.calcRSI(prices, 14);
  const rsi = rsiValues[rsiValues.length - 1];
  const atrValues = indicators.calcATR(data, 14);
  const atr = atrValues[atrValues.length - 1];
  const mfiValues = indicators.calcMFI(data, 14);
  const mfi = mfiValues[mfiValues.length - 1];
  const adxData = indicators.calcADX(data, 14);
  const adx = adxData.adx[adxData.adx.length - 1];
  const macd = indicators.calcMACD(prices);
  const macdH = macd.histogram[macd.histogram.length - 1];
  const bb = indicators.calcBollingerBands(prices);
  const adl = indicators.calcADL(data, true); // Debug enabled - check console
  const sma20Arr = indicators.calcSMA(prices, 20);
  const sma50Arr = indicators.calcSMA(prices, 50);

  // Calculate volatility using Yang-Zhang estimator (professional grade)
  // Pass OHLC bars for best accuracy - handles overnight gaps and drift
  const vol = finMath.calcRealizedVolatility(data, 30) || 0;

  // Relative volume
  const avgVol = indicators.average(volumes.slice(-20));
  const rvol = lastBar.v / avgVol;

  // Bollinger %B
  const bbStd = Math.sqrt(prices.slice(-20).reduce((s, x) => s + Math.pow(x - sma20, 2), 0) / 20);
  const bbUpper = sma20 + 2 * bbStd;
  const bbLower = sma20 - 2 * bbStd;
  const bbPct = ((currentPrice - bbLower) / (bbUpper - bbLower) * 100).toFixed(0);

  // VWAP (simplified)
  const vwap = (lastBar.h + lastBar.l + lastBar.c) / 3;
  const vwapDiff = ((currentPrice - vwap) / vwap * 100).toFixed(1);

  // Volume trend
  const recentVol = indicators.average(volumes.slice(-5));
  const olderVol = indicators.average(volumes.slice(-20, -5));
  const volTrend = ((recentVol - olderVol) / olderVol * 100).toFixed(0);

  // SMA signal
  const smaSignal = currentPrice > sma20 && sma20 > sma50 ? 'Bull' :
    currentPrice < sma20 && sma20 < sma50 ? 'Bear' : 'Mix';

  // Pivots
  const pivot = (lastBar.h + lastBar.l + lastBar.c) / 3;
  const pivots = {
    pivot,
    r1: 2 * pivot - lastBar.l,
    r2: pivot + (lastBar.h - lastBar.l),
    s1: 2 * pivot - lastBar.h,
    s2: pivot - (lastBar.h - lastBar.l)
  };

  // Money flow
  const upDays = data.slice(-20).filter(d => d.c > d.o);
  const downDays = data.slice(-20).filter(d => d.c <= d.o);
  const buyVol = upDays.reduce((s, d) => s + d.v, 0);
  const sellVol = downDays.reduce((s, d) => s + d.v, 0);
  const buyPct = parseInt((buyVol / (buyVol + sellVol) * 100).toFixed(0));
  const netFlow = buyVol - sellVol;

  // A/D Line change
  const adlChange = ((adl[adl.length - 1] - adl[adl.length - 10]) / Math.abs(adl[adl.length - 10]) * 100);

  // Risk levels
  const stop = currentPrice - 2 * atr;
  const target = currentPrice + 4 * atr;
  const riskPct = ((currentPrice - stop) / currentPrice * 100);

  // 52W range
  const range52w = '$' + Math.min(...lows).toFixed(0) + '-$' + Math.max(...highs).toFixed(0);

  // Score calculation
  let score = 50;
  if (rsi < 30) score += 15;
  else if (rsi > 70) score -= 15;
  score += macdH > 0 ? 10 : -10;
  if (smaSignal === 'Bull') score += 10;
  else if (smaSignal === 'Bear') score -= 10;
  if (parseInt(bbPct) < 20) score += 10;
  else if (parseInt(bbPct) > 80) score -= 10;
  if (buyPct > 60) score += 5;
  else if (buyPct < 40) score -= 5;
  score = Math.max(0, Math.min(100, score));

  // Update UI
  ui.updateScore(score);
  ui.updateIndicators({ rsi, macdH, smaSignal, bbPct, vwapDiff, volTrend });
  ui.updateKeyStats({
    rsi, mfi, atr, adx, rvol, sma20, sma50, pivots, range52w, stop, target, riskPct
  });
  ui.updateMoneyFlow({ buyPct, netFlow, adlChange });

  // Status bar
  ui.updateStatusBar(
    adx > 40 ? { label: 'STRONG', color: 'g', detail: 'ADX>40' } :
      adx > 25 ? { label: 'MOD', color: 'y', detail: '25-40' } :
        { label: 'WEAK', color: 'r', detail: '<25' },
    rsi > 70 ? { label: 'OB', color: 'r', detail: 'RSI>70' } :
      rsi < 30 ? { label: 'OS', color: 'g', detail: '<30' } :
        rsi > 50 ? { label: 'BULL', color: 'g', detail: '50-70' } :
          { label: 'BEAR', color: 'r', detail: '30-50' },
    rvol > 2 ? { label: 'EXT', color: 'p', detail: '>2x' } :
      rvol > 1.3 ? { label: 'HIGH', color: 'g', detail: '>1.3x' } :
        rvol < 0.7 ? { label: 'LOW', color: 'r', detail: '<0.7x' } :
          { label: 'NORM', color: '', detail: '~1x' },
    vol > 60 ? { label: 'EXT', color: 'r', detail: '>60%' } :
      vol > 40 ? { label: 'HIGH', color: 'y', detail: '40-60' } :
        vol > 20 ? { label: 'NORM', color: '', detail: '20-40' } :
          { label: 'LOW', color: 'g', detail: '<20%' }
  );

  // Performance
  if (prices.length >= 2) ui.setPerformance('d1', currentPrice, prices[prices.length - 2]);
  if (prices.length >= 6) ui.setPerformance('w1', currentPrice, prices[prices.length - 6]);
  if (prices.length >= 23) ui.setPerformance('m1', currentPrice, prices[prices.length - 23]);

  // Store for AI and VRP calculations
  mktData = {
    ticker,
    price: currentPrice,
    prices, // Store close prices for backwards compatibility
    bars: data, // Store full OHLC bars for Yang-Zhang volatility
    change: ((currentPrice - data[data.length - 2].c) / data[data.length - 2].c) * 100,
    volume: ui.formatNumber(lastBar.v),
    rvol,
    rsi,
    macdH,
    adx,
    pdi: adxData.pdi[adxData.pdi.length - 1] || 0,
    mdi: adxData.mdi[adxData.mdi.length - 1] || 0,
    bbPct,
    mfi,
    atr,
    sma20,
    sma50,
    buyPct,
    adlTrend: adlChange,
    vol, // Historical volatility
    hv30: vol // Alias for clarity
  };

  // Update charts
  const labels = data.map(d => new Date(d.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  updateCharts({
    labels,
    prices,
    volumes,
    bars: data,
    rsi: rsiValues,
    macd,
    adxData,
    bb,
    mfi: mfiValues,
    adl,
    atr: atrValues,
    sma20: sma20Arr,
    sma50: sma50Arr
  });
}

function processOptionsData(options, spotPrice) {
  if (!options?.all?.length || !spotPrice) {
    ui.updateOptions(null);
    mktData.callVol = '0';
    mktData.putVol = '0';
    mktData.pcRatio = 1;
    mktData.topCalls = 'N/A';
    mktData.topPuts = 'N/A';
    mktData.maxPain = 'N/A';
    mktData.vrp = null;
    mktData.ivRank = null;
    mktData.volSetup = null;
    if (mktData.price) callAI();
    return;
  }

  const allOptions = options.all;

  const nearMoney = allOptions.filter(o => {
    const strike = o.details?.strike_price;
    if (!strike) return false;
    const pctFromSpot = Math.abs(strike - spotPrice) / spotPrice;
    return pctFromSpot < 0.15;
  });

  let callVol = 0, putVol = 0, callOI = 0, putOI = 0, ivSum = 0, ivCount = 0;
  const calls = [], puts = [];

  // IV by expiration bucket for term structure
  const expiryIV = { weekly: [], monthly: [], quarterly: [], sixMonth: [] };

  allOptions.forEach(o => {
    const details = o.details;
    const day = o.day;
    if (!details || !day) return;

    const vol = day.volume || 0;
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

      // Bucket IV by expiration for term structure
      const expDate = details.expiration_date;
      const daysToExp = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysToExp <= 7) expiryIV.weekly.push(o.implied_volatility * 100);
      else if (daysToExp <= 30) expiryIV.monthly.push(o.implied_volatility * 100);
      else if (daysToExp <= 90) expiryIV.quarterly.push(o.implied_volatility * 100);
      else expiryIV.sixMonth.push(o.implied_volatility * 100);
    }
  });

  nearMoney.forEach(o => {
    const details = o.details;
    const day = o.day;
    if (!details || !day) return;

    const vol = day.volume || 0;
    if (vol > 10) {
      if (details.contract_type === 'call') {
        calls.push({ strike: details.strike_price, volume: vol, oi: o.open_interest || 0 });
      } else {
        puts.push({ strike: details.strike_price, volume: vol, oi: o.open_interest || 0 });
      }
    }
  });

  const pcRatio = putVol / (callVol || 1);
  const avgIV = ivCount > 0 ? (ivSum / ivCount * 100) : 0;

  // Calculate term structure averages
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const termStructure = {
    weekly: avg(expiryIV.weekly),
    monthly: avg(expiryIV.monthly),
    quarterly: avg(expiryIV.quarterly),
    sixMonth: avg(expiryIV.sixMonth)
  };

  // Calculate VRP metrics using stored bar/price data
  // Uses Yang-Zhang when OHLC bars available
  let vrpMetrics = null;
  let ivAnalysis = null;
  let volSetup = null;

  const volData = mktData.bars?.length > 0 ? mktData.bars : mktData.prices;
  if (volData && avgIV > 0) {
    vrpMetrics = indicators.calcVolatilityMetrics(volData, avgIV, termStructure);
    ivAnalysis = getFullIVAnalysis(mktData.ticker, avgIV);

    // Classify the volatility setup
    volSetup = indicators.classifyVolSetup({
      ivRank: ivAnalysis.ivRank,
      vrp: vrpMetrics.vrp,
      iv: avgIV, // Current IV for fallback estimation
      rvRank: null, // Would need cross-sectional data
      termSteepness: vrpMetrics.termSteepness
    });
  }

  const weeklyMaxPain = calculateMaxPain(options.weekly);
  const monthlyMaxPain = calculateMaxPain(options.monthly);
  const sixMonthMaxPain = calculateMaxPain(options.sixMonth);

  // Use standardized expected move calculation (30-day)
  const expMove = finMath.calcExpectedMove(spotPrice, avgIV, 30);
  ui.$('eM').textContent = '±$' + expMove.toFixed(2);

  calls.sort((a, b) => b.volume - a.volume);
  puts.sort((a, b) => b.volume - a.volume);

  ui.updateOptions({
    callVol,
    putVol,
    pcRatio,
    avgIV,
    maxPain: { weekly: weeklyMaxPain, monthly: monthlyMaxPain, sixMonth: sixMonthMaxPain },
    topCalls: calls.slice(0, 3),
    topPuts: puts.slice(0, 3),
    pcOI: putOI / (callOI || 1),
    spotPrice,
    vrpMetrics,
    ivAnalysis,
    volSetup,
    termStructure
  });

  // Update VRP display in UI
  ui.updateVRPDisplay(vrpMetrics, ivAnalysis, volSetup);

  mktData.callVol = ui.formatNumber(callVol);
  mktData.putVol = ui.formatNumber(putVol);
  mktData.pcRatio = pcRatio;
  mktData.topCalls = calls.slice(0, 3).map(c => '$' + c.strike).join(', ') || 'N/A';
  mktData.topPuts = puts.slice(0, 3).map(p => '$' + p.strike).join(', ') || 'N/A';
  mktData.maxPain = weeklyMaxPain || 'N/A';
  mktData.maxPainMonthly = monthlyMaxPain || 'N/A';

  // Add VRP data to mktData for AI prompts
  mktData.avgIV = avgIV;
  mktData.vrp = vrpMetrics?.vrp;
  mktData.rv30 = vrpMetrics?.rv30;
  mktData.ivRank = ivAnalysis?.ivRank;
  mktData.ivPercentile = ivAnalysis?.ivPercentile;

  // Calculate GEX metrics using institutional-grade functions
  const gexMetrics = indicators.calcGEX(allOptions, spotPrice);
  const dexMetrics = indicators.calcDEX(allOptions, spotPrice);

  // Advanced gamma analytics (SIG-level)
  const gammaAnalysis = gammaTools.analyzeGamma(allOptions, spotPrice);
  const deltaFlow = gammaAnalysis.deltaFlow;
  const charmPressure = gammaAnalysis.charm;

  // Add GEX data to mktData for AI prompts
  mktData.gexMetrics = gexMetrics;
  mktData.dexMetrics = dexMetrics;
  mktData.deltaFlow = deltaFlow;
  mktData.charmPressure = charmPressure;
  mktData.gammaLevels = gammaAnalysis.levels;
  mktData.gammaRegime = gammaAnalysis.regime;

  // Record gamma levels for wall shift tracking
  if (gexMetrics && !gexMetrics.error) {
    recordGammaLevels(mktData.ticker, {
      callWall: gexMetrics.callWall,
      putWall: gexMetrics.putWall,
      zeroGamma: gexMetrics.gexZeroLine,
      netGEX: gexMetrics.netGEX,
      regime: gexMetrics.regime,
      spotPrice: spotPrice
    });

    // Get wall shift analysis
    const wallShift = getWallShiftAnalysis(mktData.ticker);
    mktData.wallShift = wallShift;
  }
  mktData.termSteepness = vrpMetrics?.termSteepness;
  mktData.volSetup = volSetup;
  mktData.termStructure = termStructure;

  if (mktData.price) callAI();
}

async function callAI() {
  ui.$('aiSt').textContent = skipCache ? 'refreshing...' : 'thinking...';

  try {
    // Single combined API call instead of two separate calls
    const response = await fetchClaude(buildCombinedPrompt(mktData), skipCache);

    // Split response at ===TRADES=== separator
    const [analysis, trades] = response.split('===TRADES===').map(s => s.trim());

    ui.updateAI(analysis || response, trades || '', skipCache ? 'fresh' : 'done');
    skipCache = false;
  } catch (e) {
    ui.$('aiOut').textContent = 'AI Error: ' + e.message;
    ui.$('aiSt').textContent = 'error';
  }
}

async function loadNews(ticker) {
  const newsOut = ui.$('newsOut');
  newsOut.innerHTML = '<span style="color:#94a3b8">Loading news...</span>';

  try {
    const [news, details] = await Promise.all([
      fetchNews(ticker),
      fetchTickerDetails(ticker)
    ]);

    let html = '';

    if (details?.results) {
      const d = details.results;
      const mcap = d.market_cap ? '$' + (d.market_cap / 1e9).toFixed(1) + 'B' : '--';
      html += `<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0">
        <strong>${d.name || ticker}</strong> · ${d.sic_description || 'N/A'}
        <div style="color:#64748b;margin-top:2px">Mkt Cap: ${mcap} · Employees: ${d.total_employees?.toLocaleString() || '--'}</div>
      </div>`;
    }

    if (news?.results?.length > 0) {
      html += news.results.map(n => {
        const date = new Date(n.published_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const source = n.publisher?.name || 'News';
        return `<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #f1f5f9">
          <a href="${n.article_url}" target="_blank" style="color:#1e293b;text-decoration:none;font-weight:500">${n.title}</a>
          <div style="color:#94a3b8;font-size:9px;margin-top:2px">${source} · ${date}</div>
        </div>`;
      }).join('');
    } else {
      html += '<div style="color:#94a3b8">No recent news available</div>';
    }

    newsOut.innerHTML = html;
  } catch (e) {
    newsOut.innerHTML = '<span style="color:#ef4444">Failed to load news</span>';
  }
}

async function loadFinancials(ticker) {
  const container = document.getElementById('financialsContent');
  if (!container) return;

  container.innerHTML = '<div class="financials-loading">Loading SEC financials...</div>';

  try {
    const data = await getFinancials(ticker);
    container.innerHTML = renderFinancialsHTML(data);
  } catch (e) {
    container.innerHTML = `<div class="financials-error">Failed to load financials: ${e.message}</div>`;
  }
}

export function exportData() {
  if (!mktData.ticker) {
    alert('No data to export. Run analysis first.');
    return;
  }

  const d = mktData;
  const score = parseInt(ui.$('sc')?.textContent) || 0;
  const signal = ui.$('sg')?.textContent || '';

  const exportText = `[${d.ticker}] $${d.price.toFixed(2)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(1)}%) | Score: ${score}/100 ${signal}
Vol: ${d.volume} (${d.rvol.toFixed(1)}x) | ATR: $${d.atr.toFixed(2)} | HV: ${d.vol.toFixed(0)}%
RSI: ${d.rsi.toFixed(0)} | MACD: ${d.macdH >= 0 ? '+' : ''}${d.macdH.toFixed(2)} | MFI: ${d.mfi.toFixed(0)} | ADX: ${d.adx.toFixed(0)} (+DI:${d.pdi.toFixed(0)}/-DI:${d.mdi.toFixed(0)})
BB%: ${d.bbPct}% | SMA20: $${d.sma20.toFixed(2)} | SMA50: $${d.sma50.toFixed(2)}
Flow: ${d.buyPct}% buy | A/D: ${d.adlTrend >= 0 ? '+' : ''}${d.adlTrend.toFixed(0)}% ${d.adlTrend >= 0 ? 'accum' : 'distr'}
Opts: C:${d.callVol} P:${d.putVol} | P/C: ${d.pcRatio.toFixed(2)} | MaxPain: $${d.maxPain}
Calls: ${d.topCalls} | Puts: ${d.topPuts}`;

  navigator.clipboard.writeText(exportText).then(() => {
    const btn = document.querySelector('.btn-export');
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = '';
    }, 1500);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = exportText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('Data copied to clipboard!');
  });
}

export function shareAnalysis() {
  const ticker = ui.$('tk').value.toUpperCase().trim();
  if (!ticker) {
    alert('No ticker to share. Run analysis first.');
    return;
  }

  const url = `${window.location.origin}${window.location.pathname}#analyze/${ticker}`;

  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.btn-share');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = '';
    }, 1500);
  }).catch(() => {
    prompt('Copy this URL:', url);
  });
}

// ============================================
// SUMMARY MANAGEMENT (via Cloudflare KV)
// ============================================

const getUserId = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

async function saveSummaryToKV(ticker, summary) {
  try {
    await fetch(`${CONFIG.PROXY_URL}/api/summary/${ticker}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId()
      },
      body: JSON.stringify({
        summary,
        price: mktData.price
      })
    });
  } catch (e) {
    console.error('Failed to save summary:', e);
  }
}

async function loadSummaryFromKV(ticker) {
  try {
    const res = await fetch(`${CONFIG.PROXY_URL}/api/summary/${ticker}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const data = await res.json();
    return data.summary ? data : null;
  } catch (e) {
    console.error('Failed to load summary:', e);
    return null;
  }
}

export async function generateSummary() {
  // Get ticker from appropriate page input
  const page = getCurrentPage();
  const tickerInput = page === 'options' ? ui.$('optTicker') : ui.$('tk');
  const ticker = tickerInput?.value?.toUpperCase().trim();

  if (!ticker) {
    alert('Enter a ticker first.');
    return;
  }

  // Determine which data source to use
  let dataForPrompt;
  if (page === 'options') {
    if (!optionsData.spotPrice || optionsData.ticker !== ticker) {
      alert('Analyze the ticker first before generating summary.');
      return;
    }
    // Build compatible data object from optionsData
    dataForPrompt = {
      ticker: optionsData.ticker,
      price: optionsData.spotPrice,
      change: optionsData.changePct || 0,
      // Options-specific data
      ivRank: optionsData.ivAnalysis?.ivRank,
      ivPct: optionsData.ivAnalysis?.ivPercentile,
      hv30: optionsData.hv30,
      vrp: optionsData.vrpMetrics?.vrp,
      volSetup: optionsData.volSetup,
      gexMetrics: optionsData.gexMetrics,
      gammaAnalysis: optionsData.gammaAnalysis,
      gammaRatio: optionsData.gammaRatio
    };
  } else {
    if (!mktData.price) {
      alert('Run analysis first before generating summary.');
      return;
    }
    dataForPrompt = mktData;
  }

  const section = ui.$('summarySection');
  const content = ui.$('summaryContent');
  const tickerEl = ui.$('summaryTicker');
  const timeEl = ui.$('summaryTime');
  const btn = ui.$('btnSummary');

  // Show section and loading state
  section.style.display = 'block';
  section.classList.remove('collapsed');
  ui.$('summaryToggle').textContent = '▼';
  content.innerHTML = '<div class="summary-loading">Generating summary...</div>';
  tickerEl.textContent = ticker;
  btn.classList.add('loading');

  try {
    const prompt = buildSummaryPrompt(dataForPrompt);
    const response = await fetchClaude(prompt, true); // Always fresh for summaries

    // Save to KV storage
    await saveSummaryToKV(ticker, response);

    // Update UI
    content.innerHTML = formatSummary(response);
    timeEl.textContent = 'Just now';
    btn.classList.remove('loading');
    btn.classList.add('has-summary');
  } catch (e) {
    content.innerHTML = `<div class="summary-error">Error generating summary: ${e.message}</div>`;
    btn.classList.remove('loading');
  }
}

export async function showExistingSummary(ticker) {
  const section = ui.$('summarySection');
  const content = ui.$('summaryContent');
  const tickerEl = ui.$('summaryTicker');
  const timeEl = ui.$('summaryTime');
  const btn = ui.$('btnSummary');

  // Reset state
  btn.classList.remove('has-summary');

  const stored = await loadSummaryFromKV(ticker);

  if (stored && stored.summary) {
    section.style.display = 'block';
    section.classList.remove('collapsed');
    ui.$('summaryToggle').textContent = '▼';
    content.innerHTML = formatSummary(stored.summary);
    tickerEl.textContent = ticker;

    // Format timestamp
    const age = Date.now() - stored.timestamp;
    const mins = Math.floor(age / 60000);
    const hours = Math.floor(age / 3600000);
    const days = Math.floor(age / 86400000);

    if (days > 0) timeEl.textContent = `${days}d ago`;
    else if (hours > 0) timeEl.textContent = `${hours}h ago`;
    else if (mins > 0) timeEl.textContent = `${mins}m ago`;
    else timeEl.textContent = 'Just now';

    // Show price change since summary
    if (stored.price && mktData.price) {
      const priceDiff = ((mktData.price - stored.price) / stored.price * 100).toFixed(1);
      if (Math.abs(parseFloat(priceDiff)) > 0.1) {
        timeEl.textContent += ` (${priceDiff > 0 ? '+' : ''}${priceDiff}%)`;
      }
    }

    btn.classList.add('has-summary');
  } else {
    section.style.display = 'none';
  }
}

export function toggleSummary() {
  const section = ui.$('summarySection');
  const toggle = ui.$('summaryToggle');

  section.classList.toggle('collapsed');
  toggle.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
}

function formatSummary(text) {
  // Convert markdown-style formatting to HTML
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/<br><br>/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

// Expose to window for onclick handlers
window.run = run;
window.exportData = exportData;
window.shareAnalysis = shareAnalysis;
window.generateSummary = generateSummary;
window.toggleSummary = toggleSummary;
