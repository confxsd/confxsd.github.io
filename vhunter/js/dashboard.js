// Dashboard Module — Intelligence Command Center
// Every data point is a card. Star what matters. Hide the noise.
import { CONFIG } from './config.js';

let loaded = false;
let allCards = [];
let cardPrefs = {};  // { cardId: 'star' | 'hide' }
let activeFilter = 'all'; // 'all' | 'starred' | category filter | tag filter
let activeSort = 'score'; // 'score' | 'type' | 'recent'
let briefingData = null;
let briefingCollapsed = false;

// ── API ──

function userId() {
  return localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
}

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${CONFIG.PROXY_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId(), ...opts.headers }
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function safe(path) {
  try { return await apiFetch(path); } catch { return null; }
}

async function fetchAll() {
  const [thesis, daily, feed, memory, opps, pipeline, watchlist, notes, activeTrades, briefing, prefs] = await Promise.allSettled([
    safe('/api/thesis'),                                              // 0
    safe('/api/daily-checks/results'),                                // 1
    safe('/api/feed?limit=40'),                                       // 2
    safe('/api/memory?status=active'),                                // 3
    safe('/api/opportunities?status=active&limit=12'),                // 4
    safe('/api/ticker-pipeline/analyses?status=completed&limit=12'),  // 5
    safe('/api/watchlist'),                                           // 6
    safe('/api/notes'),                                               // 7
    safe('/api/active-trades'),                                       // 8
    safe('/api/dashboard/briefing'),                                  // 9
    safe('/api/dashboard/cards/prefs'),                               // 10
  ]);
  return {
    thesis: v(thesis), daily: v(daily), feed: v(feed), memory: v(memory),
    opps: v(opps), pipeline: v(pipeline), watchlist: v(watchlist), notes: v(notes),
    activeTrades: v(activeTrades), briefing: v(briefing), prefs: v(prefs),
  };
}

