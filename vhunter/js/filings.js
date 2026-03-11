/**
 * Filings Page Module
 * Professional dashboard for institutional SEC filings tracking
 */

import { CONFIG } from './config.js';
import { addToHistory } from './history.js';

// State
let filings = [];
let pipeDeals = [];
let funds = [];
let holdings = [];
let holdingsSummary = null;
let filingsStats = null;
let currentTab = 'filings';
let hideMegaCap = false;
const MEGA_CAP_TICKERS = new Set([
  'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA','BRK-A','BRK-B',
  'AVGO','JPM','LLY','V','MA','UNH','XOM','COST','HD','PG',
  'JNJ','NFLX','ABBV','WMT','BAC','CRM','ORCL','CVX','MRK','KO',
  'PEP','AMD','ACN','TMO','LIN','MCD','CSCO','ADBE','IBM','GE',
  'ISRG','INTU','TXN','QCOM','AMGN','PFE','BKNG','NOW','HON','AMAT',
  // Major index ETFs
  'SPY','QQQ','IVV','VOO','VTI','IWM','DIA','VEA','VWO','EFA','AGG','BND','TLT','GLD','SLV'
]);

function isMegaCap(ticker) {
  if (!ticker) return false;
  const base = ticker.split(' ')[0].toUpperCase();
  return MEGA_CAP_TICKERS.has(base);
}

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
let holdingsPage = 50; // how many to show initially
let changesData = null;
let changesFilters = {
  search: '',
  changeType: '',
  sortBy: 'value_change',
  minValue: 0
};
let notPricedInMode = false;
let pricePerformanceCache = {}; // { ticker: { periodClose, currentClose, pctChange } }
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

    filings = filingsData.filings || filingsData;
    filingsStats = filingsData.stats || null;
    pipeDeals = pipesData;
    funds = fundsData;
    holdings = holdingsData.holdings || [];
    _holdingsBaseSet = [...holdings];
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
    limit: filters.limit || 500
  });
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.fund_id && filters.fund_id !== 'all') params.set('fund_id', filters.fund_id);
  if (filters.search) params.set('search', filters.search);
  if (filters.offset) params.set('offset', filters.offset);

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
    limit: options.limit || 500,
    min_funds: options.minFunds || 1,
    sort: options.sortBy || 'value'
  });
  if (options.search) params.set('search', options.search);
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

// ============== FILING NOTES API ==============

