/**
 * Filings Analytics Module
 * Lazy-loaded analytics dashboard for institutional filing intelligence
 */

import { CONFIG } from './config.js';

// ─── State ─────────────────────────────────────────────────────────────────

let analyticsData = null;
let activeSection = 'overview';
let chartInstances = {};
let aiSynthesis = null;
let aiTimestamp = null;
let hideMegaCaps = false;

const MEGA_CAP_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', // Mag 7
  'BRK-A', 'BRK-B', 'JPM', 'V', 'MA', 'JNJ', 'UNH', 'XOM', 'PG',  // Mega-cap blue chips
  'HD', 'COST', 'ABBV', 'KO', 'PEP', 'MRK', 'LLY', 'AVGO', 'WMT',
  'CVX', 'BAC', 'CRM', 'ORCL', 'ADBE', 'NFLX', 'AMD', 'INTC', 'CSCO',
  'DIS', 'VZ', 'T', 'PFE', 'ABT', 'TMO', 'DHR', 'PM', 'RTX',
  'NEE', 'LOW', 'SPGI', 'TXN', 'QCOM', 'INTU', 'AMAT', 'GS', 'MS',
  'BLK', 'ISRG', 'PANW', 'LRCX', 'KLAC', 'SNPS', 'CDNS', 'MRVL',
  'NOW', 'UBER', 'SQ', 'SHOP', 'SPOT', 'ABNB', 'COIN', 'SNOW', 'PLTR',
  // Major ETFs & Indices
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'IVV', 'VEA', 'VWO', 'EFA',
  'AGG', 'BND', 'TLT', 'HYG', 'LQD', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI',
  'XLP', 'XLY', 'XLB', 'XLU', 'XLRE', 'XLC', 'GLD', 'SLV', 'USO', 'ARKK'
]);

function filterMegaCaps(arr, tickerKey = 'ticker') {
  if (!hideMegaCaps) return arr;
  return arr.filter(item => !MEGA_CAP_TICKERS.has(item[tickerKey]));
}

const API = CONFIG.PROXY_URL + '/api/filings-analytics';

// ─── Fetch Layer ───────────────────────────────────────────────────────────

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': localStorage.getItem('vhunter_user_id') || 'vhunter-serhat'
  };
}

async function fetchAnalytics(type, params = '') {
  const res = await fetch(`${API}/${type}${params ? '?' + params : ''}`, { headers: headers() });
  if (!res.ok) throw new Error(`Failed to fetch ${type}`);
  return res.json();
}

// ─── Entry Point ───────────────────────────────────────────────────────────

export async function loadAnalytics() {
  const root = document.getElementById('filAnalyticsRoot');
  if (!root) return;

  root.innerHTML = `<div class="fila-loading"><i class="fa-solid fa-spinner"></i><p>Loading analytics...</p></div>`;

  try {
    analyticsData = await fetchAnalytics('all');
    renderDashboard(root);
  } catch (err) {
    console.error('[ANALYTICS]', err);
    root.innerHTML = `<div class="fila-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load analytics: ${err.message}</p></div>`;
  }
}

// ─── Dashboard Render ──────────────────────────────────────────────────────

