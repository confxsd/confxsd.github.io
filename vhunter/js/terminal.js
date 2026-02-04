// Terminal Module - Bloomberg-style grid with TradingView widgets
import { getTerminalPanels, saveTerminalPanels } from './db.js';

const STORAGE_KEY = 'vhunter_terminal_panels'; // Fallback for localStorage

// TradingView dateRange options
const TIMEFRAMES = {
  '1D': '1D',
  '1W': '1W',
  '1M': '1M',
  '1Y': '12M'
};

let panels = [];
let panelCounter = 0;
let sortableInstance = null;

// Initialize terminal
export async function initTerminal() {
  await loadPanels();
  renderPanels();

  // Setup add panel handler
  const addBtn = document.getElementById('terminal-add-btn');
  const addInput = document.getElementById('terminal-ticker-input');

  if (addBtn && addInput) {
    addBtn.addEventListener('click', () => {
      const ticker = addInput.value.trim().toUpperCase();
      if (ticker) {
        addPanel(ticker);
        addInput.value = '';
      }
    });

    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const ticker = addInput.value.trim().toUpperCase();
        if (ticker) {
          addPanel(ticker);
          addInput.value = '';
        }
      }
    });
  }
}

// Start/stop polling - no longer needed with TradingView (kept for compatibility)
export function startPolling() {}
export function stopPolling() {}

// Load panels from cloud (with localStorage fallback)
async function loadPanels() {
  try {
    // Try cloud first
    let tickers = await getTerminalPanels();

    // Fallback to localStorage if cloud is empty
    if (!tickers || tickers.length === 0) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        tickers = JSON.parse(saved);
        // Migrate to cloud
        if (tickers.length > 0) {
          saveTerminalPanels(tickers).catch(() => {});
        }
      }
    }

    if (tickers && tickers.length > 0) {
      panels = tickers.map((ticker, i) => ({
        id: `panel-${Date.now()}-${i}`,
        ticker,
        timeframe: '1M'
      }));
    }
  } catch (e) {
    console.warn('Failed to load terminal panels:', e);
    // Fallback to localStorage on error
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const tickers = JSON.parse(saved);
        panels = tickers.map((ticker, i) => ({
          id: `panel-${Date.now()}-${i}`,
          ticker,
          timeframe: '1M'
        }));
      }
    } catch (e2) {
      console.warn('localStorage fallback failed:', e2);
    }
  }
}

