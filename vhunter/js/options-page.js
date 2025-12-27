// VHunter Options Page Module
import { fetchTickerData, fetchClaude } from './api.js';
import { formatNum, avg, erf, calculateMaxPain, calculateHistoricalVolatility } from './utils.js';

let optionsData = {
  ticker: null,
  spotPrice: 0,
  change: 0,
  changePct: 0,
  options: null,
  historicalIV: [],
  hv30: 0
};

export async function loadOptionsData() {
  const ticker = document.getElementById('optTicker').value.toUpperCase().trim();
  if (!ticker) return;

  document.querySelector('.spot-price').textContent = 'Loading...';
  document.querySelector('.spot-change').textContent = '';
  document.getElementById('optChainBody').innerHTML = '<div class="chain-loading">Loading options data...</div>';

  try {
    const { prev, aggs, options } = await fetchTickerData(ticker);

    if (!prev?.results?.[0]) {
      alert('Ticker not found');
      return;
    }

    const spot = prev.results[0];
    optionsData.ticker = ticker;
    optionsData.spotPrice = spot.c;
    optionsData.change = spot.c - spot.o;
    optionsData.changePct = ((spot.c - spot.o) / spot.o) * 100;
    optionsData.options = options;

    if (aggs?.results?.length > 0) {
      const prices = aggs.results.map(d => d.c);
      optionsData.hv30 = calculateHistoricalVolatility(prices, 30);
    }

    updateSpotDisplay();
    processOptionsPageData(options, optionsData.spotPrice);
    populateExpiryDropdown(options);
    runOptionsAiAnalysis(ticker);

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

  updateQuickStats(avgIV, optionsData.hv30, spotPrice, pcRatioVol);
  updateVolatilitySection(expiryIV, avgIV, spotPrice, strikeData);
  updateFlowSection(callVol, putVol, callOI, putOI, pcRatioVol, pcRatioOI);
  updateStrikesSection(options, spotPrice, strikeData);
}

function updateQuickStats(avgIV, hv30, spotPrice, pcRatio) {
  const ivRank = Math.min(100, Math.max(0, avgIV));
  const ivRankClass = ivRank > 50 ? 'high' : ivRank < 30 ? 'low' : 'neutral';
  document.getElementById('optIvRank').textContent = ivRank.toFixed(0) + '%';
  document.getElementById('optIvRank').className = 'opt-stat-value ' + ivRankClass;

  document.getElementById('optIvPct').textContent = ivRank.toFixed(0) + '%';
  document.getElementById('optIvPct').className = 'opt-stat-value ' + ivRankClass;

  document.getElementById('optHv30').textContent = hv30.toFixed(0) + '%';

  const ivHvDiff = avgIV - hv30;
  const diffClass = ivHvDiff > 10 ? 'high' : ivHvDiff < -5 ? 'low' : 'neutral';
  document.getElementById('optIvHvDiff').textContent = (ivHvDiff >= 0 ? '+' : '') + ivHvDiff.toFixed(0) + '%';
  document.getElementById('optIvHvDiff').className = 'opt-stat-value ' + diffClass;

  const expMove = spotPrice * (avgIV / 100) * Math.sqrt(5 / 365);
  document.getElementById('optExpMove').textContent = '±$' + expMove.toFixed(2);

  const pcClass = pcRatio > 1.2 ? 'high' : pcRatio < 0.8 ? 'low' : 'neutral';
  document.getElementById('optPcRatio').textContent = pcRatio.toFixed(2);
  document.getElementById('optPcRatio').className = 'opt-stat-value ' + pcClass;
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

  const strikes = Object.keys(strikeData).map(Number).sort((a, b) => a - b);
  const atmStrike = strikes.reduce((prev, curr) => Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev, strikes[0]);
  const otmPutStrike = strikes.filter(s => s < atmStrike * 0.92)[0] || atmStrike;
  const otmCallStrike = strikes.filter(s => s > atmStrike * 1.08).pop() || atmStrike;

  const atmIV = strikeData[atmStrike] ? avg([...strikeData[atmStrike].callIV, ...strikeData[atmStrike].putIV]) * 100 : avgIV;
  const putIV = strikeData[otmPutStrike]?.putIV.length > 0 ? avg(strikeData[otmPutStrike].putIV) * 100 : atmIV;
  const callIV = strikeData[otmCallStrike]?.callIV.length > 0 ? avg(strikeData[otmCallStrike].callIV) * 100 : atmIV;

  const skewItems = document.querySelectorAll('#optSkewDisplay .skew-item');
  if (skewItems[0]) skewItems[0].querySelector('.skew-value').textContent = putIV.toFixed(0) + '%';
  if (skewItems[1]) skewItems[1].querySelector('.skew-value').textContent = atmIV.toFixed(0) + '%';
  if (skewItems[2]) skewItems[2].querySelector('.skew-value').textContent = callIV.toFixed(0) + '%';
  document.getElementById('optPcSkew').textContent = (putIV - callIV >= 0 ? '+' : '') + (putIV - callIV).toFixed(1) + '%';

  const daily = spotPrice * (avgIV / 100) * Math.sqrt(1 / 365);
  const weekly = spotPrice * (avgIV / 100) * Math.sqrt(5 / 365);
  const monthly = spotPrice * (avgIV / 100) * Math.sqrt(21 / 365);
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
  const quarterlyMaxPain = calculateMaxPain(options.sixMonth);

  updateMaxPainDisplay('optMpWeekly', 'optMpWeeklyDist', weeklyMaxPain, spotPrice);
  updateMaxPainDisplay('optMpMonthly', 'optMpMonthlyDist', monthlyMaxPain, spotPrice);
  updateMaxPainDisplay('optMpQuarterly', 'optMpQuarterlyDist', quarterlyMaxPain, spotPrice);

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

  const maxCallOI = topCallWalls[0]?.strike || spotPrice;
  const maxPutOI = topPutWalls[0]?.strike || spotPrice;
  const gexFlip = (maxCallOI + maxPutOI) / 2;

  document.getElementById('optGexFlip').textContent = '$' + gexFlip.toFixed(0);
  document.getElementById('optGexCallWall').textContent = '$' + maxCallOI.toFixed(0);
  document.getElementById('optGexPutWall').textContent = '$' + maxPutOI.toFixed(0);
  document.getElementById('optNetGex').textContent = spotPrice > gexFlip ? '+GEX (Dampened)' : '-GEX (Amplified)';
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
  if (!o) return { bid: '--', ask: '--', last: '--', vol: '--', oi: '--', iv: '--', delta: '--' };
  const q = o.last_quote || {};
  const d = o.day || {};

  const strike = o.details.strike_price;
  const iv = o.implied_volatility || 0;
  const dte = Math.max(1, Math.ceil((new Date(o.details.expiration_date) - new Date()) / (1000 * 60 * 60 * 24)));
  const t = dte / 365;
  const moneyness = Math.log(spotPrice / strike) / (iv * Math.sqrt(t) + 0.001);
  let delta = 0.5 * (1 + erf(moneyness / Math.sqrt(2)));
  if (type === 'put') delta = delta - 1;

  return {
    bid: q.bid?.toFixed(2) || '--',
    ask: q.ask?.toFixed(2) || '--',
    last: d.close?.toFixed(2) || '--',
    vol: formatNum(d.volume || 0),
    oi: formatNum(o.open_interest || 0),
    iv: iv ? (iv * 100).toFixed(0) + '%' : '--',
    delta: delta ? delta.toFixed(2) : '--'
  };
}

export function toggleChainView(view) {
  document.querySelectorAll('.chain-toggle').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.show === view);
  });

  const rows = document.querySelectorAll('.chain-row');
  rows.forEach(row => {
    if (view === 'all') row.style.display = '';
    else if (view === 'itm') row.style.display = (row.classList.contains('itm-call') || row.classList.contains('itm-put')) ? '' : 'none';
    else if (view === 'otm') row.style.display = (!row.classList.contains('itm-call') && !row.classList.contains('itm-put') && !row.classList.contains('atm')) ? '' : 'none';
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
  const prompt = `You are a professional options quant analyst. Analyze the options positioning for ${ticker}:

MARKET DATA:
- Spot Price: $${data.spotPrice.toFixed(2)}
- 30-Day HV: ${data.hv30.toFixed(0)}%
- P/C Volume Ratio: ${(data.options.all.filter(o => o.details?.contract_type === 'put').reduce((s, o) => s + (o.day?.volume || 0), 0) /
    Math.max(1, data.options.all.filter(o => o.details?.contract_type === 'call').reduce((s, o) => s + (o.day?.volume || 0), 0))).toFixed(2)}

THESIS CONTEXT: Bearish tilt - looking for vulnerable overvalued growth stocks, US equity rotation from growth to value.

Provide a BRIEF analysis (3-4 bullet points each section):

**MARKET MAKER POSITIONING:**
- Where are dealers likely positioned?
- Is the stock likely pinned to any strikes?
- What does flow suggest about near-term direction?

**OPTIONS-BASED TRADE IDEAS:**
- For bearish thesis: specific put spreads or naked puts to consider
- Entry, strike, expiration recommendations
- Risk/reward assessment`;

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

// Expose to window for onclick handlers
window.loadOptionsData = loadOptionsData;
window.loadChainForExpiry = loadChainForExpiry;
window.toggleChainView = toggleChainView;
window.runOptionsScanner = runOptionsScanner;
window.refreshOptionsAi = refreshOptionsAi;
