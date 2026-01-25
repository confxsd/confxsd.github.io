/**
 * Opportunities Page Module
 * Displays and manages trading opportunities extracted from feed signals
 */

import { CONFIG } from './config.js';
import { scoreOpportunity, formatScore, getScoreBreakdown, shouldValidateWithAI } from './signal-scorer.js';

let currentOpportunities = [];
let currentThesis = null;
let runCallback = null;

export function setRunCallback(cb) {
  runCallback = cb;
}

/**
 * Load opportunities and render the page
 */
export async function loadOpportunities() {
  const status = document.getElementById('oppStatusFilter')?.value || 'active';

  try {
    // Fetch opportunities and dashboard in parallel
    const [opportunities, dashboard, thesis] = await Promise.all([
      fetchOpportunities(status),
      fetchDashboard(),
      fetchThesis()
    ]);

    currentOpportunities = opportunities;
    currentThesis = thesis;

    renderDashboard(dashboard);
    renderTopTickers(dashboard.topTickers || []);
    renderOpportunities(opportunities);
    updateAlertBadge();

  } catch (e) {
    console.error('Failed to load opportunities:', e);
    showEmptyState('Failed to load opportunities');
  }
}

/**
 * Extract opportunities from processed feed signals
 */
window.extractOpportunities = async function() {
  const btn = document.getElementById('extractOppsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extracting...';
  }

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/opportunities/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
      }
    });

    const result = await response.json();

    if (result.success) {
      alert(`Extracted ${result.extracted} opportunities from ${result.processed} signals`);
      loadOpportunities();
    } else {
      alert('Extraction failed: ' + (result.error || 'Unknown error'));
    }

  } catch (e) {
    console.error('Extract failed:', e);
    alert('Failed to extract: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Extract';
    }
  }
};

/**
 * Enhance opportunities with live market data (uses Sonnet)
 */
window.enhanceOpportunities = async function() {
  const btn = document.getElementById('enhanceOppsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Enhancing...';
  }

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/opportunities/enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
      }
    });

    const result = await response.json();

    if (result.success) {
      alert(`Enhanced ${result.enhanced}/${result.total} opportunities with live market data`);
      loadOpportunities();
    } else {
      alert('Enhancement failed: ' + (result.error || result.message || 'Unknown error'));
    }

  } catch (e) {
    console.error('Enhance failed:', e);
    alert('Failed to enhance: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enhance';
    }
  }
};

/**
 * Rescore all active opportunities
 */
window.rescoreOpportunities = async function() {
  const btn = document.getElementById('rescoreBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Rescoring...';
  }

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/opportunities/rescore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
      }
    });

    const result = await response.json();

    if (result.success) {
      alert(`Rescored ${result.rescored} opportunities`);
      loadOpportunities();
    }

  } catch (e) {
    console.error('Rescore failed:', e);
    alert('Failed to rescore: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Rescore';
    }
  }
};

/**
 * Validate a single opportunity with AI
 */
window.validateOpportunity = async function(id) {
  const card = document.querySelector(`[data-opp-id="${id}"]`);
  if (card) {
    card.classList.add('validating');
  }

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/opportunities/${id}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
      }
    });

    const result = await response.json();

    if (result.success && result.validation) {
      // Update the card with validation result
      const validationEl = card?.querySelector('.opp-validation');
      if (validationEl) {
        validationEl.innerHTML = renderValidation(result.validation);
        validationEl.style.display = 'block';
      }
    }

  } catch (e) {
    console.error('Validation failed:', e);
  } finally {
    if (card) {
      card.classList.remove('validating');
    }
  }
};

// ============== API CALLS ==============

async function fetchOpportunities(status = 'active') {
  const response = await fetch(
    `${CONFIG.PROXY_URL}/api/opportunities?status=${status}&limit=50`,
    {
      headers: {
        'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
      }
    }
  );
  return response.json();
}

async function fetchDashboard() {
  const response = await fetch(
    `${CONFIG.PROXY_URL}/api/opportunities/dashboard`,
    {
      headers: {
        'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
      }
    }
  );
  return response.json();
}

async function fetchThesis() {
  try {
    const response = await fetch(
      `${CONFIG.PROXY_URL}/api/thesis`,
      {
        headers: {
          'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
        }
      }
    );
    const data = await response.json();
    return data?.thesis_data ? JSON.parse(data.thesis_data) : null;
  } catch {
    return null;
  }
}

