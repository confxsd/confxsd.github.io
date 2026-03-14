// Daily Checker Page Module
import {
  getDailyChecks, addDailyCheck, updateDailyCheck, deleteDailyCheck,
  runDailyChecks, runDailyCheck, toggleDailyCheckStar,
  runOptionsRec, getOptionsRec
} from './db.js';
import { formatNum } from './utils.js';
import { registerStrip } from './history.js';

let checksCache = [];
let isRunning = false;
let activeFilter = 'all';
let activeSort = 'priority'; // priority | score | freshness
let searchQuery = '';

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
    // Starred items always pin to top
    const sa = a.starred ? 1 : 0;
    const sb = b.starred ? 1 : 0;
    if (sa !== sb) return sb - sa;

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

  // ── Catalyst badges (earnings, ex-div, split) ──
  const catalystBadges = (() => {
    const cal = market?.catalystCalendar;
    const badges = [];

    // Earnings badge
    const erDate = cal?.earnings?.date || market?.earningsDate;
    const erDays = cal?.earnings?.days ?? market?.daysToEarnings;
    if (erDate && erDays != null && erDays >= 0 && erDays <= 14) {
      const label = erDays === 0 ? 'TODAY' : erDays === 1 ? 'TOMORROW' : `${erDays}d`;
      const cls = erDays <= 7 ? 'dc-earnings-urgent' : 'dc-earnings-soon';
      badges.push(`<span class="${cls}" title="Earnings ${erDate}">ER ${label}</span>`);
    }

    // Ex-dividend badge
    if (cal?.exDividend && cal.exDividend.days <= 14) {
      const d = cal.exDividend;
      const label = d.days === 0 ? 'TODAY' : d.days === 1 ? 'TOMORROW' : `${d.days}d`;
      const cls = d.days <= 3 ? 'dc-earnings-urgent' : 'dc-earnings-soon';
      const amt = d.amount ? ` $${d.amount}` : '';
      badges.push(`<span class="${cls}" title="Ex-Div ${d.date}${amt}">DIV ${label}</span>`);
    }

    // Stock split badge
    if (cal?.split && cal.split.days <= 30) {
      const s = cal.split;
      const label = s.days <= 1 ? (s.days === 0 ? 'TODAY' : 'TOMORROW') : `${s.days}d`;
      const ratio = s.ratio ? ` ${s.ratio}` : '';
      badges.push(`<span class="dc-earnings-soon" title="Split ${s.date}${ratio}">SPLIT ${label}</span>`);
    }

    return badges.join('');
  })();
  const earningsHtml = catalystBadges;

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
    ${market?.shortInterest?.shortFloatPct != null ? `<div class="dc-metric">
      <span class="dc-metric-label">SI</span>
      <span class="dc-metric-value ${market.shortInterest.shortFloatPct >= 20 ? 'negative' : market.shortInterest.shortFloatPct >= 10 ? 'warn' : ''}">${parseFloat(market.shortInterest.shortFloatPct).toFixed(1)}%</span>
    </div>` : ''}
    ${market?.shortInterest?.shortRatio != null ? `<div class="dc-metric">
      <span class="dc-metric-label">DTC</span>
      <span class="dc-metric-value ${market.shortInterest.shortRatio >= 5 ? 'negative' : market.shortInterest.shortRatio >= 3 ? 'warn' : ''}">${parseFloat(market.shortInterest.shortRatio).toFixed(1)}d</span>
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
  const cal = market?.catalystCalendar;
  const riskEvents = cat?.upcoming_risk_events || analysis?.risk_events || [];
  const riskBadges = riskEvents.map(e => `<span class="dc-badge risk">${e}</span>`).join('');
  const calendarLines = (() => {
    if (!cal) return '';
    const items = [];
    if (cal.earnings) items.push(`<div class="dc-cat-line"><span class="dc-cat-icon">📊</span> Earnings: ${cal.earnings.date} (${cal.earnings.days}d)</div>`);
    if (cal.exDividend) items.push(`<div class="dc-cat-line"><span class="dc-cat-icon">💰</span> Ex-Div: ${cal.exDividend.date} (${cal.exDividend.days}d)${cal.exDividend.amount ? ` — $${cal.exDividend.amount}` : ''}</div>`);
    if (cal.split) items.push(`<div class="dc-cat-line"><span class="dc-cat-icon">🔀</span> Split: ${cal.split.date} (${cal.split.days}d)${cal.split.ratio ? ` ${cal.split.ratio}` : ''}</div>`);
    return items.length ? `<div class="dc-cat-calendar">${items.join('')}</div>` : '';
  })();
  const catHtml = (cat || calendarLines) ? `
    <div class="dc-exp-block">
      <div class="dc-exp-title">Catalysts & Timing</div>
      ${calendarLines}
      ${cat?.catalyst_impact ? `<div class="dc-exp-text" style="margin-top:4px"><strong>Impact:</strong> ${cat.catalyst_impact}</div>` : ''}
      ${cat?.timing_edge ? `<div class="dc-exp-text" style="margin-top:4px"><strong>Edge:</strong> ${cat.timing_edge}</div>` : ''}
      ${cat?.news_assessment ? `<div class="dc-exp-text" style="margin-top:4px">${cat.news_assessment}</div>` : ''}
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

  const isInactive = check.status === 'paused';
  const starred = check.starred;

  return `
    <div class="dc-card ${stale && r ? 'dc-stale' : ''} ${isInactive ? 'dc-paused' : ''}" id="dc-card-${check.id}">
      <div class="dc-card-top-actions">
        <button class="dc-top-btn dc-top-star ${starred ? 'starred' : ''}" onclick="event.stopPropagation(); window.dcToggleStar('${check.id}')" title="${starred ? 'Unstar' : 'Star'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </button>
        <button class="dc-top-btn dc-top-run" id="dc-run-btn-${check.id}" onclick="window.dcRunOne('${check.id}')" title="Run Now">↻</button>
        <button class="dc-top-btn dc-top-del" onclick="window.dcDelete('${check.id}', '${check.ticker}')" title="Delete">✕</button>
      </div>
      <div class="dc-card-header" onclick="window.dcToggleExpand('${check.id}')">
        <div class="dc-ticker-info">
          <button class="dc-toggle-btn ${isInactive ? 'off' : 'on'}" onclick="event.stopPropagation(); window.dcToggleActive('${check.id}')" title="${isInactive ? 'Activate' : 'Deactivate'}">
            <span class="dc-toggle-track"><span class="dc-toggle-thumb"></span></span>
          </button>
          <span class="dc-ticker" onclick="event.stopPropagation(); window.dcGoAnalyze('${check.ticker}')">${check.ticker}</span>
          <span class="dc-dir-badge ${check.direction}">${check.direction}</span>
          ${priorityDots(check.priority)}
          ${conviction ? `<span class="dc-conv-badge ${convictionClass(conviction)}">${conviction}</span>` : ''}
          ${earningsHtml}
          ${review ? `<span class="dc-review-badge dc-review-${review.action?.toLowerCase() || 'flag'}" title="${review.key_concern || ''}">${review.grade}</span>` : ''}
          ${(check.strategies || []).map(s => `<span class="dc-strategy-badge" title="${s.name}">${s.category.replace(/_/g, ' ')}</span>`).join('')}
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
        <div class="dc-exp-actions">
          <button class="btn btn-sm" onclick="window.dcGoAnalyze('${check.ticker}')">📊 Analyze</button>
          <button class="btn btn-sm" onclick="window.dcGoOptions('${check.ticker}')">📈 Options</button>
          <button class="btn btn-sm" onclick="window.dcRunOptionsRec('${check.id}')" id="dc-optrec-btn-${check.id}">🎯 Options Rec</button>
          <button class="btn btn-sm" onclick="window.dcOpenModal('${check.id}')">✎ Edit</button>
          <button class="btn btn-sm dc-copy-llm-btn" id="dc-copy-btn-${check.id}" onclick="window.dcCopyForLLM('${check.id}')">📋 Copy for LLM</button>
        </div>
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
          ${market?.shortInterest?.shortFloatPct != null ? (() => {
            const si = market.shortInterest;
            const sqRisk = si.shortFloatPct >= 20 ? 'HIGH' : si.shortFloatPct >= 10 ? 'MODERATE' : 'LOW';
            const sqCls = sqRisk === 'HIGH' ? 'negative' : sqRisk === 'MODERATE' ? 'warn' : '';
            const fmtShr = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v;
            return `<div class="dc-exp-block">
            <div class="dc-exp-title">Short Interest</div>
            <div class="dc-levels">
              <div class="dc-level"><span class="dc-level-label">Short Float</span><span class="dc-level-value ${sqCls}">${si.shortFloatPct.toFixed(1)}%</span></div>
              <div class="dc-level"><span class="dc-level-label">Days to Cover</span><span class="dc-level-value ${si.shortRatio >= 5 ? 'negative' : si.shortRatio >= 3 ? 'warn' : ''}">${si.shortRatio?.toFixed(1) || '--'}d</span></div>
              <div class="dc-level"><span class="dc-level-label">Shares Short</span><span class="dc-level-value">${si.sharesShort ? fmtShr(si.sharesShort) : '--'}</span></div>
              <div class="dc-level"><span class="dc-level-label">Float</span><span class="dc-level-value">${si.sharesFloat ? fmtShr(si.sharesFloat) : '--'}</span></div>
              <div class="dc-level"><span class="dc-level-label">Squeeze Risk</span><span class="dc-level-value ${sqCls}">${sqRisk}</span></div>
            </div>
            <div class="dc-levels" style="margin-top:4px">
              <div class="dc-level"><span class="dc-level-label">Insider</span><span class="dc-level-value">${si.insiderOwnPct != null ? si.insiderOwnPct.toFixed(1) + '%' : '--'}</span></div>
              <div class="dc-level"><span class="dc-level-label">Inst Own</span><span class="dc-level-value">${si.instOwnPct != null ? si.instOwnPct.toFixed(1) + '%' : '--'}</span></div>
            </div>
          </div>`;
          })() : ''}
          ${analysis?.institutional_summary ? `<div class="dc-exp-block">
            <div class="dc-exp-title">Institutional Filings</div>
            <div class="dc-exp-text" style="color:#f59e0b">${analysis.institutional_summary}</div>
          </div>` : ''}
          ${analysis?.strategy_fit ? `<div class="dc-exp-block">
            <div class="dc-exp-title">Strategy Fit</div>
            <div class="dc-exp-badges" style="margin-bottom:6px">
              <span class="dc-badge ${analysis.strategy_fit.still_fits ? 'valid' : 'invalid'}">${analysis.strategy_fit.still_fits ? 'FITS' : 'DRIFTED'}</span>
              ${analysis.strategy_fit.strategy_entry_met ? '<span class="dc-badge valid">ENTRY MET</span>' : ''}
              ${analysis.strategy_fit.strategy_exit_triggered ? '<span class="dc-badge invalid">EXIT TRIGGERED</span>' : ''}
            </div>
            <div class="dc-exp-text">${analysis.strategy_fit.fit_notes || '--'}</div>
          </div>` : ''}
          ${tradeHtml}
          <div id="dc-optrec-${check.id}" class="dc-optrec-container"></div>
          ${catHtml}
          ${macroHtml}
          ${memHtml}
          ${reviewHtml}
          ${validationHtml}
        </div>
        <div style="font-size:0.68rem;color:#94a3b8;margin-top:8px">Last run: ${timeAgo(r?.created_at)}</div>
      </div>
      ${confirmHtml}
    </div>
  `;
}