function renderDashboard(root) {
  const d = analyticsData;
  const s = d.summary;

  root.innerHTML = `
    <!-- Summary Cards -->
    <div class="fila-cards">
      <div class="fila-card fila-card--accent" onclick="filaNav('convergence')">
        <div class="fila-card-value">${s.convergence_count}</div>
        <div class="fila-card-label">Convergences</div>
        <div class="fila-card-sub">2+ funds entering same ticker</div>
      </div>
      <div class="fila-card" onclick="filaNav('convergence')">
        <div class="fila-card-value">${s.top_concentrated}</div>
        <div class="fila-card-label">Top Concentrated</div>
        <div class="fila-card-sub">${formatVal(s.top_concentrated_value)}</div>
      </div>
      <div class="fila-card ${s.net_inflows >= 0 ? 'fila-card--positive' : 'fila-card--negative'}" onclick="filaNav('rotation')">
        <div class="fila-card-value">${formatVal(Math.abs(s.net_inflows))}</div>
        <div class="fila-card-label">Net ${s.net_inflows >= 0 ? 'Inflows' : 'Outflows'}</div>
        <div class="fila-card-sub">Institutional rotation</div>
      </div>
      <div class="fila-card fila-card--accent" onclick="filaNav('signals')">
        <div class="fila-card-value">${s.active_signals}</div>
        <div class="fila-card-label">Active Signals</div>
        <div class="fila-card-sub">Filing-based signals</div>
      </div>
      <div class="fila-card" onclick="filaNav('signals')">
        <div class="fila-card-value">${s.insider_clusters}</div>
        <div class="fila-card-label">Insider Clusters</div>
        <div class="fila-card-sub">Form 4 activity clusters</div>
      </div>
      <div class="fila-card fila-card--negative" onclick="filaNav('convergence')">
        <div class="fila-card-value">${s.exit_alerts}</div>
        <div class="fila-card-label">Exit Alerts</div>
        <div class="fila-card-sub">Multi-fund exits</div>
      </div>
    </div>

    <!-- Sub-tabs -->
    <div class="fila-subtabs">
      <button class="fila-subtab fila-subtab--filter ${hideMegaCaps ? 'active' : ''}" id="filaMegaCapToggle" onclick="filaToggleMegaCaps()">
        <i class="fa-solid fa-filter"></i> Hide Mega-Caps
      </button>
      <div style="width:1px;background:#e2e8f0;margin:0 4px"></div>
      <button class="fila-subtab active" data-section="overview" onclick="filaNav('overview')">Overview</button>
      <button class="fila-subtab" data-section="convergence" onclick="filaNav('convergence')">Convergence</button>
      <button class="fila-subtab" data-section="rotation" onclick="filaNav('rotation')">Rotation</button>
      <button class="fila-subtab" data-section="heatmap" onclick="filaNav('heatmap')">Heatmap</button>
      <button class="fila-subtab" data-section="signals" onclick="filaNav('signals')">Signals</button>
      <button class="fila-subtab" data-section="ai" onclick="filaNav('ai')">AI Insight</button>
    </div>

    <!-- Content Sections -->
    <div class="fila-section active" id="filaOverview"></div>
    <div class="fila-section" id="filaConvergence"></div>
    <div class="fila-section" id="filaRotation"></div>
    <div class="fila-section" id="filaHeatmap"></div>
    <div class="fila-section" id="filaSignals"></div>
    <div class="fila-section" id="filaAi"></div>
  `;

  renderOverview();
}

// ─── Mega-Cap Toggle ───────────────────────────────────────────────────────

window.filaToggleMegaCaps = function() {
  hideMegaCaps = !hideMegaCaps;
  const btn = document.getElementById('filaMegaCapToggle');
  if (btn) btn.classList.toggle('active', hideMegaCaps);
  // Force re-render of all sections
  document.querySelectorAll('.fila-section').forEach(s => delete s.dataset.rendered);
  filaNav(activeSection);
};

// ─── Navigation ────────────────────────────────────────────────────────────

