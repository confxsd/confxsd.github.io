// API Module - handles all external API calls
import { CONFIG } from './config.js';

export async function fetchPolygon(path) {
  const r = await fetch(`${CONFIG.PROXY_URL}/polygon${path}`);
  if (!r.ok) throw new Error(r.status);
  return r.json();
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

export async function fetchTickerData(ticker) {
  const to = new Date();
  const fr = new Date(to - CONFIG.HISTORY_DAYS * 24 * 60 * 60 * 1000);

  // First get price data
  const [prev, aggs] = await Promise.all([
    fetchPolygon(`/v2/aggs/ticker/${ticker}/prev`),
    fetchPolygon(`/v2/aggs/ticker/${ticker}/range/1/day/${fr.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}?adjusted=true&sort=asc`)
  ]);

  // Get spot price for strike filtering
  const spotPrice = prev?.results?.[0]?.c || aggs?.results?.[aggs.results.length - 1]?.c || 100;
  const minStrike = Math.floor(spotPrice * 0.70);
  const maxStrike = Math.ceil(spotPrice * 1.30);

  // Get expiration dates for weekly, monthly, 6-month
  const weeklyExp = getNextFriday(7);
  const monthlyExp = getMonthlyExpiration(1);
  const sixMonthExp = getMonthlyExpiration(6);

  // Fetch options for different expirations (wider strike range for max pain accuracy)
  const [weeklyCalls, weeklyPuts, monthlyCalls, monthlyPuts, sixMonthCalls, sixMonthPuts] = await Promise.all([
    fetchPolygon(`/v3/snapshot/options/${ticker}?contract_type=call&expiration_date.lte=${weeklyExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null),
    fetchPolygon(`/v3/snapshot/options/${ticker}?contract_type=put&expiration_date.lte=${weeklyExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null),
    fetchPolygon(`/v3/snapshot/options/${ticker}?contract_type=call&expiration_date.gt=${weeklyExp}&expiration_date.lte=${monthlyExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null),
    fetchPolygon(`/v3/snapshot/options/${ticker}?contract_type=put&expiration_date.gt=${weeklyExp}&expiration_date.lte=${monthlyExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null),
    fetchPolygon(`/v3/snapshot/options/${ticker}?contract_type=call&expiration_date.gt=${monthlyExp}&expiration_date.lte=${sixMonthExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null),
    fetchPolygon(`/v3/snapshot/options/${ticker}?contract_type=put&expiration_date.gt=${monthlyExp}&expiration_date.lte=${sixMonthExp}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250`).catch(() => null)
  ]);

  // Combine all options with expiration category
  const options = {
    weekly: [...(weeklyCalls?.results || []), ...(weeklyPuts?.results || [])],
    monthly: [...(monthlyCalls?.results || []), ...(monthlyPuts?.results || [])],
    sixMonth: [...(sixMonthCalls?.results || []), ...(sixMonthPuts?.results || [])],
    all: [
      ...(weeklyCalls?.results || []), ...(weeklyPuts?.results || []),
      ...(monthlyCalls?.results || []), ...(monthlyPuts?.results || []),
      ...(sixMonthCalls?.results || []), ...(sixMonthPuts?.results || [])
    ]
  };

  return { prev, aggs, options };
}

export async function fetchNews(ticker) {
  return fetchPolygon(`/v2/reference/news?ticker=${ticker}&limit=5`).catch(() => null);
}

export async function fetchTickerDetails(ticker) {
  return fetchPolygon(`/v3/reference/tickers/${ticker}`).catch(() => null);
}

function getNextFriday(addDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  const day = d.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
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
