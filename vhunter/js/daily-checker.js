// Daily Checker Page Module
import {
  getDailyChecks, addDailyCheck, updateDailyCheck, deleteDailyCheck,
  runDailyChecks, runDailyCheck
} from './db.js';
import { formatNum } from './utils.js';

let checksCache = [];
let isRunning = false;
let activeFilter = 'all';

// ── Render helpers ────────────────────────────────────────────

function signalClass(signal) {
  switch (signal) {
    case 'ENTRY NOW':  return 'entry-now';
    case 'ENTRY SOON': return 'entry-soon';
    case 'WATCH':      return 'watch';
    case 'WAIT':       return 'wait';
    case 'EXIT':       return 'exit';
    default:           return 'no-data';
  }
}

function fmtPrice(p) { return p != null ? '$' + parseFloat(p).toFixed(2) : '--'; }
function fmtPct(p)   { return p != null ? (p >= 0 ? '+' : '') + parseFloat(p).toFixed(1) + '%' : '--'; }
function fmtPctCls(p) { return p == null ? '' : p >= 0 ? 'positive' : 'negative'; }

function scoreColorClass(s) {
  if (s >= 65) return 'high';
  if (s >= 35) return 'medium';
  return 'low';
}

function priorityDots(priority) {
  return '<div class="dc-priority">' +
    [1,2,3,4,5].map(i => `<span class="dc-priority-dot ${i <= priority ? 'filled' : ''}"></span>`).join('') +
    '</div>';
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const h = Math.floor((Date.now() - new Date(isoStr).getTime()) / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Card rendering ────────────────────────────────────────────

function renderCard(check) {
  const r = check.latest_result;
  let market = null, opts = null, analysis = null;
  try { market = r?.market_snapshot ? JSON.parse(r.market_snapshot) : null; } catch (_) {}
  try { opts   = r?.options_snapshot ? JSON.parse(r.options_snapshot) : null; } catch (_) {}
  try { analysis = r?.ai_analysis ? JSON.parse(r.ai_analysis) : null; } catch (_) {}

  const signal = r?.signal || null;
  const score  = r?.opportunity_score ?? null;
  const sigCls = signalClass(signal);
  const scoreCls = score != null ? scoreColorClass(score) : 'low';

  const metricsHtml = market ? `
    <div class="dc-metric">
      <span class="dc-metric-label">Price</span>
      <span class="dc-metric-value">${fmtPrice(market.price)}</span>
    </div>
    <div class="dc-metric">
      <span class="dc-metric-label">Chg</span>
      <span class="dc-metric-value ${fmtPctCls(market.changePct)}">${fmtPct(market.changePct)}</span>
    </div>
    <div class="dc-metric">
      <span class="dc-metric-label">RSI</span>
      <span class="dc-metric-value ${market.rsi > 70 ? 'warn' : market.rsi < 30 ? 'positive' : ''}">${market.rsi != null ? parseFloat(market.rsi).toFixed(1) : '--'}</span>
    </div>
    ${opts?.avgIV != null ? `<div class="dc-metric">
      <span class="dc-metric-label">IV</span>
      <span class="dc-metric-value">${parseFloat(opts.avgIV).toFixed(1)}%</span>
    </div>` : ''}
    ${opts?.ivRank != null ? `<div class="dc-metric">
      <span class="dc-metric-label">IV Rnk</span>
      <span class="dc-metric-value">${opts.ivRank}ile</span>
    </div>` : ''}
    ${opts?.premiumBias ? `<div class="dc-metric">
      <span class="dc-metric-label">Flow</span>
      <span class="dc-metric-value ${opts.premiumBias === 'bearish' ? 'negative' : opts.premiumBias === 'bullish' ? 'positive' : ''}">${opts.premiumBias}</span>
    </div>` : ''}
    ${opts?.vrp != null ? `<div class="dc-metric">
      <span class="dc-metric-label">VRP</span>
      <span class="dc-metric-value ${opts.vrp > 0 ? 'warn' : ''}">${opts.vrp > 0 ? '+' : ''}${opts.vrp}%</span>
    </div>` : ''}
  ` : '<span style="color:var(--text-muted);font-size:0.74rem">Run analysis to see data</span>';

  const thesisValidBadge = r
    ? `<span class="dc-badge ${r.thesis_valid ? 'valid' : 'invalid'}">${r.thesis_valid ? '✓ Thesis Valid' : '✗ Thesis Broken'}</span>`
    : '';
  const macroAlignBadge = r?.macro_alignment
    ? `<span class="dc-badge ${r.macro_alignment}">${r.macro_alignment}</span>`
    : '';

  const levels = analysis?.key_levels;
  const levelsHtml = levels ? `
    <div class="dc-levels">
      ${levels.entry  != null ? `<div class="dc-level"><span class="dc-level-label">Entry</span><span class="dc-level-value">${fmtPrice(levels.entry)}</span></div>` : ''}
      ${levels.target != null ? `<div class="dc-level"><span class="dc-level-label">Target</span><span class="dc-level-value">${fmtPrice(levels.target)}</span></div>` : ''}
      ${levels.stop   != null ? `<div class="dc-level"><span class="dc-level-label">Stop</span><span class="dc-level-value">${fmtPrice(levels.stop)}</span></div>` : ''}
    </div>` : '';

  const riskBadges = (analysis?.risk_events || []).map(e => `<span class="dc-badge risk">${e}</span>`).join('');
  const ts = analysis?.trade_structure;
  const tradeHtml = ts ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Trade Structure</div>
      <div class="dc-exp-text">
        <strong>${ts.instrument || ''}</strong>
        ${ts.entry_condition ? ' — ' + ts.entry_condition : ''}
        ${ts.size_note ? '<br><small style="color:var(--text-muted)">' + ts.size_note + '</small>' : ''}
      </div>
    </div>` : '';

  return `
    <div class="dc-card" id="dc-card-${check.id}">
      <div class="dc-card-header" onclick="window.dcToggleExpand('${check.id}')">
        <div class="dc-ticker-info">
          <span class="dc-ticker" onclick="event.stopPropagation(); window.dcGoAnalyze('${check.ticker}')">${check.ticker}</span>
          <span class="dc-dir-badge ${check.direction}">${check.direction}</span>
          ${priorityDots(check.priority)}
        </div>
        <span class="dc-signal ${sigCls}">${signal || 'NO DATA'}</span>
        <div class="dc-score-wrap">
          <div class="dc-score-bar">
            <div class="dc-score-fill ${scoreCls}" style="width:${score ?? 0}%"></div>
          </div>
          <span class="dc-score-val">${score ?? '--'}</span>
        </div>
        <div class="dc-metrics-row">${metricsHtml}</div>
        <button class="dc-expand-btn" id="dc-expand-${check.id}">▼</button>
      </div>
      ${r?.ai_summary ? `<div class="dc-summary">"${r.ai_summary}"</div>` : ''}
      <div class="dc-expanded" id="dc-exp-${check.id}">
        <div class="dc-expanded-grid">
          <div class="dc-exp-block">
            <div class="dc-exp-title">Thesis</div>
            <div class="dc-exp-badges" style="margin-bottom:8px">${thesisValidBadge}${macroAlignBadge}</div>
            <div class="dc-exp-text">${analysis?.thesis_notes || check.thesis}</div>
          </div>
          <div class="dc-exp-block">
            <div class="dc-exp-title">Signal Reason</div>
            <div class="dc-exp-text">${analysis?.signal_reason || '--'}</div>
            ${levelsHtml}
          </div>
          <div class="dc-exp-block">
            <div class="dc-exp-title">Technical</div>
            <div class="dc-exp-text">${analysis?.technical_summary || '--'}</div>
          </div>
          <div class="dc-exp-block">
            <div class="dc-exp-title">Options</div>
            <div class="dc-exp-text">${analysis?.options_summary || '--'}</div>
          </div>
          ${tradeHtml}
          ${riskBadges ? `<div class="dc-exp-block">
            <div class="dc-exp-title">Risk Events</div>
            <div class="dc-exp-badges">${riskBadges}</div>
          </div>` : ''}
        </div>
        <div class="dc-exp-actions">
          <button class="btn btn-sm" onclick="window.dcRunOne('${check.id}')">↻ Run Now</button>
          <button class="btn btn-sm" onclick="window.dcGoAnalyze('${check.ticker}')">📊 Analyze</button>
          <button class="btn btn-sm" onclick="window.dcGoOptions('${check.ticker}')">📈 Options</button>
          <button class="btn btn-sm" onclick="window.dcOpenModal('${check.id}')">✎ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="window.dcDelete('${check.id}', '${check.ticker}')">✕ Delete</button>
        </div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-top:8px">Last run: ${timeAgo(r?.created_at)}</div>
      </div>
    </div>
  `;
}

function filterChecks(checks) {
  if (activeFilter === 'entry') return checks.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal));
  if (activeFilter === 'watch') return checks.filter(c => c.latest_result?.signal === 'WATCH');
  if (activeFilter === 'wait')  return checks.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT');
  return checks;
}

// ── Main render ───────────────────────────────────────────────

export function renderDailyChecker() {
  const filtered = filterChecks(checksCache);

  const runBtn = document.getElementById('dcRunBtn');
  runBtn.disabled = isRunning;
  runBtn.innerHTML = isRunning
    ? '<span class="dc-run-spinner"></span>Running...'
    : '↻ Run All';

  const entry = checksCache.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal)).length;
  document.getElementById('dcMeta').textContent =
    `${checksCache.length} active${entry ? ' · ' + entry + ' entry signal' + (entry !== 1 ? 's' : '') : ''}`;

  document.getElementById('dcTabAll').textContent   = `All (${checksCache.length})`;
  document.getElementById('dcTabEntry').textContent = `Entry (${checksCache.filter(c => ['ENTRY NOW','ENTRY SOON'].includes(c.latest_result?.signal)).length})`;
  document.getElementById('dcTabWatch').textContent = `Watch (${checksCache.filter(c => c.latest_result?.signal === 'WATCH').length})`;
  document.getElementById('dcTabWait').textContent  = `Wait (${checksCache.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT').length})`;

  const container = document.getElementById('dcCards');
  if (!filtered.length) {
    container.innerHTML = `
      <div class="dc-empty">
        <div class="dc-empty-icon">🎯</div>
        <div class="dc-empty-text">${activeFilter === 'all' ? 'No checks yet' : 'No checks in this filter'}</div>
        <div class="dc-empty-hint">${activeFilter === 'all' ? 'Add a ticker + thesis to start monitoring' : 'Switch to All to see all checks'}</div>
      </div>`;
    return;
  }
  container.innerHTML = filtered.map(renderCard).join('');
}

// ── Load ──────────────────────────────────────────────────────

export async function loadDailyChecker() {
  try {
    const result = await getDailyChecks();
    checksCache = Array.isArray(result) ? result : (result.data || []);
    renderDailyChecker();
  } catch (e) {
    console.error('[DAILY_CHECKER] Load failed:', e);
  }
}

// ── Window callbacks ──────────────────────────────────────────

window.dcToggleExpand = function(id) {
  const exp = document.getElementById(`dc-exp-${id}`);
  const btn = document.getElementById(`dc-expand-${id}`);
  if (!exp) return;
  exp.classList.toggle('open');
  btn?.classList.toggle('open', exp.classList.contains('open'));
};

window.dcSetFilter = function(filter) {
  activeFilter = filter;
  document.querySelectorAll('.dc-filter-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.filter === filter)
  );
  renderDailyChecker();
};

window.dcGoAnalyze = function(ticker) {
  document.getElementById('tk').value = ticker;
  window.switchPage('analyze');
  window.run?.();
};

window.dcGoOptions = function(ticker) {
  const optInput = document.getElementById('optTicker');
  if (optInput) optInput.value = ticker;
  window.switchPage('options');
  window.loadOptionsData?.();
};

window.dcRunAll = async function(force = false) {
  if (isRunning) return;
  isRunning = true;
  renderDailyChecker();
  try {
    await runDailyChecks(force);
    await loadDailyChecker();
  } catch (e) {
    console.error('[DAILY_CHECKER] Run all failed:', e);
  } finally {
    isRunning = false;
    renderDailyChecker();
  }
};

window.dcRunOne = async function(id) {
  const card = document.getElementById(`dc-card-${id}`);
  const signalEl = card?.querySelector('.dc-signal');
  const origText = signalEl?.textContent;
  const origCls  = signalEl?.className;
  if (signalEl) { signalEl.textContent = '...'; signalEl.className = 'dc-signal running'; }

  try {
    const res = await runDailyCheck(id);
    if (res.success && res.result) {
      const idx = checksCache.findIndex(c => c.id === id);
      if (idx >= 0) checksCache[idx].latest_result = res.result;
      renderDailyChecker();
    }
  } catch (e) {
    console.error('[DAILY_CHECKER] Run one failed:', e);
    if (signalEl) { signalEl.textContent = origText; signalEl.className = origCls; }
  }
};

window.dcOpenModal = function(checkId = null) {
  const check = checkId ? checksCache.find(c => c.id === checkId) : null;
  document.getElementById('dcModalTitle').textContent = check ? 'Edit Check' : 'Add Check';
  document.getElementById('dcForm').dataset.editId = checkId || '';
  document.getElementById('dcTickerInput').value = check?.ticker || '';
  document.getElementById('dcThesisInput').value = check?.thesis || '';
  document.getElementById('dcDirectionInput').value = check?.direction || 'monitor';
  document.getElementById('dcPriorityInput').value = check?.priority || 3;
  document.getElementById('dcTagsInput').value = check?.tags || '';
  document.getElementById('dcTickerInput').disabled = !!check;
  document.getElementById('dcModal').classList.add('dc-open');
  setTimeout(() => (check ? document.getElementById('dcThesisInput') : document.getElementById('dcTickerInput')).focus(), 50);
};

window.dcCloseModal = function() {
  document.getElementById('dcModal').classList.remove('dc-open');
};

window.dcSave = async function() {
  const form = document.getElementById('dcForm');
  const editId = form.dataset.editId;
  const ticker    = document.getElementById('dcTickerInput').value.trim().toUpperCase();
  const thesis    = document.getElementById('dcThesisInput').value.trim();
  const direction = document.getElementById('dcDirectionInput').value;
  const priority  = parseInt(document.getElementById('dcPriorityInput').value) || 3;
  const tags      = document.getElementById('dcTagsInput').value.trim() || null;

  if (!ticker || !thesis) { alert('Ticker and thesis are required.'); return; }

  try {
    if (editId) {
      await updateDailyCheck(editId, { thesis, direction, priority, tags });
    } else {
      await addDailyCheck({ ticker, thesis, direction, priority, tags });
    }
    window.dcCloseModal();
    await loadDailyChecker();
  } catch (e) {
    console.error('[DAILY_CHECKER] Save failed:', e);
    alert('Failed to save. Please try again.');
  }
};

window.dcDelete = async function(id, ticker) {
  if (!confirm(`Delete check for ${ticker}? This also deletes all history.`)) return;
  try {
    await deleteDailyCheck(id);
    await loadDailyChecker();
  } catch (e) {
    console.error('[DAILY_CHECKER] Delete failed:', e);
  }
};