window.filaNav = function(section) {
  activeSection = section;
  document.querySelectorAll('.fila-subtab[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  document.querySelectorAll('.fila-section').forEach(s => s.classList.remove('active'));

  const el = document.getElementById('fila' + section.charAt(0).toUpperCase() + section.slice(1));
  if (el) {
    el.classList.add('active');
    // Lazy render
    if (!el.dataset.rendered) {
      el.dataset.rendered = '1';
      const renderers = {
        overview: renderOverview,
        convergence: renderConvergence,
        rotation: renderRotation,
        heatmap: renderHeatmap,
        signals: renderSignals,
        ai: renderAI
      };
      renderers[section]?.();
    }
  }
};

// ─── Overview Section ──────────────────────────────────────────────────────

function renderOverview() {
  const el = document.getElementById('filaOverview');
  if (!el) return;
  el.dataset.rendered = '1';

  const d = analyticsData;

  el.innerHTML = `
    <div class="fila-chart-row">
      <div class="fila-chart-box">
        <h4>Filing Activity Velocity</h4>
        <canvas id="filaVelocityChart"></canvas>
      </div>
      <div class="fila-chart-box">
        <h4>PIPE Deal Lifecycle</h4>
        <div id="filaPipeGantt"></div>
      </div>
    </div>
    <div class="fila-chart-row">
      <div class="fila-chart-box fila-chart-full">
        <h4>Top Convergences</h4>
        <canvas id="filaConvergenceQuick"></canvas>
      </div>
    </div>
  `;

  // Velocity chart
  const hotTickers = filterMegaCaps(d.velocity).filter(v => v.is_hot).slice(0, 12);
  if (hotTickers.length > 0) {
    createChart('filaVelocityChart', {
      type: 'bar',
      data: {
        labels: hotTickers.map(v => v.ticker),
        datasets: [
          { label: '7d', data: hotTickers.map(v => v.last_7d), backgroundColor: '#ef4444' },
          { label: '30d', data: hotTickers.map(v => v.last_30d), backgroundColor: '#f59e0b' },
          { label: '90d', data: hotTickers.map(v => v.last_90d), backgroundColor: '#94a3b8' }
        ]
      },
      options: chartOpts('Filing count by period')
    });
  }

  // PIPE Gantt
  renderPipeGantt(d.pipeTimeline);

  // Convergence quick chart
  const topConv = filterMegaCaps(d.convergence).slice(0, 15);
  if (topConv.length > 0) {
    createChart('filaConvergenceQuick', {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Convergence',
          data: topConv.map(c => ({
            x: c.fund_count,
            y: c.total_value / 1e6,
            r: Math.min(Math.max(c.new_entries * 5 + 4, 4), 25),
            ticker: c.ticker
          })),
          backgroundColor: 'rgba(99, 102, 241, 0.5)',
          borderColor: '#6366f1'
        }]
      },
      options: {
        ...chartOpts(''),
        scales: {
          x: { title: { display: true, text: 'Fund Count' }, ticks: { stepSize: 1 } },
          y: { title: { display: true, text: 'Total Value ($M)' } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => {
                const p = ctx.raw;
                return `${p.ticker}: ${ctx.parsed.x} funds, $${ctx.parsed.y.toFixed(1)}M`;
              }
            }
          }
        }
      }
    });
  }
}

// ─── Convergence Section ───────────────────────────────────────────────────

function renderConvergence() {
  const el = document.getElementById('filaConvergence');
  const d = analyticsData;

  // Convergence table
  let html = `<div class="fila-section-title">Multi-Fund Convergence</div>`;
  html += `<div class="fila-chart-box"><table class="fila-table">
    <thead><tr><th>Ticker</th><th>Funds</th><th>Fund Names</th><th>Total Shares</th><th>Total Value</th><th>New Entries</th></tr></thead>
    <tbody>`;
  for (const c of filterMegaCaps(d.convergence)) {
    html += `<tr>
      <td class="fila-ticker" onclick="showTickerHoldings('${c.ticker}')">${c.ticker}</td>
      <td><strong>${c.fund_count}</strong></td>
      <td>${c.fund_names.join(', ')}</td>
      <td>${fmtNum(c.total_shares)}</td>
      <td>${formatVal(c.total_value)}</td>
      <td>${c.new_entries > 0 ? `<span class="fila-badge fila-badge--new">${c.new_entries} new</span>` : '-'}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  // Exit clustering
  html += `<div class="fila-section-title" style="margin-top:20px">Multi-Fund Exits (Bearish)</div>`;
  const filteredExits = filterMegaCaps(d.exitClusters);
  if (filteredExits.length > 0) {
    html += `<div class="fila-chart-box"><table class="fila-table">
      <thead><tr><th>Ticker</th><th>Exits</th><th>Funds Exiting</th><th>Value Lost</th></tr></thead>
      <tbody>`;
    for (const e of filteredExits) {
      html += `<tr>
        <td class="fila-ticker" onclick="showTickerHoldings('${e.ticker}')">${e.ticker}</td>
        <td><span class="fila-badge fila-badge--exit">${e.exit_count} exits</span></td>
        <td>${e.fund_names.join(', ')}</td>
        <td class="fila-trend-down">${formatVal(e.total_value_lost)}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  } else {
    html += `<div class="fila-empty">No multi-fund exits detected this period</div>`;
  }

  el.innerHTML = html;
}

