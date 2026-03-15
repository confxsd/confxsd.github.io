// API Module - handles all external API calls
import { CONFIG } from './config.js';
import { setStockPrice, setTickerDetails, getTickerDetails } from './cache.js';

export async function fetchPolygon(path) {
  try {
    const r = await fetch(`${CONFIG.PROXY_URL}/polygon${path}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch (e) {
    console.error(`Polygon fetch failed for ${path}:`, e.message);
    throw e;
  }
}

export async function fetchClaude(prompt, skipCache = false) {
  const url = skipCache ? `${CONFIG.PROXY_URL}/claude?nocache=1` : `${CONFIG.PROXY_URL}/claude`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.CLAUDE_MODEL,
      max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) {
    const e = await r.text();
    throw new Error(e);
  }
  const j = await r.json();
  return j.content[0].text;
}

// Period configuration for chart time ranges
// extraDays: additional historical data for indicator warm-up (SMA50 needs 50 bars, etc.)
const PERIOD_CONFIG = {
  '1d': { days: 1, multiplier: 5, timespan: 'minute', labelFormat: 'time', extraDays: 0 },
  '1w': { days: 7, multiplier: 30, timespan: 'minute', labelFormat: 'day-time', extraDays: 0 },
  '1m': { days: 30, multiplier: 1, timespan: 'day', labelFormat: 'date', extraDays: 75 },
  '1y': { days: 365, multiplier: 1, timespan: 'day', labelFormat: 'month', extraDays: 75 }
};

export function getPeriodConfig(period) {
  return PERIOD_CONFIG[period] || PERIOD_CONFIG['1m'];
}

export async function fetchTickerData(ticker, period = '1m') {
  const config = PERIOD_CONFIG[period] || PERIOD_CONFIG['1m'];
  const to = new Date();
  const totalDays = config.days + (config.extraDays || 0);
  const fr = new Date(to - totalDays * 24 * 60 * 60 * 1000);

  // Get price data - use snapshot for real-time, prev as fallback
  const [snapshot, aggs] = await Promise.all([
    fetchPolygon(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`).catch(() => null),
    fetchPolygon(`/v2/aggs/ticker/${ticker}/range/${config.multiplier}/${config.timespan}/${fr.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=5000`)
  ]);

  // Build prev-compatible response from snapshot or fallback to prev endpoint
  let prev;
  if (snapshot?.ticker) {
    const t = snapshot.ticker;
    // Use real-time data from snapshot
    const currentPrice = t.lastTrade?.p || t.day?.c || t.prevDay?.c;
    const prevClose = t.prevDay?.c || currentPrice;
    prev = {
      results: [{
        c: currentPrice,
        o: t.day?.o || prevClose,
        h: t.day?.h || currentPrice,
        l: t.day?.l || currentPrice,
        v: t.day?.v || 0,
        vw: t.day?.vw || currentPrice,
        // Include extra snapshot data
        todaysChange: t.todaysChange,
        todaysChangePerc: t.todaysChangePerc,
        prevClose: prevClose,
        updated: t.updated
      }]
    };
  } else {
    // Fallback to prev endpoint if snapshot fails
    prev = await fetchPolygon(`/v2/aggs/ticker/${ticker}/prev`);
  }

  // Cache the stock price for positions module
  if (prev?.results?.[0]?.c) {
    setStockPrice(ticker, prev.results[0].c);
  }

  // Get spot price for strike filtering
  const spotPrice = prev?.results?.[0]?.c || aggs?.results?.[aggs.results.length - 1]?.c || 100;
  const minStrike = Math.floor(spotPrice * 0.70);
  const maxStrike = Math.ceil(spotPrice * 1.30);

  // Get expiration dates for weekly, monthly, 6-month
  const weeklyExp = getNextFriday(7);
  const monthlyExp = getMonthlyExpiration(1);
  const sixMonthExp = getMonthlyExpiration(6);

  // Fetch options - 3 calls instead of 6 (no contract_type filter)
  const [weeklyOpts, monthlyOpts, sixMonthOpts] = await Promise.all([
    fetchPolygon(`/v3/snapshot/options/${ticker}?expiration_date.lte=${weeklyExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null),
    fetchPolygon(`/v3/snapshot/options/${ticker}?expiration_date.gt=${weeklyExp}&expiration_date.lte=${monthlyExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null),
    fetchPolygon(`/v3/snapshot/options/${ticker}?expiration_date.gt=${monthlyExp}&expiration_date.lte=${sixMonthExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null)
  ]);

  const options = {
    weekly: weeklyOpts?.results || [],
    monthly: monthlyOpts?.results || [],
    sixMonth: sixMonthOpts?.results || [],
    all: [
      ...(weeklyOpts?.results || []),
      ...(monthlyOpts?.results || []),
      ...(sixMonthOpts?.results || [])
    ]
  };

  return { prev, aggs, options };
}

export async function fetchNews(ticker) {
  return fetchPolygon(`/v2/reference/news?ticker=${ticker}&limit=5`).catch(() => null);
}

export async function fetchTickerDetails(ticker) {
  const cached = getTickerDetails(ticker);
  if (cached) return cached;

  const data = await fetchPolygon(`/v3/reference/tickers/${ticker}`).catch(() => null);
  if (data) setTickerDetails(ticker, data);
  return data;
}

function getNextFriday(addDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  const day = d.getDay();
  // If already Friday, use this Friday (0 days). Otherwise find the next one.
  const daysUntilFriday = (5 - day + 7) % 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d.toISOString().split('T')[0];
}

// Get third Friday of month (standard monthly options expiration)
function getMonthlyExpiration(monthsAhead = 1) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  d.setDate(1);
  // Find first Friday
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  // Third Friday = first Friday + 14 days
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
}
