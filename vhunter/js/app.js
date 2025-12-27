// VHunter Main Application
import { CONFIG } from './config.js';
import { fetchTickerData, fetchClaude, fetchNews, fetchTickerDetails, fetchPolygon } from './api.js';
import { initCharts, updateCharts } from './charts.js';
import * as indicators from './indicators.js';
import * as ui from './ui.js';
import { buildAnalysisPrompt, buildTradePrompt, buildPortfolioPrompt } from './prompts.js';
import * as db from './db.js';

let mktData = {};
let currentPage = 'analyze';
let positionsCache = { open: [], closed: [] };
let watchlistCache = [];
let notesCache = [];
let skipCache = false;

const HISTORY_KEY = 'vhunter_search_history';
const MAX_HISTORY = 10;

// ============================================
// ROUTING
// ============================================

function parseRoute() {
  const hash = window.location.hash.slice(1) || 'analyze';
  const [page, ticker] = hash.split('/');
  return { page: page || 'analyze', ticker: ticker || null };
}

function updateRoute(page, ticker = null) {
  const hash = ticker ? `${page}/${ticker}` : page;
  if (window.location.hash !== `#${hash}`) {
    history.pushState(null, '', `#${hash}`);
  }
}

window.addEventListener('hashchange', () => {
  const { page, ticker } = parseRoute();
  if (page !== currentPage) {
    switchPage(page, false); // false = don't update URL again
  }
  if (page === 'analyze' && ticker) {
    const currentTicker = ui.$('tk').value.toUpperCase().trim();
    if (ticker.toUpperCase() !== currentTicker) {
      ui.$('tk').value = ticker.toUpperCase();
      run();
    }
  }
});

// Search history functions
function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function addToHistory(ticker) {
  const history = getSearchHistory().filter(h => h.ticker !== ticker);
  history.unshift({ ticker, time: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  renderHistory();
}

function renderHistory() {
  const strip = document.getElementById('historyStrip');
  const stripMobile = document.getElementById('historyStripMobile');
  const history = getSearchHistory();
  const current = ui.$('tk').value.toUpperCase().trim();

  const html = history
    .filter(h => h.ticker !== current)
    .map(h => {
      const ago = formatTimeAgo(h.time);
      return `<div class="history-item" onclick="searchTicker('${h.ticker}')">
        <span class="ticker">${h.ticker}</span>
        <span class="time">${ago}</span>
      </div>`;
    })
    .join('');

  if (strip) strip.innerHTML = html;
  if (stripMobile) stripMobile.innerHTML = html;
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h';
  const days = Math.floor(hrs / 24);
  return days + 'd';
}

window.searchTicker = function(ticker) {
  ui.$('tk').value = ticker;
  run();
};

// Export data for Claude AI prompts
window.exportData = function() {
  if (!mktData.ticker) {
    alert('No data to export. Run analysis first.');
    return;
  }

  const d = mktData;
  const score = parseInt(ui.$('sc').textContent) || 0;
  const signal = ui.$('sg').textContent;

  // Compact format optimized for Claude prompts
  const exportText = `[${d.ticker}] $${d.price.toFixed(2)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(1)}%) | Score: ${score}/100 ${signal}
Vol: ${d.volume} (${d.rvol.toFixed(1)}x) | ATR: $${d.atr.toFixed(2)} | HV: ${d.vol.toFixed(0)}%
RSI: ${d.rsi.toFixed(0)} | MACD: ${d.macdH >= 0 ? '+' : ''}${d.macdH.toFixed(2)} | MFI: ${d.mfi.toFixed(0)} | ADX: ${d.adx.toFixed(0)} (+DI:${d.pdi.toFixed(0)}/-DI:${d.mdi.toFixed(0)})
BB%: ${d.bbPct}% | SMA20: $${d.sma20.toFixed(2)} | SMA50: $${d.sma50.toFixed(2)}
Flow: ${d.buyPct}% buy | A/D: ${d.adlTrend >= 0 ? '+' : ''}${d.adlTrend.toFixed(0)}% ${d.adlTrend >= 0 ? 'accum' : 'distr'}
Opts: C:${d.callVol} P:${d.putVol} | P/C: ${d.pcRatio.toFixed(2)} | MaxPain: $${d.maxPain}
Calls: ${d.topCalls} | Puts: ${d.topPuts}`;

  navigator.clipboard.writeText(exportText).then(() => {
    const btn = document.querySelector('.btn-export');
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = '';
    }, 1500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = exportText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('Data copied to clipboard!');
  });
};

// Toggle collapsible sections
window.toggleSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.toggle('collapsed');
    // Save state to localStorage
    const collapsed = JSON.parse(localStorage.getItem('vhunter_collapsed') || '{}');
    collapsed[sectionId] = section.classList.contains('collapsed');
    localStorage.setItem('vhunter_collapsed', JSON.stringify(collapsed));
  }
};

// Toggle mobile menu / history row
window.toggleMobileMenu = function() {
  const historyRow = document.getElementById('historyRow');
  const menuToggle = document.getElementById('menuToggle');
  if (historyRow) {
    historyRow.classList.toggle('show');
    menuToggle.textContent = historyRow.classList.contains('show') ? '✕' : '☰';
  }
};

// Restore collapsed section states
function restoreCollapsedSections() {
  const collapsed = JSON.parse(localStorage.getItem('vhunter_collapsed') || '{}');
  Object.entries(collapsed).forEach(([id, isCollapsed]) => {
    if (isCollapsed) {
      const section = document.getElementById(id);
      if (section) section.classList.add('collapsed');
    }
  });
}

// ============================================
// PAGE NAVIGATION
// ============================================

window.switchPage = function(page, shouldUpdateRoute = true) {
  currentPage = page;

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });

  // Toggle header elements visibility based on page
  const headerSearch = document.getElementById('headerSearch');
  const headerSignal = document.getElementById('headerSignal');
  const historyStrip = document.getElementById('historyStrip');

  if (page === 'analyze') {
    headerSearch.style.display = 'flex';
    headerSignal.style.display = 'flex';
    historyStrip.style.display = 'flex';
  } else {
    headerSearch.style.display = 'none';
    headerSignal.style.display = 'none';
    historyStrip.style.display = 'none';
  }

  // Update URL
  if (shouldUpdateRoute) {
    const ticker = page === 'analyze' ? ui.$('tk').value.toUpperCase().trim() : null;
    updateRoute(page, ticker || null);
  }

  // Load data for the page
  if (page === 'positions') loadPositions();
  else if (page === 'watchlist') loadWatchlist();
  else if (page === 'notes') loadNotes();

  // Close sidebar on mobile after navigation
  if (window.innerWidth <= 1024) {
    closeSidebar();
  }
};

