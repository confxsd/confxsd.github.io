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

// Compute rolling HV series from OHLC bars for IV rank estimation
// When we don't have enough IV history, we rank current IV against
// the distribution of historical realized volatility as an approximation
function computeHVBasedRank(bars, currentIV) {
  if (!bars || bars.length < 60 || currentIV == null) return null;

  const TRADING_DAYS = 252;
  const window = 30;
  const hvSeries = [];

  // Compute 30-day HV at each point in the bar history
  for (let i = window; i < bars.length; i++) {
    const slice = bars.slice(i - window, i);
    const returns = [];
    for (let j = 1; j < slice.length; j++) {
      if (slice[j - 1].c > 0) {
        returns.push(Math.log(slice[j].c / slice[j - 1].c));
      }
    }
    if (returns.length < 10) continue;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
    const hv = Math.sqrt(variance * TRADING_DAYS) * 100;
    if (hv > 0) hvSeries.push(hv);
  }

  if (hvSeries.length < 10) return null;

  const min = Math.min(...hvSeries);
  const max = Math.max(...hvSeries);
  if (max === min) return { ivRank: 50, ivPercentile: 50, hvDays: hvSeries.length };

  const ivRank = Math.max(0, Math.min(100, ((currentIV - min) / (max - min)) * 100));
  const below = hvSeries.filter(hv => hv < currentIV).length;
  const ivPercentile = (below / hvSeries.length) * 100;

  return { ivRank, ivPercentile, hvDays: hvSeries.length };
}

// Get full IV analysis for a ticker
// bars: optional OHLC bars (1Y) for HV-based fallback when IV history is insufficient
export function getFullIVAnalysis(ticker, currentIV, bars) {
  const history = getIVHistory(ticker);
  const stats = getIVStats(ticker);
  let ivRank = getIVRank(ticker, currentIV);
  let ivPct = getIVPercentile(ticker, currentIV);
  let historyDays = history.length;
  let estimated = false;

  // Fallback: use HV-based rank when IV history is insufficient
  if (ivRank == null && bars) {
    const hvEstimate = computeHVBasedRank(bars, currentIV);
    if (hvEstimate) {
      ivRank = hvEstimate.ivRank;
      ivPct = hvEstimate.ivPercentile;
      historyDays = hvEstimate.hvDays;
      estimated = true;
    }
  }

  // Record current IV for future reference
  if (currentIV != null) {
    recordIV(ticker, currentIV);
  }

  return {
    currentIV,
    ivRank,
    ivPercentile: ivPct,
    ...stats,
    historyDays,
    estimated,
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
