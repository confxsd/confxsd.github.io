/**
 * @fileoverview Utility functions
 * Unix philosophy: Small, reusable helpers
 */

/**
 * Simple in-memory cache with TTL
 */
export class Cache {
  constructor(defaultTTL = 60000) {
    this.store = new Map();
    this.defaultTTL = defaultTTL;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttl = this.defaultTTL) {
    this.store.set(key, {
      value,
      expires: Date.now() + ttl,
    });
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  size() {
    return this.store.size;
  }
}

/**
 * Memoize async function with cache
 */
export function memoize(
  fn,
  keyFn = (...args) => JSON.stringify(args),
  ttl = 60000,
) {
  const cache = new Cache(ttl);
  return async (...args) => {
    const key = keyFn(...args);
    const cached = cache.get(key);

    if (cached !== null) return cached;
    const result = await fn(...args);

    cache.set(key, result);
    return result;
  };
}

/**
 * Retry with exponential backoff
 */
export async function retry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }
  throw lastError;
}

/**
 * Sleep helper
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch array into chunks
 */
export function batch(arr, size) {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

/**
 * Format currency
 */
export function formatCurrency(value, decimals = 2) {
  if (value === null || value === undefined) return "N/A";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(decimals)}K`;
  return `${sign}$${abs.toFixed(decimals)}`;
}

/**
 * Format percentage
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/**
 * Format number with sign
 */
export function formatSigned(value, decimals = 2) {
  if (value === null || value === undefined) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

/**
 * Format date
 */
export function formatDate(date) {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format option description
 */
export function formatOption(leg) {
  const { strike, expiry, type } = leg;
  const exp = new Date(expiry);
  const month = exp
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const day = exp.getDate();
  return `${day}${month} ${strike}${type === "call" ? "C" : "P"}`;
}

/**
 * Calculate days between dates
 */
export function daysBetween(date1, date2 = new Date()) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
}

/**
 * Clamp value between min and max
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to decimal places
 */
export function round(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Generate unique ID
 */
export function uid(prefix = "") {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Deep merge objects
 */
export function merge(target, ...sources) {
  for (const source of sources) {
    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        target[key] = merge(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
}

/**
 * Pick keys from object
 */
export function pick(obj, keys) {
  return keys.reduce((acc, key) => {
    if (key in obj) acc[key] = obj[key];
    return acc;
  }, {});
}

/**
 * Omit keys from object
 */
export function omit(obj, keys) {
  const keySet = new Set(keys);
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keySet.has(k)),
  );
}

export default {
  Cache,
  memoize,
  retry,
  sleep,
  batch,
  formatCurrency,
  formatPercent,
  formatSigned,
  formatDate,
  formatOption,
  daysBetween,
  clamp,
  round,
  uid,
  merge,
  pick,
  omit,
};
