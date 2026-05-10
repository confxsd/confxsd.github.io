// Signal Log & Accuracy Dashboard
import { formatNum } from './utils.js';

const API_BASE = (() => { try { return window.__PROXY_URL__ || 'https://api.rome.markets'; } catch (_) { return 'https://api.rome.markets'; } })();
const USER_ID  = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

let logCache  = { entries: [], stats: null };
let activeTab = 'all';
let tickerFilter = '';
let isSyncing = false, isBacktesting = false;

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': USER_ID(), ...(opts.headers || {}) }
  });
  return res.json();
}

async function loadLog() {
  const data = await apiFetch('/api/signal-log');
  logCache = { entries: data.entries || [], stats: data.stats || null };
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtP(v)   { if (v == null) return '—'; const n = parseFloat(String(v).replace(/[$,]/g,''));  return isNaN(n) ? '—' : '$' + n.toFixed(2); }
function fmtPct(v) { if (v == null) return '—'; const n = parseFloat(v); return isNaN(n) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
function fmtWR(g)  { if (!g || g.closed === 0) return '—'; return g.win_rate + '% (' + g.wins + '/' + g.closed + ')'; }

function sigClass(s) {
  if (s === 'ENTRY NOW')  return 'sl-sig-now';
  if (s === 'ENTRY SOON') return 'sl-sig-soon';
  return '';
}

function outcomeClass(o) {
  if (o === 'hit_target') return 'sl-win';
  if (o === 'hit_stop')   return 'sl-loss';
  if (o === 'expired')    return 'sl-expired';
  return 'sl-open';
}

function outcomeLabel(o) {
  if (o === 'hit_target') return 'WIN';
  if (o === 'hit_stop')   return 'LOSS';
  if (o === 'expired')    return 'EXPIRED';
  return 'OPEN';
}

function dateShort(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Dashboard stats panel ─────────────────────────────────────────────────────

function renderDashboard(stats) {
  if (!stats) return `
    <div class="sl-empty-stats">
      <div class="sl-empty-icon">📊</div>
      <div>No signal data yet</div>
      <div class="sl-hint">Click Sync to import ENTRY signals from Daily Checker</div>
    </div>`;

  const wrColor = stats.win_rate >= 60 ? '#10b981' : stats.win_rate >= 45 ? '#f59e0b' : '#ef4444';
  const expColor = stats.expectancy >= 0 ? '#10b981' : '#ef4444';

  const barGrp = (label, g) => {
    if (!g || g.total === 0) return '';
    const wr = g.win_rate ?? 0;
    const barColor = wr >= 60 ? '#10b981' : wr >= 45 ? '#f59e0b' : '#ef4444';
    return `
      <div class="sl-bar-row">
        <span class="sl-bar-label">${label}</span>
        <div class="sl-bar-track">
          <div class="sl-bar-fill" style="width:${wr}%;background:${barColor}"></div>
        </div>
        <span class="sl-bar-val">${fmtWR(g)}</span>
        <span class="sl-bar-avg" style="color:${g.avg_pnl >= 0 ? '#10b981' : '#ef4444'}">${fmtPct(g.avg_pnl)}</span>
      </div>`;
  };

  return `
    <div class="sl-dashboard">
      <div class="sl-stats-row">
        <div class="sl-stat">
          <div class="sl-stat-val" style="color:${wrColor}">${stats.win_rate}%</div>
          <div class="sl-stat-label">Win Rate</div>
          <div class="sl-stat-sub">${stats.wins}W / ${stats.losses}L / ${stats.expired}E</div>
        </div>
        <div class="sl-stat">
          <div class="sl-stat-val" style="color:${expColor}">${fmtPct(stats.expectancy)}</div>
          <div class="sl-stat-label">Expectancy</div>
          <div class="sl-stat-sub">per trade</div>
        </div>
        <div class="sl-stat">
          <div class="sl-stat-val positive">${fmtPct(stats.avg_win_pct)}</div>
          <div class="sl-stat-label">Avg Win</div>
          <div class="sl-stat-sub">${stats.avg_days}d avg hold</div>
        </div>
        <div class="sl-stat">
          <div class="sl-stat-val negative">−${fmtPct(stats.avg_loss_pct).replace(/^[+-]/,'')}</div>
          <div class="sl-stat-label">Avg Loss</div>
          <div class="sl-stat-sub">${stats.total} total signals</div>
        </div>
        <div class="sl-stat">
          <div class="sl-stat-val">${stats.open}</div>
          <div class="sl-stat-label">Open</div>
          <div class="sl-stat-sub">being tracked</div>
        </div>
      </div>

      <div class="sl-breakdown">
        <div class="sl-breakdown-col">
          <div class="sl-breakdown-title">By Signal</div>
          ${barGrp('ENTRY NOW',  stats.by_signal?.entry_now)}
          ${barGrp('ENTRY SOON', stats.by_signal?.entry_soon)}
        </div>
        <div class="sl-breakdown-col">
          <div class="sl-breakdown-title">By Conviction</div>
          ${barGrp('High',   stats.by_conviction?.high)}
          ${barGrp('Medium', stats.by_conviction?.medium)}
          ${barGrp('Low',    stats.by_conviction?.low)}
        </div>
        <div class="sl-breakdown-col">
          <div class="sl-breakdown-title">By Direction</div>
          ${barGrp('Long',  stats.by_direction?.long)}
          ${barGrp('Short', stats.by_direction?.short)}
        </div>
      </div>
    </div>`;
}

// ── Entry row ─────────────────────────────────────────────────────────────────

function renderEntry(e) {
  const oc  = outcomeClass(e.outcome);
  const pnl = e.outcome === 'open' ? '' : fmtPct(e.actual_pnl_pct);
  const pnlCls = e.actual_pnl_pct > 0 ? 'positive' : e.actual_pnl_pct < 0 ? 'negative' : '';

  return `
    <div class="sl-entry" id="sle-${e.id}">
      <div class="sl-entry-main">
        <div class="sl-entry-left">
          <span class="sl-ticker" onclick="event.stopPropagation();window.slGoAnalyze('${e.ticker}')">${e.ticker}</span>
          <span class="sl-sig ${sigClass(e.signal)}">${e.signal}</span>
          <span class="sl-dir ${e.direction}">${e.direction}</span>
          <span class="sl-date">${dateShort(e.signal_date)}</span>
        </div>
        <div class="sl-entry-mid">
          <span class="sl-meta">Score ${e.opportunity_score ?? '—'}</span>
          <span class="sl-meta">${e.conviction || '—'}</span>
          <span class="sl-meta sl-macro ${e.macro_alignment}">${e.macro_alignment || '—'}</span>
        </div>
        <div class="sl-levels">
          <span class="sl-level-item"><span class="sl-lbl">E</span>${fmtP(e.predicted_entry)}</span>
          <span class="sl-level-item"><span class="sl-lbl">T</span>${fmtP(e.predicted_target)}</span>
          <span class="sl-level-item"><span class="sl-lbl">S</span>${fmtP(e.predicted_stop)}</span>
          ${e.predicted_rr != null ? `<span class="sl-level-item"><span class="sl-lbl">R:R</span>${parseFloat(e.predicted_rr).toFixed(1)}x</span>` : ''}
        </div>
        <div class="sl-entry-right">
          <span class="sl-outcome ${oc}">${outcomeLabel(e.outcome)}</span>
          ${pnl ? `<span class="sl-pnl ${pnlCls}">${pnl}</span>` : ''}
          ${e.days_to_outcome != null ? `<span class="sl-days">${e.days_to_outcome}d</span>` : ''}
          <button class="sl-del-btn" onclick="event.stopPropagation();window.slDelete('${e.id}','${e.ticker}')">✕</button>
        </div>
      </div>
      ${e.signal_reason ? `<div class="sl-reason">${e.signal_reason}</div>` : ''}
      ${(e.mfe_pct != null || e.mae_pct != null) ? `
        <div class="sl-excursion">
          <span class="positive">MFE +${e.mfe_pct?.toFixed(1) ?? '0.0'}%</span>
          <span class="negative">MAE −${e.mae_pct?.toFixed(1) ?? '0.0'}%</span>
          ${e.outcome_date ? `<span class="sl-odate">closed ${dateShort(e.outcome_date)}</span>` : ''}
        </div>` : ''}
    </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

function filteredEntries() {
  let list = logCache.entries;
  if (activeTab === 'open')    list = list.filter(e => e.outcome === 'open');
  if (activeTab === 'wins')    list = list.filter(e => e.outcome === 'hit_target');
  if (activeTab === 'losses')  list = list.filter(e => e.outcome === 'hit_stop');
  if (activeTab === 'expired') list = list.filter(e => e.outcome === 'expired');
  if (tickerFilter) list = list.filter(e => e.ticker.includes(tickerFilter.toUpperCase()));
  return list;
}

function renderSignalLog() {
  const container = document.getElementById('slPage');
  if (!container) return;

  const s = logCache.stats;
  const entries = filteredEntries();
  const all = logCache.entries;

  const tabs = [
    { id: 'all',     label: `All (${all.length})` },
    { id: 'open',    label: `Open (${all.filter(e => e.outcome === 'open').length})` },
    { id: 'wins',    label: `Wins (${all.filter(e => e.outcome === 'hit_target').length})` },
    { id: 'losses',  label: `Losses (${all.filter(e => e.outcome === 'hit_stop').length})` },
    { id: 'expired', label: `Expired (${all.filter(e => e.outcome === 'expired').length})` },
  ];

  container.innerHTML = `
    <div class="sl-header">
      <div class="sl-header-left">
        <h2>Signal Log</h2>
        <span class="sl-meta-line">${s ? `${s.wins}W / ${s.losses}L / ${s.expired}E · ${s.total} total` : 'No data'}</span>
      </div>
      <div class="sl-header-actions">
        <button class="btn btn-sm" id="slSyncBtn" onclick="window.slSync()">
          ${isSyncing ? '<span class="sl-spin"></span>Syncing...' : '↓ Sync'}
        </button>
        <button class="btn btn-sm" id="slBtBtn" onclick="window.slBacktest()">
          ${isBacktesting ? '<span class="sl-spin"></span>Running...' : '⟳ Backtest'}
        </button>
      </div>
    </div>

    ${renderDashboard(s)}

    <div class="sl-controls">
      <div class="sl-tabs">
        ${tabs.map(t => `
          <button class="sl-tab ${activeTab === t.id ? 'active' : ''}"
                  onclick="window.slSetTab('${t.id}')">${t.label}</button>
        `).join('')}
      </div>
      <input class="sl-search" placeholder="Filter ticker…" value="${tickerFilter}"
             oninput="window.slFilterTicker(this.value)">
    </div>

    <div class="sl-entries">
      ${entries.length
        ? entries.map(renderEntry).join('')
        : `<div class="sl-empty">
             <div class="sl-empty-icon">📋</div>
             <div>${all.length === 0 ? 'No signals logged yet — click Sync to import ENTRY signals' : 'No signals match this filter'}</div>
           </div>`
      }
    </div>`;
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadSignalLog() {
  try {
    await loadLog();
    renderSignalLog();
  } catch (e) {
    console.error('[SIGNAL_LOG] Load failed:', e);
  }
}

// ── Window callbacks ──────────────────────────────────────────────────────────

window.slSync = async function() {
  if (isSyncing) return;
  isSyncing = true;
  renderSignalLog();
  try {
    const r = await apiFetch('/api/signal-log/sync', { method: 'POST' });
    await loadLog();
  } catch (e) { console.error('[SIGNAL_LOG] Sync failed:', e); }
  finally { isSyncing = false; renderSignalLog(); }
};

window.slBacktest = async function() {
  if (isBacktesting) return;
  isBacktesting = true;
  renderSignalLog();
  try {
    await apiFetch('/api/signal-log/backtest', { method: 'POST' });
    await loadLog();
  } catch (e) { console.error('[SIGNAL_LOG] Backtest failed:', e); }
  finally { isBacktesting = false; renderSignalLog(); }
};

window.slSetTab = function(tab) {
  activeTab = tab;
  renderSignalLog();
};

window.slFilterTicker = function(val) {
  tickerFilter = val;
  renderSignalLog();
};

window.slDelete = async function(id, ticker) {
  if (!confirm(`Remove ${ticker} signal log entry?`)) return;
  try {
    await apiFetch(`/api/signal-log/${id}`, { method: 'DELETE' });
    await loadLog();
    renderSignalLog();
  } catch (e) { console.error('[SIGNAL_LOG] Delete failed:', e); }
};

window.slGoAnalyze = function(ticker) {
  document.getElementById('tk').value = ticker;
  window.switchPage('analyze');
  window.run?.();
};
