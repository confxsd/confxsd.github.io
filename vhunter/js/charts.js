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

// Base chart options
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { display: false },
    y: {
      grid: { color: '#f1f5f9' },
      ticks: { font: { size: 9, family: 'Inter' }, color: '#94a3b8', maxTicksLimit: 4 }
    }
  }
};

// RSI/MFI scale with overbought/oversold lines
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
          label: { ...labelStyle, content: '70', color: '#ef4444', backgroundColor: 'transparent' }
        },
        oversold: {
          type: 'line',
          yMin: 30,
          yMax: 30,
          borderColor: 'rgba(16, 185, 129, 0.5)',
          ...lineStyle,
          label: { ...labelStyle, content: '30', color: '#10b981', backgroundColor: 'transparent' }
        },
        midline: {
          type: 'line',
          yMin: 50,
          yMax: 50,
          borderColor: 'rgba(148, 163, 184, 0.3)',
          borderWidth: 1,
          borderDash: [2, 2]
        }
      }
    }
  }
};

// MFI uses 80/20 thresholds
const mfiOptions = {
  ...chartOptions,
  scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100 } },
  plugins: {
    ...chartOptions.plugins,
    annotation: {
      annotations: {
        overbought: {
          type: 'line',
          yMin: 80,
          yMax: 80,
          borderColor: 'rgba(239, 68, 68, 0.5)',
          ...lineStyle,
          label: { ...labelStyle, content: '80', color: '#ef4444', backgroundColor: 'transparent' }
        },
        oversold: {
          type: 'line',
          yMin: 20,
          yMax: 20,
          borderColor: 'rgba(16, 185, 129, 0.5)',
          ...lineStyle,
          label: { ...labelStyle, content: '20', color: '#10b981', backgroundColor: 'transparent' }
        }
      }
    }
  }
};

// ADX with trend strength threshold
const adxOptions = {
  ...chartOptions,
  scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100 } },
  plugins: {
    ...chartOptions.plugins,
    annotation: {
      annotations: {
        trendThreshold: {
          type: 'line',
          yMin: 25,
          yMax: 25,
          borderColor: 'rgba(245, 158, 11, 0.6)',
          ...lineStyle,
          label: { ...labelStyle, content: '25 (Trend)', color: '#f59e0b', backgroundColor: 'transparent' }
        },
        strongTrend: {
          type: 'line',
          yMin: 40,
          yMax: 40,
          borderColor: 'rgba(139, 92, 246, 0.4)',
          borderWidth: 1,
          borderDash: [2, 2],
          label: { ...labelStyle, content: '40', color: '#8b5cf6', backgroundColor: 'transparent' }
        }
      }
    }
  }
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
  // Price + SMA
  charts.price = new Chart(document.getElementById('pC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#475569', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
        { data: [], borderColor: '#10b981', borderWidth: 1, pointRadius: 0, borderDash: [2, 2] },
        { data: [], borderColor: '#f59e0b', borderWidth: 1, pointRadius: 0, borderDash: [2, 2] }
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
        { data: [], backgroundColor: '#cbd5e1', borderRadius: 1 },
        { type: 'line', data: [], borderColor: '#818cf8', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3] }
      ]
    },
    options: chartOptions
  });

  // RSI with overbought/oversold
  charts.rsi = new Chart(document.getElementById('rC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{ data: [], borderColor: '#8b5cf6', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(139,92,246,0.1)' }]
    },
    options: oscillatorOptions
  });

  // MACD with zero line
  charts.macd = new Chart(document.getElementById('mC'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { data: [], backgroundColor: '#cbd5e1' },
        { type: 'line', data: [], borderColor: '#ef4444', borderWidth: 1, pointRadius: 0 },
        { type: 'line', data: [], borderColor: '#3b82f6', borderWidth: 1, pointRadius: 0 }
      ]
    },
    options: macdOptions
  });

  // ADX with trend threshold
  charts.adx = new Chart(document.getElementById('aC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0 },
        { data: [], borderColor: '#10b981', borderWidth: 1, pointRadius: 0, borderDash: [2, 2] },
        { data: [], borderColor: '#ef4444', borderWidth: 1, pointRadius: 0, borderDash: [2, 2] }
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
        { data: [], borderColor: '#475569', borderWidth: 1.5, pointRadius: 0 },
        { data: [], borderColor: '#94a3b8', borderWidth: 1, pointRadius: 0, borderDash: [2, 2], fill: '+1', backgroundColor: 'rgba(148,163,184,0.1)' },
        { data: [], borderColor: '#94a3b8', borderWidth: 1, pointRadius: 0, borderDash: [2, 2] },
        { data: [], borderColor: '#818cf8', borderWidth: 1, pointRadius: 0, borderDash: [4, 4] } // Middle band (SMA20)
      ]
    },
    options: chartOptions
  });

  // MFI with 80/20 thresholds
  charts.mfi = new Chart(document.getElementById('mfC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{ data: [], borderColor: '#8b5cf6', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(139,92,246,0.1)' }]
    },
    options: mfiOptions
  });

  // A/D Line
  charts.adl = new Chart(document.getElementById('adC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{ data: [], borderColor: '#06b6d4', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(6,182,212,0.1)' }]
    },
    options: chartOptions
  });

  // ATR with average line
  charts.atr = new Chart(document.getElementById('atC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(245,158,11,0.1)' },
        { data: [], borderColor: '#818cf8', borderWidth: 1, pointRadius: 0, borderDash: [3, 3] } // Average ATR line
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
  charts.rsi.data.labels = labels.slice(14);
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
  charts.adx.data.labels = labels.slice(1);
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
  charts.mfi.data.labels = labels.slice(1);
  charts.mfi.data.datasets[0].data = mfi.slice(1);
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
