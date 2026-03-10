// Charts Module - Chart.js initialization and updates with reference lines

// Read resolved CSS variable — works for both light/dark since vars change with theme
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const lineStyle = {
  borderWidth: 1,
  borderDash: [3, 3],
  drawTime: 'beforeDatasetsDraw'
};

const labelStyle = {
  display: true,
  position: 'end',
  font: { size: 9, family: 'Plus Jakarta Sans', weight: '500' },
  padding: 3
};

// Current period for label formatting
let currentPeriod = '1m';

export function setChartPeriod(period) {
  currentPeriod = period;
}

// Base chart options - TradingView-inspired clean style
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  interaction: {
    intersect: false,
    mode: 'index'
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      enabled: true,
      backgroundColor: () => cssVar('--tv-tooltip-bg'),
      titleFont: { size: 11, family: 'Plus Jakarta Sans', weight: '600' },
      bodyFont: { size: 11, family: 'Plus Jakarta Sans' },
      padding: 10,
      cornerRadius: 4,
      displayColors: false,
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      display: true,
      grid: { display: false },
      border: { display: false },
      ticks: {
        font: { size: 9, family: 'Plus Jakarta Sans' },
        color: () => cssVar('--tv-text-tertiary'),
        maxTicksLimit: 8,
        maxRotation: 0
      }
    },
    y: {
      position: 'right',
      grid: { color: () => cssVar('--tv-border-light'), drawBorder: false },
      border: { display: false },
      ticks: {
        font: { size: 9, family: 'Plus Jakarta Sans' },
        color: () => cssVar('--tv-text-tertiary'),
        maxTicksLimit: 5,
        padding: 8
      }
    }
  }
};

// RSI scale with overbought/oversold lines
const oscillatorOptions = {
  ...chartOptions,
  scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100 } },
  plugins: {
    ...chartOptions.plugins,
    annotation: {
      annotations: {
        overbought: {
          type: 'line',
          yMin: 70,
          yMax: 70,
          borderColor: 'rgba(239, 83, 80, 0.4)',
          ...lineStyle,
          adjustScaleRange: false,
          label: { ...labelStyle, content: '70', color: '#ef5350', backgroundColor: 'transparent' }
        },
        oversold: {
          type: 'line',
          yMin: 30,
          yMax: 30,
          borderColor: 'rgba(38, 166, 154, 0.4)',
          ...lineStyle,
          adjustScaleRange: false,
          label: { ...labelStyle, content: '30', color: '#26a69a', backgroundColor: 'transparent' }
        },
        midline: {
          type: 'line',
          yMin: 50,
          yMax: 50,
          borderColor: 'rgba(178, 181, 190, 0.3)',
          borderWidth: 1,
          borderDash: [2, 2],
          adjustScaleRange: false
        }
      }
    }
  }
};

// MFI - no fixed annotations, they get added dynamically based on data range
const mfiOptions = {
  ...chartOptions,
  scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, beginAtZero: true } },
  plugins: { ...chartOptions.plugins }
};

// ADX - no fixed annotations, they get added dynamically based on data range
const adxOptions = {
  ...chartOptions,
  scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, beginAtZero: true } },
  plugins: { ...chartOptions.plugins }
};

// MACD with zero line
const macdOptions = {
  ...chartOptions,
  plugins: {
    ...chartOptions.plugins,
    annotation: {
      annotations: {
        zeroLine: {
          type: 'line',
          yMin: 0,
          yMax: 0,
          borderColor: 'rgba(178, 181, 190, 0.4)',
          borderWidth: 1
        }
      }
    }
  }
};

export const charts = {};
let avgVolume = 0;

