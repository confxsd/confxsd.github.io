// VHunter Strategy Page Module
// SIG Incentive Dashboard for tracking specific stocks

import { fetchTickerData, fetchClaude } from './api.js';
import { calculateMaxPain, formatNum, calculateHistoricalVolatility } from './utils.js';
import { analyzeGamma, formatGEX, buildGEXContext } from './gamma.js';
import { calcATR } from './indicators.js';

// ============================================
// STATE
// ============================================
const STORAGE_KEY = 'vhunter_focus_stocks';
let focusStocks = [];
let selectedTicker = null;
let strategyData = {};
let runCallback = null;

// ============================================
// INITIALIZATION
// ============================================
export function setRunCallback(callback) {
  runCallback = callback;
}

export async function loadStrategy() {
  loadFocusStocks();
  renderFocusTabs();

  // If we have stocks and none selected, select first one
  if (focusStocks.length > 0 && !selectedTicker) {
    selectFocusStock(focusStocks[0].ticker);
  }
}

// ============================================
// FOCUS STOCK MANAGEMENT
// ============================================
function loadFocusStocks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    focusStocks = stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to load focus stocks:', e);
    focusStocks = [];
  }
}

function saveFocusStocks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(focusStocks));
  } catch (e) {
    console.error('Failed to save focus stocks:', e);
  }
}

