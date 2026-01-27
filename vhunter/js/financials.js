// Financials Module - SEC EDGAR API via Proxy
// Proxied through Cloudflare Worker to handle CORS

import { CONFIG } from './config.js';

// Cache for ticker -> CIK mapping
let tickerMap = null;
let tickerMapPromise = null;

// Cache for company facts (expires after 1 hour)
const factsCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Current timeframe state
let currentTimeframe = 'annual'; // 'annual' | 'quarterly' | 'ttm'
let currentTicker = null;

/**
 * Fetch SEC data via proxy
 */
async function fetchSEC(secPath) {
  const res = await fetch(`${CONFIG.PROXY_URL}/sec${secPath}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `SEC API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Load ticker -> CIK mapping (cached globally)
 */
async function loadTickerMap() {
  if (tickerMap) return tickerMap;
  if (tickerMapPromise) return tickerMapPromise;

  tickerMapPromise = fetchSEC('/files/company_tickers.json')
    .then(data => {
      tickerMap = {};
      for (const entry of Object.values(data)) {
        tickerMap[entry.ticker] = {
          cik: String(entry.cik_str).padStart(10, '0'),
          name: entry.title
        };
      }
      return tickerMap;
    });

  return tickerMapPromise;
}

/**
 * Get CIK for a ticker
 */
async function getCIK(ticker) {
  const map = await loadTickerMap();
  return map[ticker.toUpperCase()] || null;
}

/**
 * Fetch company facts (all financials) from SEC EDGAR
 */
async function fetchCompanyFacts(ticker) {
  const company = await getCIK(ticker);
  if (!company) return null;

  // Check cache
  const cached = factsCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const facts = await fetchSEC(`/api/xbrl/companyfacts/CIK${company.cik}.json`);

  // Cache result
  factsCache.set(ticker, { data: facts, timestamp: Date.now() });

  return facts;
}

/**
 * Extract a specific metric from company facts
 */
function extractMetric(facts, concept, form = '10-K', unit = 'USD') {
  const gaap = facts?.facts?.['us-gaap'];
  if (!gaap || !gaap[concept]) return null;

  const units = gaap[concept].units;
  const unitData = units[unit] || units[Object.keys(units)[0]];
  if (!unitData) return null;

  // Get values for the specified form type
  const values = unitData
    .filter(v => v.form === form)
    .sort((a, b) => new Date(b.end) - new Date(a.end));

  return values;
}

/**
 * Extract quarterly values and compute TTM (Trailing Twelve Months)
 */
function extractQuarterlyMetric(facts, concept, unit = 'USD') {
  const gaap = facts?.facts?.['us-gaap'];
  if (!gaap || !gaap[concept]) return null;

  const units = gaap[concept].units;
  const unitData = units[unit] || units[Object.keys(units)[0]];
  if (!unitData) return null;

  // Get 10-Q values (quarterly filings)
  const values = unitData
    .filter(v => v.form === '10-Q')
    .sort((a, b) => new Date(b.end) - new Date(a.end));

  return values;
}

/**
 * Calculate TTM by summing last 4 quarters
 */
function calculateTTM(facts, concept, unit = 'USD') {
  const quarterlyValues = extractQuarterlyMetric(facts, concept, unit);
  if (!quarterlyValues || quarterlyValues.length < 4) return null;

  // Get unique quarters (dedupe by fy-fp)
  const seen = new Set();
  const unique = [];
  for (const v of quarterlyValues) {
    const key = `${v.fy}-${v.fp}`;
    if (!seen.has(key) && v.fp !== 'FY') {
      seen.add(key);
      unique.push(v);
    }
    if (unique.length >= 4) break;
  }

  if (unique.length < 4) return null;

  // Sum the last 4 quarters
  const ttmVal = unique.reduce((sum, q) => sum + q.val, 0);
  const latestQ = unique[0];

  return {
    val: ttmVal,
    fy: latestQ.fy,
    fp: 'TTM',
    form: 'TTM',
    end: latestQ.end,
    quarters: unique
  };
}

/**
 * Get latest value for a metric
 */
function getLatestValue(facts, concept, form = '10-K') {
  const values = extractMetric(facts, concept, form);
  return values?.[0] || null;
}

/**
 * Get latest quarterly value for a metric
 */
function getLatestQuarterlyValue(facts, concept) {
  const values = extractQuarterlyMetric(facts, concept);
  if (!values || values.length === 0) return null;

  // Dedupe and get most recent quarter (not FY)
  for (const v of values) {
    if (v.fp !== 'FY') return v;
  }
  return null;
}

/**
 * Get historical values for a metric (last N periods)
 */
function getHistoricalValues(facts, concept, form = '10-K', periods = 5) {
  const values = extractMetric(facts, concept, form);
  if (!values) return [];

  // Dedupe by fiscal year
  const seen = new Set();
  const unique = [];
  for (const v of values) {
    const key = `${v.fy}-${v.fp}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(v);
    }
    if (unique.length >= periods) break;
  }

  return unique.reverse(); // Oldest to newest
}

/**
 * Get historical quarterly values (last N quarters)
 */
function getHistoricalQuarterlyValues(facts, concept, periods = 8) {
  const values = extractQuarterlyMetric(facts, concept);
  if (!values) return [];

  // Dedupe by fiscal year-quarter (exclude FY entries)
  const seen = new Set();
  const unique = [];
  for (const v of values) {
    const key = `${v.fy}-${v.fp}`;
    if (!seen.has(key) && v.fp !== 'FY') {
      seen.add(key);
      unique.push(v);
    }
    if (unique.length >= periods) break;
  }

  return unique.reverse(); // Oldest to newest
}

/**
 * Format number for display
 */
function formatValue(val, type = 'currency') {
  if (val === null || val === undefined) return 'N/A';

  if (type === 'currency') {
    const absVal = Math.abs(val);
    if (absVal >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (absVal >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (absVal >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toLocaleString()}`;
  }

  if (type === 'percent') {
    return `${(val * 100).toFixed(1)}%`;
  }

  if (type === 'ratio') {
    return val.toFixed(2);
  }

  if (type === 'shares') {
    if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
    return val.toLocaleString();
  }

  return val.toLocaleString();
}

/**
 * Calculate growth rate between two values
 */
function calcGrowth(current, previous) {
  if (!previous || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/**
 * Main function: Get structured financials for a ticker
 * @param {string} ticker - Stock ticker symbol
 * @param {string} timeframe - 'annual' (10-K), 'quarterly' (10-Q), or 'ttm'
 */
export async function getFinancials(ticker, timeframe = 'annual') {
  try {
    const facts = await fetchCompanyFacts(ticker);
    if (!facts) return { error: 'Company not found in SEC database' };

    const gaap = facts.facts?.['us-gaap'];
    if (!gaap) return { error: 'No US-GAAP data available' };

    // Store current state
    currentTicker = ticker;
    currentTimeframe = timeframe;

    const form = timeframe === 'quarterly' ? '10-Q' : '10-K';
    const periods = timeframe === 'quarterly' ? 8 : 5;
    const getHistFn = timeframe === 'quarterly' ? getHistoricalQuarterlyValues : getHistoricalValues;
    const getLatestFn = timeframe === 'quarterly' ? getLatestQuarterlyValue : getLatestValue;

    // Revenue - try multiple possible concepts, pick the one with most recent data
    const revenueConcepts = [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerIncludingAssessedTax'
    ];

    let revenueHistory = [];
    let bestRevenueYear = 0;

    if (timeframe === 'ttm') {
      // For TTM, find best revenue concept and calculate TTM
      for (const concept of revenueConcepts) {
        const ttm = calculateTTM(facts, concept);
        if (ttm && ttm.fy > bestRevenueYear) {
          bestRevenueYear = ttm.fy;
          // For TTM, we show TTM value plus historical annual for context
          const annualHist = getHistoricalValues(facts, concept, '10-K', 4);
          revenueHistory = [...annualHist, ttm];
        }
      }
    } else {
      for (const concept of revenueConcepts) {
        const hist = timeframe === 'quarterly'
          ? getHistoricalQuarterlyValues(facts, concept, periods)
          : getHistoricalValues(facts, concept, form, periods);
        if (hist.length > 0) {
          const latestYear = hist[hist.length - 1]?.fy || 0;
          if (latestYear > bestRevenueYear) {
            bestRevenueYear = latestYear;
            revenueHistory = hist;
          }
        }
      }
    }

    // Net Income
    let netIncomeHistory = [];
    if (timeframe === 'ttm') {
      const ttm = calculateTTM(facts, 'NetIncomeLoss');
      const annualHist = getHistoricalValues(facts, 'NetIncomeLoss', '10-K', 4);
      netIncomeHistory = ttm ? [...annualHist, ttm] : annualHist;
    } else {
      netIncomeHistory = getHistFn(facts, 'NetIncomeLoss', timeframe === 'quarterly' ? periods : form === '10-K' ? periods : periods);
      if (timeframe !== 'quarterly') {
        netIncomeHistory = getHistoricalValues(facts, 'NetIncomeLoss', form, periods);
      }
    }

    // EPS
    let epsHistory = [];
    if (timeframe === 'ttm') {
      const ttm = calculateTTM(facts, 'EarningsPerShareDiluted', 'USD/shares');
      const annualHist = getHistoricalValues(facts, 'EarningsPerShareDiluted', '10-K', 4);
      epsHistory = ttm ? [...annualHist, ttm] : annualHist;
    } else if (timeframe === 'quarterly') {
      epsHistory = getHistoricalQuarterlyValues(facts, 'EarningsPerShareDiluted', periods);
    } else {
      epsHistory = getHistoricalValues(facts, 'EarningsPerShareDiluted', form, periods);
    }

    // Balance Sheet Items (always use latest available - typically from 10-K or most recent 10-Q)
    const assets = getLatestValue(facts, 'Assets') || getLatestQuarterlyValue(facts, 'Assets');
    const liabilities = getLatestValue(facts, 'Liabilities') || getLatestQuarterlyValue(facts, 'Liabilities');
    const equity = getLatestValue(facts, 'StockholdersEquity') || getLatestQuarterlyValue(facts, 'StockholdersEquity');
    const cash = getLatestValue(facts, 'CashAndCashEquivalentsAtCarryingValue') || getLatestQuarterlyValue(facts, 'CashAndCashEquivalentsAtCarryingValue');
    const debt = getLatestValue(facts, 'LongTermDebt') || getLatestValue(facts, 'LongTermDebtNoncurrent') || getLatestQuarterlyValue(facts, 'LongTermDebt');

    // Profitability - use appropriate timeframe
    let grossProfit, operatingIncome;
    if (timeframe === 'ttm') {
      grossProfit = calculateTTM(facts, 'GrossProfit');
      operatingIncome = calculateTTM(facts, 'OperatingIncomeLoss');
    } else if (timeframe === 'quarterly') {
      grossProfit = getLatestQuarterlyValue(facts, 'GrossProfit');
      operatingIncome = getLatestQuarterlyValue(facts, 'OperatingIncomeLoss');
    } else {
      grossProfit = getLatestValue(facts, 'GrossProfit');
      operatingIncome = getLatestValue(facts, 'OperatingIncomeLoss');
    }

    const latestRevenue = revenueHistory[revenueHistory.length - 1];
    const latestNetIncome = netIncomeHistory[netIncomeHistory.length - 1];

    // Calculate margins
    const grossMargin = latestRevenue && grossProfit
      ? grossProfit.val / latestRevenue.val : null;
    const operatingMargin = latestRevenue && operatingIncome
      ? operatingIncome.val / latestRevenue.val : null;
    const netMargin = latestRevenue && latestNetIncome
      ? latestNetIncome.val / latestRevenue.val : null;

    // Calculate growth rates (YoY for quarterly, period-over-period otherwise)
    let revenueGrowth = null;
    let netIncomeGrowth = null;

    if (timeframe === 'quarterly' && revenueHistory.length >= 5) {
      // YoY growth for quarterly (compare to same quarter last year)
      revenueGrowth = calcGrowth(revenueHistory[revenueHistory.length - 1]?.val, revenueHistory[revenueHistory.length - 5]?.val);
      netIncomeGrowth = netIncomeHistory.length >= 5
        ? calcGrowth(netIncomeHistory[netIncomeHistory.length - 1]?.val, netIncomeHistory[netIncomeHistory.length - 5]?.val)
        : null;
    } else if (revenueHistory.length >= 2) {
      revenueGrowth = calcGrowth(revenueHistory[revenueHistory.length - 1]?.val, revenueHistory[revenueHistory.length - 2]?.val);
      netIncomeGrowth = netIncomeHistory.length >= 2
        ? calcGrowth(netIncomeHistory[netIncomeHistory.length - 1]?.val, netIncomeHistory[netIncomeHistory.length - 2]?.val)
        : null;
    }

    // Calculate ratios
    const currentAssets = getLatestValue(facts, 'AssetsCurrent') || getLatestQuarterlyValue(facts, 'AssetsCurrent');
    const currentLiabilities = getLatestValue(facts, 'LiabilitiesCurrent') || getLatestQuarterlyValue(facts, 'LiabilitiesCurrent');
    const currentRatio = currentAssets && currentLiabilities
      ? currentAssets.val / currentLiabilities.val : null;

    const debtToEquity = debt && equity
      ? debt.val / equity.val : null;

    const roe = latestNetIncome && equity
      ? latestNetIncome.val / equity.val : null;

    const roa = latestNetIncome && assets
      ? latestNetIncome.val / assets.val : null;

    // Determine fiscal period label
    let fiscalPeriod = null;
    if (latestRevenue) {
      if (timeframe === 'ttm') {
        fiscalPeriod = 'TTM';
      } else if (timeframe === 'quarterly') {
        fiscalPeriod = `${latestRevenue.fp} ${latestRevenue.fy}`;
      } else {
        fiscalPeriod = `FY${latestRevenue.fy}`;
      }
    }

    return {
      entityName: facts.entityName,
      cik: facts.cik,
      timeframe,

      // Income Statement
      income: {
        revenue: revenueHistory,
        netIncome: netIncomeHistory,
        eps: epsHistory,
        grossProfit: grossProfit?.val,
        operatingIncome: operatingIncome?.val
      },

      // Balance Sheet
      balance: {
        assets: assets?.val,
        liabilities: liabilities?.val,
        equity: equity?.val,
        cash: cash?.val,
        debt: debt?.val,
        currentAssets: currentAssets?.val,
        currentLiabilities: currentLiabilities?.val
      },

      // Ratios & Margins
      ratios: {
        grossMargin,
        operatingMargin,
        netMargin,
        currentRatio,
        debtToEquity,
        roe,
        roa
      },

      // Growth
      growth: {
        revenue: revenueGrowth,
        netIncome: netIncomeGrowth
      },

      // Fiscal period info
      fiscalPeriod
    };
  } catch (e) {
    console.error('Financials fetch error:', e);
    return { error: e.message };
  }
}

/**
 * Get rating badge based on metric value
 */
function getRating(value, thresholds, inverse = false) {
  if (value === null || value === undefined) return { label: '--', class: 'neutral' };

  const [elite, strong, solid] = thresholds;
  if (inverse) {
    if (value <= elite) return { label: 'ELITE', class: 'elite' };
    if (value <= strong) return { label: 'STRONG', class: 'strong' };
    if (value <= solid) return { label: 'SOLID', class: 'solid' };
    return { label: 'WEAK', class: 'weak' };
  }
  if (value >= elite) return { label: 'ELITE', class: 'elite' };
  if (value >= strong) return { label: 'STRONG', class: 'strong' };
  if (value >= solid) return { label: 'SOLID', class: 'solid' };
  return { label: 'WEAK', class: 'weak' };
}

/**
 * Calculate CAGR from historical values
 */
function calcCAGR(values) {
  if (!values || values.length < 2) return null;
  const first = values[0]?.val;
  const last = values[values.length - 1]?.val;
  const years = values.length - 1;
  if (!first || first <= 0 || !last || last <= 0) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

/**
 * Render financials HTML for the analyze page
 */
export function renderFinancialsHTML(data) {
  if (data.error) {
    return `<div class="financials-error">${data.error}</div>`;
  }

  const { income, balance, ratios, growth, fiscalPeriod, timeframe = 'annual' } = data;

  // Timeframe toggle HTML
  const timeframeToggle = `
    <div class="fin-timeframe-toggle">
      <button class="fin-tf-btn ${timeframe === 'annual' ? 'active' : ''}" data-timeframe="annual">Annual</button>
      <button class="fin-tf-btn ${timeframe === 'quarterly' ? 'active' : ''}" data-timeframe="quarterly">Quarterly</button>
      <button class="fin-tf-btn ${timeframe === 'ttm' ? 'active' : ''}" data-timeframe="ttm">TTM</button>
    </div>
  `;

  // Latest values
  const latestRevenue = income.revenue[income.revenue.length - 1];
  const latestNetIncome = income.netIncome[income.netIncome.length - 1];
  const latestEPS = income.eps[income.eps.length - 1];

  // Calculate CAGRs
  const revenueCAGR = calcCAGR(income.revenue);
  const netIncomeCAGR = calcCAGR(income.netIncome);

  // Get ratings
  const marginRating = getRating(ratios.netMargin, [0.25, 0.15, 0.08]);
  const growthRating = getRating(growth.revenue, [0.30, 0.15, 0.05]);
  const roeRating = getRating(ratios.roe, [0.25, 0.15, 0.10]);
  const leverageRating = getRating(ratios.debtToEquity, [0.3, 0.6, 1.0], true);

  // Format growth with arrow and context
  const growthLabel = timeframe === 'quarterly' ? 'YoY' : timeframe === 'ttm' ? 'vs PY' : 'YoY';
  const fmtGrowth = (g, label = growthLabel) => {
    if (g === null) return '<span class="neutral">--</span>';
    const pct = (g * 100).toFixed(1);
    const cls = g >= 0 ? 'positive' : 'negative';
    const arrow = g >= 0 ? '▲' : '▼';
    const intensity = Math.abs(g) >= 0.5 ? 'explosive' : Math.abs(g) >= 0.25 ? 'strong' : '';
    return `<span class="${cls} ${intensity}">${arrow} ${Math.abs(pct)}% <small>${label}</small></span>`;
  };

  // Mini sparkline for historical data
  const periodSuffix = timeframe === 'quarterly' ? 'Q' : 'Y';
  const miniChart = (values, showYears = false) => {
    if (!values || values.length < 2) return '';
    const vals = values.map(v => v.val);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const range = max - min || 1;

    const points = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * 60;
      const y = 20 - ((v - min) / range) * 18;
      return `${x},${y}`;
    }).join(' ');

    const trend = vals[vals.length - 1] >= vals[0] ? '#4ade80' : '#f87171';
    const periodCount = values.length;

    return `
      <div class="spark-container">
        <svg class="mini-chart" width="60" height="22" viewBox="0 0 60 22">
          <polyline points="${points}" fill="none" stroke="${trend}" stroke-width="1.5"/>
        </svg>
        ${showYears ? `<span class="spark-years">${periodCount}${periodSuffix}</span>` : ''}
      </div>
    `;
  };

  // Calculate health score (0-100)
  const healthScore = Math.round(
    (ratios.netMargin > 0 ? Math.min(ratios.netMargin * 100, 30) : 0) +
    (ratios.roe > 0 ? Math.min(ratios.roe * 50, 25) : 0) +
    (ratios.currentRatio >= 1 ? 15 : ratios.currentRatio * 15) +
    (growth.revenue > 0 ? Math.min(growth.revenue * 100, 20) : 0) +
    (ratios.debtToEquity !== null && ratios.debtToEquity < 1 ? 10 : 0)
  );

  const healthClass = healthScore >= 70 ? 'elite' : healthScore >= 50 ? 'strong' : healthScore >= 30 ? 'solid' : 'weak';

  // Cash runway (months of operating expenses covered)
  const cashRunway = balance.cash && balance.liabilities
    ? Math.round((balance.cash / (balance.liabilities / 12)))
    : null;

  // Determine SEC form label
  const formLabel = timeframe === 'quarterly' ? 'SEC 10-Q' : timeframe === 'ttm' ? 'TTM' : 'SEC 10-K';

  return `
    <div class="fin-header">
      <div class="fin-score">
        <div class="score-circle ${healthClass}">${healthScore}</div>
        <div class="score-label">Financial<br>Health</div>
      </div>
      <div class="fin-badges">
        <span class="fin-badge ${marginRating.class}">Margins: ${marginRating.label}</span>
        <span class="fin-badge ${growthRating.class}">Growth: ${growthRating.label}</span>
        <span class="fin-badge ${roeRating.class}">Returns: ${roeRating.label}</span>
        <span class="fin-badge ${leverageRating.class}">Leverage: ${leverageRating.label}</span>
      </div>
      ${timeframeToggle}
      <div class="fin-period-tag">${fiscalPeriod || ''} · ${formLabel}</div>
    </div>

    <div class="financials-grid">
      <div class="fin-section">
        <h4>Revenue Engine</h4>
        <div class="fin-hero">
          <span class="fin-hero-value">${formatValue(latestRevenue?.val)}</span>
          <span class="fin-hero-growth">${fmtGrowth(growth.revenue)}</span>
        </div>
        ${revenueCAGR !== null ? `<div class="fin-cagr">${(revenueCAGR * 100).toFixed(1)}% CAGR <small>(${income.revenue.length}Y)</small></div>` : ''}
        <div class="fin-spark-row">
          ${miniChart(income.revenue, true)}
        </div>
        <div class="fin-row">
          <span class="fin-label">Gross Profit</span>
          <span class="fin-value">${formatValue(income.grossProfit)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Operating Income</span>
          <span class="fin-value">${formatValue(income.operatingIncome)}</span>
        </div>
      </div>

      <div class="fin-section">
        <h4>Profitability</h4>
        <div class="fin-hero">
          <span class="fin-hero-value">${formatValue(latestNetIncome?.val)}</span>
          <span class="fin-hero-growth">${fmtGrowth(growth.netIncome)}</span>
        </div>
        ${netIncomeCAGR !== null ? `<div class="fin-cagr">${(netIncomeCAGR * 100).toFixed(1)}% CAGR <small>(${income.netIncome.length}Y)</small></div>` : ''}
        <div class="fin-spark-row">
          ${miniChart(income.netIncome, true)}
        </div>
        <div class="fin-row">
          <span class="fin-label">EPS (Diluted)</span>
          <span class="fin-value">${latestEPS ? `$${latestEPS.val.toFixed(2)}` : 'N/A'}</span>
          ${miniChart(income.eps)}
        </div>
        <div class="fin-row">
          <span class="fin-label">Net Margin</span>
          <span class="fin-value ${ratios.netMargin >= 0.20 ? 'positive' : ''}">${formatValue(ratios.netMargin, 'percent')}</span>
          <div class="margin-bar"><div class="margin-fill ${ratios.netMargin >= 0.20 ? 'high' : ''}" style="width: ${Math.min((ratios.netMargin || 0) * 100, 100)}%"></div></div>
        </div>
      </div>

      <div class="fin-section">
        <h4>Margin Stack</h4>
        <div class="margin-stack">
          <div class="margin-item">
            <div class="margin-header">
              <span>Gross</span>
              <span class="margin-pct ${ratios.grossMargin >= 0.50 ? 'high' : ''}">${formatValue(ratios.grossMargin, 'percent')}</span>
            </div>
            <div class="margin-bar full"><div class="margin-fill" style="width: ${Math.min((ratios.grossMargin || 0) * 100, 100)}%"></div></div>
          </div>
          <div class="margin-item">
            <div class="margin-header">
              <span>Operating</span>
              <span class="margin-pct ${ratios.operatingMargin >= 0.25 ? 'high' : ''}">${formatValue(ratios.operatingMargin, 'percent')}</span>
            </div>
            <div class="margin-bar full"><div class="margin-fill op" style="width: ${Math.min((ratios.operatingMargin || 0) * 100, 100)}%"></div></div>
          </div>
          <div class="margin-item">
            <div class="margin-header">
              <span>Net</span>
              <span class="margin-pct ${ratios.netMargin >= 0.20 ? 'high' : ''}">${formatValue(ratios.netMargin, 'percent')}</span>
            </div>
            <div class="margin-bar full"><div class="margin-fill net" style="width: ${Math.min((ratios.netMargin || 0) * 100, 100)}%"></div></div>
          </div>
        </div>
        <div class="margin-insight">
          ${ratios.grossMargin && ratios.netMargin
            ? `${((1 - ratios.netMargin / ratios.grossMargin) * 100).toFixed(0)}% margin erosion from gross to net`
            : ''}
        </div>
      </div>

      <div class="fin-section">
        <h4>Capital Structure</h4>
        <div class="capital-bar">
          <div class="cap-equity" style="width: ${balance.equity && balance.assets ? (balance.equity / balance.assets * 100) : 50}%">
            <span>Equity</span>
          </div>
          <div class="cap-debt" style="width: ${balance.liabilities && balance.assets ? (balance.liabilities / balance.assets * 100) : 50}%">
            <span>Debt</span>
          </div>
        </div>
        <div class="fin-row">
          <span class="fin-label">Total Assets</span>
          <span class="fin-value">${formatValue(balance.assets)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Shareholders' Equity</span>
          <span class="fin-value positive">${formatValue(balance.equity)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Total Liabilities</span>
          <span class="fin-value negative">${formatValue(balance.liabilities)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Long-term Debt</span>
          <span class="fin-value">${formatValue(balance.debt)}</span>
        </div>
      </div>

      <div class="fin-section">
        <h4>Liquidity & Returns</h4>
        <div class="ratio-grid">
          <div class="ratio-card ${ratios.currentRatio >= 1.5 ? 'good' : ratios.currentRatio >= 1 ? 'ok' : 'bad'}">
            <div class="ratio-value">${formatValue(ratios.currentRatio, 'ratio')}x</div>
            <div class="ratio-label">Current Ratio</div>
            <div class="ratio-hint">${ratios.currentRatio >= 1.5 ? 'Liquid' : ratios.currentRatio >= 1 ? 'Adequate' : 'Tight'}</div>
          </div>
          <div class="ratio-card ${ratios.debtToEquity !== null && ratios.debtToEquity < 0.5 ? 'good' : ratios.debtToEquity < 1 ? 'ok' : 'bad'}">
            <div class="ratio-value">${formatValue(ratios.debtToEquity, 'ratio')}x</div>
            <div class="ratio-label">Debt/Equity</div>
            <div class="ratio-hint">${ratios.debtToEquity < 0.5 ? 'Low leverage' : ratios.debtToEquity < 1 ? 'Moderate' : 'High leverage'}</div>
          </div>
          <div class="ratio-card ${ratios.roe >= 0.20 ? 'good' : ratios.roe >= 0.10 ? 'ok' : 'bad'}">
            <div class="ratio-value">${formatValue(ratios.roe, 'percent')}</div>
            <div class="ratio-label">ROE</div>
            <div class="ratio-hint">${ratios.roe >= 0.25 ? 'Exceptional' : ratios.roe >= 0.15 ? 'Strong' : 'Below avg'}</div>
          </div>
          <div class="ratio-card ${ratios.roa >= 0.10 ? 'good' : ratios.roa >= 0.05 ? 'ok' : 'bad'}">
            <div class="ratio-value">${formatValue(ratios.roa, 'percent')}</div>
            <div class="ratio-label">ROA</div>
            <div class="ratio-hint">${ratios.roa >= 0.10 ? 'Efficient' : ratios.roa >= 0.05 ? 'Average' : 'Low'}</div>
          </div>
        </div>
      </div>

      <div class="fin-section">
        <h4>Cash Position</h4>
        <div class="cash-hero">
          <span class="cash-value">${formatValue(balance.cash)}</span>
          <span class="cash-label">Cash & Equivalents</span>
        </div>
        ${cashRunway ? `
        <div class="cash-runway">
          <div class="runway-bar" style="width: ${Math.min(cashRunway / 24 * 100, 100)}%"></div>
          <span class="runway-label">${cashRunway}+ months runway</span>
        </div>
        ` : ''}
        ${balance.cash && balance.debt ? `
        <div class="cash-insight">
          Net Cash: <strong class="${balance.cash > balance.debt ? 'positive' : 'negative'}">${formatValue(balance.cash - balance.debt)}</strong>
          ${balance.cash > balance.debt ? '(Cash rich)' : '(Net debt)'}
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Get current timeframe state
 */
export function getCurrentTimeframe() {
  return currentTimeframe;
}

/**
 * Get current ticker
 */
export function getCurrentTicker() {
  return currentTicker;
}

// Export for use in analysis.js
export { formatValue, calcGrowth };
