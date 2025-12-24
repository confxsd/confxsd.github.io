// Charts Module - Chart.js initialization and updates

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

const percentScaleOptions = {
  ...chartOptions,
  scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100 } }
};

export const charts = {};

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

  // Volume
  charts.volume = new Chart(document.getElementById('vC'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: '#cbd5e1', borderRadius: 1 }] },
    options: chartOptions
  });

  // RSI
  charts.rsi = new Chart(document.getElementById('rC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{ data: [], borderColor: '#8b5cf6', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(139,92,246,0.1)' }]
    },
    options: percentScaleOptions
  });

  // MACD
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
    options: chartOptions
  });

  // ADX
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
    options: percentScaleOptions
  });

  // Bollinger Bands
  charts.bb = new Chart(document.getElementById('bC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { data: [], borderColor: '#475569', borderWidth: 1.5, pointRadius: 0 },
        { data: [], borderColor: '#94a3b8', borderWidth: 1, pointRadius: 0, borderDash: [2, 2], fill: '+1', backgroundColor: 'rgba(148,163,184,0.1)' },
        { data: [], borderColor: '#94a3b8', borderWidth: 1, pointRadius: 0, borderDash: [2, 2] }
      ]
    },
    options: chartOptions
  });

  // MFI
  charts.mfi = new Chart(document.getElementById('mfC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{ data: [], borderColor: '#8b5cf6', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(139,92,246,0.1)' }]
    },
    options: percentScaleOptions
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

  // ATR
  charts.atr = new Chart(document.getElementById('atC'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{ data: [], borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(245,158,11,0.1)' }]
    },
    options: chartOptions
  });
}

export function updateCharts(data) {
  const { labels, prices, volumes, bars, rsi, macd, adxData, bb, mfi, adl, atr, sma20, sma50 } = data;

  // Price + SMA
  charts.price.data.labels = labels;
  charts.price.data.datasets[0].data = prices;
  charts.price.data.datasets[1].data = sma20;
  charts.price.data.datasets[2].data = sma50;
  charts.price.update();

  // Volume
  charts.volume.data.labels = labels;
  charts.volume.data.datasets[0].data = volumes;
  charts.volume.data.datasets[0].backgroundColor = bars.map(d => d.c >= d.o ? '#86efac' : '#fca5a5');
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

  // Bollinger Bands
  charts.bb.data.labels = labels;
  charts.bb.data.datasets[0].data = prices;
  charts.bb.data.datasets[1].data = bb.upper;
  charts.bb.data.datasets[2].data = bb.lower;
  charts.bb.update();

  // MFI
  charts.mfi.data.labels = labels.slice(1);
  charts.mfi.data.datasets[0].data = mfi.slice(1);
  charts.mfi.update();

  // A/D Line
  charts.adl.data.labels = labels;
  charts.adl.data.datasets[0].data = adl;
  charts.adl.update();

  // ATR
  charts.atr.data.labels = labels;
  charts.atr.data.datasets[0].data = atr;
  charts.atr.update();
}
