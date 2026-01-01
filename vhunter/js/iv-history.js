// IV History Storage Module
// Stores historical IV data per ticker for IV Rank / IV Percentile calculations
// Uses localStorage with a rolling 252-day window (1 trading year)

const STORAGE_KEY = 'vhunter_iv_history';
const MAX_DAYS = 252; // 1 trading year

// Get all IV history from storage
function getIVStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// Save IV history to storage
function saveIVStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save IV history:', e);
  }
}

// Get today's date key (YYYY-MM-DD)
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

// Record IV for a ticker
export function recordIV(ticker, iv) {
  if (iv == null || isNaN(iv)) return;

  const storage = getIVStorage();
  const key = ticker.toUpperCase();

  if (!storage[key]) {
    storage[key] = { readings: [] };
  }

  const today = getTodayKey();
  const readings = storage[key].readings;

  // Check if we already have a reading for today
  const existingIndex = readings.findIndex(r => r.date === today);
  if (existingIndex >= 0) {
    readings[existingIndex].iv = iv;
  } else {
    readings.push({ date: today, iv });
  }

  // Keep only last MAX_DAYS readings
  storage[key].readings = readings
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DAYS);

  storage[key].lastUpdated = today;
  saveIVStorage(storage);
}

// Get IV history for a ticker
export function getIVHistory(ticker) {
  const storage = getIVStorage();
  const key = ticker.toUpperCase();
  if (!storage[key]) return [];
  return storage[key].readings.map(r => r.iv);
}

// Get IV history with dates for charting
export function getIVHistoryWithDates(ticker) {
  const storage = getIVStorage();
  const key = ticker.toUpperCase();
  if (!storage[key]) return [];
  return storage[key].readings;
}

// Calculate IV Rank from stored history
export function getIVRank(ticker, currentIV) {
  const history = getIVHistory(ticker);
  if (history.length < 5 || currentIV == null) return null;

  const min = Math.min(...history);
  const max = Math.max(...history);
  if (max === min) return 50;

  return ((currentIV - min) / (max - min)) * 100;
}

// Calculate IV Percentile from stored history
export function getIVPercentile(ticker, currentIV) {
  const history = getIVHistory(ticker);
  if (history.length < 5 || currentIV == null) return null;

  const below = history.filter(iv => iv < currentIV).length;
  return (below / history.length) * 100;
}

// Get IV stats for a ticker
export function getIVStats(ticker) {
  const history = getIVHistory(ticker);
  if (history.length === 0) {
    return { min: null, max: null, avg: null, current: null, readings: 0 };
  }

  return {
    min: Math.min(...history),
    max: Math.max(...history),
    avg: history.reduce((a, b) => a + b, 0) / history.length,
    current: history[history.length - 1],
    readings: history.length
  };
}

// Get full IV analysis for a ticker
export function getFullIVAnalysis(ticker, currentIV) {
  const history = getIVHistory(ticker);
  const stats = getIVStats(ticker);
  const ivRank = getIVRank(ticker, currentIV);
  const ivPct = getIVPercentile(ticker, currentIV);

  // Record current IV for future reference
  if (currentIV != null) {
    recordIV(ticker, currentIV);
  }

  return {
    currentIV,
    ivRank,
    ivPercentile: ivPct,
    ...stats,
    historyDays: history.length,
    isHighIV: ivRank != null && ivRank > 70,
    isLowIV: ivRank != null && ivRank < 30,
    rankLabel: ivRank == null ? '--' :
      ivRank > 80 ? 'VERY HIGH' :
        ivRank > 60 ? 'HIGH' :
          ivRank > 40 ? 'MED' :
            ivRank > 20 ? 'LOW' : 'VERY LOW'
  };
}

// Clear history for a ticker
export function clearIVHistory(ticker) {
  const storage = getIVStorage();
  const key = ticker.toUpperCase();
  delete storage[key];
  saveIVStorage(storage);
}

// Get all tracked tickers
export function getTrackedTickers() {
  const storage = getIVStorage();
  return Object.keys(storage).map(ticker => ({
    ticker,
    readings: storage[ticker].readings.length,
    lastUpdated: storage[ticker].lastUpdated
  }));
}

// Import IV history (for bulk loading)
export function importIVHistory(ticker, readings) {
  const storage = getIVStorage();
  const key = ticker.toUpperCase();

  if (!storage[key]) {
    storage[key] = { readings: [] };
  }

  // Merge with existing, avoiding duplicates
  const existingDates = new Set(storage[key].readings.map(r => r.date));
  const newReadings = readings.filter(r => !existingDates.has(r.date));

  storage[key].readings = [...storage[key].readings, ...newReadings]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DAYS);

  storage[key].lastUpdated = getTodayKey();
  saveIVStorage(storage);
}
