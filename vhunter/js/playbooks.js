// Playbooks Page — Strategy definition management
import {
  getStrategies, createStrategy, getStrategy, updateStrategy, deleteStrategy,
  linkStrategyCheck, unlinkStrategyCheck, getStrategyChecks, getDailyChecks
} from './db.js';
import { CONFIG } from './config.js';
import { createSortableTable } from './sortable-table.js';

let strategiesCache = [];
let currentView = 'list'; // 'list' | 'detail' | 'npi'
let currentStrategyId = null;
let linkedChecks = [];
let editEntryConditions = [''];

const checksSorter = createSortableTable({
  columns: [
    { key: 'ticker', label: 'Ticker', sortable: true, sortValue: r => r.ticker?.toLowerCase() },
    { key: 'direction', label: 'Dir', sortable: true },
    { key: 'signal', label: 'Signal', sortable: true, sortValue: r => r.signal?.toLowerCase() || '' },
    { key: 'score', label: 'Score', sortable: true, sortValue: r => r.opportunity_score ?? -1 },
    { key: 'thesis', label: 'Thesis', sortable: true, sortValue: r => r.thesis_valid == null ? -1 : (r.thesis_valid ? 1 : 0) },
    { key: 'fit', label: 'Fit', sortable: true, sortValue: r => r.strategy_fit?.still_fits == null ? -1 : (r.strategy_fit.still_fits ? 1 : 0) },
    { key: 'notes', label: 'Notes', sortable: false },
    { key: 'actions', label: '', sortable: false }
  ],
  defaultSort: 'score',
  defaultDir: 'desc'
});

// ── Not Priced In state ──
let npiData = null; // { changes, period, summary }
let npiPipeDeals = [];
let npiPriceCache = {}; // { ticker: { periodClose, currentClose, pctChange } }
let npiLoading = false;

const MEGA_CAP_TICKERS = new Set([
  'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA','BRK-A','BRK-B',
  'AVGO','JPM','LLY','V','MA','UNH','XOM','COST','HD','PG',
  'JNJ','NFLX','ABBV','WMT','BAC','CRM','ORCL','CVX','MRK','KO',
  'PEP','AMD','ACN','TMO','LIN','MCD','CSCO','ADBE','IBM','GE',
  'ISRG','INTU','TXN','QCOM','AMGN','PFE','BKNG','NOW','HON','AMAT',
  'SPY','QQQ','IVV','VOO','VTI','IWM','DIA','VEA','VWO','EFA','AGG','BND','TLT','GLD','SLV'
]);

const NPI_PRICE_THRESHOLD = 3; // % — moves under this are "not priced in"
const NPI_MAX_PCT_CHANGE = 50; // % — filter out large position swings
const NPI_MAX_VALUE_CHANGE = 50_000_000; // $50M — keep it to small/mid changes

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

function renderNpiCard() {
  return `
    <div class="pb-card pb-card-npi" onclick="window.pbOpenNpi()">
      <div class="pb-card-header">
        <span class="pb-name">Not Priced In</span>
        <span class="pb-cat-badge institutional">Institutional</span>
        <span class="pb-dir-badge both">both</span>
        <div class="pb-priority">${priorityDots(4)}</div>
      </div>
      <div class="pb-desc">Institutional changes where price hasn't moved in the expected direction. Small, quiet moves only — no mega caps, no PIPE distributions.</div>
      <div class="pb-stats">
        <span>Source: <span class="pb-stat-val">13F Holdings</span></span>
        <span>Filter: <span class="pb-stat-val">Small changes</span></span>
        <span>Exclude: <span class="pb-stat-val">Mega cap, distributing</span></span>
      </div>
    </div>
  `;
}

function renderNrsCard() {
  const tickerCount = NRS_COMMODITIES.reduce((sum, c) => sum + c.tickers.length, 0);
  return `
    <div class="pb-card pb-card-nrs" onclick="window.pbOpenNrs()">
      <div class="pb-card-header">
        <span class="pb-name">Natural Resource Scarcity</span>
        <span class="pb-cat-badge macro_rotation">Macro Rotation</span>
        <span class="pb-dir-badge long">long</span>
        <div class="pb-priority">${priorityDots(4)}</div>
      </div>
      <div class="pb-desc">Gulf states control outsized share of critical non-energy commodities. Any geopolitical disruption = supply chain shock across helium, ammonia, methanol, aluminum, and more.</div>
      <div class="pb-stats">
        <span>Commodities: <span class="pb-stat-val">${NRS_COMMODITIES.length}</span></span>
        <span>Tickers: <span class="pb-stat-val">${tickerCount}</span></span>
        <span>Thesis: <span class="pb-stat-val">Gulf concentration risk</span></span>
      </div>
    </div>
  `;
}

