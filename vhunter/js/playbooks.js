// Playbooks Page — Strategy definition management
import {
  getStrategies, createStrategy, getStrategy, updateStrategy, deleteStrategy,
  linkStrategyCheck, unlinkStrategyCheck, getStrategyChecks, getDailyChecks
} from './db.js';

let strategiesCache = [];
let currentView = 'list'; // 'list' | 'detail'
let currentStrategyId = null;
let linkedChecks = [];
let editEntryConditions = [''];

const CATEGORIES = [
  { value: 'mean_reversion', label: 'Mean Reversion' },
  { value: 'momentum', label: 'Momentum' },
  { value: 'event_driven', label: 'Event Driven' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'macro_rotation', label: 'Macro Rotation' },
  { value: 'volatility', label: 'Volatility' },
  { value: 'contrarian', label: 'Contrarian' },
  { value: 'custom', label: 'Custom' }
];

const INSTRUMENTS = [
  'stock', 'long_call', 'long_put', 'call_spread', 'put_spread',
  'covered_call', 'cash_secured_put', 'iron_condor', 'straddle', 'strangle'
];

const IV_OPTIONS = ['buy_options', 'spreads', 'sell_premium', 'avoid'];

function catLabel(cat) {
  return CATEGORIES.find(c => c.value === cat)?.label || cat;
}

