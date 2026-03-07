// Ticker Pipeline Module — Per-ticker sequential scoring
import { CONFIG } from './config.js';

const API = CONFIG.PROXY_URL;
const STAGES = ['screening', 'story', 'fundamentals', 'technical', 'catalyst', 'flow', 'risk', 'trade'];

let analyses = [];
let currentFilter = 'all';
let pollInterval = null;
let expandedCards = new Set();

export async function loadPipeline() {
  renderPage();
  await Promise.all([fetchAnalyses(), fetchStats()]);
  startPolling();
}

export function unloadPipeline() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  expandedCards.clear();
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const hasActive = analyses.some(a => a.status === 'running' || a.status === 'submitted');
    if (hasActive) {
      await fetchAnalyses();
    }
  }, 5000);
}

// ── API ──

async function apiCall(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat', ...opts.headers }
  });
  return r.json();
}

async function submitTicker(ticker, context) {
  return apiCall('/api/ticker-pipeline/submit', {
    method: 'POST',
    body: JSON.stringify({ ticker, source: 'manual', context: context || undefined })
  });
}

async function fetchAnalyses() {
  const data = await apiCall(`/api/ticker-pipeline/analyses?limit=50${currentFilter !== 'all' ? `&status=${currentFilter}` : ''}`);
  if (Array.isArray(data)) {
    analyses = data;
    renderCards();
  }
}

async function fetchStats() {
  const stats = await apiCall('/api/ticker-pipeline/stats');
  if (stats && !stats.error) renderStats(stats);
}

async function fetchDetail(id) {
  return apiCall(`/api/ticker-pipeline/analyses/${id}`);
}

async function cancelAnalysis(id) {
  await apiCall(`/api/ticker-pipeline/cancel/${id}`, { method: 'POST' });
  await fetchAnalyses();
}

async function retryAnalysis(id) {
  await apiCall(`/api/ticker-pipeline/retry/${id}`, { method: 'POST' });
  await fetchAnalyses();
}

// ── Render ──

function renderPage() {
  const page = document.getElementById('page-pipeline');
  if (!page) return;
  page.innerHTML = `
    <div class="tp-submit">
      <div class="tp-submit-field">
        <label>Ticker</label>
        <input class="tp-submit-ticker" id="tpTicker" placeholder="AAPL" maxlength="6" />
      </div>
      <div class="tp-submit-field" style="flex:1;min-width:200px">
        <label>Context (optional)</label>
        <input class="tp-submit-context" id="tpContext" placeholder="e.g. Earnings next week, PIPE deal rumor..." />
      </div>
      <button class="tp-submit-btn" id="tpSubmitBtn" onclick="window.tpSubmit()">Analyze</button>
    </div>
    <div id="tpStats" class="tp-stats" style="display:none"></div>
    <div class="tp-controls">
      <div class="tp-filter-tabs">
        <button class="tp-filter-tab active" data-filter="all" onclick="window.tpFilter('all')">All</button>
        <button class="tp-filter-tab" data-filter="running" onclick="window.tpFilter('running')">Running</button>
        <button class="tp-filter-tab" data-filter="completed" onclick="window.tpFilter('completed')">Completed</button>
        <button class="tp-filter-tab" data-filter="error" onclick="window.tpFilter('error')">Errors</button>
      </div>
    </div>
    <div class="tp-cards" id="tpCards">
      <div class="tp-empty">
        <div class="tp-empty-icon"><i class="fa-solid fa-magnifying-glass-chart"></i></div>
        <div class="tp-empty-text">No analyses yet</div>
        <div class="tp-empty-hint">Submit a ticker above to start</div>
      </div>
    </div>
  `;

  // Enter key on ticker input
  document.getElementById('tpTicker')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.tpSubmit();
  });
}