function filterChecks(checks) {
  let filtered;
  if (activeFilter === 'starred') { filtered = checks.filter(c => c.starred); }
  else if (activeFilter === 'entry') filtered = checks.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal));
  else if (activeFilter === 'watch') filtered = checks.filter(c => c.latest_result?.signal === 'WATCH');
  else if (activeFilter === 'wait')  filtered = checks.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT');
  else if (activeFilter === 'exit')  filtered = checks.filter(c => ['EXIT', 'AVOID'].includes(c.latest_result?.signal));
  else if (activeFilter === 'paused') filtered = checks.filter(c => c.status === 'paused');
  else filtered = checks;
  if (searchQuery) {
    const q = searchQuery.toUpperCase();
    filtered = filtered.filter(c => c.ticker.includes(q));
  }
  return sortChecks(filtered);
}

// ── Dashboard ─────────────────────────────────────────────────



// ── Main render ───────────────────────────────────────────────

export function renderDailyChecker() {
  const filtered = filterChecks(checksCache);

  const runBtn = document.getElementById('dcRunBtn');
  const forceBtn = document.getElementById('dcForceRunBtn');
  runBtn.disabled = isRunning;
  if (forceBtn) forceBtn.disabled = isRunning;
  const activeCnt = checksCache.filter(c => c.status !== 'paused').length;
  const allOn = checksCache.length > 0 && activeCnt === checksCache.length;
  runBtn.innerHTML = isRunning
    ? '<span class="dc-run-spinner"></span>Running...'
    : `▶ Run (${activeCnt})`;
  if (forceBtn) forceBtn.innerHTML = isRunning
    ? '<span class="dc-run-spinner"></span>Running...'
    : `↻ Force (${activeCnt})`;
  const toggleAllBtn = document.getElementById('dcToggleAllBtn');
  if (toggleAllBtn) {
    toggleAllBtn.textContent = allOn ? '⏸ Off All' : '▶ On All';
    toggleAllBtn.classList.toggle('dc-toggle-all-off', allOn);
    toggleAllBtn.classList.toggle('dc-toggle-all-on', !allOn);
  }

  const allChecks = checksCache;
  const entryCnt = allChecks.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal)).length;
  const exitCnt  = allChecks.filter(c => ['EXIT', 'AVOID'].includes(c.latest_result?.signal)).length;
  const staleCnt = allChecks.filter(c => c.latest_result && isStale(c.latest_result.created_at)).length;

  // dcMeta removed

  const pausedCnt = allChecks.filter(c => c.status === 'paused').length;
  const activeChecks = allChecks.filter(c => c.status !== 'paused');

  const starredCnt = allChecks.filter(c => c.starred).length;
  const starredTab = document.getElementById('dcTabStarred');
  if (starredTab) starredTab.textContent = `★ (${starredCnt})`;

  document.getElementById('dcTabAll').textContent   = `All (${allChecks.length})`;
  document.getElementById('dcTabEntry').textContent = `Entry (${entryCnt})`;
  document.getElementById('dcTabWatch').textContent = `Watch (${activeChecks.filter(c => c.latest_result?.signal === 'WATCH').length})`;
  document.getElementById('dcTabWait').textContent  = `Wait (${activeChecks.filter(c => !c.latest_result || c.latest_result?.signal === 'WAIT').length})`;
  document.getElementById('dcTabExit').textContent  = `Exit (${exitCnt})`;
  const pausedTab = document.getElementById('dcTabPaused');
  if (pausedTab) pausedTab.textContent = `Inactive (${pausedCnt})`;

  // Dashboard + Sort
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