window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
};

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ============================================
// POSITIONS
// ============================================

// Cache for current prices
let priceCache = {};
let optionPriceCache = {};

async function fetchCurrentPrice(ticker) {
  if (priceCache[ticker] && priceCache[ticker].time > Date.now() - 60000) {
    return priceCache[ticker].price;
  }
  try {
    const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/prev`);
    const price = data?.results?.[0]?.c || 0;
    priceCache[ticker] = { price, time: Date.now() };
    return price;
  } catch {
    return 0;
  }
}

function parseOptionFromNotes(notes) {
  // Parse "IONQ 23JAN26 49 P" format
  if (!notes) return null;
  const match = notes.match(/(\w+)\s+(\d+)([A-Z]+)(\d+)\s+(\d+(?:\.\d+)?)\s+([CP])/i);
  if (match) {
    const day = match[2].padStart(2, '0');
    const monthStr = match[3].toUpperCase();
    const year = match[4].length === 2 ? '20' + match[4] : match[4];
    const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
                     JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const month = months[monthStr] || '01';
    const expiry = `${year}-${month}-${day}`;
    return {
      ticker: match[1].toUpperCase(),
      expiry,
      expiryRaw: match[2] + match[3] + match[4],
      strike: parseFloat(match[5]),
      type: match[6].toUpperCase() === 'C' ? 'call' : 'put'
    };
  }
  return null;
}

function buildOptionTicker(optInfo) {
  // Build Polygon option ticker: O:IONQ250123P00049000
  // Format: O:{underlying}{YY}{MM}{DD}{C/P}{strike*1000 padded to 8 digits}
  const [year, month, day] = optInfo.expiry.split('-');
  const yy = year.slice(-2);
  const strikeStr = (optInfo.strike * 1000).toFixed(0).padStart(8, '0');
  const typeChar = optInfo.type === 'put' ? 'P' : 'C';
  return `O:${optInfo.ticker}${yy}${month}${day}${typeChar}${strikeStr}`;
}

async function fetchOptionPrice(optInfo) {
  const optionTicker = buildOptionTicker(optInfo);
  if (optionPriceCache[optionTicker] && optionPriceCache[optionTicker].time > Date.now() - 60000) {
    return optionPriceCache[optionTicker].price;
  }
  try {
    // Use snapshot endpoint for option price
    const data = await fetchPolygon(`/v3/snapshot/options/${optInfo.ticker}?contract_type=${optInfo.type}&expiration_date=${optInfo.expiry}&strike_price=${optInfo.strike}&limit=1`);
    const result = data?.results?.[0];
    // Get last trade price or use mid of bid/ask
    let price = 0;
    if (result?.day?.close) {
      price = result.day.close;
    } else if (result?.last_quote) {
      price = (result.last_quote.bid + result.last_quote.ask) / 2;
    } else if (result?.day?.last) {
      price = result.day.last;
    }
    optionPriceCache[optionTicker] = { price, time: Date.now() };
    return price;
  } catch (e) {
    console.error('Error fetching option price:', optionTicker, e);
    return 0;
  }
}

function calcUnrealizedPnL(position, currentPrice, optionPrice = null) {
  const qty = position.quantity;
  const entry = position.entry_price;
  const type = position.type;

  if (type === 'long') {
    return (currentPrice - entry) * qty;
  } else if (type === 'short') {
    return (entry - currentPrice) * qty;
  } else if ((type === 'put' || type === 'call') && optionPrice !== null) {
    // Use actual option price from Polygon
    return (optionPrice - entry) * qty * 100;
  }
  return 0;
}

async function loadPositions() {
  try {
    const [open, closed] = await Promise.all([
      db.getOpenPositions(),
      db.getClosedPositions()
    ]);

    positionsCache.open = Array.isArray(open) ? open : (open.data || []);
    positionsCache.closed = Array.isArray(closed) ? closed : (closed.data || []);

    // Parse option info for all positions
    const positionsWithInfo = positionsCache.open.map(p => ({
      ...p,
      optionInfo: parseOptionFromNotes(p.notes)
    }));

    // Fetch stock prices for stock positions and underlying for options
    const stockTickers = [...new Set(positionsWithInfo.map(p =>
      p.optionInfo ? p.optionInfo.ticker : p.ticker
    ))];
    await Promise.all(stockTickers.map(t => fetchCurrentPrice(t)));

    // Fetch option prices for option positions
    const optionPositions = positionsWithInfo.filter(p => p.optionInfo);
    const optionPrices = await Promise.all(
      optionPositions.map(p => fetchOptionPrice(p.optionInfo))
    );

    // Create map of option prices
    const optionPriceMap = {};
    optionPositions.forEach((p, i) => {
      const key = `${p.optionInfo.ticker}-${p.optionInfo.expiry}-${p.optionInfo.strike}-${p.optionInfo.type}`;
      optionPriceMap[key] = optionPrices[i];
    });

    // Enrich positions with prices and P&L
    positionsCache.open = positionsWithInfo.map(p => {
      const underlyingTicker = p.optionInfo ? p.optionInfo.ticker : p.ticker;
      const currentPrice = priceCache[underlyingTicker]?.price || 0;

      let optionPrice = null;
      if (p.optionInfo) {
        const key = `${p.optionInfo.ticker}-${p.optionInfo.expiry}-${p.optionInfo.strike}-${p.optionInfo.type}`;
        optionPrice = optionPriceMap[key] || 0;
      }

      const unrealizedPnL = calcUnrealizedPnL(p, currentPrice, optionPrice);
      return { ...p, currentPrice, optionPrice, unrealizedPnL };
    });

    renderPositions('open');
    renderPositions('closed');
    updatePositionStats();
  } catch (e) {
    console.error('Failed to load positions:', e);
  }
}

function renderPositions(status) {
  const container = document.getElementById(status === 'open' ? 'openPositions' : 'closedPositions');
  const positions = positionsCache[status];

  if (!positions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${status === 'open' ? '💼' : '📜'}</div>
        <div class="empty-text">No ${status} positions</div>
        ${status === 'open' ? '<div class="empty-hint">Click "+ New Position" to add one</div>' : ''}
      </div>
    `;
    return;
  }

  if (status === 'open') {
    // Compact table layout for open positions
    container.innerHTML = `
      <div class="positions-table">
        <div class="positions-header">
          <span class="col-ticker">Ticker</span>
          <span class="col-type">Type</span>
          <span class="col-qty">Qty</span>
          <span class="col-entry">Entry</span>
          <span class="col-current">Current</span>
          <span class="col-pnl">P&L</span>
          <span class="col-actions">Actions</span>
        </div>
        ${positions.map(p => {
          const pnl = p.unrealizedPnL || 0;
          const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
          const costBasis = p.type === 'long' || p.type === 'short'
            ? p.entry_price * p.quantity
            : p.entry_price * p.quantity * 100;
          const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
          const optInfo = p.optionInfo;
          const displayTicker = optInfo
            ? `${p.ticker} ${optInfo.strike}${optInfo.type === 'put' ? 'P' : 'C'}`
            : p.ticker;
          const expiryText = optInfo ? optInfo.expiryRaw : '';

          // Show option price for options, stock price for stocks
          const displayPrice = optInfo ? (p.optionPrice || 0) : (p.currentPrice || 0);

          return `
            <div class="position-row ${pnlClass}">
              <span class="col-ticker">
                <strong>${displayTicker}</strong>
                ${expiryText ? `<small>${expiryText}</small>` : ''}
              </span>
              <span class="col-type"><span class="type-badge ${p.type}">${p.type}</span></span>
              <span class="col-qty">${p.quantity}</span>
              <span class="col-entry">$${p.entry_price.toFixed(2)}</span>
              <span class="col-current">$${displayPrice.toFixed(2)}</span>
              <span class="col-pnl ${pnlClass}">
                <strong>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}</strong>
                <small>(${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(0)}%)</small>
              </span>
              <span class="col-actions">
                <button class="btn-icon btn-success" onclick="openClosePositionModal('${p.id}')" title="Close">✓</button>
                <button class="btn-icon" onclick="analyzePosition('${optInfo ? optInfo.ticker : p.ticker}')" title="Analyze">📊</button>
                <button class="btn-icon btn-danger" onclick="deletePosition('${p.id}')" title="Delete">✕</button>
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else {
    // Closed positions - simple list
    container.innerHTML = positions.map(p => {
      const pnlClass = p.pnl > 0 ? 'positive' : p.pnl < 0 ? 'negative' : '';
      const pnlText = p.pnl !== null ? (p.pnl >= 0 ? '+' : '') + '$' + p.pnl.toFixed(2) : '--';

      return `
        <div class="position-row-closed">
          <span class="ticker">${p.ticker}</span>
          <span class="type-badge ${p.type}">${p.type}</span>
          <span class="entry">$${p.entry_price.toFixed(2)} → $${(p.exit_price || 0).toFixed(2)}</span>
          <span class="pnl ${pnlClass}">${pnlText}</span>
          <button class="btn-icon btn-danger" onclick="deletePosition('${p.id}')" title="Delete">✕</button>
        </div>
      `;
    }).join('');
  }
}