function renderStats(s) {
  const el = document.getElementById('tpStats');
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = `
    <div class="tp-stat"><div class="tp-stat-val">${s.total || 0}</div><div class="tp-stat-label">Total</div></div>
    <div class="tp-stat"><div class="tp-stat-val green">${s.completed || 0}</div><div class="tp-stat-label">Completed</div></div>
    <div class="tp-stat"><div class="tp-stat-val">${s.trades_found || 0}</div><div class="tp-stat-label">Trades</div></div>
    <div class="tp-stat"><div class="tp-stat-val">${s.skipped || 0}</div><div class="tp-stat-label">Skipped</div></div>
    <div class="tp-stat"><div class="tp-stat-val ${s.high_conviction > 0 ? 'green' : ''}">${s.high_conviction || 0}</div><div class="tp-stat-label">High Conv.</div></div>
    <div class="tp-stat"><div class="tp-stat-val">${s.avg_score != null ? s.avg_score.toFixed(1) : '-'}</div><div class="tp-stat-label">Avg Score</div></div>
    <div class="tp-stat"><div class="tp-stat-val">$${(s.total_cost || 0).toFixed(3)}</div><div class="tp-stat-label">Total Cost</div></div>
    ${s.running ? `<div class="tp-stat"><div class="tp-stat-val yellow">${s.running}</div><div class="tp-stat-label">Running</div></div>` : ''}
  `;
}

function renderCards() {
  const el = document.getElementById('tpCards');
  if (!el) return;

  if (!analyses.length) {
    el.innerHTML = `<div class="tp-empty"><div class="tp-empty-icon"><i class="fa-solid fa-magnifying-glass-chart"></i></div><div class="tp-empty-text">No analyses found</div></div>`;
    return;
  }

  // If no cards expanded, just re-render everything
  if (!expandedCards.size) {
    el.innerHTML = analyses.map(a => renderCard(a)).join('');
    return;
  }

  // Update cards in-place to preserve expanded detail panels
  const existingIds = new Set([...el.querySelectorAll('.tp-card')].map(c => c.id.replace('tp-card-', '')));
  const newIds = new Set(analyses.map(a => a.id));

  // Remove cards no longer in the list
  for (const id of existingIds) {
    if (!newIds.has(id)) {
      document.getElementById(`tp-card-${id}`)?.remove();
      expandedCards.delete(id);
    }
  }

  // Update or insert cards
  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i];
    const existing = document.getElementById(`tp-card-${a.id}`);
    if (existing) {
      // Update only the header (preserve detail panel if open)
      const header = existing.querySelector('.tp-card-header');
      if (header && !expandedCards.has(a.id)) {
        // Not expanded — safe to replace entire card
        existing.outerHTML = renderCard(a);
      } else if (header) {
        // Expanded — only update header content
        const temp = document.createElement('div');
        temp.innerHTML = renderCard(a);
        const newHeader = temp.querySelector('.tp-card-header');
        if (newHeader) header.innerHTML = newHeader.innerHTML;
      }
    } else {
      // New card — insert at correct position
      const html = renderCard(a);
      const nextSibling = i < analyses.length - 1 ? document.getElementById(`tp-card-${analyses[i + 1]?.id}`) : null;
      if (nextSibling) {
        nextSibling.insertAdjacentHTML('beforebegin', html);
      } else {
        el.insertAdjacentHTML('beforeend', html);
      }
    }
  }
}