export function initCharts() {
  // Price + SMA - TradingView style
  charts.price = new Chart(document.getElementById('pC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          borderColor: '#2962ff',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: '#2962ff',
          tension: 0.1,
          fill: true,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
            gradient.addColorStop(0, 'rgba(41, 98, 255, 0.08)');
            gradient.addColorStop(1, 'rgba(41, 98, 255, 0)');
            return gradient;
          }
        },
        { data: [], borderColor: '#26a69a', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3] },
        { data: [], borderColor: '#ff9800', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3] }
      ]
    },
    options: chartOptions
  });

  // Volume with average line
  charts.volume = new Chart(document.getElementById('vC'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { data: [], backgroundColor: '#b2b5be', borderRadius: 1, barPercentage: 0.85, categoryPercentage: 0.9 },
        { type: 'line', data: [], borderColor: '#2962ff', borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4] }
      ]
    },
    options: chartOptions
  });

  // RSI
  charts.rsi = new Chart(document.getElementById('rC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#7c4dff',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: '#7c4dff',
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(124, 77, 255, 0.12)');
          gradient.addColorStop(1, 'rgba(124, 77, 255, 0)');
          return gradient;
        },
        tension: 0.2
      }]
    },
    options: oscillatorOptions
  });

  // MACD
  charts.macd = new Chart(document.getElementById('mC'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { data: [], backgroundColor: '#b2b5be', borderRadius: 1, barPercentage: 0.7 },
        { type: 'line', data: [], borderColor: '#2962ff', borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
        { type: 'line', data: [], borderColor: '#ff6d00', borderWidth: 1.5, pointRadius: 0, tension: 0.2 }
      ]
    },
    options: macdOptions
  });

  // ADX
  charts.adx = new Chart(document.getElementById('aC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#2962ff', borderWidth: 2, pointRadius: 0, tension: 0.3, order: 1 },
        { data: [], borderColor: 'rgba(38, 166, 154, 0.7)', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: '+1', backgroundColor: 'rgba(38, 166, 154, 0.04)', order: 2 },
        { data: [], borderColor: 'rgba(239, 83, 80, 0.7)', borderWidth: 1.5, pointRadius: 0, tension: 0.3, order: 2 }
      ]
    },
    options: adxOptions
  });

  // Bollinger Bands
  charts.bb = new Chart(document.getElementById('bC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#2962ff', borderWidth: 2, pointRadius: 0, tension: 0.2 },
        { data: [], borderColor: '#b2b5be', borderWidth: 1, pointRadius: 0, borderDash: [3, 3], fill: '+1', backgroundColor: 'rgba(178, 181, 190, 0.06)', tension: 0.2 },
        { data: [], borderColor: '#b2b5be', borderWidth: 1, pointRadius: 0, borderDash: [3, 3], tension: 0.2 },
        { data: [], borderColor: '#ff9800', borderWidth: 1.5, pointRadius: 0, borderDash: [5, 5], tension: 0.2 }
      ]
    },
    options: chartOptions
  });

  // MFI
  charts.mfi = new Chart(document.getElementById('mfC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#7c4dff',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(124, 77, 255, 0.12)');
          gradient.addColorStop(1, 'rgba(124, 77, 255, 0)');
          return gradient;
        }
      }]
    },
    options: mfiOptions
  });

  // A/D Line
  charts.adl = new Chart(document.getElementById('adC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#00bcd4',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(0, 188, 212, 0.1)');
          gradient.addColorStop(1, 'rgba(0, 188, 212, 0)');
          return gradient;
        }
      }]
    },
    options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, beginAtZero: false } } }
  });

  // ATR
  charts.atr = new Chart(document.getElementById('atC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          borderColor: '#ff9800',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.2,
          fill: true,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
            gradient.addColorStop(0, 'rgba(255, 152, 0, 0.1)');
            gradient.addColorStop(1, 'rgba(255, 152, 0, 0)');
            return gradient;
          }
        },
        { data: [], borderColor: '#2962ff', borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4] }
      ]
    },
    options: chartOptions
  });
}

