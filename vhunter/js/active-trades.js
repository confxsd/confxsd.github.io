// Active Trades — portfolio of decided trades

const API_BASE = (() => { try { return window.__PROXY_URL__ || 'https://api.rome.markets'; } catch (_) { return 'https://api.rome.markets'; } })();
const USER_ID  = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

let cache = { trades: [], stats: null };
let exposureData = null;
let activeTab = 'active';
let showAddForm = false;
let isEvaluating = false;
let isAutoAdding = false;
let isLoadingExposure = false;

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': USER_ID(), ...(opts.headers || {}) }
  });
  return res.json();
}

async function loadData() {
  const data = await apiFetch('/api/active-trades?all=true');
  cache = { trades: data.trades || [], stats: data.stats || null };
}

async function loadExposure() {
  try {
    isLoadingExposure = true;
    exposureData = await apiFetch('/api/active-trades/exposure');
  } catch (e) {
    console.error('[ACTIVE_TRADES] Exposure load failed:', e);
    exposureData = null;
  } finally {
    isLoadingExposure = false;
  }
}

// ── Position sizing ──────────────────────────────────────────────────────────

function getAccountSize() {
  return parseFloat(localStorage.getItem('vhunter_account_size')) || 0;
}

function setAccountSize(val) {
  localStorage.setItem('vhunter_account_size', val);
}

function calcSizing(entry, stop, account, riskPct = 0.02) {
  if (!entry || !stop || !account) return null;
  const riskPerShare = Math.abs(entry - stop);
  if (riskPerShare <= 0) return null;

  const riskAmount = account * riskPct;
  let shares = Math.floor(riskAmount / riskPerShare);
  let notional = shares * entry;
  let positionPct = (notional / account) * 100;

  if (positionPct > 10) {
    shares = Math.floor((account * 0.10) / entry);
    notional = shares * entry;
    positionPct = (notional / account) * 100;
  }

  return {
    shares,
    notional: notional.toFixed(0),
    riskAmount: (shares * riskPerShare).toFixed(0),
    riskPct: ((shares * riskPerShare / account) * 100).toFixed(1),
    positionPct: positionPct.toFixed(1),
    capped: positionPct >= 10
  };
}