function v(r) { return r.status === 'fulfilled' ? r.value : null; }

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
  return (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';
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

function sentimentColor(s) {
  if (s === 'bullish') return 'var(--tv-green)';
  if (s === 'bearish') return 'var(--tv-red)';
  return 'var(--tv-text-tertiary)';
}

function flagText(f) {
  if (typeof f === 'string') return f;
  if (f && typeof f === 'object') return f.flag || f.text || f.description || JSON.stringify(f);
  return String(f || '');
}

// ── Card ID generation ──

function cardId(type, identifier) {
  return `${type}::${identifier}`;
}

// ── Card preference management ──

function getCardPref(id) {
  return cardPrefs[id] || null;
}

async function setCardPref(id, action) {
  if (action === 'reset') {
    delete cardPrefs[id];
  } else {
    cardPrefs[id] = action;
  }
  // Persist to API (fire and forget)
  try {
    await apiFetch('/api/dashboard/cards/prefs', {
      method: 'POST',
      body: JSON.stringify({ cardId: id, action }),
    });
  } catch { /* silent */ }
  renderCards();
}

function cardActions(id) {
  const pref = getCardPref(id);
  const starActive = pref === 'star' ? ' dc-action-active' : '';
  const hideActive = pref === 'hide' ? ' dc-action-active' : '';
  return `<div class="dc-card-actions">
    <button class="dc-action dc-action-star${starActive}" onclick="event.stopPropagation();window._dbCardPref('${id}','${pref === 'star' ? 'reset' : 'star'}')" title="Star">
      <i class="fa-${pref === 'star' ? 'solid' : 'regular'} fa-star"></i>
    </button>
    <button class="dc-action dc-action-hide${hideActive}" onclick="event.stopPropagation();window._dbCardPref('${id}','${pref === 'hide' ? 'reset' : 'hide'}')" title="Hide">
      <i class="fa-solid fa-eye-slash"></i>
    </button>
  </div>`;
}

const MAX_CARDS = 50;

// Tag definitions — each card gets tags for filtering and visual scanning
const TAG_DEFS = {
  actionable:  { label: 'Actionable',  color: 'var(--tv-green)',  bg: 'var(--tv-green-bg)' },
  urgent:      { label: 'Urgent',      color: 'var(--tv-red)',    bg: 'var(--tv-red-bg)' },
  risk:        { label: 'Risk',        color: 'var(--tv-red)',    bg: 'var(--tv-red-bg)' },
  opportunity: { label: 'Opportunity', color: 'var(--tv-green)',  bg: 'var(--tv-green-bg)' },
  contrarian:  { label: 'Contrarian',  color: 'var(--tv-purple)', bg: 'rgba(124,77,255,0.1)' },
  high_conv:   { label: 'High Conv.',  color: 'var(--tv-green)',  bg: 'var(--tv-green-bg)' },
  position:    { label: 'Position',    color: 'var(--tv-accent)', bg: 'rgba(41,98,255,0.08)' },
  macro:       { label: 'Macro',       color: 'var(--tv-purple)', bg: 'rgba(124,77,255,0.1)' },
  catalyst:    { label: 'Catalyst',    color: 'var(--tv-orange)', bg: 'var(--tv-orange-bg)' },
  thesis:      { label: 'Thesis',      color: 'var(--tv-cyan)',   bg: 'rgba(0,188,212,0.08)' },
  exit:        { label: 'Exit Signal', color: 'var(--tv-red)',    bg: 'var(--tv-red-bg)' },
  entry:       { label: 'Entry Signal',color: 'var(--tv-green)',  bg: 'var(--tv-green-bg)' },
};

function renderTags(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(t => {
    const def = TAG_DEFS[t] || { label: t, color: 'var(--tv-text-tertiary)', bg: 'var(--tv-bg-tertiary)' };
    return `<span class="dc-tag" style="color:${def.color};background:${def.bg}">${def.label}</span>`;
  }).join('');
}

// ── Transform data into cards ──

function buildCards(data) {
  const cards = [];

  // Active Trades (API returns { trades, stats })
  const tradesRaw = data.activeTrades;
  const trades = Array.isArray(tradesRaw) ? tradesRaw : Array.isArray(tradesRaw?.trades) ? tradesRaw.trades : [];
  trades.filter(t => t.status === 'active').forEach(t => {
    const pnl = t.pnl_pct != null ? Number(t.pnl_pct) : null;
    const tags = ['position'];
    let score = 70;
    if (pnl != null && pnl < -5) { tags.push('urgent', 'risk'); score = 95; }
    else if (pnl != null && pnl > 10) { tags.push('actionable'); score = 75; }
    const evalSig = (t.last_eval_signal || '').toUpperCase();
    if (evalSig === 'EXIT' || evalSig === 'STOP_HIT') { tags.push('exit'); score = 95; }
    else if (evalSig === 'ADD') { tags.push('opportunity'); score = 80; }
    cards.push({
      id: cardId('trade', t.ticker), type: 'trade', icon: 'fa-chart-line',
      label: 'ACTIVE TRADE', ticker: t.ticker, score, tags,
      html: renderTradeCard(t),
    });
  });

  // Daily Check Signals
  const daily = Array.isArray(data.daily) ? data.daily : [];
  daily.forEach(r => {
    const sig = (r.signal || '').toUpperCase();
    const a = parseJson(r.ai_analysis) || {};
    const tags = [];
    let score = 40;
    if (sig === 'ENTRY NOW') { tags.push('entry', 'actionable'); score = 92; }
    else if (sig === 'ENTRY SOON') { tags.push('entry', 'opportunity'); score = 78; }
    else if (sig === 'EXIT' || sig === 'AVOID') { tags.push('exit', 'risk'); score = 85; }
    else { score = 35; }
    if (a.conviction === 'high') { tags.push('high_conv'); score = Math.min(score + 8, 99); }
    if (r.opportunity_score) score = Math.max(score, Math.min(r.opportunity_score, 99));
    cards.push({
      id: cardId('signal', r.ticker + '-' + (r.run_date || '')), type: 'signal',
      icon: 'fa-bolt', label: 'SIGNAL', ticker: r.ticker, score, tags,
      html: renderSignalCard(r, a),
    });
  });

  // Pipeline Results
  const pipeline = Array.isArray(data.pipeline) ? data.pipeline : [];
  const pipelineSeen = new Set();
  pipeline.forEach(p => {
    if (pipelineSeen.has(p.ticker)) return;
    pipelineSeen.add(p.ticker);
    const trade = parseJson(p.trade_idea) || {};
    const green = (parseJson(p.green_flags) || []).map(flagText);
    const red = (parseJson(p.red_flags) || []).map(flagText);
    const tags = ['opportunity'];
    let score = Math.min(p.composite_score || 40, 99);
    if (score >= 70) tags.push('actionable');
    if (p.conviction === 'high') tags.push('high_conv');
    cards.push({
      id: cardId('opportunity', p.ticker), type: 'opportunity', icon: 'fa-microscope',
      label: 'OPPORTUNITY', ticker: p.ticker, score, tags,
      html: renderOpportunityCard(p, trade, green, red),
    });
  });

  // Thesis themes
  const td = data.thesis ? parseJson(data.thesis.thesis_data) || {} : {};
  const themes = Array.isArray(td.themes) ? td.themes : [];
  themes.slice(0, 6).forEach((t, i) => {
    const tags = ['thesis'];
    const conf = t.confidence || 5;
    let score = conf * 7;
    if ((t.direction || '').includes('bear')) tags.push('risk');
    if ((t.direction || '').includes('bull')) tags.push('opportunity');
    cards.push({
      id: cardId('theme', t.name || i), type: 'theme', icon: 'fa-compass',
      label: 'THEME', score, tags, html: renderThemeCard(t),
    });
  });

  // Thesis risks
  const risks = Array.isArray(td.key_risks) ? td.key_risks : [];
  risks.slice(0, 4).forEach((r, i) => {
    const text = typeof r === 'string' ? r : r.description || '';
    const sev = r.severity || 'medium';
    const score = sev === 'high' ? 75 : 55;
    cards.push({
      id: cardId('risk', text.substring(0, 30) || i), type: 'risk',
      icon: 'fa-triangle-exclamation', label: 'RISK', score,
      tags: ['risk', ...(sev === 'high' ? ['urgent'] : [])],
      html: renderRiskCard(r),
    });
  });

  // Thesis catalysts
  const catalysts = Array.isArray(td.catalysts) ? td.catalysts : [];
  catalysts.slice(0, 4).forEach((c, i) => {
    const text = typeof c === 'string' ? c : c.description || '';
    const impact = typeof c === 'string' ? 'medium' : (c.impact || 'medium');
    const score = impact === 'high' ? 60 : 40;
    cards.push({
      id: cardId('catalyst', text.substring(0, 30) || i), type: 'catalyst',
      icon: 'fa-clock', label: 'CATALYST', score,
      tags: ['catalyst', ...(impact === 'high' ? ['actionable'] : [])],
      html: renderCatalystCard(c),
    });
  });

  // Feed Intelligence
  const feed = Array.isArray(data.feed) ? data.feed : [];
  feed.filter(f => {
    const ins = parseJson(f.insight_data) || {};
    return !ins.isNoise;
  }).slice(0, 12).forEach(f => {
    const ins = parseJson(f.insight_data) || {};
    const tags = [];
    let score = 30;
    if (ins.conviction === 'high') { tags.push('high_conv'); score = 72; }
    else if (ins.conviction === 'medium') score = 45;
    if (ins.contrarian) { tags.push('contrarian'); score += 10; }
    if ((ins.direction || '').includes('bull') || ins.direction === 'risk-on') tags.push('opportunity');
    if ((ins.direction || '').includes('bear') || ins.direction === 'risk-off') tags.push('risk');
    score = Math.min(score, 99);
    cards.push({
      id: cardId('feed', f.id || f.created_at), type: 'feed', icon: 'fa-satellite-dish',
      label: 'INTEL', score, tags, html: renderFeedCard(f, ins),
    });
  });

  // Memory Entities
  const memory = Array.isArray(data.memory) ? data.memory : [];
  memory.filter(m => (m.importance_score || 0) >= 6).slice(0, 8).forEach(m => {
    const score = Math.min((m.importance_score || 5) * 8, 80);
    const tags = [m.category === 'macro' || m.category === 'risk' ? 'macro' : 'thesis'];
    if (m.category === 'risk' || (m.sentiment_score || 0) < -3) tags.push('risk');
    if (m.category === 'catalyst') tags.push('catalyst');
    cards.push({
      id: cardId('memory', m.name || m.id), type: 'memory', icon: 'fa-brain',
      label: m.category?.toUpperCase() || 'MEMORY', score, tags,
      html: renderMemoryCard(m),
    });
  });

  // Notes (recent, lower priority)
  const notes = Array.isArray(data.notes) ? data.notes : [];
  notes.slice(0, 4).forEach(n => {
    cards.push({
      id: cardId('note', n.id || n.created_at), type: 'note', icon: 'fa-sticky-note',
      label: 'NOTE', ticker: n.ticker, score: 15, tags: [],
      html: renderNoteCard(n),
    });
  });

  // Sort by score desc, then cap at MAX_CARDS
  cards.sort((a, b) => b.score - a.score);
  return cards.slice(0, MAX_CARDS);
}

// ═══════════════════════════════════════════════
// CARD RENDERERS
// ═══════════════════════════════════════════════

function renderTradeCard(t) {
  const pnl = t.pnl_pct != null ? Number(t.pnl_pct) : null;
  const pnlColor = pnl > 0 ? 'var(--tv-green)' : pnl < 0 ? 'var(--tv-red)' : 'var(--tv-text-tertiary)';
  const dirColor = t.direction === 'short' ? 'var(--tv-red)' : 'var(--tv-green)';
  const evalSig = t.last_eval_signal || '';
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-between">
        <span class="dc-ticker" ${goTicker(t.ticker)}>${esc(t.ticker)}</span>
        <span class="dc-pnl" style="color:${pnlColor}">${pnl != null ? fmtPct(pnl) : '--'}</span>
      </div>
      <div class="dc-row dc-row-meta">
        <span class="dc-dir" style="color:${dirColor}">${esc(t.direction || 'long').toUpperCase()}</span>
        <span class="dc-meta">Entry ${fmtNum(t.entry_price)}</span>
        ${t.current_price ? `<span class="dc-meta">Now ${fmtNum(t.current_price)}</span>` : ''}
        ${evalSig ? `<span class="dc-signal-tag" style="color:${sigColor(evalSig)};background:${sigBg(evalSig)}">${esc(evalSig)}</span>` : ''}
      </div>
      ${t.stop_loss || t.take_profit ? `
        <div class="dc-row dc-row-levels">
          ${t.stop_loss ? `<span class="dc-level"><span class="dc-level-label">Stop</span> ${fmtNum(t.stop_loss)}</span>` : ''}
          ${t.take_profit ? `<span class="dc-level"><span class="dc-level-label">Target</span> ${fmtNum(t.take_profit)}</span>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderSignalCard(r, a) {
  const sig = r.signal || 'WATCH';
  const levels = a.key_levels || {};
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-between">
        <span class="dc-ticker" ${goTicker(r.ticker)}>${esc(r.ticker)}</span>
        <span class="dc-signal-tag" style="color:${sigColor(sig)};background:${sigBg(sig)}">${esc(sig)}</span>
      </div>
      ${r.opportunity_score ? `<div class="dc-row"><span class="dc-score-lg" style="color:${r.opportunity_score >= 70 ? 'var(--tv-green)' : r.opportunity_score >= 40 ? 'var(--tv-orange)' : 'var(--tv-text-tertiary)'}">${r.opportunity_score}</span></div>` : ''}
      ${a.summary ? `<div class="dc-detail">${esc(String(a.summary).substring(0, 160))}</div>` : ''}
      ${levels.entry ? `
        <div class="dc-row dc-row-levels">
          <span class="dc-level"><span class="dc-level-label">Entry</span> ${fmtNum(levels.entry)}</span>
          <span class="dc-level"><span class="dc-level-label">Target</span> ${fmtNum(levels.target)}</span>
          <span class="dc-level"><span class="dc-level-label">Stop</span> ${fmtNum(levels.stop)}</span>
          ${levels.risk_reward ? `<span class="dc-level"><span class="dc-level-label">R:R</span> ${esc(String(levels.risk_reward))}</span>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderOpportunityCard(p, trade, green, red) {
  const sc = p.composite_score || 0;
  const scColor = sc >= 70 ? 'var(--tv-green)' : sc >= 40 ? 'var(--tv-orange)' : 'var(--tv-text-tertiary)';
  const dirColor = p.direction === 'short' ? 'var(--tv-red)' : 'var(--tv-green)';
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-between">
        <span class="dc-ticker" ${goTicker(p.ticker)}>${esc(p.ticker)}</span>
        <span class="dc-score-lg" style="color:${scColor}">${Math.round(sc)}</span>
      </div>
      <div class="dc-row dc-row-meta">
        <span class="dc-dir" style="color:${dirColor}">${esc(p.direction || 'long').toUpperCase()}</span>
        <span class="dc-conviction">${esc(p.conviction || 'low')}</span>
      </div>
      ${trade.thesis || trade.rationale ? `<div class="dc-detail">${esc(String(trade.thesis || trade.rationale).substring(0, 140))}</div>` : ''}
      ${green.length || red.length ? `
        <div class="dc-flags">
          ${green.slice(0, 2).map(g => `<span class="dc-flag dc-flag-green">${esc(g)}</span>`).join('')}
          ${red.slice(0, 2).map(r => `<span class="dc-flag dc-flag-red">${esc(r)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderThemeCard(t) {
  const dir = t.direction || '';
  const dc = dir.includes('bull') ? 'var(--tv-green)' : dir.includes('bear') ? 'var(--tv-red)' : 'var(--tv-text-secondary)';
  const affected = Array.isArray(t.affected_tickers) ? t.affected_tickers : [];
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-between">
        <span class="dc-theme-name">${esc(t.name)}</span>
        <span style="color:${dc};font-size:var(--t-3xs);font-weight:700">${esc(dir)}</span>
      </div>
      ${t.confidence ? `<div class="dc-row"><span class="dc-meta">Confidence ${t.confidence}/10</span></div>` : ''}
      ${affected.length ? `<div class="dc-chips">${affected.slice(0, 5).map(tk => `<span class="dc-chip" ${goTicker(tk)}>${esc(tk)}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function renderRiskCard(r) {
  const text = typeof r === 'string' ? r : r.description || '';
  const severity = r.severity || 'medium';
  const sColor = severity === 'high' ? 'var(--tv-red)' : 'var(--tv-orange)';
  return `
    <div class="dc-card-main">
      <div class="dc-risk-bar" style="border-left:3px solid ${sColor}">
        <div class="dc-detail">${esc(text)}</div>
        ${r.affected_tickers?.length ? `<div class="dc-chips">${r.affected_tickers.slice(0, 4).map(tk => `<span class="dc-chip" ${goTicker(tk)}>${esc(tk)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `;
}

function renderCatalystCard(c) {
  const text = typeof c === 'string' ? c : c.description || '';
  const impact = typeof c === 'string' ? 'medium' : (c.impact || 'medium');
  const ic = impact === 'high' ? 'var(--tv-red)' : 'var(--tv-orange)';
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-between">
        <span class="dc-detail" style="flex:1">${esc(text)}</span>
        ${c.date ? `<span class="dc-date">${esc(c.date)}</span>` : ''}
      </div>
      <span class="dc-catalyst-dot" style="background:${ic}"></span>
    </div>
  `;
}

function renderFeedCard(f, ins) {
  const dirColor = (ins.direction || '').includes('bull') || ins.direction === 'risk-on' ? 'var(--tv-green)'
    : (ins.direction || '').includes('bear') || ins.direction === 'risk-off' ? 'var(--tv-red)' : 'var(--tv-text-tertiary)';
  const tickers = (ins.tickers || []).slice(0, 3);
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-meta">
        ${tickers.map(t => `<span class="dc-ticker" ${goTicker(t)}>${esc(t)}</span>`).join(' ')}
        <span class="dc-feed-dir" style="color:${dirColor}">${esc(ins.direction || '')}</span>
        ${ins.contrarian ? '<span class="dc-contrarian">CONTRARIAN</span>' : ''}
        <span class="dc-time">${timeAgo(f.created_at)}</span>
      </div>
      <div class="dc-detail">${esc(String(f.content || '').substring(0, 130))}</div>
      ${ins.tradingImplication ? `<div class="dc-implication">${esc(String(ins.tradingImplication).substring(0, 100))}</div>` : ''}
    </div>
  `;
}

function renderMemoryCard(m) {
  const catColors = {
    macro: 'var(--tv-purple)', sector: 'var(--tv-cyan)', technical: 'var(--tv-accent)',
    flow: 'var(--tv-orange)', positioning: 'var(--tv-green)', catalyst: 'var(--tv-red)', risk: 'var(--tv-red)'
  };
  const color = catColors[m.category] || 'var(--tv-text-secondary)';
  const sentiment = m.sentiment_score || 0;
  const assets = parseJson(m.affected_assets) || [];
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-between">
        <span class="dc-memory-name">${esc(m.name)}</span>
        <span class="dc-memory-score">${m.importance_score}/10</span>
      </div>
      <div class="dc-row dc-row-meta">
        <span class="dc-memory-cat" style="color:${color}">${esc(m.category || '')}</span>
        <span style="color:${sentiment > 0 ? 'var(--tv-green)' : sentiment < 0 ? 'var(--tv-red)' : 'var(--tv-text-tertiary)'}">${sentiment > 0 ? '+' : ''}${sentiment}</span>
      </div>
      ${m.current_thesis_impact ? `<div class="dc-detail">${esc(String(m.current_thesis_impact).substring(0, 90))}</div>` : ''}
      ${assets.length ? `<div class="dc-chips">${assets.slice(0, 5).map(a => `<span class="dc-chip" ${goTicker(a)}>${esc(a)}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function renderNoteCard(n) {
  return `
    <div class="dc-card-main">
      <div class="dc-row dc-row-between">
        ${n.ticker ? `<span class="dc-ticker" ${goTicker(n.ticker)}>${esc(n.ticker)}</span>` : '<span></span>'}
        <span class="dc-time">${timeAgo(n.created_at)}</span>
      </div>
      <div class="dc-detail">${esc(String(n.content || '').substring(0, 120))}</div>
      ${n.tags ? `<div class="dc-note-tags">${esc(n.tags)}</div>` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════
// BRIEFING RENDERER
// ═══════════════════════════════════════════════

function renderBriefing(briefing) {
  const el = document.getElementById('dcBriefing');
  if (!el) return;

  if (!briefing || !briefing.briefing_data) {
    el.innerHTML = `
      <div class="dc-briefing-empty">
        <span>No briefing generated yet</span>
        <button class="dc-btn dc-btn-sm" onclick="window._dbGenBriefing()">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Now
        </button>
      </div>
    `;
    return;
  }

  const b = briefing.briefing_data;
  briefingData = b;

  el.innerHTML = `
    <div class="dc-briefing">
      <div class="dc-briefing-header" onclick="window._dbToggleBriefing()">
        <div class="dc-briefing-headline">${esc(b.headline || 'Daily Intelligence Briefing')}</div>
        <div class="dc-briefing-controls">
          <span class="dc-briefing-time">${briefing.created_at ? timeAgo(briefing.created_at) + ' ago' : ''}</span>
          <i class="fa-solid fa-chevron-${briefingCollapsed ? 'down' : 'up'} dc-briefing-toggle"></i>
        </div>
      </div>
      <div class="dc-briefing-body${briefingCollapsed ? ' dc-collapsed' : ''}">
        ${b.market_snapshot ? `<div class="dc-briefing-snapshot">${esc(b.market_snapshot)}</div>` : ''}

        ${b.sector_heat ? `
          <div class="dc-briefing-sectors">
            ${(b.sector_heat.hot || []).map(s => `<span class="dc-sector-tag dc-sector-hot">${esc(s)}</span>`).join('')}
            ${(b.sector_heat.rotating_into || []).map(s => `<span class="dc-sector-tag dc-sector-rotate">${esc(s)}</span>`).join('')}
            ${(b.sector_heat.cold || []).map(s => `<span class="dc-sector-tag dc-sector-cold">${esc(s)}</span>`).join('')}
          </div>
        ` : ''}

        ${Array.isArray(b.key_developments) && b.key_developments.length ? `
          <div class="dc-briefing-section">
            <div class="dc-briefing-section-title">Key Developments</div>
            ${b.key_developments.map(d => `
              <div class="dc-dev-item">
                <div class="dc-dev-header">
                  <span class="dc-dev-dot" style="background:${sentimentColor(d.sentiment)}"></span>
                  <span class="dc-dev-title">${esc(d.title)}</span>
                  ${d.importance ? `<span class="dc-dev-imp">${d.importance}/10</span>` : ''}
                </div>
                <div class="dc-dev-detail">${esc(d.detail)}</div>
                ${d.tickers?.length ? `<div class="dc-chips">${d.tickers.map(t => `<span class="dc-chip" ${goTicker(t)}>${esc(t)}</span>`).join('')}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${Array.isArray(b.top_opportunities) && b.top_opportunities.length ? `
          <div class="dc-briefing-section">
            <div class="dc-briefing-section-title">Top Opportunities</div>
            ${b.top_opportunities.map(o => `
              <div class="dc-opp-item">
                <div class="dc-opp-header">
                  <span class="dc-ticker" ${goTicker(o.ticker)}>${esc(o.ticker)}</span>
                  <span class="dc-dir" style="color:${o.direction === 'short' ? 'var(--tv-red)' : 'var(--tv-green)'}">${esc(o.direction || 'long').toUpperCase()}</span>
                  <span class="dc-conviction">${esc(o.conviction || '')}</span>
                </div>
                <div class="dc-dev-detail">${esc(o.thesis)}</div>
                ${o.catalyst ? `<div class="dc-catalyst-text">${esc(o.catalyst)}</div>` : ''}
                ${o.levels ? `
                  <div class="dc-row dc-row-levels">
                    ${o.levels.entry ? `<span class="dc-level"><span class="dc-level-label">Entry</span> ${fmtNum(o.levels.entry)}</span>` : ''}
                    ${o.levels.target ? `<span class="dc-level"><span class="dc-level-label">Target</span> ${fmtNum(o.levels.target)}</span>` : ''}
                    ${o.levels.stop ? `<span class="dc-level"><span class="dc-level-label">Stop</span> ${fmtNum(o.levels.stop)}</span>` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${Array.isArray(b.critical_risks) && b.critical_risks.length ? `
          <div class="dc-briefing-section">
            <div class="dc-briefing-section-title dc-title-red">Critical Risks</div>
            ${b.critical_risks.map(r => `
              <div class="dc-risk-item">
                <div class="dc-risk-text">${esc(r.risk)}</div>
                ${r.hedge ? `<div class="dc-risk-hedge">Hedge: ${esc(r.hedge)}</div>` : ''}
                ${r.affected_tickers?.length ? `<div class="dc-chips">${r.affected_tickers.map(t => `<span class="dc-chip" ${goTicker(t)}>${esc(t)}</span>`).join('')}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${b.portfolio_notes ? `
          <div class="dc-briefing-section">
            <div class="dc-briefing-section-title">Portfolio</div>
            <div class="dc-dev-detail">${esc(b.portfolio_notes)}</div>
          </div>
        ` : ''}

        ${Array.isArray(b.action_items) && b.action_items.length ? `
          <div class="dc-briefing-section">
            <div class="dc-briefing-section-title">Action Items</div>
            <div class="dc-action-items">
              ${b.action_items.map(a => `<div class="dc-action-item"><i class="fa-solid fa-circle-check"></i> ${esc(a)}</div>`).join('')}
            </div>
          </div>
        ` : ''}

        ${b.contrarian_corner ? `
          <div class="dc-briefing-contrarian">
            <i class="fa-solid fa-rotate"></i> <strong>Contrarian:</strong> ${esc(b.contrarian_corner)}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════
// CARD GRID RENDERER
// ═══════════════════════════════════════════════

function renderCards() {
  const grid = document.getElementById('dcGrid');
  if (!grid) return;

  // Filter cards
  let visible = allCards.filter(c => {
    const pref = getCardPref(c.id);
    if (activeFilter === 'starred') return pref === 'star';
    if (pref === 'hide' && activeFilter !== 'hidden') return false;
    if (activeFilter === 'hidden') return pref === 'hide';
    // Type filters
    if (['trade', 'signal', 'opportunity', 'risk', 'theme', 'feed', 'memory', 'catalyst'].includes(activeFilter)) {
      return c.type === activeFilter;
    }
    // Tag filters
    if (TAG_DEFS[activeFilter]) return (c.tags || []).includes(activeFilter);
    return true;
  });

  // Sort: starred always first, then by chosen sort
  visible.sort((a, b) => {
    const aStarred = getCardPref(a.id) === 'star' ? 1 : 0;
    const bStarred = getCardPref(b.id) === 'star' ? 1 : 0;
    if (aStarred !== bStarred) return bStarred - aStarred;
    if (activeSort === 'type') return a.type.localeCompare(b.type) || b.score - a.score;
    return b.score - a.score;
  });

  // Update filter counts
  updateFilterCounts();

  if (visible.length === 0) {
    grid.innerHTML = `<div class="dc-empty-state">
      <i class="fa-solid fa-inbox"></i>
      <span>${activeFilter === 'starred' ? 'No starred cards yet. Star cards to pin them here.' : activeFilter === 'hidden' ? 'No hidden cards.' : 'No intelligence cards available.'}</span>
    </div>`;
    return;
  }

  grid.innerHTML = visible.map(c => {
    const pref = getCardPref(c.id);
    const starClass = pref === 'star' ? ' dc-card-starred' : '';
    const typeColors = {
      trade: 'var(--tv-accent)', signal: 'var(--tv-green)', opportunity: 'var(--tv-orange)',
      theme: 'var(--tv-cyan)', risk: 'var(--tv-red)', catalyst: 'var(--tv-orange)',
      feed: 'var(--tv-purple)', memory: 'var(--tv-purple)', note: 'var(--tv-text-tertiary)',
    };
    const accentColor = typeColors[c.type] || 'var(--tv-text-tertiary)';
    const scoreColor = c.score >= 75 ? 'var(--tv-green)' : c.score >= 50 ? 'var(--tv-orange)' : 'var(--tv-text-tertiary)';
    return `
      <div class="dc-card${starClass}" data-card-id="${c.id}" data-card-type="${c.type}">
        <div class="dc-card-header">
          <div class="dc-card-type" style="color:${accentColor}">
            <i class="fa-solid ${c.icon}"></i>
            <span>${c.label}</span>
          </div>
          <div class="dc-card-tags">${renderTags(c.tags)}</div>
          <span class="dc-card-score" style="color:${scoreColor}">${c.score}</span>
          ${cardActions(c.id)}
        </div>
        ${c.html}
      </div>
    `;
  }).join('');
}

function updateFilterCounts() {
  const counts = { all: 0, starred: 0, hidden: 0 };

  allCards.forEach(c => {
    const pref = getCardPref(c.id);
    if (pref === 'hide') { counts.hidden++; return; }
    counts.all++;
    if (pref === 'star') counts.starred++;
  });

  const badge = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };
  badge('dcCountAll', counts.all);
  badge('dcCountStarred', counts.starred);
  badge('dcCountHidden', counts.hidden);
}

// ═══════════════════════════════════════════════
// SCAFFOLD & MAIN
// ═══════════════════════════════════════════════

function scaffold() {
  const page = document.getElementById('dbPage');
  if (!page) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const typeFilters = [
    { key: 'trade', icon: 'fa-chart-line', label: 'Trades' },
    { key: 'signal', icon: 'fa-bolt', label: 'Signals' },
    { key: 'opportunity', icon: 'fa-microscope', label: 'Opps' },
    { key: 'risk', icon: 'fa-triangle-exclamation', label: 'Risks' },
    { key: 'theme', icon: 'fa-compass', label: 'Themes' },
    { key: 'feed', icon: 'fa-satellite-dish', label: 'Intel' },
    { key: 'memory', icon: 'fa-brain', label: 'Memory' },
  ];
  const tagFilters = [
    { key: 'actionable', label: 'Actionable' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'high_conv', label: 'High Conv.' },
    { key: 'contrarian', label: 'Contrarian' },
  ];

  page.innerHTML = `
    <div class="dc-header">
      <div class="dc-header-left">
        <span class="dc-title">Intelligence</span>
        <span class="dc-date">${dateStr}</span>
      </div>
      <div class="dc-header-actions">
        <span class="dc-status" id="dcStatus"><span class="dc-spinner"></span> Loading...</span>
        <button class="dc-btn" onclick="window._dbGenBriefing()" title="Generate daily briefing with AI"><i class="fa-solid fa-wand-magic-sparkles"></i> Briefing</button>
        <button class="dc-btn" onclick="window.refreshDashboard()" title="Refresh dashboard data"><i class="fa-solid fa-arrows-rotate"></i></button>
      </div>
    </div>

    <div id="dcBriefing" class="dc-briefing-wrap">
      <div class="dc-briefing-loading"><div class="dc-skeleton"></div></div>
    </div>

    <div class="dc-toolbar">
      <div class="dc-filters" id="dcFilters">
        <button class="dc-filter dc-filter-active" data-filter="all" onclick="window._dbFilter('all')">
          All <span class="dc-filter-badge" id="dcCountAll">0</span>
        </button>
        <button class="dc-filter" data-filter="starred" onclick="window._dbFilter('starred')">
          <i class="fa-solid fa-star"></i> <span class="dc-filter-badge" id="dcCountStarred">0</span>
        </button>
        <span class="dc-filter-sep"></span>
        ${typeFilters.map(f => `
          <button class="dc-filter" data-filter="${f.key}" onclick="window._dbFilter('${f.key}')">
            <i class="fa-solid ${f.icon}"></i> ${f.label}
          </button>
        `).join('')}
        <span class="dc-filter-sep"></span>
        ${tagFilters.map(f => {
          const def = TAG_DEFS[f.key];
          return `<button class="dc-filter dc-filter-tag" data-filter="${f.key}" onclick="window._dbFilter('${f.key}')" style="--tag-color:${def.color};--tag-bg:${def.bg}">
            ${f.label}
          </button>`;
        }).join('')}
        <span class="dc-filter-sep"></span>
        <button class="dc-filter" data-filter="hidden" onclick="window._dbFilter('hidden')">
          <i class="fa-solid fa-eye-slash"></i> <span class="dc-filter-badge" id="dcCountHidden">0</span>
        </button>
      </div>
      <div class="dc-sort">
        <select class="dc-sort-select" onchange="window._dbSort(this.value)" title="Sort cards">
          <option value="score" selected>Score</option>
          <option value="type">Type</option>
        </select>
      </div>
    </div>

    <div class="dc-grid" id="dcGrid">
      <div class="dc-loading-cards">
        <div class="dc-skeleton-card"></div>
        <div class="dc-skeleton-card"></div>
        <div class="dc-skeleton-card"></div>
        <div class="dc-skeleton-card"></div>
        <div class="dc-skeleton-card"></div>
        <div class="dc-skeleton-card"></div>
      </div>
    </div>
  `;
}

// ── Filter handler ──

window._dbFilter = (filter) => {
  activeFilter = filter;
  document.querySelectorAll('.dc-filter').forEach(el => {
    el.classList.toggle('dc-filter-active', el.dataset.filter === filter);
  });
  renderCards();
};

window._dbCardPref = (id, action) => setCardPref(id, action);

window._dbSort = (sort) => {
  activeSort = sort;
  renderCards();
};

window._dbToggleBriefing = () => {
  briefingCollapsed = !briefingCollapsed;
  const body = document.querySelector('.dc-briefing-body');
  const icon = document.querySelector('.dc-briefing-toggle');
  if (body) body.classList.toggle('dc-collapsed', briefingCollapsed);
  if (icon) {
    icon.classList.toggle('fa-chevron-up', !briefingCollapsed);
    icon.classList.toggle('fa-chevron-down', briefingCollapsed);
  }
};

window._dbGenBriefing = async () => {
  const el = document.getElementById('dcBriefing');
  if (el) el.innerHTML = '<div class="dc-briefing-loading"><div class="dc-spinner"></div> Generating briefing with Sonnet...</div>';
  try {
    const result = await apiFetch('/api/dashboard/briefing', { method: 'POST' });
    if (result.success) {
      renderBriefing({ briefing_data: result.briefing_data, created_at: new Date().toISOString() });
    } else {
      if (el) el.innerHTML = `<div class="dc-briefing-empty"><span>${esc(result.message || 'Generation failed')}</span></div>`;
    }
  } catch (e) {
    if (el) el.innerHTML = `<div class="dc-briefing-empty"><span>Error: ${esc(e.message)}</span></div>`;
  }
};

// ── Main ──

export async function loadDashboard() {
  scaffold();

  const data = await fetchAll();

  // Load card preferences
  const prefs = Array.isArray(data.prefs) ? data.prefs : [];
  cardPrefs = {};
  prefs.forEach(p => { cardPrefs[p.card_id] = p.action; });

  // Render briefing
  renderBriefing(data.briefing);

  // Build & render cards
  allCards = buildCards(data);
  renderCards();

  // Update status
  const statusEl = document.getElementById('dcStatus');
  if (statusEl) {
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    statusEl.innerHTML = `<span class="dc-status-dot"></span>${allCards.length} cards &middot; ${t}`;
  }

  loaded = true;
}

window.refreshDashboard = () => loadDashboard();
