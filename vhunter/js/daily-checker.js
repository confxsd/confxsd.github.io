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
  const review = analysis?._review || null;
  const tfa = analysis?.timeframe_alignment;
  const stale = isStale(r?.created_at);
  const tags = check.tags ? check.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  // ── Earnings date badge ──
  const earningsHtml = (() => {
    if (!market?.earningsDate) return '';
    const days = market.daysToEarnings;
    if (days == null || days < 0) return '';
    const urgent = days <= 7;
    const soon = days <= 14;
    if (!soon) return '';
    const label = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `${days}d`;
    const cls = urgent ? 'dc-earnings-urgent' : 'dc-earnings-soon';
    return `<span class="${cls}" title="Earnings ${market.earningsDate}">ER ${label}</span>`;
  })();

  // ── Fund holders compact ──
  const fundHolders = market?.fundHolders || [];
  const fundHtml = fundHolders.length > 0 ? `
    <div class="dc-funds-row">
      ${fundHolders.slice(0, 5).map(f => {
        const cls = f.isNew ? 'dc-fund-new' : f.isExit ? 'dc-fund-exit' : (f.pctChange > 20 ? 'dc-fund-up' : f.pctChange < -20 ? 'dc-fund-down' : '');
        const tag = f.isNew ? ' NEW' : f.isExit ? ' EXIT' : '';
        return `<span class="dc-fund-chip ${cls}" title="${f.name} — ${((f.shares || 0) / 1e3).toFixed(0)}K shares${tag}">${f.name?.split(' ')[0] || '?'}</span>`;
      }).join('')}
      ${fundHolders.length > 5 ? `<span class="dc-fund-chip dc-fund-more">+${fundHolders.length - 5}</span>` : ''}
    </div>` : '';

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

  // ── Expanded: Counter-check review ──
  const reviewHtml = review ? (() => {
    const actionCls = review.action === 'PASS' ? 'pass' : review.action === 'REJECT' ? 'reject' : 'flag';
    const flagItems = review.flags ? Object.entries(review.flags)
      .filter(([, v]) => v?.found)
      .map(([k, v]) => `<div class="dc-review-flag-item"><span class="dc-review-flag-name">${k.replace(/_/g, ' ')}</span><span class="dc-review-flag-detail">${v.detail}</span></div>`)
      .join('') : '';
    return `
    <div class="dc-exp-block dc-review-block dc-review-${actionCls}">
      <div class="dc-exp-title">Counter-Check Review</div>
      <div class="dc-review-header">
        <span class="dc-review-grade dc-review-${actionCls}">${review.grade}</span>
        <span class="dc-review-action dc-review-${actionCls}">${review.action}</span>
        ${review.adjusted_confidence != null ? `<span class="dc-review-conf">Adj. confidence: ${(review.adjusted_confidence * 100).toFixed(0)}%</span>` : ''}
      </div>
      ${review.key_concern ? `<div class="dc-review-concern">${review.key_concern}</div>` : ''}
      ${review.counter_thesis ? `<div class="dc-review-counter"><strong>Counter-thesis:</strong> ${review.counter_thesis}</div>` : ''}
      ${flagItems ? `<div class="dc-review-flags">${flagItems}</div>` : ''}
    </div>`;
  })() : '';

  // ── Expanded: Validation demote notice ──
  const validationHtml = analysis?._validation ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Validation Override</div>
      <div class="dc-exp-text" style="color:#dc2626">Signal demoted from <strong>${analysis._validation.original_signal}</strong> → <strong>${analysis._validation.demoted_to}</strong></div>
    </div>` : '';

  // ── Expanded: Macro notes ──
  const macroHtml = analysis?.macro_notes ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Macro</div>
      <div class="dc-exp-badges" style="margin-bottom:6px">${macroAlignBadge}</div>
      <div class="dc-exp-text">${analysis.macro_notes}</div>
    </div>` : '';

  // ── Confirmation Conditions ──
  const confirmConds = analysis?.confirmation_conditions || [];
  const confirmEval = analysis?.confirmation_evaluation || {};
  const confirmHtml = confirmConds.length ? `
    <div class="dc-confirm-block">
      <div class="dc-confirm-title">Confirmation Conditions</div>
      <div class="dc-confirm-list">
        ${confirmConds.map(cond => {
          const status = confirmEval[cond] || 'pending';
          const icon = status === 'met' ? '✓' : status === 'invalidated' ? '✗' : '○';
          return `<div class="dc-confirm-item dc-confirm-${status}">
            <span class="dc-confirm-icon">${icon}</span>
            <span class="dc-confirm-text">${cond}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  return `
    <div class="dc-card ${stale && r ? 'dc-stale' : ''}" id="dc-card-${check.id}">
      <div class="dc-card-header" onclick="window.dcToggleExpand('${check.id}')">
        <div class="dc-ticker-info">
          <span class="dc-ticker" onclick="event.stopPropagation(); window.dcGoAnalyze('${check.ticker}')">${check.ticker}</span>
          <span class="dc-dir-badge ${check.direction}">${check.direction}</span>
          ${priorityDots(check.priority)}
          ${conviction ? `<span class="dc-conv-badge ${convictionClass(conviction)}">${conviction}</span>` : ''}
          ${earningsHtml}
          ${review ? `<span class="dc-review-badge dc-review-${review.action?.toLowerCase() || 'flag'}" title="${review.key_concern || ''}">${review.grade}</span>` : ''}
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
      ${fundHtml}
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
          ${analysis?.institutional_summary ? `<div class="dc-exp-block">
            <div class="dc-exp-title">Institutional Filings</div>
            <div class="dc-exp-text" style="color:#f59e0b">${analysis.institutional_summary}</div>
          </div>` : ''}
          ${tradeHtml}
          ${catHtml}
          ${macroHtml}
          ${memHtml}
          ${reviewHtml}
          ${validationHtml}
        </div>
        <div class="dc-exp-actions">
          <button class="btn btn-sm dc-run-one-btn" id="dc-run-btn-${check.id}" onclick="window.dcRunOne('${check.id}')">↻ Run Now</button>
          <button class="btn btn-sm" onclick="window.dcGoAnalyze('${check.ticker}')">📊 Analyze</button>
          <button class="btn btn-sm" onclick="window.dcGoOptions('${check.ticker}')">📈 Options</button>
          <button class="btn btn-sm" onclick="window.dcOpenModal('${check.id}')">✎ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="window.dcDelete('${check.id}', '${check.ticker}')">✕ Delete</button>
        </div>
        <div style="font-size:0.68rem;color:#94a3b8;margin-top:8px">Last run: ${timeAgo(r?.created_at)}</div>
      </div>
      ${confirmHtml}
    </div>
  `;
}