async function fetchAlerts() {
  const response = await fetch(
    `${CONFIG.PROXY_URL}/api/opportunities/alerts?unread=true`,
    {
      headers: {
        'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
      }
    }
  );
  return response.json();
}

// ============== RENDERING ==============

function renderDashboard(dashboard) {
  const { scoreBuckets = {}, statusBreakdown = {} } = dashboard;

  document.getElementById('oppHot').textContent = scoreBuckets.hot || 0;
  document.getElementById('oppWarm').textContent = scoreBuckets.warm || 0;
  document.getElementById('oppWatch').textContent = scoreBuckets.watch || 0;
  document.getElementById('oppTotal').textContent = statusBreakdown.active || 0;
}

function renderTopTickers(tickers) {
  const container = document.getElementById('oppTickers');
  if (!container) return;

  if (!tickers || tickers.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = tickers.map(t => `
    <span class="opp-ticker-chip" onclick="filterByTicker('${t.ticker}')">
      ${t.ticker}
      <span class="opp-ticker-count">${t.count}</span>
      <span class="opp-ticker-score">${Math.round(t.max_score)}</span>
    </span>
  `).join('');
}

function renderOpportunities(opportunities) {
  const container = document.getElementById('oppList');
  if (!container) return;

  if (!opportunities || opportunities.length === 0) {
    showEmptyState();
    return;
  }

  container.innerHTML = opportunities.map(opp => renderOpportunityCard(opp)).join('');
}

function renderOpportunityCard(opp) {
  const score = formatScore(opp.composite_score || 50);
  const tradeIdea = opp.trade_idea || {};
  const sourceContext = opp.source_context || {};
  const validation = opp.ai_validation;
  const age = getAge(opp.created_at);

  const directionClass = opp.direction === 'long' ? 'direction-long' : 'direction-short';
  const directionIcon = opp.direction === 'long' ? '↑' : '↓';

  // Build source context HTML
  const hasSourceContext = sourceContext.summary || sourceContext.keyDataPoints?.length;
  const sourceContextHtml = hasSourceContext ? `
    <div class="opp-source-context">
      ${sourceContext.summary ? `<div class="opp-source-summary">${sourceContext.summary}</div>` : ''}
      ${sourceContext.keyDataPoints?.length ? `
        <div class="opp-key-data">
          ${sourceContext.keyDataPoints.map(dp => `<span class="opp-data-point">${dp}</span>`).join('')}
        </div>
      ` : ''}
      ${sourceContext.optionsAnalysis && sourceContext.optionsAnalysis !== 'N/A' && sourceContext.optionsAnalysis !== 'none' ? `
        <div class="opp-context-detail"><strong>Options:</strong> ${sourceContext.optionsAnalysis}</div>
      ` : ''}
      ${sourceContext.technicalSetup && sourceContext.technicalSetup !== 'N/A' && sourceContext.technicalSetup !== 'none' ? `
        <div class="opp-context-detail"><strong>Technicals:</strong> ${sourceContext.technicalSetup}</div>
      ` : ''}
      ${sourceContext.sourceExcerpt ? `
        <div class="opp-source-excerpt">"${sourceContext.sourceExcerpt}"</div>
      ` : ''}
    </div>
  ` : '';

  return `
    <div class="opp-card ${score.class}" data-opp-id="${opp.id}">
      <div class="opp-header">
        <div class="opp-ticker-dir">
          <span class="opp-ticker">${opp.ticker}</span>
          <span class="opp-direction ${directionClass}">${directionIcon} ${opp.direction?.toUpperCase()}</span>
        </div>
      </div>

      <div class="opp-content">
        <div class="opp-trade-idea">
          ${tradeIdea.instrument ? `<span class="opp-instrument">${tradeIdea.instrument}</span>` : ''}
          ${tradeIdea.entry?.condition ? `<span class="opp-entry">${tradeIdea.entry.condition}</span>` : ''}
          ${tradeIdea.target ? `<span class="opp-target">→ ${tradeIdea.target}</span>` : ''}
          ${tradeIdea.stop ? `<span class="opp-stop">✕ ${tradeIdea.stop}</span>` : ''}
        </div>
        ${tradeIdea.rationale ? `<div class="opp-rationale">${tradeIdea.rationale}</div>` : ''}
        ${sourceContextHtml}
        <div class="opp-meta">
          <span class="opp-type">${opp.signal_type || 'signal'}</span>
          <span class="opp-timeframe">${tradeIdea.timeframe || '--'}</span>
          <span class="opp-age">${age}</span>
          ${opp.status !== 'active' ? `<span class="opp-status opp-status-${opp.status}">${opp.status}</span>` : ''}
        </div>
        ${validation ? `<div class="opp-validation">${renderValidation(validation)}</div>` : ''}
      </div>

      <div class="opp-right">
        <div class="opp-score-container">
          <span class="opp-score ${score.class}">${score.value}</span>
          <span class="opp-score-label">${score.label}</span>
        </div>
        <div class="opp-actions">
          <button class="btn-small" onclick="validateOpportunity('${opp.id}')">Validate</button>
          <button class="btn-small btn-icon" onclick="showScoreBreakdown('${opp.id}')">📊</button>
        </div>
      </div>
    </div>
  `;
}

function renderValidation(validation) {
  // Handle enhanced AI assessment format
  if (validation.recommendation) {
    const statusClass = {
      'FRESH': 'valid-fresh',
      'PARTIAL': 'valid-partial',
      'MISSED': 'valid-missed',
      'INVALID': 'valid-invalid'
    }[validation.status] || '';

    const recClass = {
      'TAKE': 'rec-take',
      'WAIT': 'rec-wait',
      'PASS': 'rec-pass',
      'CLOSE': 'rec-close'
    }[validation.recommendation] || '';

    return `
      <div class="validation-result ${statusClass}">
        <span class="validation-status">${validation.status}</span>
        <span class="validation-rec ${recClass}">${validation.recommendation}</span>
        ${validation.adjustedEntry && validation.adjustedEntry !== 'AS_IS' ?
          `<span class="validation-entry">Entry: ${validation.adjustedEntry}</span>` : ''}
      </div>
      ${validation.note ? `<div class="validation-note">${validation.note}</div>` : ''}
    `;
  }

  // Original validation format
  const statusClass = {
    'FRESH': 'valid-fresh',
    'PARTIAL': 'valid-partial',
    'MISSED': 'valid-missed',
    'INVALIDATED': 'valid-invalid'
  }[validation.status] || '';

  return `
    <div class="validation-result ${statusClass}">
      <span class="validation-status">${validation.status}</span>
      <span class="validation-alignment">${validation.alignment}</span>
      <span class="validation-risk">Risk: ${validation.risk}</span>
      ${validation.adjustedEntry && validation.adjustedEntry !== 'AS_IS' ?
        `<span class="validation-entry">Entry: ${validation.adjustedEntry}</span>` : ''}
    </div>
    ${validation.note ? `<div class="validation-note">${validation.note}</div>` : ''}
  `;
}

function showEmptyState(message) {
  const container = document.getElementById('oppList');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🎯</div>
      <div class="empty-text">${message || 'No opportunities yet'}</div>
      <div class="empty-hint">Extract opportunities from Feed signals</div>
    </div>
  `;
}

// ============== HELPERS ==============

function getAge(createdAt) {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  const now = new Date();
  const hours = Math.round((now - created) / (1000 * 60 * 60));

  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

window.filterByTicker = function(ticker) {
  // Filter opportunities by ticker
  const filtered = currentOpportunities.filter(o => o.ticker === ticker);
  renderOpportunities(filtered);
};

window.showScoreBreakdown = function(id) {
  const opp = currentOpportunities.find(o => o.id === id);
  if (!opp) return;

  const breakdown = [
    { name: 'Novelty', value: opp.novelty_score || 50 },
    { name: 'Alignment', value: opp.alignment_score || 50 },
    { name: 'Validation', value: opp.validation_score || 50 },
    { name: 'Risk/Reward', value: opp.risk_reward_score || 50 },
    { name: 'Timing', value: opp.timing_score || 50 },
    { name: 'Credibility', value: opp.credibility_score || 50 }
  ];

  const html = breakdown.map(s =>
    `<div class="score-row">
      <span class="score-name">${s.name}</span>
      <div class="score-bar">
        <div class="score-fill" style="width: ${s.value}%"></div>
      </div>
      <span class="score-value">${Math.round(s.value)}</span>
    </div>`
  ).join('');

  alert(`Score Breakdown for ${opp.ticker}:\n` +
    breakdown.map(s => `${s.name}: ${Math.round(s.value)}`).join('\n'));
};

async function updateAlertBadge() {
  try {
    const alerts = await fetchAlerts();
    const badge = document.getElementById('oppAlertBadge');
    if (badge) {
      const count = alerts?.length || 0;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  } catch {
    // Ignore alert fetch errors
  }
}

// Periodically update alert badge
setInterval(updateAlertBadge, 60000); // Every minute
