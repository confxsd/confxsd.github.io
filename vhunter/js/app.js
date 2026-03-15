// VHunter Main Application - Orchestration Layer
import * as ui from './ui.js';
import { initCharts } from './charts.js';
import { parseRoute, initRouter } from './router.js';
import { registerStrip, renderAll as renderHistory } from './history.js';
import { switchPage, registerPageLoaders, restoreCollapsedSections, getCurrentPage } from './pages.js';
import { loadFeed, setRunCallback as setFeedRunCallback } from './feed.js';
import { loadMemoryMap, setRunCallback as setMemoryRunCallback } from './memory-map.js';
import { loadFilings } from './filings.js';
import { run, initPeriodSwitch } from './analysis.js';
import { loadOptionsData, initOptionsPage } from './options-page.js';
import { loadMacro } from './macro.js';
import { loadDailyChecker, prefetchDailyBadge } from './daily-checker.js';
import { loadActiveTrades } from './active-trades.js';
import { loadPipeline, unloadPipeline } from './ticker-pipeline.js';
import { loadDeepAnalysis } from './deep-analysis.js';
import { loadPlaybooks } from './playbooks.js';
import { loadDashboard } from './dashboard.js';
import { loadChat } from './chat.js';
import { initTooltips } from './tooltip.js';
import { initTooltipPositioning } from './tooltip-position.js';

// Import modules for side effects (window bindings)
import './llm-export.js';

// Register history strips
registerStrip('historyStrip', (ticker) => {
  ui.$('tk').value = ticker;
  run();
}, () => ui.$('tk')?.value?.toUpperCase().trim());

registerStrip('historyStripMobile', (ticker) => {
  ui.$('tk').value = ticker;
  run();
}, () => ui.$('tk')?.value?.toUpperCase().trim());

registerStrip('holdingsHistoryStrip', (ticker) => {
  window.showTickerHoldings(ticker);
});
setFeedRunCallback(() => run());
setMemoryRunCallback(() => run());

// Register page loaders
console.log('[APP] About to register page loaders');
console.log('[APP] loadMacro:', loadMacro);
registerPageLoaders({
  dashboard: loadDashboard,
  options: loadOptionsData,
  feed: loadFeed,
  memory: loadMemoryMap,
  filings: loadFilings,
  macro: loadMacro,
  daily: loadDailyChecker,
  pipeline: loadPipeline,
  'active-trades': loadActiveTrades,
  'deep-analysis': loadDeepAnalysis,
  playbooks: loadPlaybooks,
  chat: loadChat
});
console.log('[APP] Page loaders registered');

// Initialize router with change handler
initRouter(({ page, ticker }) => {
  if (page !== getCurrentPage()) {
    switchPage(page, false);
  }
  if (page === 'analyze' && ticker) {
    const currentTicker = ui.$('tk').value.toUpperCase().trim();
    if (ticker.toUpperCase() !== currentTicker) {
      ui.$('tk').value = ticker.toUpperCase();
      run();
    }
  }
});

// Initialize app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  ui.$('tm').textContent = new Date().toLocaleString();
  initCharts();
  initPeriodSwitch();
  renderHistory();
  initOptionsPage();
  restoreCollapsedSections();

  // Initialize tooltip system
  initTooltips();

  // Inject teaching tooltips
  ui.injectTooltips();

  // Handle initial route
  const { page, ticker } = parseRoute();
  if (ticker) {
    ui.$('tk').value = ticker.toUpperCase();
  }
  switchPage(page, false);
  run();

  // Prefetch daily checker badge count
  prefetchDailyBadge();
});

// Enter key handler for ticker input
document.getElementById('tk').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') run();
});

// Add enter key handler for options search
document.getElementById('optTicker')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loadOptionsData();
});
