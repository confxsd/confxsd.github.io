// VHunter Page Navigation Module
import * as ui from './ui.js';
import { updateRoute } from './router.js';
import { stopPolling } from './terminal.js';

let currentPage = 'analyze';
let pageLoaders = {};

const pageTitles = {
  analyze: '',
  options: 'Options Terminal',
  feed: 'Feed',
  terminal: 'Terminal',
  positions: 'Positions',
  watchlist: 'Watchlist',
  notes: 'Notes',
  strategy: 'Strategy',
  macro: 'Macro Dashboard'
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
  if (pageLoaders[page]) {
    pageLoaders[page]();
  }

  // Close sidebar on mobile after navigation
  if (window.innerWidth <= 1024) {
    closeSidebar();
  }
}

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
}

export function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

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

// Expose to window for onclick handlers
window.switchPage = switchPage;
window.toggleSidebar = toggleSidebar;
window.toggleSection = toggleSection;
window.toggleMobileMenu = toggleMobileMenu;