function updatePositionStats() {
  const open = positionsCache.open || [];
  const closed = positionsCache.closed || [];

  document.getElementById('openCount').textContent = open.length;
  document.getElementById('closedCount').textContent = closed.length;

  // Calculate unrealized P&L from open positions
  const unrealizedPnl = open.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
  const unrealizedEl = document.getElementById('unrealizedPnl');
  if (unrealizedEl) {
    unrealizedEl.textContent = (unrealizedPnl >= 0 ? '+' : '') + '$' + unrealizedPnl.toFixed(0);
    unrealizedEl.className = 'stat-value ' + (unrealizedPnl > 0 ? 'positive' : unrealizedPnl < 0 ? 'negative' : '');
  }

  // Calculate realized P&L from closed positions
  const realizedPnl = closed.reduce((sum, p) => sum + (p.pnl || 0), 0);

  // Total P&L (unrealized + realized)
  const totalPnl = unrealizedPnl + realizedPnl;
  const pnlEl = document.getElementById('totalPnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(0);
  pnlEl.className = 'stat-value ' + (totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : '');

  const wins = closed.filter(p => p.pnl > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length * 100).toFixed(0) : '--';
  document.getElementById('winRate').textContent = winRate + '%';
}

window.switchPositionTab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === tab);
  });
  document.getElementById('openPositions').classList.toggle('hidden', tab !== 'open');
  document.getElementById('closedPositions').classList.toggle('hidden', tab !== 'closed');
};

window.openPositionModal = function(position = null) {
  document.getElementById('positionModalTitle').textContent = position ? 'Edit Position' : 'New Position';
  document.getElementById('positionId').value = position?.id || '';
  document.getElementById('posTicker').value = position?.ticker || ui.$('tk').value || '';
  document.getElementById('posType').value = position?.type || 'long';
  document.getElementById('posEntry').value = position?.entry_price || '';
  document.getElementById('posQty').value = position?.quantity || '';
  document.getElementById('posStop').value = position?.stop_loss || '';
  document.getElementById('posTarget').value = position?.take_profit || '';
  document.getElementById('posNotes').value = position?.notes || '';
  document.getElementById('positionModal').classList.add('active');
};

window.closePositionModal = function() {
  document.getElementById('positionModal').classList.remove('active');
  document.getElementById('positionForm').reset();
};

window.savePosition = async function(e) {
  e.preventDefault();

  const position = {
    ticker: document.getElementById('posTicker').value.toUpperCase(),
    type: document.getElementById('posType').value,
    entry_price: parseFloat(document.getElementById('posEntry').value),
    quantity: parseFloat(document.getElementById('posQty').value),
    stop_loss: parseFloat(document.getElementById('posStop').value) || null,
    take_profit: parseFloat(document.getElementById('posTarget').value) || null,
    notes: document.getElementById('posNotes').value || null
  };

  const id = document.getElementById('positionId').value;

  try {
    if (id) {
      await db.updatePosition(id, position);
    } else {
      await db.addPosition(position);
    }
    closePositionModal();
    loadPositions();
  } catch (e) {
    alert('Failed to save position: ' + e.message);
  }
};

