// Dashboard Module — Pre-Market Intelligence Briefing
// "What does the system know? What should I understand before trading today?"
import { CONFIG } from './config.js';

let loaded = false;

// ── API ──

function userId() {
  return localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
}

async function apiFetch(path) {
  const r = await fetch(`${CONFIG.PROXY_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId() }
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function safe(path) {
  try { return await apiFetch(path); } catch { return null; }
}

function val(r) { return r.status === 'fulfilled' ? r.value : null; }

async function fetchAll() {
  const results = await Promise.allSettled([
    safe('/api/thesis'),                                          // 0
    safe('/api/daily-checks/results'),                            // 1
    safe('/api/feed?limit=40'),                                   // 2
    safe('/api/memory?status=active'),                            // 3
    safe('/api/opportunities?status=active&limit=12'),            // 4
    safe('/api/ticker-pipeline/analyses?status=completed&limit=12'), // 5
    safe('/api/watchlist'),                                       // 6
    safe('/api/notes'),                                           // 7
  ]);
  return {
    thesis: val(results[0]),
    daily: val(results[1]),
    feed: val(results[2]),
    memory: val(results[3]),
    opps: val(results[4]),
    pipeline: val(results[5]),
    watchlist: val(results[6]),
    notes: val(results[7]),
  };
}

// ── Helpers ──

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtNum(n, d = 2) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function parseJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function goTicker(ticker) {
  return `onclick="window.switchPage('analyze');document.getElementById('tk').value='${esc(ticker)}';document.getElementById('tk').dispatchEvent(new KeyboardEvent('keypress',{key:'Enter'}))"`;
}

function sigColor(s) {
  s = (s || '').toUpperCase();
  if (s === 'ENTRY NOW' || s === 'HOLD' || s === 'ADD') return 'var(--tv-green)';
  if (s === 'ENTRY SOON' || s === 'WATCH' || s === 'TRIM') return 'var(--tv-orange)';
  if (s === 'EXIT' || s === 'AVOID' || s === 'STOP_HIT') return 'var(--tv-red)';
  return 'var(--tv-text-tertiary)';
}

function sigBg(s) {
  s = (s || '').toUpperCase();
  if (s === 'ENTRY NOW' || s === 'HOLD' || s === 'ADD') return 'var(--tv-green-bg)';
  if (s === 'ENTRY SOON' || s === 'WATCH' || s === 'TRIM') return 'var(--tv-orange-bg)';
  if (s === 'EXIT' || s === 'AVOID' || s === 'STOP_HIT') return 'var(--tv-red-bg)';
  return 'var(--tv-bg-tertiary)';
}

function convDot(c) {
  const m = { high: 'var(--tv-green)', medium: 'var(--tv-orange)', low: 'var(--tv-text-tertiary)' };
  return `<span class="db-dot" style="background:${m[c] || m.low}"></span>`;
}

// Safely turn a flag into a string — handles {stage, flag} objects and plain strings
function flagText(f) {
  if (typeof f === 'string') return f;
  if (f && typeof f === 'object') return f.flag || f.text || f.description || JSON.stringify(f);
  return String(f || '');
}

// ── Scaffold ──

function scaffold() {
  const page = document.getElementById('dbPage');
  if (!page) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  page.innerHTML = `
    <div class="db-header">
      <div class="db-header-left">
        <span class="db-title">Morning Briefing</span>
        <span class="db-date">${dateStr}</span>
      </div>
      <div class="db-header-actions">
        <span class="db-status" id="dbStatus"><span class="db-spinner"></span> Loading...</span>
        <button class="db-btn" onclick="window.refreshDashboard()"><i class="fa-solid fa-arrows-rotate" style="margin-right:4px"></i>Refresh</button>
      </div>
    </div>

    <div id="dbThesis" class="db-thesis db-skeleton-block"></div>

    <div class="db-grid">
      <div class="db-col">
        <div class="db-card" id="dbSignals"><div class="db-card-loading"></div></div>
        <div class="db-card" id="dbOpps"><div class="db-card-loading"></div></div>
      </div>
      <div class="db-col">
        <div class="db-card" id="dbThemes"><div class="db-card-loading"></div></div>
        <div class="db-card" id="dbFeed"><div class="db-card-loading"></div></div>
      </div>
      <div class="db-col">
        <div class="db-card" id="dbMemory"><div class="db-card-loading"></div></div>
        <div class="db-card" id="dbNotes"><div class="db-card-loading"></div></div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════
// SECTIONS
// ═══════════════════════════════════════════════

// ── Thesis Strip ──

function renderThesis(thesis) {
  const el = document.getElementById('dbThesis');
  if (!el) return;
  el.classList.remove('db-skeleton-block');

  if (!thesis) {
    el.innerHTML = '<div class="db-thesis-empty">No thesis generated yet. Run the feed pipeline to build one.</div>';
    return;
  }

  const td = parseJson(thesis.thesis_data) || {};
  const regime = td.regime || 'unknown';
  const bias = td.bias || 'neutral';
  const conviction = td.conviction || 0;
  const summary = td.executiveSummary || td.narrative || '';
  const updated = thesis.updated_at;
  const version = thesis.version || 0;
  const signalsUsed = thesis.signals_count || 0;

  const regimeMap = {
    'risk-on': { color: 'var(--tv-green)', icon: 'fa-arrow-trend-up' },
    'risk-off': { color: 'var(--tv-red)', icon: 'fa-arrow-trend-down' },
    'rotation': { color: 'var(--tv-orange)', icon: 'fa-arrows-spin' },
    'range': { color: 'var(--tv-text-secondary)', icon: 'fa-arrows-left-right' },
    'neutral': { color: 'var(--tv-text-tertiary)', icon: 'fa-minus' }
  };
  const biasMap = {
    'bullish': 'var(--tv-green)', 'bearish': 'var(--tv-red)',
    'cautious': 'var(--tv-orange)', 'neutral': 'var(--tv-text-tertiary)'
  };
  const r = regimeMap[regime] || regimeMap.neutral;

  const sectors = td.sectors || {};
  const sectorEntries = Object.entries(sectors).slice(0, 6);
  const tickerIntel = Array.isArray(td.tickerIntelligence) ? td.tickerIntelligence.slice(0, 8) : [];

  el.innerHTML = `
    <div class="db-thesis-top">
      <div class="db-thesis-badges">
        <span class="db-badge" style="background:${r.color}15;color:${r.color};border:1px solid ${r.color}30">
          <i class="fa-solid ${r.icon}" style="font-size:9px;margin-right:3px"></i>${regime.toUpperCase()}
        </span>
        <span class="db-badge" style="background:${biasMap[bias] || 'var(--tv-text-tertiary)'}15;color:${biasMap[bias] || 'var(--tv-text-tertiary)'}">
          ${bias.toUpperCase()}
        </span>
        <span class="db-badge db-badge-muted">
          Conviction
          <span class="db-conviction-bar"><span class="db-conviction-fill" style="width:${conviction * 10}%;background:${conviction >= 7 ? 'var(--tv-green)' : conviction >= 4 ? 'var(--tv-orange)' : 'var(--tv-red)'}"></span></span>
          ${conviction}/10
        </span>
        <span class="db-thesis-meta">v${version} &middot; ${signalsUsed} signals &middot; ${updated ? timeAgo(updated) + ' ago' : 'unknown'}</span>
      </div>
      <div class="db-thesis-summary">${esc(typeof summary === 'string' ? summary : JSON.stringify(summary)).substring(0, 500)}</div>
    </div>
    ${sectorEntries.length > 0 || tickerIntel.length > 0 ? `
    <div class="db-thesis-bottom">
      ${sectorEntries.length > 0 ? `
        <div class="db-thesis-sectors">
          <span class="db-thesis-section-label">Sectors</span>
          ${sectorEntries.map(([name, s]) => {
            const vc = s.view === 'bullish' ? 'var(--tv-green)' : s.view === 'bearish' ? 'var(--tv-red)' : 'var(--tv-text-tertiary)';
            return `<span class="db-sector-chip" style="border-color:${vc}30"><span style="color:${vc};font-weight:700">${esc(name)}</span></span>`;
          }).join('')}
        </div>
      ` : ''}
      ${tickerIntel.length > 0 ? `
        <div class="db-thesis-tickers">
          <span class="db-thesis-section-label">Tickers</span>
          ${tickerIntel.map(t => {
            const bc = t.netBias === 'bullish' ? 'var(--tv-green)' : t.netBias === 'bearish' ? 'var(--tv-red)' : 'var(--tv-text-secondary)';
            return `<span class="db-ticker-chip" ${goTicker(t.ticker)} style="border-color:${bc}"><span style="color:var(--tv-accent);font-weight:700">${esc(t.ticker)}</span> <span class="db-bias-label" style="color:${bc}">${esc(t.netBias || '')}</span></span>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
    ` : ''}
  `;
}

// ── Scanner Signals (Daily Checks) ──

function renderSignals(daily) {
  const el = document.getElementById('dbSignals');
  if (!el) return;

  const arr = Array.isArray(daily) ? daily : [];
  const hot = [], watch = [], exits = [];
  arr.forEach(r => {
    const sig = (r.signal || '').toUpperCase();
    if (sig === 'ENTRY NOW' || sig === 'ENTRY SOON') hot.push(r);
    else if (sig === 'WATCH') watch.push(r);
    else if (sig === 'EXIT' || sig === 'AVOID') exits.push(r);
  });

  el.innerHTML = `
    <div class="db-card-head">
      <span class="db-card-title"><i class="fa-solid fa-bolt"></i> Scanner Signals</span>
      <span class="db-card-count">${hot.length} hot &middot; ${watch.length} watch &middot; ${exits.length} avoid</span>
    </div>
    <div class="db-card-body">
      ${hot.length + watch.length + exits.length === 0 ? '<div class="db-empty">No signals from daily checks</div>' : ''}
      ${hot.length > 0 ? renderSignalGroup('ENTRY SIGNALS', 'var(--tv-green)', hot, 8) : ''}
      ${exits.length > 0 ? renderSignalGroup('EXIT / AVOID', 'var(--tv-red)', exits, 4) : ''}
      ${watch.length > 0 ? renderSignalGroup('ON WATCH', 'var(--tv-orange)', watch, 6) : ''}
    </div>
  `;
}

function renderSignalGroup(label, color, items, max) {
  return `
    <div class="db-signal-group">
      <div class="db-signal-group-label" style="color:${color}">${label}</div>
      ${items.slice(0, max).map(r => {
        const a = parseJson(r.ai_analysis) || {};
        const levels = a.key_levels || {};
        const sig = r.signal || 'WATCH';
        return `
          <div class="db-signal-item">
            <div class="db-signal-item-top">
              <span class="db-ticker" ${goTicker(r.ticker)}>${r.ticker}</span>
              <span class="db-signal-tag" style="color:${sigColor(sig)};background:${sigBg(sig)}">${sig}</span>
              ${r.opportunity_score ? `<span class="db-score">${r.opportunity_score}</span>` : ''}
              ${a.conviction ? `<span class="db-conviction-label">${convDot(a.conviction)}${a.conviction}</span>` : ''}
            </div>
            <div class="db-signal-detail">${esc(a.summary || r.ai_summary || '').substring(0, 140)}</div>
            ${levels.entry ? `<div class="db-signal-levels">
              <span>Entry <strong>${fmtNum(levels.entry)}</strong></span>
              <span>Target <strong>${fmtNum(levels.target)}</strong></span>
              <span>Stop <strong>${fmtNum(levels.stop)}</strong></span>
              ${levels.risk_reward ? `<span>R:R <strong>${levels.risk_reward}</strong></span>` : ''}
            </div>` : ''}
            ${a.confirmation_conditions && a.confirmation_conditions.length > 0 ? `
              <div class="db-signal-conditions">${a.confirmation_conditions.slice(0, 2).map(c => `<span>${esc(c)}</span>`).join('')}</div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Pipeline Results + Opportunities ──

function renderOpps(opps, pipeline) {
  const el = document.getElementById('dbOpps');
  if (!el) return;

  const items = [];
  const seen = new Set();

  // Pipeline analyses (richer data)
  (Array.isArray(pipeline) ? pipeline : []).forEach(p => {
    if (!p.ticker || seen.has(p.ticker)) return;
    seen.add(p.ticker);
    const trade = parseJson(p.trade_idea) || {};
    const stageScores = parseJson(p.stage_scores) || {};
    const greenFlags = (parseJson(p.green_flags) || []).map(flagText);
    const redFlags = (parseJson(p.red_flags) || []).map(flagText);
    items.push({
      ticker: p.ticker, score: p.composite_score || 0, direction: p.direction || 'long',
      conviction: p.conviction || 'low', source: 'pipeline',
      thesis: trade.thesis || trade.rationale || '',
      greenFlags, redFlags, stageScores
    });
  });

  // Fill from opps
  (Array.isArray(opps) ? opps : []).forEach(o => {
    if (seen.has(o.ticker)) return;
    seen.add(o.ticker);
    items.push({
      ticker: o.ticker, score: o.composite_score || 0, direction: o.direction || 'long',
      conviction: o.composite_score >= 70 ? 'high' : o.composite_score >= 40 ? 'medium' : 'low',
      source: 'opp', thesis: o.signal_type || '', greenFlags: [], redFlags: [], stageScores: {}
    });
  });

  items.sort((a, b) => b.score - a.score);

  el.innerHTML = `
    <div class="db-card-head">
      <span class="db-card-title"><i class="fa-solid fa-microscope"></i> Pipeline Results</span>
      <span class="db-card-count">${items.length} scored</span>
    </div>
    <div class="db-card-body db-card-body-tight">
      ${items.length === 0 ? '<div class="db-empty">No scored opportunities</div>' : `
        ${items.slice(0, 12).map(o => {
          const sc = o.score >= 70 ? 'var(--tv-green)' : o.score >= 40 ? 'var(--tv-orange)' : 'var(--tv-text-tertiary)';
          const dc = o.direction === 'short' ? 'var(--tv-red)' : 'var(--tv-green)';
          return `
            <div class="db-opp-row-simple">
              <span class="db-ticker" ${goTicker(o.ticker)}>${o.ticker}</span>
              <span class="db-dir-sm" style="color:${dc}">${o.direction.toUpperCase()}</span>
              ${convDot(o.conviction)}
              <span class="db-opp-score" style="color:${sc}">${Math.round(o.score)}</span>
            </div>
          `;
        }).join('')}
      `}
    </div>
  `;
}

// ── Themes, Catalysts, Risks (from thesis) ──

function renderThemes(thesis) {
  const el = document.getElementById('dbThemes');
  if (!el) return;

  const td = thesis ? parseJson(thesis.thesis_data) || {} : {};
  const themes = Array.isArray(td.themes) ? td.themes : [];
  const risks = Array.isArray(td.key_risks) ? td.key_risks : [];
  const catalysts = Array.isArray(td.catalysts) ? td.catalysts : [];
  const opportunities = Array.isArray(td.opportunities) ? td.opportunities : [];

  el.innerHTML = `
    <div class="db-card-head">
      <span class="db-card-title"><i class="fa-solid fa-compass"></i> Themes & Catalysts</span>
    </div>
    <div class="db-card-body">
      ${themes.length === 0 && catalysts.length === 0 && risks.length === 0 ? '<div class="db-empty">No thesis data</div>' : ''}

      ${themes.length > 0 ? `
        <div class="db-theme-list">
          ${themes.slice(0, 6).map(t => {
            const dir = t.direction || '';
            const dc = dir.includes('bull') ? 'var(--tv-green)' : dir.includes('bear') ? 'var(--tv-red)' : 'var(--tv-text-secondary)';
            const affected = Array.isArray(t.affected_tickers) ? t.affected_tickers : [];
            return `
              <div class="db-theme-item">
                <div class="db-theme-item-top">
                  <span class="db-theme-name">${esc(t.name)}</span>
                  <span style="color:${dc};font-size:var(--t-3xs);font-weight:700">${esc(dir)}</span>
                  <span class="db-theme-conf">${t.confidence || 0}/10</span>
                </div>
                ${affected.length > 0 ? `<div class="db-theme-tickers">${affected.slice(0, 5).map(tk => `<span class="db-chip" ${goTicker(tk)}>${esc(tk)}</span>`).join('')}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      ${catalysts.length > 0 ? `
        <div class="db-sub-section">
          <div class="db-sub-title">Upcoming Catalysts</div>
          ${catalysts.slice(0, 5).map(c => {
            const impact = typeof c === 'string' ? 'medium' : (c.impact || 'medium');
            const text = typeof c === 'string' ? c : (c.description || '');
            const ic = impact === 'high' ? 'var(--tv-red)' : impact === 'medium' ? 'var(--tv-orange)' : 'var(--tv-text-tertiary)';
            return `
              <div class="db-catalyst-row">
                <span class="db-catalyst-dot" style="background:${ic}"></span>
                <span class="db-catalyst-text">${esc(text)}</span>
                ${c.date ? `<span class="db-catalyst-date">${esc(c.date)}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      ${opportunities.length > 0 ? `
        <div class="db-sub-section">
          <div class="db-sub-title">Thesis Opportunities</div>
          ${opportunities.slice(0, 4).map(o => `
            <div class="db-thesis-opp">
              ${convDot(o.conviction || 'medium')}
              <span>${esc(typeof o === 'string' ? o : o.opportunity || '')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${risks.length > 0 ? `
        <div class="db-sub-section">
          <div class="db-sub-title db-sub-title-red">Key Risks</div>
          ${risks.slice(0, 4).map(r => `<div class="db-risk-row">${esc(typeof r === 'string' ? r : r.description || '')}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ── Feed Intelligence: High-signal captures ──

function renderFeed(feed) {
  const el = document.getElementById('dbFeed');
  if (!el) return;

  const arr = Array.isArray(feed) ? feed : [];
  const withInsight = arr.map(f => {
    const insight = parseJson(f.insight_data) || {};
    return { ...f, insight };
  }).filter(f => !f.insight.isNoise);

  // Sort: high conviction first, then contrarian, then recent
  withInsight.sort((a, b) => {
    const convOrder = { high: 3, medium: 2, low: 1 };
    const aScore = (convOrder[a.insight.conviction] || 0) + (a.insight.contrarian ? 2 : 0);
    const bScore = (convOrder[b.insight.conviction] || 0) + (b.insight.contrarian ? 2 : 0);
    return bScore - aScore;
  });

  el.innerHTML = `
    <div class="db-card-head">
      <span class="db-card-title"><i class="fa-solid fa-satellite-dish"></i> Fresh Signals</span>
      <span class="db-card-count">${withInsight.length} captured</span>
    </div>
    <div class="db-card-body db-card-body-tight">
      ${withInsight.length === 0 ? '<div class="db-empty">No feed signals</div>' : `
        ${withInsight.slice(0, 10).map(f => {
          const ins = f.insight;
          const dirColor = (ins.direction || '').includes('bull') || ins.direction === 'risk-on' ? 'var(--tv-green)'
            : (ins.direction || '').includes('bear') || ins.direction === 'risk-off' ? 'var(--tv-red)'
            : 'var(--tv-text-tertiary)';
          const tickers = (ins.tickers || []).slice(0, 3);
          return `
            <div class="db-feed-row">
              <div class="db-feed-row-top">
                ${tickers.map(t => `<span class="db-ticker" ${goTicker(t)}>${esc(t)}</span>`).join(' ')}
                <span class="db-feed-dir" style="color:${dirColor}">${esc(ins.direction || '')}</span>
                ${ins.contrarian ? '<span class="db-feed-contrarian">CONTRARIAN</span>' : ''}
                ${convDot(ins.conviction || 'low')}
                <span class="db-feed-time">${timeAgo(f.created_at)}</span>
              </div>
              <div class="db-feed-content">${esc(f.content || '').substring(0, 120)}</div>
              ${ins.tradingImplication ? `<div class="db-feed-implication">${esc(ins.tradingImplication).substring(0, 100)}</div>` : ''}
            </div>
          `;
        }).join('')}
      `}
    </div>
  `;
}

// ── Active Memory Entities ──

function renderMemory(memory) {
  const el = document.getElementById('dbMemory');
  if (!el) return;

  const arr = Array.isArray(memory) ? memory : [];
  const important = arr.filter(m => (m.importance_score || 0) >= 5)
    .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0));

  const catColors = {
    macro: 'var(--tv-purple)', sector: 'var(--tv-cyan)', technical: 'var(--tv-accent)',
    flow: 'var(--tv-orange)', positioning: 'var(--tv-green)', catalyst: 'var(--tv-red)', risk: 'var(--tv-red)'
  };

  el.innerHTML = `
    <div class="db-card-head">
      <span class="db-card-title"><i class="fa-solid fa-brain"></i> Active Memory</span>
      <span class="db-card-count">${important.length}/${arr.length} high priority</span>
    </div>
    <div class="db-card-body db-card-body-tight">
      ${important.length === 0 ? '<div class="db-empty">No high-importance memories</div>' : `
        ${important.slice(0, 8).map(m => {
          const color = catColors[m.category] || 'var(--tv-text-secondary)';
          const sentiment = m.sentiment_score || 0;
          const assets = parseJson(m.affected_assets) || [];
          return `
            <div class="db-memory-row">
              <div class="db-memory-row-top">
                <span class="db-memory-cat" style="color:${color}">${esc(m.category || '')}</span>
                <span class="db-memory-imp">${m.importance_score}/10</span>
                <span class="db-memory-sent" style="color:${sentiment > 0 ? 'var(--tv-green)' : sentiment < 0 ? 'var(--tv-red)' : 'var(--tv-text-tertiary)'}">${sentiment > 0 ? '+' : ''}${sentiment}</span>
              </div>
              <div class="db-memory-name">${esc(m.name)}</div>
              ${m.current_thesis_impact ? `<div class="db-memory-impact">${esc(m.current_thesis_impact).substring(0, 80)}</div>` : ''}
              ${assets.length > 0 ? `<div class="db-memory-assets">${assets.slice(0, 5).map(a => `<span class="db-chip" ${goTicker(a)}>${esc(a)}</span>`).join('')}</div>` : ''}
            </div>
          `;
        }).join('')}
      `}
    </div>
  `;
}

// ── Watchlist Overview ──

function renderWatchlist(watchlist) {
  const el = document.getElementById('dbWatchlist');
  if (!el) return;

  const arr = Array.isArray(watchlist) ? watchlist : [];

  el.innerHTML = `
    <div class="db-card-head">
      <span class="db-card-title"><i class="fa-solid fa-eye"></i> Watchlist</span>
      <span class="db-card-count">${arr.length} tickers</span>
    </div>
    <div class="db-card-body db-card-body-tight">
      ${arr.length === 0 ? '<div class="db-empty">Watchlist empty</div>' : `
        <div class="db-watchlist-grid">
          ${arr.slice(0, 12).map(w => {
            const hasAlert = w.alert_above || w.alert_below;
            const priColors = { 1: 'var(--tv-red)', 2: 'var(--tv-orange)', 3: 'var(--tv-text-tertiary)' };
            return `
              <div class="db-wl-item" ${goTicker(w.ticker)}>
                <span class="db-wl-ticker">${esc(w.ticker)}</span>
                ${w.target_price ? `<span class="db-wl-target">${fmtNum(w.target_price)}</span>` : ''}
                ${hasAlert ? '<span class="db-wl-bell"><i class="fa-solid fa-bell" style="font-size:8px"></i></span>' : ''}
                ${w.priority ? `<span class="db-wl-priority" style="background:${priColors[w.priority] || priColors[3]}"></span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// ── Recent Notes ──

function renderNotes(notes) {
  const el = document.getElementById('dbNotes');
  if (!el) return;

  const arr = Array.isArray(notes) ? notes : [];
  const recent = arr.slice(0, 6);

  el.innerHTML = `
    <div class="db-card-head">
      <span class="db-card-title"><i class="fa-solid fa-sticky-note"></i> Recent Notes</span>
      <span class="db-card-count">${arr.length} total</span>
    </div>
    <div class="db-card-body db-card-body-tight">
      ${recent.length === 0 ? '<div class="db-empty">No notes</div>' : `
        ${recent.map(n => `
          <div class="db-note-row">
            <div class="db-note-row-top">
              ${n.ticker ? `<span class="db-ticker" ${goTicker(n.ticker)}>${esc(n.ticker)}</span>` : ''}
              ${n.tags ? `<span class="db-note-tags">${esc(n.tags)}</span>` : ''}
              <span class="db-note-time">${timeAgo(n.created_at)}</span>
            </div>
            <div class="db-note-content">${esc(n.content || '').substring(0, 100)}</div>
          </div>
        `).join('')}
      `}
    </div>
  `;
}

// ── Main ──

export async function loadDashboard() {
  scaffold();

  const data = await fetchAll();

  renderThesis(data.thesis);
  renderSignals(data.daily);
  renderOpps(data.opps, data.pipeline);
  renderThemes(data.thesis);
  renderFeed(data.feed);
  renderMemory(data.memory);
  renderNotes(data.notes);

  const statusEl = document.getElementById('dbStatus');
  if (statusEl) {
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    statusEl.innerHTML = `<span class="db-status-dot"></span>Updated ${t}`;
  }

  loaded = true;
}

window.refreshDashboard = () => loadDashboard();
