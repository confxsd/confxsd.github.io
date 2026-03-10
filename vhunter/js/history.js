// VHunter Search History - Reusable history strip component
import { formatTimeAgo } from './utils.js';

const HISTORY_KEY = 'vhunter_search_history';
const MAX_HISTORY = 10;

// Registry: { elementId, onSelect, getExclude? }[]
const strips = [];

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

export function addToHistory(ticker) {
  if (!ticker) return;
  const history = getSearchHistory().filter(h => h.ticker !== ticker);
  history.unshift({ ticker, time: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  renderAll();
}

/**
 * Register a history strip.
 * @param {string} elementId - Container element ID
 * @param {(ticker: string) => void} onSelect - Click handler
 * @param {() => string} [getExclude] - Returns current ticker to hide from list
 */
export function registerStrip(elementId, onSelect, getExclude) {
  // Avoid duplicate registrations
  if (strips.find(s => s.elementId === elementId)) return;
  strips.push({ elementId, onSelect, getExclude });
  const handler = `_hs_${elementId}`;
  window[handler] = (ticker) => onSelect(ticker);
  renderStrip(strips[strips.length - 1]);
}

function renderStrip({ elementId, getExclude }) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const history = getSearchHistory();
  const exclude = getExclude ? getExclude() : '';
  const handler = `_hs_${elementId}`;

  el.innerHTML = history
    .filter(h => h.ticker !== exclude)
    .map(h => `<div class="history-item" onclick="${handler}('${h.ticker}')">
      <span class="ticker">${h.ticker}</span>
      <span class="time">${formatTimeAgo(h.time)}</span>
    </div>`)
    .join('');
}

export function renderAll() {
  for (const strip of strips) renderStrip(strip);
}
