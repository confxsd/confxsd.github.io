// Charts Module - Chart.js initialization and updates with reference lines

const lineStyle = {
  borderWidth: 1,
  borderDash: [4, 4],
  drawTime: 'beforeDatasetsDraw'
};

const labelStyle = {
  display: true,
  position: 'end',
  font: { size: 8, family: 'Inter' },
  padding: 2
};

// Current period for label formatting
let currentPeriod = '1m';

export function setChartPeriod(period) {
  currentPeriod = period;
}

// Base chart options - enhanced for better detail
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: {
    intersect: false,
    mode: 'index'
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      enabled: true,
      backgroundColor: 'rgba(30, 41, 59, 0.95)',
      titleFont: { size: 10, family: 'Inter', weight: '600' },
      bodyFont: { size: 10, family: 'Inter' },
      padding: 8,
      cornerRadius: 4,
      displayColors: false
    }
  },
  scales: {
    x: {
      display: true,
      grid: { display: false },
      ticks: {
        font: { size: 8, family: 'Inter' },
        color: '#94a3b8',
        maxTicksLimit: 8,
        maxRotation: 0
      }
    },
    y: {
      position: 'right',
      grid: { color: '#f1f5f9', drawBorder: false },
      ticks: {
        font: { size: 9, family: 'Inter' },
        color: '#94a3b8',
        maxTicksLimit: 5,
        padding: 4
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
          borderColor: 'rgba(239, 68, 68, 0.5)',
          ...lineStyle,
          adjustScaleRange: false,
          label: { ...labelStyle, content: '70', color: '#ef4444', backgroundColor: 'transparent' }
        },
        oversold: {
          type: 'line',
          yMin: 30,
          yMax: 30,
          borderColor: 'rgba(16, 185, 129, 0.5)',
          ...lineStyle,
          adjustScaleRange: false,
          label: { ...labelStyle, content: '30', color: '#10b981', backgroundColor: 'transparent' }
        },
        midline: {
          type: 'line',
          yMin: 50,
          yMax: 50,
          borderColor: 'rgba(148, 163, 184, 0.3)',
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
          borderColor: 'rgba(100, 116, 139, 0.5)',
          borderWidth: 1.5
        }
      }
    }
  }
};

export const charts = {};
let avgVolume = 0;

export function initCharts() {
  // Price + SMA - enhanced with gradient fill
  charts.price = new Chart(document.getElementById('pC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          borderColor: '#475569',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#475569',
          tension: 0.2,
          fill: true,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
            gradient.addColorStop(0, 'rgba(71, 85, 105, 0.15)');
            gradient.addColorStop(1, 'rgba(71, 85, 105, 0)');
            return gradient;
          }
        },
        { data: [], borderColor: '#10b981', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3] },
        { data: [], borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3] }
      ]
    },
    options: chartOptions
  });

  // Volume with average line - enhanced bar styling
  charts.volume = new Chart(document.getElementById('vC'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { data: [], backgroundColor: '#cbd5e1', borderRadius: 2, barPercentage: 0.8, categoryPercentage: 0.9 },
        { type: 'line', data: [], borderColor: '#818cf8', borderWidth: 2, pointRadius: 0, borderDash: [4, 4] }
      ]
    },
    options: chartOptions
  });

  // RSI with overbought/oversold - enhanced gradient
  charts.rsi = new Chart(document.getElementById('rC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#8b5cf6',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#8b5cf6',
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
          return gradient;
        },
        tension: 0.2
      }]
    },
    options: oscillatorOptions
  });

  // MACD with zero line - enhanced styling
  charts.macd = new Chart(document.getElementById('mC'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { data: [], backgroundColor: '#cbd5e1', borderRadius: 1, barPercentage: 0.7 },
        { type: 'line', data: [], borderColor: '#ef4444', borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
        { type: 'line', data: [], borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 0, tension: 0.2 }
      ]
    },
    options: macdOptions
  });

  // ADX with trend threshold - enhanced with fills
  charts.adx = new Chart(document.getElementById('aC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#6366f1', borderWidth: 2, pointRadius: 0, tension: 0.3, order: 1 },
        { data: [], borderColor: 'rgba(16, 185, 129, 0.7)', borderWidth: 1, pointRadius: 0, tension: 0.3, fill: '+1', backgroundColor: 'rgba(16, 185, 129, 0.05)', order: 2 },
        { data: [], borderColor: 'rgba(239, 68, 68, 0.7)', borderWidth: 1, pointRadius: 0, tension: 0.3, order: 2 }
      ]
    },
    options: adxOptions
  });

  // Bollinger Bands - enhanced with band fill
  charts.bb = new Chart(document.getElementById('bC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#475569', borderWidth: 2, pointRadius: 0, tension: 0.2 },
        { data: [], borderColor: '#94a3b8', borderWidth: 1, pointRadius: 0, borderDash: [3, 3], fill: '+1', backgroundColor: 'rgba(148,163,184,0.08)', tension: 0.2 },
        { data: [], borderColor: '#94a3b8', borderWidth: 1, pointRadius: 0, borderDash: [3, 3], tension: 0.2 },
        { data: [], borderColor: '#818cf8', borderWidth: 1.5, pointRadius: 0, borderDash: [5, 5], tension: 0.2 } // Middle band (SMA20)
      ]
    },
    options: chartOptions
  });

  // MFI with 80/20 thresholds - enhanced gradient
  charts.mfi = new Chart(document.getElementById('mfC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#8b5cf6',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
          return gradient;
        }
      }]
    },
    options: mfiOptions
  });

  // A/D Line - enhanced gradient
  charts.adl = new Chart(document.getElementById('adC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#06b6d4',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
          return gradient;
        }
      }]
    },
    options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, beginAtZero: false } } }
  });

  // ATR with average line - enhanced gradient
  charts.atr = new Chart(document.getElementById('atC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          borderColor: '#f59e0b',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
          fill: true,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
            gradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
            gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
            return gradient;
          }
        },
        { data: [], borderColor: '#818cf8', borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4] } // Average ATR line
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
  charts.volume.data.datasets[0].backgroundColor = bars.map(d => d.c >= d.o ? '#86efac' : '#fca5a5');
  charts.volume.data.datasets[1].data = avgVolumeArr;
  charts.volume.update();

  // RSI
  charts.rsi.data.labels = labels;
  charts.rsi.data.datasets[0].data = rsi;
  charts.rsi.update();

  // MACD
  charts.macd.data.labels = labels;
  charts.macd.data.datasets[0].data = macd.histogram;
  charts.macd.data.datasets[0].backgroundColor = macd.histogram.map(v => v >= 0 ? '#86efac' : '#fca5a5');
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
  if (adxMax >= 20) adxAnnotations.trend = refLine(25, '#f59e0b', '25 (Trend)');
  if (adxMax >= 35) adxAnnotations.strong = refLine(40, '#8b5cf6', '40');
  charts.adx.options.plugins.annotation = { annotations: adxAnnotations };
  charts.adx.update();

  // MFI: show 80/20 lines only if data reaches near them
  const mfiVals = mfi.filter(v => v !== null);
  const mfiMax = Math.max(...mfiVals, 0);
  const mfiMin = Math.min(...mfiVals, 100);
  const mfiAnnotations = {};
  if (mfiMax >= 70) mfiAnnotations.ob = refLine(80, '#ef4444', '80');
  if (mfiMin <= 30) mfiAnnotations.os = refLine(20, '#10b981', '20');
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