function priorityDots(p) {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="pb-priority-dot ${i < p ? 'filled' : ''}"></span>`
  ).join('');
}

function signalClass(signal) {
  if (!signal) return '';
  const s = signal.toLowerCase().replace(/\s+/g, '-');
  if (s.startsWith('entry')) return 'entry-now';
  return s;
}

function parseJSON(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return {}; }
}

// ── List View ──────────────────────────────────────────────────

function renderList() {
  const container = document.getElementById('pbPage');
  if (!container) return;

  const cards = strategiesCache.length > 0
    ? strategiesCache.map(s => {
        const rules = parseJSON(s.rules);
        const exitRules = rules.exit_rules || {};
        return `
          <div class="pb-card" onclick="window.pbOpenDetail('${s.id}')">
            <div class="pb-card-header">
              <span class="pb-name">${s.name}</span>
              <span class="pb-cat-badge ${s.category}">${catLabel(s.category)}</span>
              <span class="pb-dir-badge ${s.direction}">${s.direction}</span>
              <div class="pb-priority">${priorityDots(s.priority)}</div>
            </div>
            ${s.description ? `<div class="pb-desc">${s.description}</div>` : ''}
            <div class="pb-stats">
              <span><span class="pb-stat-val">${s.linked_checks || 0}</span> checks</span>
              <span>Instrument: <span class="pb-stat-val">${rules.preferred_instrument || 'any'}</span></span>
              ${exitRules.profit_target_atr ? `<span>TP: <span class="pb-stat-val">${exitRules.profit_target_atr}x ATR</span></span>` : ''}
            </div>
            <div class="pb-card-actions">
              <button class="btn btn-sm" onclick="event.stopPropagation(); window.pbOpenModal('${s.id}')">Edit</button>
              <button class="btn btn-sm" onclick="event.stopPropagation(); window.pbArchive('${s.id}', '${s.name}')">Archive</button>
            </div>
          </div>
        `;
      }).join('')
    : `<div class="pb-empty">
        <div class="pb-empty-icon">♟</div>
        <div class="pb-empty-text">No strategy playbooks yet. Create one to get started.</div>
      </div>`;

  container.innerHTML = `
    <div class="pb-header">
      <div></div>
      <div class="pb-header-actions">
        <button class="btn btn-primary btn-sm" onclick="window.pbOpenModal()">+ New Strategy</button>
      </div>
    </div>
    <div class="pb-cards">${cards}</div>
  `;
}

// ── Detail View ──────────────────────────────────────────────────

async function renderDetail(strategyId) {
  const container = document.getElementById('pbPage');
  if (!container) return;

  container.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b">Loading...</div>';

  try {
    const [strategy, checks] = await Promise.all([
      getStrategy(strategyId),
      getStrategyChecks(strategyId)
    ]);

    currentStrategyId = strategyId;
    linkedChecks = checks || [];

    const rules = parseJSON(strategy.rules);
    const criteria = parseJSON(strategy.criteria);
    const entry = rules.entry_conditions || [];
    const exit = rules.exit_rules || {};
    const sizing = rules.position_sizing || {};
    const iv = rules.iv_strategy || {};

    const checksRows = linkedChecks.length > 0
      ? linkedChecks.map(c => {
          const fit = c.strategy_fit;
          const fitBadge = fit
            ? `<span class="pb-fit-badge ${fit.still_fits ? 'fits' : 'drifted'}">${fit.still_fits ? 'FITS' : 'DRIFTED'}</span>`
            : '<span style="color:#94a3b8;font-size:0.68rem">--</span>';
          return `
            <tr>
              <td><strong>${c.ticker}</strong></td>
              <td><span class="dc-dir-badge ${c.direction}">${c.direction}</span></td>
              <td><span class="dc-signal ${signalClass(c.signal)}">${c.signal || '--'}</span></td>
              <td>${c.opportunity_score ?? '--'}</td>
              <td>${c.thesis_valid != null ? (c.thesis_valid ? '✓' : '✗') : '--'}</td>
              <td>${fitBadge}</td>
              <td style="font-size:0.7rem;color:#94a3b8">${c.strategy_notes || ''}</td>
              <td>
                <button class="pb-unlink-btn" onclick="window.pbUnlink('${strategyId}', '${c.id}')">Unlink</button>
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px">No checks linked yet</td></tr>`;

    container.innerHTML = `
      <div class="pb-detail">
        <span class="pb-detail-back" onclick="window.pbBackToList()">← All Playbooks</span>

        <div class="pb-detail-card">
          <div class="pb-detail-title">${strategy.name}</div>
          <div class="pb-detail-meta">
            <span class="pb-cat-badge ${strategy.category}">${catLabel(strategy.category)}</span>
            <span class="pb-dir-badge ${strategy.direction}">${strategy.direction}</span>
            <div class="pb-priority">${priorityDots(strategy.priority)}</div>
            <button class="btn btn-sm" onclick="window.pbOpenModal('${strategy.id}')" style="margin-left:auto">Edit</button>
          </div>
          ${strategy.description ? `<div class="pb-detail-desc">${strategy.description}</div>` : ''}

          <div class="pb-rules-grid">
            ${entry.length > 0 ? `
              <div class="pb-rule-block">
                <div class="pb-rule-title">Entry Conditions</div>
                <ul class="pb-rule-list">${entry.map(e => `<li>${e}</li>`).join('')}</ul>
              </div>
            ` : ''}

            <div class="pb-rule-block">
              <div class="pb-rule-title">Exit Rules</div>
              <div class="pb-rule-text">
                Profit: ${exit.profit_target_atr || '?'}x ATR | Stop: ${exit.stop_loss_atr || '?'}x ATR | Time: ${exit.time_stop_days || '?'}d
              </div>
            </div>

            <div class="pb-rule-block">
              <div class="pb-rule-title">Position Sizing</div>
              <div class="pb-rule-text">
                Base: ${sizing.base_size || '?'} | Scale: ${sizing.scale_conditions || 'N/A'}
              </div>
            </div>

            <div class="pb-rule-block">
              <div class="pb-rule-title">Instrument & IV</div>
              <div class="pb-rule-text">
                Preferred: ${rules.preferred_instrument || 'any'}<br>
                Low IV → ${iv.low || '?'} | Mid → ${iv.mid || '?'} | High → ${iv.high || '?'}
              </div>
            </div>
          </div>
        </div>

        <div class="pb-checks-header">
          <span class="pb-checks-title">Linked Daily Checks (${linkedChecks.length})</span>
          <button class="btn btn-sm btn-primary" onclick="window.pbOpenLinkModal('${strategyId}')">+ Link Ticker</button>
        </div>

        <table class="pb-checks-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Dir</th>
              <th>Signal</th>
              <th>Score</th>
              <th>Thesis</th>
              <th>Fit</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${checksRows}</tbody>
        </table>
      </div>
    `;
  } catch (e) {
    console.error('[PLAYBOOKS] Detail load failed:', e);
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">Failed to load strategy</div>';
  }
}