// ─── Rotation Section ──────────────────────────────────────────────────────

function renderRotation() {
  const el = document.getElementById('filaRotation');
  const d = analyticsData;

  el.innerHTML = `
    <div class="fila-section-title">Institutional Rotation</div>
    <div class="fila-chart-row">
      <div class="fila-chart-box">
        <h4>Top Inflows (New + Increases)</h4>
        <canvas id="filaInflowChart"></canvas>
      </div>
      <div class="fila-chart-box">
        <h4>Top Outflows (Exits + Decreases)</h4>
        <canvas id="filaOutflowChart"></canvas>
      </div>
    </div>
  `;

  const flowIn = filterMegaCaps(d.rotation.flowIn).slice(0, 10);
  const flowOut = filterMegaCaps(d.rotation.flowOut).slice(0, 10);

  if (flowIn.length > 0) {
    createChart('filaInflowChart', {
      type: 'bar',
      data: {
        labels: flowIn.map(r => r.ticker),
        datasets: [{
          label: 'Net Inflow ($)',
          data: flowIn.map(r => r.net / 1e6),
          backgroundColor: '#10b981'
        }]
      },
      options: { ...chartOpts(''), indexAxis: 'y', scales: { x: { title: { display: true, text: '$M' } } } }
    });
  }

  if (flowOut.length > 0) {
    createChart('filaOutflowChart', {
      type: 'bar',
      data: {
        labels: flowOut.map(r => r.ticker),
        datasets: [{
          label: 'Net Outflow ($)',
          data: flowOut.map(r => Math.abs(r.net) / 1e6),
          backgroundColor: '#ef4444'
        }]
      },
      options: { ...chartOpts(''), indexAxis: 'y', scales: { x: { title: { display: true, text: '$M' } } } }
    });
  }
}

// ─── Heatmap Section ───────────────────────────────────────────────────────

function renderHeatmap() {
  const el = document.getElementById('filaHeatmap');
  const d = analyticsData;

  el.innerHTML = `
    <div class="fila-section-title">Fund x Ticker Heatmap</div>
    <div class="fila-heatmap-wrapper" id="filaHeatmapGrid"></div>
    <div class="fila-section-title" style="margin-top:20px">Portfolio Overlap</div>
    <div id="filaOverlapGrid"></div>
  `;

  renderHeatmapGrid(d.heatmap);
  renderOverlapGrid(d.overlap);
}

