// API Module - handles all external API calls
import { CONFIG } from './config.js';

export async function fetchPolygon(path) {
  const r = await fetch(`${CONFIG.PROXY_URL}/polygon${path}`);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

export async function fetchClaude(prompt) {
  const r = await fetch(`${CONFIG.PROXY_URL}/claude`, {
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

  const [prev, aggs, options] = await Promise.all([
    fetchPolygon(`/v2/aggs/ticker/${ticker}/prev`),
    fetchPolygon(`/v2/aggs/ticker/${ticker}/range/1/day/${fr.toISOString().split('T')[0]}/${to.toISOString().split('T')[0]}?adjusted=true&sort=asc`),
    fetchPolygon(`/v3/snapshot/options/${ticker}?limit=50`).catch(() => null)
  ]);

  return { prev, aggs, options };
}
