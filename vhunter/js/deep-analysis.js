// VHunter Deep Analysis Page — ML-powered filing analytics
import { CONFIG } from './config.js';
const ML_BASE = CONFIG.PROXY_URL + '/api';

let dashboardData = null;
let isLoading = false;

export async function loadDeepAnalysis() {
  if (isLoading) return;
  isLoading = true;
  const page = document.getElementById('daPage');
  page.innerHTML = '<div class="da-loading">Loading ML data...</div>';

  try {
    const res = await fetch(`${ML_BASE}/ml/dashboard`);
    if (!res.ok) throw new Error(`ML server error: ${res.status}`);
    dashboardData = await res.json();
    renderDashboard(dashboardData);
  } catch (e) {
    page.innerHTML = `<div class="da-error">
      <div class="da-error-title">ML Data Unavailable</div>
      <div class="da-error-detail">${e.message}</div>
      <div class="da-error-hint">Run models: <code>cd vhunter-ml && python -m jobs.run_models</code></div>
    </div>`;
  } finally {
    isLoading = false;
  }
}

function renderDashboard(data) {
  const page = document.getElementById('daPage');
  page.innerHTML = `
    <div class="da-controls">
      <button class="btn-secondary btn-sm" onclick="window.daRefresh()">Refresh</button>
      <span class="da-status" id="daStatus"></span>
    </div>

    <div class="da-grid">
      ${renderAnomalies(data.anomalies)}
      ${renderStalePositions(data.stale_positions)}
    </div>

    <div class="da-grid">
      ${renderPatterns(data.patterns)}
      ${renderPipeUrgent(data.pipe_urgent)}
    </div>

    ${renderVelocity(data.velocity_spikes)}

    <div class="da-ticker-lookup">
      <input type="text" id="daTickerInput" placeholder="Ticker lookup (e.g. NVDA)" />
      <button class="btn-primary btn-sm" onclick="window.daLookup()">Analyze</button>
    </div>
    <div id="daTickerResult"></div>
  `;
}

// --- Section Renderers ---

function renderAnomalies(anomalies) {
  if (!anomalies || !anomalies.length) {
    return '<div class="da-card"><div class="da-card-title">Anomalies</div><div class="da-empty">No anomalies detected</div></div>';
  }
  const rows = anomalies.map(a => `
    <div class="da-row da-row-${a.severity}">
      <div class="da-row-header">
        <span class="da-ticker">${a.ticker}</span>
        <span class="da-badge da-badge-${a.severity}">${a.severity}</span>
        <span class="da-badge da-badge-type">${a.anomaly_type}</span>
        <span class="da-score">${(a.score * 100).toFixed(0)}%</span>
      </div>
      <div class="da-row-desc">${a.description}</div>
    </div>
  `).join('');
  return `<div class="da-card">
    <div class="da-card-title">Anomalies <span class="da-count">${anomalies.length}</span></div>
    ${rows}
  </div>`;
}

function renderStalePositions(stale) {
  if (!stale || !stale.length) {
    return '<div class="da-card"><div class="da-card-title">Stale Positions</div><div class="da-empty">All positions are fresh</div></div>';
  }
  const rows = stale.map(s => {
    const confPct = (s.confidence_score * 100).toFixed(0);
    const barColor = s.label === 'expired' ? '#ef4444' : s.label === 'stale' ? '#f59e0b' : '#10b981';
    return `
    <div class="da-row">
      <div class="da-row-header">
        <span class="da-ticker">${s.ticker}</span>
        <span class="da-fund-name">${s.fund_name || ''}</span>
        <span class="da-badge da-badge-${s.label}">${s.label}</span>
      </div>
      <div class="da-conf-bar">
        <div class="da-conf-fill" style="width:${confPct}%; background:${barColor}"></div>
        <span class="da-conf-label">${confPct}% confidence</span>
      </div>
      <div class="da-row-meta">
        Last: ${s.filing_type_most_recent} &middot; ${s.days_since_last_filing}d ago
        ${s.estimated_shares_low != null ? ` &middot; Est. ${fmtNum(s.estimated_shares_low)}-${fmtNum(s.estimated_shares_high)} shares` : ''}
      </div>
    </div>
  `}).join('');
  return `<div class="da-card">
    <div class="da-card-title">Stale Positions <span class="da-count">${stale.length}</span></div>
    ${rows}
  </div>`;
}