window.openClosePositionModal = function(positionId) {
  document.getElementById('closePositionId').value = positionId;
  document.getElementById('exitPrice').value = '';
  document.getElementById('closePositionModal').classList.add('active');
};

window.closeCloseModal = function() {
  document.getElementById('closePositionModal').classList.remove('active');
};

window.confirmClosePosition = async function(e) {
  e.preventDefault();

  const id = document.getElementById('closePositionId').value;
  const exitPrice = parseFloat(document.getElementById('exitPrice').value);

  try {
    await db.closePosition(id, exitPrice);
    closeCloseModal();
    loadPositions();
  } catch (e) {
    alert('Failed to close position: ' + e.message);
  }
};

window.deletePosition = async function(id) {
  if (!confirm('Delete this position?')) return;

  try {
    await db.deletePosition(id);
    loadPositions();
  } catch (e) {
    alert('Failed to delete position: ' + e.message);
  }
};

window.analyzePosition = function(ticker) {
  ui.$('tk').value = ticker;
  switchPage('analyze');
  run();
};

// ============================================
// PORTFOLIO AI ANALYSIS
// ============================================

let portfolioMarketData = {};

window.analyzePortfolio = async function() {
  const positions = positionsCache.open;

  if (!positions.length) {
    alert('No open positions to analyze');
    return;
  }

  // Show AI insights section
  document.getElementById('aiInsightsSection').style.display = 'block';
  document.getElementById('portfolioAiStatus').textContent = 'analyzing...';

  // Reset displays
  document.getElementById('portfolioRiskScore').textContent = '...';
  document.getElementById('portfolioRiskScore').className = 'insight-score';
  document.getElementById('portfolioRiskDetail').textContent = 'Analyzing...';
  document.getElementById('thesisAlignment').textContent = '...';
  document.getElementById('thesisAlignment').className = 'insight-value';
  document.getElementById('thesisDetail').textContent = 'Evaluating...';
  document.getElementById('expiryAlert').textContent = '...';
  document.getElementById('expiryAlert').className = 'insight-value';
  document.getElementById('expiryDetail').textContent = 'Checking...';
  document.getElementById('portfolioAnalysis').textContent = 'Loading analysis...';
  document.getElementById('positionSignals').textContent = 'Evaluating positions...';
  document.getElementById('portfolioRecommendations').textContent = 'Generating recommendations...';

  try {
    // Fetch technical data for each unique ticker
    const uniqueTickers = [...new Set(positions.map(p =>
      p.optionInfo ? p.optionInfo.ticker : p.ticker
    ))];

    document.getElementById('portfolioAiStatus').textContent = `fetching data (${uniqueTickers.length} tickers)...`;

    // Fetch market data in parallel
    const marketDataPromises = uniqueTickers.map(async ticker => {
      try {
        const { aggs } = await fetchTickerData(ticker);
        if (aggs?.results?.length > 0) {
          const prices = aggs.results.map(d => d.c);
          const rsiValues = indicators.calcRSI(prices, 14);
          const macd = indicators.calcMACD(prices);
          const adxData = indicators.calcADX(aggs.results, 14);

          return {
            ticker,
            price: prices[prices.length - 1],
            rsi: rsiValues[rsiValues.length - 1],
            macdH: macd.histogram[macd.histogram.length - 1],
            adx: adxData.adx[adxData.adx.length - 1]
          };
        }
      } catch (e) {
        console.error(`Failed to fetch data for ${ticker}:`, e);
      }
      return { ticker, price: 0, rsi: 50, macdH: 0, adx: 0 };
    });

    const marketDataArray = await Promise.all(marketDataPromises);
    portfolioMarketData = {};
    marketDataArray.forEach(d => {
      portfolioMarketData[d.ticker] = d;
    });

    // Enrich positions with additional data
    const enrichedPositions = positions.map(p => {
      const underlyingTicker = p.optionInfo ? p.optionInfo.ticker : p.ticker;
      const displayPrice = p.optionInfo ? (p.optionPrice || 0) : (p.currentPrice || 0);
      const costBasis = p.type === 'long' || p.type === 'short'
        ? p.entry_price * p.quantity
        : p.entry_price * p.quantity * 100;

      let daysToExpiry = null;
      if (p.optionInfo?.expiry) {
        const expDate = new Date(p.optionInfo.expiry);
        const today = new Date();
        daysToExpiry = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      }

      return {
        ...p,
        underlyingTicker,
        displayPrice,
        costBasis,
        daysToExpiry
      };
    });

    // Calculate portfolio totals
    const totalUnrealized = enrichedPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const totalValue = enrichedPositions.reduce((sum, p) => sum + (p.costBasis || 0), 0);

    // Build portfolio data for AI
    const portfolioData = {
      positions: enrichedPositions,
      marketData: portfolioMarketData,
      totalUnrealized,
      totalValue
    };

    document.getElementById('portfolioAiStatus').textContent = 'thinking...';

    // Call Claude API
    const response = await fetchClaude(buildPortfolioPrompt(portfolioData), true);

    // Parse and display response
    parsePortfolioResponse(response);

    document.getElementById('portfolioAiStatus').textContent = 'done';

  } catch (e) {
    console.error('Portfolio analysis failed:', e);
    document.getElementById('portfolioAiStatus').textContent = 'error';
    document.getElementById('portfolioAnalysis').textContent = 'Analysis failed: ' + e.message;
  }
};