export function updateDailyBadge() {
  const badge = document.getElementById('dcNavBadge');
  if (!badge) return;
  const count = checksCache.filter(c => ['ENTRY NOW', 'ENTRY SOON'].includes(c.latest_result?.signal)).length;
  badge.textContent = count;
  badge.classList.toggle('active', count > 0);
}

export async function prefetchDailyBadge() {
  try {
    const result = await getDailyChecks();
    checksCache = Array.isArray(result) ? result : (result.data || []);
    updateDailyBadge();
  } catch (_) {}
}

export async function loadDailyChecker() {
  try {
    const result = await getDailyChecks();
    checksCache = Array.isArray(result) ? result : (result.data || []);
    renderDailyChecker();
    updateDailyBadge();
    registerStrip('dcHistoryStrip', (ticker) => {
      const input = document.getElementById('dcSearchInput');
      if (input) { input.value = ticker; window.dcSetSearch(ticker); }
    });
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

window.dcSetSearch = function(query) {
  searchQuery = query.trim();
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
    const resp = await runDailyChecks(force);
    if (resp?.queued && resp?.enqueued > 0) {
      // Queue returns immediately — poll until results arrive
      const maxPolls = 60;       // up to ~5 min
      const interval = 5000;     // 5s between polls
      const before = checksCache.map(c => c.latest_result?.created_at).join(',');
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, interval));
        await loadDailyChecker();
        const after = checksCache.map(c => c.latest_result?.created_at).join(',');
        if (after !== before) break;   // results updated
      }
    } else {
      await loadDailyChecker();
    }
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
  const runBtn = document.getElementById(`dc-run-btn-${id}`);
  const origText = signalEl?.textContent;
  const origCls  = signalEl?.className;
  if (signalEl) { signalEl.textContent = '...'; signalEl.className = 'dc-signal running'; }
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="dc-run-spinner"></span>';
  }

  try {
    const res = await runDailyCheck(id);
    if (res.success && res.result) {
      const idx = checksCache.findIndex(c => c.id === id);
      if (idx >= 0) {
        checksCache[idx].latest_result = res.result;
        if (res.autoDeactivated) checksCache[idx].status = 'paused';
      }
      renderDailyChecker();
    }
  } catch (e) {
    console.error('[DAILY_CHECKER] Run one failed:', e);
    if (signalEl) { signalEl.textContent = origText; signalEl.className = origCls; }
    if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '↻'; }
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