function renderPatterns(patterns) {
  if (!patterns || !patterns.length) {
    return '<div class="da-card"><div class="da-card-title">Filing Patterns</div><div class="da-empty">No patterns detected</div></div>';
  }
  const rows = patterns.map(p => `
    <div class="da-row">
      <div class="da-row-header">
        <span class="da-ticker">${p.ticker}</span>
        <span class="da-badge da-badge-pattern">${p.pattern_type.replace(/_/g, ' ')}</span>
        <span class="da-score">${(p.completeness * 100).toFixed(0)}%</span>
      </div>
      <div class="da-stage-bar">
        <div class="da-stage-fill" style="width:${p.completeness * 100}%"></div>
      </div>
      <div class="da-row-desc">${p.stage}</div>
    </div>
  `).join('');
  return `<div class="da-card">
    <div class="da-card-title">Filing Patterns <span class="da-count">${patterns.length}</span></div>
    ${rows}
  </div>`;
}

function renderPipeUrgent(pipe) {
  if (!pipe || !pipe.length) {
    return '<div class="da-card"><div class="da-card-title">PIPE Urgency</div><div class="da-empty">No urgent PIPE deals</div></div>';
  }
  const rows = pipe.map(p => `
    <div class="da-row da-row-${p.urgency}">
      <div class="da-row-header">
        <span class="da-ticker">${p.ticker}</span>
        <span class="da-badge da-badge-${p.urgency}">${p.urgency}</span>
        <span class="da-badge da-badge-type">${p.current_stage}</span>
      </div>
      <div class="da-row-desc">${p.description}</div>
      ${p.estimated_effective_date ? `<div class="da-row-meta">Eff: ${p.estimated_effective_date} &middot; Dist: ${p.distribution_window_start || '?'} — ${p.distribution_window_end || '?'}</div>` : ''}
      ${p.price_impact_pct != null ? `<div class="da-row-meta">Est. impact: <span class="r">${p.price_impact_pct}%</span></div>` : ''}
    </div>
  `).join('');
  return `<div class="da-card">
    <div class="da-card-title">PIPE Urgency <span class="da-count">${pipe.length}</span></div>
    ${rows}
  </div>`;
}

function renderVelocity(spikes) {
  if (!spikes || !spikes.length) return '';
  const rows = spikes.map(v => `
    <div class="da-vel-item">
      <span class="da-ticker">${v.ticker}</span>
      <div class="da-vel-bar-wrap">
        <div class="da-vel-bar" style="width:${Math.min(v.velocity_score, 100)}%"></div>
      </div>
      <span class="da-vel-score">${v.velocity_score.toFixed(0)}</span>
      <span class="da-badge da-badge-trend-${v.trend}">${v.trend}</span>
      <span class="da-vel-detail">${v.filing_count_30d}/30d (avg ${v.filing_count_avg_30d})</span>
    </div>
  `).join('');
  return `<div class="da-card da-card-full">
    <div class="da-card-title">Velocity Spikes <span class="da-count">${spikes.length}</span></div>
    ${rows}
  </div>`;
}

// --- Ticker Lookup ---