// ── Strategy Modal (Create/Edit) ──────────────────────────────

function openModal(editId) {
  let existing = null;
  if (editId) {
    existing = strategiesCache.find(s => s.id === editId);
  }

  const rules = existing ? parseJSON(existing.rules) : {};
  const exit = rules.exit_rules || {};
  const sizing = rules.position_sizing || {};
  const iv = rules.iv_strategy || {};
  editEntryConditions = rules.entry_conditions?.length > 0 ? [...rules.entry_conditions] : [''];

  const modal = document.getElementById('pbModal');
  const title = document.getElementById('pbModalTitle');
  const form = document.getElementById('pbForm');

  title.textContent = existing ? 'Edit Strategy' : 'New Strategy';
  form.dataset.editId = editId || '';

  document.getElementById('pbNameInput').value = existing?.name || '';
  document.getElementById('pbCategorySelect').value = existing?.category || 'custom';
  document.getElementById('pbDirectionSelect').value = existing?.direction || 'both';
  document.getElementById('pbPriorityInput').value = existing?.priority || 3;
  document.getElementById('pbDescInput').value = existing?.description || '';
  document.getElementById('pbInstrumentSelect').value = rules.preferred_instrument || '';
  document.getElementById('pbProfitAtr').value = exit.profit_target_atr || '';
  document.getElementById('pbStopAtr').value = exit.stop_loss_atr || '';
  document.getElementById('pbTimeStop').value = exit.time_stop_days || '';
  document.getElementById('pbBaseSize').value = sizing.base_size || '';
  document.getElementById('pbScaleCondition').value = sizing.scale_conditions || '';
  document.getElementById('pbIvLow').value = iv.low || '';
  document.getElementById('pbIvMid').value = iv.mid || '';
  document.getElementById('pbIvHigh').value = iv.high || '';

  renderEntryConditions();
  modal.classList.add('open');
}

function renderEntryConditions() {
  const container = document.getElementById('pbEntryList');
  if (!container) return;
  container.innerHTML = editEntryConditions.map((cond, i) => `
    <div class="pb-entry-item">
      <input type="text" value="${cond}" oninput="window.pbUpdateEntry(${i}, this.value)" placeholder="e.g. RSI >70">
      ${editEntryConditions.length > 1 ? `<button class="pb-entry-remove" onclick="window.pbRemoveEntry(${i})">×</button>` : ''}
    </div>
  `).join('');
}

function closeModal() {
  document.getElementById('pbModal').classList.remove('open');
}

async function saveStrategy() {
  const form = document.getElementById('pbForm');
  const editId = form.dataset.editId;

  const name = document.getElementById('pbNameInput').value.trim();
  const category = document.getElementById('pbCategorySelect').value;
  const direction = document.getElementById('pbDirectionSelect').value;
  const priority = parseInt(document.getElementById('pbPriorityInput').value) || 3;
  const description = document.getElementById('pbDescInput').value.trim();

  if (!name) return alert('Name is required');

  const entryConditions = editEntryConditions.filter(c => c.trim());

  const rules = {
    entry_conditions: entryConditions,
    exit_rules: {
      profit_target_atr: parseFloat(document.getElementById('pbProfitAtr').value) || null,
      stop_loss_atr: parseFloat(document.getElementById('pbStopAtr').value) || null,
      time_stop_days: parseInt(document.getElementById('pbTimeStop').value) || null
    },
    position_sizing: {
      base_size: document.getElementById('pbBaseSize').value || null,
      scale_conditions: document.getElementById('pbScaleCondition').value || null
    },
    preferred_instrument: document.getElementById('pbInstrumentSelect').value || null,
    iv_strategy: {
      low: document.getElementById('pbIvLow').value || null,
      mid: document.getElementById('pbIvMid').value || null,
      high: document.getElementById('pbIvHigh').value || null
    }
  };

  const data = { name, category, direction, priority, description, rules };

  try {
    if (editId) {
      await updateStrategy(editId, data);
    } else {
      await createStrategy(data);
    }
    closeModal();
    await loadPlaybooks();
    if (currentView === 'detail' && editId) {
      await renderDetail(editId);
    }
  } catch (e) {
    console.error('[PLAYBOOKS] Save failed:', e);
    alert('Failed to save strategy');
  }
}