window.dcToggleAll = async function() {
  if (!checksCache.length) return;
  const allOn = checksCache.every(c => c.status !== 'paused');
  const newStatus = allOn ? 'paused' : 'active';
  try {
    await Promise.all(checksCache.map(c => {
      if (c.status === newStatus) return;
      return updateDailyCheck(c.id, { status: newStatus });
    }));
    await loadDailyChecker();
  } catch (e) {
    console.error('[DAILY_CHECKER] Toggle all failed:', e);
  }
};

window.dcToggleActive = async function(id) {
  const check = checksCache.find(c => c.id === id);
  if (!check) return;
  const newStatus = check.status === 'paused' ? 'active' : 'paused';
  try {
    await updateDailyCheck(id, { status: newStatus });
    check.status = newStatus;
    renderDailyChecker();
    updateDailyBadge();
  } catch (e) {
    console.error('[DAILY_CHECKER] Toggle failed:', e);
  }
};

window.dcToggleStar = async function(id) {
  const check = checksCache.find(c => c.id === id);
  if (!check) return;
  // Optimistic update
  check.starred = !check.starred;
  renderDailyChecker();
  try {
    const res = await toggleDailyCheckStar(id);
    check.starred = res.starred;
    renderDailyChecker();
  } catch (e) {
    // Revert on failure
    check.starred = !check.starred;
    renderDailyChecker();
    console.error('[DAILY_CHECKER] Star toggle failed:', e);
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

// ── Copy for LLM ─────────────────────────────────────────────

function buildLLMText(check) {
  const r = check.latest_result;
  let market = null, opts = null, analysis = null;
  try {
    const raw = r?.market_snapshot ? JSON.parse(r.market_snapshot) : null;
    market = raw?.price != null ? raw : (raw?.daily ?? null);
  } catch (_) {}
  try { opts = r?.options_snapshot ? JSON.parse(r.options_snapshot) : null; } catch (_) {}
  try { analysis = r?.ai_analysis ? JSON.parse(r.ai_analysis) : null; } catch (_) {}

  const lines = [];
  const add = (label, val) => { if (val != null && val !== '' && val !== '--') lines.push(`${label}: ${val}`); };
  const section = (title) => { lines.push(''); lines.push(`── ${title} ──`); };
  const divider = () => lines.push('');

  lines.push(`═══ DAILY CHECK: ${check.ticker} ═══`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  if (r?.created_at) lines.push(`Last Analysis: ${r.created_at}`);
  divider();

  // Core info
  add('Direction', check.direction?.toUpperCase());
  add('Priority', `${check.priority}/5`);
  add('Status', check.status);
  if (check.tags) add('Tags', check.tags);
  if (check.starred) add('Starred', 'Yes');
  divider();

  // Thesis
  section('THESIS');
  lines.push(check.thesis);
  if (analysis?.thesis_notes && analysis.thesis_notes !== check.thesis) {
    lines.push(`Thesis Notes: ${analysis.thesis_notes}`);
  }
  if (r) {
    add('Thesis Valid', r.thesis_valid ? 'YES' : 'NO');
    add('Macro Alignment', r.macro_alignment?.toUpperCase());
  }

  // Signal & Score
  if (r) {
    section('SIGNAL & SCORE');
    add('Signal', r.signal);
    add('Opportunity Score', `${r.opportunity_score}/100`);
    if (analysis?.conviction) add('Conviction', analysis.conviction.toUpperCase());
    if (r.ai_summary) add('AI Summary', r.ai_summary);
    if (analysis?.signal_reason) add('Signal Reason', analysis.signal_reason);
  }

  // Market Snapshot
  if (market) {
    section('MARKET SNAPSHOT');
    add('Price', fmtPrice(market.price));
    add('Change', fmtPct(market.changePct));
    add('RSI (14)', market.rsi != null ? parseFloat(market.rsi).toFixed(1) : null);

    const si = market.shortInterest;
    if (si) {
      add('Short Interest (% Float)', si.shortFloatPct != null ? `${parseFloat(si.shortFloatPct).toFixed(1)}%` : null);
      add('Days to Cover', si.shortRatio != null ? `${parseFloat(si.shortRatio).toFixed(1)}` : null);
      add('Shares Short', si.sharesShort != null ? si.sharesShort.toLocaleString() : null);
      add('Shares Float', si.sharesFloat != null ? si.sharesFloat.toLocaleString() : null);
      const sqRisk = si.shortFloatPct >= 20 ? 'HIGH' : si.shortFloatPct >= 10 ? 'MODERATE' : 'LOW';
      add('Squeeze Risk', sqRisk);
      add('Insider Ownership', si.insiderOwnPct != null ? `${si.insiderOwnPct.toFixed(1)}%` : null);
      add('Institutional Ownership', si.instOwnPct != null ? `${si.instOwnPct.toFixed(1)}%` : null);
    }
  }

  // Options Snapshot
  if (opts) {
    section('OPTIONS SNAPSHOT');
    add('Avg IV', opts.avgIV != null ? `${parseFloat(opts.avgIV).toFixed(1)}%` : null);
    add('IV Rank', opts.ivRank != null ? `${opts.ivRank}th percentile` : null);
    add('Premium Flow Bias', opts.premiumBias);
    add('VRP', opts.vrp != null ? `${opts.vrp > 0 ? '+' : ''}${opts.vrp}%` : null);
  }

  // Key Levels
  const levels = analysis?.key_levels;
  if (levels) {
    section('KEY LEVELS');
    add('Entry', fmtPrice(levels.entry));
    add('Target', fmtPrice(levels.target ?? levels.target_1));
    add('Stop', fmtPrice(levels.stop));
    add('Risk:Reward', levels.risk_reward != null ? `${parseFloat(levels.risk_reward).toFixed(1)}x` : null);
    add('Expected Hold', levels.expected_hold_days != null ? `${levels.expected_hold_days} days` : null);
    add('Entry Zone', levels.entry_zone);
    add('Stop Basis', levels.stop_basis);
  }

  // Timeframe Alignment
  const tfa = analysis?.timeframe_alignment;
  if (tfa) {
    section('TIMEFRAME ALIGNMENT');
    add('Monthly', tfa.monthly);
    add('Weekly', tfa.weekly);
    add('Daily', tfa.daily);
    add('Alignment Quality', tfa.alignment_quality);
    if (tfa.notes) add('Notes', tfa.notes);
  }

  // Position Sizing
  const ps = analysis?.position_sizing;
  if (ps) {
    section('POSITION SIZING');
    add('Suggested Size', ps.suggested_size?.toUpperCase());
    add('Max Risk', ps.max_risk_pct);
    add('Rationale', ps.size_rationale);
    add('Scale-in Plan', ps.scale_in_plan);
  }

  // Technical & Options Summaries
  if (analysis?.technical_summary) {
    section('TECHNICAL ANALYSIS');
    lines.push(analysis.technical_summary);
  }
  if (analysis?.options_summary) {
    section('OPTIONS ANALYSIS');
    lines.push(analysis.options_summary);
  }

  // Trade Structure
  const ts = analysis?.trade_structure;
  if (ts) {
    section('TRADE STRUCTURE');
    add('Instrument', ts.instrument);
    add('Structure', ts.specific_structure);
    add('Entry Trigger', ts.entry_condition);
    add('Exit Rules', ts.exit_rules);
    add('Avoid If', ts.avoid_if);
  }

  // Strategy Fit
  const sf = analysis?.strategy_fit;
  if (sf) {
    section('STRATEGY FIT');
    add('Still Fits', sf.still_fits ? 'YES' : 'NO');
    add('Entry Met', sf.strategy_entry_met ? 'YES' : 'NO');
    add('Exit Triggered', sf.strategy_exit_triggered ? 'YES' : 'NO');
    if (sf.fit_notes) add('Notes', sf.fit_notes);
  }

  // Catalysts
  const cat = analysis?.catalysts;
  const cal = market?.catalystCalendar;
  if (cat || cal) {
    section('CATALYSTS & TIMING');
    if (cal?.earnings) add('Earnings', `${cal.earnings.date} (${cal.earnings.days}d away)`);
    if (cal?.exDividend) add('Ex-Dividend', `${cal.exDividend.date} (${cal.exDividend.days}d away)${cal.exDividend.amount ? ` $${cal.exDividend.amount}` : ''}`);
    if (cal?.split) add('Split', `${cal.split.date} (${cal.split.days}d away)${cal.split.ratio ? ` ${cal.split.ratio}` : ''}`);
    add('Catalyst Impact', cat?.catalyst_impact);
    add('Timing Edge', cat?.timing_edge);
    add('News Assessment', cat?.news_assessment);
    const riskEvents = cat?.upcoming_risk_events || analysis?.risk_events || [];
    if (riskEvents.length) add('Risk Events', riskEvents.join(', '));
  }

  // Macro
  if (analysis?.macro_notes) {
    section('MACRO CONTEXT');
    lines.push(analysis.macro_notes);
  }

  // Institutional
  if (analysis?.institutional_summary) {
    section('INSTITUTIONAL FILINGS');
    lines.push(analysis.institutional_summary);
  }

  // Fund Holders
  const fh = market?.fundHolders;
  if (fh?.length) {
    section('FUND HOLDERS');
    fh.forEach(f => {
      const tag = f.isNew ? ' [NEW]' : f.isExit ? ' [EXIT]' : (f.pctChange ? ` [${f.pctChange > 0 ? '+' : ''}${f.pctChange}%]` : '');
      lines.push(`  ${f.name} — ${((f.shares || 0) / 1e3).toFixed(0)}K shares${tag}`);
    });
  }

  // Memory Context
  if (analysis?.memory_relevance) {
    section('MEMORY CONTEXT');
    lines.push(analysis.memory_relevance);
  }

  // Counter-Check Review
  const review = analysis?._review;
  if (review) {
    section('COUNTER-CHECK REVIEW');
    add('Grade', review.grade);
    add('Action', review.action);
    add('Adjusted Confidence', review.adjusted_confidence != null ? `${(review.adjusted_confidence * 100).toFixed(0)}%` : null);
    add('Key Concern', review.key_concern);
    add('Counter-Thesis', review.counter_thesis);
    if (review.flags) {
      const flagged = Object.entries(review.flags).filter(([, v]) => v?.found);
      if (flagged.length) {
        lines.push('Flags:');
        flagged.forEach(([k, v]) => lines.push(`  - ${k.replace(/_/g, ' ')}: ${v.detail}`));
      }
    }
  }

  // Validation Override
  if (analysis?._validation) {
    section('VALIDATION OVERRIDE');
    lines.push(`Signal demoted from ${analysis._validation.original_signal} → ${analysis._validation.demoted_to}`);
  }

  // Confirmation Conditions
  const cc = analysis?.confirmation_conditions || [];
  const ce = analysis?.confirmation_evaluation || {};
  if (cc.length) {
    section('CONFIRMATION CONDITIONS');
    cc.forEach(cond => {
      const status = ce[cond] || 'pending';
      const icon = status === 'met' ? '[MET]' : status === 'invalidated' ? '[INVALIDATED]' : '[PENDING]';
      lines.push(`  ${icon} ${cond}`);
    });
  }

  // Linked Strategies
  if (check.strategies?.length) {
    section('LINKED STRATEGIES');
    check.strategies.forEach(s => {
      lines.push(`  ${s.category.replace(/_/g, ' ')} — ${s.name}`);
    });
  }

  lines.push('');
  lines.push('═══ END ═══');
  return lines.join('\n');
}

window.dcCopyForLLM = async function(id) {
  const check = checksCache.find(c => c.id === id);
  if (!check) return;
  const text = buildLLMText(check);
  const btn = document.getElementById(`dc-copy-btn-${id}`);
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '📋 Copy for LLM'; }, 1500); }
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '📋 Copy for LLM'; }, 1500); }
  }
};