function renderList() {
  const container = document.getElementById('pbPage');
  if (!container) return;

  const userCards = strategiesCache.map(s => {
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
  }).join('');

  container.innerHTML = `
    <div class="pb-header">
      <div></div>
      <div class="pb-header-actions">
        <button class="btn btn-primary btn-sm" onclick="window.pbOpenModal()">+ New Strategy</button>
      </div>
    </div>
    <div class="pb-cards">
      ${renderNpiCard()}
      ${renderNrsCard()}
      ${userCards || `<div class="pb-empty" style="grid-column:1/-1">
        <div class="pb-empty-icon">♟</div>
        <div class="pb-empty-text">No custom strategy playbooks yet. Create one to get started.</div>
      </div>`}
    </div>
  `;
}

// ── Strategy Tickers ─────────────────────────────────────────────

const TIER_ORDER = { major: 0, midcap: 1, junior: 2, explorer: 3 };
const TIER_LABELS = { major: 'Major', midcap: 'Mid-Cap', junior: 'Junior', explorer: 'Explorer' };

// ── Natural Resource Scarcity — Gulf Supply Concentration Thesis ──
// Gulf states control outsized share of non-energy commodities.
// Any geopolitical disruption = supply chain shock for these materials.

const NRS_COMMODITIES = [
  {
    name: 'Helium',
    gulfShare: '38.8%',
    exporters: 'Qatar',
    uses: 'Chip-making, medical imaging',
    tickers: [
      { symbol: 'APD', tier: 'major', direction: 'long', note: 'World\'s largest helium supplier. Direct beneficiary of helium scarcity — controls global distribution network.' },
      { symbol: 'LIN', tier: 'major', direction: 'long', note: 'Second-largest industrial gas company. Helium sourcing diversified but Gulf disruption lifts pricing power.' },
    ]
  },
  {
    name: 'Ammonia & Urea',
    gulfShare: '35–45% urea, 30% ammonia',
    exporters: 'Bahrain, Iran, Kuwait, Oman, Qatar, Saudi Arabia, UAE',
    uses: 'Fertilizer, basic chemical input',
    tickers: [
      { symbol: 'CF', tier: 'major', direction: 'long', note: 'Largest North American ammonia producer. Natural gas cost advantage over Gulf competitors. Direct pricing beneficiary.' },
      { symbol: 'NTR', tier: 'major', direction: 'long', note: 'World\'s largest fertilizer company. Vertically integrated potash + nitrogen. Gulf disruption = margin expansion.' },
      { symbol: 'LXU', tier: 'junior', direction: 'long', note: 'Small-cap ammonia/fertilizer producer. High operating leverage — big moves on ammonia price spikes.' },
      { symbol: 'OCI', tier: 'midcap', direction: 'long', note: 'Netherlands-based nitrogen & methanol producer. Major non-Gulf ammonia capacity. Acquisition target potential.' },
    ]
  },
  {
    name: 'Methanol',
    gulfShare: '32–35%',
    exporters: 'Bahrain, Iran, Oman, Qatar, Saudi Arabia',
    uses: 'Fuel, basic chemical input, biodiesel manufacturing',
    tickers: [
      { symbol: 'MEOH', tier: 'major', direction: 'long', note: 'World\'s largest methanol producer. Geographically diversified production. Gulf disruption = pricing tailwind.' },
      { symbol: 'CE', tier: 'midcap', direction: 'long', note: 'Major acetyls & methanol derivative producer. Benefits from methanol scarcity through downstream pricing.' },
    ]
  },
  {
    name: 'Sulfur',
    gulfShare: '21.6% (45% of exports)',
    exporters: 'Iran, Iraq, Kuwait, Oman, Qatar, Saudi Arabia, UAE',
    uses: 'Fertilizer, mining, metals processing, uranium extraction',
    tickers: [
      { symbol: 'MOS', tier: 'major', direction: 'long', note: 'Major phosphate & potash fertilizer producer. Sulfur is key input — benefits from pricing disruption if Gulf supply tightens.' },
      { symbol: 'CCJ', tier: 'midcap', direction: 'long', note: 'World\'s largest pure-play uranium producer. Sulfuric acid (from sulfur) essential for ISR uranium extraction.' },
      { symbol: 'FCX', tier: 'major', direction: 'long', note: 'World\'s largest copper miner. Sulfuric acid critical in copper leaching — Gulf sulfur disruption raises extraction costs industry-wide, benefits low-cost producers.' },
    ]
  },
  {
    name: 'Polyethylene & Polypropylene',
    gulfShare: '15% PE / 9% PP capacity',
    exporters: 'Iran, Kuwait, Qatar, Saudi Arabia, UAE, Oman',
    uses: 'Packaging, pipes, bottles, insulation, automotive',
    tickers: [
      { symbol: 'LYB', tier: 'major', direction: 'long', note: 'World\'s largest polyolefin producer. Non-Gulf capacity = pricing power if Gulf supply disrupted. High dividend yield.' },
      { symbol: 'DOW', tier: 'major', direction: 'long', note: 'Major PE producer with US ethane advantage. Gulf disruption widens cost spread vs naphtha-based competitors.' },
      { symbol: 'WLK', tier: 'midcap', direction: 'long', note: 'Westlake Chemical — US-based PE/PVC producer. Benefits from tightening global polyolefin supply.' },
    ]
  },
  {
    name: 'Aluminum',
    gulfShare: '9% global (22% non-China)',
    exporters: 'Bahrain, Oman, Qatar, Saudi Arabia, UAE',
    uses: 'Key industrial metal',
    tickers: [
      { symbol: 'AA', tier: 'major', direction: 'long', note: 'Largest US aluminum producer. Gulf smelters (Alba, EGA) are major non-China supply — disruption = aluminum price spike.' },
      { symbol: 'CENX', tier: 'junior', direction: 'long', note: 'US-focused aluminum smelter. High operating leverage — small aluminum price increases = outsized earnings impact.' },
    ]
  },
  {
    name: 'Phosphate',
    gulfShare: '3.9%',
    exporters: 'Saudi Arabia',
    uses: 'Fertilizer',
    tickers: [
      { symbol: 'MOS', tier: 'major', direction: 'long', note: 'Also a major phosphate producer. Saudi\'s Ma\'aden JV is growing — watch for competitive dynamics.' },
      { symbol: 'ICL', tier: 'midcap', direction: 'long', note: 'Israel-based specialty minerals & phosphate. Alternative non-Gulf supply source. Dead Sea potash is unique asset.' },
    ]
  },
];