async function fetchFilingNotes(filingId) {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${filingId}/notes`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function addFilingNote(filingId, content) {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${filingId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
    body: JSON.stringify({ content })
  });
  return response.json();
}

async function deleteFilingNote(filingId, noteId) {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${filingId}/notes/${noteId}`, {
    method: 'DELETE',
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

// ============== DASHBOARD STATS ==============

function renderDashboardStats() {
  // Use server-side stats (accurate full counts) if available, otherwise compute from limited results
  let stats;
  if (filingsStats) {
    stats = filingsStats;
  } else {
    stats = { '13F': 0, '13DG': 0, '8K': 0, 'S1': 0, 'Form4': 0, total: filings.length };
    for (const f of filings) {
      const type = f.filing_type || '';
      if (type.includes('13F')) stats['13F']++;
      else if (type.includes('13D') || type.includes('13G')) stats['13DG']++;
      else if (type.includes('8-K')) stats['8K']++;
      else if (type.includes('S-1') || type.includes('EFFECT')) stats['S1']++;
      else if (type === '4' || type === '4/A') stats['Form4']++;
    }
  }

  document.getElementById('fil13F').textContent = stats['13F'];
  document.getElementById('fil13DG').textContent = stats['13DG'];
  document.getElementById('fil8K').textContent = stats['8K'];
  document.getElementById('filS1').textContent = stats['S1'];
  document.getElementById('filForm4').textContent = stats['Form4'];
  document.getElementById('filTotal').textContent = stats.total;
  document.getElementById('filPipeCount').textContent = pipeDeals.length;
  document.getElementById('filFundsCount').textContent = funds.length;

  // Add delay info subtexts
  const delayInfo = {
    'fil13F': '45-day delay',
    'fil13DG': '~10-day delay',
    'fil8K': 'Same day',
    'filS1': 'Same day',
    'filForm4': '2-day delay',
    'filTotal': `${currentFilters.days}d window`
  };
  for (const [id, text] of Object.entries(delayInfo)) {
    const el = document.getElementById(id);
    if (el) {
      let sub = el.parentElement.querySelector('.stat-delay');
      if (!sub) {
        sub = document.createElement('span');
        sub.className = 'stat-delay';
        sub.style.cssText = 'display:block;font-size:10px;color:var(--text-muted, #888);margin-top:2px;';
        el.parentElement.appendChild(sub);
      }
      sub.textContent = text;
    }
  }
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
  const parsedPreview = buildParsedPreview(filing);
  const notesBadge = filing.notes_count > 0 ? `<span class="fil-note-indicator" title="${filing.notes_count} note(s)"><i class="fa-solid fa-sticky-note"></i>${filing.notes_count}</span>` : '';
  const parsedDot = filing.parsed_data?.parsed ? '<span class="fil-parsed-dot" title="Parsed"></span>' : '';

  return `
    <tr class="fil-row ${priorityClass}" onclick="showFilingDetails('${filing.id}')">
      <td class="fil-td-type">
        <span class="fil-type-badge">${parsedDot}${typeIcon} ${filing.filing_type}</span>
      </td>
      <td class="fil-td-fund">${filing.fund_name || filing.filer_name || 'Unknown'} ${notesBadge}</td>
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
  const notesBadge = filing.notes_count > 0 ? `<span class="fil-note-indicator" title="${filing.notes_count} note(s)"><i class="fa-solid fa-sticky-note"></i>${filing.notes_count}</span>` : '';
  const parsedDot = filing.parsed_data?.parsed ? '<span class="fil-parsed-dot" title="Parsed"></span>' : '';

  // For Form 4, use parsed ticker/insider if subject_ticker is empty
  const pd = filing.parsed_data;
  const ticker = filing.subject_ticker || pd?.issuerTicker || '';
  const isInsider = /^[345](\/A)?$/.test(filing.filing_type);
  const insiderLabel = isInsider && pd?.ownerName ? pd.ownerName : '';

  return `
    <div class="fil-feed-item ${priorityClass}" onclick="showFilingDetails('${filing.id}')">
      <span class="fil-feed-type" style="border-color:${typeColor};color:${typeColor}">${parsedDot}${filing.filing_type}</span>
      <div class="fil-feed-body">
        <div class="fil-feed-top">
          <span class="fil-feed-fund">${filing.fund_name || filing.filer_name || 'Unknown'}</span>
          ${ticker ? `<code class="fil-feed-ticker" onclick="event.stopPropagation()">${ticker}</code>` : ''}
          ${notesBadge}
        </div>
        ${insiderLabel ? `<div class="fil-feed-insider">${insiderLabel}${pd?.ownerRole ? ` · ${pd.ownerRole}` : ''}</div>` : ''}
        ${preview ? `<div class="fil-feed-preview fil-parsed-preview">${preview}</div>` : ''}
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
  if (!pd || !pd.parsed) return '';

  const type = filing.filing_type || '';

  // 13F: positions and value
  if (type.includes('13F')) {
    const positions = pd.totalPositions || pd.positions_count || 0;
    const val = pd.totalValue || pd.total_value || 0;
    const parts = [];
    if (positions) parts.push(`${positions} positions`);
    if (val) parts.push(formatValue(val));
    return parts.join(' · ');
  }

  // 13D/G: ownership percentage
  if (type.includes('13D') || type.includes('13G')) {
    const parts = [];
    if (pd.percentOwned) parts.push(`${pd.percentOwned}% ownership`);
    if (pd.sharesOwned) parts.push(`${formatNumber(pd.sharesOwned)} shares`);
    if (filing.subject_ticker && pd.percentOwned) {
      return `${pd.percentOwned}% ownership in ${filing.subject_ticker}`;
    }
    return parts.join(' · ');
  }

  // 8-K: items
  if (type.includes('8-K') && pd.items?.length) {
    return pd.items.map(i => `Item ${i.number}`).join(', ');
  }

  // Form 4: insider transactions
  if (/^[345]$/.test(type) || /Form [345]/i.test(type)) {
    const parts = [];
    if (pd.ownerName) parts.push(pd.ownerName);
    if (pd.ownerRole) parts.push(pd.ownerRole);
    if (pd.issuerTicker) parts.push(pd.issuerTicker);
    if (pd.netShares) {
      const dir = pd.netShares > 0 ? 'Bought' : 'Sold';
      parts.push(`${dir} ${formatNumber(Math.abs(pd.netShares))} shares`);
    }
    if (pd.estimatedValue) parts.push(formatValue(pd.estimatedValue));
    return parts.join(' · ');
  }

  // S-1
  if (type.includes('S-1') || type === 'EFFECT') {
    const parts = [];
    if (pd.hasSellingStockholders) parts.push('Selling stockholders');
    if (pd.companyName) parts.push(pd.companyName);
    return parts.join(' · ');
  }

  // Fallback
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
  if (!type) return '';
  if (type.includes('13F')) return '<i class="fa-solid fa-chart-pie" style="font-size:11px"></i>';
  if (type.includes('13D')) return '<i class="fa-solid fa-crosshairs" style="font-size:11px"></i>';
  if (type.includes('13G')) return '<i class="fa-solid fa-chart-line" style="font-size:11px"></i>';
  if (type.includes('8-K')) return '<i class="fa-solid fa-bullhorn" style="font-size:11px"></i>';
  if (type.includes('S-1') || type.includes('EFFECT')) return '<i class="fa-solid fa-file-contract" style="font-size:11px"></i>';
  if (type === '4' || type === '4/A') return '<i class="fa-solid fa-user" style="font-size:11px"></i>';
  return '<i class="fa-solid fa-file" style="font-size:11px"></i>';
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

  // Filter out convertible bonds
  filtered = filtered.filter(f => !isConvertible(f.subject_ticker));

  // Mega cap filter
  if (hideMegaCap) {
    filtered = filtered.filter(f => !isMegaCap(f.subject_ticker));
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
        <button class="fil-btn fil-btn-primary" onclick="scanFilings()"><i class="fa-solid fa-radar"></i> Scan Filings</button>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="fil-empty">No holdings match your filters</div>';
    return;
  }

  const visible = filtered.slice(0, holdingsPage);
  const hasMore = filtered.length > holdingsPage;

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
        ${visible.map(h => renderHoldingRow(h)).join('')}
      </tbody>
    </table>
    ${hasMore ? `<div class="fil-load-more"><button class="fil-btn fil-btn-ghost" onclick="loadMoreHoldings()">Show more (${filtered.length - holdingsPage} remaining)</button></div>` : ''}
    ${holdingsFilters._convertibleCount > 0 ? `<div class="fil-convert-notice"><i class="fa-solid fa-info-circle"></i> ${holdingsFilters._convertibleCount} convertible bonds hidden — mostly arb desk positions, not directional equity conviction</div>` : ''}
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

function isConvertible(ticker) {
  return ticker && /\s/.test(ticker.trim());
}

function getFilteredHoldings() {
  let filtered = [...holdings];

  // Filter out convertible bonds/notes
  const convertibleCount = filtered.filter(h => isConvertible(h.ticker)).length;
  filtered = filtered.filter(h => !isConvertible(h.ticker));
  holdingsFilters._convertibleCount = convertibleCount;

  // Search filter
  if (holdingsFilters.search) {
    const search = holdingsFilters.search.toLowerCase();
    filtered = filtered.filter(h =>
      (h.ticker || '').toLowerCase().includes(search) ||
      (h.issuer_name || '').toLowerCase().includes(search)
    );
  }

  // Mega cap filter
  if (hideMegaCap) {
    filtered = filtered.filter(h => !isMegaCap(h.ticker));
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
  document.getElementById('filTabChanges').classList.toggle('active', tab === 'changes');
  document.getElementById('filTabAnalytics').classList.toggle('active', tab === 'analytics');

  // Lazy-load changes on first visit
  if (tab === 'changes' && !changesData) {
    loadChanges();
  }

  // Lazy-load analytics on first visit
  if (tab === 'analytics') {
    import('./filings-analytics.js').then(mod => mod.loadAnalytics());
  }
};

// ============== HOLDINGS ACTIONS ==============

let _holdingsSearchTimer = null;
let _holdingsBaseSet = []; // full unfiltered set from last server load

window.searchHoldings = function(query) {
  holdingsFilters.search = query;
  holdingsPage = 50;
  clearTimeout(_holdingsSearchTimer);
  if (query && query.length >= 1) {
    // Server-side search to cover ALL records
    _holdingsSearchTimer = setTimeout(async () => {
      try {
        const data = await fetchHoldingsAggregated({
          search: query,
          limit: 500,
          sortBy: holdingsFilters.sortBy,
          minFunds: holdingsFilters.minFunds
        });
        holdings = data.holdings || [];
        holdingsSummary = data;
        renderHoldingsStats();
        renderHoldingsTable();
      } catch (_) {}
    }, 300);
    // Immediate client-side filter for responsiveness
    renderHoldingsTable();
  } else {
    // Empty search — restore full set
    holdings = _holdingsBaseSet;
    renderHoldingsTable();
  }
};

window.sortHoldings = async function() {
  holdingsFilters.sortBy = document.getElementById('holdSortBy')?.value || 'value';
  holdingsPage = 50;
  try {
    const data = await fetchHoldingsAggregated({
      sortBy: holdingsFilters.sortBy,
      minFunds: holdingsFilters.minFunds,
      search: holdingsFilters.search || undefined
    });
    holdings = data.holdings || [];
    if (!holdingsFilters.search) _holdingsBaseSet = [...holdings];
    holdingsSummary = data;
    renderHoldingsStats();
    renderHoldingsTable();
  } catch (_) {
    renderHoldingsTable();
  }
};

window.filterHoldings = async function() {
  holdingsFilters.minFunds = parseInt(document.getElementById('holdMinFunds')?.value) || 1;
  holdingsPage = 50;
  try {
    const data = await fetchHoldingsAggregated({
      sortBy: holdingsFilters.sortBy,
      minFunds: holdingsFilters.minFunds,
      search: holdingsFilters.search || undefined
    });
    holdings = data.holdings || [];
    if (!holdingsFilters.search) _holdingsBaseSet = [...holdings];
    holdingsSummary = data;
    renderHoldingsStats();
    renderHoldingsTable();
  } catch (_) {
    renderHoldingsTable();
  }
};

window.loadMoreHoldings = function() {
  holdingsPage += 50;
  renderHoldingsTable();
};

window.toggleMegaCap = function() {
  hideMegaCap = !hideMegaCap;
  const btn = document.getElementById('filHideMegaCap');
  if (btn) btn.classList.toggle('active', hideMegaCap);
  // Re-render current tab
  if (currentTab === 'filings') renderFilingsTable();
  else if (currentTab === 'holdings') renderHoldingsTable();
  else if (currentTab === 'changes') renderChangesTable();
};

window.showTickerHoldings = async function(ticker) {
  try {
    addToHistory(ticker.toUpperCase());
    const data = await fetchHoldingsByTicker(ticker);
    showModal(`${ticker} - Institutional Ownership`, buildTickerHoldingsModal(ticker, data));
  } catch (e) {
    console.error('Failed to load ticker holdings:', e);
    showToast('Failed to load ticker holdings', 'error');
  }
};

// ============== CHANGES TAB ==============

async function loadChanges() {
  const container = document.getElementById('filChangesTable');
  if (container) container.innerHTML = '<div class="fil-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading changes...</div>';

  try {
    const params = new URLSearchParams({ limit: '500' });
    const type = changesFilters.changeType;
    if (type) params.set('change_type', type);
    params.set('sort', changesFilters.sortBy);
    if (changesFilters.minValue > 0) params.set('min_value', changesFilters.minValue);

    const response = await fetch(`${CONFIG.PROXY_URL}/api/holdings/changes?${params}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    changesData = await response.json();
    renderChangesSummary();
    renderChangesTable();
  } catch (e) {
    console.error('Failed to load changes:', e);
    if (container) container.innerHTML = '<div class="fil-empty">Failed to load changes data</div>';
  }
}

function renderChangesSummary() {
  if (!changesData?.summary) return;
  const s = changesData.summary;
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  el('changesPeriod', changesData.period ? formatQuarter(changesData.period) : '--');
  el('changesNew', s.new_positions || 0);
  el('changesExits', s.exits || 0);
  el('changesInc', s.increases || 0);
  el('changesDec', s.decreases || 0);
  el('changesFunds', s.funds_reporting || 0);
}

function renderChangesTable() {
  const container = document.getElementById('filChangesTable');
  if (!container) return;

  // Toggle info banner
  const banner = document.getElementById('changesNpiBanner');
  if (banner) banner.style.display = notPricedInMode ? 'flex' : 'none';

  let items = changesData?.changes || [];

  // Filter out convertible bonds
  items = items.filter(c => !isConvertible(c.ticker));

  // Mega cap filter
  if (hideMegaCap) {
    items = items.filter(c => !isMegaCap(c.ticker));
  }

  // Client-side search filter
  if (changesFilters.search) {
    const q = changesFilters.search.toLowerCase();
    items = items.filter(c =>
      (c.ticker || '').toLowerCase().includes(q) ||
      (c.fund_name || '').toLowerCase().includes(q) ||
      (c.issuer_name || '').toLowerCase().includes(q)
    );
  }

  // Not priced in filter
  if (notPricedInMode) {
    items = items.filter(c => c.change_type !== 'UNCHANGED' && isNotPricedIn(c));
  }

  const countEl = document.getElementById('changesDisplayCount');
  if (countEl) countEl.textContent = items.length;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="fil-empty">
        <i class="fa-solid fa-arrows-rotate"></i>
        <p>No changes data yet</p>
        <p class="fil-empty-sub">Changes are computed when 13F filings are parsed across multiple quarters.<br>Run a backfill to populate historical data.</p>
      </div>`;
    return;
  }

  const showPriceCol = notPricedInMode || Object.keys(pricePerformanceCache).length > 0;

  container.innerHTML = `
    <table class="fil-table fil-holdings-table fil-changes-table">
      <thead>
        <tr>
          <th class="fil-ch-type">Change</th>
          <th>Ticker</th>
          <th class="fil-ch-fund">Fund</th>
          <th class="fil-th-value fil-ch-shares">Shares</th>
          <th class="fil-th-value">Value</th>
          <th class="fil-th-value">Change</th>
          ${showPriceCol ? '<th class="fil-th-value">Price</th>' : ''}
          <th class="fil-th-value">Weight</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(c => renderChangeRow(c, showPriceCol)).join('')}
      </tbody>
    </table>
  `;
}

function renderChangeRow(c, showPriceCol = false) {
  const typeConfig = {
    NEW: { label: 'NEW', cls: 'fil-change-new', icon: 'fa-plus' },
    EXIT: { label: 'EXIT', cls: 'fil-change-exit', icon: 'fa-xmark' },
    INCREASE: { label: 'INC', cls: 'fil-change-inc', icon: 'fa-arrow-up' },
    DECREASE: { label: 'DEC', cls: 'fil-change-dec', icon: 'fa-arrow-down' },
    UNCHANGED: { label: '—', cls: 'fil-change-unch', icon: 'fa-minus' }
  };
  const t = typeConfig[c.change_type] || typeConfig.UNCHANGED;

  const shareStr = c.change_type === 'EXIT'
    ? `<span class="fil-trend-down">${formatNumber(c.prior_shares)}</span>`
    : formatNumber(c.current_shares);

  const valueStr = c.change_type === 'EXIT'
    ? `<span class="fil-trend-down">${formatValue(c.prior_value)}</span>`
    : formatValue(c.current_value);

  let changeStr = '';
  if (c.change_type === 'NEW') {
    changeStr = `<span class="fil-trend-up">+${formatNumber(c.current_shares)}</span>`;
  } else if (c.change_type === 'EXIT') {
    changeStr = `<span class="fil-trend-down">-${formatNumber(c.prior_shares)}</span>`;
  } else if (c.share_change > 0) {
    changeStr = `<span class="fil-trend-up">+${formatNumber(c.share_change)}</span>`;
    if (c.pct_change) changeStr += ` <small class="fil-trend-up">(+${c.pct_change.toFixed(0)}%)</small>`;
  } else if (c.share_change < 0) {
    changeStr = `<span class="fil-trend-down">${formatNumber(c.share_change)}</span>`;
    if (c.pct_change) changeStr += ` <small class="fil-trend-down">(${c.pct_change.toFixed(0)}%)</small>`;
  } else {
    changeStr = '--';
  }

  const weight = c.weight_current_pct != null ? `${c.weight_current_pct.toFixed(1)}%` : '--';

  const priceBadge = showPriceCol ? `<td class="fil-td-value">${getPricePerformanceBadge(c)}</td>` : '';
  const notPricedCls = notPricedInMode && isNotPricedIn(c) ? 'fil-row-flagged' : '';

  return `
    <tr class="fil-holding-row ${notPricedCls}" onclick="showTickerHoldings('${c.ticker || ''}')">
      <td class="fil-ch-type"><span class="fil-change-badge ${t.cls}"><i class="fa-solid ${t.icon}"></i> ${t.label}</span></td>
      <td class="fil-td-ticker"><strong>${c.ticker || c.cusip}</strong></td>
      <td class="fil-td-name fil-ch-fund" title="${c.fund_name}">${truncate(c.fund_name || '', 25)}</td>
      <td class="fil-td-value fil-ch-shares">${shareStr}</td>
      <td class="fil-td-value">${valueStr}</td>
      <td class="fil-td-value">${changeStr}</td>
      ${priceBadge}
      <td class="fil-td-value">${weight}</td>
    </tr>
  `;
}

window.searchChanges = function(query) {
  changesFilters.search = query;
  renderChangesTable();
};

window.filterChanges = function() {
  changesFilters.changeType = document.getElementById('changesTypeFilter')?.value || '';
  changesFilters.sortBy = document.getElementById('changesSortBy')?.value || 'value_change';
  changesFilters.minValue = parseInt(document.getElementById('changesMinValue')?.value) || 0;
  changesData = null; // Force reload with new server-side filters
  loadChanges();
};

// ============== NOT PRICED IN FEATURE ==============

window.toggleNotPricedIn = async function() {
  notPricedInMode = !notPricedInMode;
  const btn = document.getElementById('changesNotPricedInBtn');
  if (btn) btn.classList.toggle('active', notPricedInMode);

  if (notPricedInMode && changesData?.changes?.length) {
    btn?.classList.add('loading');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
    try {
      await fetchPricePerformance();
    } catch (e) {
      console.error('Failed to fetch price performance:', e);
    }
    btn.innerHTML = '<i class="fa-solid fa-eye"></i> Not Priced In';
    btn?.classList.remove('loading');
  }
  renderChangesTable();
};

async function fetchPricePerformance() {
  if (!changesData?.changes?.length || !changesData?.period) return;

  const tickers = [...new Set(
    changesData.changes
      .filter(c => c.ticker && c.change_type !== 'UNCHANGED')
      .map(c => c.ticker)
  )];

  // Only fetch tickers we haven't cached yet
  const toFetch = tickers.filter(t => !pricePerformanceCache[t]);
  if (!toFetch.length) return;

  const periodDate = changesData.period; // e.g. "2025-12-31"
  const today = new Date().toISOString().split('T')[0];

  // Batch fetch in groups of 10 to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const r = await fetch(
          `${CONFIG.PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/range/1/day/${periodDate}/${today}?adjusted=true&sort=asc&limit=250`
        );
        if (!r.ok) return;
        const data = await r.json();
        const bars = data?.results;
        if (!bars?.length) return;

        const periodClose = bars[0].c;
        const currentClose = bars[bars.length - 1].c;
        const pctChange = ((currentClose - periodClose) / periodClose) * 100;

        pricePerformanceCache[ticker] = { periodClose, currentClose, pctChange };
      } catch {
        // Skip failed tickers
      }
    }));
  }
}