function renderSizingPreview() {
  const entry = parseFloat(document.getElementById('atEntry')?.value);
  const stop = parseFloat(document.getElementById('atStop')?.value);
  const account = getAccountSize();
  const el = document.getElementById('atSizingPreview');
  if (!el) return;

  if (!account) {
    el.innerHTML = '<span style="color:#64748b;font-size:0.7rem">Set account size for sizing recommendations</span>';
    return;
  }

  const sizing = calcSizing(entry, stop, account);
  if (!sizing) {
    el.innerHTML = '';
    return;
  }

  const cappedWarn = sizing.capped ? ' <span style="color:#f59e0b">(capped at 10%)</span>' : '';
  el.innerHTML = `
    <span style="color:#10b981;font-size:0.72rem;font-weight:500">
      ${sizing.shares} shares ($${sizing.notional} = ${sizing.positionPct}% of portfolio)${cappedWarn}
    </span>
    <span style="color:#94a3b8;font-size:0.68rem;margin-left:8px">
      Risk: $${sizing.riskAmount} (${sizing.riskPct}%)
    </span>`;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtP(v)   { if (v == null) return '\u2014'; const n = parseFloat(v); return isNaN(n) ? '\u2014' : '$' + n.toFixed(2); }
function fmtPct(v) { if (v == null) return '\u2014'; const n = parseFloat(v); return isNaN(n) ? '\u2014' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

function dateShort(d) {
  if (!d) return '\u2014';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function renderDashboard(stats) {
  if (!stats) return '';

  const wrColor = stats.win_rate >= 60 ? '#10b981' : stats.win_rate >= 45 ? '#f59e0b' : '#ef4444';
  const expColor = stats.expectancy >= 0 ? '#10b981' : '#ef4444';
  const pnlColor = stats.total_unrealized_pnl >= 0 ? '#10b981' : '#ef4444';

  return `
    <div class="at-dashboard">
      <div class="at-stats-row">
        <div class="at-stat">
          <div class="at-stat-val" style="color:#3b82f6">${stats.active_count}</div>
          <div class="at-stat-label">Active</div>
          <div class="at-stat-sub">${stats.by_direction.long}L / ${stats.by_direction.short}S</div>
        </div>
        <div class="at-stat">
          <div class="at-stat-val" style="color:${pnlColor}">${fmtPct(stats.total_unrealized_pnl)}</div>
          <div class="at-stat-label">Unrealized</div>
          <div class="at-stat-sub">total P&L</div>
        </div>
        <div class="at-stat">
          <div class="at-stat-val" style="color:${wrColor}">${stats.win_rate}%</div>
          <div class="at-stat-label">Win Rate</div>
          <div class="at-stat-sub">${stats.wins}W / ${stats.losses}L</div>
        </div>
        <div class="at-stat">
          <div class="at-stat-val" style="color:${expColor}">${fmtPct(stats.expectancy)}</div>
          <div class="at-stat-label">Expectancy</div>
          <div class="at-stat-sub">per trade</div>
        </div>
        <div class="at-stat">
          <div class="at-stat-val">${stats.exited_count}</div>
          <div class="at-stat-label">Closed</div>
          <div class="at-stat-sub">${stats.wins + stats.losses} resolved</div>
        </div>
      </div>
    </div>`;
}

// ── Exposure panel ──────────────────────────────────────────────────────────

function renderExposure() {
  if (!exposureData || !exposureData.trades) return '';

  const e = exposureData;
  const dirColor = e.net_direction === 'net_long' ? '#10b981' : e.net_direction === 'net_short' ? '#ef4444' : '#94a3b8';
  const dirLabel = e.net_direction === 'net_long' ? 'Net Long' : e.net_direction === 'net_short' ? 'Net Short' : 'Flat';

  // Sector bars
  const sectors = Object.entries(e.sector_breakdown);
  const maxSector = sectors.reduce((m, [, d]) => Math.max(m, d.long + d.short), 1);
  const sectorBars = sectors.map(([name, d]) => {
    const longW = (d.long / maxSector) * 100;
    const shortW = (d.short / maxSector) * 100;
    const shortName = name.length > 25 ? name.slice(0, 22) + '...' : name;
    return `
      <div class="at-sector-row">
        <span class="at-sector-name" title="${name}">${shortName}</span>
        <div class="at-sector-bar-container">
          ${longW > 0 ? `<div class="at-sector-bar long" style="width:${longW}%"></div>` : ''}
          ${shortW > 0 ? `<div class="at-sector-bar short" style="width:${shortW}%"></div>` : ''}
        </div>
        <span class="at-sector-tickers">${d.tickers.join(', ')}</span>
      </div>`;
  }).join('');

  // Warnings
  const warnHtml = e.warnings.length
    ? e.warnings.map(w => `<span class="at-warning-badge">${w.message}</span>`).join('')
    : '';

  return `
    <div class="at-exposure-panel">
      <div class="at-exposure-header">
        <span class="at-exposure-title">Portfolio Exposure</span>
        <span class="at-exposure-dir" style="color:${dirColor}">${dirLabel}</span>
      </div>
      <div class="at-exposure-metrics">
        <span class="at-exp-metric"><span class="at-exp-lbl">Long</span> ${e.long_count} pos</span>
        <span class="at-exp-metric"><span class="at-exp-lbl">Short</span> ${e.short_count} pos</span>
        ${e.largest_position ? `<span class="at-exp-metric"><span class="at-exp-lbl">Largest</span> ${e.largest_position.ticker}</span>` : ''}
      </div>
      ${sectorBars ? `<div class="at-sector-breakdown">${sectorBars}</div>` : ''}
      ${warnHtml ? `<div class="at-warnings">${warnHtml}</div>` : ''}
    </div>`;
}

// ── Add form ──────────────────────────────────────────────────────────────────

function renderAddForm() {
  const accountSize = getAccountSize();
  return `
    <div class="at-add-form ${showAddForm ? 'visible' : ''}" id="atAddForm">
      <div class="at-form-row">
        <input class="at-input" id="atTicker" placeholder="Ticker" style="max-width:100px">
        <select class="at-select" id="atDirection">
          <option value="short">Short</option>
          <option value="long">Long</option>
        </select>
        <select class="at-select" id="atConviction">
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>
        <input class="at-input" id="atEntry" placeholder="Entry $" type="number" step="0.01" oninput="window.atUpdateSizing()">
        <input class="at-input" id="atStop" placeholder="Stop $" type="number" step="0.01" oninput="window.atUpdateSizing()">
        <input class="at-input" id="atTarget" placeholder="Target $" type="number" step="0.01">
      </div>
      <div class="at-form-row">
        <input class="at-input" id="atThesis" placeholder="Thesis / reason" style="flex:3">
        <input class="at-input" id="atAccountSize" placeholder="Account $" type="number" step="1000"
               value="${accountSize || ''}" style="max-width:110px"
               oninput="window.atSetAccount(this.value)"
               title="Your total portfolio size for position sizing">
        <button class="btn btn-sm" onclick="window.atAddTrade()">Add Trade</button>
      </div>
      <div class="at-form-row" id="atSizingPreview" style="padding:0 4px"></div>
    </div>`;
}

// ── Entry row ─────────────────────────────────────────────────────────────────

function renderEntry(t) {
  const pnlCls = t.pnl_pct > 0 ? 'positive' : t.pnl_pct < 0 ? 'negative' : '';
  const alertCls = ['EXIT', 'STOP_HIT'].includes(t.last_eval_signal) ? 'at-alert' :
                   t.pnl_pct > 0 ? 'at-profit' : '';
  const evalCls = (t.last_eval_signal || '').toLowerCase().replace(' ', '_');

  return `
    <div class="at-entry ${alertCls}" id="ate-${t.id}">
      <div class="at-entry-main">
        <div class="at-entry-left">
          <span class="at-ticker" onclick="event.stopPropagation();window.atGoAnalyze('${t.ticker}')">${t.ticker}</span>
          <span class="at-dir ${t.direction}">${t.direction}</span>
          ${t.conviction ? `<span class="at-conviction ${t.conviction}">${t.conviction}</span>` : ''}
          <span class="at-date">${dateShort(t.entry_date)}</span>
        </div>
        <div class="at-entry-mid">
          <div class="at-levels">
            <span class="at-level-item"><span class="at-lbl">E</span>${fmtP(t.entry_price)}</span>
            <span class="at-level-item"><span class="at-lbl">T</span>${fmtP(t.take_profit)}</span>
            <span class="at-level-item"><span class="at-lbl">S</span>${fmtP(t.stop_loss)}</span>
          </div>
          <span class="at-source">${t.source}</span>
        </div>
        <div class="at-entry-right">
          ${t.pnl_pct != null ? `<span class="at-pnl ${pnlCls}">${fmtPct(t.pnl_pct)}</span>` : ''}
          ${t.last_eval_signal ? `<span class="at-eval-signal ${evalCls}">${t.last_eval_signal}</span>` : ''}
          <span class="at-status ${t.status}">${t.status}</span>
          <div class="at-actions">
            ${t.status === 'active' ? `<button class="at-btn danger" onclick="event.stopPropagation();window.atRemove('${t.id}','${t.ticker}')" title="Exit trade">✕</button>` : ''}
            <button class="at-btn" onclick="event.stopPropagation();window.atDelete('${t.id}','${t.ticker}')" title="Delete permanently">🗑</button>
          </div>
        </div>
      </div>
      ${t.last_eval_summary ? `<div class="at-eval-summary">${t.last_eval_summary}</div>` : ''}
      ${t.thesis ? `<div class="at-eval-summary" style="color:#94a3b8;font-size:0.68rem">${t.thesis}</div>` : ''}
    </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

function filteredTrades() {
  let list = cache.trades;
  if (activeTab === 'active') list = list.filter(t => t.status === 'active');
  if (activeTab === 'exited') list = list.filter(t => t.status !== 'active');
  return list;
}

function renderPage() {
  const container = document.getElementById('atPage');
  if (!container) return;

  const s = cache.stats;
  const entries = filteredTrades();
  const all = cache.trades;
  const activeCount = all.filter(t => t.status === 'active').length;
  const exitedCount = all.filter(t => t.status !== 'active').length;

  const tabs = [
    { id: 'active', label: `Active (${activeCount})` },
    { id: 'exited', label: `Closed (${exitedCount})` },
    { id: 'all',    label: `All (${all.length})` },
  ];

  container.innerHTML = `
    <div class="at-header">
      <div class="at-header-left">
        <h2>Active Trades</h2>
        <span class="at-meta-line">${s ? `${s.active_count} active \u00b7 ${s.wins}W / ${s.losses}L closed` : 'No trades'}</span>
      </div>
      <div class="at-header-actions">
        <button class="btn btn-sm" onclick="window.atToggleForm()">+ Add</button>
        <button class="btn btn-sm" id="atAutoBtn" onclick="window.atAutoAdd()">
          ${isAutoAdding ? '<span class="at-spin"></span>Scanning...' : 'Auto-Add'}
        </button>
        <button class="btn btn-sm" id="atEvalBtn" onclick="window.atEvaluate()">
          ${isEvaluating ? '<span class="at-spin"></span>Evaluating...' : 'Evaluate'}
        </button>
      </div>
    </div>

    ${renderDashboard(s)}
    ${renderExposure()}
    ${renderAddForm()}

    <div class="at-controls">
      <div class="at-tabs">
        ${tabs.map(t => `
          <button class="at-tab ${activeTab === t.id ? 'active' : ''}"
                  onclick="window.atSetTab('${t.id}')">${t.label}</button>
        `).join('')}
      </div>
    </div>

    <div class="at-entries">
      ${entries.length
        ? entries.map(renderEntry).join('')
        : `<div class="at-empty">
             <div class="at-empty-icon">&#x1f3af;</div>
             <div>${all.length === 0 ? 'No active trades yet \u2014 add manually or click Auto-Add to import high-conviction entries from Daily Checker' : 'No trades match this filter'}</div>
           </div>`
      }
    </div>`;
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadActiveTrades() {
  try {
    await loadData();
    renderPage();
    // Load exposure in background after initial render
    loadExposure().then(() => renderPage());
  } catch (e) {
    console.error('[ACTIVE_TRADES] Load failed:', e);
  }
}

// ── Window callbacks ──────────────────────────────────────────────────────────

window.atToggleForm = function() {
  showAddForm = !showAddForm;
  renderPage();
  if (showAddForm) document.getElementById('atTicker')?.focus();
};

window.atUpdateSizing = function() {
  renderSizingPreview();
};

window.atSetAccount = function(val) {
  const n = parseFloat(val);
  if (!isNaN(n) && n > 0) setAccountSize(n);
  renderSizingPreview();
};

window.atAddTrade = async function() {
  const ticker = document.getElementById('atTicker')?.value?.trim().toUpperCase();
  const direction = document.getElementById('atDirection')?.value;
  if (!ticker) return;

  try {
    await apiFetch('/api/active-trades', {
      method: 'POST',
      body: JSON.stringify({
        ticker,
        direction,
        conviction: document.getElementById('atConviction')?.value || 'medium',
        entry_price: parseFloat(document.getElementById('atEntry')?.value) || null,
        stop_loss: parseFloat(document.getElementById('atStop')?.value) || null,
        take_profit: parseFloat(document.getElementById('atTarget')?.value) || null,
        thesis: document.getElementById('atThesis')?.value || null,
        source: 'manual'
      })
    });
    showAddForm = false;
    await loadData();
    loadExposure().then(() => renderPage());
    renderPage();
  } catch (e) { console.error('[ACTIVE_TRADES] Add failed:', e); }
};

window.atAutoAdd = async function() {
  if (isAutoAdding) return;
  isAutoAdding = true;
  renderPage();
  try {
    const r = await apiFetch('/api/active-trades/auto-add', { method: 'POST' });
    console.log('[ACTIVE_TRADES] Auto-add result:', r);
    await loadData();
    loadExposure().then(() => renderPage());
  } catch (e) { console.error('[ACTIVE_TRADES] Auto-add failed:', e); }
  finally { isAutoAdding = false; renderPage(); }
};

window.atEvaluate = async function() {
  if (isEvaluating) return;
  isEvaluating = true;
  renderPage();
  try {
    const r = await apiFetch('/api/active-trades/evaluate', { method: 'POST' });
    console.log('[ACTIVE_TRADES] Evaluate result:', r);
    await loadData();
  } catch (e) { console.error('[ACTIVE_TRADES] Evaluate failed:', e); }
  finally { isEvaluating = false; renderPage(); }
};

window.atSetTab = function(tab) {
  activeTab = tab;
  renderPage();
};

window.atRemove = async function(id, ticker) {
  if (!confirm(`Exit ${ticker} trade?`)) return;
  try {
    await apiFetch(`/api/active-trades/${id}`, { method: 'DELETE' });
    await loadData();
    loadExposure().then(() => renderPage());
    renderPage();
  } catch (e) { console.error('[ACTIVE_TRADES] Remove failed:', e); }
};

window.atDelete = async function(id, ticker) {
  if (!confirm(`Permanently delete ${ticker} trade and all evaluations?`)) return;
  try {
    await apiFetch(`/api/active-trades/${id}?hard=true`, { method: 'DELETE' });
    await loadData();
    loadExposure().then(() => renderPage());
    renderPage();
  } catch (e) { console.error('[ACTIVE_TRADES] Delete failed:', e); }
};

window.atGoAnalyze = function(ticker) {
  document.getElementById('tk').value = ticker;
  window.switchPage('analyze');
  window.run?.();
};
