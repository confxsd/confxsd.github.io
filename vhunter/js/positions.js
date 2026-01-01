// VHunter Positions Module
import * as db from './db.js';
import * as ui from './ui.js';
import { fetchPolygon } from './api.js';
import { parseOptionFromNotes, buildOptionTicker } from './utils.js';
import { switchPage } from './pages.js';
import {
  getStockPrice,
  setStockPrice,
  fetchStockPricesBatch,
  getOptionPrice,
  setOptionPrice,
  buildOptionKey
} from './cache.js';

export let positionsCache = { open: [], closed: [] };
let runCallback = null;

export function setRunCallback(callback) {
  runCallback = callback;
}

export async function fetchCurrentPrice(ticker) {
  // Check shared cache first
  const cached = getStockPrice(ticker);
  if (cached !== null) return cached;

  try {
    const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/prev`);
    const price = data?.results?.[0]?.c || 0;
    setStockPrice(ticker, price);
    return price;
  } catch {
    return 0;
  }
}

export async function fetchOptionPrice(optInfo) {
  const cacheKey = buildOptionKey(optInfo.ticker, optInfo.expiry, optInfo.strike, optInfo.type);

  // Check shared cache first
  const cached = getOptionPrice(cacheKey);
  if (cached !== null) return cached;

  try {
    const data = await fetchPolygon(`/v3/snapshot/options/${optInfo.ticker}?contract_type=${optInfo.type}&expiration_date=${optInfo.expiry}&strike_price=${optInfo.strike}&limit=1`);
    const result = data?.results?.[0];
    let price = 0;
    if (result?.day?.close) {
      price = result.day.close;
    } else if (result?.last_quote) {
      price = (result.last_quote.bid + result.last_quote.ask) / 2;
    } else if (result?.day?.last) {
      price = result.day.last;
    }
    setOptionPrice(cacheKey, price);
    return price;
  } catch (e) {
    console.error('Error fetching option price:', cacheKey, e);
    return 0;
  }
}

export function calcUnrealizedPnL(position, currentPrice, optionPrice = null) {
  const qty = position.quantity;
  const entry = position.entry_price;
  const type = position.type;

  if (type === 'long') {
    return (currentPrice - entry) * qty;
  } else if (type === 'short') {
    return (entry - currentPrice) * qty;
  } else if ((type === 'put' || type === 'call') && optionPrice !== null) {
    // Long options: profit when option price rises
    return (optionPrice - entry) * qty * 100;
  } else if ((type === 'short_put' || type === 'short_call') && optionPrice !== null) {
    // Short options: profit when option price falls (collected premium - current value)
    return (entry - optionPrice) * qty * 100;
  }
  return 0;
}

export async function loadPositions() {
  try {
    const [open, closed] = await Promise.all([
      db.getOpenPositions(),
      db.getClosedPositions()
    ]);

    positionsCache.open = Array.isArray(open) ? open : (open.data || []);
    positionsCache.closed = Array.isArray(closed) ? closed : (closed.data || []);

    const positionsWithInfo = positionsCache.open.map(p => {
      // Parse option info from notes, handling both long and short options
      let optionInfo = parseOptionFromNotes(p.notes);
      // For short_put/short_call, also try to parse option details
      if (!optionInfo && (p.type === 'short_put' || p.type === 'short_call')) {
        optionInfo = parseOptionFromNotes(p.notes);
      }
      return { ...p, optionInfo };
    });

    // Batch fetch all stock prices at once (uses shared cache)
    const stockTickers = [...new Set(positionsWithInfo.map(p =>
      p.optionInfo ? p.optionInfo.ticker : p.ticker
    ))];
    const stockPrices = await fetchStockPricesBatch(stockTickers);

    // Fetch option prices in parallel (uses shared cache)
    const optionPositions = positionsWithInfo.filter(p => p.optionInfo);
    const optionPrices = await Promise.all(
      optionPositions.map(p => fetchOptionPrice(p.optionInfo))
    );

    const optionPriceMap = {};
    optionPositions.forEach((p, i) => {
      const key = buildOptionKey(p.optionInfo.ticker, p.optionInfo.expiry, p.optionInfo.strike, p.optionInfo.type);
      optionPriceMap[key] = optionPrices[i];
    });

    positionsCache.open = positionsWithInfo.map(p => {
      const underlyingTicker = p.optionInfo ? p.optionInfo.ticker : p.ticker;
      const currentPrice = stockPrices[underlyingTicker] || 0;

      let optionPrice = null;
      if (p.optionInfo) {
        const key = buildOptionKey(p.optionInfo.ticker, p.optionInfo.expiry, p.optionInfo.strike, p.optionInfo.type);
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

export function renderPositions(status) {
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
          const isOption = ['put', 'call', 'short_put', 'short_call'].includes(p.type);
          const costBasis = isOption
            ? p.entry_price * p.quantity * 100
            : p.entry_price * p.quantity;
          const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
          const optInfo = p.optionInfo;
          const isShortOption = p.type === 'short_put' || p.type === 'short_call';
          const displayTicker = optInfo
            ? `${p.ticker} ${optInfo.strike}${optInfo.type === 'put' ? 'P' : 'C'}`
            : p.ticker;
          const expiryText = optInfo ? optInfo.expiryRaw : '';
          const displayPrice = optInfo ? (p.optionPrice || 0) : (p.currentPrice || 0);
          const typeLabel = isShortOption ? p.type.replace('_', ' ') : p.type;

          return `
            <div class="position-row ${pnlClass}">
              <span class="col-ticker">
                <strong>${displayTicker}</strong>
                ${expiryText ? `<small>${expiryText}</small>` : ''}
              </span>
              <span class="col-type"><span class="type-badge ${p.type.replace('_', '-')}">${typeLabel}</span></span>
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

export function updatePositionStats() {
  const open = positionsCache.open || [];
  const closed = positionsCache.closed || [];

  document.getElementById('openCount').textContent = open.length;
  document.getElementById('closedCount').textContent = closed.length;

  const unrealizedPnl = open.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
  const unrealizedEl = document.getElementById('unrealizedPnl');
  if (unrealizedEl) {
    unrealizedEl.textContent = (unrealizedPnl >= 0 ? '+' : '') + '$' + unrealizedPnl.toFixed(0);
    unrealizedEl.className = 'stat-value ' + (unrealizedPnl > 0 ? 'positive' : unrealizedPnl < 0 ? 'negative' : '');
  }

  const realizedPnl = closed.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const totalPnl = unrealizedPnl + realizedPnl;
  const pnlEl = document.getElementById('totalPnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(0);
  pnlEl.className = 'stat-value ' + (totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : '');

  const wins = closed.filter(p => p.pnl > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length * 100).toFixed(0) : '--';
  document.getElementById('winRate').textContent = winRate + '%';
}

export function switchPositionTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === tab);
  });
  document.getElementById('openPositions').classList.toggle('hidden', tab !== 'open');
  document.getElementById('closedPositions').classList.toggle('hidden', tab !== 'closed');
}

