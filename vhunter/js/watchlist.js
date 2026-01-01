// VHunter Watchlist & Hunt Module
import * as db from './db.js';
import * as ui from './ui.js';
import { fetchTickerData, fetchClaude } from './api.js';
import { formatNum, calculateMaxPain, calculateHistoricalVolatility } from './utils.js';
import { switchPage } from './pages.js';
import { calcVRP, classifyVolSetup, crossSectionalRank } from './indicators.js';
import { getFullIVAnalysis } from './iv-history.js';

export let watchlistCache = [];
let huntCache = {};
let runCallback = null;

export function setRunCallback(callback) {
  runCallback = callback;
}

export async function loadWatchlist() {
  try {
    const result = await db.getWatchlist();
    watchlistCache = Array.isArray(result) ? result : (result.data || []);
    renderWatchlist();
  } catch (e) {
    console.error('Failed to load watchlist:', e);
  }
}

export function renderWatchlist() {
  const container = document.getElementById('watchlistItems');

  if (!watchlistCache.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👁</div>
        <div class="empty-text">Your watchlist is empty</div>
        <div class="empty-hint">Add tickers to hunt options</div>
      </div>
    `;
    document.getElementById('huntLegend').style.display = 'none';
    return;
  }

  document.getElementById('huntLegend').style.display = 'block';

  container.innerHTML = `
    <div class="watchlist-table">
      <div class="watchlist-header">
        <span class="col-ticker">Ticker</span>
        <span class="col-price">Price</span>
        <span class="col-metrics">IV-HV</span>
        <span class="col-metrics">P/C</span>
        <span class="col-metrics">MP%</span>
        <span class="col-score">Score</span>
        <span class="col-actions">Actions</span>
      </div>
      ${watchlistCache.map(w => {
        const h = huntCache[w.ticker] || {};
        const hasData = !!h.spotPrice;
        const scoreClass = h.score >= 70 ? 'hot' : h.score >= 50 ? 'warm' : '';
        const ivHvClass = h.ivHvDiff > 10 ? 'high' : h.ivHvDiff < -5 ? 'low' : '';
        const pcClass = h.pcRatio > 1.2 ? 'bearish' : h.pcRatio < 0.8 ? 'bullish' : '';
        const chgClass = h.changePct >= 0 ? 'positive' : 'negative';

        return `
          <div class="watchlist-row ${scoreClass}" data-ticker="${w.ticker}">
            <span class="col-ticker">
              <strong>${w.ticker}</strong>
              ${w.notes ? `<small class="ticker-note" title="${w.notes}">${w.notes.slice(0, 20)}${w.notes.length > 20 ? '...' : ''}</small>` : ''}
            </span>
            <span class="col-price">
              ${hasData ? `
                <span class="price-val">$${h.spotPrice.toFixed(2)}</span>
                <span class="price-chg ${chgClass}">${h.changePct >= 0 ? '+' : ''}${h.changePct.toFixed(1)}%</span>
              ` : '<span class="loading-dot">--</span>'}
            </span>
            <span class="col-metrics ${ivHvClass}">
              ${hasData ? (h.ivHvDiff >= 0 ? '+' : '') + h.ivHvDiff.toFixed(0) + '%' : '--'}
            </span>
            <span class="col-metrics ${pcClass}">
              ${hasData ? h.pcRatio.toFixed(2) : '--'}
            </span>
            <span class="col-metrics">
              ${hasData && h.maxPainDist ? (h.maxPainDist >= 0 ? '+' : '') + h.maxPainDist.toFixed(1) + '%' : '--'}
            </span>
            <span class="col-score">
              ${hasData ? `<span class="score-badge ${scoreClass}">${h.score}</span>` : '--'}
            </span>
            <span class="col-actions">
              <button class="btn-icon" onclick="analyzeWatchlistItem('${w.ticker}')" title="Analyze">📊</button>
              <button class="btn-icon" onclick="openOptionsForTicker('${w.ticker}')" title="Options">📈</button>
              <button class="btn-icon btn-danger" onclick="removeWatchlistItem('${w.id}')" title="Remove">✕</button>
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export async function huntOptions() {
  if (!watchlistCache.length) {
    alert('Add tickers to watchlist first');
    return;
  }

  const btn = document.getElementById('btnHunt');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="hunt-icon">⏳</span> Hunting...';
  btn.disabled = true;

  document.getElementById('huntResultsSection').style.display = 'block';
  document.getElementById('huntQuickStats').style.display = 'flex';
  document.getElementById('huntStatus').textContent = 'scanning...';
  document.getElementById('huntAiSummary').innerHTML = '<div class="hunt-ai-loading">Analyzing options data...</div>';
  document.getElementById('huntGrid').innerHTML = '';

  try {
    const tickers = watchlistCache.map(w => w.ticker);
    const results = await Promise.all(tickers.map(ticker => fetchHuntData(ticker)));

    const huntResults = [];
    results.forEach((data, i) => {
      if (data) {
        huntCache[tickers[i]] = data;
        huntResults.push({ ticker: tickers[i], ...data });
      }
    });

    // Calculate cross-sectional rankings
    if (huntResults.length > 1) {
      const vrpRanks = crossSectionalRank(huntResults, 'vrp');
      const ivRankRanks = crossSectionalRank(huntResults, 'ivRank');
      const pcRatioRanks = crossSectionalRank(huntResults, 'pcRatio');

      huntResults.forEach(r => {
        r.vrpRank = vrpRanks.find(x => x.ticker === r.ticker)?.rank || 50;
        r.ivRankRank = ivRankRanks.find(x => x.ticker === r.ticker)?.rank || 50;
        r.pcRatioRank = pcRatioRanks.find(x => x.ticker === r.ticker)?.rank || 50;

        // Composite VRP score: weight VRP and IV Rank heavily for premium selling
        r.vrpComposite = (r.vrpRank * 0.4 + r.ivRankRank * 0.3 + r.pcRatioRank * 0.3);
      });
    }

    huntResults.sort((a, b) => b.score - a.score);

    updateHuntQuickStats(huntResults);
    renderHuntGrid(huntResults);
    renderWatchlist();

    await runHuntAiAnalysis(huntResults);

    document.getElementById('huntStatus').textContent = 'done';

  } catch (e) {
    console.error('Hunt failed:', e);
    document.getElementById('huntStatus').textContent = 'error';
    document.getElementById('huntAiSummary').innerHTML = `<div class="hunt-ai-error">Hunt failed: ${e.message}</div>`;
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function fetchHuntData(ticker) {
  try {
    const { prev, aggs, options } = await fetchTickerData(ticker);

    if (!prev?.results?.[0] || !options?.all?.length) return null;

    const spot = prev.results[0];
    const spotPrice = spot.c;
    const changePct = ((spot.c - spot.o) / spot.o) * 100;

    let hv30 = 0;
    if (aggs?.results?.length > 0) {
      const prices = aggs.results.map(d => d.c);
      hv30 = calculateHistoricalVolatility(prices, 30);
    }

    let callVol = 0, putVol = 0, callOI = 0, putOI = 0;
    let ivSum = 0, ivCount = 0;
    let callPremium = 0, putPremium = 0;
    const unusualTrades = [];
    const bigPrints = [];

    options.all.forEach(o => {
      const type = o.details?.contract_type;
      const strike = o.details?.strike_price || 0;
      const expiry = o.details?.expiration_date || '';
      const vol = o.day?.volume || 0;
      const oi = o.open_interest || 0;
      const iv = o.implied_volatility || 0;
      const bid = o.last_quote?.bid || 0;
      const ask = o.last_quote?.ask || 0;
      const mid = (bid + ask) / 2;
      const lastPrice = o.day?.close || mid;

      if (type === 'call') {
        callVol += vol;
        callOI += oi;
        callPremium += vol * lastPrice * 100;
      } else {
        putVol += vol;
        putOI += oi;
        putPremium += vol * lastPrice * 100;
      }

      if (iv > 0) { ivSum += iv; ivCount++; }

      const dte = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
      const volOiRatio = oi > 0 ? vol / oi : vol > 100 ? 10 : 0;
      const notional = vol * lastPrice * 100;
      const moneyness = ((strike - spotPrice) / spotPrice) * 100;
      const isNearMoney = Math.abs(moneyness) < 10;

      if (vol > 500 && volOiRatio > 2) {
        unusualTrades.push({
          type,
          strike,
          expiry,
          dte,
          vol,
          oi,
          volOiRatio: volOiRatio.toFixed(1),
          iv: (iv * 100).toFixed(0),
          notional,
          moneyness: moneyness.toFixed(1),
          signal: type === 'put' ? 'BEARISH' : 'BULLISH',
          reason: 'Vol > OI'
        });
      }

      if (notional > 100000 && isNearMoney && dte <= 45) {
        bigPrints.push({
          type,
          strike,
          expiry,
          dte,
          vol,
          notional,
          iv: (iv * 100).toFixed(0),
          moneyness: moneyness.toFixed(1),
          signal: type === 'put' ? 'BEARISH' : 'BULLISH'
        });
      }
    });

    const avgIV = ivCount > 0 ? (ivSum / ivCount) * 100 : 0;
    const pcRatio = putVol / (callVol || 1);
    const pcOiRatio = putOI / (callOI || 1);
    const ivHvDiff = avgIV - hv30;

    // VRP (Volatility Risk Premium) calculations
    const vrp = calcVRP(avgIV, hv30);
    const ivAnalysis = getFullIVAnalysis(ticker, avgIV);
    const ivRank = ivAnalysis.ivRank;
    const ivPercentile = ivAnalysis.ivPercentile;

    // Classify the volatility setup
    const volSetup = classifyVolSetup({
      ivRank: ivRank,
      vrp: vrp,
      iv: avgIV, // Current IV for fallback estimation
      rvRank: null,
      termSteepness: null
    });

    const totalPremium = callPremium + putPremium;
    const putPremiumPct = totalPremium > 0 ? (putPremium / totalPremium) * 100 : 50;
    const premiumBias = putPremiumPct > 55 ? 'PUT HEAVY' : putPremiumPct < 45 ? 'CALL HEAVY' : 'BALANCED';

    unusualTrades.sort((a, b) => b.notional - a.notional);
    bigPrints.sort((a, b) => b.notional - a.notional);

    const unusualPuts = unusualTrades.filter(t => t.type === 'put');
    const unusualCalls = unusualTrades.filter(t => t.type === 'call');
    const bearishPrints = bigPrints.filter(t => t.type === 'put').length;
    const bullishPrints = bigPrints.filter(t => t.type === 'call').length;

    const monthlyMaxPain = calculateMaxPain(options.monthly);
    const maxPainDist = monthlyMaxPain ? ((monthlyMaxPain - spotPrice) / spotPrice) * 100 : null;

    const expMove = spotPrice * (avgIV / 100) * Math.sqrt(5 / 365);
    const expMovePct = (expMove / spotPrice) * 100;

    let score = 50;

    // VRP scoring
    if (vrp > 15) score += 18; // Very high premium - strong sell signal
    else if (vrp > 10) score += 12;
    else if (vrp > 5) score += 6;
    else if (vrp < -5) score -= 8; // Options cheap, don't sell
    else if (vrp < 0) score -= 4;

    // IV Rank scoring
    if (ivRank != null) {
      if (ivRank > 80) score += 12; // Very high IV - good for selling
      else if (ivRank > 60) score += 8;
      else if (ivRank < 20) score -= 10; // Low IV - options cheap
      else if (ivRank < 40) score -= 5;
    }

    if (pcRatio > 1.5) score += 15;
    else if (pcRatio > 1.2) score += 10;
    else if (pcRatio < 0.7) score -= 10;

    if (pcOiRatio > 1.3) score += 8;
    else if (pcOiRatio < 0.7) score -= 5;

    if (maxPainDist !== null) {
      if (maxPainDist < -5) score += 12;
      else if (maxPainDist > 5) score -= 5;
    }

    // Vol setup bonus
    if (volSetup.setup === 'SELL_VEGA' || volSetup.setup === 'HIGH_VRP') score += 10;
    else if (volSetup.setup === 'BUY_GAMMA' || volSetup.setup === 'NEGATIVE_VRP') score -= 10;

    if (changePct < -3) score += 8;
    else if (changePct < -1) score += 4;
    else if (changePct > 3) score -= 8;

    if (unusualPuts.length > unusualCalls.length) score += 10;
    else if (unusualCalls.length > unusualPuts.length) score -= 8;

    if (bearishPrints > bullishPrints) score += 8;
    else if (bullishPrints > bearishPrints) score -= 6;

    if (putPremiumPct > 60) score += 8;
    else if (putPremiumPct < 40) score -= 6;

    score = Math.max(0, Math.min(100, score));

    return {
      spotPrice,
      changePct,
      avgIV,
      hv30,
      ivHvDiff,
      // VRP metrics
      vrp,
      ivRank,
      ivPercentile,
      volSetup,
      // Flow metrics
      pcRatio,
      pcOiRatio,
      callVol,
      putVol,
      callOI,
      putOI,
      callPremium,
      putPremium,
      totalPremium,
      putPremiumPct,
      premiumBias,
      maxPainDist,
      monthlyMaxPain,
      expMove,
      expMovePct,
      score,
      sentiment: pcRatio > 1.2 ? 'Bearish' : pcRatio < 0.8 ? 'Bullish' : 'Neutral',
      unusualTrades: unusualTrades.slice(0, 5),
      bigPrints: bigPrints.slice(0, 5),
      unusualPutCount: unusualPuts.length,
      unusualCallCount: unusualCalls.length,
      hasUnusualActivity: unusualTrades.length > 0 || bigPrints.length > 0
    };
  } catch (e) {
    console.error(`Hunt error for ${ticker}:`, e);
    return null;
  }
}

function updateHuntQuickStats(results) {
  if (!results.length) return;

  const best = results[0];
  document.getElementById('bestSetup').textContent = best.ticker;
  document.getElementById('bestSetup').className = 'hunt-stat-value hot';

  const unusual = results.filter(r => r.hasUnusualActivity).length;
  document.getElementById('highIvCount').textContent = unusual + '/' + results.length;
  document.getElementById('highIvCount').className = 'hunt-stat-value' + (unusual > 0 ? ' high' : '');
  const highIvLabel = document.querySelector('#huntQuickStats .hunt-stat:nth-child(2) .hunt-stat-label');
  if (highIvLabel) highIvLabel.textContent = 'Unusual';

  const bearish = results.filter(r => r.pcRatio > 1.2).length;
  document.getElementById('bearishFlowCount').textContent = bearish + '/' + results.length;
  document.getElementById('bearishFlowCount').className = 'hunt-stat-value' + (bearish > 0 ? ' bearish' : '');

  const putHeavy = results.filter(r => r.putPremiumPct > 55).length;
  document.getElementById('nearMaxPainCount').textContent = putHeavy + '/' + results.length;
  document.getElementById('nearMaxPainCount').className = 'hunt-stat-value' + (putHeavy > 0 ? ' bearish' : '');
  const mpLabel = document.querySelector('#huntQuickStats .hunt-stat:nth-child(4) .hunt-stat-label');
  if (mpLabel) mpLabel.textContent = 'Put Heavy';
}

function renderHuntGrid(results) {
  const container = document.getElementById('huntGrid');

  if (!results.length) {
    container.innerHTML = '<div class="hunt-empty">No data available</div>';
    return;
  }

  container.innerHTML = results.map(r => {
    const scoreClass = r.score >= 70 ? 'hot' : r.score >= 50 ? 'warm' : 'cold';
    const sentimentClass = r.sentiment === 'Bearish' ? 'bearish' : r.sentiment === 'Bullish' ? 'bullish' : '';
    const premiumClass = r.putPremiumPct > 55 ? 'bearish' : r.putPremiumPct < 45 ? 'bullish' : '';

    let unusualHtml = '';
    if (r.hasUnusualActivity) {
      const topTrade = r.unusualTrades[0] || r.bigPrints[0];
      if (topTrade) {
        unusualHtml = `
          <div class="hunt-unusual">
            <div class="unusual-badge ${topTrade.signal === 'BEARISH' ? 'bearish' : 'bullish'}">
              ⚡ ${topTrade.signal}
            </div>
            <div class="unusual-detail">
              $${topTrade.strike} ${topTrade.type.toUpperCase()} ${topTrade.dte}d
              <span class="unusual-vol">${formatNum(topTrade.vol)} vol</span>
            </div>
            ${topTrade.volOiRatio ? `<div class="unusual-reason">Vol/OI: ${topTrade.volOiRatio}x</div>` : ''}
          </div>
        `;
      }
    }

    let moreUnusualHtml = '';
    if (r.unusualTrades.length > 1 || r.bigPrints.length > 0) {
      const allUnusual = [...r.unusualTrades.slice(1, 3), ...r.bigPrints.slice(0, 2)].slice(0, 2);
      if (allUnusual.length > 0) {
        moreUnusualHtml = `
          <div class="hunt-more-unusual">
            ${allUnusual.map(t => `
              <span class="mini-trade ${t.signal === 'BEARISH' ? 'bearish' : 'bullish'}">
                $${t.strike}${t.type === 'put' ? 'P' : 'C'} ${t.dte}d
              </span>
            `).join('')}
          </div>
        `;
      }
    }

    return `
      <div class="hunt-card ${scoreClass}">
        <div class="hunt-card-header">
          <span class="hunt-card-ticker">${r.ticker}</span>
          <span class="hunt-card-score">${r.score}</span>
        </div>
        <div class="hunt-card-price">
          $${r.spotPrice.toFixed(2)}
          <span class="${r.changePct >= 0 ? 'positive' : 'negative'}">${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(1)}%</span>
        </div>
        ${unusualHtml}
        <div class="hunt-card-metrics">
          <div class="hunt-metric">
            <span class="hunt-metric-label">VRP</span>
            <span class="hunt-metric-value ${r.vrp > 10 ? 'high' : r.vrp < 0 ? 'low' : ''}" title="IV - RV: Options ${r.vrp > 5 ? 'expensive' : r.vrp < -5 ? 'cheap' : 'fair'}">
              ${r.vrp != null ? (r.vrp >= 0 ? '+' : '') + r.vrp.toFixed(0) + '%' : '--'}
            </span>
          </div>
          <div class="hunt-metric">
            <span class="hunt-metric-label">IV Rank</span>
            <span class="hunt-metric-value ${r.ivRank > 60 ? 'high' : r.ivRank < 30 ? 'low' : ''}" title="Percentile vs 52-week range">
              ${r.ivRank != null ? r.ivRank.toFixed(0) + '%' : '--'}
            </span>
          </div>
          <div class="hunt-metric">
            <span class="hunt-metric-label">P/C Vol</span>
            <span class="hunt-metric-value ${sentimentClass}">${r.pcRatio.toFixed(2)}</span>
          </div>
          <div class="hunt-metric">
            <span class="hunt-metric-label">Put $</span>
            <span class="hunt-metric-value ${premiumClass}">${r.putPremiumPct.toFixed(0)}%</span>
          </div>
        </div>
        ${r.volSetup ? `
        <div class="hunt-card-setup">
          <span class="setup-badge ${r.volSetup.setup.includes('SELL') || r.volSetup.setup === 'HIGH_VRP' ? 'bearish' : r.volSetup.setup.includes('BUY') ? 'bullish' : ''}"
                title="${r.volSetup.description}">
            ${r.volSetup.setup.replace('_', ' ')}
          </span>
        </div>
        ` : ''}
        <div class="hunt-card-flow">
          <span class="flow-label ${premiumClass}">${r.premiumBias}</span>
          <span class="flow-detail">$${formatNum(r.totalPremium / 1000000)}M prem</span>
        </div>
        ${moreUnusualHtml}
        ${r.maxPainDist !== null ? `
          <div class="hunt-card-mp">
            MP: $${r.monthlyMaxPain.toFixed(0)} (${r.maxPainDist >= 0 ? '↑' : '↓'}${Math.abs(r.maxPainDist).toFixed(1)}%) | ±${r.expMovePct.toFixed(1)}% exp
          </div>
        ` : ''}
        <div class="hunt-card-actions">
          <button class="btn-sm" onclick="analyzeWatchlistItem('${r.ticker}')">Analyze</button>
          <button class="btn-sm" onclick="openOptionsForTicker('${r.ticker}')">Options</button>
        </div>
      </div>
    `;
  }).join('');
}

async function runHuntAiAnalysis(results) {
  if (!results.length) return;

  const summaryEl = document.getElementById('huntAiSummary');
  summaryEl.innerHTML = '<div class="hunt-ai-loading">AI analyzing unusual activity...</div>';

  const dataStr = results.slice(0, 5).map(r => {
    let line = `${r.ticker}: $${r.spotPrice.toFixed(2)} (${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(1)}%)`;
    // VRP metrics
    line += ` | VRP:${r.vrp != null ? (r.vrp >= 0 ? '+' : '') + r.vrp.toFixed(0) + '%' : '--'}`;
    line += ` IVRank:${r.ivRank != null ? r.ivRank.toFixed(0) + '%' : '--'}`;
    line += ` | P/C:${r.pcRatio.toFixed(2)} | Put$:${r.putPremiumPct.toFixed(0)}%`;
    line += ` | Setup:${r.volSetup?.setup || 'N/A'}`;
    line += ` | Score:${r.score}`;

    if (r.hasUnusualActivity) {
      const top = r.unusualTrades[0] || r.bigPrints[0];
      if (top) {
        line += ` | ⚡UNUSUAL: $${top.strike}${top.type === 'put' ? 'P' : 'C'} ${top.dte}d (${formatNum(top.vol)} vol, Vol/OI:${top.volOiRatio || 'N/A'}x)`;
      }
    }
    return line;
  }).join('\n');

  const withUnusual = results.filter(r => r.hasUnusualActivity);
  const unusualPutBias = results.filter(r => r.unusualPutCount > r.unusualCallCount).length;
  const highVrp = results.filter(r => r.vrp > 10).length;
  const sellVega = results.filter(r => r.volSetup?.setup === 'SELL_VEGA' || r.volSetup?.setup === 'HIGH_VRP').length;

  const prompt = `You are a professional volatility trader using VRP analysis.

WATCHLIST SCAN (sorted by opportunity score):
${dataStr}

VOLATILITY ANALYSIS:
- ${highVrp}/${results.length} tickers have HIGH VRP (IV >> RV) - options expensive, good for selling
- ${sellVega}/${results.length} tickers classified as SELL_VEGA or HIGH_VRP setup
- VRP (Volatility Risk Premium) = IV - RV. Positive = options trading at premium to realized movement

UNUSUAL ACTIVITY SUMMARY:
- ${withUnusual.length}/${results.length} tickers have unusual options activity
- ${unusualPutBias} tickers show unusual PUT activity (bearish)
- Unusual = Volume > 2x Open Interest (new aggressive positioning)

SCORING: VRP + IV Rank + bearish flow + unusual puts + max pain positioning

Analyze and provide (be BRIEF, 4-5 sentences):
1. BEST VRP SETUP: Which ticker has the best volatility setup? (High VRP = sell premium, Low VRP = buy premium)
2. FLOW ANALYSIS: What does the unusual flow + VRP combination suggest?
3. TRADE IDEA: One specific recommendation considering both direction AND volatility (ticker, strategy, why)
4. VRP WARNING: Any tickers where VRP is too low to sell premium?

Focus on volatility edge, not just direction. Be direct.`;

  try {
    const analysis = await fetchClaude(prompt, true);
    summaryEl.innerHTML = `<div class="hunt-ai-content">${analysis}</div>`;
  } catch (e) {
    summaryEl.innerHTML = `<div class="hunt-ai-error">AI analysis failed: ${e.message}</div>`;
  }
}

export function hideHuntResults() {
  document.getElementById('huntResultsSection').style.display = 'none';
}

export function openOptionsForTicker(ticker) {
  document.getElementById('optTicker').value = ticker;
  switchPage('options');
  // Options page will handle loading
}

export function openWatchlistModal() {
  document.getElementById('watchTicker').value = ui.$('tk').value || '';
  document.getElementById('watchAbove').value = '';
  document.getElementById('watchBelow').value = '';
  document.getElementById('watchNotes').value = '';
  document.getElementById('watchlistModal').classList.add('active');
}

export function closeWatchlistModal() {
  document.getElementById('watchlistModal').classList.remove('active');
}

export async function saveWatchlistItem(e) {
  e.preventDefault();

  const item = {
    ticker: document.getElementById('watchTicker').value.toUpperCase(),
    alert_above: parseFloat(document.getElementById('watchAbove').value) || null,
    alert_below: parseFloat(document.getElementById('watchBelow').value) || null,
    notes: document.getElementById('watchNotes').value || null
  };

  try {
    await db.addToWatchlist(item);
    closeWatchlistModal();
    loadWatchlist();
  } catch (e) {
    alert('Failed to add to watchlist: ' + e.message);
  }
}

export async function removeWatchlistItem(id) {
  try {
    await db.removeFromWatchlist(id);
    loadWatchlist();
  } catch (e) {
    alert('Failed to remove from watchlist: ' + e.message);
  }
}

export function analyzeWatchlistItem(ticker) {
  ui.$('tk').value = ticker;
  switchPage('analyze');
  if (runCallback) runCallback();
}

// Expose to window for onclick handlers
window.huntOptions = huntOptions;
window.hideHuntResults = hideHuntResults;
window.openOptionsForTicker = openOptionsForTicker;
window.openWatchlistModal = openWatchlistModal;
window.closeWatchlistModal = closeWatchlistModal;
window.saveWatchlistItem = saveWatchlistItem;
window.removeWatchlistItem = removeWatchlistItem;
window.analyzeWatchlistItem = analyzeWatchlistItem;
