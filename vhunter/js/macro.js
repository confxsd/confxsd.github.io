// Macro Panel Module - Bloomberg-style market intelligence dashboard
import { fetchPolygon, fetchClaude } from './api.js';
import { setStockPrice } from './cache.js';

// Constants
const STORAGE_KEY = 'vhunter_macro_settings';
const AI_CACHE_KEY = 'vhunter_macro_ai_cache';

const DEFAULT_INDICES = [
  { ticker: 'SPY', name: 'S&P 500' },
  { ticker: 'QQQ', name: 'Nasdaq 100' },
  { ticker: 'DIA', name: 'Dow Jones' },
  { ticker: 'IWM', name: 'Russell 2000' }
];

const DEFAULT_VIX = { ticker: 'UVXY', name: 'VIX', isVix: true };

const DEFAULT_BONDS = [
  { ticker: 'TLT', name: '20Y Treasury' },
  { ticker: 'IEF', name: '10Y Treasury' },
  { ticker: 'SHY', name: '2Y Treasury' }
];

const DEFAULT_COMMODITIES = [
  { ticker: 'GLD', name: 'Gold' },
  { ticker: 'SLV', name: 'Silver' },
  { ticker: 'USO', name: 'Oil' }
];

// Rotation & Flow ETFs
const ROTATION_ETFS = [
  { ticker: 'IWF', name: 'Russell Growth' },
  { ticker: 'IWD', name: 'Russell Value' },
  { ticker: 'HYG', name: 'High Yield' },
  { ticker: 'LQD', name: 'Inv Grade' },
  { ticker: 'UUP', name: 'Dollar Index' },
  { ticker: 'EEM', name: 'Emerging Mkts' }
];

// Mega-cap leaders (Mag7 + important names)
const DEFAULT_MAG7 = [
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'AVGO', name: 'Broadcom' },
  { ticker: 'AMD', name: 'AMD' },
  { ticker: 'NFLX', name: 'Netflix' },
  { ticker: 'CRM', name: 'Salesforce' },
  { ticker: 'ORCL', name: 'Oracle' },
  { ticker: 'ADBE', name: 'Adobe' }
];

// S&P 500 Sector ETFs
const DEFAULT_SECTORS = [
  { ticker: 'XLK', name: 'Technology', weight: 30 },
  { ticker: 'XLF', name: 'Financials', weight: 13 },
  { ticker: 'XLV', name: 'Healthcare', weight: 12 },
  { ticker: 'XLY', name: 'Consumer Disc', weight: 10 },
  { ticker: 'XLC', name: 'Communication', weight: 9 },
  { ticker: 'XLI', name: 'Industrials', weight: 8 },
  { ticker: 'XLP', name: 'Consumer Staples', weight: 6 },
  { ticker: 'XLE', name: 'Energy', weight: 4 },
  { ticker: 'XLU', name: 'Utilities', weight: 3 },
  { ticker: 'XLRE', name: 'Real Estate', weight: 2 },
  { ticker: 'XLB', name: 'Materials', weight: 2 }
];

// Tooltip definitions
const TOOLTIPS = {
  regime: {
    title: 'Market Regime',
    content: `Analyzes cross-asset moves to determine market sentiment:
• Risk-On: Stocks up, VIX down, bonds down
• Risk-Off: Stocks down, VIX up, bonds up (flight to safety)
• Rotation: Mixed signals, sector rotation in progress
• Divergence: Indices disagreeing (e.g., tech up, small caps down)`
  },
  yieldCurve: {
    title: 'Yield Curve',
    content: `Compares long-term (TLT/20Y) vs short-term (SHY/2Y) bonds:
• Steep: Long rates > Short rates = Growth expectations
• Flat: Rates converging = Slowdown ahead
• Inverted: Short > Long = Recession warning
Trading: Steep favors cyclicals, Flat/Inverted favors defensives`
  },
  riskAppetite: {
    title: 'Risk Appetite',
    content: `Measures SPY performance vs TLT (safe haven bonds):
• Positive: Money flowing into stocks = Risk-On
• Negative: Money flowing into bonds = Risk-Off
• Near zero: Balanced/uncertain
Trading: Strong positive = favor growth, Strong negative = favor quality`
  },
  volRegime: {
    title: 'Volatility Regime',
    content: `UVXY tracks VIX (fear gauge). Thresholds:
• <15: Complacency - buy protection cheap
• 15-20: Normal conditions
• 20-30: Elevated - caution warranted
• >30: Fear/Panic - contrarian buying opportunity
Trading: High VIX = wider stops, smaller size`
  },
  techValue: {
    title: 'Tech vs Value',
    content: `Compares QQQ (growth/tech) vs IWM (small cap/value):
• Positive: Growth/Tech leading = favor momentum
• Negative: Value/Small caps leading = favor rotation
• Large spread: Potential mean reversion setup
Trading: Follow the leader or fade extremes`
  },
  goldSignal: {
    title: 'Gold Signal',
    content: `Gold behavior relative to stocks:
• Both up: Inflation hedge / liquidity driven
• GLD up, SPY down: Fear trade / safe haven
• GLD down, SPY up: Risk-on, no fear
• Both down: Deflation / liquidity crunch
Trading: GLD+SPY divergence = macro uncertainty`
  },
  breadth: {
    title: 'Market Breadth',
    content: `Counts how many major indices are positive:
• 4/4: Strong broad rally
• 3/4: Healthy with rotation
• 2/4: Mixed / transitional
• 1/4 or 0/4: Broad weakness
Trading: Narrow rallies (1-2 up) often reverse`
  },
  growthValue: {
    title: 'Growth vs Value Rotation',
    content: `Compares IWF (Russell 1000 Growth) vs IWD (Russell 1000 Value):
• Growth Leading: AI, tech, momentum names bid
• Value Leading: Financials, energy, dividend stocks preferred
• Extreme spreads (>1%) may mean revert
Trading: Follow the rotation for 2-5 days, then fade extremes`
  },
  creditSpread: {
    title: 'Credit Spread',
    content: `Compares HYG (High Yield) vs LQD (Inv Grade) bonds:
• HYG outperforming: Risk appetite in credit, bullish signal
• LQD outperforming: Flight to quality, defensive
• Both down: Rising rates, tightening conditions
Trading: Wide credit spread = reduced risk; Tight = full risk-on`
  },
  dollarStrength: {
    title: 'Dollar Strength',
    content: `UUP tracks the US Dollar Index (DXY):
• Strong dollar: Headwind for commodities, multinationals, EM
• Weak dollar: Tailwind for gold, commodities, exporters
• Breaking key levels often accelerates trends
Trading: Dollar strength often precedes equity weakness`
  },
  emFlow: {
    title: 'EM Flow',
    content: `Compares EEM (Emerging Markets) vs SPY:
• EEM outperforming: Global risk-on, dollar weakness
• SPY outperforming: US exceptionalism, EM stress
• Large divergence = potential reversion trade
Trading: EM leads in weak dollar environment`
  },
  defensiveRotation: {
    title: 'Defensive vs Cyclical',
    content: `Compares XLP (Consumer Staples) vs XLY (Consumer Discretionary):
• XLP leading: Defensive rotation, late cycle behavior
• XLY leading: Risk-on, consumer confidence high
• Ratio breaks often persist for weeks
Trading: XLP leadership often precedes corrections`
  },
  qualitySpread: {
    title: 'Large vs Small Cap',
    content: `Compares SPY (Large Cap) vs IWM (Small Cap):
• SPY leading: Quality/size premium, cautious market
• IWM leading: Risk-on, economic expansion bet
• Small caps lead early cycle, lag late cycle
Trading: IWM strength = bullish breadth signal`
  }
};

