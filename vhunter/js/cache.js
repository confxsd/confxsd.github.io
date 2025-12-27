// VHunter Cache Module - Centralized caching for API responses
import { CONFIG } from './config.js';

const CACHE_TTL = 60000; // 1 minute

// Price caches
const stockPriceCache = new Map();
const optionPriceCache = new Map();
const tickerDetailsCache = new Map();

// Generic cache helper
function getCached(cache, key, ttl = CACHE_TTL) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < ttl) {
    return entry.data;
  }
  return null;
}

function setCache(cache, key, data) {
  cache.set(key, { data, time: Date.now() });
}

// Stock price cache
export function getStockPrice(ticker) {
  return getCached(stockPriceCache, ticker);
}

export function setStockPrice(ticker, price) {
  setCache(stockPriceCache, ticker, price);
}

export function getStockPrices(tickers) {
  const result = {};
  const missing = [];
  for (const ticker of tickers) {
    const cached = getStockPrice(ticker);
    if (cached !== null) {
      result[ticker] = cached;
    } else {
      missing.push(ticker);
    }
  }
  return { cached: result, missing };
}

export function setStockPrices(prices) {
  for (const [ticker, price] of Object.entries(prices)) {
    setStockPrice(ticker, price);
  }
}

// Option price cache
export function getOptionPrice(key) {
  return getCached(optionPriceCache, key);
}

export function setOptionPrice(key, price) {
  setCache(optionPriceCache, key, price);
}

// Ticker details cache (longer TTL - 5 min)
export function getTickerDetails(ticker) {
  return getCached(tickerDetailsCache, ticker, 300000);
}

export function setTickerDetails(ticker, details) {
  setCache(tickerDetailsCache, ticker, details);
}

// Batch fetch stock prices - fetches only missing tickers
export async function fetchStockPricesBatch(tickers) {
  if (!tickers.length) return {};

  const { cached, missing } = getStockPrices(tickers);

  if (!missing.length) return cached;

  // Fetch missing prices in parallel
  const fetched = await Promise.all(
    missing.map(async (ticker) => {
      try {
        const r = await fetch(`${CONFIG.PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/prev`);
        if (!r.ok) return { ticker, price: 0 };
        const data = await r.json();
        const price = data?.results?.[0]?.c || 0;
        return { ticker, price };
      } catch {
        return { ticker, price: 0 };
      }
    })
  );

  // Update cache and build result
  const result = { ...cached };
  for (const { ticker, price } of fetched) {
    setStockPrice(ticker, price);
    result[ticker] = price;
  }

  return result;
}

// Build option cache key
export function buildOptionKey(ticker, expiry, strike, type) {
  return `${ticker}-${expiry}-${strike}-${type}`;
}

// Clear all caches (useful for force refresh)
export function clearCaches() {
  stockPriceCache.clear();
  optionPriceCache.clear();
  tickerDetailsCache.clear();
}