export function updateCharts(data) {
  const { labels, prices, volumes, bars, rsi, macd, adxData, bb, mfi, adl, atr, sma20, sma50 } = data;

  // Calculate averages for reference lines
  avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const avgVolumeArr = Array(volumes.length).fill(avgVolume);

  const avgAtr = atr.filter(v => v).reduce((a, b) => a + b, 0) / atr.filter(v => v).length;
  const avgAtrArr = Array(atr.length).fill(avgAtr);

  // Price + SMA
  charts.price.data.labels = labels;
  charts.price.data.datasets[0].data = prices;
  charts.price.data.datasets[1].data = sma20;
  charts.price.data.datasets[2].data = sma50;
  charts.price.update();

  // Volume with average line
  charts.volume.data.labels = labels;
  charts.volume.data.datasets[0].data = volumes;
  charts.volume.data.datasets[0].backgroundColor = bars.map(d => d.c >= d.o ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)');
  charts.volume.data.datasets[1].data = avgVolumeArr;
  charts.volume.update();

  // RSI
  charts.rsi.data.labels = labels;
  charts.rsi.data.datasets[0].data = rsi;
  charts.rsi.update();

  // MACD
  charts.macd.data.labels = labels;
  charts.macd.data.datasets[0].data = macd.histogram;
  charts.macd.data.datasets[0].backgroundColor = macd.histogram.map(v => v >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)');
  charts.macd.data.datasets[1].data = macd.macdLine;
  charts.macd.data.datasets[2].data = macd.signalLine;
  charts.macd.update();

  // ADX
  charts.adx.data.labels = labels;
  charts.adx.data.datasets[0].data = adxData.adx;
  charts.adx.data.datasets[1].data = adxData.pdi;
  charts.adx.data.datasets[2].data = adxData.mdi;
  charts.adx.update();

  // Bollinger Bands with middle band
  charts.bb.data.labels = labels;
  charts.bb.data.datasets[0].data = prices;
  charts.bb.data.datasets[1].data = bb.upper;
  charts.bb.data.datasets[2].data = bb.lower;
  charts.bb.data.datasets[3].data = bb.middle || sma20; // Middle band
  charts.bb.update();

  // MFI
  charts.mfi.data.labels = labels;
  charts.mfi.data.datasets[0].data = mfi;
  charts.mfi.update();

  // A/D Line
  charts.adl.data.labels = labels;
  charts.adl.data.datasets[0].data = adl;
  charts.adl.update();

  // ATR with average line
  charts.atr.data.labels = labels;
  charts.atr.data.datasets[0].data = atr;
  charts.atr.data.datasets[1].data = avgAtrArr;
  charts.atr.update();

  // Dynamic annotations - only show reference lines within data range
  const refLine = (val, color, label) => ({
    type: 'line', yMin: val, yMax: val,
    borderColor: color, ...lineStyle,
    label: { ...labelStyle, content: label, color, backgroundColor: 'transparent' }
  });

  // ADX: show 25/40 lines only if data reaches near them
  const adxVals = adxData.adx.filter(v => v !== null);
  const adxMax = Math.max(...adxVals, 0);
  const adxAnnotations = {};
  if (adxMax >= 20) adxAnnotations.trend = refLine(25, '#ff9800', '25 (Trend)');
  if (adxMax >= 35) adxAnnotations.strong = refLine(40, '#7c4dff', '40');
  charts.adx.options.plugins.annotation = { annotations: adxAnnotations };
  charts.adx.update();

  // MFI: show 80/20 lines only if data reaches near them
  const mfiVals = mfi.filter(v => v !== null);
  const mfiMax = Math.max(...mfiVals, 0);
  const mfiMin = Math.min(...mfiVals, 100);
  const mfiAnnotations = {};
  if (mfiMax >= 70) mfiAnnotations.ob = refLine(80, '#ef5350', '80');
  if (mfiMin <= 30) mfiAnnotations.os = refLine(20, '#26a69a', '20');
  charts.mfi.options.plugins.annotation = { annotations: mfiAnnotations };
  charts.mfi.update();

  // Update chart metrics
  updateChartMetrics(data);
}

