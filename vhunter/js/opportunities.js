/**
 * Opportunities Page Module
 * Displays and manages trading opportunities extracted from feed signals
 * Now includes multi-agent analysis visualization
 */

import { CONFIG } from './config.js';
import { formatScore } from './signal-scorer.js';

let currentOpportunities = [];
let pipelineStatus = null;
let runCallback = null;

// User ID helper
const getUserId = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

export function setRunCallback(cb) {
  runCallback = cb;
}

/**
 * Load opportunities and render the page
 */
export async function loadOpportunities() {
  const status = document.getElementById('oppStatusFilter')?.value || 'active';

  try {
    // Fetch opportunities, dashboard, and pipeline status in parallel
    const [opportunities, dashboard] = await Promise.all([
      fetchOpportunities(status),
      fetchDashboard()
    ]);

    currentOpportunities = opportunities;

    renderDashboard(dashboard);
    renderTopTickers(dashboard.topTickers || []);
    renderOpportunities(opportunities);
    updateAlertBadge();

    // Fetch pipeline status (non-blocking)
    getPipelineStatus();

  } catch (e) {
    console.error('Failed to load opportunities:', e);
    showEmptyState('Failed to load opportunities');
  }
}

/**
 * Run multi-agent pipeline analysis using Durable Object (long-running)
 */
window.runAgentPipeline = async function() {
  const btn = document.getElementById('runAgentsBtn');
  const statusEl = document.getElementById('pipelineStatus');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '🤖 Starting...';
  }

  try {
    // Start the pipeline (returns immediately)
    const startResponse = await fetch(`${CONFIG.PROXY_URL}/api/pipeline/do/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId()
      }
    });

    const startResult = await startResponse.json();

    if (!startResult.success) {
      throw new Error(startResult.error || 'Failed to start pipeline');
    }

    // Poll for completion
    let completed = false;
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes max

    while (!completed && pollCount < maxPolls) {
      await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(`${CONFIG.PROXY_URL}/api/pipeline/do/status`, {
        headers: { 'X-User-Id': getUserId() }
      });

      const status = await statusResponse.json();
      pollCount++;

      // Update button with progress
      if (btn) {
        const phases = {
          'analyst:macro': '🌍 Macro',
          'analyst:sector': '📊 Sector',
          'analyst:technical': '📈 Technical',
          'analyst:quant': '🔢 Quant',
          'pm': '👔 PM Synthesis',
          'opportunities': '💡 Creating',
          'complete': '✅ Complete'
        };
        const phaseLabel = phases[status.phase] || status.phase;
        btn.innerHTML = `🤖 ${phaseLabel} (${status.analystsCompleted}/4)`;
      }

      // Update status element
      if (statusEl) {
        statusEl.innerHTML = `<span class="status-dot ${status.status}"></span> ${status.phase}`;
      }

      if (status.status === 'completed' || status.status === 'failed') {
        completed = true;

        if (status.status === 'completed') {
          alert(`✅ Multi-Agent Pipeline Complete!\n\n` +
            `4 Analysts + Portfolio Manager ran\n` +
            `Opportunities created: ${status.opportunitiesCreated}\n` +
            `Total cost: $${(status.totalCost || 0).toFixed(4)}`);
          loadOpportunities();
        } else {
          alert('Pipeline failed: ' + (status.error || 'Unknown error'));
        }
      }
    }

    if (!completed) {
      alert('Pipeline is still running. Check back in a few minutes.');
    }

  } catch (e) {
    console.error('Pipeline failed:', e);
    alert('Failed to run pipeline: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🤖 Run Agents';
    }
    if (statusEl) {
      statusEl.innerHTML = '';
    }
  }
};

/**
 * Get pipeline status from Durable Object
 */
async function getPipelineStatus() {
  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/pipeline/do/status`, {
      headers: {
        'X-User-Id': getUserId()
      }
    });
    pipelineStatus = await response.json();
    renderPipelineStatus();
  } catch (e) {
    console.error('Failed to get pipeline status:', e);
  }
}

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
        'X-User-Id': getUserId()
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
    { headers: { 'X-User-Id': getUserId() } }
  );
  if (!response.ok) throw new Error(`Fetch opportunities failed: ${response.status}`);
  return response.json();
}