function isNotPricedIn(change) {
  const perf = pricePerformanceCache[change.ticker];
  if (!perf) return false;

  const threshold = 3; // % threshold - moves under this are considered "not priced in"

  switch (change.change_type) {
    case 'NEW':
    case 'INCREASE':
      // Fund is bullish but price hasn't moved up meaningfully
      return perf.pctChange < threshold;
    case 'EXIT':
    case 'DECREASE':
      // Fund is bearish but price hasn't dropped meaningfully
      return perf.pctChange > -threshold;
    default:
      return false;
  }
}

function getPricePerformanceBadge(change) {
  const perf = pricePerformanceCache[change.ticker];
  if (!perf) return '';

  const pct = perf.pctChange;
  const sign = pct >= 0 ? '+' : '';
  const cls = pct >= 0 ? 'fil-price-up' : 'fil-price-down';
  const notPriced = isNotPricedIn(change);
  const flagCls = notPriced ? 'fil-not-priced' : '';

  const direction = (change.change_type === 'NEW' || change.change_type === 'INCREASE') ? 'bullish' : 'bearish';
  const expected = direction === 'bullish' ? 'rise' : 'fall';
  const tooltip = notPriced
    ? `Fund is ${direction} but price hasn't ${expected} yet (${sign}${pct.toFixed(1)}% since ${changesData?.period || 'filing'})`
    : `Price ${sign}${pct.toFixed(1)}% since ${changesData?.period || 'filing'}`;

  return `<span class="fil-price-badge ${cls} ${flagCls}" title="${tooltip}">
    ${sign}${pct.toFixed(1)}%
    ${notPriced ? '<i class="fa-solid fa-circle-exclamation"></i>' : ''}
  </span>`;
}

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
              <span class="fil-holder-name fil-clickable" onclick="event.stopPropagation(); showFundDetails('${h.fund_id}')">${h.fund_name}</span>
              <span class="fil-holder-shares">${formatNumber(h.shares)}</span>
              <span class="fil-holder-value">${formatValue(h.value_usd)}</span>
            </div>
          `).join('')}
          ${latest.length > 15 ? `<div class="fil-more">+${latest.length - 15} more funds</div>` : ''}
        </div>
      </div>
    `;
  }

  // Merge 13F changes with Form 4 / 13D/G filing changes, sorted by date desc
  const filingChanges = data.filingChanges || [];
  const pc0 = data.periodComparison || {};
  const allChanges = [
    ...changes.map(c => ({ ...c, source: '13F', filed_date: pc0.current || '2000-01-01' })),
    ...filingChanges.map(c => ({ ...c, source: c.filing_type }))
  ].sort((a, b) => (b.filed_date || '').localeCompare(a.filed_date || ''));

  if (allChanges.length > 0) {
    const pc = data.periodComparison || {};

    const sourceIcon = (src) => {
      if (src === '13F') return '<i class="fa-solid fa-chart-pie" style="color:#6366f1;font-size:10px" title="13F"></i>';
      if (src === '4') return '<i class="fa-solid fa-user" style="color:#10b981;font-size:10px" title="Form 4"></i>';
      if (src === '13D') return '<i class="fa-solid fa-crosshairs" style="color:#ef4444;font-size:10px" title="13D"></i>';
      if (src === '13G') return '<i class="fa-solid fa-chart-line" style="color:#f59e0b;font-size:10px" title="13G"></i>';
      return '';
    };

    const actionIcon = (c) => {
      const t = c.type;
      if (t === 'INCREASED' || t === 'INSIDER_BUY' || t === 'ACTIVIST_STAKE' || t === 'PASSIVE_STAKE') return '<i class="fa-solid fa-arrow-trend-up"></i>';
      if (t === 'DECREASED' || t === 'INSIDER_SELL') return '<i class="fa-solid fa-arrow-trend-down"></i>';
      if (t === 'NEW_POSITION') return '<i class="fa-solid fa-plus"></i>';
      if (t === 'COMPLETE_EXIT') return '<i class="fa-solid fa-xmark"></i>';
      return '';
    };

    const actionColor = (c) => {
      const t = c.type;
      if (t === 'INCREASED' || t === 'INSIDER_BUY') return '#10b981';
      if (t === 'DECREASED' || t === 'INSIDER_SELL' || t === 'COMPLETE_EXIT') return '#ef4444';
      if (t === 'NEW_POSITION') return '#6366f1';
      if (t === 'ACTIVIST_STAKE') return '#ef4444';
      if (t === 'PASSIVE_STAKE') return '#f59e0b';
      return '#64748b';
    };

    const changeDetail = (c) => {
      if (c.source === '13F' && c.pctChange) {
        const color = c.pctChange > 0 ? '#10b981' : '#ef4444';
        return `<span style="color:${color};font-weight:600">${c.pctChange > 0 ? '+' : ''}${c.pctChange}%</span>`;
      }
      if (c.source === '4') {
        const parts = [];
        if (c.shares) parts.push(formatNumber(c.shares) + ' sh');
        if (c.price) parts.push('@$' + Number(c.price).toFixed(2));
        const dateStr = c.filed_date ? `<div style="color:#94a3b8;font-size:10px">${c.filed_date}</div>` : '';
        return (parts.length ? `<span style="color:${actionColor(c)};font-weight:600">${parts.join(' ')}</span>` : '') + dateStr;
      }
      if (c.source === '13D' || c.source === '13G') {
        const dateStr = c.filed_date ? `<div style="color:#94a3b8;font-size:10px">${c.filed_date}</div>` : '';
        return (c.pctOwned ? `<span style="font-weight:600">${c.pctOwned}%</span>` : '') + dateStr;
      }
      return '';
    };

    const changeRowClass = (c) => {
      if (c.type === 'NEW_POSITION') return 'fil-change-new';
      if (c.type === 'COMPLETE_EXIT' || c.type === 'INSIDER_SELL') return 'fil-change-exit';
      if (c.type === 'INCREASED' || c.type === 'INSIDER_BUY' || c.type === 'ACTIVIST_STAKE' || c.type === 'PASSIVE_STAKE') return 'fil-change-up';
      return 'fil-change-down';
    };

    html += `
      <div class="fil-modal-section">
        <h4>Recent Changes</h4>
        ${pc.current ? `<div class="fil-changes-meta">
          <span class="fil-changes-periods">${pc.previous || '?'} → ${pc.current}</span>
          <span class="fil-changes-delay">13F ~45d delay</span>
        </div>` : ''}
        <div class="fil-types-legend fil-types-legend--modal">
          <div class="fil-legend-item">
            <i class="fa-solid fa-chart-pie" style="color:#6366f1"></i>
            <div><strong>13F</strong><span>Institutional holdings. ~45 day delay.</span></div>
          </div>
          <div class="fil-legend-item">
            <i class="fa-solid fa-user" style="color:#10b981"></i>
            <div><strong>Form 4</strong><span>Insider trades. 2 day delay.</span></div>
          </div>
          <div class="fil-legend-item">
            <i class="fa-solid fa-crosshairs" style="color:#ef4444"></i>
            <div><strong>13D</strong><span>Activist >5%. ~10 day delay.</span></div>
          </div>
          <div class="fil-legend-item">
            <i class="fa-solid fa-chart-line" style="color:#f59e0b"></i>
            <div><strong>13G</strong><span>Passive >5%. ~10 day delay.</span></div>
          </div>
        </div>
        <div class="fil-changes-list fil-changes-scroll">
          ${allChanges.map((c, i) => `
            <div class="fil-change-row ${changeRowClass(c)}"${i >= 10 ? ' style="display:none"' : ''} data-change-idx="${i}">
              <span class="fil-change-source" title="${c.source}">${sourceIcon(c.source)}</span>
              <span class="fil-change-fund ${c.fund_id ? 'fil-clickable' : ''}" ${c.fund_id ? `onclick="event.stopPropagation(); showFundDetails('${c.fund_id}')"` : ''}>${c.fund}</span>
              <span class="fil-change-type" style="color:${actionColor(c)}" title="${(c.type || '').replace(/_/g, ' ')}">${actionIcon(c)}</span>
              <span class="fil-change-pct">${changeDetail(c)}</span>
            </div>
          `).join('')}
        </div>
        ${allChanges.length > 10 ? `<div class="fil-more fil-more-toggle" onclick="window._loadMoreChanges(this, ${allChanges.length})">+${allChanges.length - 10} more changes</div>` : ''}
      </div>
    `;
  }

  return html;
}