function renderFocusTabs() {
  const container = document.getElementById('focusTabs');
  const emptyState = document.getElementById('noFocusStocks');
  const dashboard = document.getElementById('sigDashboard');

  if (!container) return;

  if (focusStocks.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
    container.innerHTML = '<div class="empty-state-inline" id="noFocusStocks"><span>No focus stocks yet. Add one to start tracking.</span></div>';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = focusStocks.map(stock => `
    <div class="focus-tab ${stock.ticker === selectedTicker ? 'active' : ''}"
         onclick="selectFocusStock('${stock.ticker}')">
      <span>${stock.ticker}</span>
      <span class="focus-tab-remove" onclick="event.stopPropagation(); removeFocusStock('${stock.ticker}')">x</span>
    </div>
  `).join('');
}

window.selectFocusStock = selectFocusStock;
export async function selectFocusStock(ticker) {
  selectedTicker = ticker;
  renderFocusTabs();

  const dashboard = document.getElementById('sigDashboard');
  if (dashboard) dashboard.style.display = 'block';

  // Load thesis for this stock
  const stock = focusStocks.find(s => s.ticker === ticker);
  const thesisEl = document.getElementById('sigThesis');
  if (thesisEl && stock) {
    thesisEl.value = stock.thesis || '';
  }
  // Render thesis display
  renderThesisDisplay(stock?.thesis || '');
  toggleThesisEdit(false);

  // Show loading state
  updateLoadingState(true);

  // Fetch and display data
  try {
    const data = await fetchStrategyData(ticker);
    if (data) {
      strategyData[ticker] = data;
      updateSigDashboard(data);
    }
  } catch (e) {
    console.error('Failed to fetch strategy data:', e);
  }

  updateLoadingState(false);
}

window.removeFocusStock = removeFocusStock;
export function removeFocusStock(ticker) {
  focusStocks = focusStocks.filter(s => s.ticker !== ticker);
  saveFocusStocks();

  if (selectedTicker === ticker) {
    selectedTicker = focusStocks.length > 0 ? focusStocks[0].ticker : null;
    if (selectedTicker) {
      selectFocusStock(selectedTicker);
    } else {
      renderFocusTabs();
    }
  } else {
    renderFocusTabs();
  }
}

function updateLoadingState(loading) {
  const dashboard = document.getElementById('sigDashboard');
  if (!dashboard) return;

  if (loading) {
    dashboard.style.opacity = '0.5';
  } else {
    dashboard.style.opacity = '1';
  }
}

// ============================================
// DATA FETCHING
// ============================================
async function fetchStrategyData(ticker) {
  try {
    const { prev, aggs, options } = await fetchTickerData(ticker);

    if (!prev?.results?.[0]) return null;

    const spot = prev.results[0];
    const spotPrice = spot.c;
    const change = spot.todaysChange || (spot.c - spot.o);
    const changePct = spot.todaysChangePerc || ((spot.c - spot.o) / spot.o * 100);

    // Historical prices for ATR, RV calculations
    let prices = [];
    let hv30 = 0;
    let atr14 = 0;
    if (aggs?.results?.length > 0) {
      prices = aggs.results.map(d => d.c);

      // Calculate HV with safeguard for insufficient data
      if (prices.length > 1) {
        hv30 = calculateHistoricalVolatility(prices, Math.min(30, prices.length - 1));
      }

      // Calculate ATR from OHLC
      const atrData = aggs.results.map(d => ({ h: d.h, l: d.l, c: d.c }));
      const atrResult = calcATR(atrData, 14);

      // Find last non-null ATR value
      for (let i = atrResult.length - 1; i >= 0; i--) {
        if (atrResult[i] != null) {
          atr14 = atrResult[i];
          break;
        }
      }
    }

    // Gamma analysis
    const gammaAnalysis = analyzeGamma(options.all, spotPrice);

    // Max pain calculations
    const weeklyMaxPain = calculateMaxPain(options.weekly);
    const monthlyMaxPain = calculateMaxPain(options.monthly);
    const sixMonthMaxPain = calculateMaxPain(options.sixMonth);

    // Find best options for trade setups
    const nearestCall = findNearestOption(options.monthly, spotPrice, 'call', 1.02);
    const nearestPut = findNearestOption(options.monthly, spotPrice, 'put', 0.98);

    return {
      ticker,
      spotPrice,
      change,
      changePct,
      prices,
      hv30,
      atr14,
      gammaAnalysis,
      maxPain: {
        weekly: weeklyMaxPain,
        monthly: monthlyMaxPain,
        sixMonth: sixMonthMaxPain
      },
      options,
      nearestCall,
      nearestPut
    };
  } catch (e) {
    console.error(`Strategy data error for ${ticker}:`, e);
    return null;
  }
}

// Get option price with multiple fallbacks
function getOptionPrice(option) {
  if (!option) return 0;
  const quote = option.last_quote;
  if (quote?.midpoint && quote.midpoint > 0) return quote.midpoint;
  if (quote?.bid && quote?.ask) return (quote.bid + quote.ask) / 2;
  if (option.day?.close && option.day.close > 0) return option.day.close;
  if (option.day?.vwap && option.day.vwap > 0) return option.day.vwap;
  return 0;
}

function findNearestOption(optionsArray, spotPrice, type, targetRatio) {
  if (!optionsArray?.length) return null;

  const targetStrike = spotPrice * targetRatio;
  let nearest = null;
  let minDist = Infinity;

  // First pass: find option matching type closest to target
  optionsArray.forEach(o => {
    if (o.details?.contract_type !== type) return;
    const strike = o.details?.strike_price;
    if (!strike) return;

    const dist = Math.abs(strike - targetStrike);
    if (dist < minDist) {
      minDist = dist;
      nearest = o;
    }
  });

  // If not found, try any option of that type closest to spot
  if (!nearest) {
    minDist = Infinity;
    optionsArray.forEach(o => {
      if (o.details?.contract_type !== type) return;
      const strike = o.details?.strike_price;
      if (!strike) return;

      const dist = Math.abs(strike - spotPrice);
      if (dist < minDist) {
        minDist = dist;
        nearest = o;
      }
    });
  }

  return nearest;
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================
function updateSigDashboard(data) {
  if (!data) return;

  const { ticker, spotPrice, change = 0, changePct = 0, gammaAnalysis } = data;
  if (!ticker || !spotPrice) return;

  // Update header
  setText('sigTicker', ticker);
  setText('sigSpot', '$' + formatNum(spotPrice));

  const changeEl = document.getElementById('sigChange');
  if (changeEl) {
    const sign = change >= 0 ? '+' : '';
    const changeValue = typeof change === 'number' ? change.toFixed(2) : '0.00';
    const pctValue = typeof changePct === 'number' ? changePct.toFixed(2) : '0.00';
    changeEl.textContent = `${sign}$${changeValue} (${sign}${pctValue}%)`;
    changeEl.className = 'sig-change ' + (change >= 0 ? 'positive' : 'negative');
  }

  // Update regime
  const regimeEl = document.getElementById('sigRegime');
  if (regimeEl && gammaAnalysis?.regime) {
    const regime = gammaAnalysis.regime;
    regimeEl.textContent = regime.regime || 'UNKNOWN';
    regimeEl.className = 'sig-regime ' + getRegimeClass(regime.regime);
  }

  // Update GEX levels
  updateGexLevels(data);

  // Update max pain section
  updateMaxPainSection(data);

  // Generate and display alerts
  generateLevelAlerts(data);

  // Update position sizing with current data
  updatePositionSizingSuggestions(data);

  // Render GEX visual
  renderGexVisual(data);
}

function updateGexLevels(data) {
  const { spotPrice, gammaAnalysis } = data;
  if (!gammaAnalysis || gammaAnalysis.error) return;

  const levels = gammaAnalysis.levels || {};

  // Call Wall
  setText('sigCallWall', levels.callWall ? '$' + formatNum(levels.callWall) : '--');
  const callDist = levels.callWallDist ? (parseFloat(levels.callWallDist) >= 0 ? '+' : '') + levels.callWallDist + '%' : '--';
  setText('sigCallWallDist', callDist);

  // Zero Gamma
  setText('sigZeroGamma', levels.zeroGamma ? '$' + formatNum(levels.zeroGamma) : '--');
  setText('sigZeroGammaDist', levels.zeroGammaDist ? levels.zeroGammaDist + '%' : '--');

  // Put Wall
  setText('sigPutWall', levels.putWall ? '$' + formatNum(levels.putWall) : '--');
  const putDist = levels.putWallDist ? levels.putWallDist + '%' : '--';
  setText('sigPutWallDist', putDist);

  // Vol Trigger
  setText('sigVolTrigger', levels.volTrigger ? '$' + formatNum(levels.volTrigger) : '--');
  setText('sigVolTriggerDist', levels.volTriggerDist ? levels.volTriggerDist + '%' : '--');

  // Net GEX with label
  const netGexEl = document.getElementById('sigNetGex');
  if (netGexEl) netGexEl.textContent = 'Net GEX: ' + formatGEX(gammaAnalysis.netGEX);

  // Regime badge with styling
  const regimeEl = document.getElementById('sigGexRegime');
  if (regimeEl) {
    const regime = gammaAnalysis.regime?.regime || '--';
    regimeEl.textContent = regime.replace(/_/g, ' ');
    regimeEl.className = 'gex-regime-badge';
    if (regime.includes('POSITIVE')) regimeEl.classList.add('positive');
    else if (regime.includes('NEGATIVE')) regimeEl.classList.add('negative');
    else regimeEl.classList.add('neutral');
  }

  // Update zone labels with prices
  const putLabel = document.getElementById('gexPutLabel');
  const callLabel = document.getElementById('gexCallLabel');
  if (putLabel && levels.putWall) putLabel.textContent = '$' + formatNum(levels.putWall);
  if (callLabel && levels.callWall) callLabel.textContent = '$' + formatNum(levels.callWall);
}

function updateMaxPainSection(data) {
  const { spotPrice, gammaAnalysis, maxPain } = data;

  // Max Pain levels
  if (maxPain.weekly) {
    setText('sigMpWeekly', '$' + formatNum(maxPain.weekly));
    setText('sigMpWeeklyDist', ((maxPain.weekly - spotPrice) / spotPrice * 100).toFixed(2) + '%');
  }

  if (maxPain.monthly) {
    setText('sigMpMonthly', '$' + formatNum(maxPain.monthly));
    setText('sigMpMonthlyDist', ((maxPain.monthly - spotPrice) / spotPrice * 100).toFixed(2) + '%');
  }

  if (maxPain.sixMonth) {
    setText('sigMp6m', '$' + formatNum(maxPain.sixMonth));
    setText('sigMp6mDist', ((maxPain.sixMonth - spotPrice) / spotPrice * 100).toFixed(2) + '%');
  }

  // Dealer positioning
  if (gammaAnalysis?.deltaFlow) {
    const df = gammaAnalysis.deltaFlow;
    setText('sigDeltaFlow', `${df.direction || 'Neutral'} (${df.intensity || '--'})`);
  }

  if (gammaAnalysis?.charm) {
    const charm = gammaAnalysis.charm;
    setText('sigCharmPin', charm.pinningStrike ? '$' + formatNum(charm.pinningStrike) : '--');
  }

  // DEX Bias
  if (gammaAnalysis?.regime) {
    const regime = gammaAnalysis.regime;
    setText('sigDexBias', regime.tradingStyle || '--');
  }
}

function generateLevelAlerts(data) {
  const { spotPrice, gammaAnalysis, maxPain } = data;
  const alerts = [];
  const levels = gammaAnalysis?.levels || {};

  // Check proximity to call wall (approaching resistance)
  if (levels.callWall) {
    const dist = ((levels.callWall - spotPrice) / spotPrice * 100);
    if (dist > 0 && dist < 2) {
      alerts.push({ type: 'bearish', text: `Approaching Call Wall at $${formatNum(levels.callWall)} — expect resistance` });
    }
  }

  // Check proximity to put wall (approaching support)
  if (levels.putWall) {
    const dist = ((spotPrice - levels.putWall) / spotPrice * 100);
    if (dist > 0 && dist < 2) {
      alerts.push({ type: 'bullish', text: `Near Put Wall at $${formatNum(levels.putWall)} — support zone` });
    }
  }

  // Check if below vol trigger
  if (levels.volTrigger && spotPrice < levels.volTrigger) {
    alerts.push({ type: 'bearish', text: 'Below Vol Trigger — volatility expansion likely' });
  }

  // Check max pain proximity
  if (maxPain.weekly) {
    const dist = Math.abs((maxPain.weekly - spotPrice) / spotPrice * 100);
    if (dist < 1) {
      alerts.push({ type: '', text: `At Weekly Max Pain ($${formatNum(maxPain.weekly)}) — pinning expected` });
    }
  }

  // GEX regime alert
  if (gammaAnalysis?.regime?.regime === 'NEGATIVE_DEEP') {
    alerts.push({ type: 'bearish', text: 'Deep Negative Gamma — moves may accelerate' });
  } else if (gammaAnalysis?.regime?.regime === 'POSITIVE_DEEP') {
    alerts.push({ type: 'bullish', text: 'Deep Positive Gamma — mean reversion likely' });
  }

  // Render alerts
  const container = document.getElementById('sigAlerts');
  if (container) {
    container.innerHTML = alerts.length > 0
      ? alerts.map(a => `<div class="gex-alert ${a.type}">${a.text}</div>`).join('')
      : '';
  }
}

function updatePositionSizingSuggestions(data) {
  const { atr14, spotPrice } = data;
  const suggestions = document.getElementById('sizingSuggestions');

  if (suggestions && atr14 > 0) {
    const twoATR = atr14 * 2;
    suggestions.innerHTML = `
      <strong>ATR-Based Suggestion:</strong><br>
      2x ATR(14) = $${formatNum(twoATR)}<br>
      Suggested Stop: $${formatNum(spotPrice - twoATR)}<br>
      Use calculator with these values for position size
    `;
  }
}

function renderGexVisual(data) {
  // Update zone gauge marker position based on spot vs put/call walls
  const marker = document.getElementById('gexSpotMarker');
  if (!marker) return;

  const { spotPrice, gammaAnalysis } = data;
  const levels = gammaAnalysis?.levels || {};

  // Calculate position: 0% = put wall, 50% = zero gamma, 100% = call wall
  const putWall = levels.putWall || spotPrice * 0.95;
  const callWall = levels.callWall || spotPrice * 1.05;
  const range = callWall - putWall;

  if (range <= 0) {
    marker.style.left = '50%';
    return;
  }

  // Calculate percentage position
  let pct = ((spotPrice - putWall) / range) * 100;
  // Clamp between 5% and 95%
  pct = Math.max(5, Math.min(95, pct));
  marker.style.left = pct + '%';
}

// ============================================
// POSITION SIZING
// ============================================
window.calculatePositionSize = calculatePositionSize;
export function calculatePositionSize() {
  const accountSize = parseFloat(document.getElementById('psAccountSize')?.value) || 50000;
  const riskPct = parseFloat(document.getElementById('psRiskPct')?.value) || 2;
  const entry = parseFloat(document.getElementById('psEntry')?.value);
  const stop = parseFloat(document.getElementById('psStop')?.value);

  if (!entry || !stop || entry === stop) {
    alert('Please enter valid entry and stop prices');
    return;
  }

  const riskAmount = accountSize * (riskPct / 100);
  const stopDistance = Math.abs(entry - stop);
  const stopDistancePct = (stopDistance / entry) * 100;
  const shares = Math.floor(riskAmount / stopDistance);
  const positionValue = shares * entry;
  const pctOfAccount = (positionValue / accountSize) * 100;

  setText('psRiskAmount', '$' + formatNum(riskAmount));
  setText('psStopDistance', '$' + formatNum(stopDistance) + ' (' + stopDistancePct.toFixed(1) + '%)');
  setText('psShares', shares.toString());
  setText('psValue', '$' + formatNum(positionValue));
  setText('psPctAccount', pctOfAccount.toFixed(1) + '%');
}

// ============================================
// MODALS
// ============================================
window.openFocusStockModal = openFocusStockModal;
export function openFocusStockModal() {
  const modal = document.getElementById('focusStockModal');
  if (modal) modal.classList.add('active');

  // Clear form
  const tickerInput = document.getElementById('focusTicker');
  const thesisInput = document.getElementById('focusThesisInput');
  const fileInput = document.getElementById('focusThesisFile');
  if (tickerInput) tickerInput.value = '';
  if (thesisInput) thesisInput.value = '';
  if (fileInput) fileInput.value = '';
}

window.closeFocusStockModal = closeFocusStockModal;
export function closeFocusStockModal() {
  const modal = document.getElementById('focusStockModal');
  if (modal) modal.classList.remove('active');
}

window.saveFocusStock = saveFocusStock;
export function saveFocusStock(e) {
  e.preventDefault();

  const ticker = document.getElementById('focusTicker')?.value?.toUpperCase().trim();
  const thesis = document.getElementById('focusThesisInput')?.value?.trim() || '';

  if (!ticker) return;

  // Check if already exists
  const existing = focusStocks.find(s => s.ticker === ticker);
  if (existing) {
    existing.thesis = thesis;
    existing.lastUpdated = new Date().toISOString();
  } else {
    focusStocks.push({
      ticker,
      thesis,
      lastUpdated: new Date().toISOString()
    });
  }

  saveFocusStocks();
  closeFocusStockModal();
  renderFocusTabs();
  selectFocusStock(ticker);
}

window.saveStockThesis = saveStockThesis;
export function saveStockThesis() {
  if (!selectedTicker) return;

  const thesis = document.getElementById('sigThesis')?.value?.trim() || '';
  const stock = focusStocks.find(s => s.ticker === selectedTicker);

  if (stock) {
    stock.thesis = thesis;
    stock.lastUpdated = new Date().toISOString();
    saveFocusStocks();
    renderThesisDisplay(thesis);
    toggleThesisEdit(false);
  }
}

window.refreshAllFocusStocks = refreshAllFocusStocks;
export async function refreshAllFocusStocks() {
  if (selectedTicker) {
    await selectFocusStock(selectedTicker);
  }
}

// ============================================
// THESIS FILE HANDLING
// ============================================
window.handleThesisFileUpload = handleThesisFileUpload;
export function handleThesisFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;

    // Show preview
    const preview = document.getElementById('thesisFilePreview');
    if (preview) {
      const lines = content.split('\n').slice(0, 5).join('\n');
      preview.innerHTML = `<div class="file-loaded">Loaded: ${file.name}<br><small>${lines.substring(0, 200)}...</small></div>`;
    }

    // Also populate textarea
    const textarea = document.getElementById('focusThesisInput');
    if (textarea) textarea.value = content;
  };
  reader.readAsText(file);
}

