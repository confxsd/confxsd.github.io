// Daily Checker Page Module
import {
  getDailyChecks, addDailyCheck, updateDailyCheck, deleteDailyCheck,
  runDailyChecks, runDailyCheck
} from './db.js';
import { formatNum } from './utils.js';

let checksCache = [];
let isRunning = false;
let activeFilter = 'all';
let activeSort = 'priority'; // priority | score | freshness

// ── Render helpers ────────────────────────────────────────────

function signalClass(signal) {
  switch (signal) {
    case 'ENTRY NOW':  return 'entry-now';
    case 'ENTRY SOON': return 'entry-soon';
    case 'WATCH':      return 'watch';
    case 'WAIT':       return 'wait';
    case 'EXIT':       return 'exit';
    case 'AVOID':      return 'avoid';
    default:           return 'no-data';
  }
}

function fmtPrice(p) {
  if (p == null) return '--';
  const n = parseFloat(String(p).replace(/[$,]/g, ''));
  return isNaN(n) ? '--' : '$' + n.toFixed(2);
}
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

function isStale(isoStr) {
  if (!isoStr) return true;
  return (Date.now() - new Date(isoStr).getTime()) > 24 * 3600000;
}

function tfArrow(bias) {
  if (bias === 'bullish') return '↑';
  if (bias === 'bearish') return '↓';
  return '–';
}

function tfClass(bias) {
  if (bias === 'bullish') return 'tf-bull';
  if (bias === 'bearish') return 'tf-bear';
  return 'tf-neutral';
}

function convictionClass(c) {
  if (c === 'high') return 'conv-high';
  if (c === 'medium') return 'conv-med';
  return 'conv-low';
}

function sortChecks(checks) {
  return [...checks].sort((a, b) => {
    if (activeSort === 'score') {
      return (b.latest_result?.opportunity_score ?? -1) - (a.latest_result?.opportunity_score ?? -1);
    }
    if (activeSort === 'freshness') {
      const ta = a.latest_result?.created_at ? new Date(a.latest_result.created_at).getTime() : 0;
      const tb = b.latest_result?.created_at ? new Date(b.latest_result.created_at).getTime() : 0;
      return tb - ta;
    }
    // priority (default) — highest first
    return (b.priority || 0) - (a.priority || 0);
  });
}

// ── Card rendering ────────────────────────────────────────────