function filterChecks(checks) {
  let filtered;
  if (activeFilter === 'entry') filtered = checks.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal));
  else if (activeFilter === 'watch') filtered = checks.filter(c => c.latest_result?.signal === 'WATCH');
  else if (activeFilter === 'wait')  filtered = checks.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT');
  else if (activeFilter === 'exit')  filtered = checks.filter(c => ['EXIT', 'AVOID'].includes(c.latest_result?.signal));
  else filtered = checks;
  return sortChecks(filtered);
}

// ── Dashboard ─────────────────────────────────────────────────

function renderDashboard(topLevel) {
  const dashEl = document.getElementById('dcDashboard');
  if (!dashEl) return;

  if (!topLevel.length) { dashEl.innerHTML = ''; return; }

  const withResult = topLevel.filter(c => c.latest_result);

  // Signal distribution
  const signals = { 'ENTRY NOW': 0, 'ENTRY SOON': 0, 'WATCH': 0, 'WAIT': 0, 'EXIT': 0, 'AVOID': 0 };
  const noData = topLevel.length - withResult.length;
  withResult.forEach(c => {
    const s = c.latest_result.signal;
    if (s in signals) signals[s]++;
    else signals['WAIT']++;
  });
  signals['WAIT'] += noData;

  // Avg score
  const scores = withResult.map(c => c.latest_result.opportunity_score).filter(s => s != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const avgScoreCls = avgScore >= 65 ? 'high' : avgScore >= 35 ? 'medium' : 'low';

  // Conviction breakdown
  const conv = { high: 0, medium: 0, low: 0 };
  withResult.forEach(c => {
    try {
      const a = c.latest_result.ai_analysis ? JSON.parse(c.latest_result.ai_analysis) : null;
      if (a?.conviction && a.conviction in conv) conv[a.conviction]++;
    } catch (_) {}
  });

  // Stale
  const staleCnt = withResult.filter(c => isStale(c.latest_result.created_at)).length;

  // Direction
  const dirs = { long: 0, short: 0, monitor: 0 };
  topLevel.forEach(c => { if (c.direction in dirs) dirs[c.direction]++; });

  // Signal bar
  const total = topLevel.length || 1;
  const barSegments = [
    { key: 'ENTRY NOW',  cls: 'bar-entry-now',  count: signals['ENTRY NOW'] },
    { key: 'ENTRY SOON', cls: 'bar-entry-soon', count: signals['ENTRY SOON'] },
    { key: 'WATCH',      cls: 'bar-watch',      count: signals['WATCH'] },
    { key: 'WAIT',       cls: 'bar-wait',       count: signals['WAIT'] },
    { key: 'EXIT',       cls: 'bar-exit',        count: signals['EXIT'] + signals['AVOID'] },
  ].filter(s => s.count > 0);

  dashEl.innerHTML = `
    <div class="dc-dash">
      <div class="dc-dash-bar">
        ${barSegments.map(s =>
          `<div class="dc-dash-seg ${s.cls}" style="width:${(s.count / total * 100).toFixed(1)}%" title="${s.key}: ${s.count}"></div>`
        ).join('')}
      </div>
      <div class="dc-dash-legend">
        ${barSegments.map(s => `<span class="dc-dash-leg-item"><span class="dc-dash-dot ${s.cls}"></span>${s.count} ${s.key.toLowerCase()}</span>`).join('')}
      </div>
      <div class="dc-dash-stats">
        <div class="dc-dash-stat">
          <span class="dc-dash-stat-val ${avgScoreCls}">${avgScore ?? '--'}</span>
          <span class="dc-dash-stat-label">Avg Score</span>
        </div>
        <div class="dc-dash-stat">
          <span class="dc-dash-stat-val">${dirs.long}<span class="dc-dash-sub">L</span> ${dirs.short}<span class="dc-dash-sub">S</span> ${dirs.monitor}<span class="dc-dash-sub">M</span></span>
          <span class="dc-dash-stat-label">Direction</span>
        </div>
        <div class="dc-dash-stat">
          <span class="dc-dash-stat-val">${conv.high}<span class="dc-dash-sub conv-high">H</span> ${conv.medium}<span class="dc-dash-sub conv-med">M</span> ${conv.low}<span class="dc-dash-sub conv-low">L</span></span>
          <span class="dc-dash-stat-label">Conviction</span>
        </div>
        ${staleCnt ? `<div class="dc-dash-stat">
          <span class="dc-dash-stat-val dc-dash-stale">${staleCnt}</span>
          <span class="dc-dash-stat-label">Stale (&gt;24h)</span>
        </div>` : ''}
      </div>
    </div>`;
}

// ── Main render ───────────────────────────────────────────────

export function renderDailyChecker() {
  const filtered = filterChecks(checksCache);

  const runBtn = document.getElementById('dcRunBtn');
  runBtn.disabled = isRunning;
  runBtn.innerHTML = isRunning
    ? '<span class="dc-run-spinner"></span>Running...'
    : '↻ Run All';

  const allChecks = checksCache;
  const entryCnt = allChecks.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal)).length;
  const exitCnt  = allChecks.filter(c => ['EXIT', 'AVOID'].includes(c.latest_result?.signal)).length;
  const staleCnt = allChecks.filter(c => c.latest_result && isStale(c.latest_result.created_at)).length;

  document.getElementById('dcMeta').textContent =
    `${allChecks.length} active` +
    (entryCnt ? ` · ${entryCnt} entry` : '') +
    (exitCnt  ? ` · ${exitCnt} exit`   : '') +
    (staleCnt ? ` · ${staleCnt} stale`  : '');

  document.getElementById('dcTabAll').textContent   = `All (${allChecks.length})`;
  document.getElementById('dcTabEntry').textContent = `Entry (${entryCnt})`;
  document.getElementById('dcTabWatch').textContent = `Watch (${allChecks.filter(c => c.latest_result?.signal === 'WATCH').length})`;
  document.getElementById('dcTabWait').textContent  = `Wait (${allChecks.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT').length})`;
  document.getElementById('dcTabExit').textContent  = `Exit (${exitCnt})`;

  // Dashboard + Sort
  renderDashboard(allChecks);
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
