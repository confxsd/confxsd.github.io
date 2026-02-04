/**
 * Filings Page Module
 * Professional dashboard for institutional SEC filings tracking
 */

import { CONFIG } from './config.js';

// State
let filings = [];
let pipeDeals = [];
let funds = [];
let currentFilters = {
  type: 'all',
  fund: 'all',
  days: 30,
  search: ''
};
let currentView = 'table';

const getUserId = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

/**
 * Load filings page data
 */
export async function loadFilings() {
  try {
    showLoading();

    const [filingsData, pipesData, fundsData] = await Promise.all([
      fetchFilings({ days: currentFilters.days }),
      fetchPipeDeals(),
      fetchFunds()
    ]);

    filings = filingsData;
    pipeDeals = pipesData;
    funds = fundsData;

    populateFundFilter();
    renderDashboardStats();
    renderFilingsTable();
    renderPipeTable();
    renderFundsGrid();
    updateLastScan();

  } catch (e) {
    console.error('Failed to load filings:', e);
    showError('Failed to load filings data');
  }
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

  if (currentView === 'table') {
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
  } else {
    container.innerHTML = `
      <div class="fil-cards-grid">
        ${filtered.map(f => renderFilingCard(f)).join('')}
      </div>
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

function renderFilingCard(filing) {
  const priorityClass = {
    'critical': 'fil-priority-critical',
    'high': 'fil-priority-high'
  }[filing.alert_priority] || '';

  const typeIcon = getTypeIcon(filing.filing_type);

  return `
    <div class="fil-card ${priorityClass}" onclick="showFilingDetails('${filing.id}')">
      <div class="fil-card-header">
        <span class="fil-type-badge">${typeIcon} ${filing.filing_type}</span>
        ${filing.alert_priority !== 'normal' ? `<span class="fil-priority-badge ${priorityClass}">${filing.alert_priority}</span>` : ''}
      </div>
      <div class="fil-card-fund">${filing.fund_name || filing.filer_name || 'Unknown'}</div>
      ${filing.subject_ticker ? `<div class="fil-card-ticker">${filing.subject_ticker}</div>` : ''}
      <div class="fil-card-footer">
        <span class="fil-card-date">${formatDate(filing.filed_date)}</span>
        <a href="${filing.filing_url}" target="_blank" class="fil-link-btn" onclick="event.stopPropagation()">
          <i class="fa-solid fa-external-link"></i>
        </a>
      </div>
    </div>
  `;
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
  document.querySelectorAll('.fil-view-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.fil-view-btn[onclick*="${view}"]`)?.classList.add('active');
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

window.trackPipeDeal = async function() {
  const ticker = prompt('Ticker symbol:');
  if (!ticker) return;
  const date = prompt('Announcement date (YYYY-MM-DD):');
  if (!date) return;
  const price = prompt('PIPE price per share (optional):');

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/pipe/${ticker.toUpperCase()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
      body: JSON.stringify({
        announcement_date: date,
        per_share_price: price ? parseFloat(price) : null
      })
    });
    const result = await response.json();
    if (result.success) {
      showToast('PIPE deal added', 'success');
      loadFilings();
    }
  } catch (e) {
    showToast('Failed to add PIPE deal', 'error');
  }
};

// ============== MODAL BUILDERS ==============

function buildFilingModal(filing) {
  return `
    <div class="fil-modal-grid">
      <div class="fil-modal-row"><span class="fil-modal-label">Type</span><span>${filing.filing_type}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Filer</span><span>${filing.fund_name || filing.filer_name}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">CIK</span><span>${filing.filer_cik}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Filed</span><span>${formatDate(filing.filed_date)}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Subject</span><span>${filing.subject_ticker || '-'}</span></div>
      <div class="fil-modal-row"><span class="fil-modal-label">Priority</span><span>${filing.alert_priority}</span></div>
    </div>
    <a href="${filing.filing_url}" target="_blank" class="fil-btn fil-btn-primary fil-btn-block">View on SEC EDGAR</a>
    ${filing.holdings?.length ? `
      <div class="fil-modal-section">
        <h4>Holdings (${filing.holdings.length})</h4>
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
    ` : ''}
  `;
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
