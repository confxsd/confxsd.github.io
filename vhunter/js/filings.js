/**
 * Filings Page Module
 * Professional dashboard for institutional SEC filings tracking
 */

import { CONFIG } from './config.js';

// State
let filings = [];
let pipeDeals = [];
let funds = [];
let holdings = [];
let holdingsSummary = null;
let currentTab = 'filings';
let currentFilters = {
  type: 'all',
  fund: 'all',
  days: 30,
  search: ''
};
let holdingsFilters = {
  search: '',
  sortBy: 'value',
  minFunds: 1
};
let currentView = 'feed';

const getUserId = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

/**
 * Load filings page data
 */
export async function loadFilings() {
  try {
    showLoading();

    const [filingsData, pipesData, fundsData, holdingsData] = await Promise.all([
      fetchFilings({ days: currentFilters.days }),
      fetchPipeDeals(),
      fetchFunds(),
      fetchHoldingsAggregated()
    ]);

    filings = filingsData;
    pipeDeals = pipesData;
    funds = fundsData;
    holdings = holdingsData.holdings || [];
    holdingsSummary = holdingsData;

    populateFundFilter();
    renderDashboardStats();
    renderFilingsTable();
    renderPipeTable();
    renderFundsGrid();
    renderHoldingsStats();
    renderHoldingsTable();
    updateLastScan();

  } catch (e) {
    console.error('Failed to load filings:', e);
    showError('Failed to load filings data');
  }
}

// ============== DATA LAYER (exported for other modules) ==============