window.handleThesisFileUpdate = handleThesisFileUpdate;
export function handleThesisFileUpdate(event) {
  const file = event.target.files[0];
  if (!file || !selectedTicker) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const stock = focusStocks.find(s => s.ticker === selectedTicker);

    if (stock) {
      stock.thesis = content;
      stock.lastUpdated = new Date().toISOString();
      saveFocusStocks();

      // Update UI
      renderThesisDisplay(content);
      const textarea = document.getElementById('sigThesis');
      if (textarea) textarea.value = content;
    }
  };
  reader.readAsText(file);
}

window.toggleThesisEdit = toggleThesisEdit;
export function toggleThesisEdit(show) {
  const textarea = document.getElementById('sigThesis');
  const saveBtn = document.getElementById('saveThesisBtn');
  const display = document.getElementById('thesisDisplay');

  // If show is undefined, toggle based on current state
  const shouldShow = show === undefined ? (textarea?.style.display === 'none') : show;

  if (textarea) textarea.style.display = shouldShow ? 'block' : 'none';
  if (saveBtn) saveBtn.style.display = shouldShow ? 'block' : 'none';
  if (display && shouldShow) display.style.display = 'none';
  if (display && !shouldShow) display.style.display = 'block';
}

function renderThesisDisplay(thesis) {
  const display = document.getElementById('thesisDisplay');
  if (!display) return;

  if (!thesis || thesis.trim() === '') {
    display.innerHTML = '<div class="thesis-empty">No thesis yet. Click Edit or Upload .md to add one.</div>';
    return;
  }

  // Simple markdown to HTML rendering
  let html = thesis
    // Headers
    .replace(/^### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^## (.*$)/gm, '<h3>$1</h3>')
    .replace(/^# (.*$)/gm, '<h2>$1</h2>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap lists
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

  display.innerHTML = `<div class="thesis-content"><p>${html}</p></div>`;
}

// ============================================
// AI STRATEGY GENERATION
// ============================================
window.generateAIStrategy = generateAIStrategy;
export async function generateAIStrategy() {
  if (!selectedTicker) {
    alert('Please select a focus stock first');
    return;
  }

  const data = strategyData[selectedTicker];
  const stock = focusStocks.find(s => s.ticker === selectedTicker);

  if (!data) {
    alert('No data available. Please wait for data to load.');
    return;
  }

  const statusEl = document.getElementById('aiStrategyStatus');
  const outputEl = document.getElementById('aiStrategyOutput');
  const cardsEl = document.getElementById('tradeCards');
  const detailsEl = document.getElementById('aiDetails');
  const btn = document.querySelector('#sec-ai-strategy .btn-ai');

  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Analyzing...';
  if (cardsEl) cardsEl.style.display = 'none';
  if (outputEl) outputEl.innerHTML = '<div class="ai-strategy-empty">Generating strategy...</div>';

  try {
    const prompt = buildStrategyPrompt(data, stock?.thesis || '');
    const response = await fetchClaude(prompt, true);

    // Parse JSON from response
    const parsed = parseAIResponse(response);

    // Render trade cards from JSON
    if (cardsEl && parsed.trades && parsed.trades.length > 0) {
      cardsEl.innerHTML = parsed.trades.map(renderTradeCard).join('');
      cardsEl.style.display = 'grid';
    }

    // Show analysis in collapsible
    if (outputEl) {
      outputEl.innerHTML = `<div class="ai-strategy-content">${formatAnalysis(parsed)}</div>`;
    }
    if (detailsEl && parsed.trades?.length > 0) {
      detailsEl.open = false;
    }

    if (statusEl) statusEl.textContent = new Date().toLocaleTimeString();
  } catch (e) {
    console.error('AI Strategy error:', e);
    if (outputEl) {
      outputEl.innerHTML = `<div class="ai-strategy-empty" style="color:#ef4444">Error: ${e.message}</div>`;
    }
    if (statusEl) statusEl.textContent = 'Error';
  }

  if (btn) btn.disabled = false;
}

// Parse JSON from AI response
function parseAIResponse(response) {
  try {
    // Try to extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                      response.match(/```\s*([\s\S]*?)\s*```/) ||
                      response.match(/(\{[\s\S]*\})/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return { analysis: response, trades: [] };
  } catch (e) {
    console.warn('Failed to parse JSON, using raw response:', e);
    return { analysis: response, trades: [] };
  }
}

// Format parsed analysis for display
function formatAnalysis(parsed) {
  let html = '';

  if (parsed.thesis_alignment) {
    html += `<div class="analysis-section"><strong>Thesis Alignment:</strong> ${parsed.thesis_alignment}</div>`;
  }

  if (parsed.key_levels) {
    html += `<div class="analysis-section"><strong>Key Levels:</strong><ul>`;
    if (parsed.key_levels.invalidation) html += `<li>Invalidation: $${parsed.key_levels.invalidation}</li>`;
    if (parsed.key_levels.add_zone) html += `<li>Add Zone: $${parsed.key_levels.add_zone}</li>`;
    if (parsed.key_levels.exit_trigger) html += `<li>Exit: ${parsed.key_levels.exit_trigger}</li>`;
    html += `</ul></div>`;
  }

  if (parsed.risk_notes) {
    html += `<div class="analysis-section"><strong>Risk Notes:</strong> ${parsed.risk_notes}</div>`;
  }

  if (parsed.analysis) {
    html += `<div class="analysis-section">${parsed.analysis}</div>`;
  }

  return html || '<div class="analysis-section">Analysis complete.</div>';
}


// Format price - handles both numbers and strings
function fmtPrice(val) {
  if (val == null) return '--';
  const num = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(num) ? val : '$' + num.toFixed(2);
}

// Render a single trade card
function renderTradeCard(trade) {
  const conviction = (trade.conviction || 'medium').toLowerCase();

  if (trade.isOption) {
    return `
      <div class="trade-card ${trade.type}">
        <div class="trade-card-header">
          <span class="trade-card-type">${trade.label}</span>
          <span class="trade-card-conviction ${conviction}">${conviction}</span>
        </div>
        <div class="trade-card-levels">
          <div class="trade-card-level">
            <span class="label">Strike</span>
            <span class="value">${fmtPrice(trade.strike)}</span>
          </div>
          <div class="trade-card-level">
            <span class="label">Expiry</span>
            <span class="value">${trade.expiry || '--'}</span>
          </div>
          <div class="trade-card-level">
            <span class="label">Cost</span>
            <span class="value">${fmtPrice(trade.cost)}</span>
          </div>
          <div class="trade-card-level">
            <span class="label">Breakeven</span>
            <span class="value target">${fmtPrice(trade.breakeven)}</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="trade-card ${trade.type}">
      <div class="trade-card-header">
        <span class="trade-card-type">${trade.label}</span>
        <span class="trade-card-conviction ${conviction}">${conviction}</span>
      </div>
      <div class="trade-card-levels">
        <div class="trade-card-level">
          <span class="label">Entry</span>
          <span class="value entry">${fmtPrice(trade.entry)}</span>
        </div>
        <div class="trade-card-level">
          <span class="label">Stop</span>
          <span class="value stop">${fmtPrice(trade.stop)}</span>
        </div>
        <div class="trade-card-level">
          <span class="label">Target</span>
          <span class="value target">${fmtPrice(trade.target)}</span>
        </div>
        <div class="trade-card-level">
          <span class="label">R:R</span>
          <span class="value rr">${trade.rr || '--'}</span>
        </div>
      </div>
      ${trade.rationale ? `<div class="trade-card-rationale">${trade.rationale}</div>` : ''}
    </div>
  `;
}

function buildStrategyPrompt(data, thesis) {
  const { ticker, spotPrice, change, changePct, gammaAnalysis, maxPain, atr14, hv30, options } = data;
  const levels = gammaAnalysis?.levels || {};
  const regime = gammaAnalysis?.regime || {};

  // Build GEX context
  const gexContext = buildGEXContext(gammaAnalysis);

  // Format change values accurately
  const changeVal = typeof change === 'number' ? change.toFixed(2) : '0.00';
  const changePctVal = typeof changePct === 'number' ? changePct.toFixed(2) : '0.00';

  // Build comprehensive options context with top contracts
  let optionsContext = buildOptionsContext(options, spotPrice);

  const prompt = `You are a professional quant trader analyzing ${ticker} for a focused trading strategy.

## USER'S THESIS & KNOWLEDGE
${thesis || 'No specific thesis provided - analyze based on technicals and flow only.'}

## CURRENT MARKET DATA (REAL-TIME)
- **Current Price**: $${spotPrice.toFixed(2)}
- **Day Change**: ${parseFloat(changeVal) >= 0 ? '+' : ''}$${changeVal} (${parseFloat(changePctVal) >= 0 ? '+' : ''}${changePctVal}%)
- **ATR(14)**: $${atr14 > 0 ? atr14.toFixed(2) : 'N/A'} (daily volatility)
- **HV(30d)**: ${hv30 > 0 ? hv30.toFixed(1) + '%' : 'N/A'} (realized vol)

## GAMMA EXPOSURE (SIG INCENTIVES)
${gexContext}

**Key Gamma Levels:**
- Call Wall (Resistance): ${levels.callWall ? '$' + levels.callWall.toFixed(2) + ' (' + levels.callWallDist + '% away)' : 'N/A'}
- Zero Gamma (Flip Level): ${levels.zeroGamma ? '$' + levels.zeroGamma.toFixed(2) + ' (' + levels.zeroGammaDist + '% away)' : 'N/A'}
- Put Wall (Support): ${levels.putWall ? '$' + levels.putWall.toFixed(2) + ' (' + levels.putWallDist + '% away)' : 'N/A'}
- Vol Trigger: ${levels.volTrigger ? '$' + levels.volTrigger.toFixed(2) + ' (' + levels.volTriggerDist + '% away)' : 'N/A'}

**Regime**: ${regime.regime || 'Unknown'} - ${regime.description || 'No description'}
**Trading Style**: ${regime.tradingStyle || 'Standard'}

## MAX PAIN LEVELS (Dealer Pinning Targets)
- Weekly Expiry: ${maxPain.weekly ? '$' + maxPain.weekly.toFixed(2) : 'N/A'}
- Monthly Expiry: ${maxPain.monthly ? '$' + maxPain.monthly.toFixed(2) : 'N/A'}
- 6-Month Expiry: ${maxPain.sixMonth ? '$' + maxPain.sixMonth.toFixed(2) : 'N/A'}

## OPTIONS CHAIN DATA
${optionsContext}

---

Analyze the data and respond with ONLY valid JSON (no markdown, no explanation outside JSON). Use this exact structure:

\`\`\`json
{
  "thesis_alignment": "Brief analysis of how gamma positioning supports/conflicts with user thesis",
  "trades": [
    {
      "type": "long",
      "label": "Long Stock",
      "entry": ${spotPrice.toFixed(2)},
      "stop": ${(spotPrice * 0.97).toFixed(2)},
      "target": ${(spotPrice * 1.05).toFixed(2)},
      "rr": "1:2.5",
      "conviction": "high",
      "rationale": "Brief reasoning"
    },
    {
      "type": "call",
      "label": "Buy Call",
      "strike": ${Math.round(spotPrice)},
      "expiry": "Jan 17",
      "cost": 200,
      "breakeven": ${(spotPrice * 1.02).toFixed(2)},
      "conviction": "medium",
      "isOption": true
    }
  ],
  "key_levels": {
    "invalidation": ${(spotPrice * 0.95).toFixed(2)},
    "add_zone": ${(spotPrice * 0.98).toFixed(2)},
    "exit_trigger": "Close below put wall"
  },
  "risk_notes": "Key risk factors and position sizing notes"
}
\`\`\`

RULES:
- "type" must be: "long", "short", "call", "put", or "spread"
- "conviction" must be: "high", "medium", or "low"
- Use actual numbers (no $ signs in JSON values)
- Include 1-3 trades based on opportunity
- Replace example values with YOUR analysis`;

  return prompt;
}

// Build comprehensive options context for AI
function buildOptionsContext(options, spotPrice) {
  if (!options) return 'No options data available';

  const allOpts = options.all || [];
  if (allOpts.length === 0) return 'No options data available';

  // Separate calls and puts, sort by OI
  const calls = allOpts.filter(o => o.details?.contract_type === 'call').sort((a, b) => (b.open_interest || 0) - (a.open_interest || 0));
  const puts = allOpts.filter(o => o.details?.contract_type === 'put').sort((a, b) => (b.open_interest || 0) - (a.open_interest || 0));

  let context = '';

  // Top calls by OI
  if (calls.length > 0) {
    context += '**Top Calls by Open Interest:**\n';
    calls.slice(0, 5).forEach(o => {
      const strike = o.details?.strike_price;
      const expiry = o.details?.expiration_date;
      const oi = o.open_interest || 0;
      const vol = o.day?.volume || 0;
      const price = getOptionPrice(o);
      const iv = o.implied_volatility ? (o.implied_volatility * 100).toFixed(0) + '%' : 'N/A';
      const delta = o.greeks?.delta ? o.greeks.delta.toFixed(2) : 'N/A';
      const distFromSpot = ((strike - spotPrice) / spotPrice * 100).toFixed(1);
      context += `- $${strike} ${expiry.slice(5)} | OI: ${oi.toLocaleString()} | Vol: ${vol.toLocaleString()} | Price: $${price.toFixed(2)} | IV: ${iv} | Delta: ${delta} | ${distFromSpot}% OTM\n`;
    });
  }

  // Top puts by OI
  if (puts.length > 0) {
    context += '\n**Top Puts by Open Interest:**\n';
    puts.slice(0, 5).forEach(o => {
      const strike = o.details?.strike_price;
      const expiry = o.details?.expiration_date;
      const oi = o.open_interest || 0;
      const vol = o.day?.volume || 0;
      const price = getOptionPrice(o);
      const iv = o.implied_volatility ? (o.implied_volatility * 100).toFixed(0) + '%' : 'N/A';
      const delta = o.greeks?.delta ? o.greeks.delta.toFixed(2) : 'N/A';
      const distFromSpot = ((spotPrice - strike) / spotPrice * 100).toFixed(1);
      context += `- $${strike} ${expiry.slice(5)} | OI: ${oi.toLocaleString()} | Vol: ${vol.toLocaleString()} | Price: $${price.toFixed(2)} | IV: ${iv} | Delta: ${delta} | ${distFromSpot}% OTM\n`;
    });
  }

  // ATM straddle estimate
  const atmCalls = calls.filter(o => Math.abs(o.details?.strike_price - spotPrice) / spotPrice < 0.03);
  const atmPuts = puts.filter(o => Math.abs(o.details?.strike_price - spotPrice) / spotPrice < 0.03);
  if (atmCalls.length > 0 && atmPuts.length > 0) {
    const atmCallPrice = getOptionPrice(atmCalls[0]);
    const atmPutPrice = getOptionPrice(atmPuts[0]);
    const straddleCost = atmCallPrice + atmPutPrice;
    const expectedMove = (straddleCost / spotPrice * 100).toFixed(1);
    context += `\n**ATM Straddle:** ~$${straddleCost.toFixed(2)} (Expected Move: ±${expectedMove}%)`;
  }

  // Put/Call OI ratio
  const totalCallOI = calls.reduce((sum, o) => sum + (o.open_interest || 0), 0);
  const totalPutOI = puts.reduce((sum, o) => sum + (o.open_interest || 0), 0);
  if (totalCallOI > 0) {
    const pcRatio = (totalPutOI / totalCallOI).toFixed(2);
    context += `\n**Put/Call OI Ratio:** ${pcRatio} (${parseFloat(pcRatio) > 1 ? 'Bearish bias' : parseFloat(pcRatio) < 0.7 ? 'Bullish bias' : 'Neutral'})`;
  }

  return context || 'Limited options data available';
}

// formatAIResponse removed - unused dead code

// ============================================
// HELPERS
// ============================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getRegimeClass(regime) {
  switch (regime) {
    case 'POSITIVE': return 'positive';
    case 'NEGATIVE': return 'negative';
    case 'NEGATIVE_DEEP': return 'deep-negative';
    default: return 'neutral';
  }
}