function parsePortfolioResponse(response) {
  // Parse structured response
  const riskScoreMatch = response.match(/\*\*RISK_SCORE:\*\*\s*(\d+)/);
  const riskLevelMatch = response.match(/\*\*RISK_LEVEL:\*\*\s*(LOW|MEDIUM|HIGH)/i);
  const thesisStatusMatch = response.match(/\*\*THESIS_STATUS:\*\*\s*(ALIGNED|PARTIAL|DIVERGENT)/i);
  const thesisDetailMatch = response.match(/\*\*THESIS_DETAIL:\*\*\s*(.+?)(?=\n\*\*|$)/s);
  const expiryStatusMatch = response.match(/\*\*EXPIRY_STATUS:\*\*\s*(SAFE|WARNING|URGENT)/i);
  const expiryDetailMatch = response.match(/\*\*EXPIRY_DETAIL:\*\*\s*(.+?)(?=\n\*\*|$)/s);
  const analysisMatch = response.match(/\*\*PORTFOLIO_ANALYSIS:\*\*\s*([\s\S]+?)(?=\n\*\*POSITION_SIGNALS|$)/);
  const signalsMatch = response.match(/\*\*POSITION_SIGNALS:\*\*\s*([\s\S]+?)(?=\n\*\*RECOMMENDATIONS|$)/);
  const recsMatch = response.match(/\*\*RECOMMENDATIONS:\*\*\s*([\s\S]+?)$/);

  // Update Risk Score
  if (riskScoreMatch) {
    const score = parseInt(riskScoreMatch[1]);
    const scoreEl = document.getElementById('portfolioRiskScore');
    scoreEl.textContent = score;
    scoreEl.className = 'insight-score ' + (score <= 3 ? 'low' : score <= 6 ? 'medium' : 'high');
  }

  // Update Risk Level
  if (riskLevelMatch) {
    const level = riskLevelMatch[1].toUpperCase();
    document.getElementById('portfolioRiskDetail').textContent = level + ' RISK';
  }

  // Update Thesis Alignment
  if (thesisStatusMatch) {
    const status = thesisStatusMatch[1].toUpperCase();
    const thesisEl = document.getElementById('thesisAlignment');
    thesisEl.textContent = status;
    thesisEl.className = 'insight-value ' + status.toLowerCase();
  }
  if (thesisDetailMatch) {
    document.getElementById('thesisDetail').textContent = thesisDetailMatch[1].trim();
  }

  // Update Expiry Alert
  if (expiryStatusMatch) {
    const status = expiryStatusMatch[1].toUpperCase();
    const expiryEl = document.getElementById('expiryAlert');
    expiryEl.textContent = status;
    expiryEl.className = 'insight-value ' + status.toLowerCase();
  }
  if (expiryDetailMatch) {
    document.getElementById('expiryDetail').textContent = expiryDetailMatch[1].trim();
  }

  // Update Analysis sections
  if (analysisMatch) {
    document.getElementById('portfolioAnalysis').textContent = analysisMatch[1].trim();
  }

  if (signalsMatch) {
    // Format position signals with color coding
    let signalsHtml = signalsMatch[1].trim();
    signalsHtml = signalsHtml.replace(/TAKE_PROFIT/g, '<span class="signal-take">TAKE PROFIT</span>');
    signalsHtml = signalsHtml.replace(/HOLD/g, '<span class="signal-hold">HOLD</span>');
    signalsHtml = signalsHtml.replace(/CUT_LOSS/g, '<span class="signal-cut">CUT LOSS</span>');
    signalsHtml = signalsHtml.replace(/ADD/g, '<span class="signal-add">ADD</span>');
    document.getElementById('positionSignals').innerHTML = signalsHtml;
  }

  if (recsMatch) {
    document.getElementById('portfolioRecommendations').textContent = recsMatch[1].trim();
  }
}

window.hideAiInsights = function() {
  document.getElementById('aiInsightsSection').style.display = 'none';
};

// ============================================
// WATCHLIST
// ============================================

async function loadWatchlist() {
  try {
    const result = await db.getWatchlist();
    watchlistCache = Array.isArray(result) ? result : (result.data || []);
    renderWatchlist();
  } catch (e) {
    console.error('Failed to load watchlist:', e);
  }
}

function renderWatchlist() {
  const container = document.getElementById('watchlistItems');

  if (!watchlistCache.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👁</div>
        <div class="empty-text">Your watchlist is empty</div>
        <div class="empty-hint">Add tickers to track</div>
      </div>
    `;
    return;
  }

  container.innerHTML = watchlistCache.map(w => `
    <div class="watchlist-card">
      <div class="watchlist-ticker">
        <span>${w.ticker}</span>
        <button class="btn-secondary btn-sm" onclick="analyzeWatchlistItem('${w.ticker}')">📊</button>
      </div>
      ${w.alert_above || w.alert_below ? `
        <div class="watchlist-alerts">
          ${w.alert_above ? `<span>▲ $${w.alert_above}</span>` : ''}
          ${w.alert_below ? `<span>▼ $${w.alert_below}</span>` : ''}
        </div>
      ` : ''}
      ${w.notes ? `<div class="watchlist-notes">${w.notes}</div>` : ''}
      <div class="watchlist-actions">
        <button class="btn-secondary btn-sm btn-danger" onclick="removeWatchlistItem('${w.id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

window.openWatchlistModal = function() {
  document.getElementById('watchTicker').value = ui.$('tk').value || '';
  document.getElementById('watchAbove').value = '';
  document.getElementById('watchBelow').value = '';
  document.getElementById('watchNotes').value = '';
  document.getElementById('watchlistModal').classList.add('active');
};

window.closeWatchlistModal = function() {
  document.getElementById('watchlistModal').classList.remove('active');
};

window.saveWatchlistItem = async function(e) {
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
};

window.removeWatchlistItem = async function(id) {
  try {
    await db.removeFromWatchlist(id);
    loadWatchlist();
  } catch (e) {
    alert('Failed to remove from watchlist: ' + e.message);
  }
};

window.analyzeWatchlistItem = function(ticker) {
  ui.$('tk').value = ticker;
  switchPage('analyze');
  run();
};

// ============================================
// NOTES
// ============================================

async function loadNotes() {
  try {
    const result = await db.getNotes();
    notesCache = Array.isArray(result) ? result : (result.data || []);
    renderNotes();
  } catch (e) {
    console.error('Failed to load notes:', e);
  }
}

function renderNotes() {
  const container = document.getElementById('notesList');

  if (!notesCache.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">No notes yet</div>
        <div class="empty-hint">Capture your trading ideas</div>
      </div>
    `;
    return;
  }

  container.innerHTML = notesCache.map(n => {
    const date = new Date(n.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const tags = n.tags ? n.tags.split(',').map(t => t.trim()).filter(t => t) : [];

    return `
      <div class="note-card">
        <div class="note-header">
          <span class="note-ticker">${n.ticker}</span>
          <span class="note-date">${date}</span>
        </div>
        <div class="note-content">${n.content}</div>
        ${tags.length ? `
          <div class="note-tags">
            ${tags.map(t => `<span class="note-tag">${t}</span>`).join('')}
          </div>
        ` : ''}
        <div class="note-actions">
          <button class="btn-secondary btn-sm" onclick="editNote('${n.id}')">Edit</button>
          <button class="btn-secondary btn-sm" onclick="analyzeNoteTicker('${n.ticker}')">Analyze</button>
          <button class="btn-secondary btn-sm btn-danger" onclick="deleteNote('${n.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openNoteModal = function(note = null) {
  document.getElementById('noteModalTitle').textContent = note ? 'Edit Note' : 'New Note';
  document.getElementById('noteId').value = note?.id || '';
  document.getElementById('noteTicker').value = note?.ticker || ui.$('tk').value || '';
  document.getElementById('noteTags').value = note?.tags || '';
  document.getElementById('noteContent').value = note?.content || '';
  document.getElementById('noteModal').classList.add('active');
};

window.closeNoteModal = function() {
  document.getElementById('noteModal').classList.remove('active');
};

window.saveNote = async function(e) {
  e.preventDefault();

  const note = {
    ticker: document.getElementById('noteTicker').value.toUpperCase(),
    tags: document.getElementById('noteTags').value || null,
    content: document.getElementById('noteContent').value
  };

  const id = document.getElementById('noteId').value;

  try {
    if (id) {
      await db.updateNote(id, note.content, note.tags);
    } else {
      await db.addNote(note);
    }
    closeNoteModal();
    loadNotes();
  } catch (e) {
    alert('Failed to save note: ' + e.message);
  }
};

window.editNote = function(id) {
  const note = notesCache.find(n => n.id === id);
  if (note) openNoteModal(note);
};

window.deleteNote = async function(id) {
  if (!confirm('Delete this note?')) return;

  try {
    await db.deleteNote(id);
    loadNotes();
  } catch (e) {
    alert('Failed to delete note: ' + e.message);
  }
};

window.analyzeNoteTicker = function(ticker) {
  ui.$('tk').value = ticker;
  switchPage('analyze');
  run();
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  ui.$('tm').textContent = new Date().toLocaleString();
  initCharts();
  renderHistory();
  restoreCollapsedSections();

  // Handle initial route
  const { page, ticker } = parseRoute();
  if (ticker) {
    ui.$('tk').value = ticker.toUpperCase();
  }
  switchPage(page, false);
  run();
});

// Share current analysis URL
window.shareAnalysis = function() {
  const ticker = ui.$('tk').value.toUpperCase().trim();
  if (!ticker) {
    alert('No ticker to share. Run analysis first.');
    return;
  }

  const url = `${window.location.origin}${window.location.pathname}#analyze/${ticker}`;

  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.btn-share');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = '';
    }, 1500);
  }).catch(() => {
    // Fallback
    prompt('Copy this URL:', url);
  });
};