async function fetchDashboard() {
  const response = await fetch(
    `${CONFIG.PROXY_URL}/api/opportunities/dashboard`,
    { headers: { 'X-User-Id': getUserId() } }
  );
  if (!response.ok) throw new Error(`Fetch dashboard failed: ${response.status}`);
  return response.json();
}

async function fetchAlerts() {
  const response = await fetch(
    `${CONFIG.PROXY_URL}/api/opportunities/alerts?unread=true`,
    { headers: { 'X-User-Id': getUserId() } }
  );
  if (!response.ok) throw new Error(`Fetch alerts failed: ${response.status}`);
  return response.json();
}

// ============== RENDERING ==============

function renderDashboard(dashboard) {
  const { scoreBuckets = {}, statusBreakdown = {} } = dashboard;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('oppHot', scoreBuckets.hot || 0);
  setEl('oppWarm', scoreBuckets.warm || 0);
  setEl('oppWatch', scoreBuckets.watch || 0);
  document.getElementById('oppTotal').textContent = statusBreakdown.active || 0;
}

function renderTopTickers(tickers) {
  const container = document.getElementById('oppTickers');
  if (!container) return;

  if (!tickers || tickers.length === 0) {
    container.innerHTML = '';
    return;
  }

  const sanitize = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  container.innerHTML = tickers.map(t => `
    <span class="opp-ticker-chip" onclick="filterByTicker('${sanitize(t.ticker)}')">
      ${sanitize(t.ticker)}
      <span class="opp-ticker-count">${sanitize(t.count)}</span>
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
  const consensus = opp.analyst_consensus || {};
  const age = getAge(opp.created_at);

  const directionClass = opp.direction === 'long' ? 'direction-long' : 'direction-short';
  const directionIcon = opp.direction === 'long' ? '↑' : '↓';

  // Build analyst consensus badges
  const consensusHtml = renderAnalystConsensus(consensus);

  // Build source context HTML
  const hasSourceContext = sourceContext.summary || sourceContext.keyDataPoints?.length || sourceContext.sourceExcerpt;
  const sourceContextHtml = hasSourceContext ? `
    <div class="opp-source-context">
      ${sourceContext.feedAuthor ? `<div class="opp-feed-author">via @${sourceContext.feedAuthor}</div>` : ''}
      ${sourceContext.summary ? `<div class="opp-source-summary">${sourceContext.summary}</div>` : ''}
      ${sourceContext.keyDataPoints?.length ? `
        <div class="opp-key-data">
          ${sourceContext.keyDataPoints.map(dp => `<span class="opp-data-point">${dp}</span>`).join('')}
        </div>
      ` : ''}
      ${sourceContext.optionsAnalysis && sourceContext.optionsAnalysis !== 'N/A' && sourceContext.optionsAnalysis !== 'none' && sourceContext.optionsAnalysis !== 'null' ? `
        <div class="opp-context-detail"><strong>Options:</strong> ${sourceContext.optionsAnalysis}</div>
      ` : ''}
      ${sourceContext.technicalSetup && sourceContext.technicalSetup !== 'N/A' && sourceContext.technicalSetup !== 'none' && sourceContext.technicalSetup !== 'null' ? `
        <div class="opp-context-detail"><strong>Technicals:</strong> ${sourceContext.technicalSetup}</div>
      ` : ''}
      ${sourceContext.catalystDetail && sourceContext.catalystDetail !== 'none' ? `
        <div class="opp-context-detail"><strong>Catalyst:</strong> ${sourceContext.catalystDetail}</div>
      ` : ''}
      ${sourceContext.aiAssessment ? `
        <div class="opp-ai-assessment">
          <span class="opp-rec opp-rec-${(sourceContext.recommendation || '').toLowerCase()}">${sourceContext.recommendation || ''}</span>
          ${sourceContext.aiAssessment}
        </div>
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
        ${consensusHtml}
        <div class="opp-meta">
          <span class="opp-type">${formatSignalType(opp.signal_type)}</span>
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
          ${opp.pm_conviction ? `<span class="opp-conviction opp-conviction-${opp.pm_conviction}">${opp.pm_conviction}</span>` : ''}
        </div>
        <div class="opp-actions">
          <button class="btn-small" onclick="validateOpportunity('${opp.id}')" title="AI Validate">✓</button>
          <button class="btn-small" onclick="showAgentAnalysis('${opp.id}')" title="View Agent Analysis">🤖</button>
          <button class="btn-small" onclick="rerunAgentAnalysis('${opp.id}')" title="Re-run Agent Analysis">🔄</button>
          <button class="btn-small btn-icon" onclick="showScoreBreakdown('${opp.id}')" title="Score Breakdown">📊</button>
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

/**
 * Render analyst consensus badges
 */
function renderAnalystConsensus(consensus) {
  if (!consensus || Object.keys(consensus).length === 0) return '';

  const analysts = [
    { key: 'macro', label: 'Macro' },
    { key: 'sector', label: 'Sector' },
    { key: 'technical', label: 'Technical' },
    { key: 'quant', label: 'Quant' }
  ];

  const badges = analysts.map(a => {
    const status = consensus[a.key];
    const isAnalyzed = status === 'analyzed';
    const isSupporting = (consensus.supporting || []).includes(a.key);
    const badgeClass = isSupporting ? 'analyst-supporting' : isAnalyzed ? 'analyst-analyzed' : 'analyst-skipped';
    return `<span class="analyst-badge ${badgeClass}">${a.label}</span>`;
  }).join('');

  return `<div class="opp-analyst-consensus">${badges}</div>`;
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

function formatSignalType(type) {
  if (!type) return 'Signal';
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

function getAge(createdAt) {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  const now = new Date();
  const hours = Math.round((now - created) / (1000 * 60 * 60));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
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

  alert(`Score Breakdown for ${opp.ticker}:\n` +
    breakdown.map(s => `${s.name}: ${Math.round(s.value)}`).join('\n'));
};

/**
 * Show full agent analysis for an opportunity
 */
window.showAgentAnalysis = async function(id) {
  const opp = currentOpportunities.find(o => o.id === id);
  if (!opp) return;

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/opportunities/${id}/analysis`, {
      headers: {
        'X-User-Id': getUserId()
      }
    });
    const analysis = await response.json();

    // Build analysis modal content
    const content = buildAnalysisModalContent(analysis);
    showModal('Agent Analysis: ' + opp.ticker, content);

  } catch (e) {
    console.error('Failed to get analysis:', e);
    alert('Failed to load agent analysis');
  }
};