// ============== FILTER ACTIONS ==============

window.filterFilings = function(type) {
  currentFilters.type = type;
  document.getElementById('filTypeFilter').value = type;
  reloadFilings();
};

window.applyFilters = function() {
  const newType = document.getElementById('filTypeFilter').value;
  const newFund = document.getElementById('filFundFilter').value;
  const newDays = parseInt(document.getElementById('filDaysFilter').value);

  const needsRefetch = newDays !== currentFilters.days ||
    newFund !== currentFilters.fund ||
    newType !== currentFilters.type;

  currentFilters.type = newType;
  currentFilters.fund = newFund;
  currentFilters.days = newDays;

  if (needsRefetch) {
    reloadFilings();
  } else {
    renderFilingsTable();
  }
};

async function reloadFilings() {
  const fetchOpts = { days: currentFilters.days };
  if (currentFilters.fund && currentFilters.fund !== 'all') {
    fetchOpts.fund_id = currentFilters.fund;
    fetchOpts.limit = 2000;
  }
  if (currentFilters.type && currentFilters.type !== 'all') {
    fetchOpts.type = currentFilters.type;
  }
  if (currentFilters.search && currentFilters.search.length >= 3) {
    fetchOpts.search = currentFilters.search;
    fetchOpts.limit = 2000;
  }
  const data = await fetchFilings(fetchOpts);
  filings = data.filings || data;
  filingsStats = data.stats || null;
  renderDashboardStats();
  renderFilingsTable();
}