// Enter key handler
document.getElementById('tk').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') run();
});

// Expose run to window for button onclick
window.run = run;

async function run(forceRefresh = false) {
  skipCache = forceRefresh;
  const ticker = ui.$('tk').value.toUpperCase().trim();
  if (!ticker) return;

  ui.setStatus('...');
  ui.hideError();

  try {
    const { prev, aggs, options } = await fetchTickerData(ticker);

    if (!prev || !aggs) {
      ui.setStatus('');
      return;
    }

    // Update URL with ticker
    updateRoute('analyze', ticker);

    addToHistory(ticker);

    if (prev.results?.[0]) {
      ui.updateCurrentPrice(prev.results[0]);
    }

    if (aggs.results?.length > 0) {
      processHistoricalData(ticker, aggs.results);
    }

    processOptionsData(options, aggs.results?.[aggs.results.length - 1]?.c || 0);

    // Fetch news in background
    loadNews(ticker);

    ui.setStatus('');
  } catch (e) {
    ui.showError(e.message);
    ui.setStatus('');
  }
}

function processHistoricalData(ticker, data) {
  const prices = data.map(d => d.c);
  const highs = data.map(d => d.h);
  const lows = data.map(d => d.l);
  const volumes = data.map(d => d.v);
  const currentPrice = prices[prices.length - 1];
  const lastBar = data[data.length - 1];

  // Calculate indicators
  const sma20 = indicators.average(prices.slice(-20));
  const sma50 = prices.length >= 50 ? indicators.average(prices.slice(-50)) : sma20;
  const rsiValues = indicators.calcRSI(prices, 14);
  const rsi = rsiValues[rsiValues.length - 1];
  const atrValues = indicators.calcATR(data, 14);
  const atr = atrValues[atrValues.length - 1];
  const mfiValues = indicators.calcMFI(data, 14);
  const mfi = mfiValues[mfiValues.length - 1];
  const adxData = indicators.calcADX(data, 14);
  const adx = adxData.adx[adxData.adx.length - 1];
  const macd = indicators.calcMACD(prices);
  const macdH = macd.histogram[macd.histogram.length - 1];
  const bb = indicators.calcBollingerBands(prices);
  const adl = indicators.calcADL(data);
  const sma20Arr = indicators.calcSMA(prices, 20);
  const sma50Arr = indicators.calcSMA(prices, 50);

  // Calculate volatility
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const avgReturn = indicators.average(returns);
  const vol = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length) * Math.sqrt(252) * 100;

  // Relative volume
  const avgVol = indicators.average(volumes.slice(-20));
  const rvol = lastBar.v / avgVol;

  // Bollinger %B
  const bbStd = Math.sqrt(prices.slice(-20).reduce((s, x) => s + Math.pow(x - sma20, 2), 0) / 20);
  const bbUpper = sma20 + 2 * bbStd;
  const bbLower = sma20 - 2 * bbStd;
  const bbPct = ((currentPrice - bbLower) / (bbUpper - bbLower) * 100).toFixed(0);

  // VWAP (simplified)
  const vwap = (lastBar.h + lastBar.l + lastBar.c) / 3;
  const vwapDiff = ((currentPrice - vwap) / vwap * 100).toFixed(1);

  // Volume trend
  const recentVol = indicators.average(volumes.slice(-5));
  const olderVol = indicators.average(volumes.slice(-20, -5));
  const volTrend = ((recentVol - olderVol) / olderVol * 100).toFixed(0);

  // SMA signal
  const smaSignal = currentPrice > sma20 && sma20 > sma50 ? 'Bull' :
    currentPrice < sma20 && sma20 < sma50 ? 'Bear' : 'Mix';

  // Pivots
  const pivot = (lastBar.h + lastBar.l + lastBar.c) / 3;
  const pivots = {
    pivot,
    r1: 2 * pivot - lastBar.l,
    r2: pivot + (lastBar.h - lastBar.l),
    s1: 2 * pivot - lastBar.h,
    s2: pivot - (lastBar.h - lastBar.l)
  };

  // Money flow
  const upDays = data.slice(-20).filter(d => d.c > d.o);
  const downDays = data.slice(-20).filter(d => d.c <= d.o);
  const buyVol = upDays.reduce((s, d) => s + d.v, 0);
  const sellVol = downDays.reduce((s, d) => s + d.v, 0);
  const buyPct = parseInt((buyVol / (buyVol + sellVol) * 100).toFixed(0));
  const netFlow = buyVol - sellVol;

  // A/D Line change
  const adlChange = ((adl[adl.length - 1] - adl[adl.length - 10]) / Math.abs(adl[adl.length - 10]) * 100);

  // Risk levels
  const stop = currentPrice - 2 * atr;
  const target = currentPrice + 4 * atr;
  const riskPct = ((currentPrice - stop) / currentPrice * 100);

  // 52W range
  const range52w = '$' + Math.min(...lows).toFixed(0) + '-$' + Math.max(...highs).toFixed(0);

  // Score calculation
  let score = 50;
  if (rsi < 30) score += 15;
  else if (rsi > 70) score -= 15;
  score += macdH > 0 ? 10 : -10;
  if (smaSignal === 'Bull') score += 10;
  else if (smaSignal === 'Bear') score -= 10;
  if (parseInt(bbPct) < 20) score += 10;
  else if (parseInt(bbPct) > 80) score -= 10;
  if (buyPct > 60) score += 5;
  else if (buyPct < 40) score -= 5;
  score = Math.max(0, Math.min(100, score));

  // Update UI
  ui.updateScore(score);
  ui.updateIndicators({ rsi, macdH, smaSignal, bbPct, vwapDiff, volTrend });
  ui.updateKeyStats({
    rsi, mfi, atr, adx, rvol, sma20, sma50, pivots, range52w, stop, target, riskPct
  });
  ui.updateMoneyFlow({ buyPct, netFlow, adlChange });

  // Status bar
  ui.updateStatusBar(
    adx > 40 ? { label: 'STRONG', color: 'g', detail: 'ADX>40' } :
      adx > 25 ? { label: 'MOD', color: 'y', detail: '25-40' } :
        { label: 'WEAK', color: 'r', detail: '<25' },
    rsi > 70 ? { label: 'OB', color: 'r', detail: 'RSI>70' } :
      rsi < 30 ? { label: 'OS', color: 'g', detail: '<30' } :
        rsi > 50 ? { label: 'BULL', color: 'g', detail: '50-70' } :
          { label: 'BEAR', color: 'r', detail: '30-50' },
    rvol > 2 ? { label: 'EXT', color: 'p', detail: '>2x' } :
      rvol > 1.3 ? { label: 'HIGH', color: 'g', detail: '>1.3x' } :
        rvol < 0.7 ? { label: 'LOW', color: 'r', detail: '<0.7x' } :
          { label: 'NORM', color: '', detail: '~1x' },
    vol > 60 ? { label: 'EXT', color: 'r', detail: '>60%' } :
      vol > 40 ? { label: 'HIGH', color: 'y', detail: '40-60' } :
        vol > 20 ? { label: 'NORM', color: '', detail: '20-40' } :
          { label: 'LOW', color: 'g', detail: '<20%' }
  );

  // Performance
  if (prices.length >= 2) ui.setPerformance('d1', currentPrice, prices[prices.length - 2]);
  if (prices.length >= 6) ui.setPerformance('w1', currentPrice, prices[prices.length - 6]);
  if (prices.length >= 23) ui.setPerformance('m1', currentPrice, prices[prices.length - 23]);

  // Store for AI
  mktData = {
    ticker,
    price: currentPrice,
    change: ((currentPrice - data[data.length - 2].c) / data[data.length - 2].c) * 100,
    volume: ui.formatNumber(lastBar.v),
    rvol,
    rsi,
    macdH,
    adx,
    pdi: adxData.pdi[adxData.pdi.length - 1] || 0,
    mdi: adxData.mdi[adxData.mdi.length - 1] || 0,
    bbPct,
    mfi,
    atr,
    sma20,
    sma50,
    buyPct,
    adlTrend: adlChange,
    vol
  };

  // Update charts
  const labels = data.map(d => new Date(d.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  updateCharts({
    labels,
    prices,
    volumes,
    bars: data,
    rsi: rsiValues,
    macd,
    adxData,
    bb,
    mfi: mfiValues,
    adl,
    atr: atrValues,
    sma20: sma20Arr,
    sma50: sma50Arr
  });
}

function processOptionsData(options, spotPrice) {
  if (!options?.all?.length || !spotPrice) {
    ui.updateOptions(null);
    mktData.callVol = '0';
    mktData.putVol = '0';
    mktData.pcRatio = 1;
    mktData.topCalls = 'N/A';
    mktData.topPuts = 'N/A';
    mktData.maxPain = 'N/A';
    if (mktData.price) callAI();
    return;
  }

  const allOptions = options.all;

  // Filter to near-the-money options (within 15% of spot) for display
  const nearMoney = allOptions.filter(o => {
    const strike = o.details?.strike_price;
    if (!strike) return false;
    const pctFromSpot = Math.abs(strike - spotPrice) / spotPrice;
    return pctFromSpot < 0.15;
  });

  let callVol = 0, putVol = 0, callOI = 0, putOI = 0, ivSum = 0, ivCount = 0;
  const calls = [], puts = [];

  // Process all options for totals
  allOptions.forEach(o => {
    const details = o.details;
    const day = o.day;
    if (!details || !day) return;

    const vol = day.volume || 0;
    const oi = o.open_interest || 0;  // OI is at top level

    if (details.contract_type === 'call') {
      callVol += vol;
      callOI += oi;
    } else {
      putVol += vol;
      putOI += oi;
    }

    if (o.implied_volatility) {
      ivSum += o.implied_volatility;
      ivCount++;
    }
  });

  // Get top strikes from near-money options only
  nearMoney.forEach(o => {
    const details = o.details;
    const day = o.day;
    if (!details || !day) return;

    const vol = day.volume || 0;
    if (vol > 10) {
      if (details.contract_type === 'call') {
        calls.push({ strike: details.strike_price, volume: vol, oi: o.open_interest || 0 });
      } else {
        puts.push({ strike: details.strike_price, volume: vol, oi: o.open_interest || 0 });
      }
    }
  });

  const pcRatio = putVol / (callVol || 1);
  const avgIV = ivCount > 0 ? (ivSum / ivCount * 100) : 0;

  // Calculate TRUE max pain for each timeframe
  // Max pain = strike where total payout to option holders is MINIMIZED
  const weeklyMaxPain = calculateMaxPain(options.weekly);
  const monthlyMaxPain = calculateMaxPain(options.monthly);
  const sixMonthMaxPain = calculateMaxPain(options.sixMonth);

  // Expected move (using 30-day IV)
  const expMove = (spotPrice * (avgIV / 100) * Math.sqrt(30 / 365)).toFixed(2);
  ui.$('eM').textContent = '±$' + expMove;

  calls.sort((a, b) => b.volume - a.volume);
  puts.sort((a, b) => b.volume - a.volume);

  ui.updateOptions({
    callVol,
    putVol,
    pcRatio,
    avgIV,
    maxPain: { weekly: weeklyMaxPain, monthly: monthlyMaxPain, sixMonth: sixMonthMaxPain },
    topCalls: calls.slice(0, 3),
    topPuts: puts.slice(0, 3),
    pcOI: putOI / (callOI || 1),
    spotPrice
  });

  // Store for AI
  mktData.callVol = ui.formatNumber(callVol);
  mktData.putVol = ui.formatNumber(putVol);
  mktData.pcRatio = pcRatio;
  mktData.topCalls = calls.slice(0, 3).map(c => '$' + c.strike).join(', ') || 'N/A';
  mktData.topPuts = puts.slice(0, 3).map(p => '$' + p.strike).join(', ') || 'N/A';
  mktData.maxPain = weeklyMaxPain || 'N/A';
  mktData.maxPainMonthly = monthlyMaxPain || 'N/A';

  if (mktData.price) callAI();
}

// Calculate TRUE max pain: strike where option writers pay out the LEAST
// (where option holders experience maximum loss)
function calculateMaxPain(optionsArray) {
  if (!optionsArray?.length) return null;

  // Build strike -> {callOI, putOI} map
  const strikeData = {};
  let totalOI = 0;

  optionsArray.forEach(o => {
    const strike = o.details?.strike_price;
    const oi = o.open_interest || 0;  // OI is at top level, not in day
    const type = o.details?.contract_type;
    if (!strike) return;

    totalOI += oi;
    if (!strikeData[strike]) strikeData[strike] = { callOI: 0, putOI: 0 };
    if (type === 'call') strikeData[strike].callOI += oi;
    else strikeData[strike].putOI += oi;
  });

  const strikes = Object.keys(strikeData).map(Number).sort((a, b) => a - b);
  if (strikes.length === 0) return null;

  // If no OI data, fall back to middle strike
  if (totalOI === 0) {
    return strikes[Math.floor(strikes.length / 2)];
  }

  let minPayout = Infinity;
  let maxPainStrike = null;

  // For each potential expiration price, calculate total payout to option holders
  strikes.forEach(expiryPrice => {
    let totalPayout = 0;

    // Sum payouts across all strikes
    Object.entries(strikeData).forEach(([strikeStr, data]) => {
      const strike = parseFloat(strikeStr);

      // Call payout: max(0, expiryPrice - strike) × callOI
      if (expiryPrice > strike) {
        totalPayout += (expiryPrice - strike) * data.callOI;
      }

      // Put payout: max(0, strike - expiryPrice) × putOI
      if (strike > expiryPrice) {
        totalPayout += (strike - expiryPrice) * data.putOI;
      }
    });

    if (totalPayout < minPayout) {
      minPayout = totalPayout;
      maxPainStrike = expiryPrice;
    }
  });

  return maxPainStrike;
}

async function callAI() {
  ui.$('aiSt').textContent = skipCache ? 'refreshing...' : 'thinking...';

  try {
    const [analysis, trades] = await Promise.all([
      fetchClaude(buildAnalysisPrompt(mktData), skipCache),
      fetchClaude(buildTradePrompt(mktData), skipCache)
    ]);

    ui.updateAI(analysis, trades, skipCache ? 'fresh' : 'done');
    skipCache = false; // Reset after use
  } catch (e) {
    ui.$('aiOut').textContent = 'AI Error: ' + e.message;
    ui.$('aiSt').textContent = 'error';
  }
}

async function loadNews(ticker) {
  const newsOut = ui.$('newsOut');
  newsOut.innerHTML = '<span style="color:#94a3b8">Loading news...</span>';

  try {
    const [news, details] = await Promise.all([
      fetchNews(ticker),
      fetchTickerDetails(ticker)
    ]);

    let html = '';

    // Company info
    if (details?.results) {
      const d = details.results;
      const mcap = d.market_cap ? '$' + (d.market_cap / 1e9).toFixed(1) + 'B' : '--';
      html += `<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0">
        <strong>${d.name || ticker}</strong> · ${d.sic_description || 'N/A'}
        <div style="color:#64748b;margin-top:2px">Mkt Cap: ${mcap} · Employees: ${d.total_employees?.toLocaleString() || '--'}</div>
      </div>`;
    }

    // News items
    if (news?.results?.length > 0) {
      html += news.results.map(n => {
        const date = new Date(n.published_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const source = n.publisher?.name || 'News';
        return `<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #f1f5f9">
          <a href="${n.article_url}" target="_blank" style="color:#1e293b;text-decoration:none;font-weight:500">${n.title}</a>
          <div style="color:#94a3b8;font-size:9px;margin-top:2px">${source} · ${date}</div>
        </div>`;
      }).join('');
    } else {
      html += '<div style="color:#94a3b8">No recent news available</div>';
    }

    newsOut.innerHTML = html;
  } catch (e) {
    newsOut.innerHTML = '<span style="color:#ef4444">Failed to load news</span>';
  }
}