// Save panels to cloud (and localStorage as backup)
function savePanels() {
  const tickers = panels.map(p => p.ticker);

  // Save to cloud
  saveTerminalPanels(tickers).catch(e => {
    console.warn('Failed to save to cloud:', e);
  });

  // Also save to localStorage as backup
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

// Add new panel
export function addPanel(ticker) {
  // Check if ticker already exists
  if (panels.some(p => p.ticker === ticker)) {
    return;
  }

  const panel = {
    id: `panel-${Date.now()}-${panelCounter++}`,
    ticker,
    timeframe: '1M'
  };

  panels.push(panel);
  savePanels();
  renderPanel(panel);
  initSortable();
}

// Remove panel
export function removePanel(id) {
  const idx = panels.findIndex(p => p.id === id);
  if (idx === -1) return;

  panels.splice(idx, 1);
  savePanels();

  const el = document.querySelector(`[data-panel-id="${id}"]`);
  if (el) el.remove();

  // Show empty state if no panels
  if (panels.length === 0) {
    renderEmptyState();
  }
}

// Render all panels
function renderPanels() {
  const grid = document.getElementById('terminal-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (panels.length === 0) {
    renderEmptyState();
    return;
  }

  panels.forEach(panel => renderPanel(panel));
  initSortable();
}

// Initialize Sortable for drag-and-drop reordering
function initSortable() {
  const grid = document.getElementById('terminal-grid');
  if (!grid || typeof Sortable === 'undefined') return;

  // Destroy existing instance
  if (sortableInstance) {
    sortableInstance.destroy();
  }

  sortableInstance = new Sortable(grid, {
    animation: 200,
    handle: '.panel-drag-handle',
    ghostClass: 'panel-ghost',
    chosenClass: 'panel-chosen',
    dragClass: 'panel-drag',
    onEnd: function(evt) {
      // Reorder panels array based on new DOM order
      const newOrder = [];
      grid.querySelectorAll('.terminal-panel').forEach(el => {
        const panelId = el.dataset.panelId;
        const panel = panels.find(p => p.id === panelId);
        if (panel) newOrder.push(panel);
      });
      panels = newOrder;
      savePanels();
    }
  });
}

// Render empty state
function renderEmptyState() {
  const grid = document.getElementById('terminal-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="terminal-empty">
      <p>Add symbols to start tracking</p>
      <p style="font-size:12px;margin-top:8px;color:#64748b">Stocks: AAPL, TSLA | Indices: SPX, VIX, DJI | Commodities: GOLD, OIL | Crypto: BTCUSD</p>
    </div>
  `;
}

// Render single panel with TradingView widget
function renderPanel(panel) {
  const grid = document.getElementById('terminal-grid');
  if (!grid) return;

  // Remove empty state if present
  const empty = grid.querySelector('.terminal-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = 'terminal-panel';
  div.dataset.panelId = panel.id;

  div.innerHTML = `
    <div class="panel-header">
      <span class="panel-drag-handle" title="Drag to reorder">⋮⋮</span>
      <span class="panel-ticker">${panel.ticker}</span>
      <div class="panel-timeframes" id="tf-${panel.id}">
        <button class="tf-btn${panel.timeframe === '1D' ? ' active' : ''}" data-tf="1D">1D</button>
        <button class="tf-btn${panel.timeframe === '1W' ? ' active' : ''}" data-tf="1W">1W</button>
        <button class="tf-btn${panel.timeframe === '1M' ? ' active' : ''}" data-tf="1M">1M</button>
        <button class="tf-btn${panel.timeframe === '1Y' ? ' active' : ''}" data-tf="1Y">1Y</button>
      </div>
      <button class="panel-close" onclick="window.terminalRemovePanel('${panel.id}')">&times;</button>
    </div>
    <div class="panel-tv-container" id="tv-${panel.id}"></div>
  `;

  grid.appendChild(div);

  // Setup timeframe button handlers
  const tfContainer = document.getElementById(`tf-${panel.id}`);
  tfContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tf-btn')) {
      const tf = e.target.dataset.tf;
      changeTimeframe(panel.id, tf);
    }
  });

  // Load TradingView widget
  loadTradingViewWidget(panel);
}

// Change timeframe - reload widget with new dateRange
function changeTimeframe(panelId, tf) {
  const panel = panels.find(p => p.id === panelId);
  if (!panel || panel.timeframe === tf) return;

  panel.timeframe = tf;

  // Update button states
  const tfContainer = document.getElementById(`tf-${panelId}`);
  if (tfContainer) {
    tfContainer.querySelectorAll('.tf-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tf === tf);
    });
  }

  // Clear and reload widget
  const container = document.getElementById(`tv-${panelId}`);
  if (container) {
    container.innerHTML = '';
    loadTradingViewWidget(panel);
  }
}

// Convert common tickers to TradingView format
function convertToTVSymbol(ticker) {
  const symbolMap = {
    // Indices
    'SPX': 'SP:SPX',
    'SPY': 'AMEX:SPY',
    'QQQ': 'NASDAQ:QQQ',
    'DJI': 'DJ:DJI',
    'DJIA': 'DJ:DJI',
    'VIX': 'TVC:VIX',
    'NDX': 'NASDAQ:NDX',
    'RUT': 'TVC:RUT',
    'IWM': 'AMEX:IWM',
    // Commodities
    'GOLD': 'TVC:GOLD',
    'XAUUSD': 'TVC:GOLD',
    'SILVER': 'TVC:SILVER',
    'XAGUSD': 'TVC:SILVER',
    'OIL': 'TVC:USOIL',
    'USOIL': 'TVC:USOIL',
    'WTI': 'TVC:USOIL',
    'BRENT': 'TVC:UKOIL',
    'NATGAS': 'TVC:NATGAS',
    'NG': 'TVC:NATGAS',
    // Crypto
    'BTC': 'BITSTAMP:BTCUSD',
    'BTCUSD': 'BITSTAMP:BTCUSD',
    'ETH': 'BITSTAMP:ETHUSD',
    'ETHUSD': 'BITSTAMP:ETHUSD',
    // Forex
    'EURUSD': 'FX:EURUSD',
    'GBPUSD': 'FX:GBPUSD',
    'USDJPY': 'FX:USDJPY',
    'DXY': 'TVC:DXY'
  };

  // Check if it's in our map
  if (symbolMap[ticker]) {
    return symbolMap[ticker];
  }

  // Default: assume it's a stock, try NASDAQ first, then NYSE
  return ticker;
}

// Load TradingView Mini Chart Widget
function loadTradingViewWidget(panel) {
  const container = document.getElementById(`tv-${panel.id}`);
  if (!container) return;

  // Convert ticker to TradingView symbol format
  const symbol = convertToTVSymbol(panel.ticker);
  const dateRange = TIMEFRAMES[panel.timeframe] || '1M';

  // Create widget container
  const widgetContainer = document.createElement('div');
  widgetContainer.className = 'tradingview-widget-container';
  widgetContainer.style.height = '100%';
  widgetContainer.style.width = '100%';

  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'tradingview-widget-container__widget';
  widgetDiv.style.height = '100%';
  widgetDiv.style.width = '100%';

  widgetContainer.appendChild(widgetDiv);
  container.appendChild(widgetContainer);

  // Load the widget script
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
  script.async = true;
  script.innerHTML = JSON.stringify({
    symbol: symbol,
    width: '100%',
    height: '100%',
    locale: 'en',
    dateRange: dateRange,
    colorTheme: 'light',
    isTransparent: false,
    autosize: true,
    largeChartUrl: ''
  });

  widgetContainer.appendChild(script);
}

// Expose removePanel globally for onclick handler
window.terminalRemovePanel = removePanel;