async function tickerLookup() {
  const input = document.getElementById('daTickerInput');
  const ticker = (input?.value || '').toUpperCase().trim();
  if (!ticker) return;

  const result = document.getElementById('daTickerResult');
  result.innerHTML = '<div class="da-loading">Analyzing ' + ticker + '...</div>';

  try {
    const [conf, anomalies, patterns, pipe, vel] = await Promise.all([
      fetch(`${ML_BASE}/ml/confidence/${ticker}`).then(r => r.json()),
      fetch(`${ML_BASE}/ml/anomalies`).then(r => r.json()),
      fetch(`${ML_BASE}/ml/patterns/${ticker}`).then(r => r.json()),
      fetch(`${ML_BASE}/ml/pipe/${ticker}`).then(r => r.json()),
      fetch(`${ML_BASE}/ml/velocity`).then(r => r.json()),
    ]);

    const tickerAnomalies = (anomalies.anomalies || []).filter(a => a.ticker === ticker);
    const tickerVelocity = (vel.velocities || []).find(v => v.ticker === ticker);

    result.innerHTML = `
      <div class="da-ticker-header">${ticker}</div>
      <div class="da-grid">
        ${renderConfidenceDetail(conf.scores || [])}
        <div class="da-card">
          <div class="da-card-title">Anomalies</div>
          ${tickerAnomalies.length ? tickerAnomalies.map(a => `
            <div class="da-row da-row-${a.severity}">
              <span class="da-badge da-badge-${a.severity}">${a.severity}</span>
              <span class="da-badge da-badge-type">${a.anomaly_type}</span>
              <span class="da-row-desc">${a.description}</span>
            </div>
          `).join('') : '<div class="da-empty">None</div>'}
        </div>
      </div>
      <div class="da-grid">
        ${renderPatterns(patterns.patterns || [])}
        <div class="da-card">
          <div class="da-card-title">PIPE</div>
          ${pipe.prediction ? `
            <div class="da-row da-row-${pipe.prediction.urgency}">
              <span class="da-badge da-badge-${pipe.prediction.urgency}">${pipe.prediction.urgency}</span>
              <span>${pipe.prediction.description}</span>
            </div>
          ` : '<div class="da-empty">No PIPE deal</div>'}
          <div class="da-card-title" style="margin-top:12px">Velocity</div>
          ${tickerVelocity ? `
            <div class="da-vel-item">
              <span class="da-vel-score">${tickerVelocity.velocity_score.toFixed(0)}/100</span>
              <span class="da-badge da-badge-trend-${tickerVelocity.trend}">${tickerVelocity.trend}</span>
              <span>${tickerVelocity.filing_count_30d} filings/30d</span>
            </div>
          ` : '<div class="da-empty">No velocity data</div>'}
        </div>
      </div>
    `;
  } catch (e) {
    result.innerHTML = `<div class="da-error"><div class="da-error-detail">${e.message}</div></div>`;
  }
}

function renderConfidenceDetail(scores) {
  if (!scores.length) {
    return '<div class="da-card"><div class="da-card-title">Position Confidence</div><div class="da-empty">No fund positions found</div></div>';
  }
  const rows = scores.map(s => {
    const pct = (s.confidence_score * 100).toFixed(0);
    const color = s.label === 'fresh' ? '#10b981' : s.label === 'aging' ? '#f59e0b' : s.label === 'stale' ? '#fb923c' : '#ef4444';
    return `
    <div class="da-row">
      <div class="da-row-header">
        <span class="da-fund-name">${s.fund_name}</span>
        <span class="da-badge da-badge-${s.label}">${s.label}</span>
        <span class="da-score">${pct}%</span>
      </div>
      <div class="da-conf-bar">
        <div class="da-conf-fill" style="width:${pct}%; background:${color}"></div>
      </div>
      <div class="da-row-meta">
        ${s.filing_type_most_recent} &middot; ${s.days_since_last_filing}d ago
        ${s.position_weight_pct != null ? ` &middot; ${s.position_weight_pct}% weight` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="da-card">
    <div class="da-card-title">Position Confidence <span class="da-count">${scores.length} funds</span></div>
    ${rows}
  </div>`;
}

// --- Actions ---

async function runModels() {
  const status = document.getElementById('daStatus');
  if (status) status.textContent = 'Running models...';
  try {
    const res = await fetch(`${ML_BASE}/ml/run`, { method: 'POST' });
    const data = await res.json();
    if (status) status.textContent = `Done: ${data.results?.signals_generated || 0} signals`;
    loadDeepAnalysis();
  } catch (e) {
    if (status) status.textContent = `Error: ${e.message}`;
  }
}

function fmtNum(n) {
  if (n == null) return '?';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

// Expose to window for onclick handlers
window.daRefresh = loadDeepAnalysis;
window.daRunModels = runModels;
window.daLookup = tickerLookup;
