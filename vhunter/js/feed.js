// Feed Module - Signal intelligence from tweets, blogs, charts
import { CONFIG } from './config.js';
import { getMacroSnapshot } from './macro.js';

let feedItems = [];
let currentThesis = null;
let runCallback = null;

export function setRunCallback(cb) {
  runCallback = cb;
}

// API functions
async function feedFetch(path, options = {}) {
  const userId = localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
  const response = await fetch(`${CONFIG.PROXY_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      ...options.headers
    }
  });
  return response.json();
}

export async function getFeedItems(status = null) {
  let query = '/api/feed?limit=100';
  if (status) query += `&status=${status}`;
  return feedFetch(query);
}

export async function addFeedItem(item) {
  return feedFetch('/api/feed', {
    method: 'POST',
    body: JSON.stringify(item)
  });
}

export async function updateFeedItem(id, updates) {
  return feedFetch(`/api/feed/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

export async function deleteFeedItem(id) {
  return feedFetch(`/api/feed/${id}`, { method: 'DELETE' });
}

export async function uploadImage(file) {
  const userId = localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${CONFIG.PROXY_URL}/api/feed/upload`, {
    method: 'POST',
    headers: { 'X-User-Id': userId },
    body: formData
  });
  return response.json();
}

// Get current thesis
export async function getThesis() {
  return feedFetch('/api/thesis');
}

// Regenerate thesis manually
export async function regenerateThesis(macroSnapshot = null) {
  return feedFetch('/api/thesis/update', {
    method: 'POST',
    body: JSON.stringify({ macroSnapshot })
  });
}

// Load and render thesis
export async function loadThesis() {
  const card = document.getElementById('thesisCard');
  if (!card) return;

  try {
    const thesis = await getThesis();
    currentThesis = thesis;
    renderThesis(card, thesis);
    updateThesisTimestamp(thesis);
  } catch (e) {
    card.innerHTML = '<div class="thesis-empty">Failed to load thesis</div>';
  }
}

function updateThesisTimestamp(thesis) {
  const timeEl = document.getElementById('thesisUpdatedTime');
  if (!timeEl) return;

  if (thesis?.updated_at) {
    timeEl.textContent = formatThesisTime(thesis.updated_at);
  } else {
    timeEl.textContent = '';
  }

  // Update pipeline status bar
  updatePipelineStatus(thesis);
}

function updatePipelineStatus(thesis) {
  const statusEl = document.getElementById('feedPipelineStatus');
  if (!statusEl) return;

  if (!thesis?.updated_at) {
    statusEl.innerHTML = '<span class="pipeline-stale">No pipeline data yet. Click Sync All to start.</span>';
    return;
  }

  const lastUpdate = new Date(thesis.updated_at);
  const hoursAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
  const timeStr = formatThesisTime(thesis.updated_at);
  const freshClass = hoursAgo < 2 ? 'pipeline-fresh' : hoursAgo < 6 ? 'pipeline-warm' : 'pipeline-stale';

  statusEl.innerHTML = `
    <span class="${freshClass}">
      Pipeline: v${thesis.version || 0} · ${thesis.signals_count || 0} signals · updated ${timeStr}
      ${hoursAgo > 4 ? ' · auto-syncing...' : ''}
    </span>
  `;
}

function renderThesis(card, thesis) {
  if (!thesis || !thesis.thesis_data) {
    card.innerHTML = `
      <div class="thesis-empty">
        <div class="thesis-empty-text">No thesis yet</div>
        <div class="thesis-empty-hint">Add signals to generate thesis</div>
      </div>`;
    return;
  }

  const t = thesis.thesis_data;
  const conviction = t.conviction || 5;
  const convictionClass = conviction >= 7 ? 'high' : conviction >= 4 ? 'medium' : 'low';

  // Overall Thesis (new) - falls back to old primaryThesis/executiveSummary
  const overallText = t.overallThesis || t.primaryThesis || t.executiveSummary || '';
  const overallHtml = overallText ? `
    <div class="thesis-overall">${overallText}</div>` : '';

  // Narrative
  const narrativeHtml = t.narrative ? `
    <div class="thesis-narrative">${t.narrative}</div>` : '';

  // Market State (new)
  const ms = t.marketState;
  const marketStateHtml = ms ? `
    <div class="thesis-section collapsible" data-section="market-state">
      <div class="thesis-section-title" onclick="toggleThesisSection('market-state', event)">
        Market State <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        <div class="thesis-market-state-grid">
          ${ms.equities ? `<div class="market-state-item"><span class="market-state-label">Equities</span><span class="market-state-value">${ms.equities}</span></div>` : ''}
          ${ms.rates ? `<div class="market-state-item"><span class="market-state-label">Rates</span><span class="market-state-value">${ms.rates}</span></div>` : ''}
          ${ms.volatility ? `<div class="market-state-item"><span class="market-state-label">Volatility</span><span class="market-state-value">${ms.volatility}</span></div>` : ''}
          ${ms.intermarket ? `<div class="market-state-item"><span class="market-state-label">Intermarket</span><span class="market-state-value">${ms.intermarket}</span></div>` : ''}
        </div>
      </div>
    </div>` : '';

  // Near-Term Outlook (new)
  const nt = t.nearTerm;
  const nearTermHtml = nt ? `
    <div class="thesis-section collapsible" data-section="near-term">
      <div class="thesis-section-title" onclick="toggleThesisSection('near-term', event)">
        Near-Term Outlook <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${nt.outlook ? `<div class="thesis-near-term-outlook">${nt.outlook}</div>` : ''}
        ${nt.criticalDevelopments?.length ? `
          <div class="thesis-near-term-devs">
            ${nt.criticalDevelopments.map(d => `
              <div class="near-term-dev">
                <span class="near-term-dev-impact ${d.impact}">${d.impact}</span>
                <span class="near-term-dev-text">${d.development}</span>
                ${d.timeframe ? `<span class="near-term-dev-time">${d.timeframe}</span>` : ''}
              </div>
            `).join('')}
          </div>` : ''}
        ${nt.catalysts?.length ? `
          <div class="thesis-near-term-catalysts">
            ${nt.catalysts.map(c => `
              <div class="catalyst-item">
                <span class="catalyst-date">${c.date}</span>
                <span class="catalyst-event">${c.event}</span>
                <span class="catalyst-impact ${c.impact}">${c.impact}</span>
              </div>
            `).join('')}
          </div>` : ''}
      </div>
    </div>` : '';

  // Evolving Factors (new - from memories)
  const ef = t.evolvingFactors || [];
  const evolvingHtml = ef.length ? `
    <div class="thesis-section collapsible" data-section="evolving">
      <div class="thesis-section-title" onclick="toggleThesisSection('evolving', event)">
        Evolving Factors (${ef.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${ef.map(f => `
          <div class="thesis-evolving-factor">
            <div class="evolving-factor-header">
              <span class="evolving-factor-name">${f.name}</span>
              <span class="evolving-factor-trend ${f.trend}">${f.trend}</span>
            </div>
            ${f.currentState ? `<div class="evolving-factor-state">${f.currentState}</div>` : ''}
            ${f.significance ? `<div class="evolving-factor-sig">${f.significance}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // Expectations (new)
  const expectations = t.expectations || [];
  const expectationsHtml = expectations.length ? `
    <div class="thesis-section collapsible" data-section="expectations">
      <div class="thesis-section-title" onclick="toggleThesisSection('expectations', event)">
        Expectations (${expectations.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${expectations.map(e => `
          <div class="thesis-expectation">
            <span class="expectation-confidence ${e.confidence}">${e.confidence}</span>
            <span class="expectation-text">${e.expectation}</span>
            ${e.timeframe ? `<span class="expectation-timeframe">${e.timeframe}</span>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // Themes
  const themes = t.themes || [];
  const themesHtml = themes.length ? `
    <div class="thesis-section collapsible" data-section="themes">
      <div class="thesis-section-title" onclick="toggleThesisSection('themes', event)">
        Themes (${themes.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${themes.map(theme => typeof theme === 'string' ? `<div class="thesis-theme-item">${theme}</div>` : `
          <div class="thesis-theme-item">
            <div class="theme-name">${theme.name} <span class="theme-conviction ${theme.conviction}">${theme.conviction}</span></div>
            ${theme.description ? `<div class="theme-desc">${theme.description}</div>` : ''}
            ${theme.trades?.length ? `<div class="theme-trades">Trades: ${theme.trades.join(', ')}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // Sector analysis
  const sectorAnalysis = t.sectorAnalysis;
  const sectorsHtml = sectorAnalysis ? `
    <div class="thesis-section collapsible" data-section="sectors">
      <div class="thesis-section-title" onclick="toggleThesisSection('sectors', event)">
        Sector Analysis <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${sectorAnalysis.overweight?.length ? `
          <div class="thesis-subsection">
            <div class="thesis-label ow">Overweight:</div>
            ${sectorAnalysis.overweight.map(s => typeof s === 'string' ? `<div class="sector-item">${s}</div>` : `
              <div class="sector-item">
                <strong>${s.sector}</strong>: ${s.rationale}
                ${s.tickers?.length ? `<span class="sector-tickers">[${s.tickers.join(', ')}]</span>` : ''}
              </div>
            `).join('')}
          </div>` : ''}
        ${sectorAnalysis.underweight?.length ? `
          <div class="thesis-subsection">
            <div class="thesis-label uw">Underweight:</div>
            ${sectorAnalysis.underweight.map(s => typeof s === 'string' ? `<div class="sector-item">${s}</div>` : `
              <div class="sector-item">
                <strong>${s.sector}</strong>: ${s.rationale}
                ${s.tickers?.length ? `<span class="sector-tickers">[${s.tickers.join(', ')}]</span>` : ''}
              </div>
            `).join('')}
          </div>` : ''}
        ${sectorAnalysis.avoid?.length ? `
          <div class="thesis-subsection">
            <div class="thesis-label avoid">Avoid:</div>
            <div class="sector-item">${sectorAnalysis.avoid.join(', ')}</div>
          </div>` : ''}
      </div>
    </div>` : (t.sectors ? `
    <div class="thesis-row"><span class="thesis-label">OW:</span><span class="thesis-value ow">${(t.sectors?.ow || []).join(', ')}</span></div>
    <div class="thesis-row"><span class="thesis-label">UW:</span><span class="thesis-value uw">${(t.sectors?.uw || []).join(', ')}</span></div>
    ${t.sectors?.avoid?.length ? `<div class="thesis-row"><span class="thesis-label">Avoid:</span><span class="thesis-value avoid">${t.sectors.avoid.join(', ')}</span></div>` : ''}` : '');

  // Ticker intelligence
  const tickerIntel = t.tickerIntelligence || [];
  const tickerHtml = tickerIntel.length ? `
    <div class="thesis-section collapsible" data-section="tickers">
      <div class="thesis-section-title" onclick="toggleThesisSection('tickers', event)">
        Ticker Intelligence (${tickerIntel.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${tickerIntel.map(ti => `
          <div class="ticker-intel-item">
            <div class="ticker-header">
              <span class="ticker-symbol" onclick="analyzeTicker('${ti.ticker}')">${ti.ticker}</span>
              <span class="ticker-bias ${ti.netBias}">${ti.netBias}</span>
              ${ti.signalCount ? `<span class="ticker-signals">${ti.signalCount} signals</span>` : ''}
            </div>
            ${ti.tradingView || ti.view ? `<div class="ticker-view">${ti.tradingView || ti.view}</div>` : ''}
            ${ti.technicals ? `<div class="ticker-technicals">${ti.technicals}</div>` : ''}
            ${ti.catalyst ? `<div class="ticker-catalyst">Catalyst: ${ti.catalyst}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // Key levels
  const levels = t.keyLevels;
  const levelsHtml = levels ? `
    <div class="thesis-section collapsible" data-section="levels">
      <div class="thesis-section-title" onclick="toggleThesisSection('levels', event)">
        Key Levels <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${levels.SPX ? `<div class="thesis-row"><span class="thesis-label">SPX:</span><span class="thesis-value">S: ${Array.isArray(levels.SPX.support) ? levels.SPX.support.join(', ') : levels.SPX.support} | R: ${Array.isArray(levels.SPX.resistance) ? levels.SPX.resistance.join(', ') : levels.SPX.resistance}${levels.SPX.commentary ? ` (${levels.SPX.commentary})` : ''}</span></div>` : ''}
        ${levels.QQQ ? `<div class="thesis-row"><span class="thesis-label">QQQ:</span><span class="thesis-value">S: ${Array.isArray(levels.QQQ.support) ? levels.QQQ.support.join(', ') : levels.QQQ.support} | R: ${Array.isArray(levels.QQQ.resistance) ? levels.QQQ.resistance.join(', ') : levels.QQQ.resistance}</span></div>` : ''}
        ${levels.VIX ? `<div class="thesis-row"><span class="thesis-label">VIX:</span><span class="thesis-value">${levels.VIX.floor}-${levels.VIX.ceiling}${levels.VIX.commentary ? ` (${levels.VIX.commentary})` : ''}</span></div>` : ''}
        ${levels.other?.length ? levels.other.filter(l => l.ticker).map(l => `<div class="thesis-row"><span class="thesis-label">${l.ticker}:</span><span class="thesis-value">${l.levels}${l.commentary ? ` (${l.commentary})` : ''}</span></div>`).join('') : ''}
      </div>
    </div>` : '';

  // Opportunities (new - replaces trade recommendations)
  const opportunities = t.opportunities || [];
  // Backward compat: also render old tradeRecommendations if no opportunities
  const trades = !opportunities.length ? (t.tradeRecommendations || t.tradeIdeas || []) : [];
  const oppsHtml = opportunities.length ? `
    <div class="thesis-section collapsible" data-section="opps">
      <div class="thesis-section-title" onclick="toggleThesisSection('opps', event)">
        Opportunities (${opportunities.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${opportunities.map(o => `
          <div class="thesis-opportunity">
            <div class="opportunity-header">
              <span class="opportunity-conviction ${o.conviction}">${o.conviction}</span>
              <span class="opportunity-text">${o.opportunity}</span>
              ${o.timeframe ? `<span class="opportunity-timeframe">${o.timeframe}</span>` : ''}
            </div>
            ${o.rationale ? `<div class="opportunity-rationale">${o.rationale}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : (trades.length ? `
    <div class="thesis-section collapsible" data-section="trades">
      <div class="thesis-section-title" onclick="toggleThesisSection('trades', event)">
        Trade Recommendations (${trades.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${trades.map(tr => typeof tr === 'string' ? `<div class="trade-item">${tr}</div>` : `
          <div class="trade-item">
            <div class="trade-idea">${tr.idea} <span class="trade-conviction ${tr.conviction}">${tr.conviction}</span></div>
            ${tr.rationale ? `<div class="trade-rationale">${tr.rationale}</div>` : ''}
            <div class="trade-levels">
              ${tr.entry ? `Entry: ${tr.entry}` : ''} ${tr.target ? `| Target: ${tr.target}` : ''} ${tr.stop ? `| Stop: ${tr.stop}` : ''}
            </div>
            ${tr.timeframe ? `<div class="trade-timeframe">Timeframe: ${tr.timeframe}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '');

  // Risk matrix
  const risks = t.riskMatrix || t.risks || [];
  const risksHtml = risks.length ? `
    <div class="thesis-section collapsible" data-section="risks">
      <div class="thesis-section-title" onclick="toggleThesisSection('risks', event)">
        Risks (${risks.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${risks.map(r => typeof r === 'string' ? `<div class="risk-item">${r}</div>` : `
          <div class="risk-item">
            <div class="risk-header">
              <span class="risk-name">${r.risk}</span>
              <span class="risk-prob ${r.probability}">P: ${r.probability}</span>
              <span class="risk-impact ${r.impact}">I: ${r.impact}</span>
            </div>
            ${r.trigger ? `<div class="risk-trigger">Trigger: ${r.trigger}</div>` : ''}
            ${r.hedge ? `<div class="risk-hedge">Hedge: ${r.hedge}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // Contraindicators
  const contraHtml = t.contraindicators?.length ? `
    <div class="thesis-section">
      <div class="thesis-section-title">Thesis Invalidators</div>
      <div class="thesis-section-content contra">${t.contraindicators.join('; ')}</div>
    </div>` : '';

  // Raw signal summary (collapsed by default)
  const rawSummaryHtml = t.rawSignalSummary ? `
    <div class="thesis-section collapsible collapsed" data-section="raw">
      <div class="thesis-section-title" onclick="toggleThesisSection('raw', event)">
        Raw Signal Summary <span class="collapse-icon">▶</span>
      </div>
      <div class="thesis-section-body hidden">
        <div class="thesis-raw-summary">${t.rawSignalSummary}</div>
      </div>
    </div>` : '';

  // Backward compat: old market analysis section
  const marketAnalysis = t.marketAnalysis;
  const oldMarketHtml = !ms && marketAnalysis ? `
    <div class="thesis-section collapsible" data-section="market">
      <div class="thesis-section-title" onclick="toggleThesisSection('market', event)">
        Market Analysis <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${marketAnalysis.currentState ? `<div class="thesis-row"><span class="thesis-label">Current State:</span><span class="thesis-value">${marketAnalysis.currentState}</span></div>` : ''}
        ${marketAnalysis.keyDrivers?.length ? `<div class="thesis-row"><span class="thesis-label">Key Drivers:</span><span class="thesis-value">${marketAnalysis.keyDrivers.join('; ')}</span></div>` : ''}
        ${marketAnalysis.technicalPicture ? `<div class="thesis-row"><span class="thesis-label">Technicals:</span><span class="thesis-value">${marketAnalysis.technicalPicture}</span></div>` : ''}
        ${marketAnalysis.sentimentReading ? `<div class="thesis-row"><span class="thesis-label">Sentiment:</span><span class="thesis-value">${marketAnalysis.sentimentReading}</span></div>` : ''}
        ${marketAnalysis.intermarketSignals ? `<div class="thesis-row"><span class="thesis-label">Intermarket:</span><span class="thesis-value">${marketAnalysis.intermarketSignals}</span></div>` : ''}
      </div>
    </div>` : '';

  // Backward compat: old volatility analysis
  const volAnalysis = t.volatilityAnalysis || t.volatilityView;
  const volHtml = volAnalysis ? `
    <div class="thesis-section collapsible" data-section="vol">
      <div class="thesis-section-title" onclick="toggleThesisSection('vol', event)">
        Volatility Analysis <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        <div class="thesis-row">
          <span class="thesis-label">Level:</span>
          <span class="thesis-value">${volAnalysis.currentLevel || volAnalysis.level} / ${volAnalysis.direction}</span>
        </div>
        ${volAnalysis.termStructure ? `<div class="thesis-row"><span class="thesis-label">Term Structure:</span><span class="thesis-value">${volAnalysis.termStructure}</span></div>` : ''}
        ${volAnalysis.skew ? `<div class="thesis-row"><span class="thesis-label">Skew:</span><span class="thesis-value">${volAnalysis.skew}</span></div>` : ''}
        <div class="thesis-row"><span class="thesis-label">Strategy:</span><span class="thesis-value">${volAnalysis.strategy}</span></div>
        ${volAnalysis.trades?.length ? `<div class="thesis-row"><span class="thesis-label">Vol Trades:</span><span class="thesis-value">${volAnalysis.trades.join('; ')}</span></div>` : ''}
      </div>
    </div>` : '';

  // Backward compat: old catalyst calendar (if not in nearTerm)
  const catalysts = !nt ? (t.catalystCalendar || t.catalysts || []) : [];
  const oldCatalystsHtml = catalysts.length ? `
    <div class="thesis-section collapsible" data-section="catalysts">
      <div class="thesis-section-title" onclick="toggleThesisSection('catalysts', event)">
        Catalysts (${catalysts.length}) <span class="collapse-icon">▼</span>
      </div>
      <div class="thesis-section-body">
        ${catalysts.map(c => typeof c === 'string' ? `<div class="catalyst-item">${c}</div>` : `
          <div class="catalyst-item">
            <span class="catalyst-date">${c.date}</span>
            <span class="catalyst-event">${c.event}</span>
            <span class="catalyst-impact ${c.impact}">${c.impact}</span>
            ${c.tradingImplication ? `<div class="catalyst-impl">${c.tradingImplication}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // Backward compat: factor tilts
  const factors = t.factorTilts;
  const factorHtml = factors ? `
    <div class="thesis-row">
      <span class="thesis-label">Factor Tilts:</span>
      <span class="thesis-value">${factors.style?.tilt || factors.style} | ${factors.size?.tilt || factors.size} | ${factors.geography?.tilt || factors.geography}</span>
    </div>` : '';

  card.innerHTML = `
    <div class="thesis-header" onclick="toggleOverallThesis()">
      <span class="thesis-regime ${t.regime}">${t.regime?.toUpperCase()}</span>
      <span class="thesis-bias ${t.bias}">${t.bias?.toUpperCase()}</span>
      <span class="thesis-conviction ${convictionClass}" title="Conviction ${conviction}/10">${conviction}/10</span>
      <span class="thesis-version">v${thesis.version} · ${thesis.signals_count} signals${t.timeHorizon ? ` · ${t.timeHorizon}` : ''}</span>
      <span class="thesis-collapse-icon">▼</span>
    </div>
    <div class="thesis-body">
      ${overallHtml}
      ${narrativeHtml}
      ${marketStateHtml}
      ${oldMarketHtml}
      ${nearTermHtml}
      ${evolvingHtml}
      ${expectationsHtml}
      ${themesHtml}
      ${sectorsHtml}
      ${tickerHtml}
      ${factorHtml}
      ${volHtml}
      ${levelsHtml}
      ${oldCatalystsHtml}
      ${oppsHtml}
      ${risksHtml}
      ${contraHtml}
      ${rawSummaryHtml}
    </div>`;
}

// Toggle collapsible thesis sections
window.toggleThesisSection = function(section, event) {
  if (event) event.stopPropagation();
  const sectionEl = document.querySelector(`.thesis-section[data-section="${section}"]`);
  if (!sectionEl) return;
  const body = sectionEl.querySelector('.thesis-section-body');
  const icon = sectionEl.querySelector('.collapse-icon');
  if (body && icon) {
    body.classList.toggle('hidden');
    sectionEl.classList.toggle('collapsed');
    icon.textContent = body.classList.contains('hidden') ? '▶' : '▼';
  }
};

// Toggle overall thesis card content (internal collapse)
window.toggleOverallThesis = function() {
  const card = document.getElementById('thesisCard');
  if (!card) return;
  const body = card.querySelector('.thesis-body');
  const icon = card.querySelector('.thesis-collapse-icon');
  if (body && icon) {
    body.classList.toggle('hidden');
    card.classList.toggle('collapsed');
    icon.textContent = body.classList.contains('hidden') ? '▶' : '▼';
  }
};

// Toggle entire thesis card visibility
function toggleThesisCard() {
  const wrapper = document.getElementById('thesisSectionWrapper');
  const card = document.getElementById('thesisCard');
  const icon = document.getElementById('thesisToggleIcon');
  if (!wrapper || !card || !icon) return;

  const isHidden = card.classList.toggle('hidden');
  wrapper.classList.toggle('collapsed', isHidden);
  icon.textContent = isHidden ? '▶' : '▼';
}

// Set up thesis section header click handler
document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('thesisSectionHeader');
  if (header) {
    header.addEventListener('click', toggleThesisCard);
  }
});

// Get current thesis for use in prompts
export function getCurrentThesis() {
  return currentThesis;
}

// Auto-sync: check staleness and trigger full sync if needed
let autoSyncInProgress = false;

async function checkAndAutoSync() {
  if (autoSyncInProgress) return;

  try {
    const thesis = await getThesis();
    if (!thesis?.updated_at) {
      // No thesis at all — trigger sync
      triggerAutoSync('No thesis yet');
      return;
    }

    const lastUpdate = new Date(thesis.updated_at);
    const hoursAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);

    // Auto-sync if thesis is older than 4 hours
    if (hoursAgo > 4) {
      triggerAutoSync(`Thesis ${Math.floor(hoursAgo)}h stale`);
    }
  } catch (e) {
    console.error('[AUTO-SYNC] Check failed:', e.message);
  }
}

async function triggerAutoSync(reason) {
  autoSyncInProgress = true;
  const btn = document.getElementById('fullSyncBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⚡ Auto-syncing...';
  }

  console.log(`[AUTO-SYNC] Triggered: ${reason}`);
  showToast(`Auto-syncing: ${reason}...`);

  try {
    const result = await feedFetch('/api/feed/sync', { method: 'POST' });
    if (result.success) {
      const steps = result.steps || [];
      const thesis = steps.find(s => s.step === 'thesis');
      showToast(`Auto-sync done: ${result.summary} (${result.duration})`);
    }
    // Reload data after sync
    await reloadFeedData();
  } catch (e) {
    console.error('[AUTO-SYNC] Failed:', e.message);
  } finally {
    autoSyncInProgress = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Sync All';
    }
  }
}

async function reloadFeedData() {
  const container = document.getElementById('feedList');
  try {
    const response = await getFeedItems();
    feedItems = Array.isArray(response) ? response : (response.results || response.data || []);
    if (!Array.isArray(feedItems)) feedItems = [];
    if (container) renderFeed(container);
    updateFeedStats();
    loadThesis();
    loadLatestNewsReport();
  } catch (e) {
    console.error('[RELOAD] Failed:', e.message);
  }
}

// Load and render feed
export async function loadFeed() {
  const container = document.getElementById('feedList');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading feed...</div>';

  try {
    const response = await getFeedItems();
    feedItems = Array.isArray(response) ? response : (response.results || response.data || []);

    if (!Array.isArray(feedItems)) {
      feedItems = [];
    }

    renderFeed(container);
    updateFeedStats();
    loadThesis();
    loadLatestNewsReport();
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load feed: ${e.message}</div>`;
  }
}

function renderFeed(container) {
  const items = feedItems || [];

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div class="empty-text">No signals yet</div>
        <div class="empty-hint">Tap + to capture tweets, charts, or insights</div>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => renderFeedItem(item)).join('');
}

// Rewrite legacy workers.dev URLs to new custom domain
function rewriteImageUrl(url) {
  if (!url) return url;
  return url.replace('https://vhunter-proxy.vhunter.workers.dev/', 'https://vapi.heymira.co/');
}

function parseJsonField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field.map(rewriteImageUrl);
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed.map(rewriteImageUrl) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(field) {
  if (!field) return null;
  if (typeof field === 'object') return field;
  try {
    return JSON.parse(field);
  } catch {
    return null;
  }
}

function renderFeedItem(item) {
  if (!item) return '';

  const timeAgo = getTimeAgo(item.created_at);
  const sourceIcon = getSourceIcon(item.source_type);
  const images = parseJsonField(item.image_urls);
  const insight = parseJsonObject(item.insight_data);

  // Extract author from x.com URL if no author is set
  const author = item.author || extractAuthorFromUrl(item.url) || item.source_type;

  const imageHtml = images.length ? `
    <div class="feed-images-carousel">
      ${images.map(url => `<a href="${url}" target="_blank" class="feed-thumb"><img src="${url}" alt="chart" loading="lazy"></a>`).join('')}
    </div>` : '';

  const insightHtml = insight ? `
    <div class="feed-insight">
      <div class="insight-header">
        <span class="insight-direction ${insight.direction}">${insight.direction}</span>
        <span class="insight-theme">${insight.theme}</span>
        <span class="insight-conviction ${insight.conviction}">${insight.conviction}</span>
        ${insight.timeframe ? `<span class="insight-timeframe">${insight.timeframe}</span>` : ''}
      </div>
      <div class="insight-signal">${insight.signal}</div>
      ${insight.tickers?.length ? `<div class="insight-tickers">${insight.tickers.map(t => `<span class="insight-ticker" onclick="analyzeTicker('${t}')">${t}</span>`).join('')}</div>` : ''}
      ${insight.tradingImplication ? `<div class="insight-trade"><strong>Trade:</strong> ${insight.tradingImplication}</div>` : ''}
      ${insight.dataPoints?.levels?.length ? `<div class="insight-levels"><strong>Levels:</strong> ${insight.dataPoints.levels.join(', ')}</div>` : ''}
      ${insight.dataPoints?.flows ? `<div class="insight-flows"><strong>Flow:</strong> ${insight.dataPoints.flows}</div>` : ''}
      ${insight.catalyst ? `<div class="insight-catalyst"><strong>Catalyst:</strong> ${insight.catalyst}</div>` : ''}
      ${insight.riskToSignal ? `<div class="insight-risk"><strong>Invalidates if:</strong> ${insight.riskToSignal}</div>` : ''}
      ${insight.chartAnalysis ? `<div class="insight-chart">${insight.chartAnalysis.pattern ? `<span class="chart-pattern">${insight.chartAnalysis.pattern}</span>` : ''}${insight.chartAnalysis.trend ? ` <span class="chart-trend">${insight.chartAnalysis.trend}</span>` : ''}${insight.chartAnalysis.technicalNote ? ` - ${insight.chartAnalysis.technicalNote}` : ''}</div>` : ''}
    </div>` : '';

  const newsClass = item.source_type === 'news' ? ' news-source' : '';

  return `
    <div class="feed-item ${item.status}${newsClass}" data-id="${item.id}">
      <div class="feed-header">
        <span class="feed-source">${sourceIcon} ${author}</span>
        <span class="feed-time">${timeAgo}</span>
        <button class="feed-menu" onclick="toggleFeedMenu('${item.id}')">⋮</button>
      </div>
      <div class="feed-content">${truncateText(item.content, item.id)}</div>
      ${imageHtml}
      ${insightHtml}
      <div class="feed-meta">
        <span class="feed-status ${item.status}">${item.status}</span>
      </div>
      <div class="feed-actions hidden" id="menu-${item.id}">
        <button onclick="editFeedItem('${item.id}')">Edit</button>
        <button onclick="deleteFeedItemConfirm('${item.id}')" class="danger">Delete</button>
      </div>
    </div>`;
}

function getSourceIcon(type) {
  const icons = { tweet: '🐦', blog: '📝', chart: '📊', link: '🔗', news: '📰' };
  return icons[type] || '📌';
}

function getTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const TRUNCATE_LENGTH = 280;

function truncateText(text, id) {
  if (!text || text.length <= TRUNCATE_LENGTH) {
    return escapeHtml(text);
  }
  const truncated = text.slice(0, TRUNCATE_LENGTH);
  return `<span class="feed-text-truncated" id="text-${id}">${escapeHtml(truncated)}...</span><span class="feed-text-full hidden" id="full-${id}">${escapeHtml(text)}</span><div class="feed-toggle-wrap"><button class="feed-toggle-btn" onclick="toggleFeedText('${id}')">show more</button></div>`;
}

function extractAuthorFromUrl(url) {
  if (!url) return null;
  const match = url.match(/(?:x\.com|twitter\.com)\/([^\/\?]+)/i);
  if (match && match[1] && !['home', 'search', 'explore', 'i', 'intent'].includes(match[1].toLowerCase())) {
    return '@' + match[1];
  }
  return null;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function formatThesisTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Full pipeline: Scrape → Extract → Thesis → Memory Extract → Memory Match
window.triggerFullSync = async function(event) {
  if (event) event.stopPropagation();
  const btn = document.getElementById('fullSyncBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⚡ Scraping...';
  }

  try {
    const result = await feedFetch('/api/feed/sync', { method: 'POST' });

    if (result.success) {
      // Show step-by-step results
      const steps = result.steps || [];
      const parts = [];
      const scrape = steps.find(s => s.step === 'scrape');
      const extract = steps.find(s => s.step === 'extract');
      const thesis = steps.find(s => s.step === 'thesis');
      const memExtract = steps.find(s => s.step === 'memory_extract');
      const memMatch = steps.find(s => s.step === 'memory_match');

      if (scrape?.captured) parts.push(`${scrape.captured} tweets`);
      if (extract?.processed) parts.push(`${extract.processed} signals`);
      if (thesis?.success) parts.push(`thesis v${thesis.version}`);
      if (memExtract?.extracted) parts.push(`${memExtract.extracted} memories`);
      if (memMatch?.matched) parts.push(`${memMatch.matched} matched`);

      showToast(`Sync: ${parts.join(' → ') || 'up to date'} (${result.duration})`);
    } else {
      showToast(result.error || 'Sync failed');
    }

    // Reload everything
    await loadFeed();
  } catch (e) {
    showToast('Sync failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Sync All';
    }
  }
};

window.triggerThesisRegen = async function(event) {
  if (event) event.stopPropagation();
  const btn = document.getElementById('regenThesisBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '↻ Fetching data & regenerating...';
  }

  try {
    const macroSnapshot = getMacroSnapshot();
    const result = await regenerateThesis(macroSnapshot);
    if (result.success) {
      showToast(`Thesis updated to v${result.version}`);
    } else {
      showToast(result.message || result.error || 'Thesis update failed');
    }
    await loadThesis();
  } catch (e) {
    showToast('Failed to regenerate: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '↻ Regen Thesis';
    }
  }
};

// Modal functions
export function openFeedModal(editId = null) {
  const modal = document.getElementById('feedModal');
  const form = document.getElementById('feedForm');
  const title = document.getElementById('feedModalTitle');

  form.reset();
  document.getElementById('feedId').value = '';
  document.getElementById('feedImagePreview').innerHTML = '';
  window.pendingImages = [];

  if (editId) {
    const item = feedItems.find(i => i.id === editId);
    if (item) {
      title.textContent = 'Edit Signal';
      document.getElementById('feedId').value = item.id;
      document.getElementById('feedType').value = item.source_type || 'tweet';
      document.getElementById('feedAuthor').value = item.author || '';
      document.getElementById('feedContent').value = item.content || '';
      document.getElementById('feedUrl').value = item.url || '';

      // Show existing images
      const existingImages = parseJsonField(item.image_urls);
      if (existingImages.length) {
        window.pendingImages = existingImages;
        renderImagePreview();
      }
    }
  } else {
    title.textContent = 'New Signal';
  }

  modal.classList.add('active');
}

export function closeFeedModal() {
  document.getElementById('feedModal').classList.remove('active');
}

export async function saveFeedItem(event) {
  event.preventDefault();

  const id = document.getElementById('feedId').value;
  const images = window.pendingImages && window.pendingImages.length > 0 ? [...window.pendingImages] : null;

  const item = {
    source_type: document.getElementById('feedType').value,
    author: document.getElementById('feedAuthor').value || null,
    content: document.getElementById('feedContent').value,
    url: document.getElementById('feedUrl').value || null,
    image_urls: images
  };

  try {
    if (id) {
      await updateFeedItem(id, item);
    } else {
      await addFeedItem(item);
    }
    closeFeedModal();
    loadFeed();
  } catch (e) {
    alert('Error saving: ' + e.message);
  }
}

// Image handling
let uploading = false;

async function optimizeImage(file) {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp'
  };

  try {
    const originalSize = file.size;
    const compressed = await imageCompression(file, options);
    console.log(`Image optimized: ${Math.round(originalSize / 1024)}KB → ${Math.round(compressed.size / 1024)}KB`);
    return compressed;
  } catch (e) {
    console.warn('Image compression failed, using original:', e);
    return file;
  }
}

export async function handleImageUpload(event) {
  const files = event.target.files;
  if (!files.length) return;

  const preview = document.getElementById('feedImagePreview');
  const saveBtn = document.querySelector('#feedForm button[type="submit"]');
  window.pendingImages = window.pendingImages || [];

  uploading = true;
  if (saveBtn) saveBtn.disabled = true;

  for (const file of files) {
    preview.innerHTML = '<div class="upload-progress">Optimizing & uploading...</div>';

    try {
      const optimizedFile = await optimizeImage(file);
      const result = await uploadImage(optimizedFile);
      if (result.error) {
        alert('Upload error: ' + result.error);
      } else if (result.url) {
        window.pendingImages.push(result.url);
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
    }
  }

  uploading = false;
  if (saveBtn) saveBtn.disabled = false;
  renderImagePreview();
}

function renderImagePreview() {
  const preview = document.getElementById('feedImagePreview');
  preview.innerHTML = window.pendingImages.map((url, i) => `
    <div class="preview-img">
      <img src="${url}" alt="preview">
      <button type="button" onclick="removePreviewImage(${i})">×</button>
    </div>
  `).join('');
}

// Global functions for onclick handlers
window.openFeedModal = openFeedModal;
window.closeFeedModal = closeFeedModal;
window.saveFeedItem = saveFeedItem;
window.handleImageUpload = handleImageUpload;

window.removePreviewImage = function(index) {
  window.pendingImages.splice(index, 1);
  renderImagePreview();
};

window.toggleFeedMenu = function(id) {
  const menu = document.getElementById(`menu-${id}`);
  menu.classList.toggle('hidden');
};

window.toggleFeedText = function(id) {
  const truncated = document.getElementById(`text-${id}`);
  const full = document.getElementById(`full-${id}`);
  const container = truncated?.closest('.feed-content');
  const btn = container?.querySelector('.feed-toggle-btn');
  if (truncated && full && btn) {
    const isExpanded = !full.classList.contains('hidden');
    truncated.classList.toggle('hidden', !isExpanded);
    full.classList.toggle('hidden', isExpanded);
    btn.textContent = isExpanded ? 'show more' : 'show less';
  }
};

window.editFeedItem = function(id) {
  openFeedModal(id);
};

window.deleteFeedItemConfirm = async function(id) {
  if (confirm('Delete this signal?')) {
    await deleteFeedItem(id);
    loadFeed();
  }
};

window.analyzeTicker = function(ticker) {
  document.getElementById('tk').value = ticker;
  if (runCallback) runCallback();
  if (window.switchPage) window.switchPage('analyze');
};

window.filterFeed = function(type) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type) || (type === 'all' && btn.textContent === 'All'));
  });

  const container = document.getElementById('feedList');
  const items = feedItems || [];

  if (type === 'all') {
    container.innerHTML = items.length ? items.map(item => renderFeedItem(item)).join('') : '<div class="empty-state"><div class="empty-text">No signals yet</div></div>';
  } else {
    const filtered = items.filter(item => item.source_type === type);
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-text">No ${type}s yet</div></div>`;
    } else {
      container.innerHTML = filtered.map(item => renderFeedItem(item)).join('');
    }
  }
};

// News Report functions
async function generateNewsReportAPI() {
  return feedFetch('/api/news/report', { method: 'POST' });
}

async function fetchLatestReport() {
  return feedFetch('/api/news/report/latest');
}

// Auto-load the latest saved report on page init
export async function loadLatestNewsReport() {
  const card = document.getElementById('newsReportCard');
  if (!card) return;

  try {
    const result = await fetchLatestReport();
    if (result.success && result.report) {
      card.classList.remove('hidden');
      const wrapper = document.getElementById('newsReportWrapper');
      wrapper?.classList.remove('collapsed');
      const icon = document.getElementById('newsReportToggleIcon');
      if (icon) icon.textContent = '▼';
      renderNewsReport(card, result.report, result.meta);
    }
  } catch (e) {
    // Silently fail - user can still click Refresh
  }
}

window.generateNewsReport = async function() {
  const btn = document.getElementById('newsRefreshBtn');
  const card = document.getElementById('newsReportCard');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Searching...';
  }

  card?.classList.remove('hidden');
  const wrapper = document.getElementById('newsReportWrapper');
  wrapper?.classList.remove('collapsed');
  const icon = document.getElementById('newsReportToggleIcon');
  if (icon) icon.textContent = '▼';

  if (card) card.innerHTML = '<div class="news-report-loading">Searching global news...</div>';

  try {
    const result = await generateNewsReportAPI();
    if (result.success && result.report) {
      renderNewsReport(card, result.report, result.meta);
    } else {
      card.innerHTML = `<div class="news-report-empty">Failed to generate report: ${result.error || 'Unknown error'}</div>`;
    }
  } catch (e) {
    if (card) card.innerHTML = `<div class="news-report-empty">Error: ${e.message}</div>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }
  }
};

function formatReportTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const CATEGORY_LABELS = {
  fed: 'FED', politics: 'POLITICS', deal: 'DEAL',
  earnings: 'EARNINGS', event: 'EVENT', risk: 'RISK',
  geopolitical: 'GEO', trade: 'TRADE'
};

const URGENCY_LABELS = {
  breaking: 'BREAKING', today: 'TODAY', watch: 'WATCH'
};

function renderNewsReport(container, report, meta) {
  if (!container || !report) return;

  const items = report.items || [];
  const upcoming = report.upcoming || [];

  const itemsHtml = items.map(item => `
    <div class="news-item news-urgency-${item.urgency}">
      <div class="news-item-tags">
        <span class="news-urgency-badge ${item.urgency}">${URGENCY_LABELS[item.urgency] || item.urgency}</span>
        <span class="news-category-badge ${item.category}">${CATEGORY_LABELS[item.category] || item.category}</span>
      </div>
      <div class="news-item-title">${escapeHtml(item.title)}</div>
      <div class="news-item-detail">${escapeHtml(item.detail)}</div>
      ${item.tickers?.length ? `<div class="news-item-tickers">${item.tickers.map(t => `<span class="insight-ticker" onclick="analyzeTicker('${t}')">${t}</span>`).join('')}</div>` : ''}
      ${item.source ? `<div class="news-item-source">${escapeHtml(item.source)}</div>` : ''}
    </div>
  `).join('');

  const upcomingHtml = upcoming.map(ev => `
    <div class="news-upcoming-event">
      <span class="news-upcoming-date">${escapeHtml(ev.date)}</span>
      <span class="news-upcoming-name">${escapeHtml(ev.event)}</span>
      <span class="news-upcoming-impact">${escapeHtml(ev.impact)}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="news-report-content">
      ${items.length === 0 ? '<div class="news-report-empty">No critical developments in this period</div>' : itemsHtml}

      ${upcomingHtml ? `
        <div class="news-section">
          <div class="news-section-title">Upcoming Events</div>
          ${upcomingHtml}
        </div>` : ''}

      ${meta?.generatedAt ? `<div class="news-report-meta">${formatReportTime(meta.generatedAt)}</div>` : ''}
    </div>
  `;
}

// Toggle news report section
document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('newsReportHeader');
  if (header) {
    header.addEventListener('click', (e) => {
      // Don't toggle when clicking controls
      if (e.target.closest('.news-report-controls')) return;
      const card = document.getElementById('newsReportCard');
      const icon = document.getElementById('newsReportToggleIcon');
      const wrapper = document.getElementById('newsReportWrapper');
      if (card && icon) {
        const isHidden = card.classList.toggle('hidden');
        wrapper?.classList.toggle('collapsed', isHidden);
        icon.textContent = isHidden ? '▶' : '▼';
      }
    });
  }
});

// Update stats when feed loads
function updateFeedStats() {
  const items = feedItems || [];
  const total = items.length;
  const raw = items.filter(i => i.status === 'raw').length;
  const processed = items.filter(i => i.status === 'processed').length;

  const totalEl = document.getElementById('feedTotal');
  const rawEl = document.getElementById('feedRaw');
  const processedEl = document.getElementById('feedProcessed');

  if (totalEl) totalEl.textContent = total;
  if (rawEl) rawEl.textContent = raw;
  if (processedEl) processedEl.textContent = processed;
}