function renderCard(a) {
  const scores = a.stage_scores || {};
  const scoreClass = getScoreClass(a.composite_score);
  const timeAgo = getTimeAgo(a.created_at);
  const dots = STAGES.map(s => {
    if (scores[s]) return `<div class="tp-dot completed ${getScoreDotClass(scores[s].score)}" title="${s}: ${scores[s].score}"></div>`;
    if (a.current_stage === s && (a.status === 'running' || a.status === 'submitted')) return `<div class="tp-dot running" title="${s}: running"></div>`;
    if (a.status === 'error' && a.current_stage === s) return `<div class="tp-dot error" title="${s}: error"></div>`;
    return `<div class="tp-dot pending" title="${s}: pending"></div>`;
  }).join('');

  const runningLabel = a.status === 'running' ? `<span class="tp-running-stage">${a.current_stage || ''}</span>` : '';

  return `
    <div class="tp-card" id="tp-card-${a.id}">
      <div class="tp-card-header" onclick="window.tpToggle('${a.id}')">
        <span class="tp-ticker">${a.ticker}</span>
        <span class="tp-status ${a.status}">${a.status}</span>
        ${a.composite_score != null ? `<span class="tp-score-badge ${scoreClass}">${Math.round(a.composite_score)}</span>` : ''}
        ${a.conviction ? `<span class="tp-conviction ${a.conviction}">${a.conviction}</span>` : ''}
        <div class="tp-dots">${dots}</div>
        ${runningLabel}
        <span class="tp-source">${a.source || 'manual'}</span>
        <div class="tp-card-meta">
          <span class="tp-time">${timeAgo}</span>
          <button class="tp-expand-btn" id="tp-expand-${a.id}">▼</button>
        </div>
      </div>
      <div class="tp-detail" id="tp-detail-${a.id}"></div>
    </div>
  `;
}

async function toggleDetail(id) {
  const detail = document.getElementById(`tp-detail-${id}`);
  const btn = document.getElementById(`tp-expand-${id}`);
  if (!detail) return;

  if (detail.classList.contains('open')) {
    detail.classList.remove('open');
    btn?.classList.remove('open');
    expandedCards.delete(id);
    return;
  }

  detail.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8">Loading...</div>';
  detail.classList.add('open');
  btn?.classList.add('open');
  expandedCards.add(id);

  const data = await fetchDetail(id);
  if (data.error) {
    detail.innerHTML = `<div style="padding:20px;color:#ef4444">${data.error}</div>`;
    return;
  }

  renderDetail(detail, data);
}

