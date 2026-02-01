/**
 * @fileoverview Polygon.io data provider
 * Unix philosophy: One provider, one data source
 */

import config from '../config.js';

const PROXY = config.endpoints.proxy;

/**
 * Fetch from Polygon via proxy
 */
async function polygonFetch(path) {
  const res = await fetch(`${PROXY}/polygon${path}`);
  if (!res.ok) throw new Error(`Polygon: ${res.status}`);
  return res.json();
}

/**
 * Get current price quote
 */
export async function getQuote(ticker) {
  const data = await polygonFetch(`/v2/aggs/ticker/${ticker}/prev`);
  if (!data.results?.[0]) return null;
  const r = data.results[0];
  return {
    ticker,
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
    vwap: r.vw,
    timestamp: r.t
  };
}

/**
 * Get historical daily bars
 */
export async function getHistory(ticker, days = 60) {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const data = await polygonFetch(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc`);
  return (data.results || []).map(r => ({
    date: new Date(r.t),
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
    vwap: r.vw
  }));
}

/**
 * Get options chain
 */
export async function getOptionsChain(ticker, expiry = null) {
  let path = `/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=250`;
  if (expiry) path += `&expiration_date=${expiry}`;

  const data = await polygonFetch(path);
  return (data.results || []).map(c => ({
    symbol: c.ticker,
    type: c.contract_type,
    strike: c.strike_price,
    expiry: c.expiration_date,
    style: c.exercise_style
  }));
}

/**
 * Get options snapshot (IV, greeks, etc)
 */
export async function getOptionsSnapshot(ticker) {
  const data = await polygonFetch(`/v3/snapshot/options/${ticker}?limit=250`);
  return (data.results || []).map(o => ({
    symbol: o.details?.ticker,
    strike: o.details?.strike_price,
    expiry: o.details?.expiration_date,
    type: o.details?.contract_type,
    iv: o.implied_volatility,
    delta: o.greeks?.delta,
    gamma: o.greeks?.gamma,
    theta: o.greeks?.theta,
    vega: o.greeks?.vega,
    bid: o.last_quote?.bid,
    ask: o.last_quote?.ask,
    last: o.last_trade?.price,
    volume: o.day?.volume,
    oi: o.open_interest
  }));
}

/**
 * Get ticker details
 */
export async function getTickerDetails(ticker) {
  const data = await polygonFetch(`/v3/reference/tickers/${ticker}`);
  const r = data.results || {};
  return {
    ticker: r.ticker,
    name: r.name,
    market: r.market,
    type: r.type,
    sector: r.sic_description,
    marketCap: r.market_cap,
    shares: r.share_class_shares_outstanding,
    employees: r.total_employees
  };
}

/**
 * Get ticker news
 */
export async function getNews(ticker, limit = 10) {
  const data = await polygonFetch(`/v2/reference/news?ticker=${ticker}&limit=${limit}`);
  return (data.results || []).map(n => ({
    id: n.id,
    title: n.title,
    author: n.author,
    published: n.published_utc,
    url: n.article_url,
    tickers: n.tickers,
    keywords: n.keywords,
    description: n.description
  }));
}

/**
 * Get market status
 */
export async function getMarketStatus() {
  const data = await polygonFetch('/v1/marketstatus/now');
  return {
    market: data.market,
    earlyHours: data.earlyHours,
    afterHours: data.afterHours,
    exchanges: data.exchanges
  };
}

/**
 * Get aggregates for multiple tickers
 */
export async function getBatchQuotes(tickers) {
  const results = await Promise.allSettled(
    tickers.map(t => getQuote(t))
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

export default {
  getQuote,
  getHistory,
  getOptionsChain,
  getOptionsSnapshot,
  getTickerDetails,
  getNews,
  getMarketStatus,
  getBatchQuotes
};
