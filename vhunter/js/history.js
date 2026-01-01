// VHunter Search History Module
import { formatTimeAgo } from './utils.js';
import * as ui from './ui.js';

const HISTORY_KEY = 'vhunter_search_history';
const MAX_HISTORY = 10;

let onSearchCallback = null;
let onOptionsSearchCallback = null;

export function setSearchCallback(callback) {
  onSearchCallback = callback;
}

export function setOptionsSearchCallback(callback) {
  onOptionsSearchCallback = callback;
}

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

export function addToHistory(ticker) {
  const history = getSearchHistory().filter(h => h.ticker !== ticker);
  history.unshift({ ticker, time: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  renderHistory();
  renderOptionsHistory();
}

export function renderHistory() {
  const strip = document.getElementById('historyStrip');
  const stripMobile = document.getElementById('historyStripMobile');
  const history = getSearchHistory();
  const tkInput = ui.$('tk');
  const current = tkInput ? tkInput.value.toUpperCase().trim() : '';

  const html = history
    .filter(h => h.ticker !== current)
    .map(h => {
      const ago = formatTimeAgo(h.time);
      return `<div class="history-item" onclick="searchTicker('${h.ticker}')">
        <span class="ticker">${h.ticker}</span>
        <span class="time">${ago}</span>
      </div>`;
    })
    .join('');

  if (strip) strip.innerHTML = html;
  if (stripMobile) stripMobile.innerHTML = html;
}

export function renderOptionsHistory() {
  const strip = document.getElementById('optionsHistoryStrip');
  if (!strip) return;

  const history = getSearchHistory();
  const optInput = document.getElementById('optTicker');
  const current = optInput ? optInput.value.toUpperCase().trim() : '';

  const html = history
    .filter(h => h.ticker !== current)
    .map(h => {
      const ago = formatTimeAgo(h.time);
      return `<div class="history-item" onclick="searchOptionsTicker('${h.ticker}')">
        <span class="ticker">${h.ticker}</span>
        <span class="time">${ago}</span>
      </div>`;
    })
    .join('');

  strip.innerHTML = html;
}

export function searchTicker(ticker) {
  ui.$('tk').value = ticker;
  if (onSearchCallback) {
    onSearchCallback();
  }
}

export function searchOptionsTicker(ticker) {
  const optInput = document.getElementById('optTicker');
  if (optInput) {
    optInput.value = ticker;
  }
  if (onOptionsSearchCallback) {
    onOptionsSearchCallback();
  }
}

// Expose to window for onclick handlers
window.searchTicker = searchTicker;
window.searchOptionsTicker = searchOptionsTicker;