function renderDetail(el, a) {
  const scores = a.stage_scores || {};
  const completedStages = Object.keys(scores);

  // Score bar chart
  let scoreChart = '<div class="tp-score-chart">';
  for (const stage of STAGES) {
    const s = scores[stage];
    const score = s?.score ?? 0;
    const cls = getScoreClass(score);
    const hasData = !!s;
    scoreChart += `
      <div class="tp-score-row">
        <span class="tp-score-label">${stage}</span>
        <div class="tp-score-track">
          <div class="tp-score-fill ${cls}" style="width:${hasData ? score : 0}%"></div>
        </div>
        <span class="tp-score-val">${hasData ? score : '-'}</span>
      </div>`;
  }
  scoreChart += '</div>';

  // Stage cards
  let stageCards = '<div class="tp-stages">';
  for (const stage of STAGES) {
    const s = scores[stage];
    if (!s) continue;
    const cls = getScoreClass(s.score);
    const flags = renderFlags(s.flags);
    const findings = s.findings ? renderFindings(s.findings) : '';

    stageCards += `
      <div class="tp-stage-card">
        <div class="tp-stage-header" onclick="window.tpToggleStage(this)">
          <span class="tp-stage-name">${stage}</span>
          <span class="tp-stage-score ${cls}">${s.score}</span>
          <span class="tp-stage-assessment">${s.assessment || ''}</span>
          <button class="tp-stage-toggle">▼</button>
        </div>
        <div class="tp-stage-body">
          ${findings}
          ${flags}
        </div>
      </div>`;
  }
  stageCards += '</div>';

  // Flags summary
  const allFlags = { red: [], green: [], yellow: [] };
  for (const s of Object.values(scores)) {
    if (s.flags?.red) allFlags.red.push(...s.flags.red);
    if (s.flags?.green) allFlags.green.push(...s.flags.green);
    if (s.flags?.yellow) allFlags.yellow.push(...s.flags.yellow);
  }
  let flagsSummary = '';
  if (allFlags.red.length || allFlags.green.length || allFlags.yellow.length) {
    flagsSummary = `<div class="tp-flags-summary">
      <div class="tp-flags-title">Accumulated Flags</div>
      ${allFlags.green.length ? `<div class="tp-flags-group"><div class="tp-flags-group-label">Positives (${allFlags.green.length})</div><div class="tp-flags">${allFlags.green.map(f => `<span class="tp-flag green">${esc(f)}</span>`).join('')}</div></div>` : ''}
      ${allFlags.red.length ? `<div class="tp-flags-group"><div class="tp-flags-group-label">Concerns (${allFlags.red.length})</div><div class="tp-flags">${allFlags.red.map(f => `<span class="tp-flag red">${esc(f)}</span>`).join('')}</div></div>` : ''}
      ${allFlags.yellow.length ? `<div class="tp-flags-group"><div class="tp-flags-group-label">Watch (${allFlags.yellow.length})</div><div class="tp-flags">${allFlags.yellow.map(f => `<span class="tp-flag yellow">${esc(f)}</span>`).join('')}</div></div>` : ''}
    </div>`;
  }

  // Trade or skip card
  let tradeCard = '';
  const tradeStage = scores.trade;
  if (tradeStage?.findings) {
    const decision = tradeStage.findings.decision;
    if (decision === 'trade' && tradeStage.findings.trade) {
      const t = tradeStage.findings.trade;
      tradeCard = `
        <div class="tp-trade-card trade">
          <div class="tp-trade-header">
            <span class="tp-trade-decision trade">TRADE</span>
            <span class="tp-trade-title">${a.ticker} ${t.direction?.toUpperCase() || ''} via ${t.instrument || 'stock'}</span>
            ${tradeStage.findings.conviction ? `<span class="tp-conviction ${tradeStage.findings.conviction}">${tradeStage.findings.conviction}</span>` : ''}
          </div>
          <div class="tp-trade-grid">
            ${t.entry ? `<div class="tp-trade-field"><div class="tp-trade-field-label">Entry</div><div class="tp-trade-field-value">${t.entry}</div></div>` : ''}
            ${t.stop ? `<div class="tp-trade-field"><div class="tp-trade-field-label">Stop</div><div class="tp-trade-field-value" style="color:#ef4444">${t.stop}</div></div>` : ''}
            ${t.target ? `<div class="tp-trade-field"><div class="tp-trade-field-label">Target</div><div class="tp-trade-field-value" style="color:#10b981">${t.target}</div></div>` : ''}
            ${t.timeframe ? `<div class="tp-trade-field"><div class="tp-trade-field-label">Timeframe</div><div class="tp-trade-field-value">${t.timeframe}</div></div>` : ''}
            ${t.sizing ? `<div class="tp-trade-field"><div class="tp-trade-field-label">Sizing</div><div class="tp-trade-field-value">${t.sizing}</div></div>` : ''}
            ${t.riskRewardRatio ? `<div class="tp-trade-field"><div class="tp-trade-field-label">R:R</div><div class="tp-trade-field-value" style="color:#818cf8;font-size:0.95rem">${t.riskRewardRatio}</div></div>` : ''}
          </div>
          ${tradeStage.findings.rationale ? `<div class="tp-trade-rationale">${esc(tradeStage.findings.rationale)}</div>` : ''}
          ${tradeStage.findings.keyRisks?.length ? `<div class="tp-trade-risks">${tradeStage.findings.keyRisks.map(r => `<div class="tp-trade-risk-item">${esc(r)}</div>`).join('')}</div>` : ''}
        </div>`;
    } else if (decision === 'skip') {
      tradeCard = `
        <div class="tp-trade-card skip">
          <div class="tp-trade-header">
            <span class="tp-trade-decision skip">SKIP</span>
            <span class="tp-trade-title">${a.ticker} — No Trade</span>
          </div>
          ${tradeStage.findings.reason ? `<div class="tp-skip-reason">${esc(tradeStage.findings.reason)}</div>` : ''}
          ${tradeStage.findings.revisitCondition ? `<div class="tp-skip-revisit"><div class="tp-skip-revisit-label">Revisit when</div>${esc(tradeStage.findings.revisitCondition)}</div>` : ''}
        </div>`;
    }
  }

  // Actions
  let actions = '<div class="tp-detail-actions">';
  if (a.status === 'error') {
    actions += `<button class="btn btn-sm" onclick="window.tpRetry('${a.id}')">Retry</button>`;
  }
  if (a.status === 'running' || a.status === 'submitted') {
    actions += `<button class="btn btn-sm" onclick="window.tpCancel('${a.id}')" style="color:#ef4444">Cancel</button>`;
  }
  if (a.opportunity_id) {
    actions += `<button class="btn btn-sm" onclick="switchPage('opportunities')">View Opportunity</button>`;
  }
  actions += '</div>';

  el.innerHTML = scoreChart + stageCards + flagsSummary + tradeCard + actions;
}