export function openPositionModal(position = null) {
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
}

export function closePositionModal() {
  document.getElementById('positionModal').classList.remove('active');
  document.getElementById('positionForm').reset();
}

export async function savePosition(e) {
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
}

export function openClosePositionModal(positionId) {
  document.getElementById('closePositionId').value = positionId;
  document.getElementById('exitPrice').value = '';
  document.getElementById('closePositionModal').classList.add('active');
}

export function closeCloseModal() {
  document.getElementById('closePositionModal').classList.remove('active');
}

export async function confirmClosePosition(e) {
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
}

export async function deletePosition(id) {
  if (!confirm('Delete this position?')) return;

  try {
    await db.deletePosition(id);
    loadPositions();
  } catch (e) {
    alert('Failed to delete position: ' + e.message);
  }
}

export function analyzePosition(ticker) {
  ui.$('tk').value = ticker;
  switchPage('analyze');
  if (runCallback) runCallback();
}

// Expose to window for onclick handlers
window.switchPositionTab = switchPositionTab;
window.openPositionModal = openPositionModal;
window.closePositionModal = closePositionModal;
window.savePosition = savePosition;
window.openClosePositionModal = openClosePositionModal;
window.closeCloseModal = closeCloseModal;
window.confirmClosePosition = confirmClosePosition;
window.deletePosition = deletePosition;
window.analyzePosition = analyzePosition;
