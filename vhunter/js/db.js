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

export async function closePosition(id, exitPrice, exitDate = null) {
  return updatePosition(id, {
    status: 'closed',
    exit_price: exitPrice,
    exit_date: exitDate || new Date().toISOString().split('T')[0]
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