// ── Options Rec ──────────────────────────────────────────────

window.dcRunOptionsRec = async function(checkId) {
  const container = document.getElementById(`dc-optrec-${checkId}`);
  const btn = document.getElementById(`dc-optrec-btn-${checkId}`);
  if (!container) return;

  // Expand card if not open
  const exp = document.getElementById(`dc-exp-${checkId}`);
  if (exp && !exp.classList.contains('open')) {
    exp.classList.add('open');
    const expandBtn = document.getElementById(`dc-expand-${checkId}`);
    expandBtn?.classList.add('open');
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Running...'; }
  container.innerHTML = '<div class="dc-optrec-loading"><span class="dc-run-spinner"></span> Running 3-stage options analysis...</div>';

  try {
    const result = await runOptionsRec(checkId);
    if (result.success) {
      container.innerHTML = renderOptionsRec(result);
    } else {
      container.innerHTML = renderOptionsRecError(result);
    }
  } catch (e) {
    console.error('[OPTIONS_REC] Failed:', e);
    container.innerHTML = `<div class="dc-optrec-error">Options Rec error: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🎯 Options Rec'; }
  }
};

window.dcLoadOptionsRec = async function(checkId) {
  const container = document.getElementById(`dc-optrec-${checkId}`);
  if (!container) return;
  try {
    const recs = await getOptionsRec(checkId);
    if (recs?.length) {
      const latest = recs[0];
      container.innerHTML = renderOptionsRec({
        recommendation: latest.recommendation_json,
        chainAnalysis: latest.chain_analysis_json,
        evaluations: latest.evaluations_json,
        metrics: { totalTime: latest.processing_time, totalCost: latest.total_cost }
      });
    }
  } catch {}
};

function renderOptionsRecError(result) {
  const scan = result.scanOutput || {};
  const chain = result.chainSummary || {};
  const eliminated = (scan.eliminated || []).filter(Boolean);
  const chainQuality = scan.chain_quality || {};
  const ivEnv = scan.iv_environment || {};

  let diagnosticHtml = '';

  if (chainQuality.liquidity_grade || chainQuality.contracts_scanned) {
    diagnosticHtml += `<div class="dc-optrec-diag-row">
      ${chainQuality.liquidity_grade ? `<span class="dc-optrec-badge liq-${chainQuality.liquidity_grade}">Liq ${chainQuality.liquidity_grade}</span>` : ''}
      ${chainQuality.contracts_scanned ? `<span class="dc-optrec-badge">${chainQuality.contracts_scanned} scanned</span>` : ''}
      ${chainQuality.liquid_expiries?.length ? `<span class="dc-optrec-badge">${chainQuality.liquid_expiries.length} expiries</span>` : ''}
    </div>`;
  } else if (chain.totalContracts) {
    diagnosticHtml += `<div class="dc-optrec-diag-row">
      <span class="dc-optrec-badge">${chain.totalContracts} contracts</span>
      ${chain.expiries?.length ? `<span class="dc-optrec-badge">${chain.expiries.length} expiries</span>` : ''}
      ${chain.termStructure ? `<span class="dc-optrec-badge">Term: ${chain.termStructure}</span>` : ''}
    </div>`;
  }

  if (ivEnv.regime || ivEnv.rank != null) {
    diagnosticHtml += `<div class="dc-optrec-diag-row">
      ${ivEnv.rank != null ? `<span class="dc-optrec-badge">IVR ${ivEnv.rank}</span>` : ''}
      ${ivEnv.regime ? `<span class="dc-optrec-badge iv-${ivEnv.regime}">IV ${ivEnv.regime}</span>` : ''}
      ${ivEnv.skew_bias ? `<span class="dc-optrec-badge">Skew ${ivEnv.skew_bias}</span>` : ''}
      ${ivEnv.term_structure ? `<span class="dc-optrec-badge">TS ${ivEnv.term_structure}</span>` : ''}
    </div>`;
  }

  if (eliminated.length) {
    diagnosticHtml += `<div class="dc-optrec-eliminated">
      <div class="dc-optrec-elim-title">Eliminated reasons:</div>
      <ul>${eliminated.map(e => `<li>${e}</li>`).join('')}</ul>
    </div>`;
  }

  const stageLabel = result.stage ? ` at ${result.stage}` : '';
  const costStr = result.metrics?.cost ? ` · $${result.metrics.cost.toFixed(3)}` : '';
  const timeStr = result.metrics?.processingTime ? `${(result.metrics.processingTime / 1000).toFixed(1)}s` : '';

  return `<div class="dc-exp-block dc-optrec-block dc-optrec-fail">
    <div class="dc-exp-title">Options Recommendation</div>
    <div class="dc-optrec-fail-msg">No viable candidates found${stageLabel}</div>
    ${diagnosticHtml}
    ${timeStr || costStr ? `<div class="dc-optrec-meta">${timeStr}${costStr}</div>` : ''}
  </div>`;
}

function renderOptionsRec(data) {
  const rec = data.recommendation;
  if (!rec?.primary) return '';

  const p = rec.primary;
  const stratLabel = (p.strategy || '').replace(/_/g, ' ').toUpperCase();
  const rr = p.risk_reward?.toFixed(1) || '--';
  const stale = data.quotesLive === false;

  const legsHtml = (p.legs || []).map(leg => {
    const action = (leg.action || '').toUpperCase();
    const type = (leg.type || '').toUpperCase();
    const bid = leg.bid ?? '--';
    const ask = leg.ask ?? '--';
    const priceLabel = bid === ask ? `~$${bid}` : `$${bid}/$${ask}`;
    const delta = leg.delta ? `.${Math.abs(leg.delta * 100).toFixed(0).padStart(2, '0')}d` : '';
    return `<div class="dc-optrec-leg">
      <span class="dc-optrec-leg-action ${action === 'BUY' ? 'buy' : 'sell'}">${action}</span>
      <span class="dc-optrec-leg-desc">${type} $${leg.strike} ${leg.expiry}</span>
      <span class="dc-optrec-leg-price">${priceLabel}</span>
      <span class="dc-optrec-leg-delta">${delta}</span>
      ${leg.oi ? `<span class="dc-optrec-leg-oi">OI:${leg.oi >= 1000 ? (leg.oi / 1000).toFixed(1) + 'K' : leg.oi}</span>` : ''}
    </div>`;
  }).join('');

  const greeks = p.greeks_summary || {};
  const greeksHtml = `<span class="dc-optrec-greek">\u03b4 ${greeks.net_delta?.toFixed(2) || '--'}</span>
    <span class="dc-optrec-greek neg">\u03b8 ${greeks.net_theta?.toFixed(3) || '--'}</span>
    <span class="dc-optrec-greek">\u03bd ${greeks.net_vega?.toFixed(3) || '--'}</span>`;

  const chain = data.chainAnalysis || {};
  const ivEnv = chain.iv_environment || {};

  const adjustHtml = (p.adjustment_triggers || []).map(t => `<li>${t}</li>`).join('');

  const altHtml = rec.alternative ? (() => {
    const a = rec.alternative;
    const aStrat = (a.strategy || '').replace(/_/g, ' ').toUpperCase();
    const aLegs = (a.legs || []).map(l => `${l.action?.toUpperCase()} ${l.type?.toUpperCase()} $${l.strike} ${l.expiry}`).join(' / ');
    return `<div class="dc-optrec-alt">
      <div class="dc-optrec-alt-title">Alternative: ${aStrat}</div>
      <div class="dc-optrec-alt-legs">${aLegs}</div>
      ${a.rationale ? `<div class="dc-optrec-alt-rationale">${a.rationale}</div>` : ''}
    </div>`;
  })() : '';

  const costStr = data.metrics?.totalCost ? `$${data.metrics.totalCost.toFixed(3)}` : '';
  const timeStr = data.metrics?.totalTime ? `${(data.metrics.totalTime / 1000).toFixed(1)}s` : '';

  return `<div class="dc-exp-block dc-optrec-block${stale ? ' dc-optrec-stale' : ''}">
    <div class="dc-exp-title">Options Recommendation${stale ? ' <span class="dc-optrec-stale-tag">MARKET CLOSED</span>' : ''}</div>
    <div class="dc-optrec-header">
      <span class="dc-optrec-strategy">${stratLabel}</span>
      <span class="dc-optrec-rr">R:R ${rr}x</span>
    </div>
    <div class="dc-optrec-legs">${legsHtml}</div>
    <div class="dc-optrec-metrics">
      <div class="dc-optrec-metric"><span class="dc-optrec-metric-label">Debit</span><span>${p.max_risk ? '$' + (p.max_risk / 100).toFixed(2) : '--'}${stale ? '~' : ''}</span></div>
      <div class="dc-optrec-metric"><span class="dc-optrec-metric-label">Risk</span><span>$${p.max_risk || '--'}</span></div>
      <div class="dc-optrec-metric"><span class="dc-optrec-metric-label">Reward</span><span>${p.max_reward ? '$' + p.max_reward : 'unlim.'}</span></div>
      <div class="dc-optrec-metric"><span class="dc-optrec-metric-label">Breakeven</span><span>$${typeof p.breakeven === 'number' ? p.breakeven.toFixed(2) : '--'}</span></div>
      ${p.probability_of_profit ? `<div class="dc-optrec-metric"><span class="dc-optrec-metric-label">PoP</span><span>${p.probability_of_profit}%</span></div>` : ''}
    </div>
    <div class="dc-optrec-greeks">${greeksHtml}</div>
    ${p.entry_instruction ? `<div class="dc-optrec-entry"><span class="dc-optrec-entry-label">Entry:</span> ${p.entry_instruction}</div>` : ''}
    ${p.position_size_note ? `<div class="dc-optrec-sizing">${p.position_size_note}</div>` : ''}
    ${adjustHtml ? `<details class="dc-optrec-adjust"><summary>Adjustments</summary><ul>${adjustHtml}</ul></details>` : ''}
    ${p.time_stop ? `<div class="dc-optrec-timestop"><span class="dc-optrec-entry-label">Time stop:</span> ${p.time_stop}</div>` : ''}
    <div class="dc-optrec-rationale">${p.rationale || ''}</div>
    <div class="dc-optrec-badges">
      ${stale ? '<span class="dc-optrec-badge stale">STALE PRICES</span>' : ''}
      ${chain.liquidity_grade ? `<span class="dc-optrec-badge liq-${chain.liquidity_grade}">Liq ${chain.liquidity_grade}</span>` : ''}
      ${ivEnv.regime ? `<span class="dc-optrec-badge iv-${ivEnv.regime}">IV ${ivEnv.regime}</span>` : ''}
      ${ivEnv.skew_bias ? `<span class="dc-optrec-badge">Skew ${ivEnv.skew_bias}</span>` : ''}
      ${chain.contracts_scanned ? `<span class="dc-optrec-badge">${chain.contracts_scanned} contracts</span>` : ''}
    </div>
    ${altHtml}
    ${rec.avoid ? `<div class="dc-optrec-avoid"><span class="dc-optrec-entry-label">Avoid:</span> ${rec.avoid}</div>` : ''}
    ${costStr || timeStr ? `<div class="dc-optrec-meta">${timeStr ? `${timeStr}` : ''}${costStr ? ` · ${costStr}` : ''}</div>` : ''}
  </div>`;
}
