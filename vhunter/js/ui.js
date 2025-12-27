// UI Module - DOM manipulation and updates

export const $ = (id) => document.getElementById(id);

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
  const change = data.c - data.o;
  const pct = (change / data.o) * 100;

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
  $('sc').textContent = score;
  $('sc').className = 'score ' + (score >= 55 ? 'b' : score <= 45 ? 's' : 'n');

  let signal;
  if (score >= 70) signal = 'STRONG BUY';
  else if (score >= 55) signal = 'BUY';
  else if (score <= 30) signal = 'STRONG SELL';
  else if (score <= 45) signal = 'SELL';
  else signal = 'NEUTRAL';

  $('sg').textContent = signal;
  $('sg').className = 'sig ' + (score >= 55 ? 'b' : score <= 45 ? 's' : 'n');
  $('bi').textContent = Math.abs(score - 50) + 'pts ' + (score > 50 ? 'bull' : score < 50 ? 'bear' : 'ntrl');
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