// ── Link Modal ──────────────────────────────────────────────────

async function openLinkModal(strategyId) {
  const modal = document.getElementById('pbLinkModal');
  const list = document.getElementById('pbLinkList');

  list.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8">Loading checks...</div>';
  modal.classList.add('open');

  try {
    const checks = await getDailyChecks();
    const allChecks = Array.isArray(checks) ? checks : (checks.data || []);
    const linkedIds = new Set(linkedChecks.map(c => c.id));

    list.innerHTML = allChecks.length > 0
      ? allChecks.map(c => `
          <div class="pb-link-item ${linkedIds.has(c.id) ? 'linked' : ''}"
               onclick="window.pbLinkCheck('${strategyId}', '${c.id}')">
            <div>
              <span class="pb-link-ticker">${c.ticker}</span>
              <span class="dc-dir-badge ${c.direction}">${c.direction}</span>
              <span class="pb-link-thesis">${c.thesis?.slice(0, 60) || ''}</span>
            </div>
            ${linkedIds.has(c.id) ? '<span style="font-size:0.68rem;color:#94a3b8">linked</span>' : ''}
          </div>
        `).join('')
      : '<div style="padding:20px;text-align:center;color:#94a3b8">No daily checks found</div>';
  } catch (e) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444">Failed to load checks</div>';
  }
}

function closeLinkModal() {
  document.getElementById('pbLinkModal').classList.remove('open');
}

// ── Actions ──────────────────────────────────────────────────

async function archiveStrategy(id, name) {
  if (!confirm(`Archive "${name}"?`)) return;
  try {
    await deleteStrategy(id);
    await loadPlaybooks();
  } catch (e) {
    console.error('[PLAYBOOKS] Archive failed:', e);
  }
}

async function linkCheck(strategyId, checkId) {
  try {
    await linkStrategyCheck(strategyId, checkId);
    closeLinkModal();
    await renderDetail(strategyId);
  } catch (e) {
    console.error('[PLAYBOOKS] Link failed:', e);
    alert('Failed to link check');
  }
}

async function unlinkCheck(strategyId, checkId) {
  try {
    await unlinkStrategyCheck(strategyId, checkId);
    await renderDetail(strategyId);
  } catch (e) {
    console.error('[PLAYBOOKS] Unlink failed:', e);
  }
}

// ── Main ──────────────────────────────────────────────────

export async function loadPlaybooks() {
  try {
    const result = await getStrategies();
    strategiesCache = Array.isArray(result) ? result : (result.data || []);
    currentView = 'list';
    renderList();
  } catch (e) {
    console.error('[PLAYBOOKS] Load failed:', e);
  }
}

// ── Window bindings ──────────────────────────────────────────

window.pbOpenDetail = async (id) => {
  currentView = 'detail';
  await renderDetail(id);
};

window.pbBackToList = () => {
  currentView = 'list';
  currentStrategyId = null;
  renderList();
};

window.pbOpenModal = (editId) => openModal(editId);
window.pbCloseModal = () => closeModal();
window.pbSave = () => saveStrategy();
window.pbArchive = (id, name) => archiveStrategy(id, name);

window.pbOpenLinkModal = (id) => openLinkModal(id);
window.pbCloseLinkModal = () => closeLinkModal();
window.pbLinkCheck = (sid, cid) => linkCheck(sid, cid);
window.pbUnlink = (sid, cid) => unlinkCheck(sid, cid);

window.pbUpdateEntry = (i, val) => { editEntryConditions[i] = val; };
window.pbRemoveEntry = (i) => { editEntryConditions.splice(i, 1); renderEntryConditions(); };
window.pbAddEntry = () => { editEntryConditions.push(''); renderEntryConditions(); };
