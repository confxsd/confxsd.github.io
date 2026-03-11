// VHunter Page Navigation Module
import * as ui from './ui.js';
import { updateRoute } from './router.js';
import { stopPolling } from './terminal.js';
import { updateChartsTheme } from './charts.js';

let currentPage = 'analyze';
let pageLoaders = {};

const pageTitles = {
  analyze: '',
  options: 'Options Terminal',
  feed: 'Feed',
  memory: 'Memory Map',
  filings: 'Institutional Filings',
  terminal: 'Terminal',
  positions: 'Positions',
  macro: 'Macro Dashboard',
  daily: 'Daily Checker',
  pipeline: 'Deep Research',
  'active-trades': 'Active Trades',
  'deep-analysis': 'Filings Research',
  playbooks: 'Strategy Playbooks'
};

export function getCurrentPage() {
  return currentPage;
}

export function setCurrentPage(page) {
  currentPage = page;
}

export function registerPageLoaders(loaders) {
  pageLoaders = loaders;
}

export function switchPage(page, shouldUpdateRoute = true) {
  // Stop terminal polling if leaving terminal page
  if (currentPage === 'terminal' && page !== 'terminal') {
    stopPolling();
  }

  // Stop macro auto-refresh if leaving macro page
  if (currentPage === 'macro' && page !== 'macro' && window.unloadMacro) {
    window.unloadMacro();
  }

  // Stop pipeline polling if leaving pipeline page
  if (currentPage === 'pipeline' && page !== 'pipeline' && window.unloadPipeline) {
    window.unloadPipeline();
  }

  currentPage = page;

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });

  // Toggle header elements visibility based on page
  const headerSearch = document.getElementById('headerSearch');
  const historyStrip = document.getElementById('historyStrip');
  const pageTitle = document.getElementById('pageTitle');

  // Update page title (empty for analyze, CSS :empty hides it)
  if (pageTitle) {
    pageTitle.textContent = pageTitles[page] || '';
  }

  if (page === 'analyze') {
    if (headerSearch) headerSearch.style.display = 'flex';
    if (historyStrip) historyStrip.style.display = 'flex';
  } else {
    if (headerSearch) headerSearch.style.display = 'none';
    if (historyStrip) historyStrip.style.display = 'none';
  }

  // Update URL
  if (shouldUpdateRoute) {
    const ticker = page === 'analyze' ? ui.$('tk').value.toUpperCase().trim() : null;
    updateRoute(page, ticker || null);
  }

  // Load data for the page
  console.log('[PAGES] switchPage called for:', page);
  console.log('[PAGES] pageLoaders:', Object.keys(pageLoaders));
  console.log('[PAGES] pageLoaders[page]:', pageLoaders[page]);
  if (pageLoaders[page]) {
    console.log('[PAGES] calling loader for:', page);
    pageLoaders[page]();
  } else {
    console.log('[PAGES] no loader found for:', page);
  }

  // Close sidebar on mobile after navigation
  if (window.innerWidth <= 1024) {
    closeSidebar();
  }
}

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
  }
}

export function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// Tap outside sidebar to close (mobile)
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) && !e.target.closest('.menu-btn')) {
    closeSidebar();
  }
});

// UI helper functions
export function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.toggle('collapsed');
    const collapsed = JSON.parse(localStorage.getItem('vhunter_collapsed') || '{}');
    collapsed[sectionId] = section.classList.contains('collapsed');
    localStorage.setItem('vhunter_collapsed', JSON.stringify(collapsed));
  }
}

export function toggleMobileMenu() {
  const historyRow = document.getElementById('historyRow');
  const menuToggle = document.getElementById('menuToggle');
  if (historyRow) {
    historyRow.classList.toggle('show');
    menuToggle.textContent = historyRow.classList.contains('show') ? '✕' : '☰';
  }
}

export function restoreCollapsedSections() {
  const collapsed = JSON.parse(localStorage.getItem('vhunter_collapsed') || '{}');
  Object.entries(collapsed).forEach(([id, isCollapsed]) => {
    if (isCollapsed) {
      const section = document.getElementById(id);
      if (section) section.classList.add('collapsed');
    }
  });
}

// Theme toggle
export function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('vhunter_theme', next);
  updateThemeUI(next);
  updateChartsTheme();
}

function updateThemeUI(theme) {
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon) icon.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
  if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// Init theme UI on load
document.addEventListener('DOMContentLoaded', () => {
  updateThemeUI(localStorage.getItem('vhunter_theme') || 'light');
});

// Expose to window for onclick handlers
window.switchPage = switchPage;
window.toggleSidebar = toggleSidebar;
window.toggleSection = toggleSection;
window.toggleMobileMenu = toggleMobileMenu;
window.toggleTheme = toggleTheme;