function renderHeatmapGrid(data) {
  const container = document.getElementById('filaHeatmapGrid');
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="fila-empty">No heatmap data available</div>';
    return;
  }

  data = filterMegaCaps(data);

  // Pivot: rows = funds, cols = top tickers
  const fundSet = new Set();
  const tickerMap = {};
  for (const r of data) {
    fundSet.add(r.fund_name);
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = 0;
    tickerMap[r.ticker] += Math.abs(r.value_change || 0);
  }

  const funds = [...fundSet];
  const tickers = Object.entries(tickerMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t]) => t);

  // Build lookup
  const lookup = {};
  for (const r of data) {
    lookup[`${r.fund_name}__${r.ticker}`] = r;
  }

  const cols = tickers.length + 1;
  let html = `<div class="fila-heatmap" style="grid-template-columns: 120px repeat(${tickers.length}, minmax(50px, 1fr))">`;

  // Header row
  html += `<div class="fila-heatmap-header"></div>`;
  for (const t of tickers) {
    html += `<div class="fila-heatmap-header">${t}</div>`;
  }

  // Data rows
  for (const fund of funds) {
    html += `<div class="fila-heatmap-fund">${fund}</div>`;
    for (const ticker of tickers) {
      const cell = lookup[`${fund}__${ticker}`];
      if (!cell) {
        html += `<div class="fila-heatmap-cell fila-heatmap-cell--empty">-</div>`;
        continue;
      }
      const type = (cell.change_type || '').toLowerCase();
      const pct = cell.pct_change ? `${cell.pct_change > 0 ? '+' : ''}${cell.pct_change.toFixed(0)}%` : type.charAt(0).toUpperCase();
      const strength = Math.abs(cell.pct_change || 0) > 50 ? 'strong' : (Math.abs(cell.pct_change || 0) < 10 ? 'weak' : '');
      html += `<div class="fila-heatmap-cell fila-heatmap-cell--${type} ${strength ? 'fila-heatmap-cell--' + strength : ''}"
        onclick="showTickerHoldings('${ticker}')" title="${fund}: ${cell.change_type} ${pct}">${pct}</div>`;
    }
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderOverlapGrid(data) {
  const container = document.getElementById('filaOverlapGrid');
  if (!data || !data.pairs || data.pairs.length === 0) {
    container.innerHTML = '<div class="fila-empty">No overlap data available</div>';
    return;
  }

  const funds = data.funds || [];
  const n = funds.length;
  if (n === 0) return;

  // Build lookup
  const pairLookup = {};
  for (const p of data.pairs) {
    pairLookup[`${p.fund_a}__${p.fund_b}`] = p;
    pairLookup[`${p.fund_b}__${p.fund_a}`] = p;
  }

  let html = `<div class="fila-chart-box"><div class="fila-overlap-grid" style="grid-template-columns: 120px repeat(${n}, 1fr)">`;

  // Header
  html += `<div class="fila-heatmap-header"></div>`;
  for (const f of funds) html += `<div class="fila-heatmap-header">${f.slice(0, 8)}</div>`;

  for (let i = 0; i < n; i++) {
    html += `<div class="fila-heatmap-fund">${funds[i]}</div>`;
    for (let j = 0; j < n; j++) {
      if (i === j) {
        html += `<div class="fila-overlap-cell" style="background:#6366f1;color:white">100%</div>`;
      } else {
        const p = pairLookup[`${funds[i]}__${funds[j]}`];
        const pct = p ? p.overlap_pct : 0;
        const bg = pct > 30 ? `rgba(99,102,241,${pct / 100})` : pct > 10 ? `rgba(99,102,241,${pct / 200})` : '#f8fafc';
        const color = pct > 40 ? 'white' : '#334155';
        const title = p ? `${p.shared_count} shared: ${p.shared_tickers.join(', ')}` : 'No overlap';
        html += `<div class="fila-overlap-cell" style="background:${bg};color:${color}" title="${title}">${pct}%</div>`;
      }
    }
  }

  html += `</div></div>`;
  container.innerHTML = html;
}

// ─── Signals Section ───────────────────────────────────────────────────────

function renderSignals() {
  const el = document.getElementById('filaSignals');
  const d = analyticsData;

  el.innerHTML = `
    <div class="fila-section-title">Insider Trading Clusters</div>
    <div class="fila-chart-box" style="margin-bottom:16px">
      <table class="fila-table">
        <thead><tr><th>Ticker</th><th>Filings</th><th>Buys</th><th>Sells</th><th>Insiders</th><th>Period</th></tr></thead>
        <tbody id="filaInsiderTable"></tbody>
      </table>
    </div>
    <div class="fila-section-title">Filing Velocity (Hot Tickers)</div>
    <div class="fila-chart-box">
      <table class="fila-table">
        <thead><tr><th>Ticker</th><th>7d</th><th>30d</th><th>90d</th><th>Types</th><th>Latest</th></tr></thead>
        <tbody id="filaVelocityTable"></tbody>
      </table>
    </div>
  `;

  // Insider clusters
  const insiderTbody = document.getElementById('filaInsiderTable');
  let ihtml = '';
  for (const i of filterMegaCaps(d.insiders)) {
    ihtml += `<tr>
      <td class="fila-ticker" onclick="showTickerHoldings('${i.ticker}')">${i.ticker}</td>
      <td><strong>${i.filing_count}</strong></td>
      <td class="fila-trend-up">${i.buy_count}</td>
      <td class="fila-trend-down">${i.sell_count}</td>
      <td>${i.insider_names.join(', ')}</td>
      <td>${i.first_filing?.slice(0, 10) || ''} - ${i.last_filing?.slice(0, 10) || ''}</td>
    </tr>`;
  }
  insiderTbody.innerHTML = ihtml || '<tr><td colspan="6" style="text-align:center;color:#94a3b8">No insider clusters detected</td></tr>';

  // Velocity
  const velTbody = document.getElementById('filaVelocityTable');
  let vhtml = '';
  for (const v of filterMegaCaps(d.velocity)) {
    vhtml += `<tr>
      <td class="fila-ticker" onclick="showTickerHoldings('${v.ticker || v.subject_ticker}')">${v.ticker || v.subject_ticker} ${v.is_hot ? '<span class="fila-badge fila-badge--hot">HOT</span>' : ''}</td>
      <td><strong>${v.last_7d}</strong></td>
      <td>${v.last_30d}</td>
      <td>${v.last_90d}</td>
      <td>${v.filing_types.join(', ')}</td>
      <td>${v.latest_filing?.slice(0, 10) || ''}</td>
    </tr>`;
  }
  velTbody.innerHTML = vhtml || '<tr><td colspan="6" style="text-align:center;color:#94a3b8">No velocity data</td></tr>';
}

// ─── AI Synthesis Section ──────────────────────────────────────────────────

function renderAI() {
  const el = document.getElementById('filaAi');

  if (aiSynthesis) {
    renderAISynthesisResult(el);
    return;
  }

  el.innerHTML = `
    <div class="fila-ai-panel">
      <div class="fila-ai-header">
        <h4>AI Filings Intelligence</h4>
        <button class="fila-ai-btn" onclick="filaGenerateAI()" id="filaAiBtn">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Insight
        </button>
      </div>
      <p style="color:#64748b;font-size:var(--t-sm)">Click to generate an AI synthesis of all filings analytics data. This will analyze convergences, rotation patterns, insider clusters, and PIPE deals to produce actionable trading intelligence.</p>
    </div>
  `;
}

window.filaGenerateAI = async function() {
  const btn = document.getElementById('filaAiBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
  }

  try {
    const res = await fetch(`${API}/ai-synthesis`, {
      method: 'POST',
      headers: headers()
    });
    if (!res.ok) throw new Error('AI synthesis failed');
    aiSynthesis = await res.json();
    aiTimestamp = new Date().toLocaleTimeString();
    renderAISynthesisResult(document.getElementById('filaAi'));
  } catch (err) {
    console.error('[AI]', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Insight';
    }
    alert('AI synthesis failed: ' + err.message);
  }
};

function renderAISynthesisResult(el) {
  const ai = aiSynthesis;
  if (!ai) return;

  let html = `<div class="fila-ai-panel">
    <div class="fila-ai-header">
      <div>
        <h4>AI Filings Intelligence</h4>
        <span class="fila-ai-timestamp">Generated at ${aiTimestamp}</span>
      </div>
      <button class="fila-ai-btn" onclick="aiSynthesisRefresh()">
        <i class="fa-solid fa-arrows-rotate"></i> Refresh
      </button>
    </div>`;

  // Narrative
  if (ai.narrative) {
    html += `<div class="fila-ai-narrative">${ai.narrative.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}</div>`;
  }

  // Watch list
  if (ai.watchList && ai.watchList.length > 0) {
    html += `<div class="fila-section-title">Watch List</div><div class="fila-watchlist">`;
    for (const w of ai.watchList) {
      const dirClass = w.direction === 'long' ? 'long' : w.direction === 'short' ? 'short' : 'watch';
      html += `<div class="fila-watch-pill" onclick="showTickerHoldings('${w.ticker}')">
        <span class="fila-badge fila-badge--${dirClass}">${w.direction?.toUpperCase()}</span>
        <strong>${w.ticker}</strong>
        <span class="fila-catalyst">${w.catalyst || ''}</span>
        <span style="font-size:10px;color:#94a3b8">${w.timeframe || ''}</span>
      </div>`;
    }
    html += `</div>`;
  }

  // Anomalies
  if (ai.anomalies && ai.anomalies.length > 0) {
    html += `<div class="fila-section-title">Anomalies</div><div class="fila-anomalies">`;
    for (const a of ai.anomalies) {
      html += `<div class="fila-anomaly-card"><i class="fa-solid fa-triangle-exclamation"></i> ${a}</div>`;
    }
    html += `</div>`;
  }

  // Macro alignment
  if (ai.macroAlignment) {
    html += `<div class="fila-section-title">Macro Alignment</div><div class="fila-macro-box">${ai.macroAlignment}</div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
}

window.aiSynthesisRefresh = function() {
  aiSynthesis = null;
  aiTimestamp = null;
  renderAI();
  window.filaGenerateAI();
};

// ─── PIPE Gantt ────────────────────────────────────────────────────────────

function renderPipeGantt(deals) {
  const container = document.getElementById('filaPipeGantt');
  if (!deals || deals.length === 0) {
    container.innerHTML = '<div class="fila-empty" style="padding:20px">No PIPE deals tracked</div>';
    return;
  }

  let html = '<div class="fila-gantt">';
  for (const deal of deals.slice(0, 10)) {
    const segments = [];
    const distStatus = deal.distribution_status || 'pre_s1';
    if (distStatus === 'completed' || deal.s1_effective_date) {
      segments.push({ cls: 'completed', label: 'Done', flex: 1 });
    } else if (deal.s1_filed_date) {
      segments.push({ cls: 'pre', label: 'Pre-S1', flex: 1 });
      segments.push({ cls: 's1', label: 'S1 Filed', flex: 2 });
    } else {
      segments.push({ cls: 'pre', label: 'Pre-S1', flex: 3 });
    }

    html += `<div class="fila-gantt-row">
      <div class="fila-gantt-label" onclick="showTickerHoldings('${deal.ticker}')">${deal.ticker}</div>
      <div class="fila-gantt-bar-container">
        ${segments.map(s => `<div class="fila-gantt-segment fila-gantt-segment--${s.cls}" style="flex:${s.flex}">${s.label}</div>`).join('')}
      </div>
      <div class="fila-gantt-status">${distStatus}</div>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// ─── Chart Helpers ─────────────────────────────────────────────────────────

function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), config);
}

function chartOpts(titleText) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      title: titleText ? { display: true, text: titleText, font: { size: 13 } } : { display: false }
    }
  };
}

// ─── Formatting Helpers ────────────────────────────────────────────────────

function formatVal(v) {
  if (!v) return '$0';
  v = Math.abs(v);
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtNum(n) {
  if (!n) return '0';
  return n.toLocaleString();
}

// ─── Cleanup ───────────────────────────────────────────────────────────────

export function destroyAnalytics() {
  for (const key of Object.keys(chartInstances)) {
    chartInstances[key]?.destroy();
    delete chartInstances[key];
  }
  analyticsData = null;
  activeSection = 'overview';
}
