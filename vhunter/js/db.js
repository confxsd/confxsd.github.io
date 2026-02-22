// Database API Module - interacts with Cloudflare D1 via Worker
import { CONFIG } from './config.js';

// Get or create user ID (stored in localStorage)
function getUserId() {
  try {
    let userId = localStorage.getItem('vhunter_user_id');
    if (!userId) {
      userId = 'vhunter-serhat'; // Default user
      localStorage.setItem('vhunter_user_id', userId);
    }
    return userId;
  } catch (e) {
    // localStorage may be blocked in private browsing
    console.warn('localStorage unavailable:', e);
    return 'vhunter-serhat';
  }
}

// Force set user ID (for importing positions)
export function setUserId(id) {
  localStorage.setItem('vhunter_user_id', id);
}

// Base fetch with user ID header
async function dbFetch(path, options = {}) {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId(),
        ...options.headers
      }
    });
    if (!response.ok) {
      console.error(`API error ${response.status} for ${path}`);
    }
    return response.json();
  } catch (e) {
    console.error(`Fetch failed for ${path}:`, e.message);
    throw e;
  }
}

// ==================== POSITIONS ====================

export async function getPositions(status = null) {
  const query = status ? `?status=${status}` : '';
  return dbFetch(`/api/positions${query}`);
}

export async function getOpenPositions() {
  return getPositions('open');
}

export async function getClosedPositions() {
  return getPositions('closed');
}

export async function addPosition(position) {
  return dbFetch('/api/positions', {
    method: 'POST',
    body: JSON.stringify(position)
  });
}

export async function updatePosition(id, updates) {
  return dbFetch(`/api/positions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

export async function closePosition(id, exitPrice, position = null, exitDate = null) {
  // Calculate P&L if position data is provided
  let pnl = null;
  if (position) {
    const qty = position.quantity;
    const entry = position.entry_price;
    const type = position.type;
    const isOption = ['put', 'call', 'short_put', 'short_call'].includes(type);
    const multiplier = isOption ? 100 : 1;

    if (type === 'long' || type === 'call' || type === 'put') {
      pnl = (exitPrice - entry) * qty * multiplier;
    } else if (type === 'short' || type === 'short_call' || type === 'short_put') {
      pnl = (entry - exitPrice) * qty * multiplier;
    }
  }

  return updatePosition(id, {
    status: 'closed',
    exit_price: exitPrice,
    exit_date: exitDate || new Date().toISOString().split('T')[0],
    pnl: pnl
  });
}

export async function deletePosition(id) {
  return dbFetch(`/api/positions/${id}`, { method: 'DELETE' });
}

// ==================== WATCHLIST ====================

export async function getWatchlist() {
  return dbFetch('/api/watchlist');
}

export async function addToWatchlist(item) {
  return dbFetch('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify(item)
  });
}

export async function removeFromWatchlist(id) {
  return dbFetch(`/api/watchlist/${id}`, { method: 'DELETE' });
}

// ==================== NOTES ====================

export async function getNotes(ticker = null) {
  const query = ticker ? `?ticker=${ticker}` : '';
  return dbFetch(`/api/notes${query}`);
}

export async function addNote(note) {
  return dbFetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify(note)
  });
}

export async function updateNote(id, content, tags = null) {
  return dbFetch(`/api/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ content, tags })
  });
}

export async function deleteNote(id) {
  return dbFetch(`/api/notes/${id}`, { method: 'DELETE' });
}

// ==================== GAMMA LEVELS (Local Storage) ====================
// Track historical gamma levels for wall shift analysis
// Uses localStorage until D1 table is added

const GAMMA_STORAGE_KEY = 'vhunter_gamma_levels';
const MAX_HISTORY_DAYS = 30;

// Get all gamma level history
export function getGammaHistory(ticker = null) {
  try {
    const stored = localStorage.getItem(GAMMA_STORAGE_KEY);
    const history = stored ? JSON.parse(stored) : {};

    if (ticker) {
      return history[ticker] || [];
    }
    return history;
  } catch (e) {
    console.warn('Failed to get gamma history:', e);
    return ticker ? [] : {};
  }
}