function renderTickersSection(tickers, checks, strategyId) {
  if (!tickers || !tickers.length) return '';

  const checksByTicker = {};
  for (const c of checks) {
    checksByTicker[c.ticker?.toUpperCase()] = c;
  }

  const sorted = [...tickers].sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9));

  const cards = sorted.map(t => {
    const sym = t.symbol?.toUpperCase();
    const linked = checksByTicker[sym];
    const tierClass = t.tier || 'unknown';
    const tierLabel = TIER_LABELS[t.tier] || t.tier || '';

    if (linked) {
      const fit = linked.strategy_fit;
      const fitBadge = fit
        ? `<span class="pb-fit-badge ${fit.still_fits ? 'fits' : 'drifted'}">${fit.still_fits ? 'FITS' : 'DRIFTED'}</span>`
        : '';
      return `
        <div class="pb-ticker-card pb-ticker-linked" onclick="window.switchPage('analyze', '${sym}')">
          <div class="pb-ticker-head">
            <span class="pb-ticker-sym">${sym}</span>
            <span class="pb-ticker-tier ${tierClass}">${tierLabel}</span>
            <span class="pb-dir-badge ${t.direction || 'long'}">${t.direction || ''}</span>
            ${fitBadge}
            <span class="pb-ticker-linked-badge">TRACKING</span>
          </div>
          <div class="pb-ticker-note">${t.note || ''}</div>
          <div class="pb-ticker-live">
            <span>Signal: <strong>${linked.signal || '--'}</strong></span>
            <span>Score: <strong>${linked.opportunity_score ?? '--'}</strong></span>
            <span>Thesis: <strong>${linked.thesis_valid != null ? (linked.thesis_valid ? 'Valid' : 'Invalid') : '--'}</strong></span>
          </div>
        </div>
      `;
    }

    return `
      <div class="pb-ticker-card" onclick="window.switchPage('analyze', '${sym}')">
        <div class="pb-ticker-head">
          <span class="pb-ticker-sym">${sym}</span>
          <span class="pb-ticker-tier ${tierClass}">${tierLabel}</span>
          <span class="pb-dir-badge ${t.direction || 'long'}">${t.direction || ''}</span>
        </div>
        <div class="pb-ticker-note">${t.note || ''}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="pb-tickers-header">
      <span class="pb-checks-title">Strategy Tickers (${tickers.length})</span>
    </div>
    <div class="pb-tickers-grid">${cards}</div>
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

    checksSorter.setData(linkedChecks);
    const sortedChecks = checksSorter.getSorted();

    const checksRows = sortedChecks.length > 0
      ? sortedChecks.map(c => {
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

        ${renderTickersSection(rules.tickers, linkedChecks, strategyId)}

        <div class="pb-checks-header">
          <span class="pb-checks-title">Linked Daily Checks (${linkedChecks.length})</span>
          <button class="btn btn-sm btn-primary" onclick="window.pbOpenLinkModal('${strategyId}')">+ Link Ticker</button>
        </div>

        <table class="pb-checks-table">
          <thead>
            <tr>${checksSorter.renderHead('window.pbSortChecks')}</tr>
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

function rerenderChecksTable() {
  const table = document.querySelector('.pb-checks-table');
  if (!table || !currentStrategyId) return;

  const sorted = checksSorter.getSorted();

  table.querySelector('thead tr').innerHTML = checksSorter.renderHead('window.pbSortChecks');

  table.querySelector('tbody').innerHTML = sorted.length > 0
    ? sorted.map(c => {
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
              <button class="pb-unlink-btn" onclick="window.pbUnlink('${currentStrategyId}', '${c.id}')">Unlink</button>
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px">No checks linked yet</td></tr>`;
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

// ── Natural Resource Scarcity Detail View ─────────────────────

function loadNrsView() {
  const container = document.getElementById('pbPage');
  if (!container) return;

  currentView = 'nrs';

  // Deduplicate tickers across commodities (e.g. MOS appears in sulfur + phosphate)
  const allTickers = [];
  const seen = new Set();
  for (const comm of NRS_COMMODITIES) {
    for (const t of comm.tickers) {
      if (!seen.has(t.symbol)) {
        seen.add(t.symbol);
        allTickers.push(t);
      }
    }
  }

  const commodityCards = NRS_COMMODITIES.map(comm => {
    const tickerCards = comm.tickers.map(t => `
      <div class="nrs-ticker-card" onclick="window.switchPage('analyze', '${t.symbol}')">
        <div class="pb-ticker-head">
          <span class="pb-ticker-sym">${t.symbol}</span>
          <span class="pb-ticker-tier ${t.tier}">${TIER_LABELS[t.tier] || t.tier}</span>
          <span class="pb-dir-badge ${t.direction}">${t.direction}</span>
        </div>
        <div class="pb-ticker-note">${t.note}</div>
      </div>
    `).join('');

    return `
      <div class="nrs-commodity-section">
        <div class="nrs-commodity-header">
          <span class="nrs-commodity-name">${comm.name}</span>
          <span class="nrs-gulf-share">${comm.gulfShare}</span>
        </div>
        <div class="nrs-commodity-meta">
          <span>Exporters: ${comm.exporters}</span>
          <span>Uses: ${comm.uses}</span>
        </div>
        <div class="nrs-tickers-grid">${tickerCards}</div>
      </div>
    `;
  }).join('');

  // Gulf commodity concentration table
  const tableRows = NRS_COMMODITIES.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.gulfShare}</td>
      <td style="font-size:0.72rem;color:var(--tv-text-secondary)">${c.exporters}</td>
      <td style="font-size:0.72rem;color:var(--tv-text-secondary)">${c.uses}</td>
      <td><strong>${c.tickers.map(t => t.symbol).join(', ')}</strong></td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="pb-detail">
      <span class="pb-detail-back" onclick="window.pbBackToList()"><i class="fa-solid fa-arrow-left"></i> All Playbooks</span>

      <div class="pb-detail-card pb-nrs-header-card">
        <div class="pb-detail-title">Natural Resource Scarcity</div>
        <div class="pb-detail-meta">
          <span class="pb-cat-badge macro_rotation">Macro Rotation</span>
          <span class="pb-dir-badge long">long</span>
          <div class="pb-priority">${priorityDots(4)}</div>
        </div>
        <div class="pb-detail-desc">Gulf states control outsized share of critical non-energy commodities — helium (38.8%), ammonia/urea (35-45%), methanol (32-35%), sulfur (21.6%), and key plastics/metals. Any geopolitical disruption, trade restriction, or conflict in the region creates immediate supply chain shocks across chip-making, fertilizer, industrial chemicals, and metals.

This playbook tracks non-Gulf producers and downstream beneficiaries who gain pricing power when Gulf supply is constrained.</div>
        <div class="npi-filter-tags">
          <span class="nrs-tag">Gulf concentration</span>
          <span class="nrs-tag">Supply chain risk</span>
          <span class="nrs-tag">Non-energy commodities</span>
          <span class="nrs-tag">Long non-Gulf producers</span>
        </div>
      </div>

      <div class="nrs-overview-table">
        <table class="pb-checks-table">
          <thead>
            <tr>
              <th>Commodity</th>
              <th>Gulf Share</th>
              <th>Main Exporters</th>
              <th>Uses</th>
              <th>Tickers</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>

      <div class="nrs-commodities">
        ${commodityCards}
      </div>
    </div>
  `;
}

// ── Not Priced In Scanner ──────────────────────────────────────

const getUserId = () => localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';

let npiSortBy = 'funds';       // funds | value | price_move | convergence
let npiFilterDir = 'all';      // all | bullish | bearish
let npiMinFunds = 1;           // minimum fund count

function npiFormatNumber(n) {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function npiFormatValue(v) {
  if (!v) return '$0';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function isMegaCap(ticker) {
  if (!ticker) return false;
  return MEGA_CAP_TICKERS.has(ticker.split(' ')[0].toUpperCase());
}

function isConvertible(ticker) {
  return ticker && /\s/.test(ticker.trim());
}

function isDistributing(ticker, pipeDeals) {
  return pipeDeals.some(d =>
    d.ticker === ticker &&
    ['s1_effective', 'distributing', 's1_filed'].includes(d.distribution_status)
  );
}

function isSmallChange(c) {
  const absPct = Math.abs(c.pct_change || 0);
  const absValue = Math.abs(c.value_change || c.current_value || 0);
  // NEW/EXIT are full position moves — only include if small value
  if (c.change_type === 'NEW' || c.change_type === 'EXIT') {
    return absValue < NPI_MAX_VALUE_CHANGE;
  }
  // INCREASE/DECREASE: filter out huge % swings and large value moves
  return absPct < NPI_MAX_PCT_CHANGE && absValue < NPI_MAX_VALUE_CHANGE;
}

function npiIsNotPricedIn(change) {
  const perf = npiPriceCache[change.ticker];
  if (!perf) return false;
  switch (change.change_type) {
    case 'NEW':
    case 'INCREASE':
      return perf.pctChange < NPI_PRICE_THRESHOLD;
    case 'EXIT':
    case 'DECREASE':
      return perf.pctChange > -NPI_PRICE_THRESHOLD;
    default:
      return false;
  }
}

async function fetchNpiData() {
  const params = new URLSearchParams({
    limit: '500',
    sort: 'fund_priority',
    change_type: 'NEW,EXIT,INCREASE,DECREASE',
    max_value: String(NPI_MAX_VALUE_CHANGE),
    max_pct: String(NPI_MAX_PCT_CHANGE)
  });
  const response = await fetch(`${CONFIG.PROXY_URL}/api/holdings/changes?${params}`, {
    headers: { 'X-User-Id': getUserId() }
  });
  return response.json();
}

async function fetchNpiPipeDeals() {
  const response = await fetch(`${CONFIG.PROXY_URL}/api/pipe?status=active`, {
    headers: { 'X-User-Id': getUserId() }
  });
  const data = await response.json();
  return Array.isArray(data) ? data : (data.data || []);
}

async function fetchNpiPricePerformance(tickers, periodDate) {
  const today = new Date().toISOString().split('T')[0];
  const toFetch = tickers.filter(t => !npiPriceCache[t]);
  if (!toFetch.length) return;

  const batchSize = 10;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const r = await fetch(
          `${CONFIG.PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/range/1/day/${periodDate}/${today}?adjusted=true&sort=asc&limit=250`
        );
        if (!r.ok) return;
        const data = await r.json();
        const bars = data?.results;
        if (!bars?.length) return;
        const periodClose = bars[0].c;
        const currentClose = bars[bars.length - 1].c;
        const pctChange = ((currentClose - periodClose) / periodClose) * 100;
        npiPriceCache[ticker] = { periodClose, currentClose, pctChange };
      } catch { /* skip */ }
    }));
  }
}

async function loadNpiView() {
  const container = document.getElementById('pbPage');
  if (!container) return;

  currentView = 'npi';
  container.innerHTML = `
    <div class="pb-detail">
      <span class="pb-detail-back" onclick="window.pbBackToList()"><i class="fa-solid fa-arrow-left"></i> All Playbooks</span>
      <div class="pb-detail-card pb-npi-header-card">
        <div class="pb-detail-title">Not Priced In</div>
        <div class="pb-detail-desc">Institutional changes where price hasn't moved in the expected direction. Funds bought/increased but stock hasn't risen, or funds sold/exited but stock hasn't fallen since the filing period.</div>
        <div class="npi-filter-tags">
          <span class="npi-tag">No mega cap</span>
          <span class="npi-tag">Small changes only</span>
          <span class="npi-tag">No PIPE distributions</span>
          <span class="npi-tag">Price &lt;${NPI_PRICE_THRESHOLD}% move</span>
        </div>
      </div>
      <div id="npiResults" class="npi-results">
        <div class="npi-loading">
          <i class="fa-solid fa-spinner fa-spin"></i> Loading holdings changes & price data...
        </div>
      </div>
    </div>
  `;

  if (npiLoading) return;
  npiLoading = true;

  try {
    const [changesResult, pipes] = await Promise.all([
      fetchNpiData(),
      fetchNpiPipeDeals()
    ]);

    npiData = changesResult;
    npiPipeDeals = pipes;

    if (!npiData?.changes?.length) {
      renderNpiEmpty('No holdings changes data available. Parse 13F filings first.');
      npiLoading = false;
      return;
    }

    // Filter: no UNCHANGED, no mega cap, no convertibles, no distributing, small changes only
    let filtered = npiData.changes.filter(c =>
      c.change_type !== 'UNCHANGED' &&
      c.ticker &&
      !isMegaCap(c.ticker) &&
      !isConvertible(c.ticker) &&
      !isDistributing(c.ticker, npiPipeDeals) &&
      isSmallChange(c)
    );

    if (!filtered.length) {
      renderNpiEmpty('No qualifying small institutional changes found after filtering.');
      npiLoading = false;
      return;
    }

    // Update loading message
    const resultsEl = document.getElementById('npiResults');
    if (resultsEl) {
      resultsEl.innerHTML = `<div class="npi-loading"><i class="fa-solid fa-spinner fa-spin"></i> Fetching price data for ${[...new Set(filtered.map(c => c.ticker))].length} tickers...</div>`;
    }

    // Fetch price performance for all filtered tickers
    const tickers = [...new Set(filtered.map(c => c.ticker))];
    await fetchNpiPricePerformance(tickers, npiData.period);

    // Final filter: only keep "not priced in" items
    const npiItems = filtered.filter(c => npiIsNotPricedIn(c));

    // Group by ticker for cleaner display
    const byTicker = {};
    for (const item of npiItems) {
      if (!byTicker[item.ticker]) byTicker[item.ticker] = [];
      byTicker[item.ticker].push(item);
    }

    renderNpiResults(byTicker, npiData.period);
  } catch (e) {
    console.error('[PLAYBOOKS] NPI load failed:', e);
    renderNpiEmpty('Failed to load data. Check console for details.');
  }

  npiLoading = false;
}

function renderNpiEmpty(msg) {
  const el = document.getElementById('npiResults');
  if (el) el.innerHTML = `<div class="pb-empty"><div class="pb-empty-text">${msg}</div></div>`;
}

function npiGetTickerMeta(ticker, changes) {
  const perf = npiPriceCache[ticker];
  const bullish = changes.filter(c => c.change_type === 'NEW' || c.change_type === 'INCREASE').length;
  const bearish = changes.filter(c => c.change_type === 'EXIT' || c.change_type === 'DECREASE').length;
  const direction = bullish > bearish ? 'bullish' : bullish < bearish ? 'bearish' : 'mixed';
  const totalValue = changes.reduce((sum, c) => sum + Math.abs(c.current_value || c.prior_value || 0), 0);
  return { perf, bullish, bearish, direction, totalValue };
}

function npiSortTickers(tickers, byTicker) {
  return tickers.sort((a, b) => {
    const metaA = npiGetTickerMeta(a, byTicker[a]);
    const metaB = npiGetTickerMeta(b, byTicker[b]);
    switch (npiSortBy) {
      case 'funds':
        return byTicker[b].length - byTicker[a].length || metaB.totalValue - metaA.totalValue;
      case 'value':
        return metaB.totalValue - metaA.totalValue;
      case 'price_move':
        return Math.abs(metaA.perf?.pctChange || 0) - Math.abs(metaB.perf?.pctChange || 0);
      case 'convergence': {
        // Convergence = all funds agree on direction, weighted by count
        const convA = Math.abs(metaA.bullish - metaA.bearish) / byTicker[a].length;
        const convB = Math.abs(metaB.bullish - metaB.bearish) / byTicker[b].length;
        return (convB * byTicker[b].length) - (convA * byTicker[a].length);
      }
      default:
        return byTicker[b].length - byTicker[a].length;
    }
  });
}

// Store last render data for re-sorting without refetching
let npiLastByTicker = null;
let npiLastPeriod = null;

function renderNpiResults(byTicker, period) {
  const el = document.getElementById('npiResults');
  if (!el) return;

  npiLastByTicker = byTicker;
  npiLastPeriod = period;

  // Apply direction filter
  let tickers = Object.keys(byTicker).filter(ticker => {
    const meta = npiGetTickerMeta(ticker, byTicker[ticker]);
    if (npiFilterDir !== 'all' && meta.direction !== npiFilterDir) return false;
    if (byTicker[ticker].length < npiMinFunds) return false;
    return true;
  });

  if (!tickers.length) {
    el.innerHTML = `
      ${renderNpiControls(Object.keys(byTicker).length, 0, period)}
      <div class="pb-empty"><div class="pb-empty-text">No results match current filters.</div></div>
    `;
    return;
  }

  npiSortTickers(tickers, byTicker);

  const formatQuarter = (p) => {
    if (!p) return '--';
    const [y, m] = p.split('-');
    const q = Math.ceil(parseInt(m) / 3);
    return `Q${q} ${y}`;
  };

  const rows = tickers.map(ticker => {
    const changes = byTicker[ticker];
    const meta = npiGetTickerMeta(ticker, changes);
    const perf = meta.perf;
    const pctStr = perf ? `${perf.pctChange >= 0 ? '+' : ''}${perf.pctChange.toFixed(1)}%` : '--';
    const pctCls = perf ? (perf.pctChange >= 0 ? 'npi-price-up' : 'npi-price-down') : '';
    const priceStr = perf ? `$${perf.currentClose.toFixed(2)}` : '--';

    const dirCls = meta.direction === 'bullish' ? 'npi-dir-bull' : meta.direction === 'bearish' ? 'npi-dir-bear' : 'npi-dir-mixed';
    const dirLabel = meta.direction === 'bullish' ? 'BULL' : meta.direction === 'bearish' ? 'BEAR' : 'MIXED';

    const fundsHtml = changes.map(c => {
      const typeMap = {
        NEW: { label: 'NEW', cls: 'npi-type-new' },
        EXIT: { label: 'EXIT', cls: 'npi-type-exit' },
        INCREASE: { label: 'INC', cls: 'npi-type-inc' },
        DECREASE: { label: 'DEC', cls: 'npi-type-dec' }
      };
      const t = typeMap[c.change_type] || { label: c.change_type, cls: '' };
      const val = c.change_type === 'EXIT' ? npiFormatValue(c.prior_value) : npiFormatValue(c.current_value);
      const chgStr = c.pct_change ? `${c.pct_change > 0 ? '+' : ''}${c.pct_change.toFixed(0)}%` : '';
      return `<div class="npi-fund-row">
        <span class="npi-type-badge ${t.cls}">${t.label}</span>
        <span class="npi-fund-name" title="${c.fund_name || ''}">${(c.fund_name || '').slice(0, 30)}</span>
        <span class="npi-fund-val">${val}</span>
        ${chgStr ? `<span class="npi-fund-chg">${chgStr}</span>` : ''}
      </div>`;
    }).join('');

    return `
      <div class="npi-ticker-card">
        <div class="npi-ticker-header">
          <span class="npi-ticker">${ticker}</span>
          <span class="npi-dir-badge ${dirCls}">${dirLabel}</span>
          <span class="npi-fund-count">${changes.length} fund${changes.length > 1 ? 's' : ''}</span>
          <span class="npi-total-val">${npiFormatValue(meta.totalValue)}</span>
          <span class="npi-price">${priceStr}</span>
          <span class="npi-perf ${pctCls}">${pctStr} since ${formatQuarter(period)}</span>
        </div>
        <div class="npi-funds">${fundsHtml}</div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    ${renderNpiControls(Object.keys(byTicker).length, tickers.length, period)}
    ${rows}
  `;
}

function renderNpiControls(totalCount, filteredCount, period) {
  const formatQuarter = (p) => {
    if (!p) return '--';
    const [y, m] = p.split('-');
    const q = Math.ceil(parseInt(m) / 3);
    return `Q${q} ${y}`;
  };

  const sortBtn = (value, label) => {
    const active = npiSortBy === value ? 'active' : '';
    return `<button class="npi-ctrl-btn ${active}" onclick="window._npiSetSort('${value}')">${label}</button>`;
  };

  const dirBtn = (value, label) => {
    const active = npiFilterDir === value ? 'active' : '';
    return `<button class="npi-ctrl-btn ${active}" onclick="window._npiSetDir('${value}')">${label}</button>`;
  };

  const fundsBtn = (value, label) => {
    const active = npiMinFunds === value ? 'active' : '';
    return `<button class="npi-ctrl-btn ${active}" onclick="window._npiSetMinFunds(${value})">${label}</button>`;
  };

  return `
    <div class="npi-controls">
      <div class="npi-ctrl-row">
        <span class="npi-ctrl-label">Sort</span>
        <div class="npi-ctrl-group">
          ${sortBtn('funds', 'Fund count')}
          ${sortBtn('value', 'Total value')}
          ${sortBtn('price_move', 'Least moved')}
          ${sortBtn('convergence', 'Convergence')}
        </div>
      </div>
      <div class="npi-ctrl-row">
        <span class="npi-ctrl-label">Direction</span>
        <div class="npi-ctrl-group">
          ${dirBtn('all', 'All')}
          ${dirBtn('bullish', 'Bullish')}
          ${dirBtn('bearish', 'Bearish')}
        </div>
      </div>
      <div class="npi-ctrl-row">
        <span class="npi-ctrl-label">Min funds</span>
        <div class="npi-ctrl-group">
          ${fundsBtn(1, '1+')}
          ${fundsBtn(2, '2+')}
          ${fundsBtn(3, '3+')}
        </div>
      </div>
    </div>
    <div class="npi-summary">
      <span>${filteredCount} of ${totalCount} ticker${totalCount !== 1 ? 's' : ''} with institutional action but no price follow-through</span>
      <span class="npi-period">Period: ${formatQuarter(period)}</span>
    </div>
  `;
}

window._npiSetSort = (v) => { npiSortBy = v; if (npiLastByTicker) renderNpiResults(npiLastByTicker, npiLastPeriod); };
window._npiSetDir = (v) => { npiFilterDir = v; if (npiLastByTicker) renderNpiResults(npiLastByTicker, npiLastPeriod); };
window._npiSetMinFunds = (v) => { npiMinFunds = v; if (npiLastByTicker) renderNpiResults(npiLastByTicker, npiLastPeriod); };

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

window.pbSortChecks = (key) => {
  checksSorter.sort(key);
  rerenderChecksTable();
};

window.pbOpenNpi = () => loadNpiView();
window.pbOpenNrs = () => loadNrsView();
