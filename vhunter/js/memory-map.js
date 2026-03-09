// Memory Map Module - Semantic memory layer for market factors
import { CONFIG } from './config.js';

let memories = [];
let selectedMemory = null;
let runCallback = null;
let currentFilter = 'all';

export function setRunCallback(cb) {
  runCallback = cb;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function memoryFetch(path, options = {}) {
  const userId = localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
  const response = await fetch(`${CONFIG.PROXY_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      ...options.headers
    }
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `Invalid response: ${text.substring(0, 120)}` };
  }
}

export async function getMemories(status = 'active') {
  const query = status ? `?status=${status}` : '';
  return memoryFetch(`/api/memory${query}`);
}

export async function getMemory(id) {
  return memoryFetch(`/api/memory/${id}`);
}

export async function createMemory(memory) {
  return memoryFetch('/api/memory', {
    method: 'POST',
    body: JSON.stringify(memory)
  });
}

export async function updateMemory(id, updates) {
  return memoryFetch(`/api/memory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

export async function deleteMemory(id) {
  return memoryFetch(`/api/memory/${id}`, { method: 'DELETE' });
}

export async function getMemoryUpdates(memoryId) {
  return memoryFetch(`/api/memory/${memoryId}/updates`);
}

export async function addMemoryUpdate(memoryId, update) {
  return memoryFetch(`/api/memory/${memoryId}/updates`, {
    method: 'POST',
    body: JSON.stringify(update)
  });
}

export async function extractMemories() {
  return memoryFetch('/api/memory/extract', { method: 'POST' });
}

export async function matchMemories() {
  return memoryFetch('/api/memory/match', { method: 'POST', body: JSON.stringify({}) });
}

export async function matchNewsToMemories() {
  return memoryFetch('/api/memory/match-news', { method: 'POST', body: JSON.stringify({}) });
}

export async function generateMemoryThesis() {
  return memoryFetch('/api/memory/thesis', { method: 'POST' });
}

// ============================================================================
// MAIN LOAD FUNCTION
// ============================================================================

let autoSyncInProgress = false;
let lastAutoSync = 0;

export async function loadMemoryMap() {
  const container = document.getElementById('memoryContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="memory-loading">
      <div class="memory-loading-spinner"></div>
      <div>Loading memory map...</div>
    </div>
  `;

  try {
    const response = await getMemories('active');
    memories = Array.isArray(response) ? response : [];
    renderMemoryMap(container);
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load memories: ${e.message}</div>`;
  }
}

async function autoSyncMemoryOps() {
  autoSyncInProgress = true;
  const btn = document.getElementById('runAllMemoryBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⚡ Auto-syncing...';
  }

  try {
    // Step 1: Extract from thesis
    const extractResult = await extractMemories();
    const hasNew = (extractResult.extracted || 0) + (extractResult.updated || 0) > 0;

    // Step 2: Match feed to memories
    const matchResult = await matchMemories();
    const feedMatched = matchResult.matched || 0;

    // Step 3: Match news report to memories
    let newsMatched = 0;
    try {
      const newsResult = await matchNewsToMemories();
      newsMatched = newsResult.matched || 0;
    } catch (e) {
      console.error('[MEMORY AUTO-SYNC] News match failed:', e.message);
    }

    const totalMatched = feedMatched + newsMatched;
    if (hasNew || totalMatched > 0) {
      const parts = [];
      if (extractResult.extracted) parts.push(`${extractResult.extracted} new`);
      if (feedMatched) parts.push(`${feedMatched} feed`);
      if (newsMatched) parts.push(`${newsMatched} news`);
      showToast(`Memory auto-sync: ${parts.join(', ')}`);
      // Only reload UI if memory page is currently active
      if (document.getElementById('memoryContainer')?.children.length > 0) {
        loadMemoryMap();
      }
    }

    lastAutoSync = Date.now();
  } catch (e) {
    console.error('[MEMORY AUTO-SYNC] Failed:', e.message);
  } finally {
    autoSyncInProgress = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Run All';
    }
  }
}

// Background auto-sync: runs on app startup, throttled to once per 4 hours
export function initMemoryAutoSync() {
  const now = Date.now();
  if (!autoSyncInProgress && (now - lastAutoSync) > 4 * 60 * 60 * 1000) {
    console.log('[MEMORY] Background auto-sync starting...');
    autoSyncMemoryOps();
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderMemoryMap(container) {
  if (memories.length === 0) {
    container.innerHTML = `
      <div class="memory-empty">
        <div class="memory-empty-icon">🧠</div>
        <div class="memory-empty-title">No memories yet</div>
        <div class="memory-empty-text">Memories track significant market factors over time.<br>Extract from thesis or create manually.</div>
        <div class="memory-empty-actions">
          <button class="memory-action-btn primary" onclick="window.extractMemoriesFromThesis()">
            Extract from Thesis
          </button>
          <button class="memory-action-btn secondary" onclick="window.openMemoryModal()">
            + Create Manual
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Calculate stats
  const stats = calculateStats(memories);

  // Filter memories
  const filtered = filterMemories(memories, currentFilter);

  container.innerHTML = `
    ${renderStats(stats)}
    ${renderGrid(filtered)}
  `;
}

function calculateStats(mems) {
  const total = mems.length;
  const avgSentiment = mems.reduce((sum, m) => sum + (m.sentiment_score || 0), 0) / (total || 1);
  const bullish = mems.filter(m => (m.sentiment_score || 0) > 1).length;
  const bearish = mems.filter(m => (m.sentiment_score || 0) < -1).length;
  const avgImportance = mems.reduce((sum, m) => sum + (m.importance_score || 5), 0) / (total || 1);

  return { total, avgSentiment, bullish, bearish, avgImportance };
}

function renderStats(stats) {
  const sentimentClass = stats.avgSentiment > 0.5 ? 'bullish' : stats.avgSentiment < -0.5 ? 'bearish' : '';

  return `
    <div class="memory-stats">
      <div class="memory-stat">
        <div class="memory-stat-value">${stats.total}</div>
        <div class="memory-stat-label">Active Memories</div>
      </div>
      <div class="memory-stat ${sentimentClass}">
        <div class="memory-stat-value">${stats.avgSentiment >= 0 ? '+' : ''}${stats.avgSentiment.toFixed(1)}</div>
        <div class="memory-stat-label">Avg Sentiment</div>
      </div>
      <div class="memory-stat bullish">
        <div class="memory-stat-value">${stats.bullish}</div>
        <div class="memory-stat-label">Bullish Factors</div>
      </div>
      <div class="memory-stat bearish">
        <div class="memory-stat-value">${stats.bearish}</div>
        <div class="memory-stat-label">Bearish Factors</div>
      </div>
    </div>
  `;
}

function filterMemories(mems, filter) {
  if (filter === 'all') return mems;
  return mems.filter(m => m.category === filter);
}

function renderGrid(mems) {
  return `
    <div class="memory-grid">
      ${mems.map(m => renderMemoryCard(m)).join('')}
    </div>
  `;
}

function renderMemoryCard(memory) {
  const sentiment = memory.sentiment_score || 0;
  const importance = memory.importance_score || 5;
  const sentimentClass = sentiment > 0.5 ? 'positive' : sentiment < -0.5 ? 'negative' : 'neutral';
  const sentimentArrow = sentiment > 0 ? '▲' : sentiment < 0 ? '▼' : '→';
  const assets = memory.affected_assets || [];
  const lastSignal = memory.last_signal_at ? getTimeAgo(memory.last_signal_at) : 'never';

  return `
    <div class="memory-card ${memory.status}" data-id="${memory.id}" onclick="window.openMemoryDetail('${memory.id}')">
      <div class="memory-card-header">
        <div class="memory-card-name">${escapeHtml(memory.name)}</div>
        <span class="memory-card-category ${memory.category}">${memory.category}</span>
      </div>
      <div class="memory-card-scores">
        <span class="memory-sentiment ${sentimentClass}">
          <span class="memory-sentiment-arrow">${sentimentArrow}</span>
          ${sentiment >= 0 ? '+' : ''}${sentiment.toFixed(1)}
        </span>
        <span class="memory-importance">
          ${importance.toFixed(1)}
          <span class="memory-importance-bar">
            <span class="memory-importance-fill" style="width: ${importance * 10}%"></span>
          </span>
        </span>
      </div>
      ${assets.length > 0 ? `
        <div class="memory-card-assets">
          ${assets.slice(0, 5).map(a => `<span class="memory-asset-tag">${a}</span>`).join('')}
          ${assets.length > 5 ? `<span class="memory-asset-tag">+${assets.length - 5}</span>` : ''}
        </div>
      ` : ''}
      <div class="memory-card-footer">
        <span class="memory-card-time">Last signal: ${lastSignal}</span>
      </div>
    </div>
  `;
}

// ============================================================================
// DETAIL PANEL
// ============================================================================

async function openMemoryDetail(id) {
  selectedMemory = memories.find(m => m.id === id);
  if (!selectedMemory) return;

  // Fetch full details with updates
  try {
    const fullMemory = await getMemory(id);
    selectedMemory = fullMemory;
    renderDetailPanel(fullMemory);
    showDetailPanel();
  } catch (e) {
    console.error('Failed to load memory details:', e);
  }
}

function showDetailPanel() {
  const overlay = document.getElementById('memoryDetailOverlay');
  const panel = document.getElementById('memoryDetailPanel');
  if (overlay) overlay.classList.add('active');
  if (panel) panel.classList.add('active');
}

function closeDetailPanel() {
  const overlay = document.getElementById('memoryDetailOverlay');
  const panel = document.getElementById('memoryDetailPanel');
  if (overlay) overlay.classList.remove('active');
  if (panel) panel.classList.remove('active');
  selectedMemory = null;
}

function renderDetailPanel(memory) {
  const panel = document.getElementById('memoryDetailPanel');
  if (!panel) return;

  const sentiment = memory.sentiment_score || 0;
  const importance = memory.importance_score || 5;
  const confidence = memory.confidence || 5;
  const assets = memory.affected_assets || [];
  const trades = memory.trade_implications || [];
  const updates = memory.updates || [];

  const sentimentClass = sentiment > 0 ? 'positive' : sentiment < 0 ? 'negative' : 'neutral';
  const sentimentWidth = Math.abs(sentiment) * 5; // Scale to 50% max

  panel.innerHTML = `
    <div class="memory-detail-header">
      <button class="memory-detail-close" onclick="window.closeMemoryDetail()">×</button>
      <div class="memory-detail-title">
        <div class="memory-detail-name">${escapeHtml(memory.name)}</div>
        <div class="memory-detail-meta">
          <span class="memory-card-category ${memory.category}">${memory.category}</span>
          <span style="color: #94a3b8; font-size: var(--t-xs);">${memory.timeframe}</span>
          <span style="color: #94a3b8; font-size: var(--t-xs);">${memory.volatility_impact} vol</span>
        </div>
      </div>
    </div>

    <div class="memory-detail-body">
      <!-- Gauges -->
      <div class="memory-gauges">
        <div class="memory-gauge">
          <div class="memory-gauge-label">Sentiment</div>
          <div class="memory-gauge-bar">
            <div class="memory-gauge-fill sentiment ${sentimentClass}" style="width: ${sentimentWidth}%"></div>
          </div>
          <div class="memory-gauge-value">${sentiment >= 0 ? '+' : ''}${sentiment.toFixed(1)}</div>
        </div>
        <div class="memory-gauge">
          <div class="memory-gauge-label">Importance</div>
          <div class="memory-gauge-bar">
            <div class="memory-gauge-fill importance" style="width: ${importance * 10}%"></div>
          </div>
          <div class="memory-gauge-value">${importance.toFixed(1)}/10</div>
        </div>
        <div class="memory-gauge">
          <div class="memory-gauge-label">Confidence</div>
          <div class="memory-gauge-bar">
            <div class="memory-gauge-fill confidence" style="width: ${confidence * 10}%"></div>
          </div>
          <div class="memory-gauge-value">${confidence.toFixed(1)}/10</div>
        </div>
      </div>

      <!-- Description -->
      <div class="memory-section">
        <div class="memory-section-title">Description</div>
        <div class="memory-section-content">${escapeHtml(memory.description)}</div>
      </div>

      ${memory.market_relevance ? `
        <div class="memory-section">
          <div class="memory-section-title">Market Relevance</div>
          <div class="memory-section-content">${escapeHtml(memory.market_relevance)}</div>
        </div>
      ` : ''}

      ${assets.length > 0 ? `
        <div class="memory-section">
          <div class="memory-section-title">Affected Assets</div>
          <div class="memory-detail-assets">
            ${assets.map(a => `<span class="memory-detail-asset" onclick="window.analyzeTicker('${a}')">${a}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${memory.current_thesis_impact ? `
        <div class="memory-section">
          <div class="memory-section-title">Current Thesis Impact</div>
          <div class="memory-section-content">${escapeHtml(memory.current_thesis_impact)}</div>
        </div>
      ` : ''}

      ${trades.length > 0 ? `
        <div class="memory-section">
          <div class="memory-section-title">Trade Implications</div>
          <ul class="memory-trades-list">
            ${trades.map(t => `<li class="memory-trade-item">${escapeHtml(t)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Sentiment Chart -->
      ${updates.length > 1 ? `
        <div class="memory-section">
          <div class="memory-section-title">Sentiment History</div>
          <div class="memory-sentiment-chart">
            ${renderSentimentSparkline(updates)}
          </div>
        </div>
      ` : ''}

      <!-- Timeline -->
      <div class="memory-section">
        <div class="memory-section-title">Timeline (${updates.length} updates)</div>
        ${updates.length > 0 ? `
          <div class="memory-timeline">
            ${updates.slice(0, 20).map(u => renderTimelineItem(u)).join('')}
          </div>
        ` : '<div class="memory-section-content">No updates yet</div>'}
      </div>
    </div>

    <div class="memory-detail-actions">
      <button class="btn-edit" onclick="window.openMemoryModal('${memory.id}')">Edit</button>
      <button class="btn-delete" onclick="window.deleteMemoryConfirm('${memory.id}')">Delete</button>
    </div>
  `;
}

function renderSentimentSparkline(updates) {
  if (!updates || updates.length < 2) return '';

  // Reverse to chronological order (oldest first) and take last 15
  const chronological = [...updates].reverse().slice(-15);
  const sentiments = chronological.map(u => u.new_sentiment ?? 0);

  const width = 280;
  const height = 50;
  const padding = 5;

  // Scale sentiment (-10 to +10) to chart height
  const minY = -10, maxY = 10;
  const scaleY = (val) => padding + ((maxY - val) / (maxY - minY)) * (height - 2 * padding);
  const scaleX = (i) => padding + (i / (sentiments.length - 1)) * (width - 2 * padding);

  // Build path
  const points = sentiments.map((s, i) => `${scaleX(i)},${scaleY(s)}`);
  const pathD = `M ${points.join(' L ')}`;

  // Zero line
  const zeroY = scaleY(0);

  // Gradient color based on final sentiment
  const finalSentiment = sentiments[sentiments.length - 1];
  const strokeColor = finalSentiment >= 0 ? '#10b981' : '#ef4444';

  return `
    <svg width="${width}" height="${height}" class="sentiment-sparkline">
      <defs>
        <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${padding}" y1="${zeroY}" x2="${width - padding}" y2="${zeroY}" stroke="#374151" stroke-width="1" stroke-dasharray="3,3"/>
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2"/>
      ${sentiments.map((s, i) => `<circle cx="${scaleX(i)}" cy="${scaleY(s)}" r="3" fill="${s >= 0 ? '#10b981' : '#ef4444'}"/>`).join('')}
      <text x="${padding}" y="${height - 2}" fill="#6b7280" font-size="9">-10</text>
      <text x="${padding}" y="10" fill="#6b7280" font-size="9">+10</text>
      <text x="${width - 20}" y="${height - 2}" fill="${strokeColor}" font-size="10" font-weight="bold">${finalSentiment >= 0 ? '+' : ''}${finalSentiment.toFixed(1)}</text>
    </svg>
  `;
}

function renderTimelineItem(update) {
  const sentiment = update.new_sentiment ?? 0;
  const delta = update.sentiment_delta || 0;
  const sentimentClass = sentiment > 0 ? 'positive' : sentiment < 0 ? 'negative' : '';
  const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : '';
  const timeAgo = getTimeAgo(update.created_at);

  return `
    <div class="memory-timeline-item ${deltaClass}">
      <div class="memory-timeline-header">
        <span class="memory-timeline-date">${timeAgo}</span>
        <span class="memory-timeline-sentiment ${sentimentClass}">${sentiment >= 0 ? '+' : ''}${sentiment.toFixed(1)}</span>
        ${delta !== 0 ? `<span class="memory-timeline-delta ${deltaClass}">(${delta > 0 ? '↑' : '↓'}${Math.abs(delta).toFixed(1)})</span>` : ''}
      </div>
      <div class="memory-timeline-summary">${escapeHtml(update.summary)}</div>
      ${update.reasoning ? `<div class="memory-timeline-reasoning">${escapeHtml(update.reasoning)}</div>` : ''}
    </div>
  `;
}

// ============================================================================
// MODAL (Create/Edit)
// ============================================================================

function openMemoryModal(editId = null) {
  const overlay = document.getElementById('memoryModalOverlay');
  const title = document.getElementById('memoryModalTitle');
  const form = document.getElementById('memoryForm');

  if (!overlay || !form) return;

  form.reset();
  document.getElementById('memoryFormId').value = '';

  if (editId) {
    const memory = memories.find(m => m.id === editId) || selectedMemory;
    if (memory) {
      title.textContent = 'Edit Memory';
      document.getElementById('memoryFormId').value = memory.id;
      document.getElementById('memoryFormName').value = memory.name || '';
      document.getElementById('memoryFormCategory').value = memory.category || 'theme';
      document.getElementById('memoryFormDescription').value = memory.description || '';
      document.getElementById('memoryFormRelevance').value = memory.market_relevance || '';
      document.getElementById('memoryFormAssets').value = (memory.affected_assets || []).join(', ');
      document.getElementById('memoryFormImportance').value = memory.importance_score || 5;
      document.getElementById('memoryFormSentiment').value = memory.sentiment_score || 0;
      document.getElementById('memoryFormVolatility').value = memory.volatility_impact || 'medium';
      document.getElementById('memoryFormTimeframe').value = memory.timeframe || 'medium-term';
      document.getElementById('memoryFormThesisImpact').value = memory.current_thesis_impact || '';
      document.getElementById('memoryFormTrades').value = (memory.trade_implications || []).join('\n');
    }
  } else {
    title.textContent = 'New Memory';
  }

  overlay.classList.add('active');
}

function closeMemoryModal() {
  const overlay = document.getElementById('memoryModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

async function saveMemory(event) {
  event.preventDefault();

  const id = document.getElementById('memoryFormId').value;
  const assetsStr = document.getElementById('memoryFormAssets').value;
  const tradesStr = document.getElementById('memoryFormTrades').value;

  const data = {
    name: document.getElementById('memoryFormName').value,
    category: document.getElementById('memoryFormCategory').value,
    description: document.getElementById('memoryFormDescription').value,
    market_relevance: document.getElementById('memoryFormRelevance').value || null,
    affected_assets: assetsStr ? assetsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [],
    importance_score: parseFloat(document.getElementById('memoryFormImportance').value) || 5,
    sentiment_score: parseFloat(document.getElementById('memoryFormSentiment').value) || 0,
    volatility_impact: document.getElementById('memoryFormVolatility').value,
    timeframe: document.getElementById('memoryFormTimeframe').value,
    current_thesis_impact: document.getElementById('memoryFormThesisImpact').value || null,
    trade_implications: tradesStr ? tradesStr.split('\n').map(s => s.trim()).filter(Boolean) : []
  };

  try {
    if (id) {
      await updateMemory(id, data);
      showToast('Memory updated');
    } else {
      await createMemory(data);
      showToast('Memory created');
    }
    closeMemoryModal();
    closeDetailPanel();
    loadMemoryMap();
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ============================================================================
// ACTIONS
// ============================================================================

// Chained pipeline: Extract from Thesis → Match Feed → Generate Thesis
async function runAllMemoryOps() {
  const btn = document.getElementById('runAllMemoryBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⚡ Extracting...';
  }

  const results = [];

  try {
    // Step 1: Extract memories from thesis
    const extractResult = await extractMemories();
    const extractParts = [];
    if (extractResult.extracted) extractParts.push(`${extractResult.extracted} new`);
    if (extractResult.updated) extractParts.push(`${extractResult.updated} updated`);
    results.push(extractParts.length ? `Extract: ${extractParts.join(', ')}` : 'Extract: no changes');

    if (btn) btn.textContent = '⚡ Matching feed...';

    // Step 2: Match feed signals to memories
    const matchResult = await matchMemories();
    if (matchResult.error) {
      results.push(`Feed: ${matchResult.error}`);
    } else {
      results.push(`Feed: ${matchResult.matched || 0} from ${matchResult.processed || 0}`);
    }

    if (btn) btn.textContent = '⚡ Matching news...';

    // Step 3: Match news report to memories
    try {
      const newsResult = await matchNewsToMemories();
      if (newsResult.matched > 0) {
        results.push(`News: ${newsResult.matched} matched`);
      } else {
        results.push(`News: ${newsResult.message || 'no matches'}`);
      }
    } catch (e) {
      results.push(`News: ${e.message}`);
    }

    if (btn) btn.textContent = '⚡ Generating...';

    // Step 4: Generate thesis from memories
    const thesisResult = await generateMemoryThesis();
    if (thesisResult.success && thesisResult.thesis) {
      results.push('Thesis: generated');
      showThesisModal(thesisResult.thesis);
    } else {
      results.push('Thesis: skipped');
    }

    showToast(results.join(' → '));
    loadMemoryMap();
  } catch (e) {
    showToast('Pipeline failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Run All';
    }
  }
}

async function extractMemoriesFromThesis() {
  const btn = document.getElementById('extractMemoriesBtn') || document.querySelector('[onclick="window.extractMemoriesFromThesis()"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extracting...';
  }

  try {
    const result = await extractMemories();
    const parts = [];
    if (result.extracted) parts.push(`${result.extracted} new`);
    if (result.updated) parts.push(`${result.updated} updated`);
    showToast(parts.length ? `Memories: ${parts.join(', ')}` : 'No changes needed');
    loadMemoryMap();
  } catch (e) {
    showToast('Extraction failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Extract from Thesis';
    }
  }
}

async function matchMemoriesToFeed() {
  const btn = document.getElementById('matchMemoriesBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Matching...';
  }

  try {
    const result = await matchMemories();
    if (result.error) {
      showToast(`Match error: ${result.error}`);
    } else {
      showToast(`Matched ${result.matched || 0} signals from ${result.processed || 0} items`);
    }
    if (result.debug?.length) console.log('[MEMORY MATCH]', result.debug);
    loadMemoryMap();
  } catch (e) {
    showToast('Matching failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Match Feed';
    }
  }
}

async function generateThesisFromMemories() {
  const btn = document.getElementById('generateThesisBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating...';
  }

  try {
    const result = await generateMemoryThesis();
    if (result.success && result.thesis) {
      showThesisModal(result.thesis);
    } else {
      showToast('Failed to generate thesis');
    }
  } catch (e) {
    showToast('Generation failed: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Thesis';
    }
  }
}

function showThesisModal(thesis) {
  const modal = document.getElementById('memoryThesisModal');
  const content = document.getElementById('memoryThesisContent');
  if (!modal || !content) return;

  content.innerHTML = `
    <div style="margin-bottom: 16px;">
      <span class="thesis-regime ${thesis.regime}">${thesis.regime}</span>
      <span class="thesis-bias ${thesis.bias}">${thesis.bias}</span>
      <span class="thesis-conviction" style="margin-left: 8px;">Conviction: ${thesis.conviction}/10</span>
    </div>
    <div style="font-size: 14px; line-height: 1.6; margin-bottom: 16px;">${escapeHtml(thesis.summary)}</div>
    ${thesis.key_drivers?.length ? `
      <div style="margin-bottom: 12px;">
        <strong>Key Drivers:</strong>
        <ul style="margin: 4px 0; padding-left: 20px;">
          ${thesis.key_drivers.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
    ${thesis.top_trades?.length ? `
      <div style="margin-bottom: 12px;">
        <strong>Top Trades:</strong>
        ${thesis.top_trades.map(t => `
          <div style="background: #f8fafc; padding: 8px; border-radius: 6px; margin-top: 6px; border-left: 3px solid #818cf8;">
            <div style="font-weight: 600;">${escapeHtml(t.idea)}</div>
            <div style="font-size: 12px; color: #64748b;">${escapeHtml(t.rationale)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${thesis.risks?.length ? `
      <div>
        <strong>Risks:</strong>
        <ul style="margin: 4px 0; padding-left: 20px; color: #dc2626;">
          ${thesis.risks.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
  `;

  modal.classList.add('active');
}

function closeThesisModal() {
  const modal = document.getElementById('memoryThesisModal');
  if (modal) modal.classList.remove('active');
}

async function deleteMemoryConfirm(id) {
  if (!confirm('Delete this memory? This cannot be undone.')) return;

  try {
    await deleteMemory(id);
    showToast('Memory deleted');
    closeDetailPanel();
    loadMemoryMap();
  } catch (e) {
    showToast('Delete failed: ' + e.message);
  }
}

function setMemoryFilter(filter) {
  currentFilter = filter;

  // Update filter buttons
  document.querySelectorAll('.memory-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  // Re-render grid
  const container = document.getElementById('memoryContainer');
  if (container && memories.length > 0) {
    const stats = calculateStats(memories);
    const filtered = filterMemories(memories, filter);
    container.innerHTML = `
      ${renderStats(stats)}
      ${renderGrid(filtered)}
    `;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTimeAgo(dateStr) {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================================================
// WINDOW BINDINGS
// ============================================================================

window.openMemoryDetail = openMemoryDetail;
window.closeMemoryDetail = closeDetailPanel;
window.openMemoryModal = openMemoryModal;
window.closeMemoryModal = closeMemoryModal;
window.saveMemory = saveMemory;
window.deleteMemoryConfirm = deleteMemoryConfirm;
window.runAllMemoryOps = runAllMemoryOps;
window.extractMemoriesFromThesis = extractMemoriesFromThesis;
window.matchMemoriesToFeed = matchMemoriesToFeed;
window.generateThesisFromMemories = generateThesisFromMemories;
window.closeThesisModal = closeThesisModal;
window.setMemoryFilter = setMemoryFilter;

// Analyze ticker callback
window.analyzeTicker = window.analyzeTicker || function(ticker) {
  document.getElementById('tk').value = ticker;
  if (runCallback) runCallback();
  if (window.switchPage) window.switchPage('analyze');
};