// Record gamma levels for a ticker
export function recordGammaLevels(ticker, levels) {
  try {
    const history = getGammaHistory();
    if (!history[ticker]) history[ticker] = [];

    const today = new Date().toISOString().split('T')[0];

    // Check if we already have today's record
    const existingIdx = history[ticker].findIndex(h => h.date === today);
    if (existingIdx >= 0) {
      history[ticker][existingIdx] = { date: today, ...levels };
    } else {
      history[ticker].push({ date: today, ...levels });
    }

    // Keep only last MAX_HISTORY_DAYS
    history[ticker] = history[ticker]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, MAX_HISTORY_DAYS);

    localStorage.setItem(GAMMA_STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch (e) {
    console.warn('Failed to record gamma levels:', e);
    return false;
  }
}

// Get wall shift analysis for a ticker
export function getWallShiftAnalysis(ticker) {
  const history = getGammaHistory(ticker);
  if (history.length < 2) {
    return { error: 'Insufficient history', shifts: null };
  }

  const today = history[0];
  const yesterday = history[1];

  const callWallShift = today.callWall && yesterday.callWall
    ? today.callWall - yesterday.callWall
    : null;

  const putWallShift = today.putWall && yesterday.putWall
    ? today.putWall - yesterday.putWall
    : null;

  const zeroGammaShift = today.zeroGamma && yesterday.zeroGamma
    ? today.zeroGamma - yesterday.zeroGamma
    : null;

  // 5-day trend
  let callWallTrend = 0;
  let putWallTrend = 0;
  if (history.length >= 5) {
    const recent5 = history.slice(0, 5);
    const firstCW = recent5[recent5.length - 1]?.callWall;
    const lastCW = recent5[0]?.callWall;
    if (firstCW && lastCW) callWallTrend = lastCW - firstCW;

    const firstPW = recent5[recent5.length - 1]?.putWall;
    const lastPW = recent5[0]?.putWall;
    if (firstPW && lastPW) putWallTrend = lastPW - firstPW;
  }

  return {
    today,
    yesterday,
    shifts: {
      callWall: callWallShift,
      callWallSignal: callWallShift > 0 ? 'UP' : callWallShift < 0 ? 'DOWN' : 'FLAT',
      putWall: putWallShift,
      putWallSignal: putWallShift > 0 ? 'UP' : putWallShift < 0 ? 'DOWN' : 'FLAT',
      zeroGamma: zeroGammaShift
    },
    trends: {
      callWall5d: callWallTrend,
      callWallSignal5d: callWallTrend > 0 ? 'BULLISH' : callWallTrend < 0 ? 'BEARISH' : 'NEUTRAL',
      putWall5d: putWallTrend,
      putWallSignal5d: putWallTrend > 0 ? 'BULLISH' : putWallTrend < 0 ? 'BEARISH' : 'NEUTRAL'
    },
    history: history.slice(0, 10)
  };
}

// ==================== TERMINAL ====================

export async function getTerminalPanels() {
  try {
    const result = await dbFetch('/api/terminal');
    return result?.tickers || [];
  } catch (e) {
    console.warn('Failed to get terminal panels:', e);
    return [];
  }
}

export async function saveTerminalPanels(tickers) {
  return dbFetch('/api/terminal', {
    method: 'POST',
    body: JSON.stringify({ tickers })
  });
}

// ==================== MEMORY MAP ====================

export async function getMemories(status = 'active') {
  const query = status ? `?status=${status}` : '';
  return dbFetch(`/api/memory${query}`);
}

export async function getMemory(id) {
  return dbFetch(`/api/memory/${id}`);
}

export async function createMemory(memory) {
  return dbFetch('/api/memory', {
    method: 'POST',
    body: JSON.stringify(memory)
  });
}

export async function updateMemory(id, updates) {
  return dbFetch(`/api/memory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

export async function deleteMemory(id) {
  return dbFetch(`/api/memory/${id}`, { method: 'DELETE' });
}

export async function getMemoryUpdates(memoryId) {
  return dbFetch(`/api/memory/${memoryId}/updates`);
}

export async function addMemoryUpdate(memoryId, update) {
  return dbFetch(`/api/memory/${memoryId}/updates`, {
    method: 'POST',
    body: JSON.stringify(update)
  });
}

export async function extractMemoriesFromThesis() {
  return dbFetch('/api/memory/extract', { method: 'POST' });
}

export async function matchMemoriesToFeed() {
  return dbFetch('/api/memory/match', { method: 'POST' });
}

export async function generateMemoryThesis() {
  return dbFetch('/api/memory/thesis', { method: 'POST' });
}

// ==================== DAILY CHECKER ====================

export async function getDailyChecks() {
  return dbFetch('/api/daily-checks');
}

export async function addDailyCheck(body) {
  return dbFetch('/api/daily-checks', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateDailyCheck(id, body) {
  return dbFetch(`/api/daily-checks/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteDailyCheck(id) {
  return dbFetch(`/api/daily-checks/${id}`, { method: 'DELETE' });
}

export async function runDailyChecks(force = false) {
  return dbFetch(`/api/daily-checks/run${force ? '?force=true' : ''}`, { method: 'POST' });
}

export async function runDailyCheck(id) {
  return dbFetch(`/api/daily-checks/${id}/run`, { method: 'POST' });
}

export async function getDailyResults() {
  return dbFetch('/api/daily-checks/results');
}

export async function getDailyCheckHistory(id) {
  return dbFetch(`/api/daily-checks/${id}/results`);
}

// ==================== HELPERS ====================

// Calculate total P&L from closed positions
export function calculateTotalPnL(positions) {
  return positions
    .filter(p => p.status === 'closed' && p.pnl !== null)
    .reduce((sum, p) => sum + p.pnl, 0);
}

// Get positions for a specific ticker
export function filterByTicker(positions, ticker) {
  return positions.filter(p => p.ticker === ticker);
}