function renderFlags(flags) {
  if (!flags) return '';
  const parts = [];
  if (flags.red?.length) parts.push(...flags.red.map(f => `<span class="tp-flag red">${esc(f)}</span>`));
  if (flags.green?.length) parts.push(...flags.green.map(f => `<span class="tp-flag green">${esc(f)}</span>`));
  if (flags.yellow?.length) parts.push(...flags.yellow.map(f => `<span class="tp-flag yellow">${esc(f)}</span>`));
  return parts.length ? `<div class="tp-flags">${parts.join('')}</div>` : '';
}

function renderFindings(findings) {
  if (!findings || typeof findings !== 'object') return '';
  // Skip decision/trade/reason as they're shown in trade card
  const skip = ['decision', 'trade', 'reason', 'revisitCondition', 'alternativePlay', 'conviction', 'rationale', 'keyRisks', 'exitTriggers'];
  const entries = Object.entries(findings).filter(([k]) => !skip.includes(k));
  if (!entries.length) return '';

  let html = '<dl class="tp-stage-findings">';
  for (const [key, val] of entries) {
    const label = key.replace(/([A-Z])/g, ' $1').trim();
    const display = Array.isArray(val) ? val.join(', ') : (typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val));
    html += `<dt>${esc(label)}</dt><dd>${esc(display)}</dd>`;
  }
  html += '</dl>';
  return html;
}

// ── Helpers ──

function getScoreClass(score) {
  if (score == null) return 'none';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function getScoreDotClass(score) {
  if (score >= 90) return 'score-90';
  if (score >= 80) return 'score-80';
  if (score >= 70) return 'score-70';
  if (score >= 60) return 'score-60';
  if (score >= 50) return 'score-50';
  if (score >= 40) return 'score-40';
  if (score >= 30) return 'score-30';
  return 'score-low';
}

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function esc(s) {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Window bindings ──

window.tpSubmit = async () => {
  const ticker = document.getElementById('tpTicker')?.value?.trim();
  const context = document.getElementById('tpContext')?.value?.trim();
  if (!ticker) return;

  const btn = document.getElementById('tpSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  const result = await submitTicker(ticker, context);

  if (btn) { btn.disabled = false; btn.textContent = 'Analyze'; }

  if (result.error) {
    if (result.error === 'duplicate' || result.error === 'active') {
      alert(result.message);
    } else {
      alert('Error: ' + (result.error || 'Unknown'));
    }
    return;
  }

  document.getElementById('tpTicker').value = '';
  document.getElementById('tpContext').value = '';
  await fetchAnalyses();
  await fetchStats();
};

window.tpFilter = (filter) => {
  currentFilter = filter;
  document.querySelectorAll('.tp-filter-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === filter);
  });
  fetchAnalyses();
};

window.tpToggle = (id) => toggleDetail(id);

window.tpToggleStage = (headerEl) => {
  const body = headerEl.nextElementSibling;
  const toggle = headerEl.querySelector('.tp-stage-toggle');
  body?.classList.toggle('open');
  toggle?.classList.toggle('open');
};

window.tpCancel = (id) => cancelAnalysis(id);
window.tpRetry = (id) => retryAnalysis(id);
window.unloadPipeline = unloadPipeline;