export async function getFilingsForTicker(ticker) {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/filings?ticker=${encodeURIComponent(ticker)}&limit=100`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

export async function getHoldingsForTicker(ticker) {
  return fetchHoldingsByTicker(ticker);
}

export async function getFunds() {
  if (funds.length > 0) return funds;
  funds = await fetchFunds();
  return funds;
}

export async function getPipeDeals() {
  if (pipeDeals.length > 0) return pipeDeals;
  pipeDeals = await fetchPipeDeals();
  return pipeDeals;
}

export async function getFilingById(id) {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${id}`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

export async function getHoldingsCompare(options = {}) {
  const params = new URLSearchParams();
  if (options.ticker) params.set('ticker', options.ticker);
  if (options.fund_id) params.set('fund_id', options.fund_id);
  if (options.periods) params.set('periods', options.periods);
  const response = await fetch(`${CONFIG.PROXY_URL}/api/holdings/compare?${params}`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

// ============== API CALLS ==============

async function fetchFilings(filters = {}) {
  const params = new URLSearchParams({
    days: filters.days || 30,
    limit: 500
  });
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.fund_id && filters.fund_id !== 'all') params.set('fund_id', filters.fund_id);

  const response = await fetch(`${CONFIG.PROXY_URL}/api/filings?${params}`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function fetchPipeDeals() {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/pipe?status=active`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function fetchFunds() {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/funds`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function fetchHoldingsAggregated(options = {}) {
  const params = new URLSearchParams({
    limit: options.limit || 200,
    min_funds: options.minFunds || 1,
    sort: options.sortBy || 'value'
  });
  const response = await fetch(`${CONFIG.PROXY_URL}/api/holdings/aggregated?${params}`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function fetchHoldingsByTicker(ticker) {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/holdings/ticker/${ticker}`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

// ============== DASHBOARD STATS ==============

function renderDashboardStats() {
  const stats = {
    '13F': 0,
    '13DG': 0,
    '8K': 0,
    'S1': 0,
    'Form4': 0,
    'total': filings.length
  };

  for (const f of filings) {
    const type = f.filing_type || '';
    if (type.includes('13F')) stats['13F']++;
    else if (type.includes('13D') || type.includes('13G')) stats['13DG']++;
    else if (type.includes('8-K')) stats['8K']++;
    else if (type.includes('S-1') || type.includes('EFFECT')) stats['S1']++;
    else if (type === '4' || type === '4/A') stats['Form4']++;
  }

  document.getElementById('fil13F').textContent = stats['13F'];
  document.getElementById('fil13DG').textContent = stats['13DG'];
  document.getElementById('fil8K').textContent = stats['8K'];
  document.getElementById('filS1').textContent = stats['S1'];
  document.getElementById('filForm4').textContent = stats['Form4'];
  document.getElementById('filTotal').textContent = stats.total;
  document.getElementById('filPipeCount').textContent = pipeDeals.length;
  document.getElementById('filFundsCount').textContent = funds.length;
}

function populateFundFilter() {
  const select = document.getElementById('filFundFilter');
  if (!select) return;

  select.innerHTML = '<option value="all">All Funds</option>';

  const sortedFunds = [...funds].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const fund of sortedFunds) {
    const opt = document.createElement('option');
    opt.value = fund.id;
    opt.textContent = fund.name;
    select.appendChild(opt);
  }
}

// ============== FILINGS TABLE ==============

function renderFilingsTable() {
  const container = document.getElementById('filFilingsTable');
  if (!container) return;

  const filtered = getFilteredFilings();
  document.getElementById('filDisplayCount').textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="fil-empty">No filings match your filters</div>';
    return;
  }

  if (currentView === 'feed') {
    container.innerHTML = renderFilingsFeed(filtered);
  } else {
    container.innerHTML = `
      <table class="fil-table">
        <thead>
          <tr>
            <th class="fil-th-type">Type</th>
            <th class="fil-th-fund">Fund</th>
            <th class="fil-th-ticker">Subject</th>
            <th class="fil-th-date">Filed</th>
            <th class="fil-th-priority">Priority</th>
            <th class="fil-th-actions"></th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(f => renderFilingRow(f)).join('')}
        </tbody>
      </table>
    `;
  }
}

function renderFilingRow(filing) {
  const priorityClass = {
    'critical': 'fil-priority-critical',
    'high': 'fil-priority-high'
  }[filing.alert_priority] || '';

  const typeIcon = getTypeIcon(filing.filing_type);

  return `
    <tr class="fil-row ${priorityClass}" onclick="showFilingDetails('${filing.id}')">
      <td class="fil-td-type">
        <span class="fil-type-badge">${typeIcon} ${filing.filing_type}</span>
      </td>
      <td class="fil-td-fund">${filing.fund_name || filing.filer_name || 'Unknown'}</td>
      <td class="fil-td-ticker">${filing.subject_ticker || '-'}</td>
      <td class="fil-td-date">${formatDate(filing.filed_date)}</td>
      <td class="fil-td-priority">
        ${filing.alert_priority !== 'normal' ? `<span class="fil-priority-badge ${priorityClass}">${filing.alert_priority}</span>` : '-'}
      </td>
      <td class="fil-td-actions">
        <a href="${filing.filing_url}" target="_blank" class="fil-link-btn" onclick="event.stopPropagation()" title="View on SEC">
          <i class="fa-solid fa-external-link"></i>
        </a>
      </td>
    </tr>
  `;
}

// ============== FEED VIEW ==============

function renderFilingsFeed(filteredFilings) {
  // Group by day
  const groups = {};
  for (const f of filteredFilings) {
    const dayKey = f.filed_date ? f.filed_date.slice(0, 10) : 'unknown';
    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(f);
  }

  const sortedDays = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  if (sortedDays.length === 0) return '<div class="fil-empty">No filings match your filters</div>';

  return `<div class="fil-feed">${sortedDays.map(day => `
    <div class="fil-feed-day">
      <div class="fil-feed-date">${formatFeedDate(day)}</div>
      ${groups[day].map(f => renderFeedItem(f)).join('')}
    </div>
  `).join('')}</div>`;
}

function renderFeedItem(filing) {
  const typeColor = getTypeColor(filing.filing_type);
  const priorityClass = filing.alert_priority === 'critical' ? 'fil-feed-critical' :
                         filing.alert_priority === 'high' ? 'fil-feed-high' : '';
  const preview = buildParsedPreview(filing);

  return `
    <div class="fil-feed-item ${priorityClass}" onclick="showFilingDetails('${filing.id}')">
      <span class="fil-feed-type" style="border-color:${typeColor};color:${typeColor}">${filing.filing_type}</span>
      <div class="fil-feed-body">
        <div class="fil-feed-top">
          <span class="fil-feed-fund">${filing.fund_name || filing.filer_name || 'Unknown'}</span>
          ${filing.subject_ticker ? `<code class="fil-feed-ticker" onclick="event.stopPropagation()">${filing.subject_ticker}</code>` : ''}
        </div>
        ${preview ? `<div class="fil-feed-preview">${preview}</div>` : ''}
        <div class="fil-feed-meta">
          <span class="fil-feed-time">${formatRelativeDate(filing.filed_date)}</span>
          <a href="${filing.filing_url}" target="_blank" class="fil-link-btn" onclick="event.stopPropagation()" title="SEC EDGAR">
            <i class="fa-solid fa-external-link"></i>
          </a>
        </div>
      </div>
    </div>
  `;
}

function getTypeColor(type) {
  if (!type) return '#64748b';
  if (type.includes('13D') || type.includes('13G')) return '#ef4444';
  if (type.includes('13F')) return '#6366f1';
  if (type.includes('8-K')) return '#f59e0b';
  if (type.includes('S-1') || type.includes('EFFECT')) return '#f97316';
  if (type === '4' || type === '4/A') return '#64748b';
  return '#64748b';
}

function buildParsedPreview(filing) {
  const pd = filing.parsed_data;
  if (!pd) return '';
  if (pd.positions_count) {
    const val = pd.total_value ? `, ${formatValue(pd.total_value)}` : '';
    return `${pd.positions_count} positions${val}`;
  }
  if (pd.shares_owned) return `${formatNumber(pd.shares_owned)} shares owned`;
  if (pd.event_type) return pd.event_type;
  return '';
}

function formatFeedDate(dayStr) {
  if (dayStr === 'unknown') return 'Unknown Date';
  const d = new Date(dayStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  return formatDate(dateStr);
}

function getTypeIcon(type) {
  if (!type) return '📄';
  if (type.includes('13F')) return '📊';
  if (type.includes('13D')) return '🎯';
  if (type.includes('13G')) return '📈';
  if (type.includes('8-K')) return '📢';
  if (type.includes('S-1') || type.includes('EFFECT')) return '📋';
  if (type === '4' || type === '4/A') return '👤';
  return '📄';
}

function getFilteredFilings() {
  let filtered = [...filings];

  // Type filter
  if (currentFilters.type !== 'all') {
    if (currentFilters.type === 'ownership') {
      filtered = filtered.filter(f => f.filing_type?.includes('13D') || f.filing_type?.includes('13G'));
    } else if (currentFilters.type === 'registration') {
      filtered = filtered.filter(f => f.filing_type?.includes('S-1') || f.filing_type?.includes('EFFECT'));
    } else {
      filtered = filtered.filter(f => f.filing_type?.includes(currentFilters.type));
    }
  }

  // Fund filter
  if (currentFilters.fund !== 'all') {
    filtered = filtered.filter(f => f.fund_id === currentFilters.fund);
  }

  // Search filter
  if (currentFilters.search) {
    const search = currentFilters.search.toLowerCase();
    filtered = filtered.filter(f =>
      (f.fund_name || '').toLowerCase().includes(search) ||
      (f.filer_name || '').toLowerCase().includes(search) ||
      (f.subject_ticker || '').toLowerCase().includes(search) ||
      (f.filer_cik || '').includes(search) ||
      (f.filing_type || '').toLowerCase().includes(search)
    );
  }

  return filtered;
}

// ============== PIPE TABLE ==============

function renderPipeTable() {
  const container = document.getElementById('filPipeTable');
  if (!container) return;

  if (!pipeDeals || pipeDeals.length === 0) {
    container.innerHTML = '<div class="fil-empty">No PIPE deals being tracked</div>';
    return;
  }

  container.innerHTML = `
    <table class="fil-table fil-pipe-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>PIPE Price</th>
          <th>Current</th>
          <th>vs PIPE</th>
          <th>Status</th>
          <th>S-1 Filed</th>
        </tr>
      </thead>
      <tbody>
        ${pipeDeals.map(deal => renderPipeRow(deal)).join('')}
      </tbody>
    </table>
  `;
}

function renderPipeRow(deal) {
  const pipePrice = deal.per_share_price || 0;
  const currentPrice = deal.current_price || 0;
  const vsPipe = pipePrice > 0 && currentPrice > 0 ? ((currentPrice - pipePrice) / pipePrice * 100) : 0;
  const vsPipeClass = vsPipe > 0 ? 'fil-positive' : 'fil-negative';

  const statusMap = {
    'pre_s1': { label: 'Pre-S1', class: '' },
    's1_filed': { label: 'S-1 Filed', class: 'fil-status-warning' },
    's1_effective': { label: 'Effective', class: 'fil-status-critical' },
    'distributing': { label: 'Distributing', class: 'fil-status-critical' },
    'completed': { label: 'Completed', class: 'fil-status-done' }
  };
  const status = statusMap[deal.distribution_status] || { label: deal.distribution_status, class: '' };

  return `
    <tr class="fil-pipe-row" onclick="showPipeDetails('${deal.ticker}')">
      <td class="fil-pipe-ticker"><strong>${deal.ticker}</strong></td>
      <td>$${pipePrice.toFixed(2)}</td>
      <td>$${currentPrice > 0 ? currentPrice.toFixed(2) : '--'}</td>
      <td class="${vsPipeClass}">${currentPrice > 0 ? `${vsPipe >= 0 ? '+' : ''}${vsPipe.toFixed(1)}%` : '--'}</td>
      <td><span class="fil-status-badge ${status.class}">${status.label}</span></td>
      <td>${deal.s1_filed_date ? formatDate(deal.s1_filed_date) : '--'}</td>
    </tr>
  `;
}

// ============== FUNDS GRID ==============

function renderFundsGrid() {
  const container = document.getElementById('filFundsGrid');
  if (!container) return;

  if (!funds || funds.length === 0) {
    container.innerHTML = '<div class="fil-empty">No tracked funds</div>';
    return;
  }

  // Group by fund type
  const byType = {};
  for (const fund of funds) {
    const type = fund.fund_type || 'other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(fund);
  }

  let html = '';
  for (const [type, typeFunds] of Object.entries(byType)) {
    const sortedFunds = typeFunds.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    html += `
      <div class="fil-fund-type-group">
        <div class="fil-fund-type-header">${formatFundType(type)} (${typeFunds.length})</div>
        <div class="fil-fund-type-list">
          ${sortedFunds.map(f => `
            <div class="fil-fund-chip ${f.priority >= 9 ? 'fil-fund-priority' : ''}" onclick="showFundDetails('${f.id}')" title="${f.name}">
              ${f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name}
              ${f.priority >= 9 ? '<span class="fil-fund-badge">P' + f.priority + '</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ============== HOLDINGS ==============

function renderHoldingsStats() {
  if (!holdingsSummary) return;

  const periodEl = document.getElementById('holdPeriod');
  const tickersEl = document.getElementById('holdTickers');
  const fundsEl = document.getElementById('holdFunds');
  const valueEl = document.getElementById('holdValue');

  if (periodEl) periodEl.textContent = holdingsSummary.period ? formatQuarter(holdingsSummary.period) : '--';
  if (tickersEl) tickersEl.textContent = holdingsSummary.summary?.totalTickers || 0;
  if (fundsEl) fundsEl.textContent = holdingsSummary.summary?.totalFunds || 0;
  if (valueEl) {
    const val = holdingsSummary.summary?.totalValue || 0;
    valueEl.textContent = val > 1e9 ? `$${(val / 1e9).toFixed(1)}B` : val > 1e6 ? `$${(val / 1e6).toFixed(0)}M` : '$0';
  }
}

function renderHoldingsTable() {
  const container = document.getElementById('filHoldingsTable');
  if (!container) return;

  const filtered = getFilteredHoldings();
  const countEl = document.getElementById('holdDisplayCount');
  if (countEl) countEl.textContent = filtered.length;

  if (!holdings || holdings.length === 0) {
    container.innerHTML = `
      <div class="fil-empty fil-empty-holdings">
        <i class="fa-solid fa-chart-pie"></i>
        <p>No holdings data yet</p>
        <p class="fil-empty-sub">Holdings are populated when 13F filings are parsed.<br>Run a scan and parse 13F filings to see aggregated holdings.</p>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="fil-empty">No holdings match your filters</div>';
    return;
  }

  container.innerHTML = `
    <table class="fil-table fil-holdings-table">
      <thead>
        <tr>
          <th class="fil-th-ticker">Ticker</th>
          <th class="fil-th-name">Company</th>
          <th class="fil-th-funds"># Funds</th>
          <th class="fil-th-shares">Total Shares</th>
          <th class="fil-th-value">Total Value</th>
          <th class="fil-th-trend">Trend</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(h => renderHoldingRow(h)).join('')}
      </tbody>
    </table>
  `;
}

function renderHoldingRow(holding) {
  const fundsUp = holding.funds_increasing || 0;
  const fundsDown = holding.funds_decreasing || 0;
  const isNew = holding.has_new_positions;

  let trendClass = '';
  let trendIcon = '';
  if (fundsUp > fundsDown) {
    trendClass = 'fil-trend-up';
    trendIcon = `<i class="fa-solid fa-arrow-trend-up"></i> ${fundsUp}`;
  } else if (fundsDown > fundsUp) {
    trendClass = 'fil-trend-down';
    trendIcon = `<i class="fa-solid fa-arrow-trend-down"></i> ${fundsDown}`;
  } else {
    trendIcon = '--';
  }

  return `
    <tr class="fil-holding-row" onclick="showTickerHoldings('${holding.ticker}')">
      <td class="fil-td-ticker">
        <strong>${holding.ticker}</strong>
        ${isNew ? '<span class="fil-new-badge">NEW</span>' : ''}
      </td>
      <td class="fil-td-name">${truncate(holding.issuer_name || '', 30)}</td>
      <td class="fil-td-funds">${holding.fund_count}</td>
      <td class="fil-td-shares">${formatNumber(holding.total_shares)}</td>
      <td class="fil-td-value">${formatValue(holding.total_value)}</td>
      <td class="fil-td-trend ${trendClass}">${trendIcon}</td>
    </tr>
  `;
}

function getFilteredHoldings() {
  let filtered = [...holdings];

  // Search filter
  if (holdingsFilters.search) {
    const search = holdingsFilters.search.toLowerCase();
    filtered = filtered.filter(h =>
      (h.ticker || '').toLowerCase().includes(search) ||
      (h.issuer_name || '').toLowerCase().includes(search)
    );
  }

  // Min funds filter
  if (holdingsFilters.minFunds > 1) {
    filtered = filtered.filter(h => h.fund_count >= holdingsFilters.minFunds);
  }

  // Sort
  const sortKey = holdingsFilters.sortBy;
  if (sortKey === 'value') {
    filtered.sort((a, b) => (b.total_value || 0) - (a.total_value || 0));
  } else if (sortKey === 'shares') {
    filtered.sort((a, b) => (b.total_shares || 0) - (a.total_shares || 0));
  } else if (sortKey === 'funds') {
    filtered.sort((a, b) => (b.fund_count || 0) - (a.fund_count || 0));
  }

  return filtered;
}

function formatQuarter(period) {
  if (!period) return '--';
  const parts = period.split('-');
  const year = parts[0];
  // Handle both YYYY-MM-DD and YYYY-DD-MM (legacy)
  let month = parseInt(parts[1]);
  if (month > 12) month = parseInt(parts[2]); // swap if day was in month position
  const q = Math.ceil(month / 3);
  return `Q${q} ${year}`;
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatValue(v) {
  if (!v) return '$0';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
}

// ============== TAB SWITCHING ==============

window.switchFilingsTab = function(tab) {
  currentTab = tab;

  // Update tab buttons
  document.querySelectorAll('.fil-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Show/hide tab content
  document.getElementById('filTabFilings').classList.toggle('active', tab === 'filings');
  document.getElementById('filTabHoldings').classList.toggle('active', tab === 'holdings');
};

// ============== HOLDINGS ACTIONS ==============

window.searchHoldings = function(query) {
  holdingsFilters.search = query;
  renderHoldingsTable();
};

window.sortHoldings = function() {
  holdingsFilters.sortBy = document.getElementById('holdSortBy')?.value || 'value';
  renderHoldingsTable();
};

window.filterHoldings = function() {
  holdingsFilters.minFunds = parseInt(document.getElementById('holdMinFunds')?.value) || 1;
  renderHoldingsTable();
};

window.showTickerHoldings = async function(ticker) {
  try {
    const data = await fetchHoldingsByTicker(ticker);
    showModal(`${ticker} - Institutional Ownership`, buildTickerHoldingsModal(ticker, data));
  } catch (e) {
    console.error('Failed to load ticker holdings:', e);
    showToast('Failed to load ticker holdings', 'error');
  }
};

function buildTickerHoldingsModal(ticker, data) {
  const latest = data.latestOwnership || [];
  const changes = data.periodComparison?.changes || [];

  let html = `
    <div class="fil-modal-ticker-header">
      <div class="fil-modal-ticker">${ticker}</div>
      <div class="fil-modal-period">Period: ${data.latestPeriod || '--'}</div>
    </div>
    <div class="fil-modal-stats">
      <div class="fil-modal-stat">
        <span class="fil-modal-stat-value">${data.totalFunds || 0}</span>
        <span class="fil-modal-stat-label">Funds</span>
      </div>
      <div class="fil-modal-stat">
        <span class="fil-modal-stat-value">${formatNumber(data.totalShares || 0)}</span>
        <span class="fil-modal-stat-label">Total Shares</span>
      </div>
      <div class="fil-modal-stat">
        <span class="fil-modal-stat-value">${formatValue(data.totalValue || 0)}</span>
        <span class="fil-modal-stat-label">Total Value</span>
      </div>
    </div>
  `;

  if (latest.length > 0) {
    html += `
      <div class="fil-modal-section">
        <h4>Holders</h4>
        <div class="fil-holders-list">
          ${latest.slice(0, 15).map(h => `
            <div class="fil-holder-row">
              <span class="fil-holder-name">${h.fund_name}</span>
              <span class="fil-holder-shares">${formatNumber(h.shares)}</span>
              <span class="fil-holder-value">${formatValue(h.value_usd)}</span>
            </div>
          `).join('')}
          ${latest.length > 15 ? `<div class="fil-more">+${latest.length - 15} more funds</div>` : ''}
        </div>
      </div>
    `;
  }

  if (changes.length > 0) {
    html += `
      <div class="fil-modal-section">
        <h4>Recent Changes</h4>
        <div class="fil-changes-list">
          ${changes.slice(0, 10).map(c => `
            <div class="fil-change-row ${c.type === 'NEW_POSITION' ? 'fil-change-new' : c.type === 'COMPLETE_EXIT' ? 'fil-change-exit' : c.type === 'INCREASED' ? 'fil-change-up' : 'fil-change-down'}">
              <span class="fil-change-fund">${c.fund}</span>
              <span class="fil-change-type">${c.type.replace(/_/g, ' ')}</span>
              ${c.pctChange ? `<span class="fil-change-pct">${c.pctChange > 0 ? '+' : ''}${c.pctChange}%</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return html;
}

// ============== FILTER ACTIONS ==============

window.filterFilings = function(type) {
  currentFilters.type = type;
  document.getElementById('filTypeFilter').value = type;
  renderFilingsTable();
};

window.applyFilters = function() {
  currentFilters.type = document.getElementById('filTypeFilter').value;
  currentFilters.fund = document.getElementById('filFundFilter').value;
  const newDays = parseInt(document.getElementById('filDaysFilter').value);

  if (newDays !== currentFilters.days) {
    currentFilters.days = newDays;
    // Refetch with new days
    fetchFilings({ days: newDays }).then(data => {
      filings = data;
      renderDashboardStats();
      renderFilingsTable();
    });
  } else {
    renderFilingsTable();
  }
};

window.searchFilings = function(query) {
  currentFilters.search = query;
  renderFilingsTable();
};

window.setFilingsView = function(view) {
  currentView = view;
  document.querySelectorAll('.fil-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  renderFilingsTable();
};

window.toggleSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  const header = section?.previousElementSibling;
  const chevron = header?.querySelector('.fil-chevron');

  if (section) {
    section.classList.toggle('fil-collapsed');
    if (chevron) {
      chevron.classList.toggle('fa-chevron-down', !section.classList.contains('fil-collapsed'));
      chevron.classList.toggle('fa-chevron-right', section.classList.contains('fil-collapsed'));
    }
  }
};

// ============== SCAN ACTIONS ==============

window.scanFilings = async function(options = {}) {
  const btn = document.getElementById('scanFilingsBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...';
  }

  const params = new URLSearchParams();
  if (options.days) params.set('days', Math.min(options.days, 365));
  if (options.deep) params.set('deep', 'true');
  if (options.limit) params.set('limit', Math.min(options.limit, 500));
  if (options.types) params.set('types', options.types);

  try {
    const url = `${CONFIG.PROXY_URL}/api/filings/scan${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() }
    });

    const result = await response.json();

    if (result.success) {
      const msg = `Scanned ${result.scanned} funds\nFound ${result.totalNewFilings} new filings`;
      showToast(msg, 'success');
      loadFilings();
    } else {
      showToast('Scan failed: ' + (result.error || 'Unknown error'), 'error');
    }

  } catch (e) {
    console.error('Scan failed:', e);
    showToast('Failed to scan: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-radar"></i> Scan';
    }
  }
};

window.quickScan = () => window.scanFilings({ days: 30, limit: 200 });

window.showScanOptions = function() {
  const modal = document.createElement('div');
  modal.className = 'fil-modal-overlay';
  modal.innerHTML = `
    <div class="fil-modal fil-scan-modal">
      <div class="fil-modal-header">
        <h3>Scan Options</h3>
        <button class="fil-modal-close" onclick="this.closest('.fil-modal-overlay').remove()">&times;</button>
      </div>
      <div class="fil-modal-body">
        <div class="fil-scan-options">
          <div class="fil-option-group">
            <label>Days Back</label>
            <select id="scanDays">
              <option value="7">7 days</option>
              <option value="30" selected>30 days</option>
              <option value="90">90 days</option>
              <option value="180">6 months</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <div class="fil-option-group">
            <label>Limit Per Fund</label>
            <select id="scanLimit">
              <option value="50">50 filings</option>
              <option value="100">100 filings</option>
              <option value="200" selected>200 filings</option>
              <option value="500">500 filings (max)</option>
            </select>
          </div>
          <div class="fil-option-group">
            <label>Filing Types</label>
            <select id="scanTypes">
              <option value="">All Types</option>
              <option value="13F">13F (Holdings)</option>
              <option value="13D,13G">13D/13G (Ownership)</option>
              <option value="8-K">8-K (Events)</option>
              <option value="S-1,EFFECT">S-1/EFFECT (Registration)</option>
              <option value="4">Form 4 (Insider)</option>
            </select>
          </div>
          <div class="fil-option-group fil-option-checkbox">
            <label><input type="checkbox" id="scanDeep"> Deep scan (check full history)</label>
          </div>
        </div>
        <div class="fil-scan-actions">
          <button class="fil-btn fil-btn-secondary" onclick="this.closest('.fil-modal-overlay').remove()">Cancel</button>
          <button class="fil-btn fil-btn-primary" onclick="runScanWithOptions()">Start Scan</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.runScanWithOptions = function() {
  const days = parseInt(document.getElementById('scanDays')?.value) || 30;
  const limit = parseInt(document.getElementById('scanLimit')?.value) || 200;
  const types = document.getElementById('scanTypes')?.value || '';
  const deep = document.getElementById('scanDeep')?.checked || false;
  document.querySelector('.fil-modal-overlay')?.remove();
  window.scanFilings({ days, limit, types: types || undefined, deep });
};

// ============== DETAIL MODALS ==============

window.showFilingDetails = async function(id) {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${id}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const filing = await response.json();
    showModal(`${filing.filing_type} Filing`, buildFilingModal(filing));
  } catch (e) {
    console.error('Failed to load filing:', e);
    showToast('Failed to load filing details', 'error');
  }
};

window.showPipeDetails = async function(ticker) {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/pipe/${ticker}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const deal = await response.json();
    showModal(`PIPE: ${ticker}`, buildPipeModal(deal));
  } catch (e) {
    console.error('Failed to load PIPE:', e);
    showToast('Failed to load PIPE details', 'error');
  }
};

window.showFundDetails = async function(id) {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/funds/${id}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const fund = await response.json();
    showModal(fund.name, buildFundModal(fund));
  } catch (e) {
    console.error('Failed to load fund:', e);
    showToast('Failed to load fund details', 'error');
  }
};

window.trackPipeDeal = function() {
  const modal = document.createElement('div');
  modal.className = 'fil-modal-overlay';
  modal.innerHTML = `
    <div class="fil-modal fil-pipe-modal">
      <div class="fil-modal-header">
        <h3>Track PIPE Deal</h3>
        <button class="fil-modal-close" onclick="this.closest('.fil-modal-overlay').remove()">&times;</button>
      </div>
      <div class="fil-modal-body">
        <div class="fil-pipe-form">
          <div class="fil-form-field">
            <label>Ticker *</label>
            <input type="text" id="pipeTicker" placeholder="e.g. IONQ" autocomplete="off" style="text-transform:uppercase" />
          </div>
          <div class="fil-form-field">
            <label>Announcement Date *</label>
            <input type="date" id="pipeDate" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
          <div class="fil-form-field">
            <label>PIPE Price per Share</label>
            <input type="number" id="pipePrice" placeholder="0.00" step="0.01" min="0" />
          </div>
          <div class="fil-form-field">
            <label>Company Name</label>
            <input type="text" id="pipeCompany" placeholder="Optional" />
          </div>
          <div class="fil-form-field">
            <label>Notes</label>
            <textarea id="pipeNotes" rows="2" placeholder="Optional notes..."></textarea>
          </div>
        </div>
        <div class="fil-scan-actions">
          <button class="fil-btn fil-btn-secondary" onclick="this.closest('.fil-modal-overlay').remove()">Cancel</button>
          <button class="fil-btn fil-btn-primary" onclick="submitPipeDeal()">Track Deal</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.querySelector('#pipeTicker').focus();
};

window.submitPipeDeal = async function() {
  const ticker = document.getElementById('pipeTicker')?.value?.trim().toUpperCase();
  const date = document.getElementById('pipeDate')?.value;
  const price = document.getElementById('pipePrice')?.value;
  const company = document.getElementById('pipeCompany')?.value?.trim();
  const notes = document.getElementById('pipeNotes')?.value?.trim();

  if (!ticker) { showToast('Ticker is required', 'error'); return; }
  if (!date) { showToast('Date is required', 'error'); return; }

  try {
    const body = { announcement_date: date };
    if (price) body.per_share_price = parseFloat(price);
    if (company) body.company_name = company;
    if (notes) body.notes = notes;

    const response = await fetch(`${CONFIG.PROXY_URL}/api/pipe/${ticker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (result.success) {
      document.querySelector('.fil-modal-overlay')?.remove();
      showToast('PIPE deal added', 'success');
      loadFilings();
    } else {
      showToast('Failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Failed to add PIPE deal', 'error');
  }
};

// ============== MODAL BUILDERS ==============

function buildFilingModal(filing) {
  const pd = filing.parsed_data;
  const tickers = extractTickersFromFiling(filing);

  let html = `
    <div class="fil-modal-grid">
      <div class="fil-modal-row"><span class="fil-modal-label">Type</span><span class="fil-feed-type" style="border-color:${getTypeColor(filing.filing_type)};color:${getTypeColor(filing.filing_type)}">${filing.filing_type}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Filer</span><span>${filing.fund_name || filing.filer_name}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">CIK</span><span>${filing.filer_cik}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Filed</span><span>${formatDate(filing.filed_date)}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Subject</span><span>${filing.subject_ticker || '-'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Priority</span><span>${filing.alert_priority}</span></div>
    </div>
  `;

  // Parsed data summary
  if (pd) {
    html += `<div class="fil-modal-section"><h4>Parsed Summary</h4><div class="fil-parsed-summary">`;
    if (pd.positions_count) html += `<div class="fil-parsed-row"><span>Positions</span><span>${pd.positions_count}</span></div>`;
    if (pd.total_value) html += `<div class="fil-parsed-row"><span>Total Value</span><span>${formatValue(pd.total_value)}</span></div>`;
    if (pd.shares_owned) html += `<div class="fil-parsed-row"><span>Shares Owned</span><span>${formatNumber(pd.shares_owned)}</span></div>`;
    if (pd.percent_owned) html += `<div class="fil-parsed-row"><span>% Owned</span><span>${pd.percent_owned}%</span></div>`;
    if (pd.event_type) html += `<div class="fil-parsed-row"><span>Event</span><span>${pd.event_type}</span></div>`;
    if (pd.transaction_type) html += `<div class="fil-parsed-row"><span>Transaction</span><span>${pd.transaction_type}</span></div>`;
    if (pd.shares_transacted) html += `<div class="fil-parsed-row"><span>Shares Transacted</span><span>${formatNumber(pd.shares_transacted)}</span></div>`;
    if (pd.price_per_share) html += `<div class="fil-parsed-row"><span>Price/Share</span><span>$${pd.price_per_share.toFixed(2)}</span></div>`;
    html += `</div></div>`;
  }

  // Ticker chips
  if (tickers.length > 0) {
    html += `<div class="fil-modal-section"><h4>Tickers</h4><div class="fil-ticker-chips">`;
    html += tickers.map(t => `<span class="fil-ticker-chip" onclick="event.stopPropagation()">${t}</span>`).join('');
    html += `</div></div>`;
  }

  // Holdings (13F)
  if (filing.holdings?.length) {
    html += `
      <div class="fil-modal-section">
        <h4>Top Holdings (${filing.holdings.length} total)</h4>
        <div class="fil-holdings-mini">
          ${filing.holdings.slice(0, 10).map(h => `
            <div class="fil-holding-row">
              <span>${h.ticker || h.cusip}</span>
              <span>${h.shares?.toLocaleString()} shares</span>
              <span>$${((h.value_usd || 0) / 1e6).toFixed(1)}M</span>
            </div>
          `).join('')}
          ${filing.holdings.length > 10 ? `<div class="fil-more">+${filing.holdings.length - 10} more</div>` : ''}
        </div>
      </div>
    `;
  }

  html += `<a href="${filing.filing_url}" target="_blank" class="fil-btn fil-btn-primary fil-btn-block">View on SEC EDGAR</a>`;
  return html;
}

function extractTickersFromFiling(filing) {
  const tickers = new Set();
  if (filing.subject_ticker) tickers.add(filing.subject_ticker);
  if (filing.holdings) {
    for (const h of filing.holdings) {
      if (h.ticker) tickers.add(h.ticker);
    }
  }
  if (filing.parsed_data?.tickers) {
    for (const t of filing.parsed_data.tickers) tickers.add(t);
  }
  return [...tickers].slice(0, 20);
}

function buildPipeModal(deal) {
  const sellers = deal.selling_stockholders || [];
  return `
    <div class="fil-modal-grid">
      <div class="fil-modal-row"><span class="fil-modal-label">Company</span><span>${deal.company_name || deal.ticker}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Announced</span><span>${formatDate(deal.announcement_date)}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">PIPE Amount</span><span>${deal.pipe_amount_usd ? `$${(deal.pipe_amount_usd / 1e6).toFixed(1)}M` : '--'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Per Share</span><span>$${deal.per_share_price?.toFixed(2) || '--'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Status</span><span>${deal.distribution_status}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">S-1 Filed</span><span>${deal.s1_filed_date ? formatDate(deal.s1_filed_date) : '--'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">S-1 Effective</span><span>${deal.s1_effective_date ? formatDate(deal.s1_effective_date) : '--'}</span></div>
    </div>
    ${deal.warrant_shares ? `
      <div class="fil-modal-section">
        <h4>Warrants</h4>
        <div class="fil-modal-grid">
          <div class="fil-modal-row"><span class="fil-modal-label">Shares</span><span>${deal.warrant_shares.toLocaleString()}</span></div>
          <div class="fil-modal-row"><span class="fil-modal-label">Strike</span><span>$${deal.warrant_strike?.toFixed(2) || '--'}</span></div>
        </div>
      </div>
    ` : ''}
    ${sellers.length ? `
      <div class="fil-modal-section">
        <h4>Selling Stockholders</h4>
        <ul class="fil-sellers-list">${sellers.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>
    ` : ''}
    ${deal.notes ? `<div class="fil-modal-section"><h4>Notes</h4><p>${deal.notes}</p></div>` : ''}
  `;
}

function buildFundModal(fund) {
  const patterns = fund.known_patterns || [];
  const recentFilings = fund.recentFilings || [];
  return `
    <div class="fil-modal-grid">
      <div class="fil-modal-row"><span class="fil-modal-label">CIK</span><span>${fund.cik}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Type</span><span>${formatFundType(fund.fund_type)}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">AUM</span><span>${fund.aum_approx || '--'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Key Person</span><span>${fund.key_person || '--'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Priority</span><span>${fund.priority}/10</span></div>
    </div>
    ${fund.lineage ? `<div class="fil-modal-section"><h4>Lineage</h4><p>${fund.lineage}</p></div>` : ''}
    ${patterns.length ? `
      <div class="fil-modal-section">
        <h4>Known Patterns</h4>
        <div class="fil-patterns">${patterns.map(p => `<span class="fil-pattern-chip">${p}</span>`).join('')}</div>
      </div>
    ` : ''}
    ${fund.holdingsSummary ? `
      <div class="fil-modal-section">
        <h4>Latest Holdings (${fund.holdingsSummary.period})</h4>
        <div class="fil-modal-grid">
          <div class="fil-modal-row"><span class="fil-modal-label">Positions</span><span>${fund.holdingsSummary.positions}</span></div>
          <div class="fil-modal-row"><span class="fil-modal-label">Total Value</span><span>$${((fund.holdingsSummary.total_value || 0) / 1e9).toFixed(2)}B</span></div>
        </div>
      </div>
    ` : ''}
    ${recentFilings.length ? `
      <div class="fil-modal-section">
        <h4>Recent Filings</h4>
        <div class="fil-recent-list">
          ${recentFilings.map(f => `
            <div class="fil-recent-item ${f.alert_priority === 'critical' ? 'fil-priority-critical' : ''}">
              <span>${f.filing_type}</span>
              <span>${formatDate(f.filed_date)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// ============== HELPERS ==============

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFundType(type) {
  if (!type) return 'Other';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function updateLastScan() {
  const el = document.getElementById('filLastScan');
  if (el) {
    const now = new Date();
    el.textContent = `Last loaded: ${now.toLocaleTimeString()}`;
  }
}

function showLoading() {
  const table = document.getElementById('filFilingsTable');
  if (table) table.innerHTML = '<div class="fil-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
}

function showError(msg) {
  const table = document.getElementById('filFilingsTable');
  if (table) table.innerHTML = `<div class="fil-error">${msg}</div>`;
}

function showModal(title, content) {
  const existing = document.querySelector('.fil-modal-overlay');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'fil-modal-overlay';
  modal.innerHTML = `
    <div class="fil-modal">
      <div class="fil-modal-header">
        <h3>${title}</h3>
        <button class="fil-modal-close" onclick="this.closest('.fil-modal-overlay').remove()">&times;</button>
      </div>
      <div class="fil-modal-body">${content}</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fil-toast fil-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('fil-toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('fil-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