function renderCard(check) {
  const r = check.latest_result;
  let market = null, opts = null, analysis = null;
  try {
    const raw = r?.market_snapshot ? JSON.parse(r.market_snapshot) : null;
    market = raw?.price != null ? raw : (raw?.daily ?? null);
  } catch (_) {}
  try { opts   = r?.options_snapshot ? JSON.parse(r.options_snapshot) : null; } catch (_) {}
  try { analysis = r?.ai_analysis ? JSON.parse(r.ai_analysis) : null; } catch (_) {}

  const signal = r?.signal || null;
  const score  = r?.opportunity_score ?? null;
  const sigCls = signalClass(signal);
  const scoreCls = score != null ? scoreColorClass(score) : 'low';
  const conviction = analysis?.conviction || null;
  const tfa = analysis?.timeframe_alignment;
  const stale = isStale(r?.created_at);
  const tags = check.tags ? check.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  // ── Collapsed metrics ──
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
  ` : '<span style="color:#94a3b8;font-size:0.74rem">Run analysis to see data</span>';

  // ── Timeframe alignment compact indicator ──
  const tfHtml = tfa ? `
    <div class="dc-tf-compact" title="M: ${tfa.monthly || '?'} · W: ${tfa.weekly || '?'} · D: ${tfa.daily || '?'}">
      <span class="dc-tf-dot ${tfClass(tfa.monthly)}">M${tfArrow(tfa.monthly)}</span>
      <span class="dc-tf-dot ${tfClass(tfa.weekly)}">W${tfArrow(tfa.weekly)}</span>
      <span class="dc-tf-dot ${tfClass(tfa.daily)}">D${tfArrow(tfa.daily)}</span>
    </div>` : '';

  // ── Expanded: Thesis + validation ──
  const thesisValidBadge = r
    ? `<span class="dc-badge ${r.thesis_valid ? 'valid' : 'invalid'}">${r.thesis_valid ? '✓ Valid' : '✗ Broken'}</span>`
    : '';
  const macroAlignBadge = r?.macro_alignment
    ? `<span class="dc-badge ${r.macro_alignment}">${r.macro_alignment}</span>`
    : '';
  const alignQualBadge = tfa?.alignment_quality
    ? `<span class="dc-badge align-${tfa.alignment_quality}">${tfa.alignment_quality} alignment</span>`
    : '';

  // ── Expanded: Key levels ──
  const levels = analysis?.key_levels;
  const lvlTarget = levels ? (levels.target ?? levels.target_1 ?? null) : null;
  const levelsHtml = levels ? `
    <div class="dc-levels">
      ${levels.entry != null ? `<div class="dc-level"><span class="dc-level-label">Entry</span><span class="dc-level-value">${fmtPrice(levels.entry)}</span></div>` : ''}
      ${lvlTarget    != null ? `<div class="dc-level"><span class="dc-level-label">Target</span><span class="dc-level-value">${fmtPrice(lvlTarget)}</span></div>` : ''}
      ${levels.stop  != null ? `<div class="dc-level"><span class="dc-level-label">Stop</span><span class="dc-level-value">${fmtPrice(levels.stop)}</span></div>` : ''}
      ${levels.risk_reward != null ? `<div class="dc-level dc-level-rr"><span class="dc-level-label">R:R</span><span class="dc-level-value">${parseFloat(levels.risk_reward).toFixed(1)}x</span></div>` : ''}
      ${levels.expected_hold_days != null ? `<div class="dc-level"><span class="dc-level-label">Hold</span><span class="dc-level-value">${levels.expected_hold_days}d</span></div>` : ''}
    </div>
    ${levels.entry_zone ? `<div class="dc-entry-zone">${levels.entry_zone}</div>` : ''}
    ${levels.stop_basis ? `<div class="dc-stop-basis">Stop basis: ${levels.stop_basis}</div>` : ''}` : '';

  // ── Expanded: Timeframe alignment visual ──
  const tfDetailHtml = tfa ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Timeframe Alignment</div>
      <div class="dc-tf-grid">
        <div class="dc-tf-item ${tfClass(tfa.monthly)}"><span class="dc-tf-label">Monthly</span><span class="dc-tf-arrow">${tfArrow(tfa.monthly)}</span><span class="dc-tf-bias">${tfa.monthly || '--'}</span></div>
        <div class="dc-tf-item ${tfClass(tfa.weekly)}"><span class="dc-tf-label">Weekly</span><span class="dc-tf-arrow">${tfArrow(tfa.weekly)}</span><span class="dc-tf-bias">${tfa.weekly || '--'}</span></div>
        <div class="dc-tf-item ${tfClass(tfa.daily)}"><span class="dc-tf-label">Daily</span><span class="dc-tf-arrow">${tfArrow(tfa.daily)}</span><span class="dc-tf-bias">${tfa.daily || '--'}</span></div>
      </div>
      ${tfa.notes ? `<div class="dc-exp-text" style="margin-top:6px">${tfa.notes}</div>` : ''}
    </div>` : '';

  // ── Expanded: Position sizing ──
  const ps = analysis?.position_sizing;
  const psHtml = ps ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Position Sizing</div>
      <div class="dc-sizing-row">
        ${ps.suggested_size ? `<span class="dc-size-badge size-${ps.suggested_size}">${ps.suggested_size}</span>` : ''}
        ${ps.max_risk_pct ? `<span class="dc-size-risk">Risk ${ps.max_risk_pct}</span>` : ''}
      </div>
      ${ps.size_rationale ? `<div class="dc-exp-text">${ps.size_rationale}</div>` : ''}
      ${ps.scale_in_plan ? `<div class="dc-scale-plan"><span class="dc-scale-label">Scale-in:</span> ${ps.scale_in_plan}</div>` : ''}
    </div>` : '';

  // ── Expanded: Trade structure (enhanced) ──
  const ts = analysis?.trade_structure;
  const tradeHtml = ts ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Trade Structure</div>
      <div class="dc-exp-text">
        <strong>${ts.instrument || ''}</strong>
        ${ts.specific_structure ? ` — ${ts.specific_structure}` : ''}
      </div>
      ${ts.entry_condition ? `<div class="dc-trade-cond"><span class="dc-trade-cond-label">Entry trigger:</span> ${ts.entry_condition}</div>` : ''}
      ${ts.exit_rules ? `<div class="dc-trade-cond"><span class="dc-trade-cond-label">Exit rules:</span> ${ts.exit_rules}</div>` : ''}
      ${ts.avoid_if ? `<div class="dc-trade-avoid"><span class="dc-trade-cond-label">Avoid if:</span> ${ts.avoid_if}</div>` : ''}
    </div>` : '';

  // ── Expanded: Catalysts ──
  const cat = analysis?.catalysts;
  const riskEvents = cat?.upcoming_risk_events || analysis?.risk_events || [];
  const riskBadges = riskEvents.map(e => `<span class="dc-badge risk">${e}</span>`).join('');
  const catHtml = cat ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Catalysts & Timing</div>
      ${cat.timing_edge ? `<div class="dc-exp-text"><strong>Edge:</strong> ${cat.timing_edge}</div>` : ''}
      ${cat.news_assessment ? `<div class="dc-exp-text" style="margin-top:4px">${cat.news_assessment}</div>` : ''}
      ${riskBadges ? `<div class="dc-exp-badges" style="margin-top:6px">${riskBadges}</div>` : ''}
    </div>` : (riskBadges ? `<div class="dc-exp-block">
      <div class="dc-exp-title">Risk Events</div>
      <div class="dc-exp-badges">${riskBadges}</div>
    </div>` : '');

  // ── Expanded: Memory relevance ──
  const memHtml = analysis?.memory_relevance ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Memory Context</div>
      <div class="dc-exp-text">${analysis.memory_relevance}</div>
    </div>` : '';

  // ── Expanded: Macro notes ──
  const macroHtml = analysis?.macro_notes ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Macro</div>
      <div class="dc-exp-badges" style="margin-bottom:6px">${macroAlignBadge}</div>
      <div class="dc-exp-text">${analysis.macro_notes}</div>
    </div>` : '';

  // ── Sub-checks ──
  const subChecks = check.sub_checks || [];
  const subHtml = subChecks.length ? `
    <div class="dc-sub-checks">
      ${subChecks.map(sub => {
        let subAnalysis = null;
        try { subAnalysis = sub.latest_result?.ai_analysis ? JSON.parse(sub.latest_result.ai_analysis) : null; } catch (_) {}
        const subSig = sub.latest_result?.signal;
        const subScore = sub.latest_result?.opportunity_score;
        return `<div class="dc-sub-check">
          <span class="dc-sub-label">Sub-check</span>
          <span class="dc-signal ${signalClass(subSig)} sm">${subSig || 'NO DATA'}</span>
          <span class="dc-sub-score">${subScore ?? '--'}</span>
          <span class="dc-sub-thesis">${sub.thesis.slice(0, 120)}</span>
          <div class="dc-sub-actions">
            <button class="btn btn-sm" onclick="event.stopPropagation();window.dcRunOne('${sub.id}')">↻</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();window.dcDelete('${sub.id}','${sub.ticker}')">✕</button>
          </div>
          ${subAnalysis?.signal_reason ? `<div class="dc-sub-detail">${subAnalysis.signal_reason}</div>` : ''}
        </div>`;
      }).join('')}
    </div>` : '';

  return `
    <div class="dc-card ${stale && r ? 'dc-stale' : ''}" id="dc-card-${check.id}">
      <div class="dc-card-header" onclick="window.dcToggleExpand('${check.id}')">
        <div class="dc-ticker-info">
          <span class="dc-ticker" onclick="event.stopPropagation(); window.dcGoAnalyze('${check.ticker}')">${check.ticker}</span>
          <span class="dc-dir-badge ${check.direction}">${check.direction}</span>
          ${priorityDots(check.priority)}
          ${conviction ? `<span class="dc-conv-badge ${convictionClass(conviction)}">${conviction}</span>` : ''}
          ${stale && r ? '<span class="dc-stale-dot" title="Data >24h old"></span>' : ''}
        </div>
        <span class="dc-signal ${sigCls}">${signal || 'NO DATA'}</span>
        ${tfHtml}
        <div class="dc-score-wrap">
          <div class="dc-score-bar">
            <div class="dc-score-fill ${scoreCls}" style="width:${score ?? 0}%"></div>
          </div>
          <span class="dc-score-val">${score ?? '--'}</span>
        </div>
        <div class="dc-metrics-row">${metricsHtml}</div>
        <button class="dc-expand-btn" id="dc-expand-${check.id}">▼</button>
      </div>
      ${tags.length ? `<div class="dc-tags-row">${tags.map(t => `<span class="dc-tag">${t}</span>`).join('')}</div>` : ''}
      ${r?.ai_summary ? `<div class="dc-summary">"${r.ai_summary}"</div>` : ''}
      <div class="dc-expanded" id="dc-exp-${check.id}">
        <div class="dc-expanded-grid">
          <div class="dc-exp-block">
            <div class="dc-exp-title">Thesis</div>
            <div class="dc-exp-badges" style="margin-bottom:8px">${thesisValidBadge}${alignQualBadge}</div>
            <div class="dc-exp-text">${analysis?.thesis_notes || check.thesis}</div>
          </div>
          <div class="dc-exp-block">
            <div class="dc-exp-title">Signal Reason</div>
            <div class="dc-exp-text">${analysis?.signal_reason || '--'}</div>
            ${levelsHtml}
          </div>
          ${tfDetailHtml}
          ${psHtml}
          <div class="dc-exp-block">
            <div class="dc-exp-title">Technical</div>
            <div class="dc-exp-text">${analysis?.technical_summary || '--'}</div>
          </div>
          <div class="dc-exp-block">
            <div class="dc-exp-title">Options</div>
            <div class="dc-exp-text">${analysis?.options_summary || '--'}</div>
          </div>
          ${tradeHtml}
          ${catHtml}
          ${macroHtml}
          ${memHtml}
        </div>
        <div class="dc-exp-actions">
          <button class="btn btn-sm" onclick="window.dcRunOne('${check.id}')">↻ Run Now</button>
          <button class="btn btn-sm" onclick="window.dcGoAnalyze('${check.ticker}')">📊 Analyze</button>
          <button class="btn btn-sm" onclick="window.dcGoOptions('${check.ticker}')">📈 Options</button>
          <button class="btn btn-sm" onclick="window.dcOpenModal('${check.id}')">✎ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="window.dcDelete('${check.id}', '${check.ticker}')">✕ Delete</button>
        </div>
        <div style="font-size:0.68rem;color:#94a3b8;margin-top:8px">Last run: ${timeAgo(r?.created_at)}</div>
      </div>
      ${subHtml}
    </div>
  `;
}

function filterChecks(checks) {
  const top = checks.filter(c => !c.parent_id);
  let filtered;
  if (activeFilter === 'entry') filtered = top.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal));
  else if (activeFilter === 'watch') filtered = top.filter(c => c.latest_result?.signal === 'WATCH');
  else if (activeFilter === 'wait')  filtered = top.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT');
  else if (activeFilter === 'exit')  filtered = top.filter(c => ['EXIT', 'AVOID'].includes(c.latest_result?.signal));
  else filtered = top;
  return sortChecks(filtered);
}

// ── Main render ───────────────────────────────────────────────

export function renderDailyChecker() {
  const filtered = filterChecks(checksCache);

  const runBtn = document.getElementById('dcRunBtn');
  runBtn.disabled = isRunning;
  runBtn.innerHTML = isRunning
    ? '<span class="dc-run-spinner"></span>Running...'
    : '↻ Run All';

  const topLevel = checksCache.filter(c => !c.parent_id);
  const entryCnt = topLevel.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal)).length;
  const exitCnt  = topLevel.filter(c => ['EXIT', 'AVOID'].includes(c.latest_result?.signal)).length;
  const staleCnt = topLevel.filter(c => c.latest_result && isStale(c.latest_result.created_at)).length;

  document.getElementById('dcMeta').textContent =
    `${topLevel.length} active` +
    (entryCnt ? ` · ${entryCnt} entry` : '') +
    (exitCnt  ? ` · ${exitCnt} exit`   : '') +
    (staleCnt ? ` · ${staleCnt} stale`  : '');

  document.getElementById('dcTabAll').textContent   = `All (${topLevel.length})`;
  document.getElementById('dcTabEntry').textContent = `Entry (${entryCnt})`;
  document.getElementById('dcTabWatch').textContent = `Watch (${topLevel.filter(c => c.latest_result?.signal === 'WATCH').length})`;
  document.getElementById('dcTabWait').textContent  = `Wait (${topLevel.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT').length})`;
  document.getElementById('dcTabExit').textContent  = `Exit (${exitCnt})`;

  // Sort selector
  const sortEl = document.getElementById('dcSortSelect');
  if (sortEl) sortEl.value = activeSort;

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

window.dcSetSort = function(sort) {
  activeSort = sort;
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
