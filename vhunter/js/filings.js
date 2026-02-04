/**
 * Filings Page Module
 * Displays institutional SEC filings, PIPE deals, and filing signals
 */

import { CONFIG } from './config.js';

// State
let filings = [];
let signals = [];
let pipeDeals = [];
let funds = [];
let dashboardStats = null;

// User ID helper
const getUserId = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

/**
 * Load filings page data
 */
export async function loadFilings() {
  try {
    // Fetch all data in parallel
    const [filingsData, signalsData, pipesData, fundsData, dashboardData] = await Promise.all([
      fetchFilings(),
      fetchSignals(),
      fetchPipeDeals(),
      fetchFunds(),
      fetchSignalsDashboard()
    ]);

    filings = filingsData;
    signals = signalsData;
    pipeDeals = pipesData;
    funds = fundsData;
    dashboardStats = dashboardData;

    renderDashboard();
    renderSignals();
    renderPipeTable();
    renderFilingsList();
    renderFundsGrid();

  } catch (e) {
    console.error('Failed to load filings:', e);
    showEmptyState('Failed to load filings data');
  }
}

// ============== API CALLS ==============

async function fetchFilings(filters = {}) {
  const params = new URLSearchParams({
    days: filters.days || 30,
    limit: 100
  });
  if (filters.type) params.set('type', filters.type);
  if (filters.ticker) params.set('ticker', filters.ticker);

  const response = await fetch(`${CONFIG.PROXY_URL}/api/filings?${params}`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function fetchSignals() {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/filing-signals?status=active&limit=50`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function fetchSignalsDashboard() {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/filing-signals/dashboard`, {
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

// ============== RENDERING ==============

function renderDashboard() {
  const stats = dashboardStats || {};
  const buckets = stats.convictionBuckets || {};

  document.getElementById('filCritical').textContent = buckets.critical || 0;
  document.getElementById('filHigh').textContent = buckets.high || 0;
  document.getElementById('filRecent').textContent = filings.length || 0;
  document.getElementById('filPipeActive').textContent = pipeDeals.length || 0;
}

function renderSignals() {
  const container = document.getElementById('filSignalsList');
  if (!container) return;

  if (!signals || signals.length === 0) {
    container.innerHTML = '<div class="fil-empty">No active signals</div>';
    return;
  }

  // Sort by conviction
  const sorted = [...signals].sort((a, b) => (b.conviction || 0) - (a.conviction || 0));

  container.innerHTML = sorted.slice(0, 10).map(signal => renderSignalCard(signal)).join('');
}

function renderSignalCard(signal) {
  const directionIcon = {
    'bullish': '📈',
    'bearish': '📉',
    'event': '🔔',
    'neutral': '➡️'
  }[signal.direction] || '🔔';

  const directionClass = `fil-signal-${signal.direction}`;
  const convictionClass = signal.conviction >= 80 ? 'fil-conviction-critical' :
                          signal.conviction >= 60 ? 'fil-conviction-high' : 'fil-conviction-normal';

  return `
    <div class="fil-signal-card ${directionClass}">
      <div class="fil-signal-header">
        <span class="fil-signal-icon">${directionIcon}</span>
        <span class="fil-signal-type">${formatSignalType(signal.signal_type)}</span>
        <span class="fil-signal-ticker">${signal.ticker}</span>
        <span class="fil-signal-conviction ${convictionClass}">${signal.conviction}%</span>
        <span class="fil-signal-direction">${signal.direction}</span>
      </div>
      <div class="fil-signal-narrative">${signal.narrative}</div>
      ${signal.suggested_action ? `<div class="fil-signal-action">${signal.suggested_action}</div>` : ''}
      <div class="fil-signal-meta">
        <span class="fil-signal-horizon">${signal.time_horizon}</span>
        <span class="fil-signal-age">${formatAge(signal.created_at)}</span>
      </div>
    </div>
  `;
}

function renderPipeTable() {
  const container = document.getElementById('filPipeTable');
  if (!container) return;

  if (!pipeDeals || pipeDeals.length === 0) {
    container.innerHTML = '<div class="fil-empty">No active PIPE deals being tracked</div>';
    return;
  }

  const tableHtml = `
    <table class="fil-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>PIPE Price</th>
          <th>Current</th>
          <th>vs PIPE</th>
          <th>Status</th>
          <th>Dates</th>
        </tr>
      </thead>
      <tbody>
        ${pipeDeals.map(deal => renderPipeRow(deal)).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = tableHtml;
}

function renderPipeRow(deal) {
  const pipePrice = deal.per_share_price || 0;
  const currentPrice = deal.current_price || 0;
  const vsPipe = pipePrice > 0 && currentPrice > 0 ? ((currentPrice - pipePrice) / pipePrice * 100) : 0;
  const vsPipeClass = vsPipe > 0 ? 'fil-positive' : 'fil-negative';

  const statusBadge = {
    'pre_s1': '⏳ Pre-S1',
    's1_filed': '📄 S-1 Filed',
    's1_effective': '🚨 S-1 Effective',
    'distributing': '📉 Distributing',
    'completed': '✅ Completed'
  }[deal.distribution_status] || deal.distribution_status;

  const statusClass = {
    's1_effective': 'fil-status-critical',
    'distributing': 'fil-status-critical',
    's1_filed': 'fil-status-warning'
  }[deal.distribution_status] || '';

  return `
    <tr class="fil-pipe-row" onclick="showPipeDetails('${deal.ticker}')">
      <td class="fil-pipe-ticker">${deal.ticker}</td>
      <td>$${pipePrice.toFixed(2)}</td>
      <td>$${currentPrice.toFixed(2)}</td>
      <td class="${vsPipeClass}">${vsPipe >= 0 ? '+' : ''}${vsPipe.toFixed(1)}%</td>
      <td><span class="fil-status-badge ${statusClass}">${statusBadge}</span></td>
      <td class="fil-pipe-dates">
        ${deal.s1_filed_date ? `S-1: ${formatDate(deal.s1_filed_date)}` : ''}
        ${deal.s1_effective_date ? ` | Eff: ${formatDate(deal.s1_effective_date)}` : ''}
      </td>
    </tr>
  `;
}

function renderFilingsList() {
  const container = document.getElementById('filFilingsList');
  if (!container) return;

  if (!filings || filings.length === 0) {
    container.innerHTML = '<div class="fil-empty">No recent filings found</div>';
    return;
  }

  // Group by type
  const byType = {};
  for (const filing of filings) {
    const type = filing.filing_type || 'other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(filing);
  }

  let html = '';
  for (const [type, typeFilings] of Object.entries(byType)) {
    html += `
      <div class="fil-type-group">
        <div class="fil-type-header">
          <span class="fil-type-label">${type}</span>
          <span class="fil-type-count">${typeFilings.length}</span>
        </div>
        <div class="fil-type-items">
          ${typeFilings.slice(0, 10).map(f => renderFilingCard(f)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderFilingCard(filing) {
  const priorityClass = {
    'critical': 'fil-priority-critical',
    'high': 'fil-priority-high',
    'normal': '',
    'low': 'fil-priority-low'
  }[filing.alert_priority] || '';

  const tickers = filing.tickers_mentioned || [];
  const tickersHtml = tickers.length > 0 ?
    `<div class="fil-filing-tickers">${tickers.slice(0, 5).map(t => `<span class="fil-ticker-chip">${t}</span>`).join('')}</div>` : '';

  return `
    <div class="fil-filing-card ${priorityClass}" onclick="showFilingDetails('${filing.id}')">
      <div class="fil-filing-header">
        <span class="fil-filing-type">${filing.filing_type}</span>
        <span class="fil-filing-filer">${filing.fund_name || filing.filer_name || 'Unknown'}</span>
        <span class="fil-filing-date">${formatDate(filing.filed_date)}</span>
        ${filing.alert_priority !== 'normal' ? `<span class="fil-priority-badge ${priorityClass}">${filing.alert_priority.toUpperCase()}</span>` : ''}
      </div>
      ${filing.subject_ticker ? `<div class="fil-filing-subject">Subject: ${filing.subject_ticker}</div>` : ''}
      ${tickersHtml}
    </div>
  `;
}

function renderFundsGrid() {
  const container = document.getElementById('filFundsGrid');
  if (!container) return;

  if (!funds || funds.length === 0) {
    container.innerHTML = '<div class="fil-empty">No tracked funds</div>';
    return;
  }

  const html = funds.map(fund => `
    <div class="fil-fund-card" onclick="showFundDetails('${fund.id}')">
      <div class="fil-fund-name">${fund.name}</div>
      <div class="fil-fund-meta">
        <span class="fil-fund-type">${formatFundType(fund.fund_type)}</span>
        ${fund.aum_approx ? `<span class="fil-fund-aum">${fund.aum_approx}</span>` : ''}
      </div>
      <div class="fil-fund-priority">Priority: ${fund.priority}/10</div>
      ${fund.key_person ? `<div class="fil-fund-person">${fund.key_person}</div>` : ''}
    </div>
  `).join('');

  container.innerHTML = html;
}

function showEmptyState(message) {
  const container = document.getElementById('filSignalsList');
  if (container) {
    container.innerHTML = `
      <div class="fil-empty-state">
        <div class="fil-empty-icon">📋</div>
        <div class="fil-empty-text">${message || 'No filings data'}</div>
      </div>
    `;
  }
}

// ============== ACTIONS ==============

/**
 * Scan for new filings with options
 * @param {Object} options - Scan options
 * @param {number} options.days - Days to look back (default 30, max 365)
 * @param {boolean} options.deep - Deep scan all history (default false)
 * @param {number} options.limit - Max filings per fund (default 200, max 500)
 */
window.scanFilings = async function(options = {}) {
  const btn = document.getElementById('scanFilingsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Scanning...';
  }

  // Build query params from options
  const params = new URLSearchParams();
  if (options.days) params.set('days', Math.min(options.days, 365));
  if (options.deep) params.set('deep', 'true');
  if (options.limit) params.set('limit', Math.min(options.limit, 500));
  if (options.types) params.set('types', options.types);

  try {
    const url = `${CONFIG.PROXY_URL}/api/filings/scan${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId()
      }
    });

    const result = await response.json();

    if (result.success) {
      const totalNew = result.totalNewFilings || result.results?.reduce((sum, r) => sum + (r.newFilings || 0), 0) || 0;
      const totalScanned = result.results?.reduce((sum, r) => sum + (r.scannedCount || 0), 0) || 0;
      alert(`Scan complete!\n${result.scanned} funds scanned\n${totalScanned} filings checked\n${totalNew} new filings found\n\nLookback: ${result.daysBack} days\nDeep scan: ${result.deepScan ? 'Yes' : 'No'}`);
      loadFilings();
    } else {
      alert('Scan failed: ' + (result.error || 'Unknown error'));
    }

  } catch (e) {
    console.error('Scan failed:', e);
    alert('Failed to scan filings: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Scan Now';
    }
  }
};

/**
 * Show scan options dialog
 */
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
            <label>
              <input type="checkbox" id="scanDeep">
              Deep scan (don't stop at old filings)
            </label>
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

/**
 * Run scan with selected options
 */
window.runScanWithOptions = function() {
  const days = parseInt(document.getElementById('scanDays')?.value) || 30;
  const limit = parseInt(document.getElementById('scanLimit')?.value) || 200;
  const types = document.getElementById('scanTypes')?.value || '';
  const deep = document.getElementById('scanDeep')?.checked || false;

  // Close the modal
  document.querySelector('.fil-modal-overlay')?.remove();

  // Run the scan with options
  window.scanFilings({ days, limit, types: types || undefined, deep });
};

/**
 * Quick scan - scan all funds with default options
 */
window.quickScan = function() {
  window.scanFilings({ days: 30, limit: 200 });
};

/**
 * Deep historical scan - scan all history
 */
window.deepScan = function() {
  if (confirm('Deep scan will check up to 500 filings per fund for the last year. This may take a while. Continue?')) {
    window.scanFilings({ days: 365, limit: 500, deep: true });
  }
};

/**
 * Generate signals from recent filings
 */
window.generateFilingSignals = async function() {
  const btn = document.getElementById('generateSignalsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating...';
  }

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/filing-signals/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId()
      }
    });

    const result = await response.json();

    if (result.success) {
      alert(`Signal generation complete!\n${result.generated} new signals created`);
      loadFilings();
    } else {
      alert('Generation failed: ' + (result.error || 'Unknown error'));
    }

  } catch (e) {
    console.error('Signal generation failed:', e);
    alert('Failed to generate signals: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate';
    }
  }
};

/**
 * Filter filings by type
 */
window.filterFilingsByType = async function(type) {
  try {
    filings = await fetchFilings({ type: type === 'all' ? null : type });
    renderFilingsList();
  } catch (e) {
    console.error('Filter failed:', e);
  }
};

/**
 * Show filing details modal
 */
window.showFilingDetails = async function(id) {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/filings/${id}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const filing = await response.json();

    const content = buildFilingModalContent(filing);
    showModal(`Filing: ${filing.filing_type}`, content);

  } catch (e) {
    console.error('Failed to load filing:', e);
    alert('Failed to load filing details');
  }
};

/**
 * Show PIPE deal details modal
 */
window.showPipeDetails = async function(ticker) {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/pipe/${ticker}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const deal = await response.json();

    const content = buildPipeModalContent(deal);
    showModal(`PIPE Deal: ${ticker}`, content);

  } catch (e) {
    console.error('Failed to load PIPE deal:', e);
    alert('Failed to load PIPE deal details');
  }
};

/**
 * Show fund details modal
 */
window.showFundDetails = async function(id) {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/funds/${id}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    const fund = await response.json();

    const content = buildFundModalContent(fund);
    showModal(`Fund: ${fund.name}`, content);

  } catch (e) {
    console.error('Failed to load fund:', e);
    alert('Failed to load fund details');
  }
};

/**
 * Add PIPE deal to tracking
 */
window.trackPipeDeal = async function() {
  const ticker = prompt('Enter ticker symbol:');
  if (!ticker) return;

  const announcementDate = prompt('Announcement date (YYYY-MM-DD):');
  if (!announcementDate) return;

  const pipePrice = prompt('PIPE price per share:');

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/pipe/${ticker.toUpperCase()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId()
      },
      body: JSON.stringify({
        announcement_date: announcementDate,
        per_share_price: pipePrice ? parseFloat(pipePrice) : null
      })
    });

    const result = await response.json();

    if (result.success) {
      alert('PIPE deal added to tracking');
      loadFilings();
    } else {
      alert('Failed to add PIPE deal');
    }

  } catch (e) {
    console.error('Failed to track PIPE:', e);
    alert('Failed to add PIPE deal: ' + e.message);
  }
};

// ============== MODAL CONTENT BUILDERS ==============

function buildFilingModalContent(filing) {
  let html = '<div class="fil-modal-content">';

  html += `
    <div class="fil-modal-section">
      <h4>Filing Details</h4>
      <div class="fil-detail-grid">
        <div class="fil-detail-item"><span class="fil-detail-label">Type:</span> ${filing.filing_type}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Filer:</span> ${filing.filer_name || 'Unknown'}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">CIK:</span> ${filing.filer_cik}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Filed:</span> ${formatDate(filing.filed_date)}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Priority:</span> ${filing.alert_priority}</div>
      </div>
      <a href="${filing.filing_url}" target="_blank" class="fil-link">View on SEC EDGAR</a>
    </div>
  `;

  if (filing.fund_name) {
    html += `
      <div class="fil-modal-section">
        <h4>Fund Info</h4>
        <div class="fil-detail-item"><span class="fil-detail-label">Fund:</span> ${filing.fund_name}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Type:</span> ${formatFundType(filing.fund_type)}</div>
      </div>
    `;
  }

  if (filing.holdings?.length > 0) {
    html += `
      <div class="fil-modal-section">
        <h4>Holdings (${filing.holdings.length})</h4>
        <table class="fil-table fil-holdings-table">
          <thead><tr><th>Ticker</th><th>Issuer</th><th>Shares</th><th>Value</th></tr></thead>
          <tbody>
            ${filing.holdings.slice(0, 20).map(h => `
              <tr>
                <td>${h.ticker || h.cusip}</td>
                <td>${h.issuer_name?.slice(0, 30) || ''}</td>
                <td>${h.shares?.toLocaleString() || 0}</td>
                <td>$${((h.value_usd || 0) / 1e6).toFixed(1)}M</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

function buildPipeModalContent(deal) {
  const sellers = deal.selling_stockholders || [];

  let html = '<div class="fil-modal-content">';

  html += `
    <div class="fil-modal-section">
      <h4>Deal Terms</h4>
      <div class="fil-detail-grid">
        <div class="fil-detail-item"><span class="fil-detail-label">Company:</span> ${deal.company_name || deal.ticker}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Announcement:</span> ${formatDate(deal.announcement_date)}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">PIPE Amount:</span> ${deal.pipe_amount_usd ? `$${(deal.pipe_amount_usd / 1e6).toFixed(1)}M` : 'N/A'}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Per Share:</span> $${deal.per_share_price?.toFixed(2) || 'N/A'}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Shares:</span> ${deal.shares_issued?.toLocaleString() || 'N/A'}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Status:</span> ${deal.distribution_status}</div>
      </div>
    </div>
  `;

  if (deal.warrant_shares) {
    html += `
      <div class="fil-modal-section">
        <h4>Warrants</h4>
        <div class="fil-detail-grid">
          <div class="fil-detail-item"><span class="fil-detail-label">Warrant Shares:</span> ${deal.warrant_shares.toLocaleString()}</div>
          <div class="fil-detail-item"><span class="fil-detail-label">Strike:</span> $${deal.warrant_strike?.toFixed(2) || 'N/A'}</div>
          <div class="fil-detail-item"><span class="fil-detail-label">Expiry:</span> ${deal.warrant_expiry || 'N/A'}</div>
        </div>
      </div>
    `;
  }

  if (sellers.length > 0) {
    html += `
      <div class="fil-modal-section">
        <h4>Selling Stockholders</h4>
        <ul class="fil-sellers-list">
          ${sellers.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  html += `
    <div class="fil-modal-section">
      <h4>Timeline</h4>
      <div class="fil-timeline">
        <div class="fil-timeline-item ${deal.announcement_date ? 'fil-timeline-done' : ''}">
          <span class="fil-timeline-dot"></span>
          <span>Announcement: ${formatDate(deal.announcement_date)}</span>
        </div>
        <div class="fil-timeline-item ${deal.s1_filed_date ? 'fil-timeline-done' : ''}">
          <span class="fil-timeline-dot"></span>
          <span>S-1 Filed: ${deal.s1_filed_date ? formatDate(deal.s1_filed_date) : 'Pending'}</span>
        </div>
        <div class="fil-timeline-item ${deal.s1_effective_date ? 'fil-timeline-done' : ''}">
          <span class="fil-timeline-dot"></span>
          <span>S-1 Effective: ${deal.s1_effective_date ? formatDate(deal.s1_effective_date) : 'Pending'}</span>
        </div>
        <div class="fil-timeline-item ${deal.distribution_status === 'completed' ? 'fil-timeline-done' : ''}">
          <span class="fil-timeline-dot"></span>
          <span>Distribution: ${deal.distribution_status}</span>
        </div>
      </div>
    </div>
  `;

  if (deal.notes) {
    html += `<div class="fil-modal-section"><h4>Notes</h4><p>${deal.notes}</p></div>`;
  }

  html += '</div>';
  return html;
}

function buildFundModalContent(fund) {
  const patterns = fund.known_patterns || [];
  const recentFilings = fund.recentFilings || [];

  let html = '<div class="fil-modal-content">';

  html += `
    <div class="fil-modal-section">
      <h4>Fund Overview</h4>
      <div class="fil-detail-grid">
        <div class="fil-detail-item"><span class="fil-detail-label">CIK:</span> ${fund.cik}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Type:</span> ${formatFundType(fund.fund_type)}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">AUM:</span> ${fund.aum_approx || 'N/A'}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Key Person:</span> ${fund.key_person || 'N/A'}</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Priority:</span> ${fund.priority}/10</div>
        <div class="fil-detail-item"><span class="fil-detail-label">Enabled:</span> ${fund.enabled ? 'Yes' : 'No'}</div>
      </div>
    </div>
  `;

  if (fund.lineage) {
    html += `<div class="fil-modal-section"><h4>Lineage</h4><p>${fund.lineage}</p></div>`;
  }

  if (patterns.length > 0) {
    html += `
      <div class="fil-modal-section">
        <h4>Known Patterns</h4>
        <ul class="fil-patterns-list">
          ${patterns.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (fund.holdingsSummary) {
    const hs = fund.holdingsSummary;
    html += `
      <div class="fil-modal-section">
        <h4>Latest Holdings (${hs.period})</h4>
        <div class="fil-detail-grid">
          <div class="fil-detail-item"><span class="fil-detail-label">Positions:</span> ${hs.positions}</div>
          <div class="fil-detail-item"><span class="fil-detail-label">Total Value:</span> $${((hs.total_value || 0) / 1e9).toFixed(2)}B</div>
        </div>
      </div>
    `;
  }

  if (recentFilings.length > 0) {
    html += `
      <div class="fil-modal-section">
        <h4>Recent Filings</h4>
        <ul class="fil-recent-filings">
          ${recentFilings.map(f => `
            <li class="fil-recent-filing ${f.alert_priority === 'critical' ? 'fil-priority-critical' : ''}">
              <span class="fil-rf-type">${f.filing_type}</span>
              <span class="fil-rf-date">${formatDate(f.filed_date)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

// ============== HELPERS ==============

function formatSignalType(type) {
  if (!type) return 'Signal';
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatFundType(type) {
  if (!type) return 'Unknown';
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAge(createdAt) {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  const now = new Date();
  const hours = Math.round((now - created) / (1000 * 60 * 60));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

/**
 * Simple modal helper
 */
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

/**
 * Toggle funds grid visibility
 */
window.toggleFundsGrid = function() {
  const grid = document.getElementById('filFundsGrid');
  const toggle = document.getElementById('fundsToggle');
  if (grid && toggle) {
    const isHidden = grid.style.display === 'none';
    grid.style.display = isHidden ? 'grid' : 'none';
    toggle.textContent = isHidden ? '▼' : '▶';
  }
};