let _searchDebounce = null;
window.searchFilings = function(query) {
  currentFilters.search = query;
  // Immediate client-side filter for responsiveness
  renderFilingsTable();
  // Debounced server-side refetch for complete results
  clearTimeout(_searchDebounce);
  if (query.length >= 3) {
    _searchDebounce = setTimeout(() => reloadFilings(), 400);
  } else if (query.length === 0) {
    reloadFilings();
  }
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

window._toggleHoldings = function(btn, moreCount) {
  const wrap = btn.closest('.fil-modal-section').querySelector('.fil-holdings-wrap');
  const rows = wrap.querySelectorAll('tbody tr');
  const isHidden = rows[20]?.style.display === 'none';
  for (let i = 20; i < rows.length; i++) {
    rows[i].style.display = isHidden ? '' : 'none';
  }
  btn.textContent = isHidden ? 'Show less' : `+${moreCount} more positions`;
};

window._loadMoreChanges = function(btn, total) {
  const list = btn.closest('.fil-modal-section').querySelector('.fil-changes-list');
  const hidden = list.querySelectorAll('.fil-change-row[style*="display:none"]');
  const batch = 10;
  let shown = 0;
  for (const row of hidden) {
    if (shown >= batch) break;
    row.style.display = '';
    shown++;
  }
  const remaining = hidden.length - shown;
  if (remaining > 0) {
    btn.textContent = `+${remaining} more changes`;
  } else {
    btn.remove();
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

      // Auto-trigger parsing for new + unparsed filings
      if (result.totalNewFilings > 0) {
        try {
          await fetch(`${CONFIG.PROXY_URL}/api/filings/parse-batch?reset_stubs=true&limit=200`, {
            method: 'POST',
            headers: { 'X-User-Id': getUserId() }
          });
        } catch (_) { /* parsing is best-effort */ }
      }

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
          <button class="fil-btn fil-btn-secondary" onclick="reparseUnparsed(this)"><i class="fa-solid fa-rotate"></i> Re-parse Unparsed</button>
          <button class="fil-btn fil-btn-primary" onclick="runScanWithOptions()">Start Scan</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

window.reparseUnparsed = async function(btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Parsing...';
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/parse-batch?reset_stubs=true&limit=200`, {
      method: 'POST',
      headers: { 'X-User-Id': getUserId() }
    });
    const result = await response.json();
    showToast(`Reset ${result.resetCount || 0}, enqueued ${result.enqueued || 0} for parsing`, 'success');
    document.querySelector('.fil-modal-overlay')?.remove();
    setTimeout(() => loadFilings(), 3000);
  } catch (e) {
    showToast('Re-parse failed: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Re-parse Unparsed';
  }
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
  const modal = showModal('Loading...', '<div class="fil-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading filing...</div>');
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${id}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const filing = await response.json();

    // If not parsed yet, try on-demand parsing
    if (!filing.parsed_data?.parsed) {
      try {
        const parseResp = await fetch(`${CONFIG.PROXY_URL}/api/filings/${id}/parse`, {
          method: 'POST',
          headers: { 'X-User-Id': getUserId() }
        });
        const parseResult = await parseResp.json();
        if (parseResult.parsedData) {
          filing.parsed_data = parseResult.parsedData;
        }
      } catch (_) { /* parsing is best-effort */ }
    }

    updateModal(modal, `${filing.filing_type} Filing`, buildFilingModal(filing), 'fil-detail-modal');
  } catch (e) {
    console.error('Failed to load filing:', e);
    showToast('Failed to load filing details', 'error');
    modal.remove();
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
  const modal = showModal('Loading...', '<div class="fil-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading fund...</div>');
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/funds/${id}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const fund = await response.json();
    updateModal(modal, fund.name, buildFundModal(fund));
  } catch (e) {
    console.error('Failed to load fund:', e);
    showToast('Failed to load fund details', 'error');
    modal.remove();
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

// ============== MODAL BUILDERS — TYPE-AWARE ==============

function buildFilingModal(filing) {
  const type = filing.filing_type || '';
  const pd = filing.parsed_data;

  // Route to type-specific builder
  if (type.includes('13F')) return build13FModal(filing);
  if (type.includes('13D') || type.includes('13G')) return build13DGModal(filing);
  if (type.includes('8-K')) return build8KModal(filing);
  if (type.includes('S-1') || type === 'EFFECT') return buildS1Modal(filing);
  if (/^[345]$/.test(type) || /Form [345]/i.test(type)) return buildInsiderModal(filing);

  // Default/fallback
  return buildGenericFilingModal(filing);
}

function build13FModal(filing) {
  const pd = filing.parsed_data || {};
  const period = pd.period ? formatQuarter(pd.period) : formatDate(filing.filed_date);
  const totalVal = pd.totalValue || pd.total_value || 0;
  const posCount = pd.totalPositions || pd.positions_count || 0;

  // Count put/call
  let puts = 0, calls = 0;
  if (filing.holdings) {
    for (const h of filing.holdings) {
      if (h.put_call === 'Put') puts++;
      else if (h.put_call === 'Call') calls++;
    }
  }

  let html = `
    <div class="fil-detail-header fil-detail-13f">
      <div class="fil-detail-header-top">
        <span class="fil-detail-type-label">13F Holdings Report</span>
      </div>
      <div class="fil-detail-header-title">${filing.fund_name || filing.filer_name}</div>
      <div class="fil-detail-header-sub">${period}</div>
    </div>
    <div class="fil-detail-stats">
      <div class="fil-detail-stat">
        <span class="fil-detail-stat-value">${formatValue(totalVal)}</span>
        <span class="fil-detail-stat-label">Total Value</span>
      </div>
      <div class="fil-detail-stat">
        <span class="fil-detail-stat-value">${posCount}</span>
        <span class="fil-detail-stat-label">Positions</span>
      </div>
      <div class="fil-detail-stat">
        <span class="fil-detail-stat-value">${puts}</span>
        <span class="fil-detail-stat-label">Puts</span>
      </div>
      <div class="fil-detail-stat">
        <span class="fil-detail-stat-value">${calls}</span>
        <span class="fil-detail-stat-label">Calls</span>
      </div>
    </div>
  `;

  // Holdings table
  if (filing.holdings?.length) {
    const hasMore = filing.holdings.length > 20;
    const moreCount = filing.holdings.length - 20;
    const holdingRows = (list, hidden) => list.map(h => {
      const pct = totalVal > 0 ? ((h.value_usd || 0) / totalVal * 100).toFixed(1) : '0.0';
      const typeLabel = h.put_call === 'Put' ? '<span style="color:#ef4444;font-weight:600;font-size:11px">PUT</span>'
        : h.put_call === 'Call' ? '<span style="color:#22c55e;font-weight:600;font-size:11px">CALL</span>' : '';
      return `<tr${hidden ? ' style="display:none"' : ''}>
        <td class="fil-td-ticker">${h.ticker || h.cusip || '-'}</td>
        <td class="fil-td-name">${truncate(h.issuer_name || '', 25)}</td>
        <td style="text-align:center">${typeLabel}</td>
        <td class="fil-td-shares">${formatNumber(h.shares)}</td>
        <td class="fil-td-value">${formatValue(h.value_usd)}</td>
        <td>${pct}%</td>
      </tr>`;
    }).join('');

    html += `
      <div class="fil-modal-section">
        <h4>Top Holdings</h4>
        <div class="fil-holdings-wrap">
          <table class="fil-detail-holdings-table">
            <thead><tr><th>Ticker</th><th>Company</th><th>Type</th><th>Shares</th><th>Value</th><th>%</th></tr></thead>
            <tbody>
              ${holdingRows(filing.holdings.slice(0, 20), false)}
              ${hasMore ? holdingRows(filing.holdings.slice(20), true) : ''}
            </tbody>
          </table>
        </div>
        ${hasMore ? `<div class="fil-more fil-more-toggle" onclick="window._toggleHoldings(this, ${moreCount})">+${moreCount} more positions</div>` : ''}
      </div>
    `;
  }

  // Changes section — show quarter-over-quarter diffs for this fund
  if (filing.fund_id) {
    html += `
      <div class="fil-modal-section" id="fil13fChanges">
        <h4>Quarter Changes</h4>
        <div class="fil-loading" id="fil13fChangesLoading"><i class="fa-solid fa-spinner fa-spin"></i> Loading changes...</div>
      </div>
    `;
    // Load async after modal renders
    setTimeout(() => load13FChanges(filing.fund_id, pd.period || null), 50);
  }

  html += buildNotesSection(filing);
  html += buildMetadataFooter(filing);

  return html;
}

async function load13FChanges(fundId, period) {
  const container = document.getElementById('fil13fChanges');
  const loading = document.getElementById('fil13fChangesLoading');
  if (!container) return;

  try {
    const params = new URLSearchParams({ fund_id: fundId, limit: '200' });
    if (period) params.set('period', period);
    const response = await fetch(`${CONFIG.PROXY_URL}/api/holdings/changes?${params}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const data = await response.json();
    const changes = data.changes || [];

    if (loading) loading.remove();

    if (changes.length === 0) {
      container.innerHTML += '<p class="fil-empty-sub">No prior quarter to compare (need 2+ quarters of data)</p>';
      return;
    }

    const newPos = changes.filter(c => c.change_type === 'NEW');
    const exits = changes.filter(c => c.change_type === 'EXIT');
    const increases = changes.filter(c => c.change_type === 'INCREASE').sort((a, b) => (b.pct_change || 0) - (a.pct_change || 0));
    const decreases = changes.filter(c => c.change_type === 'DECREASE').sort((a, b) => (a.pct_change || 0) - (b.pct_change || 0));

    let html = `
      <div class="fil-detail-stats" style="margin-bottom:12px">
        <div class="fil-detail-stat"><span class="fil-detail-stat-value fil-trend-up">${newPos.length}</span><span class="fil-detail-stat-label">New</span></div>
        <div class="fil-detail-stat"><span class="fil-detail-stat-value fil-trend-down">${exits.length}</span><span class="fil-detail-stat-label">Exits</span></div>
        <div class="fil-detail-stat"><span class="fil-detail-stat-value" style="color:#3b82f6">${increases.length}</span><span class="fil-detail-stat-label">Increased</span></div>
        <div class="fil-detail-stat"><span class="fil-detail-stat-value" style="color:#f97316">${decreases.length}</span><span class="fil-detail-stat-label">Decreased</span></div>
      </div>
    `;

    const buildChangeTable = (items, label, showPrior) => {
      if (items.length === 0) return '';
      const rows = items.slice(0, 15).map(c => {
        const pctStr = c.pct_change != null ? `${c.pct_change > 0 ? '+' : ''}${c.pct_change.toFixed(0)}%` : '';
        return `<tr>
          <td class="fil-td-ticker">${c.ticker || c.cusip || '-'}</td>
          <td class="fil-td-name">${truncate(c.issuer_name || '', 20)}</td>
          <td class="fil-td-value">${formatNumber(showPrior ? c.prior_shares : c.current_shares)}</td>
          <td class="fil-td-value">${formatValue(showPrior ? c.prior_value : c.current_value)}</td>
          <td class="fil-td-value">${pctStr}</td>
        </tr>`;
      }).join('');
      return `
        <div style="margin-bottom:10px">
          <div style="font-weight:600;font-size:12px;margin-bottom:4px;color:#64748b">${label} (${items.length})</div>
          <table class="fil-detail-holdings-table">
            <thead><tr><th>Ticker</th><th>Company</th><th>Shares</th><th>Value</th><th>Chg</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          ${items.length > 15 ? `<div class="fil-empty-sub">+${items.length - 15} more</div>` : ''}
        </div>
      `;
    };

    html += buildChangeTable(newPos, 'New Positions', false);
    html += buildChangeTable(exits, 'Exited Positions', true);
    html += buildChangeTable(increases, 'Increased', false);
    html += buildChangeTable(decreases, 'Decreased', false);

    container.innerHTML = '<h4>Quarter Changes</h4>' + html;
  } catch (e) {
    console.error('Failed to load 13F changes:', e);
    if (loading) loading.textContent = 'Failed to load changes';
  }
}

function build13DGModal(filing) {
  const pd = filing.parsed_data || {};

  let html = `
    <div class="fil-detail-header fil-detail-13dg">
      <div class="fil-detail-header-top">
        <span class="fil-detail-type-label">${filing.filing_type} Ownership Filing</span>
      </div>
      <div class="fil-detail-header-title">${filing.fund_name || filing.filer_name}</div>
      ${pd.subjectCompany || filing.subject_ticker ? `
        <div class="fil-detail-header-sub">
          <i class="fa-solid fa-arrow-right"></i>
          ${pd.subjectCompany || ''} ${filing.subject_ticker ? `(${filing.subject_ticker})` : ''}
        </div>
      ` : ''}
    </div>
    <div class="fil-detail-stats">
      ${pd.percentOwned ? `
        <div class="fil-detail-stat fil-detail-stat-accent">
          <span class="fil-detail-stat-value">${pd.percentOwned}%</span>
          <span class="fil-detail-stat-label">Ownership</span>
        </div>
      ` : ''}
      ${pd.sharesOwned ? `
        <div class="fil-detail-stat">
          <span class="fil-detail-stat-value">${formatNumber(pd.sharesOwned)}</span>
          <span class="fil-detail-stat-label">Shares</span>
        </div>
      ` : ''}
      ${pd.reportingPersonType ? `
        <div class="fil-detail-stat">
          <span class="fil-detail-stat-value">${pd.reportingPersonType}</span>
          <span class="fil-detail-stat-label">Entity Type</span>
        </div>
      ` : ''}
    </div>
  `;

  if (pd.purpose) {
    html += `
      <div class="fil-modal-section">
        <h4>Purpose of Transaction</h4>
        <p class="fil-detail-excerpt">${escapeHtml(pd.purpose)}</p>
      </div>
    `;
  }

  html += buildNotesSection(filing);
  html += buildMetadataFooter(filing);

  return html;
}

function build8KModal(filing) {
  const pd = filing.parsed_data || {};

  let html = `
    <div class="fil-detail-header fil-detail-8k">
      <div class="fil-detail-header-top">
        <span class="fil-detail-type-label">8-K Current Report</span>
        ${filing.alert_priority !== 'normal' ? `<span class="fil-detail-priority-badge fil-priority-${filing.alert_priority}">${filing.alert_priority}</span>` : ''}
      </div>
      <div class="fil-detail-header-title">${filing.fund_name || filing.filer_name}</div>
      <div class="fil-detail-header-sub">${formatDate(filing.filed_date)}</div>
    </div>
  `;

  // Item badges
  if (pd.items?.length) {
    html += `
      <div class="fil-modal-section">
        <h4>Items Reported</h4>
        <div class="fil-item-badges">
          ${pd.items.map(item => `
            <div class="fil-item-badge">
              <span class="fil-item-badge-num">Item ${item.number}</span>
              <span class="fil-item-badge-desc">${item.description}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (pd.excerpt) {
    html += `
      <div class="fil-modal-section">
        <h4>Excerpt</h4>
        <p class="fil-detail-excerpt">${escapeHtml(pd.excerpt)}</p>
      </div>
    `;
  }

  html += buildNotesSection(filing);
  html += buildMetadataFooter(filing);

  return html;
}

function buildS1Modal(filing) {
  const pd = filing.parsed_data || {};

  let html = `
    <div class="fil-detail-header fil-detail-s1">
      <div class="fil-detail-header-top">
        <span class="fil-detail-type-label">${filing.filing_type === 'EFFECT' ? 'S-1 Effective Notice' : 'S-1 Registration'}</span>
      </div>
      <div class="fil-detail-header-title">${pd.companyName || filing.fund_name || filing.filer_name}</div>
      <div class="fil-detail-header-sub">${formatDate(filing.filed_date)}</div>
    </div>
    <div class="fil-detail-stats">
      <div class="fil-detail-stat ${pd.hasSellingStockholders ? 'fil-detail-stat-warn' : ''}">
        <span class="fil-detail-stat-value">${pd.hasSellingStockholders ? 'Yes' : 'No'}</span>
        <span class="fil-detail-stat-label">Selling Stockholders</span>
      </div>
    </div>
  `;

  if (pd.excerpt) {
    html += `
      <div class="fil-modal-section">
        <h4>Prospectus Summary</h4>
        <p class="fil-detail-excerpt">${escapeHtml(pd.excerpt)}</p>
      </div>
    `;
  }

  html += buildNotesSection(filing);
  html += buildMetadataFooter(filing);

  return html;
}

function buildInsiderModal(filing) {
  const pd = filing.parsed_data || {};
  const ticker = pd.issuerTicker || filing.subject_ticker || '';
  const company = pd.issuerName || filing.fund_name || filing.filer_name || '';
  const owner = pd.ownerName || '';
  const role = pd.ownerRole || '';
  const netShares = pd.netShares || 0;
  const estValue = pd.estimatedValue || 0;
  const txCount = pd.transactionCount || 0;
  const isBuy = netShares > 0;
  const isSell = netShares < 0;

  let html = `
    <div class="fil-detail-header fil-detail-insider">
      <div class="fil-detail-header-top">
        <span class="fil-detail-type-label">Form ${filing.filing_type} Insider Filing</span>
        ${isBuy ? '<span class="fil-detail-priority-badge fil-detail-priority-badge-buy">BUY</span>' :
          isSell ? '<span class="fil-detail-priority-badge fil-detail-priority-badge-sell">SELL</span>' : ''}
      </div>
      <div class="fil-detail-header-title">${owner || company}</div>
      <div class="fil-detail-header-sub">
        ${role ? `${role}` : ''}${role && ticker ? ' · ' : ''}${ticker ? `<strong>${ticker}</strong>` : ''}${company && owner ? ` · ${company}` : ''}
      </div>
    </div>
    <div class="fil-detail-stats">
      <div class="fil-detail-stat ${isBuy ? 'fil-detail-stat-accent' : isSell ? 'fil-detail-stat-warn' : ''}">
        <span class="fil-detail-stat-value">${netShares > 0 ? '+' : ''}${formatNumber(netShares)}</span>
        <span class="fil-detail-stat-label">Net Shares</span>
      </div>
      <div class="fil-detail-stat">
        <span class="fil-detail-stat-value">${formatValue(estValue)}</span>
        <span class="fil-detail-stat-label">Est. Value</span>
      </div>
      <div class="fil-detail-stat">
        <span class="fil-detail-stat-value">${txCount}</span>
        <span class="fil-detail-stat-label">Transactions</span>
      </div>
      <div class="fil-detail-stat">
        <span class="fil-detail-stat-value">${formatDate(filing.filed_date)}</span>
        <span class="fil-detail-stat-label">Filed</span>
      </div>
    </div>
  `;

  // Transactions table
  const txns = pd.transactions || [];
  if (txns.length) {
    const txRows = txns.map(tx => {
      const isAcq = (tx.acquiredDisposed || '').toLowerCase().startsWith('a');
      const dir = isAcq ? 'Acquired' : 'Disposed';
      const dirClass = isAcq ? 'fil-trend-up' : 'fil-trend-down';
      const price = tx.pricePerShare != null ? `$${Number(tx.pricePerShare).toFixed(2)}` : '-';
      const shares = tx.shares != null ? formatNumber(tx.shares) : '-';
      const security = tx.security || 'Common Stock';
      // Truncate security name
      const secShort = security.length > 35 ? security.slice(0, 35) + '...' : security;
      return `<tr>
        <td><span class="${dirClass}" style="font-weight:600">${dir}</span></td>
        <td title="${escapeHtml(security)}">${escapeHtml(secShort)}</td>
        <td style="text-align:right">${shares}</td>
        <td style="text-align:right">${price}</td>
      </tr>`;
    }).join('');

    html += `
      <div class="fil-modal-section">
        <h4>Transactions</h4>
        <div class="fil-holdings-wrap">
          <table class="fil-detail-holdings-table">
            <thead><tr><th>Direction</th><th>Security</th><th style="text-align:right">Shares</th><th style="text-align:right">Price</th></tr></thead>
            <tbody>${txRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Holdings after transaction
  const holdings = pd.holdings || [];
  if (holdings.length) {
    const holdRows = holdings.map(h => {
      const ownership = h.directIndirect === 'D' ? 'Direct' : h.directIndirect === 'I' ? 'Indirect' : (h.directIndirect || '-');
      return `<tr>
        <td>${escapeHtml(h.security || 'Common Stock')}</td>
        <td style="text-align:right">${formatNumber(h.shares || h.sharesOwned || 0)}</td>
        <td>${ownership}</td>
      </tr>`;
    }).join('');

    html += `
      <div class="fil-modal-section">
        <h4>Post-Transaction Holdings</h4>
        <div class="fil-holdings-wrap">
          <table class="fil-detail-holdings-table">
            <thead><tr><th>Security</th><th style="text-align:right">Shares Held</th><th>Ownership</th></tr></thead>
            <tbody>${holdRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  html += buildNotesSection(filing);
  html += buildMetadataFooter(filing);

  return html;
}

function buildGenericFilingModal(filing) {
  const pd = filing.parsed_data;
  const tickers = extractTickersFromFiling(filing);

  let html = `
    <div class="fil-modal-grid">
      <div class="fil-modal-row"><span class="fil-modal-label">Type</span><span class="fil-feed-type" style="border-color:${getTypeColor(filing.filing_type)};color:${getTypeColor(filing.filing_type)}">${filing.filing_type}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Filer</span><span>${filing.fund_name || filing.filer_name}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Filed</span><span>${formatDate(filing.filed_date)}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Subject</span><span>${filing.subject_ticker || '-'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Priority</span><span>${filing.alert_priority}</span></div>
    </div>
  `;

  // Parsed data summary
  if (pd) {
    html += `<div class="fil-modal-section"><h4>Parsed Summary</h4><div class="fil-parsed-summary">`;
    for (const [key, val] of Object.entries(pd)) {
      if (key === 'parsed' || key === 'note' || key === 'documentUrl' || key === 'filingType' || key === 'filerName') continue;
      if (val === null || val === undefined) continue;
      html += `<div class="fil-parsed-row"><span>${key}</span><span>${typeof val === 'object' ? JSON.stringify(val) : val}</span></div>`;
    }
    html += `</div></div>`;
  }

  if (tickers.length > 0) {
    html += `<div class="fil-modal-section"><h4>Tickers</h4><div class="fil-ticker-chips">`;
    html += tickers.map(t => `<span class="fil-ticker-chip">${t}</span>`).join('');
    html += `</div></div>`;
  }

  html += buildNotesSection(filing);
  html += buildMetadataFooter(filing);

  return html;
}

// ============== NOTES SECTION ==============

function buildNotesSection(filing) {
  const notes = filing.notes || [];

  return `
    <div class="fil-modal-section fil-notes-section">
      <h4>Analyst Notes</h4>
      <div class="fil-note-input">
        <textarea id="filNoteInput_${filing.id}" class="fil-note-textarea" placeholder="Add observation..." rows="2"></textarea>
        <button class="fil-btn fil-btn-primary fil-btn-sm" onclick="submitFilingNote('${filing.id}')">Add Note</button>
      </div>
      <div class="fil-notes-list" id="filNotesList_${filing.id}">
        ${notes.length > 0 ? notes.map(n => buildNoteCard(filing.id, n)).join('') : '<div class="fil-notes-empty">No notes yet</div>'}
      </div>
    </div>
  `;
}

function buildNoteCard(filingId, note) {
  const time = formatRelativeDate(note.created_at);
  return `
    <div class="fil-note-card" id="fnote_${note.id}">
      <div class="fil-note-card-content">${escapeHtml(note.content)}</div>
      <div class="fil-note-card-footer">
        <span class="fil-note-card-time">${time}</span>
        <button class="fil-note-card-delete" onclick="event.stopPropagation(); deleteNote('${filingId}', '${note.id}')" title="Delete note">&times;</button>
      </div>
    </div>
  `;
}

window.submitFilingNote = async function(filingId) {
  const textarea = document.getElementById(`filNoteInput_${filingId}`);
  const content = textarea?.value?.trim();
  if (!content) return;

  try {
    textarea.disabled = true;
    const result = await addFilingNote(filingId, content);
    if (result.success) {
      textarea.value = '';
      // Refresh notes list
      const notes = await fetchFilingNotes(filingId);
      const list = document.getElementById(`filNotesList_${filingId}`);
      if (list) {
        list.innerHTML = notes.length > 0
          ? notes.map(n => buildNoteCard(filingId, n)).join('')
          : '<div class="fil-notes-empty">No notes yet</div>';
      }
      // Update notes_count in the filings array
      const filing = filings.find(f => f.id === filingId);
      if (filing) filing.notes_count = (filing.notes_count || 0) + 1;
    }
  } catch (e) {
    showToast('Failed to add note', 'error');
  } finally {
    if (textarea) textarea.disabled = false;
  }
};

window.deleteNote = async function(filingId, noteId) {
  try {
    const result = await deleteFilingNote(filingId, noteId);
    if (result.success) {
      const el = document.getElementById(`fnote_${noteId}`);
      if (el) el.remove();
      // Check if list is now empty
      const list = document.getElementById(`filNotesList_${filingId}`);
      if (list && list.children.length === 0) {
        list.innerHTML = '<div class="fil-notes-empty">No notes yet</div>';
      }
      const filing = filings.find(f => f.id === filingId);
      if (filing && filing.notes_count > 0) filing.notes_count--;
    }
  } catch (e) {
    showToast('Failed to delete note', 'error');
  }
};

// ============== METADATA FOOTER ==============

function buildMetadataFooter(filing) {
  const pd = filing.parsed_data || {};
  const type = filing.filing_type || '';
  const hasParser = type.includes('13F') || type.includes('13D') || type.includes('13G') || type.includes('8-K') || type.includes('S-1') || type === 'EFFECT';

  return `
    <div class="fil-detail-footer">
      <div class="fil-detail-footer-row">
        <span>CIK: ${filing.filer_cik}</span>
        <span>Accession: ${filing.accession_number}</span>
      </div>
      <div class="fil-detail-footer-row">
        <span>Accepted: ${filing.accepted_date ? formatDate(filing.accepted_date) : '--'}</span>
        ${pd.parsed ? '<span class="fil-parsed-indicator">Parsed</span>' : '<span class="fil-unparsed-indicator">Not parsed</span>'}
      </div>
      ${!pd.parsed && hasParser ? `
        <button class="fil-btn fil-btn-secondary fil-btn-block fil-parse-btn" onclick="parseFilingServer('${filing.id}')">
          <i class="fa-solid fa-rotate"></i> Parse Filing
        </button>
      ` : ''}
      <a href="${pd.documentUrl || filing.filing_url}" target="_blank" class="fil-btn fil-btn-primary fil-btn-block">View on SEC EDGAR</a>
    </div>
  `;
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
            <div class="fil-recent-item fil-clickable ${f.alert_priority === 'critical' ? 'fil-priority-critical' : ''}" onclick="event.stopPropagation(); showFilingDetails('${f.id}')">
              <span>${f.filing_type}</span>
              <span>${formatDate(f.filed_date)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// ============== SERVER-SIDE PARSE TRIGGER ==============

/**
 * Trigger server-side parse for an unparsed filing
 */
window.parseFilingServer = async function(id) {
  const btn = document.querySelector('.fil-parse-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Parsing...';
  }

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${id}/parse`, {
      method: 'POST',
      headers: { 'X-User-Id': getUserId() }
    });
    const result = await response.json();

    if (result.success && result.parsedData?.parsed) {
      showToast('Filing parsed successfully', 'success');
      // Re-open modal with fresh data
      window.showFilingDetails(id);
    } else {
      showToast('Parse failed — SEC may be rate limiting. Try again later.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Retry Parse';
      }
    }
  } catch (e) {
    console.error('Parse failed:', e);
    showToast('Parse failed', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Retry Parse';
    }
  }
};

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

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function showModal(title, content, extraClass = '') {
  const existing = document.querySelectorAll('.fil-modal-overlay');
  const zBase = 1000 + existing.length;

  const modal = document.createElement('div');
  modal.className = 'fil-modal-overlay';
  modal.style.zIndex = zBase;
  modal.innerHTML = `
    <div class="fil-modal ${extraClass}">
      <div class="fil-modal-header">
        <h3>${title}</h3>
        <button class="fil-modal-close">&times;</button>
      </div>
      <div class="fil-modal-body">${content}</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.fil-modal-close').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  return modal;
}

function updateModal(modal, title, content, extraClass = '') {
  const inner = modal.querySelector('.fil-modal');
  if (inner) inner.className = `fil-modal ${extraClass}`;
  const h3 = modal.querySelector('.fil-modal-header h3');
  if (h3) h3.textContent = title;
  const body = modal.querySelector('.fil-modal-body');
  if (body) body.innerHTML = content;
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
