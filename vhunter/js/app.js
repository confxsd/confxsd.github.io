// VHunter Main Application
import { CONFIG } from './config.js';
import { fetchTickerData, fetchClaude } from './api.js';
import { initCharts, updateCharts } from './charts.js';
import * as indicators from './indicators.js';
import * as ui from './ui.js';
import { buildAnalysisPrompt, buildTradePrompt } from './prompts.js';

let mktData = {};
let skipCache = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  ui.$('tm').textContent = new Date().toLocaleString();
  initCharts();
  run();
});

// Enter key handler
document.getElementById('tk').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') run();
});

// Expose run to window for button onclick
window.run = run;

async function run(forceRefresh = false) {
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

    if (prev.results?.[0]) {
      ui.updateCurrentPrice(prev.results[0]);
    }

    if (aggs.results?.length > 0) {
      processHistoricalData(ticker, aggs.results);
    }

    processOptionsData(options?.results, aggs.results?.[aggs.results.length - 1]?.c || 0);

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
  const adl = indicators.calcADL(data);
  const sma20Arr = indicators.calcSMA(prices, 20);
  const sma50Arr = indicators.calcSMA(prices, 50);

  // Calculate volatility
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const avgReturn = indicators.average(returns);
  const vol = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length) * Math.sqrt(252) * 100;

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

  // Store for AI
  mktData = {
    ticker,
    price: currentPrice,
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
    vol
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
  if (!options?.length || !spotPrice) {
    ui.updateOptions(null);
    mktData.callVol = '0';
    mktData.putVol = '0';
    mktData.pcRatio = 1;
    mktData.topCalls = 'N/A';
    mktData.topPuts = 'N/A';
    mktData.maxPain = 'N/A';
    if (mktData.price) callAI();
    return;
  }

  let callVol = 0, putVol = 0, callOI = 0, putOI = 0, ivSum = 0, ivCount = 0;
  const calls = [], puts = [];

  options.forEach(o => {
    const details = o.details;
    const day = o.day;
    if (!details || !day) return;

    if (details.contract_type === 'call') {
      callVol += day.volume || 0;
      callOI += day.open_interest || 0;
      if (day.volume > 100) calls.push({ strike: details.strike_price, volume: day.volume });
    } else {
      putVol += day.volume || 0;
      putOI += day.open_interest || 0;
      if (day.volume > 100) puts.push({ strike: details.strike_price, volume: day.volume });
    }

    if (o.implied_volatility) {
      ivSum += o.implied_volatility;
      ivCount++;
    }
  });

  const pcRatio = putVol / (callVol || 1);
  const avgIV = ivCount > 0 ? (ivSum / ivCount * 100) : 0;

  // Max pain calculation
  const strikes = {};
  options.forEach(o => {
    const strike = o.details?.strike_price;
    if (strike) strikes[strike] = (strikes[strike] || 0) + (o.day?.open_interest || 0);
  });
  const maxPainEntry = Object.entries(strikes).sort((a, b) => b[1] - a[1])[0];
  const maxPain = maxPainEntry ? parseFloat(maxPainEntry[0]).toFixed(0) : null;

  // Expected move
  const expMove = (spotPrice * (avgIV / 100) * Math.sqrt(30 / 365)).toFixed(2);
  ui.$('eM').textContent = '+-$' + expMove;

  calls.sort((a, b) => b.volume - a.volume);
  puts.sort((a, b) => b.volume - a.volume);

  ui.updateOptions({
    callVol,
    putVol,
    pcRatio,
    avgIV,
    maxPain,
    topCalls: calls.slice(0, 3),
    topPuts: puts.slice(0, 3),
    pcOI: putOI / (callOI || 1)
  });

  // Store for AI
  mktData.callVol = ui.formatNumber(callVol);
  mktData.putVol = ui.formatNumber(putVol);
  mktData.pcRatio = pcRatio;
  mktData.topCalls = calls.slice(0, 3).map(c => '$' + c.strike).join(', ') || 'N/A';
  mktData.topPuts = puts.slice(0, 3).map(p => '$' + p.strike).join(', ') || 'N/A';
  mktData.maxPain = maxPain || 'N/A';

  if (mktData.price) callAI();
}

async function callAI() {
  ui.$('aiSt').textContent = skipCache ? 'refreshing...' : 'thinking...';

  try {
    const [analysis, trades] = await Promise.all([
      fetchClaude(buildAnalysisPrompt(mktData), skipCache),
      fetchClaude(buildTradePrompt(mktData), skipCache)
    ]);

    ui.updateAI(analysis, trades, skipCache ? 'fresh' : 'done');
    skipCache = false; // Reset after use
  } catch (e) {
    ui.$('aiOut').textContent = 'AI Error: ' + e.message;
    ui.$('aiSt').textContent = 'error';
  }
}
