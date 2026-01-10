// VHunter Main Application - Orchestration Layer
import * as ui from './ui.js';
import { initCharts } from './charts.js';
import { parseRoute, initRouter } from './router.js';
import { renderHistory, setSearchCallback } from './history.js';
import { switchPage, registerPageLoaders, restoreCollapsedSections, getCurrentPage } from './pages.js?v=2';
import { loadPositions, setRunCallback as setPositionsRunCallback } from './positions.js';
import { loadWatchlist, setRunCallback as setWatchlistRunCallback } from './watchlist.js';
import { loadNotes, setRunCallback as setNotesRunCallback } from './notes.js';
import { loadFeed, setRunCallback as setFeedRunCallback } from './feed.js';
import { loadStrategy, setRunCallback as setStrategyRunCallback } from './strategy.js';
import { run } from './analysis.js';
import { loadOptionsData, initOptionsPage } from './options-page.js';
import { initTerminal, startPolling, stopPolling } from './terminal.js';
import { loadMacro } from './macro.js';

// Import modules for side effects (window bindings)
import './portfolio.js';

// Initialize callbacks to avoid circular dependencies
setSearchCallback(() => run());
setPositionsRunCallback(() => run());
setWatchlistRunCallback(() => run());
setNotesRunCallback(() => run());
setFeedRunCallback(() => run());
setStrategyRunCallback(() => run());

// Terminal page handler (start/stop polling)
function loadTerminal() {
  startPolling();
}

// Register page loaders
registerPageLoaders({
  positions: loadPositions,
  watchlist: loadWatchlist,
  notes: loadNotes,
  options: loadOptionsData,
  feed: loadFeed,
  terminal: loadTerminal,
  strategy: loadStrategy,
  macro: loadMacro
});

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
  renderHistory();
  initOptionsPage();
  initTerminal();
  restoreCollapsedSections();

  // Inject teaching tooltips
  ui.injectTooltips();

  // Handle initial route
  const { page, ticker } = parseRoute();
  if (ticker) {
    ui.$('tk').value = ticker.toUpperCase();
  }
  switchPage(page, false);
  run();
});

// Enter key handler for ticker input
document.getElementById('tk').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') run();
});

// Add enter key handler for options search
document.getElementById('optTicker')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loadOptionsData();
});