let settings = {};
let refreshInterval = null;
let macroData = {};
let metrics = {};
let sparklineData = {}; // Store historical data for sparklines

// Load settings from localStorage
function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    settings = stored ? JSON.parse(stored) : {};
  } catch (e) {
    settings = {};
  }
  return settings;
}

// Save settings to localStorage
function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save macro settings:', e);
  }
}

// Get all tickers to fetch
function getAllTickers() {
  const tickers = new Set();
  DEFAULT_INDICES.forEach(i => tickers.add(i.ticker));
  tickers.add(DEFAULT_VIX.ticker);
  DEFAULT_BONDS.forEach(b => tickers.add(b.ticker));
  DEFAULT_COMMODITIES.forEach(c => tickers.add(c.ticker));
  DEFAULT_SECTORS.forEach(s => tickers.add(s.ticker));
  ROTATION_ETFS.forEach(r => tickers.add(r.ticker));
  const mag7List = settings.mag7 || DEFAULT_MAG7;
  mag7List.forEach(item => {
    const ticker = typeof item === 'string' ? item : item.ticker;
    tickers.add(ticker);
  });
  if (settings.customIndices) {
    settings.customIndices.split(',').forEach(t => {
      const trimmed = t.trim().toUpperCase();
      if (trimmed) tickers.add(trimmed);
    });
  }
  return [...tickers];
}