/**
 * Re-run agent analysis for an opportunity
 */
window.rerunAgentAnalysis = async function(id) {
  const opp = currentOpportunities.find(o => o.id === id);
  if (!opp) return;

  const card = document.querySelector(`[data-opp-id="${id}"]`);
  if (card) card.classList.add('validating');

  try {
    const response = await fetch(`${CONFIG.PROXY_URL}/api/opportunities/${id}/rerun`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId()
      }
    });
    const result = await response.json();

    if (result.success) {
      alert(`Re-analysis complete!\nCost: $${(result.cost || 0).toFixed(4)}`);
      loadOpportunities();
    } else {
      alert('Re-analysis failed: ' + result.error);
    }

  } catch (e) {
    console.error('Re-analysis failed:', e);
    alert('Failed to re-run analysis: ' + e.message);
  } finally {
    if (card) card.classList.remove('validating');
  }
};

/**
 * Build modal content for agent analysis
 */
function buildAnalysisModalContent(analysis) {
  if (!analysis) return '<p>No analysis available</p>';

  let html = '<div class="agent-analysis-modal">';

  // Scores section
  html += '<div class="analysis-section"><h4>Scores</h4><div class="score-grid">';
  const scores = analysis.scores || {};
  for (const [name, value] of Object.entries(scores)) {
    if (value !== null && value !== undefined) {
      html += `<div class="score-item"><span class="score-name">${name}</span><span class="score-value">${Math.round(value)}</span></div>`;
    }
  }
  html += '</div></div>';

  // Analyst consensus
  if (analysis.analystConsensus) {
    html += '<div class="analysis-section"><h4>Analyst Consensus</h4><div class="consensus-grid">';
    const consensus = analysis.analystConsensus;
    const analysts = ['macro', 'sector', 'technical', 'quant'];
    for (const a of analysts) {
      const status = consensus[a] || 'skipped';
      const statusClass = status === 'analyzed' ? 'consensus-yes' : 'consensus-no';
      html += `<span class="consensus-chip ${statusClass}">${a}: ${status}</span>`;
    }
    if (consensus.supporting?.length) {
      html += `<div class="supporting-analysts">Supporting: ${consensus.supporting.join(', ')}</div>`;
    }
    html += '</div></div>';
  }

  // PM Conviction
  if (analysis.pmConviction) {
    html += `<div class="analysis-section"><h4>PM Conviction</h4><span class="conviction-badge conviction-${analysis.pmConviction}">${analysis.pmConviction.toUpperCase()}</span></div>`;
  }

  // Risk verdict (for future Risk Manager)
  if (analysis.riskVerdict) {
    html += `<div class="analysis-section"><h4>Risk Verdict</h4><span class="risk-verdict risk-${analysis.riskVerdict.toLowerCase()}">${analysis.riskVerdict}</span>`;
    if (analysis.riskNotes) {
      html += `<p class="risk-notes">${analysis.riskNotes}</p>`;
    }
    html += '</div>';
  }

  // Agent analysis details
  if (analysis.agentAnalysis) {
    html += '<div class="analysis-section"><h4>Agent Details</h4>';
    for (const [agent, messages] of Object.entries(analysis.agentAnalysis)) {
      const msg = messages[0]; // Get latest
      if (msg?.payload) {
        html += `<details class="agent-detail"><summary>${agent} (${msg.confidence || '--'}% confidence)</summary>`;
        html += `<pre>${JSON.stringify(msg.payload, null, 2).slice(0, 2000)}</pre>`;
        html += `<div class="agent-meta">Model: ${msg.model} | Time: ${msg.processingTime}ms | Cost: $${(msg.cost || 0).toFixed(4)}</div>`;
        html += '</details>';
      }
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * Simple modal helper
 */
function showModal(title, content) {
  // Remove existing modal
  const existing = document.querySelector('.opp-modal-overlay');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'opp-modal-overlay';
  modal.innerHTML = `
    <div class="opp-modal">
      <div class="opp-modal-header">
        <h3>${title}</h3>
        <button class="opp-modal-close" onclick="this.closest('.opp-modal-overlay').remove()">&times;</button>
      </div>
      <div class="opp-modal-body">${content}</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

/**
 * Render pipeline status indicator
 */
function renderPipelineStatus() {
  const container = document.getElementById('pipelineStatus');
  if (!container || !pipelineStatus) return;

  const statusClass = {
    'running': 'status-running',
    'completed': 'status-completed',
    'failed': 'status-failed',
    'no_runs': 'status-none'
  }[pipelineStatus.status] || '';

  container.innerHTML = `
    <div class="pipeline-status ${statusClass}">
      <span class="pipeline-status-dot"></span>
      <span class="pipeline-status-text">${pipelineStatus.status}</span>
      ${pipelineStatus.phase ? `<span class="pipeline-phase">${pipelineStatus.phase}</span>` : ''}
      ${pipelineStatus.totalCost ? `<span class="pipeline-cost">$${pipelineStatus.totalCost.toFixed(4)}</span>` : ''}
    </div>
  `;
}

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

// Periodically update alert badge (managed lifecycle)
let alertBadgeInterval = null;
export function startAlertBadgeUpdates() {
  if (alertBadgeInterval) clearInterval(alertBadgeInterval);
  alertBadgeInterval = setInterval(updateAlertBadge, 60000);
}
export function stopAlertBadgeUpdates() {
  if (alertBadgeInterval) {
    clearInterval(alertBadgeInterval);
    alertBadgeInterval = null;
  }
}
startAlertBadgeUpdates();
