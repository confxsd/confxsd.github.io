// UI Module - DOM manipulation and updates
import { createTooltip, TEACHING_TIPS } from './teaching-tips.js';

export const $ = (id) => document.getElementById(id);

// Re-export for use in other modules
export { createTooltip, TEACHING_TIPS };

export function formatNumber(n) {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function setSignal(id, type, text) {
  const el = $(id);
  el.textContent = text;
  el.className = 'sg ' + type;
}

export function setPerformance(id, current, previous) {
  const pct = ((current - previous) / previous) * 100;
  const el = $(id);
  el.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  el.className = 'v ' + (pct >= 0 ? 'g' : 'r');
}

export function formatAI(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#1e293b">$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/•/g, '<span style="color:#818cf8">•</span>');
}

export function updateCurrentPrice(data) {
  // Use real-time change data if available from snapshot, otherwise calculate
  let change, pct;
  if (data.todaysChange != null && data.todaysChangePerc != null) {
    change = data.todaysChange;
    pct = data.todaysChangePerc;
  } else {
    const basePrice = data.prevClose || data.o;
    change = data.c - basePrice;
    pct = (change / basePrice) * 100;
  }

  $('pr').textContent = '$' + data.c.toFixed(2);
  $('pr').className = 'v ' + (change >= 0 ? 'g' : 'r');
  $('ch2').innerHTML = `<span class="${change >= 0 ? 'g' : 'r'}">${change >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>`;
  $('vv').textContent = formatNumber(data.v);
  $('dr2').textContent = '$' + data.l.toFixed(0) + '-' + data.h.toFixed(0);
}

export function updateStatusBar(trend, momentum, volume, volatility) {
  // Trend
  $('tr').textContent = trend.label;
  $('tr').className = 'val ' + trend.color;
  $('trD').textContent = trend.detail;

  // Momentum
  $('mo').textContent = momentum.label;
  $('mo').className = 'val ' + momentum.color;
  $('moD').textContent = momentum.detail;

  // Volume
  $('vl').textContent = volume.label;
  $('vl').className = 'val ' + volume.color;
  $('vlD').textContent = volume.detail;

  // Volatility
  $('vo').textContent = volatility.label;
  $('vo').className = 'val ' + volatility.color;
  $('voD').textContent = volatility.detail;
}

export function updateScore(score) {
  const scEl = $('sc');
  const sgEl = $('sg');
  const biEl = $('bi');

  if (scEl) {
    scEl.textContent = score;
    scEl.className = 'score ' + (score >= 55 ? 'b' : score <= 45 ? 's' : 'n');
  }

  let signal;
  if (score >= 70) signal = 'STRONG BUY';
  else if (score >= 55) signal = 'BUY';
  else if (score <= 30) signal = 'STRONG SELL';
  else if (score <= 45) signal = 'SELL';
  else signal = 'NEUTRAL';

  if (sgEl) {
    sgEl.textContent = signal;
    sgEl.className = 'sig ' + (score >= 55 ? 'b' : score <= 45 ? 's' : 'n');
  }
  if (biEl) {
    biEl.textContent = Math.abs(score - 50) + 'pts ' + (score > 50 ? 'bull' : score < 50 ? 'bear' : 'ntrl');
  }
}

export function updateIndicators(data) {
  const { rsi, macdH, smaSignal, bbPct, vwapDiff, volTrend } = data;

  // SMA Cross
  $('sX').textContent = smaSignal;
  setSignal('sXS', smaSignal === 'Bull' ? 'b' : smaSignal === 'Bear' ? 's' : 'h',
    smaSignal === 'Bull' ? 'BUY' : smaSignal === 'Bear' ? 'SELL' : 'HOLD');

  // MACD
  $('mc').textContent = macdH.toFixed(2);
  setSignal('mcS', macdH > 0 ? 'b' : 's', macdH > 0 ? 'BUY' : 'SELL');

  // RSI
  $('rT').textContent = rsi.toFixed(0);
  setSignal('rTS', rsi < 30 ? 'b' : rsi > 70 ? 's' : 'h', rsi < 30 ? 'BUY' : rsi > 70 ? 'SELL' : 'HOLD');

  // BB %B
  $('bb').textContent = bbPct + '%';
  setSignal('bbS', bbPct < 20 ? 'b' : bbPct > 80 ? 's' : 'h', bbPct < 20 ? 'BUY' : bbPct > 80 ? 'SELL' : 'HOLD');

  // VWAP
  $('vw').textContent = (vwapDiff > 0 ? '+' : '') + vwapDiff + '%';
  setSignal('vwS', vwapDiff > 0 ? 'b' : 's', vwapDiff > 0 ? 'BUY' : 'SELL');

  // Volume Trend
  $('vT').textContent = (volTrend > 0 ? '+' : '') + volTrend + '%';
  setSignal('vTS', volTrend > 20 ? 'b' : volTrend < -20 ? 's' : 'h', volTrend > 20 ? 'HIGH' : volTrend < -20 ? 'LOW' : 'N');
}

export function updateKeyStats(data) {
  const { rsi, mfi, atr, adx, rvol, sma20, sma50, pivots, range52w, stop, target, riskPct } = data;

  $('rs').textContent = rsi.toFixed(0);
  $('rs').className = 'v ' + (rsi > 70 ? 'r' : rsi < 30 ? 'g' : 'y');
  $('rsS').textContent = rsi > 70 ? 'OB' : rsi < 30 ? 'OS' : 'N';

  $('mf').textContent = mfi.toFixed(0);
  $('mf').className = 'v ' + (mfi > 80 ? 'r' : mfi < 20 ? 'g' : 'p');

  $('at').textContent = '$' + atr.toFixed(2);
  $('ax').textContent = adx.toFixed(0);
  $('axS').textContent = adx > 25 ? 'Str' : 'Wk';

  $('rv').textContent = rvol.toFixed(1) + 'x';

  $('s20').textContent = '$' + sma20.toFixed(2);
  $('s50').textContent = '$' + sma50.toFixed(2);

  $('pv').textContent = '$' + pivots.pivot.toFixed(2);
  $('r1').textContent = '$' + pivots.r1.toFixed(2);
  $('r2').textContent = '$' + pivots.r2.toFixed(2);
  $('s1').textContent = '$' + pivots.s1.toFixed(2);
  $('s2').textContent = '$' + pivots.s2.toFixed(2);

  $('hl').textContent = range52w;
  $('sp').textContent = '$' + stop.toFixed(2);
  $('tg').textContent = '$' + target.toFixed(2);
  $('rk').textContent = riskPct.toFixed(1) + '%';
}

export function updateMoneyFlow(data) {
  const { buyPct, netFlow, adlChange } = data;

  $('bB').style.width = buyPct + '%';
  $('sB').style.width = (100 - buyPct) + '%';
  $('bP').textContent = buyPct + '%';
  $('sP').textContent = (100 - buyPct) + '%';

  $('nF').textContent = (netFlow >= 0 ? '+' : '') + formatNumber(netFlow);
  $('nF').className = 'v ' + (netFlow >= 0 ? 'g' : 'r');

  $('ad').textContent = (adlChange >= 0 ? '+' : '') + adlChange.toFixed(1) + '%';
  $('ad').className = 'v ' + (adlChange >= 0 ? 'g' : 'r');
  $('adS').textContent = adlChange >= 0 ? 'Accum' : 'Distr';
}

export function updateOptions(data) {
  if (!data) {
    $('pc').textContent = 'N/A';
    $('mPw').textContent = '--';
    $('mPm').textContent = '--';
    $('mP6').textContent = '--';
    return;
  }

  const { callVol, putVol, pcRatio, avgIV, maxPain, topCalls, topPuts, pcOI, spotPrice } = data;
  const totalVol = callVol + putVol;
  const callPct = totalVol > 0 ? (callVol / totalVol * 100).toFixed(0) : 50;

  $('pc').textContent = pcRatio.toFixed(2);
  $('pc').className = 'v ' + (pcRatio > 1 ? 'r' : pcRatio < 0.7 ? 'g' : 'y');
  $('pcS').textContent = pcRatio > 1 ? 'Bear' : pcRatio < 0.7 ? 'Bull' : 'Ntrl';

  $('iV').textContent = avgIV.toFixed(1) + '%';
  $('pO').textContent = pcOI.toFixed(2);

  // Max Pain levels with distance from spot
  updateMaxPain('mPw', maxPain?.weekly, spotPrice);
  updateMaxPain('mPm', maxPain?.monthly, spotPrice);
  updateMaxPain('mP6', maxPain?.sixMonth, spotPrice);

  $('cP').textContent = callPct + '%';
  $('pP').textContent = (100 - callPct) + '%';
  $('cB').style.width = callPct + '%';
  $('pB').style.width = (100 - callPct) + '%';
  $('cV').textContent = formatNumber(callVol);
  $('pV').textContent = formatNumber(putVol);

  const netFlow = callVol - putVol;
  $('oN').textContent = (netFlow >= 0 ? '+' : '') + formatNumber(netFlow);
  $('oN').className = 'v ' + (netFlow >= 0 ? 'g' : 'r');

  $('tC').innerHTML = topCalls.map(c =>
    `<div class="opt-r"><span class="k">$${c.strike}</span><span class="g">${formatNumber(c.volume)}</span></div>`
  ).join('') || '--';

  $('tP').innerHTML = topPuts.map(p =>
    `<div class="opt-r"><span class="k">$${p.strike}</span><span class="r">${formatNumber(p.volume)}</span></div>`
  ).join('') || '--';
}

function updateMaxPain(id, maxPain, spotPrice) {
  const el = $(id);
  const detailEl = $(id + 'D');

  if (!maxPain || !spotPrice) {
    el.textContent = '--';
    if (detailEl) detailEl.textContent = '';
    return;
  }

  el.textContent = '$' + maxPain.toFixed(0);

  // Calculate % distance from current price
  const pctDiff = ((maxPain - spotPrice) / spotPrice * 100);
  const direction = pctDiff > 0 ? '↑' : pctDiff < 0 ? '↓' : '→';
  const color = pctDiff > 0 ? 'g' : pctDiff < 0 ? 'r' : '';

  if (detailEl) {
    detailEl.textContent = ` ${direction}${Math.abs(pctDiff).toFixed(1)}%`;
    detailEl.className = 'sub ' + color;
  }
}

export function updateAI(analysis, trades, status) {
  $('aiOut').innerHTML = formatAI(analysis);
  $('tradeOut').innerHTML = formatAI(trades);
  $('aiSt').textContent = status;
}

export function showError(message) {
  $('al').textContent = 'Error: ' + message;
  $('al').style.display = 'block';
}

export function hideError() {
  $('al').style.display = 'none';
}

export function setStatus(text) {
  $('st').textContent = text;
}

// VRP (Volatility Risk Premium) Display
export function updateVRPDisplay(vrpMetrics, ivAnalysis, volSetup) {
  // IV Rank display
  const ivRankEl = $('iv');
  if (ivRankEl && ivAnalysis) {
    const rank = ivAnalysis.ivRank;
    if (rank != null) {
      ivRankEl.textContent = rank.toFixed(0) + '%';
      ivRankEl.className = 'v ' + (rank > 70 ? 'r' : rank < 30 ? 'g' : 'y');
    } else {
      ivRankEl.textContent = '--';
    }
  }

  // VRP Section (if elements exist)
  const vrpEl = $('vrp');
  const rvEl = $('rv30');
  const setupEl = $('volSetup');

  if (vrpMetrics) {
    if (vrpEl) {
      const vrp = vrpMetrics.vrp;
      if (vrp != null) {
        vrpEl.textContent = (vrp >= 0 ? '+' : '') + vrp.toFixed(1) + '%';
        vrpEl.className = 'v ' + (vrp > 10 ? 'r' : vrp < -5 ? 'g' : 'y');
      } else {
        vrpEl.textContent = '--';
      }
    }

    if (rvEl) {
      const rv = vrpMetrics.rv30;
      if (rv != null) {
        rvEl.textContent = rv.toFixed(1) + '%';
      } else {
        rvEl.textContent = '--';
      }
    }
  }

  // Volatility Setup Classification
  if (setupEl && volSetup) {
    const setupColors = {
      LONG_CALENDAR: 'g',
      SELL_VEGA: 'r',
      BUY_GAMMA: 'g',
      SHORT_CALENDAR: 'r',
      HIGH_VRP: 'r',
      NEGATIVE_VRP: 'g',
      NEUTRAL: 'y',
      UNKNOWN: ''
    };

    setupEl.textContent = volSetup.setup.replace('_', ' ');
    setupEl.className = 'vrp-setup ' + (setupColors[volSetup.setup] || '');
    setupEl.title = volSetup.description;
  }

  // Update VRP gauge if it exists
  const vrpGauge = $('vrpGauge');
  if (vrpGauge && vrpMetrics?.vrp != null) {
    // Map VRP from -20 to +30 range to 0-100%
    const normalized = Math.min(100, Math.max(0, (vrpMetrics.vrp + 20) / 50 * 100));
    vrpGauge.style.width = normalized + '%';
    vrpGauge.className = 'vrp-gauge-fill ' + (vrpMetrics.vrp > 10 ? 'premium' : vrpMetrics.vrp < -5 ? 'discount' : 'neutral');
  }

  // Update VRP detail panel if it exists
  const vrpPanel = $('vrpPanel');
  if (vrpPanel && vrpMetrics && ivAnalysis) {
    vrpPanel.innerHTML = buildVRPPanelHTML(vrpMetrics, ivAnalysis, volSetup);
  }
}

// Build HTML for VRP detail panel
function buildVRPPanelHTML(vrpMetrics, ivAnalysis, volSetup) {
  const vrp = vrpMetrics.vrp;
  const vrpColor = vrp > 10 ? 'r' : vrp < -5 ? 'g' : 'y';
  const vrpLabel = vrp > 10 ? 'SELL PREMIUM' : vrp < -5 ? 'BUY PREMIUM' : 'NEUTRAL';

  return `
    <div class="vrp-row">
      <span class="vrp-label">IV (Implied)</span>
      <span class="vrp-value p">${vrpMetrics.iv?.toFixed(1) || '--'}%</span>
    </div>
    <div class="vrp-row">
      <span class="vrp-label">RV (Realized 30d)</span>
      <span class="vrp-value">${vrpMetrics.rv30?.toFixed(1) || '--'}%</span>
    </div>
    <div class="vrp-row highlight">
      <span class="vrp-label">VRP (IV - RV)</span>
      <span class="vrp-value ${vrpColor}">${vrp != null ? (vrp >= 0 ? '+' : '') + vrp.toFixed(1) + '%' : '--'}</span>
    </div>
    <div class="vrp-row">
      <span class="vrp-label">IV Rank (52w)</span>
      <span class="vrp-value">${ivAnalysis.ivRank?.toFixed(0) || '--'}%</span>
    </div>
    <div class="vrp-row">
      <span class="vrp-label">IV Percentile</span>
      <span class="vrp-value">${ivAnalysis.ivPercentile?.toFixed(0) || '--'}%</span>
    </div>
    ${vrpMetrics.termSteepness != null ? `
    <div class="vrp-row">
      <span class="vrp-label">Term Steepness</span>
      <span class="vrp-value">${vrpMetrics.termSteepness >= 0 ? '+' : ''}${vrpMetrics.termSteepness.toFixed(1)}%</span>
    </div>` : ''}
    <div class="vrp-signal ${vrpColor}">
      <span class="signal-label">${vrpLabel}</span>
      ${volSetup ? `<span class="signal-setup">${volSetup.setup.replace('_', ' ')}</span>` : ''}
    </div>
    ${volSetup?.description ? `<div class="vrp-hint">${volSetup.description}</div>` : ''}
  `;
}

// ============================================
// TEACHING TOOLTIPS INJECTION
// ============================================

// Mapping of selectors to tooltip keys
// Note: Quick Stats Bar (.opt-stat-label) now uses dynamic tooltips in index.html + teaching-tips.js
const TOOLTIP_MAPPINGS = [
  // Options page - Volatility Analysis section
  { selector: '.opt-subsection-title', text: 'IV Term Structure', tipKey: 'termStructure' },
  { selector: '.opt-subsection-title', text: 'Volatility Skew', tipKey: 'skew' },
  { selector: '.opt-subsection-title', text: 'Expected Moves', tipKey: 'expectedMove' },
  { selector: '.opt-subsection-title', text: 'Volatility Cone', tipKey: 'volCone' },
  { selector: '.opt-subsection-title', text: 'VRP Analysis', tipKey: 'multiWindowVRP' },
  { selector: '.opt-subsection-title', text: 'Straddle Pricing', tipKey: 'straddleWinRate' },

  // Options page - Gamma/Greeks
  { selector: '.opt-subsection-title', text: 'Gamma Exposure', tipKey: 'vegaRisk' },
  { selector: '.opt-subsection-title', text: 'Dealer Positioning', tipKey: 'dealerPositioning' },

  // Analyze page - VRP section
  { selector: '.vrp-label', text: 'VRP', tipKey: 'vrp' },
  { selector: '.vrp-label', text: 'IV Rank', tipKey: 'ivRank' },
  { selector: '.vrp-label', text: 'IV Percentile', tipKey: 'ivPercentile' },

  // Three Lenses Framework
  { selector: '.lens-name', text: 'Cross-Sectional', tipKey: 'threeLenses' },
  { selector: '.lens-name', text: 'Time Series', tipKey: 'threeLenses' },
  { selector: '.lens-name', text: 'Fundamental', tipKey: 'threeLenses' },
];

export function injectTooltips() {
  TOOLTIP_MAPPINGS.forEach(({ selector, text, tipKey }) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      // Check if text matches (partial match) and no existing tooltip
      const hasTooltip = el.querySelector('.teaching-tooltip') || el.querySelector('.tip-icon');
      if (el.textContent.includes(text) && !hasTooltip) {
        const tooltipHTML = createTooltip(tipKey);
        if (tooltipHTML) {
          el.insertAdjacentHTML('beforeend', tooltipHTML);
        }
      }
    });
  });

  // Also add tooltip to the Three Lenses section header
  const threeLensesTitle = document.querySelector('.opt-subsection-title');
  document.querySelectorAll('.opt-subsection-title').forEach(el => {
    if (el.textContent.includes('Three Lenses') && !el.querySelector('.teaching-tooltip')) {
      el.insertAdjacentHTML('beforeend', createTooltip('threeLenses'));
    }
  });

  // Win Rate section
  document.querySelectorAll('.winrate-title').forEach(el => {
    if (!el.querySelector('.teaching-tooltip')) {
      el.insertAdjacentHTML('beforeend', createTooltip('straddleWinRate'));
    }
  });
}