// Fetch snapshot for a single ticker
async function fetchSnapshot(ticker) {
  try {
    const data = await fetchPolygon(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
    return data?.ticker || null;
  } catch (e) {
    console.warn(`Failed to fetch ${ticker}:`, e.message);
    return null;
  }
}

// Fetch historical data for sparklines (last 5 days, hourly)
async function fetchSparklineData(ticker) {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 5);

    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/range/1/hour/${from}/${to}?adjusted=true&sort=asc&limit=100`);

    if (data?.results?.length > 0) {
      // Extract closing prices and normalize to percentage change from first point
      const prices = data.results.map(r => r.c);
      const firstPrice = prices[0];
      const normalized = prices.map(p => ((p - firstPrice) / firstPrice) * 100);
      return { prices, normalized, firstPrice };
    }
    return null;
  } catch (e) {
    console.warn(`Failed to fetch sparkline for ${ticker}:`, e.message);
    return null;
  }
}

// Fetch sparklines for rotation pairs
async function fetchRotationSparklines() {
  const pairs = [
    ['IWF', 'IWD'],
    ['HYG', 'LQD'],
    ['UUP'],
    ['EEM', 'SPY'],
    ['XLP', 'XLY'],
    ['SPY', 'IWM']
  ];

  const allTickers = [...new Set(pairs.flat())];

  const results = await Promise.allSettled(
    allTickers.map(ticker => fetchSparklineData(ticker))
  );

  allTickers.forEach((ticker, i) => {
    if (results[i].status === 'fulfilled' && results[i].value) {
      sparklineData[ticker] = results[i].value;
    }
  });
}

// Generate SVG sparkline path - returns object with SVG and colors for legend
function generateSparklineSVG(ticker1, ticker2, width = 100, height = 32) {
  const data1 = sparklineData[ticker1];
  const data2 = ticker2 ? sparklineData[ticker2] : null;

  if (!data1?.normalized?.length) {
    return { svg: '<div class="sparkline-empty">Loading...</div>', color1: '#94a3b8', color2: '#94a3b8' };
  }

  const points1 = data1.normalized;
  const points2 = data2?.normalized || [];

  // Find min/max across both datasets for scaling
  const allPoints = [...points1, ...points2];
  const minVal = Math.min(...allPoints);
  const maxVal = Math.max(...allPoints);
  const range = maxVal - minVal || 1;

  // Add padding to range
  const padding = range * 0.1;
  const adjMin = minVal - padding;
  const adjMax = maxVal + padding;
  const adjRange = adjMax - adjMin;

  // Generate path for line 1
  const pathPoints1 = points1.map((val, i) => {
    const x = (i / (points1.length - 1)) * width;
    const y = height - ((val - adjMin) / adjRange) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path1 = `M${pathPoints1.join(' L')}`;

  // Line 1 color - use distinct colors for comparison
  const color1 = '#6366f1'; // Indigo for primary (first ticker)

  let path2 = '';
  let color2 = '#f59e0b'; // Amber for secondary (second ticker)

  if (points2.length > 0) {
    const pathPoints2 = points2.map((val, i) => {
      const x = (i / (points2.length - 1)) * width;
      const y = height - ((val - adjMin) / adjRange) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    path2 = `M${pathPoints2.join(' L')}`;
  }

  // Zero line position
  const zeroY = height - ((0 - adjMin) / adjRange) * height;

  const svg = `
    <svg class="rotation-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="0" y1="${zeroY.toFixed(1)}" x2="${width}" y2="${zeroY.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2"/>
      ${path2 ? `<path d="${path2}" fill="none" stroke="${color2}" stroke-width="1.5" opacity="0.7"/>` : ''}
      <path d="${path1}" fill="none" stroke="${color1}" stroke-width="2"/>
    </svg>
  `;

  return { svg, color1, color2 };
}

// Process snapshot data into standard format
function processSnapshot(data) {
  if (!data) return null;
  const price = data.lastTrade?.p || data.day?.c || data.prevDay?.c || 0;
  const prevClose = data.prevDay?.c || price;
  const change = data.todaysChange || (price - prevClose);
  const changePercent = data.todaysChangePerc || (prevClose ? ((change / prevClose) * 100) : 0);
  return {
    price,
    prevClose,
    change,
    changePercent,
    high: data.day?.h || price,
    low: data.day?.l || price,
    volume: data.day?.v || 0,
    updated: data.updated
  };
}

// Fetch all macro data
async function fetchAllMacroData() {
  const allTickers = getAllTickers();
  console.log('Fetching macro data for:', allTickers);

  const results = await Promise.allSettled(
    allTickers.map(ticker => fetchSnapshot(ticker))
  );

  allTickers.forEach((ticker, i) => {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      const processed = processSnapshot(result.value);
      if (processed) {
        macroData[ticker] = processed;
        setStockPrice(ticker, processed.price);
      }
    }
  });

  // Calculate derived metrics
  metrics = calculateMetrics();
  updateLastUpdate();
}

// Calculate all derived metrics
function calculateMetrics() {
  const spy = macroData['SPY'];
  const qqq = macroData['QQQ'];
  const dia = macroData['DIA'];
  const iwm = macroData['IWM'];
  const tlt = macroData['TLT'];
  const shy = macroData['SHY'];
  const gld = macroData['GLD'];
  const uvxy = macroData['UVXY'];

  // Market Regime
  const regime = calculateMarketRegime(spy, qqq, tlt, uvxy, gld);

  // Yield Curve: TLT change - SHY change (steepening vs flattening)
  const yieldCurveSpread = (tlt?.changePercent || 0) - (shy?.changePercent || 0);
  let yieldCurveSignal = 'NEUTRAL';
  if (yieldCurveSpread > 0.3) yieldCurveSignal = 'STEEPENING';
  else if (yieldCurveSpread < -0.3) yieldCurveSignal = 'FLATTENING';

  // Risk Appetite: SPY - TLT
  const riskAppetite = (spy?.changePercent || 0) - (tlt?.changePercent || 0);
  let riskSignal = 'NEUTRAL';
  if (riskAppetite > 0.5) riskSignal = 'RISK-ON';
  else if (riskAppetite < -0.5) riskSignal = 'RISK-OFF';

  // Volatility Regime
  const vixPrice = uvxy?.price || 20;
  const vixChange = uvxy?.changePercent || 0;
  let volSignal = 'NORMAL';
  if (vixPrice > 50) volSignal = 'EXTREME';
  else if (vixPrice > 30) volSignal = 'FEAR';
  else if (vixPrice > 20) volSignal = 'ELEVATED';
  else if (vixPrice < 12) volSignal = 'COMPLACENT';

  // Tech vs Value: QQQ - IWM
  const techValue = (qqq?.changePercent || 0) - (iwm?.changePercent || 0);
  let techValueSignal = 'BALANCED';
  if (techValue > 0.5) techValueSignal = 'TECH';
  else if (techValue < -0.5) techValueSignal = 'VALUE';

  // Gold Signal
  const goldChange = gld?.changePercent || 0;
  const spyChange = spy?.changePercent || 0;
  let goldSignal = 'NEUTRAL';
  if (goldChange > 0.3 && spyChange < -0.3) goldSignal = 'SAFE HAVEN';
  else if (goldChange > 0.3 && spyChange > 0.3) goldSignal = 'INFLATION';
  else if (goldChange < -0.3 && spyChange > 0.3) goldSignal = 'RISK-ON';
  else if (goldChange < -0.3 && spyChange < -0.3) goldSignal = 'DEFLATION';

  // Breadth
  const indices = [spy, qqq, dia, iwm].filter(d => d);
  const upCount = indices.filter(d => d.changePercent > 0).length;
  const breadth = `${upCount}/${indices.length}`;
  let breadthSignal = 'MIXED';
  if (upCount === indices.length) breadthSignal = 'STRONG';
  else if (upCount >= indices.length - 1) breadthSignal = 'HEALTHY';
  else if (upCount <= 1) breadthSignal = 'WEAK';

  // === ROTATION METRICS ===
  const iwf = macroData['IWF'];
  const iwd = macroData['IWD'];
  const hyg = macroData['HYG'];
  const lqd = macroData['LQD'];
  const uup = macroData['UUP'];
  const eem = macroData['EEM'];
  const xlp = macroData['XLP'];
  const xly = macroData['XLY'];

  // Growth vs Value (IWF - IWD)
  const growthValueSpread = (iwf?.changePercent || 0) - (iwd?.changePercent || 0);
  let growthValueSignal = 'BALANCED';
  if (growthValueSpread > 0.3) growthValueSignal = 'GROWTH';
  else if (growthValueSpread < -0.3) growthValueSignal = 'VALUE';

  // Credit Spread (HYG - LQD)
  const creditSpread = (hyg?.changePercent || 0) - (lqd?.changePercent || 0);
  let creditSignal = 'NEUTRAL';
  if (creditSpread > 0.2) creditSignal = 'RISK-ON';
  else if (creditSpread < -0.2) creditSignal = 'RISK-OFF';

  // Dollar Strength
  const dollarChange = uup?.changePercent || 0;
  let dollarSignal = 'STABLE';
  if (dollarChange > 0.3) dollarSignal = 'STRONG';
  else if (dollarChange < -0.3) dollarSignal = 'WEAK';

  // EM Flow (EEM - SPY)
  const emSpread = (eem?.changePercent || 0) - (spy?.changePercent || 0);
  let emSignal = 'NEUTRAL';
  if (emSpread > 0.3) emSignal = 'EM LEADING';
  else if (emSpread < -0.3) emSignal = 'US LEADING';

  // Defensive Rotation (XLP - XLY)
  const defensiveSpread = (xlp?.changePercent || 0) - (xly?.changePercent || 0);
  let defensiveSignal = 'BALANCED';
  if (defensiveSpread > 0.3) defensiveSignal = 'DEFENSIVE';
  else if (defensiveSpread < -0.3) defensiveSignal = 'CYCLICAL';

  // Quality Spread (SPY - IWM)
  const qualitySpread = (spy?.changePercent || 0) - (iwm?.changePercent || 0);
  let qualitySignal = 'NEUTRAL';
  if (qualitySpread > 0.3) qualitySignal = 'LARGE CAP';
  else if (qualitySpread < -0.3) qualitySignal = 'SMALL CAP';

  return {
    regime,
    yieldCurve: { value: yieldCurveSpread, signal: yieldCurveSignal },
    riskAppetite: { value: riskAppetite, signal: riskSignal },
    volRegime: { value: vixPrice, change: vixChange, signal: volSignal },
    techValue: { value: techValue, signal: techValueSignal },
    goldSignal: { value: goldChange, signal: goldSignal },
    breadth: { value: breadth, upCount, total: indices.length, signal: breadthSignal },
    // Rotation metrics
    growthValue: { value: growthValueSpread, signal: growthValueSignal },
    creditSpread: { value: creditSpread, signal: creditSignal },
    dollarStrength: { value: dollarChange, signal: dollarSignal },
    emFlow: { value: emSpread, signal: emSignal },
    defensiveRotation: { value: defensiveSpread, signal: defensiveSignal },
    qualitySpread: { value: qualitySpread, signal: qualitySignal }
  };
}

// Calculate market regime
function calculateMarketRegime(spy, qqq, tlt, uvxy, gld) {
  const spyUp = (spy?.changePercent || 0) > 0.1;
  const qqqUp = (qqq?.changePercent || 0) > 0.1;
  const tltDown = (tlt?.changePercent || 0) < -0.1;
  const vixDown = (uvxy?.changePercent || 0) < -0.5;
  const vixUp = (uvxy?.changePercent || 0) > 1;
  const spyDown = (spy?.changePercent || 0) < -0.1;
  const tltUp = (tlt?.changePercent || 0) > 0.1;

  // Calculate risk score (-100 to +100)
  let score = 0;
  score += (spy?.changePercent || 0) * 15;
  score += (qqq?.changePercent || 0) * 10;
  score -= (uvxy?.changePercent || 0) * 5;
  score -= (tlt?.changePercent || 0) * 5;
  score = Math.max(-100, Math.min(100, score));

  let regime = 'NEUTRAL';
  let description = 'Mixed signals';

  if (spyUp && qqqUp && vixDown && tltDown) {
    regime = 'RISK-ON';
    description = 'Stocks up, VIX down, Bonds down';
  } else if (spyDown && vixUp && tltUp) {
    regime = 'RISK-OFF';
    description = 'Stocks down, VIX up, Bonds up';
  } else if (spyUp && !qqqUp) {
    regime = 'ROTATION';
    description = 'Sector rotation in progress';
  } else if ((spyUp && vixUp) || (spyDown && vixDown)) {
    regime = 'DIVERGENCE';
    description = 'Unusual cross-asset moves';
  } else if (spyUp || qqqUp) {
    regime = 'RISK-ON';
    description = 'Stocks leading higher';
  } else if (spyDown || vixUp) {
    regime = 'RISK-OFF';
    description = 'Defensive posture';
  }

  return { regime, description, score };
}

// Update last update timestamp
function updateLastUpdate() {
  const el = document.getElementById('macroLastUpdate');
  if (el) {
    el.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  }
}

// Render tooltip HTML
function renderTooltip(key) {
  const tip = TOOLTIPS[key];
  if (!tip) return '';
  return `
    <div class="macro-tooltip" data-tooltip="${key}">
      <span class="tooltip-icon">?</span>
      <div class="tooltip-content">
        <div class="tooltip-title">${tip.title}</div>
        <div class="tooltip-text">${tip.content.replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;
}

// Render market regime bar
function renderRegimeBar() {
  const container = document.getElementById('macroRegimeBar');
  if (!container || !metrics.regime) return;

  const { regime, description, score } = metrics.regime;
  const normalizedScore = (score + 100) / 2; // 0-100

  let regimeClass = 'neutral';
  if (regime === 'RISK-ON') regimeClass = 'risk-on';
  else if (regime === 'RISK-OFF') regimeClass = 'risk-off';
  else if (regime === 'ROTATION') regimeClass = 'rotation';
  else if (regime === 'DIVERGENCE') regimeClass = 'divergence';

  container.innerHTML = `
    <div class="regime-header">
      <div class="regime-label">MARKET REGIME</div>
      <div class="regime-value ${regimeClass}">${regime}</div>
      ${renderTooltip('regime')}
    </div>
    <div class="regime-gauge">
      <div class="regime-gauge-track">
        <div class="regime-gauge-fill" style="width: ${normalizedScore}%"></div>
        <div class="regime-gauge-marker" style="left: ${normalizedScore}%"></div>
      </div>
      <div class="regime-gauge-labels">
        <span>Risk-Off</span>
        <span>Neutral</span>
        <span>Risk-On</span>
      </div>
    </div>
    <div class="regime-description">${description}</div>
  `;
}

// Render quick metrics row
function renderQuickMetrics() {
  const container = document.getElementById('macroQuickMetrics');
  if (!container) return;

  const m = metrics;

  const getSignalClass = (signal) => {
    if (['RISK-ON', 'STEEPENING', 'TECH', 'STRONG', 'HEALTHY', 'COMPLACENT'].includes(signal)) return 'bullish';
    if (['RISK-OFF', 'FLATTENING', 'VALUE', 'WEAK', 'FEAR', 'EXTREME', 'SAFE HAVEN', 'DEFLATION'].includes(signal)) return 'bearish';
    return 'neutral';
  };

  container.innerHTML = `
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-label">Yield Curve</span>
        ${renderTooltip('yieldCurve')}
      </div>
      <div class="metric-signal ${getSignalClass(m.yieldCurve?.signal)}">${m.yieldCurve?.signal || '--'}</div>
      <div class="metric-value">${m.yieldCurve?.value >= 0 ? '+' : ''}${(m.yieldCurve?.value || 0).toFixed(2)}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-label">Risk Appetite</span>
        ${renderTooltip('riskAppetite')}
      </div>
      <div class="metric-signal ${getSignalClass(m.riskAppetite?.signal)}">${m.riskAppetite?.signal || '--'}</div>
      <div class="metric-value">${m.riskAppetite?.value >= 0 ? '+' : ''}${(m.riskAppetite?.value || 0).toFixed(2)}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-label">Vol Regime</span>
        ${renderTooltip('volRegime')}
      </div>
      <div class="metric-signal ${getSignalClass(m.volRegime?.signal)}">${m.volRegime?.signal || '--'}</div>
      <div class="metric-value">$${(m.volRegime?.value || 0).toFixed(1)} (${m.volRegime?.change >= 0 ? '+' : ''}${(m.volRegime?.change || 0).toFixed(1)}%)</div>
    </div>
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-label">Tech vs Value</span>
        ${renderTooltip('techValue')}
      </div>
      <div class="metric-signal ${getSignalClass(m.techValue?.signal)}">${m.techValue?.signal || '--'}</div>
      <div class="metric-value">${m.techValue?.value >= 0 ? '+' : ''}${(m.techValue?.value || 0).toFixed(2)}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-label">Gold Signal</span>
        ${renderTooltip('goldSignal')}
      </div>
      <div class="metric-signal ${getSignalClass(m.goldSignal?.signal)}">${m.goldSignal?.signal || '--'}</div>
      <div class="metric-value">${m.goldSignal?.value >= 0 ? '+' : ''}${(m.goldSignal?.value || 0).toFixed(2)}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-header">
        <span class="metric-label">Breadth</span>
        ${renderTooltip('breadth')}
      </div>
      <div class="metric-signal ${getSignalClass(m.breadth?.signal)}">${m.breadth?.signal || '--'}</div>
      <div class="metric-value">${m.breadth?.value || '--'} Up</div>
    </div>
  `;
}

// Render rotation metrics row with enhanced visual design
function renderRotationMetrics() {
  const container = document.getElementById('macroRotationMetrics');
  if (!container) return;

  const m = metrics;

  // Signal classification
  const getSignalClass = (signal) => {
    if (['GROWTH', 'RISK-ON', 'WEAK', 'EM LEADING', 'CYCLICAL', 'SMALL CAP'].includes(signal)) return 'bullish';
    if (['VALUE', 'RISK-OFF', 'STRONG', 'US LEADING', 'DEFENSIVE', 'LARGE CAP'].includes(signal)) return 'bearish';
    return 'neutral';
  };

  // Arrow direction based on signal
  const getArrowClass = (signal) => {
    const bullish = ['GROWTH', 'RISK-ON', 'WEAK', 'EM LEADING', 'CYCLICAL', 'SMALL CAP'];
    const bearish = ['VALUE', 'RISK-OFF', 'STRONG', 'US LEADING', 'DEFENSIVE', 'LARGE CAP'];
    if (bullish.includes(signal)) return 'up';
    if (bearish.includes(signal)) return 'down';
    return 'flat';
  };

  // Arrow icon SVG
  const getArrowIcon = (direction) => {
    if (direction === 'up') return '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2L10 7H2L6 2Z"/><rect x="5" y="6" width="2" height="4" rx="0.5"/></svg>';
    if (direction === 'down') return '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10L2 5H10L6 10Z"/><rect x="5" y="2" width="2" height="4" rx="0.5"/></svg>';
    return '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="5" width="8" height="2" rx="1"/></svg>';
  };

  // Rotation card definitions with ticker comparisons
  const rotationCards = [
    {
      key: 'growthValue',
      label: 'Growth/Value',
      ticker1: 'IWF',
      ticker2: 'IWD',
      data: m.growthValue
    },
    {
      key: 'creditSpread',
      label: 'Credit',
      ticker1: 'HYG',
      ticker2: 'LQD',
      data: m.creditSpread
    },
    {
      key: 'dollarStrength',
      label: 'Dollar',
      ticker1: 'UUP',
      ticker2: null,
      data: m.dollarStrength
    },
    {
      key: 'emFlow',
      label: 'EM Flow',
      ticker1: 'EEM',
      ticker2: 'SPY',
      data: m.emFlow
    },
    {
      key: 'defensiveRotation',
      label: 'Def/Cyc',
      ticker1: 'XLP',
      ticker2: 'XLY',
      data: m.defensiveRotation
    },
    {
      key: 'qualitySpread',
      label: 'Cap Size',
      ticker1: 'SPY',
      ticker2: 'IWM',
      data: m.qualitySpread
    }
  ];

  container.innerHTML = rotationCards.map(card => {
    const signal = card.data?.signal || 'NEUTRAL';
    const value = card.data?.value || 0;
    const signalClass = getSignalClass(signal);
    const arrowClass = getArrowClass(signal);
    const arrowIcon = getArrowIcon(arrowClass);
    const isStrong = Math.abs(value) >= 0.5;
    const valueClass = value >= 0 ? 'positive' : 'negative';

    // Generate sparkline SVG and get colors
    const sparkline = generateSparklineSVG(card.ticker1, card.ticker2);

    // Legend for the sparklines with dynamic colors
    const legendHtml = card.ticker2 ? `
      <div class="sparkline-legend">
        <span class="legend-item"><span class="legend-line" style="background:${sparkline.color1}"></span>${card.ticker1}</span>
        <span class="legend-item"><span class="legend-line" style="background:${sparkline.color2}"></span>${card.ticker2}</span>
      </div>
    ` : `
      <div class="sparkline-legend">
        <span class="legend-item"><span class="legend-line" style="background:${sparkline.color1}"></span>${card.ticker1}</span>
      </div>
    `;

    return `
      <div class="rotation-card ${signalClass} ${isStrong ? 'strong-signal' : ''}" data-key="${card.key}">
        <div class="rotation-header">
          <span class="rotation-label">${card.label}</span>
          ${renderTooltip(card.key)}
        </div>
        <div class="rotation-signal-row">
          <div class="rotation-arrow ${arrowClass}">${arrowIcon}</div>
          <span class="rotation-signal-text ${signalClass}">${signal}</span>
        </div>
        <div class="rotation-sparkline-wrap">
          ${sparkline.svg}
          ${legendHtml}
        </div>
        <div class="rotation-value">
          <span class="rotation-value-num ${valueClass}">${value >= 0 ? '+' : ''}${value.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render a single asset card
function renderAssetCard(ticker, name, data, options = {}) {
  const { isVix = false, mini = false } = options;

  if (!data) {
    return `
      <div class="asset-card loading ${mini ? 'mini' : ''}" data-ticker="${ticker}">
        <div class="asset-ticker">${ticker}</div>
        <div class="asset-price">--</div>
        <div class="asset-change">--</div>
      </div>
    `;
  }

  let changePercent = data.changePercent;
  let changeClass = changePercent >= 0 ? 'positive' : 'negative';
  if (isVix) changeClass = changePercent >= 0 ? 'negative' : 'positive';

  const priceDisplay = data.price >= 1000 ? data.price.toFixed(0) : data.price >= 100 ? data.price.toFixed(1) : data.price.toFixed(2);

  return `
    <div class="asset-card ${changeClass} ${mini ? 'mini' : ''}" data-ticker="${ticker}" onclick="window.macroAnalyzeTicker && macroAnalyzeTicker('${ticker}')">
      <div class="asset-ticker">${mini ? ticker : name}</div>
      <div class="asset-price">$${priceDisplay}</div>
      <div class="asset-change ${changeClass}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</div>
    </div>
  `;
}

// Render indices section
function renderIndices() {
  const container = document.getElementById('indicesCards');
  if (!container) return;

  let html = DEFAULT_INDICES.map(idx =>
    renderAssetCard(idx.ticker, idx.name, macroData[idx.ticker])
  ).join('');

  html += renderAssetCard(DEFAULT_VIX.ticker, DEFAULT_VIX.name, macroData[DEFAULT_VIX.ticker], { isVix: true });

  container.innerHTML = html;
}

// Render bonds section
function renderBonds() {
  const container = document.getElementById('bondsCards');
  if (!container) return;

  container.innerHTML = DEFAULT_BONDS.map(bond =>
    renderAssetCard(bond.ticker, bond.name, macroData[bond.ticker])
  ).join('');
}

// Render commodities section
function renderCommodities() {
  const container = document.getElementById('commoditiesCards');
  if (!container) return;

  container.innerHTML = DEFAULT_COMMODITIES.map(comm =>
    renderAssetCard(comm.ticker, comm.name, macroData[comm.ticker])
  ).join('');
}

// Render Mag7 as professional list
function renderMag7() {
  const container = document.getElementById('mag7Cards');
  const summaryEl = document.getElementById('mag7Summary');
  if (!container) return;

  const mag7List = settings.mag7 || DEFAULT_MAG7;

  // Build list HTML
  let html = `
    <div class="mag7-list">
      <div class="mag7-list-header">
        <span>Symbol</span>
        <span>Name</span>
        <span>Price</span>
        <span>Chg</span>
        <span>Chg%</span>
      </div>
  `;

  mag7List.forEach(item => {
    const ticker = typeof item === 'string' ? item : item.ticker;
    const name = typeof item === 'string' ? item : item.name;
    const data = macroData[ticker];

    if (!data) {
      html += `
        <div class="mag7-list-row loading" data-ticker="${ticker}">
          <span class="mag7-list-ticker">${ticker}</span>
          <span class="mag7-list-name">${name}</span>
          <span class="mag7-list-price">--</span>
          <span class="mag7-list-change">--</span>
          <span class="mag7-list-change-pct">--</span>
        </div>
      `;
      return;
    }

    const changeClass = data.changePercent >= 0 ? 'positive' : 'negative';
    const rowClass = data.changePercent >= 0 ? 'positive-row' : 'negative-row';
    const priceDisplay = data.price >= 1000 ? data.price.toFixed(0) : data.price.toFixed(2);
    const changeDollar = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}`;
    const changePct = `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`;

    html += `
      <div class="mag7-list-row ${rowClass}" data-ticker="${ticker}" onclick="window.macroAnalyzeTicker && macroAnalyzeTicker('${ticker}')">
        <span class="mag7-list-ticker">${ticker}</span>
        <span class="mag7-list-name">${name}</span>
        <span class="mag7-list-price">$${priceDisplay}</span>
        <span class="mag7-list-change ${changeClass}">${changeDollar}</span>
        <span class="mag7-list-change-pct ${changeClass}">${changePct}</span>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  // Update summary
  const mag7Data = mag7List.map(item => {
    const ticker = typeof item === 'string' ? item : item.ticker;
    return macroData[ticker];
  }).filter(d => d);

  if (mag7Data.length > 0 && summaryEl) {
    const avgChange = mag7Data.reduce((sum, d) => sum + d.changePercent, 0) / mag7Data.length;
    const upCount = mag7Data.filter(d => d.changePercent > 0).length;
    const changeClass = avgChange >= 0 ? 'positive' : 'negative';
    summaryEl.innerHTML = `
      <span class="${changeClass}">${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
      <span class="mag7-ratio">${upCount}/${mag7Data.length} up</span>
    `;
  }
}

// Render correlations
function renderCorrelations() {
  const container = document.getElementById('correlationsGrid');
  if (!container) return;

  // Simple same-day correlation approximation based on direction
  const pairs = [
    { a: 'SPY', b: 'QQQ', expected: 'Usually high (~0.9)' },
    { a: 'SPY', b: 'TLT', expected: 'Usually negative' },
    { a: 'SPY', b: 'GLD', expected: 'Context dependent' },
    { a: 'SPY', b: 'UVXY', expected: 'Always negative' }
  ];

  container.innerHTML = pairs.map(({ a, b, expected }) => {
    const dataA = macroData[a];
    const dataB = macroData[b];

    if (!dataA || !dataB) {
      return `<div class="corr-item"><span class="corr-pair">${a}/${b}</span><span class="corr-value">--</span></div>`;
    }

    // Simple same-direction indicator
    const sameDir = (dataA.changePercent * dataB.changePercent) > 0;
    const isVix = b === 'UVXY';
    const expected_same = !isVix && (a === 'SPY' && b === 'QQQ');
    const expected_opp = isVix || b === 'TLT';

    let status = 'normal';
    if (expected_same && sameDir) status = 'expected';
    else if (expected_opp && !sameDir) status = 'expected';
    else if (expected_same && !sameDir) status = 'unusual';
    else if (expected_opp && sameDir) status = 'unusual';

    const direction = sameDir ? 'Same' : 'Opposite';

    return `
      <div class="corr-item ${status}">
        <span class="corr-pair">${a}/${b}</span>
        <span class="corr-direction">${direction}</span>
        <span class="corr-note">${expected}</span>
      </div>
    `;
  }).join('');
}

// Render sector heatmap
function renderSectorHeatmap() {
  const container = document.getElementById('sectorHeatmap');
  const summaryEl = document.getElementById('sectorSummary');
  if (!container) return;

  // Get sector data with performance
  const sectors = DEFAULT_SECTORS.map(sector => {
    const data = macroData[sector.ticker];
    return {
      ...sector,
      changePercent: data?.changePercent || 0,
      price: data?.price || 0,
      hasData: !!data
    };
  }).sort((a, b) => b.changePercent - a.changePercent);

  // Calculate summary stats
  const validSectors = sectors.filter(s => s.hasData);
  const upCount = validSectors.filter(s => s.changePercent > 0).length;
  const avgChange = validSectors.length > 0
    ? validSectors.reduce((sum, s) => sum + s.changePercent, 0) / validSectors.length
    : 0;

  if (summaryEl && validSectors.length > 0) {
    const changeClass = avgChange >= 0 ? 'positive' : 'negative';
    summaryEl.innerHTML = `
      <span class="${changeClass}">${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
      <span class="sector-ratio">${upCount}/${validSectors.length} up</span>
    `;
  }

  // Find max absolute change for color scaling
  const maxAbsChange = Math.max(...sectors.map(s => Math.abs(s.changePercent)), 0.5);

  // Render heatmap tiles
  container.innerHTML = sectors.map(sector => {
    if (!sector.hasData) {
      return `
        <div class="heatmap-tile loading" style="flex: ${sector.weight}">
          <div class="heatmap-ticker">${sector.ticker}</div>
          <div class="heatmap-name">${sector.name}</div>
          <div class="heatmap-change">--</div>
        </div>
      `;
    }

    const isPositive = sector.changePercent > 0;
    const isNegative = sector.changePercent < 0;
    const intensity = Math.min(Math.abs(sector.changePercent) / maxAbsChange, 1);

    // Generate color based on performance
    let bgColor, textColor;
    if (isPositive) {
      // Green: base green that gets darker/richer with intensity
      const h = 142;
      const s = 60 + intensity * 30; // 60-90%
      const l = 42 - intensity * 17; // 42-25%
      bgColor = `hsl(${h}, ${s}%, ${l}%)`;
      textColor = '#fff';
    } else if (isNegative) {
      // Red: always clearly red, gets darker with intensity
      const h = 0;
      const s = 65 + intensity * 25; // 65-90%
      const l = 45 - intensity * 15; // 45-30%
      bgColor = `hsl(${h}, ${s}%, ${l}%)`;
      textColor = '#fff';
    } else {
      // Exactly zero - neutral gray
      bgColor = '#94a3b8';
      textColor = '#fff';
    }

    return `
      <div class="heatmap-tile"
           style="flex: ${sector.weight}; background: ${bgColor}; color: ${textColor}"
           onclick="window.macroAnalyzeTicker && macroAnalyzeTicker('${sector.ticker}')"
           data-ticker="${sector.ticker}">
        <div class="heatmap-ticker">${sector.ticker}</div>
        <div class="heatmap-name">${sector.name}</div>
        <div class="heatmap-change">${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}%</div>
      </div>
    `;
  }).join('');
}

// Render calendar date
function renderCalendarDate() {
  const dateEl = document.getElementById('calendarDate');
  if (dateEl) {
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }
}

// Render all sections
function renderAll() {
  renderRegimeBar();
  renderQuickMetrics();
  renderRotationMetrics();
  renderSectorHeatmap();
  renderIndices();
  renderBonds();
  renderCommodities();
  renderMag7();
  renderCorrelations();
  renderCalendarDate();
  loadCachedAiAnalysis();
}

// Show loading state
function showLoading() {
  const loadingHtml = '<div class="macro-loading">Loading...</div>';
  ['sectorHeatmap', 'indicesCards', 'bondsCards', 'commoditiesCards', 'mag7Cards'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = loadingHtml;
  });
}

// Start auto-refresh
function startAutoRefresh() {
  stopAutoRefresh();
  const interval = settings.refreshInterval || 60000;
  if (interval > 0) {
    refreshInterval = setInterval(async () => {
      await fetchAllMacroData();
      renderAll();
    }, interval);
  }
}

// Stop auto-refresh
function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Main loader function
export async function loadMacro() {
  console.log('loadMacro called');
  try {
    loadSettings();
    showLoading();
    await fetchAllMacroData();
    renderAll();
    // Fetch sparklines in background (don't block initial render)
    fetchRotationSparklines().then(() => {
      renderRotationMetrics(); // Re-render with sparklines
    });
    startAutoRefresh();
  } catch (e) {
    console.error('loadMacro error:', e);
    ['indicesCards', 'bondsCards', 'commoditiesCards', 'mag7Cards'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="macro-loading" style="color:#ef4444">Error: ${e.message}</div>`;
    });
  }
}

// Refresh macro data manually
export function refreshMacro() {
  showLoading();
  fetchAllMacroData().then(renderAll);
}

// Open settings modal
export function openMacroSettings() {
  const modal = document.getElementById('macroSettingsModal');
  if (modal) {
    modal.classList.add('active');
    document.getElementById('macroRefreshInterval').value = settings.refreshInterval || 60000;
    document.getElementById('customMag7').value = settings.mag7?.join(',') || '';
    document.getElementById('customIndices').value = settings.customIndices || '';
  }
}

// Close settings modal
export function closeMacroSettings() {
  const modal = document.getElementById('macroSettingsModal');
  if (modal) modal.classList.remove('active');
}

// Save settings from modal
export function saveMacroSettings(e) {
  e.preventDefault();
  settings.refreshInterval = parseInt(document.getElementById('macroRefreshInterval').value);
  const customMag7 = document.getElementById('customMag7').value.trim();
  settings.mag7 = customMag7 ? customMag7.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : null;
  settings.customIndices = document.getElementById('customIndices').value.trim();
  saveSettings();
  closeMacroSettings();
  startAutoRefresh();
  loadMacro();
}

// Fetch economic calendar via AI
export async function fetchEconomicCalendar() {
  const container = document.getElementById('calendarList');
  if (!container) return;

  container.innerHTML = '<div class="calendar-loading">Fetching events...</div>';

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 14); // Next 2 weeks

  const formatDate = (d) => d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const prompt = `List major US economic events, Fed speeches, and significant earnings from ${formatDate(today)} to ${formatDate(endDate)}.
Return ONLY a valid JSON array with NO markdown.
Format: [{"date":"Mon Jan 13","time":"8:30 AM ET","event":"Event Name","impact":"high"}]
impact: "high", "medium", or "low". Include date field for each event. Max 15 events, prioritize high impact. If none, return [].`;

  try {
    const response = await fetchClaude(prompt, true);
    let events = [];
    try {
      events = JSON.parse(response);
    } catch {
      const match = response.match(/\[[\s\S]*?\]/);
      if (match) events = JSON.parse(match[0]);
    }

    if (!Array.isArray(events) || events.length === 0) {
      container.innerHTML = '<div class="calendar-empty">No major events scheduled</div>';
      return;
    }

    // Group events by date
    const groupedEvents = {};
    events.forEach(e => {
      const date = e.date || 'Upcoming';
      if (!groupedEvents[date]) groupedEvents[date] = [];
      groupedEvents[date].push(e);
    });

    container.innerHTML = Object.entries(groupedEvents).map(([date, dayEvents]) => `
      <div class="calendar-date-group">
        <div class="calendar-date-header">${date}</div>
        ${dayEvents.map(e => `
          <div class="calendar-item impact-${e.impact || 'low'}">
            <span class="calendar-time">${e.time || '--'}</span>
            <span class="calendar-event">${e.event || 'Unknown'}</span>
            <span class="calendar-impact ${e.impact || 'low'}">${(e.impact || 'low').toUpperCase()}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `
      <div class="calendar-empty">
        <div class="calendar-note">Failed to fetch events</div>
        <button class="btn-secondary btn-sm" onclick="fetchEconomicCalendar()">Retry</button>
      </div>
    `;
  }
}

// Navigate to analyze page for a ticker
function macroAnalyzeTicker(ticker) {
  window.location.hash = `#analyze/${ticker}`;
}

// Toggle AI analysis section (collapsed class = hidden)
function toggleMacroAi() {
  const section = document.getElementById('macroAiSection');
  if (section) {
    section.classList.toggle('collapsed');
  }
}

// Generate AI macro analysis
async function generateMacroAnalysis() {
  const section = document.getElementById('macroAiSection');
  const container = document.getElementById('macroAiContent');
  const timeEl = document.getElementById('macroAiTime');
  const refreshBtn = document.querySelector('.macro-ai-refresh');
  if (!container) return;

  // Expand the section (remove collapsed class)
  if (section) section.classList.remove('collapsed');

  // Disable refresh button and show loading
  if (refreshBtn) refreshBtn.disabled = true;
  container.innerHTML = `
    <div class="macro-ai-loading">
      <div class="spinner"></div>
      <span>Analyzing cross-asset signals...</span>
    </div>
  `;

  // Build comprehensive market snapshot
  const buildMarketSnapshot = () => {
    const m = metrics;
    const lines = [];

    // Market regime
    lines.push(`MARKET REGIME: ${m.regime?.regime || 'N/A'} (Score: ${m.regime?.score || 0})`);
    lines.push(`Description: ${m.regime?.description || 'N/A'}`);
    lines.push('');

    // Core metrics
    lines.push('CORE SIGNALS:');
    lines.push(`- Yield Curve: ${m.yieldCurve?.signal} (${m.yieldCurve?.value?.toFixed(2)}%)`);
    lines.push(`- Risk Appetite (SPY-TLT): ${m.riskAppetite?.signal} (${m.riskAppetite?.value?.toFixed(2)}%)`);
    lines.push(`- Vol Regime (UVXY): ${m.volRegime?.signal} ($${m.volRegime?.value?.toFixed(1)}, ${m.volRegime?.change?.toFixed(1)}%)`);
    lines.push(`- Tech vs Value (QQQ-IWM): ${m.techValue?.signal} (${m.techValue?.value?.toFixed(2)}%)`);
    lines.push(`- Gold Signal: ${m.goldSignal?.signal} (${m.goldSignal?.value?.toFixed(2)}%)`);
    lines.push(`- Market Breadth: ${m.breadth?.signal} (${m.breadth?.value})`);
    lines.push('');

    // Rotation metrics
    lines.push('ROTATION & FLOW:');
    lines.push(`- Growth/Value (IWF-IWD): ${m.growthValue?.signal} (${m.growthValue?.value?.toFixed(2)}%)`);
    lines.push(`- Credit Spread (HYG-LQD): ${m.creditSpread?.signal} (${m.creditSpread?.value?.toFixed(2)}%)`);
    lines.push(`- Dollar: ${m.dollarStrength?.signal} (${m.dollarStrength?.value?.toFixed(2)}%)`);
    lines.push(`- EM Flow (EEM-SPY): ${m.emFlow?.signal} (${m.emFlow?.value?.toFixed(2)}%)`);
    lines.push(`- Defensive/Cyclical (XLP-XLY): ${m.defensiveRotation?.signal} (${m.defensiveRotation?.value?.toFixed(2)}%)`);
    lines.push(`- Large/Small Cap (SPY-IWM): ${m.qualitySpread?.signal} (${m.qualitySpread?.value?.toFixed(2)}%)`);
    lines.push('');

    // Indices
    lines.push('INDICES:');
    DEFAULT_INDICES.forEach(idx => {
      const d = macroData[idx.ticker];
      if (d) lines.push(`- ${idx.name} (${idx.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
    });
    const vix = macroData[DEFAULT_VIX.ticker];
    if (vix) lines.push(`- VIX (UVXY): $${vix.price?.toFixed(2)} (${vix.changePercent >= 0 ? '+' : ''}${vix.changePercent?.toFixed(2)}%)`);
    lines.push('');

    // Sectors
    lines.push('SECTOR PERFORMANCE (sorted by change):');
    const sectors = DEFAULT_SECTORS.map(s => ({
      ...s,
      changePercent: macroData[s.ticker]?.changePercent || 0
    })).sort((a, b) => b.changePercent - a.changePercent);
    sectors.forEach(s => {
      lines.push(`- ${s.name} (${s.ticker}): ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`);
    });
    lines.push('');

    // Bonds
    lines.push('BONDS:');
    DEFAULT_BONDS.forEach(b => {
      const d = macroData[b.ticker];
      if (d) lines.push(`- ${b.name} (${b.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
    });
    lines.push('');

    // Commodities
    lines.push('COMMODITIES:');
    DEFAULT_COMMODITIES.forEach(c => {
      const d = macroData[c.ticker];
      if (d) lines.push(`- ${c.name} (${c.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
    });

    return lines.join('\n');
  };

  const marketSnapshot = buildMarketSnapshot();
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const prompt = `Quick macro snapshot for ${today}:

${marketSnapshot}

Respond in EXACTLY this format (no markdown headers, no ##):

**REGIME**
One sentence: risk-on/off/rotation? What's driving it?

**KEY SIGNALS**
• First signal observation
• Second signal observation
• Third signal observation

**TRADE IDEAS**
• First trade idea
• Second trade idea

Rules:
- Use <span class="bullish">text</span> for bullish signals
- Use <span class="bearish">text</span> for bearish signals
- Use **bold** for emphasis
- Be direct and concise`;

  try {
    const response = await fetchClaude(prompt);

    // Parse sections from the response - handle multiple formats
    const sections = [];
    const sectionTitles = ['REGIME', 'KEY SIGNALS', 'TRADE IDEAS'];

    sectionTitles.forEach((title, i) => {
      // Match formats: "## REGIME", "1. **REGIME**", "**REGIME**", "REGIME:"
      const patterns = [
        new RegExp(`(?:^|\\n)#{1,3}\\s*${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i'),
        new RegExp(`\\d+\\.\\s*\\*\\*${title}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?=\\d+\\.\\s*\\*\\*|\\n#{1,3}|$)`, 'i'),
        new RegExp(`\\*\\*${title}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?=\\*\\*[A-Z]|\\n#{1,3}|$)`, 'i')
      ];

      for (const regex of patterns) {
        const match = response.match(regex);
        if (match && match[1]) {
          let content = match[1].trim();
          // Format content
          content = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^[-•]\s*/gm, '• ')
            .replace(/\n\n+/g, '<br><br>')
            .replace(/\n/g, '<br>');
          sections.push({ title, content });
          break;
        }
      }
    });

    // If parsing failed, use simple format with better markdown handling
    if (sections.length === 0) {
      let content = response
        .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')  // Convert ## headers to bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n+/g, '<br><br>')
        .replace(/\n/g, '<br>');
      sections.push({ title: 'MARKET ANALYSIS', content });
    }

    const timestamp = new Date().toLocaleTimeString();
    const dateStr = new Date().toLocaleDateString();

    const html = `
      <div class="macro-ai-box">
        ${sections.map(s => `
          <div class="macro-ai-section-block">
            <div class="macro-ai-section-title">${s.title}</div>
            <div class="macro-ai-section-content">${s.content}</div>
          </div>
        `).join('')}
      </div>
      <div class="macro-ai-timestamp">Generated ${dateStr} at ${timestamp}</div>
    `;

    container.innerHTML = html;

    // Update time in header
    if (timeEl) {
      timeEl.textContent = `${timestamp}`;
    }

    // Cache the result
    try {
      localStorage.setItem(AI_CACHE_KEY, JSON.stringify({
        html,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to cache AI analysis:', e);
    }

  } catch (e) {
    console.error('AI analysis error:', e);
    container.innerHTML = `
      <div class="macro-ai-empty">
        <p style="color: #f87171;">Failed to generate analysis: ${e.message}</p>
        <button class="btn-secondary btn-sm" onclick="generateMacroAnalysis()" style="margin-top: 12px;">Retry</button>
      </div>
    `;
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// Load cached AI analysis (pre-loads content but doesn't auto-show)
function loadCachedAiAnalysis() {
  try {
    const cached = localStorage.getItem(AI_CACHE_KEY);
    if (cached) {
      const { html, timestamp } = JSON.parse(cached);
      // Load cached content if less than 24 hours old
      const age = Date.now() - timestamp;
      if (age < 24 * 60 * 60 * 1000) {
        const container = document.getElementById('macroAiContent');
        const timeEl = document.getElementById('macroAiTime');
        if (container) {
          container.innerHTML = html;
        }
        // Show cached time
        if (timeEl) {
          const cachedDate = new Date(timestamp);
          timeEl.textContent = cachedDate.toLocaleTimeString();
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load cached AI analysis:', e);
  }
}

// Expose functions to window
window.refreshMacro = refreshMacro;
window.openMacroSettings = openMacroSettings;
window.closeMacroSettings = closeMacroSettings;
window.saveMacroSettings = saveMacroSettings;
window.fetchEconomicCalendar = fetchEconomicCalendar;
window.macroAnalyzeTicker = macroAnalyzeTicker;
window.toggleMacroAi = toggleMacroAi;
window.generateMacroAnalysis = generateMacroAnalysis;