// Update metric strips below charts
function updateChartMetrics(data) {
  const { prices, volumes, rsi, macd, adxData, bb, mfi, adl, atr, sma20, sma50 } = data;

  const currentPrice = prices[prices.length - 1];
  const currentRsi = rsi[rsi.length - 1];
  const currentMacd = macd.histogram[macd.histogram.length - 1];
  const currentAdx = adxData.adx[adxData.adx.length - 1];
  const currentPdi = adxData.pdi[adxData.pdi.length - 1];
  const currentMdi = adxData.mdi[adxData.mdi.length - 1];
  const currentMfi = mfi[mfi.length - 1];
  const currentAtr = atr[atr.length - 1];
  const currentVol = volumes[volumes.length - 1];
  const sma20Val = sma20[sma20.length - 1];
  const sma50Val = sma50[sma50.length - 1];

  // Calculate averages
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const avgAtr = atr.filter(v => v).reduce((a, b) => a + b, 0) / atr.filter(v => v).length;
  const rvol = (currentVol / avgVol).toFixed(1);

  // Bollinger %B
  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  const bbPct = ((currentPrice - bbLower) / (bbUpper - bbLower) * 100).toFixed(0);
  const bbWidth = ((bbUpper - bbLower) / currentPrice * 100).toFixed(1);

  // A/D Line trend
  const adlNow = adl[adl.length - 1];
  const adlPrev = adl[adl.length - 10] || adl[0];
  const adlTrend = adlNow > adlPrev ? 'Rising' : 'Falling';

  // Price trend
  const trend = currentPrice > sma20Val ? (sma20Val > sma50Val ? 'bull' : 'warn') : 'bear';

  // Generate metrics HTML
  const metricHtml = (label, value, cls = '') =>
    `<div class="metric-item"><span class="m-label">${label}</span><span class="m-val ${cls}">${value}</span></div>`;

  // Price metrics
  document.getElementById('metric-price').innerHTML =
    metricHtml('Now', '$' + currentPrice.toFixed(2)) +
    metricHtml('vs SMA20', (currentPrice > sma20Val ? '+' : '') + ((currentPrice - sma20Val) / sma20Val * 100).toFixed(1) + '%', currentPrice > sma20Val ? 'bull' : 'bear') +
    metricHtml('Trend', currentPrice > sma20Val && sma20Val > sma50Val ? 'Bullish' : currentPrice < sma20Val && sma20Val < sma50Val ? 'Bearish' : 'Mixed', trend);

  // Volume metrics
  document.getElementById('metric-volume').innerHTML =
    metricHtml('RVol', rvol + 'x', rvol > 1.5 ? 'bull' : rvol < 0.7 ? 'bear' : '') +
    metricHtml('Avg', formatVol(avgVol)) +
    metricHtml('Today', formatVol(currentVol), currentVol > avgVol ? 'bull' : 'bear');

  // RSI metrics
  const rsiZone = currentRsi > 70 ? 'Overbought' : currentRsi < 30 ? 'Oversold' : currentRsi > 50 ? 'Bullish' : 'Bearish';
  document.getElementById('metric-rsi').innerHTML =
    metricHtml('RSI', currentRsi.toFixed(1), currentRsi > 70 ? 'bear' : currentRsi < 30 ? 'bull' : '') +
    metricHtml('Zone', rsiZone, currentRsi > 70 ? 'bear' : currentRsi < 30 ? 'bull' : currentRsi > 50 ? 'bull' : 'bear');

  // MACD metrics
  const macdSignal = currentMacd > 0 ? 'Bullish' : 'Bearish';
  const macdTrend = macd.histogram[macd.histogram.length - 1] > macd.histogram[macd.histogram.length - 2] ? 'Rising' : 'Falling';
  document.getElementById('metric-macd').innerHTML =
    metricHtml('Hist', currentMacd.toFixed(2), currentMacd > 0 ? 'bull' : 'bear') +
    metricHtml('Signal', macdSignal, currentMacd > 0 ? 'bull' : 'bear') +
    metricHtml('Mom', macdTrend, macdTrend === 'Rising' ? 'bull' : 'bear');

  // ADX metrics
  const adxStrength = currentAdx > 40 ? 'Strong' : currentAdx > 25 ? 'Moderate' : 'Weak';
  const diSignal = currentPdi > currentMdi ? 'Bullish' : 'Bearish';
  document.getElementById('metric-adx').innerHTML =
    metricHtml('ADX', currentAdx.toFixed(1), currentAdx > 25 ? 'warn' : '') +
    metricHtml('Trend', adxStrength, currentAdx > 25 ? 'info' : '') +
    metricHtml('+DI/-DI', diSignal, currentPdi > currentMdi ? 'bull' : 'bear');

  // BB metrics
  const bbZone = parseInt(bbPct) > 80 ? 'Upper' : parseInt(bbPct) < 20 ? 'Lower' : 'Mid';
  document.getElementById('metric-bb').innerHTML =
    metricHtml('%B', bbPct + '%', parseInt(bbPct) > 80 ? 'bear' : parseInt(bbPct) < 20 ? 'bull' : '') +
    metricHtml('Zone', bbZone, parseInt(bbPct) > 80 ? 'bear' : parseInt(bbPct) < 20 ? 'bull' : '') +
    metricHtml('Width', bbWidth + '%', parseFloat(bbWidth) < 5 ? 'warn' : '');

  // MFI metrics
  const mfiZone = currentMfi > 80 ? 'Overbought' : currentMfi < 20 ? 'Oversold' : currentMfi > 50 ? 'Bullish' : 'Bearish';
  document.getElementById('metric-mfi').innerHTML =
    metricHtml('MFI', currentMfi.toFixed(1), currentMfi > 80 ? 'bear' : currentMfi < 20 ? 'bull' : '') +
    metricHtml('Zone', mfiZone, currentMfi > 80 ? 'bear' : currentMfi < 20 ? 'bull' : currentMfi > 50 ? 'bull' : 'bear');

  // A/D Line metrics
  document.getElementById('metric-adl').innerHTML =
    metricHtml('Trend', adlTrend, adlTrend === 'Rising' ? 'bull' : 'bear') +
    metricHtml('Signal', adlTrend === 'Rising' ? 'Accumulation' : 'Distribution', adlTrend === 'Rising' ? 'bull' : 'bear');

  // ATR metrics
  const atrPct = (currentAtr / currentPrice * 100).toFixed(1);
  const atrVsAvg = currentAtr > avgAtr ? 'High' : 'Normal';
  document.getElementById('metric-atr').innerHTML =
    metricHtml('ATR', '$' + currentAtr.toFixed(2)) +
    metricHtml('%', atrPct + '%', parseFloat(atrPct) > 4 ? 'warn' : '') +
    metricHtml('vs Avg', atrVsAvg, currentAtr > avgAtr ? 'warn' : '');
}

function formatVol(vol) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toFixed(0);
}

export function updateChartsTheme() {
  Object.values(charts).forEach(chart => {
    if (chart) chart.update();
  });
}
