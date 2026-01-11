// Macro Panel Module - Bloomberg-style market intelligence dashboard
import { fetchPolygon, fetchClaude } from './api.js';
import { setStockPrice } from './cache.js';

// Constants
const STORAGE_KEY = 'vhunter_macro_settings';
const AI_CACHE_KEY = 'vhunter_macro_ai_cache';

const DEFAULT_INDICES = [
  { ticker: 'SPY', name: 'S&P 500' },
  { ticker: 'QQQ', name: 'Nasdaq 100' },
  { ticker: 'DIA', name: 'Dow Jones' },
  { ticker: 'IWM', name: 'Russell 2000' }
];

const DEFAULT_VIX = { ticker: 'UVXY', name: 'VIX', isVix: true };

// Bond/Rate ETFs - inverse relationship to yields
const DEFAULT_RATES = [
  { ticker: 'SHY', name: '1-3Y Tsy', label: '2Y' },
  { ticker: 'IEI', name: '3-7Y Tsy', label: '5Y' },
  { ticker: 'IEF', name: '7-10Y Tsy', label: '10Y' },
  { ticker: 'TLT', name: '20Y+ Tsy', label: '20Y' }
];

// Keep for backward compatibility
const DEFAULT_BONDS = DEFAULT_RATES;

const DEFAULT_COMMODITIES = [
  { ticker: 'GLD', name: 'Gold' },
  { ticker: 'SLV', name: 'Silver' },
  { ticker: 'USO', name: 'Oil' },
  { ticker: 'UNG', name: 'NatGas' },
  { ticker: 'CPER', name: 'Copper' },
  { ticker: 'DBA', name: 'Agri' },
  { ticker: 'BITO', name: 'Bitcoin' }
];

// Global Indices ETFs
const GLOBAL_INDICES = [
  { ticker: 'VGK', name: 'Europe' },
  { ticker: 'FXI', name: 'China' },
  { ticker: 'EWJ', name: 'Japan' },
  { ticker: 'VEA', name: 'Dev Ex-US' }
];

// Rotation & Flow ETFs
const ROTATION_ETFS = [
  { ticker: 'IWF', name: 'Russell Growth' },
  { ticker: 'IWD', name: 'Russell Value' },
  { ticker: 'HYG', name: 'High Yield' },
  { ticker: 'LQD', name: 'Inv Grade' },
  { ticker: 'UUP', name: 'Dollar Index' },
  { ticker: 'EEM', name: 'Emerging Mkts' }
];

// Mega-cap leaders (Mag7 + important names)
const DEFAULT_MAG7 = [
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'AVGO', name: 'Broadcom' },
  { ticker: 'AMD', name: 'AMD' },
  { ticker: 'NFLX', name: 'Netflix' },
  { ticker: 'CRM', name: 'Salesforce' },
  { ticker: 'ORCL', name: 'Oracle' },
  { ticker: 'ADBE', name: 'Adobe' }
];

// S&P 500 Sector ETFs
const DEFAULT_SECTORS = [
  { ticker: 'XLK', name: 'Technology', weight: 30 },
  { ticker: 'XLF', name: 'Financials', weight: 13 },
  { ticker: 'XLV', name: 'Healthcare', weight: 12 },
  { ticker: 'XLY', name: 'Consumer Disc', weight: 10 },
  { ticker: 'XLC', name: 'Communication', weight: 9 },
  { ticker: 'XLI', name: 'Industrials', weight: 8 },
  { ticker: 'XLP', name: 'Consumer Staples', weight: 6 },
  { ticker: 'XLE', name: 'Energy', weight: 4 },
  { ticker: 'XLU', name: 'Utilities', weight: 3 },
  { ticker: 'XLRE', name: 'Real Estate', weight: 2 },
  { ticker: 'XLB', name: 'Materials', weight: 2 }
];

// Tooltip definitions
const TOOLTIPS = {
  regime: {
    title: 'Market Regime',
    content: `Analyzes cross-asset moves to determine market sentiment:
• Risk-On: Stocks up, VIX down, bonds down
• Risk-Off: Stocks down, VIX up, bonds up (flight to safety)
• Rotation: Mixed signals, sector rotation in progress
• Divergence: Indices disagreeing (e.g., tech up, small caps down)`
  },
  yieldCurve: {
    title: 'Yield Curve',
    content: `Compares long-term (TLT/20Y) vs short-term (SHY/2Y) bonds:
• Steep: Long rates > Short rates = Growth expectations
• Flat: Rates converging = Slowdown ahead
• Inverted: Short > Long = Recession warning
Trading: Steep favors cyclicals, Flat/Inverted favors defensives`
  },
  riskAppetite: {
    title: 'Risk Appetite',
    content: `Measures SPY performance vs TLT (safe haven bonds):
• Positive: Money flowing into stocks = Risk-On
• Negative: Money flowing into bonds = Risk-Off
• Near zero: Balanced/uncertain
Trading: Strong positive = favor growth, Strong negative = favor quality`
  },
  volRegime: {
    title: 'Volatility Regime',
    content: `UVXY tracks VIX (fear gauge). Thresholds:
• <15: Complacency - buy protection cheap
• 15-20: Normal conditions
• 20-30: Elevated - caution warranted
• >30: Fear/Panic - contrarian buying opportunity
Trading: High VIX = wider stops, smaller size`
  },
  techValue: {
    title: 'Tech vs Value',
    content: `Compares QQQ (growth/tech) vs IWM (small cap/value):
• Positive: Growth/Tech leading = favor momentum
• Negative: Value/Small caps leading = favor rotation
• Large spread: Potential mean reversion setup
Trading: Follow the leader or fade extremes`
  },
  goldSignal: {
    title: 'Gold Signal',
    content: `Gold behavior relative to stocks:
• Both up: Inflation hedge / liquidity driven
• GLD up, SPY down: Fear trade / safe haven
• GLD down, SPY up: Risk-on, no fear
• Both down: Deflation / liquidity crunch
Trading: GLD+SPY divergence = macro uncertainty`
  },
  breadth: {
    title: 'Market Breadth',
    content: `Counts how many major indices are positive:
• 4/4: Strong broad rally
• 3/4: Healthy with rotation
• 2/4: Mixed / transitional
• 1/4 or 0/4: Broad weakness
Trading: Narrow rallies (1-2 up) often reverse`
  },
  growthValue: {
    title: 'Growth vs Value Rotation',
    content: `Compares IWF (Russell 1000 Growth) vs IWD (Russell 1000 Value):
• Growth Leading: AI, tech, momentum names bid
• Value Leading: Financials, energy, dividend stocks preferred
• Extreme spreads (>1%) may mean revert
Trading: Follow the rotation for 2-5 days, then fade extremes`
  },
  creditSpread: {
    title: 'Credit Spread',
    content: `Compares HYG (High Yield) vs LQD (Inv Grade) bonds:
• HYG outperforming: Risk appetite in credit, bullish signal
• LQD outperforming: Flight to quality, defensive
• Both down: Rising rates, tightening conditions
Trading: Wide credit spread = reduced risk; Tight = full risk-on`
  },
  dollarStrength: {
    title: 'Dollar Strength',
    content: `UUP tracks the US Dollar Index (DXY):
• Strong dollar: Headwind for commodities, multinationals, EM
• Weak dollar: Tailwind for gold, commodities, exporters
• Breaking key levels often accelerates trends
Trading: Dollar strength often precedes equity weakness`
  },
  emFlow: {
    title: 'EM Flow',
    content: `Compares EEM (Emerging Markets) vs SPY:
• EEM outperforming: Global risk-on, dollar weakness
• SPY outperforming: US exceptionalism, EM stress
• Large divergence = potential reversion trade
Trading: EM leads in weak dollar environment`
  },
  defensiveRotation: {
    title: 'Defensive vs Cyclical',
    content: `Compares XLP (Consumer Staples) vs XLY (Consumer Discretionary):
• XLP leading: Defensive rotation, late cycle behavior
• XLY leading: Risk-on, consumer confidence high
• Ratio breaks often persist for weeks
Trading: XLP leadership often precedes corrections`
  },
  qualitySpread: {
    title: 'Large vs Small Cap',
    content: `Compares SPY (Large Cap) vs IWM (Small Cap):
• SPY leading: Quality/size premium, cautious market
• IWM leading: Risk-on, economic expansion bet
• Small caps lead early cycle, lag late cycle
Trading: IWM strength = bullish breadth signal`
  }
};

// Detailed tooltips for data items - key insight first, then explanation
const DATA_TIPS = {
  // Indices
  SPY: 'THE benchmark. S&P 500 tracks 500 largest US companies. If SPY is down, most stocks are down.',
  QQQ: 'Tech-heavy = high beta. Nasdaq 100 is 50%+ tech. Leads in risk-on, drops harder in selloffs.',
  DIA: 'Old economy proxy. Dow 30 = industrials, financials. Lags tech rallies, holds better in corrections.',
  IWM: 'Risk appetite gauge. Small caps need liquidity + confidence. IWM leading = broad risk-on.',
  UVXY: 'FEAR INDEX. VIX spikes = market stress. <15 complacent, 20+ caution, 30+ panic/opportunity.',
  // Rates (Bond ETFs - inverse to yields)
  SHY: 'Fed policy proxy. 1-3Y bonds move with rate expectations. Rising = Fed hawkish.',
  IEI: 'Mid-curve rates. 3-7Y bonds balance growth vs Fed outlook.',
  IEF: '10Y benchmark. Most watched rate globally. Mortgage rates, equity valuations key off this.',
  TLT: 'Duration risk. 20Y+ bonds = max rate sensitivity. Flight to safety bid in crashes.',
  // Commodities
  GLD: 'Crisis hedge. Gold rises on: inflation fears, USD weakness, geopolitical risk, real rates falling.',
  SLV: 'Industrial + precious. Silver has more beta than gold. Outperforms in commodity rallies.',
  USO: 'Global demand proxy. Oil up = growth optimism OR supply fear. Watch vs equity correlation.',
  UNG: 'Weather + energy. Natgas is volatile, seasonal. Winter demand, LNG exports key drivers.',
  CPER: 'Dr. Copper = economic health. Copper demand = construction, EVs, infrastructure spending.',
  DBA: 'Inflation input. Agriculture prices feed into CPI. Weather, supply chains matter.',
  BITO: 'Risk-on extreme. Bitcoin = liquidity barometer. Leads risk appetite, high correlation to QQQ.',
  // Global Indices
  VGK: 'Europe exposure. Financials heavy, energy. Weak euro helps, rates hurt.',
  FXI: 'China Large-Cap proxy. Policy-driven, volatile. Property, tech regulation risks.',
  EWJ: 'Japan = weak yen play. Exporters benefit from yen weakness. BOJ policy key.',
  VEA: 'Non-US developed. Diversification from US. Currency exposure matters.',
  // Rotation ETFs
  IWF: 'Growth factor. Russell 1000 Growth = momentum, high P/E. Leads in low rate environment.',
  IWD: 'Value factor. Russell 1000 Value = dividends, low P/E. Outperforms in rising rate environment.',
  HYG: 'Credit risk appetite. High yield bonds = junk. Spreads tighten in risk-on, blow out in stress.',
  LQD: 'Quality credit. Investment grade corps. Flight to quality within credit.',
  UUP: 'Dollar strength. Strong USD = headwind for commodities, EM, multinationals. Liquidity drain.',
  EEM: 'EM risk proxy. Emerging markets need: weak USD, global growth, commodity demand.',
  XLP: 'Defensive staples. Toothpaste, food, tobacco. Steady demand regardless of economy.',
  XLY: 'Consumer health. Discretionary = confidence. Amazon, Tesla, Home Depot. Risk-on sector.',
  // Sectors
  XLK: 'Tech dominates. ~30% of S&P. AAPL, MSFT, NVDA. Growth + quality factor exposure.',
  XLF: 'Rate sensitive. Banks profit from yield curve steepness. Insurance, asset managers.',
  XLV: 'Defensive growth. Healthcare = steady demand. Pharma, insurers, biotech mix.',
  XLC: 'GOOGL + META heavy. Communication services. Ad revenue = economic bellwether.',
  XLI: 'Economic cycle. Industrials lead in early cycle recovery. Defense, aerospace, machinery.',
  XLE: 'Oil beta. Energy = pure commodity play. High dividend, volatile with crude.',
  XLU: 'Bond proxy. Utilities = yield + safety. Underperforms in rising rate environment.',
  XLRE: 'Rate sensitive. Real estate = leverage. Benefits from low rates, hurt by higher.',
  XLB: 'Commodity input. Materials = mining, chemicals. Inflation + growth play.',
  // Mag7 & Leaders
  AAPL: 'Cash king. Services growth key. iPhone cycles, China exposure risks.',
  MSFT: 'Cloud + AI. Azure growth, enterprise sticky. Safest mega-cap.',
  GOOGL: 'Ad monopoly. Search + YouTube. AI threat/opportunity. Antitrust risk.',
  AMZN: 'AWS = profit. E-commerce = revenue. Consumer bellwether.',
  META: 'Ad recovery. Instagram, WhatsApp moats. Metaverse spend risk.',
  NVDA: 'AI kingmaker. GPU monopoly for AI training. Valuation = growth must continue.',
  TSLA: 'Musk premium/risk. EV leader but competition rising. High beta meme-ish.',
  AVGO: 'AI infrastructure. Networking, custom chips. Dividend growth.',
  AMD: 'NVDA challenger. CPU + GPU competition. Data center key driver.',
  NFLX: 'Streaming winner. Password crackdown worked. Ad tier growth.',
  CRM: 'Enterprise SaaS. AI features key. Integration + platform play.',
  ORCL: 'Cloud pivot. Database legacy + cloud growth. AI infrastructure.',
  ADBE: 'Creative monopoly. Photoshop, PDF. AI features + pricing power.'
};

// Quick metric tooltips - conclusion first, then explanation
const METRIC_TIPS = {
  YIELD: 'STEEP = growth ahead, FLAT = slowdown. Spread between 10Y and 2Y Treasury yields. Inverted curve historically precedes recession.',
  RISK: 'Positive = RISK-ON. Compares SPY (stocks) vs TLT (bonds). Money flowing to stocks = bullish, to bonds = defensive.',
  VOL: 'Your fear gauge. VIX <15 = complacent (buy protection cheap), 20+ = elevated, 30+ = panic (contrarian opportunity).',
  'TECH/VAL': 'Shows market preference. QQQ vs IWD spread. Positive = growth/momentum favored, Negative = value/dividend rotation.',
  GOLD: 'Safe haven signal. Gold rising with stocks = inflation fear. Gold up, stocks down = risk-off flight.',
  BREADTH: 'Rally health check. How many indices positive? 4/4 = strong, 1-2/4 = narrow/risky rally, may reverse.'
};

// Rotation card tooltips - conclusion first, then explanation
const ROTATION_TIPS = {
  growthValue: 'GROWTH leading = momentum, AI, tech bid. VALUE leading = dividends, financials, energy favored. Extreme spreads mean-revert.',
  creditSpread: 'TIGHT spreads = risk-on, no stress. WIDE spreads = credit fear, reduce risk. HYG vs LQD shows junk vs quality preference.',
  dollarStrength: 'Strong USD = HEADWIND for gold, commodities, EM, multinationals. Weak USD = tailwind for risk assets globally.',
  emFlow: 'EM outperforming = global risk-on cycle, weak dollar. US outperforming = flight to quality, dollar strength.',
  defensiveRotation: 'STAPLES leading = late cycle, caution. DISCRETIONARY leading = consumer confident, early cycle risk-on.',
  qualitySpread: 'Large caps leading = flight to quality, caution. Small caps leading = risk appetite, liquidity abundant, bullish breadth.'
};

// Strip section tooltips - dynamic with current data
const STRIP_TIPS = {
  IDX: {
    title: 'US Market Indices',
    getContent: () => {
      const spy = macroData['SPY'];
      const qqq = macroData['QQQ'];
      const iwm = macroData['IWM'];
      const vix = macroData['UVXY'];

      let status = 'Loading...';
      if (spy && qqq) {
        const allUp = spy.changePercent > 0 && qqq.changePercent > 0;
        const allDown = spy.changePercent < 0 && qqq.changePercent < 0;
        const techLeading = qqq.changePercent > spy.changePercent;
        const smallCapStrong = iwm && iwm.changePercent > spy.changePercent;

        if (allUp && smallCapStrong) status = '🟢 RISK-ON: Broad rally, small caps leading';
        else if (allUp && techLeading) status = '🟢 RISK-ON: Tech leading the rally';
        else if (allUp) status = '🟢 RISK-ON: Markets higher';
        else if (allDown) status = '🔴 RISK-OFF: Broad selling pressure';
        else status = '🟡 MIXED: Rotation in progress';
      }

      return `<div class="tip-status">${status}</div>
<div class="tip-detail">SPY = S&P 500 benchmark (large cap)
QQQ = Nasdaq 100 (tech-heavy, higher beta)
DIA = Dow 30 (old economy, industrials)
IWM = Russell 2000 (small caps, risk appetite)
VIX = Fear gauge (inverse to confidence)</div>`;
    }
  },
  RATE: {
    title: 'Treasury Rates (Bond ETFs)',
    getContent: () => {
      const tlt = macroData['TLT'];
      const shy = macroData['SHY'];

      let status = 'Loading...';
      if (tlt && shy) {
        const spread = tlt.changePercent - shy.changePercent;
        if (spread > 0.1) status = '🟢 STEEPENING: Growth expectations rising';
        else if (spread < -0.1) status = '🔴 FLATTENING: Slowdown signal, Fed too tight';
        else status = '🟡 STABLE: Curve holding steady';
      }

      return `<div class="tip-status">${status}</div>
<div class="tip-detail">These are BOND ETFs (inverse to yields):
• Bond price UP = Yields DOWN
• Bond price DOWN = Yields UP

SHY (2Y) = Fed policy expectations
IEI (5Y) = Mid-curve, balanced view
IEF (10Y) = Key benchmark for mortgages
TLT (20Y+) = Duration risk, flight to safety

CURVE = TLT vs SHY spread. Steep = growth, Flat = caution.</div>`;
    }
  },
  CMDY: {
    title: 'Commodities',
    getContent: () => {
      const gld = macroData['GLD'];
      const uso = macroData['USO'];
      const cper = macroData['CPER'];

      let status = 'Loading...';
      if (gld && uso) {
        const goldUp = gld.changePercent > 0.2;
        const oilUp = uso.changePercent > 0.5;
        const copperUp = cper && cper.changePercent > 0.3;

        if (goldUp && !oilUp) status = '🟡 SAFE HAVEN: Gold bid, risk-off tone';
        else if (oilUp && copperUp) status = '🟢 GROWTH BID: Industrial commodities strong';
        else if (goldUp && oilUp) status = '⚠️ INFLATION: All commodities rising';
        else status = '🟡 NEUTRAL: Mixed commodity signals';
      }

      return `<div class="tip-status">${status}</div>
<div class="tip-detail">GLD = Gold (fear/inflation hedge)
SLV = Silver (industrial + precious)
USO = Oil (global demand proxy)
UNG = Natural Gas (weather/energy)
CPER = Copper ("Dr. Copper" = economy)
DBA = Agriculture (food inflation)
BITO = Bitcoin (risk-on extreme)</div>`;
    }
  },
  GLBL: {
    title: 'Global Markets',
    getContent: () => {
      const vgk = macroData['VGK'];
      const fxi = macroData['FXI'];
      const ewj = macroData['EWJ'];
      const spy = macroData['SPY'];

      let status = 'Loading...';
      if (spy) {
        const usLeading = vgk && fxi && (spy.changePercent > vgk.changePercent && spy.changePercent > fxi.changePercent);
        const globalRally = vgk && fxi && vgk.changePercent > 0 && fxi.changePercent > 0;

        if (usLeading) status = '🇺🇸 US OUTPERFORMING: Dollar strength, flight to quality';
        else if (globalRally) status = '🌍 GLOBAL RISK-ON: International markets strong';
        else status = '🟡 MIXED: Regional divergence';
      }

      return `<div class="tip-status">${status}</div>
<div class="tip-detail">VGK = Europe (financials, energy heavy)
FXI = China (policy-driven, volatile)
EWJ = Japan (weak yen = exporters benefit)
VEA = Developed Ex-US (diversification)

US outperforming = strong dollar, safe haven
Global leading = weak dollar, risk-on cycle</div>`;
    }
  }
};

// ============================================
// AI DYNAMIC TOOLTIP SYSTEM - Centralized
// ============================================

// AI tooltip cache in memory (loaded from DB on demand)
let aiTooltipCache = {};

// Get user ID for DB operations
function getUserId() {
  return localStorage.getItem('vhunter_user_id') || 'vhunter-serhat';
}

// Fetch AI tooltip from DB
async function fetchAiTooltipFromDb(section) {
  try {
    const response = await fetch(`https://vhunter-proxy.vhunter.workers.dev/api/macro-tooltips/${section}`, {
      headers: { 'X-User-Id': getUserId() }
    });
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    return null;
  } catch (e) {
    console.warn('Failed to fetch AI tooltip from DB:', e);
    return null;
  }
}

// Save AI tooltip to DB
async function saveAiTooltipToDb(section, content) {
  try {
    await fetch(`https://vhunter-proxy.vhunter.workers.dev/api/macro-tooltips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId()
      },
      body: JSON.stringify({ section, content })
    });
  } catch (e) {
    console.warn('Failed to save AI tooltip to DB:', e);
  }
}

// Build market context for AI prompts
function buildMarketContext(section) {
  const lines = [];

  switch (section) {
    case 'IDX':
      lines.push('US INDICES TODAY:');
      DEFAULT_INDICES.forEach(idx => {
        const d = macroData[idx.ticker];
        if (d) lines.push(`${idx.ticker}: $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
      });
      const vix = macroData[DEFAULT_VIX.ticker];
      if (vix) lines.push(`VIX (UVXY): $${vix.price?.toFixed(2)} (${vix.changePercent >= 0 ? '+' : ''}${vix.changePercent?.toFixed(2)}%)`);
      break;

    case 'RATE':
      lines.push('TREASURY BOND ETFS TODAY (inverse to yields):');
      DEFAULT_RATES.forEach(rate => {
        const d = macroData[rate.ticker];
        if (d) lines.push(`${rate.label} (${rate.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
      });
      const tlt = macroData['TLT'];
      const shy = macroData['SHY'];
      if (tlt && shy) {
        const spread = (tlt.changePercent - shy.changePercent).toFixed(2);
        lines.push(`Curve spread (TLT-SHY): ${spread}%`);
      }
      break;

    case 'CMDY':
      lines.push('COMMODITIES TODAY:');
      DEFAULT_COMMODITIES.forEach(comm => {
        const d = macroData[comm.ticker];
        if (d) lines.push(`${comm.name} (${comm.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
      });
      break;

    case 'GLBL':
      lines.push('GLOBAL INDICES TODAY:');
      GLOBAL_INDICES.forEach(idx => {
        const d = macroData[idx.ticker];
        if (d) lines.push(`${idx.name} (${idx.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
      });
      const spy = macroData['SPY'];
      if (spy) lines.push(`US (SPY): $${spy.price?.toFixed(2)} (${spy.changePercent >= 0 ? '+' : ''}${spy.changePercent?.toFixed(2)}%)`);
      break;

    case 'SECTOR':
      lines.push('SECTOR PERFORMANCE TODAY:');
      const sectors = DEFAULT_SECTORS.map(s => ({
        ...s,
        changePercent: macroData[s.ticker]?.changePercent || 0
      })).sort((a, b) => b.changePercent - a.changePercent);
      sectors.forEach(s => {
        lines.push(`${s.name} (${s.ticker}): ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`);
      });
      break;

    case 'ROTATION':
      lines.push('ROTATION SIGNALS TODAY:');
      const m = metrics;
      if (m.growthValue) lines.push(`Growth/Value (IWF-IWD): ${m.growthValue.signal} (${m.growthValue.value?.toFixed(2)}%)`);
      if (m.creditSpread) lines.push(`Credit (HYG-LQD): ${m.creditSpread.signal} (${m.creditSpread.value?.toFixed(2)}%)`);
      if (m.dollarStrength) lines.push(`Dollar (UUP): ${m.dollarStrength.signal} (${m.dollarStrength.value?.toFixed(2)}%)`);
      if (m.emFlow) lines.push(`EM Flow (EEM-SPY): ${m.emFlow.signal} (${m.emFlow.value?.toFixed(2)}%)`);
      if (m.defensiveRotation) lines.push(`Def/Cyc (XLP-XLY): ${m.defensiveRotation.signal} (${m.defensiveRotation.value?.toFixed(2)}%)`);
      if (m.qualitySpread) lines.push(`Large/Small (SPY-IWM): ${m.qualitySpread.signal} (${m.qualitySpread.value?.toFixed(2)}%)`);
      break;

    default:
      lines.push('No specific context available');
  }

  return lines.join('\n');
}

// AI prompt templates for each section
const AI_TOOLTIP_PROMPTS = {
  IDX: (context) => `You are a Bloomberg terminal analyst. Based on today's US index moves:

${context}

Give a 2-3 sentence insight about what this tells us about market sentiment today. Be specific about which indices are leading/lagging and what it means for positioning. End with one actionable takeaway.

Format: Start with the key conclusion, then explain why.`,

  RATE: (context) => `You are a rates strategist. Based on today's Treasury ETF moves:

${context}

Explain in 2-3 sentences what the yield curve is telling us today. Is it steepening or flattening? What does this mean for growth expectations and Fed policy? End with what this means for equity positioning.

Remember: Bond prices move INVERSE to yields. TLT up = long rates falling.`,

  CMDY: (context) => `You are a commodities analyst. Based on today's commodity moves:

${context}

In 2-3 sentences, explain what commodities are signaling about inflation, growth, and risk appetite today. Highlight any notable divergences (e.g., gold vs oil, copper vs gold). End with one trading implication.`,

  GLBL: (context) => `You are a global macro strategist. Based on today's international market moves:

${context}

In 2-3 sentences, analyze the US vs international performance. Is the US outperforming or underperforming? What does this say about dollar strength, risk appetite, and global flows? End with one portfolio implication.`,

  SECTOR: (context) => `You are an equity sector strategist. Based on today's sector performance:

${context}

In 2-3 sentences, identify the rotation happening today. Which sectors are leading/lagging? Is this a risk-on or risk-off rotation? What cycle stage does this suggest? End with which sectors to favor.`,

  ROTATION: (context) => `You are a factor rotation analyst. Based on today's rotation signals:

${context}

In 2-3 sentences, synthesize what these cross-asset signals are telling us. Is money flowing to growth or value? Risk-on or defensive? What's the dollar doing and how does it affect other assets? End with the dominant theme today.`
};

// Generate AI insight for a section (always generates fresh, saves to DB)
async function generateAiTooltip(section) {
  const context = buildMarketContext(section);
  const promptFn = AI_TOOLTIP_PROMPTS[section];

  if (!promptFn) {
    return 'AI insight not available for this section.';
  }

  const prompt = promptFn(context);

  try {
    const response = await fetchClaude(prompt, true);

    // Cache in memory for current session
    aiTooltipCache[section] = {
      content: response,
      timestamp: Date.now()
    };

    // Save to DB (async, don't wait)
    saveAiTooltipToDb(section, response);

    return response;
  } catch (e) {
    console.error('AI tooltip error:', e);
    return `Failed to generate insight: ${e.message}`;
  }
}

// Load cached AI tooltip (from memory or DB)
async function loadCachedAiTooltip(section) {
  // Check memory cache first
  if (aiTooltipCache[section]) {
    return aiTooltipCache[section].content;
  }

  // Try DB
  const dbData = await fetchAiTooltipFromDb(section);
  if (dbData && dbData.content) {
    // Cache in memory
    aiTooltipCache[section] = {
      content: dbData.content,
      timestamp: new Date(dbData.updated_at || dbData.created_at).getTime()
    };
    return dbData.content;
  }

  return null;
}

// Update tooltip with AI content (forceRefresh = generate new, otherwise try cache first)
async function updateTooltipWithAi(section, tooltipEl, forceRefresh = false) {
  const aiContentEl = tooltipEl.querySelector('.ai-tooltip-content');
  const aiBtn = tooltipEl.querySelector('.ai-tooltip-btn');

  if (!aiContentEl) return;

  // Show loading state
  aiContentEl.innerHTML = '<span class="ai-loading">Analyzing...</span>';
  aiContentEl.classList.add('loading');
  if (aiBtn) aiBtn.disabled = true;

  try {
    let insight;

    if (!forceRefresh) {
      // Try to load from cache/DB first
      insight = await loadCachedAiTooltip(section);
    }

    if (!insight) {
      // Generate fresh
      insight = await generateAiTooltip(section);
    }

    aiContentEl.innerHTML = insight;
    aiContentEl.classList.remove('loading');
    aiContentEl.classList.add('loaded');

    // Update button to show refresh icon
    if (aiBtn) aiBtn.textContent = '↻';
  } catch (e) {
    aiContentEl.innerHTML = `<span class="ai-error">Error: ${e.message}</span>`;
    aiContentEl.classList.remove('loading');
  } finally {
    if (aiBtn) aiBtn.disabled = false;
  }
}

// Render strip label with tooltip icon (AI insights loaded via global refresh)
function renderStripLabel(key, label) {
  const tip = STRIP_TIPS[key];
  if (!tip) return `<div class="data-strip-label">${label}</div>`;

  const content = tip.getContent();

  return `
    <div class="data-strip-label">
      <span class="strip-label-text">${label}</span>
      <div class="macro-tooltip strip-tip" data-tip-key="${key}">
        <span class="tooltip-icon">?</span>
        <div class="tooltip-content">
          <div class="tooltip-title">${tip.title}</div>
          <div class="tooltip-text">${content}</div>
          <div class="ai-tooltip-section">
            <div class="ai-label">AI Insight</div>
            <div class="ai-tooltip-content" data-ai-section="${key}">
              <span class="ai-placeholder">Generate AI Analysis to see insight</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Refresh all AI tooltips at once (called from main AI analysis button)
async function refreshAllAiTooltips() {
  const sections = ['IDX', 'RATE', 'CMDY', 'GLBL', 'SECTOR', 'ROTATION'];

  // Update all tooltip content elements to show loading state
  sections.forEach(section => {
    const contentEls = document.querySelectorAll(`[data-ai-section="${section}"]`);
    contentEls.forEach(el => {
      el.innerHTML = '<span class="ai-loading">Analyzing...</span>';
      el.classList.remove('loaded');
    });
  });

  // Generate insights in parallel
  const results = await Promise.allSettled(
    sections.map(section => generateAiTooltip(section))
  );

  // Update tooltip content with results
  sections.forEach((section, i) => {
    const result = results[i];
    const contentEls = document.querySelectorAll(`[data-ai-section="${section}"]`);

    if (result.status === 'fulfilled' && result.value) {
      contentEls.forEach(el => {
        el.innerHTML = result.value;
        el.classList.add('loaded');
      });
    } else {
      contentEls.forEach(el => {
        el.innerHTML = `<span class="ai-error">Failed to generate</span>`;
      });
    }
  });
}

// Load cached AI tooltips from DB
async function loadCachedAiTooltips() {
  const sections = ['IDX', 'RATE', 'CMDY', 'GLBL', 'SECTOR', 'ROTATION'];

  for (const section of sections) {
    const cached = await loadCachedAiTooltip(section);
    if (cached) {
      const contentEls = document.querySelectorAll(`[data-ai-section="${section}"]`);
      contentEls.forEach(el => {
        el.innerHTML = cached;
        el.classList.add('loaded');
      });
    }
  }
}

let settings = {};
let refreshInterval = null;
let macroData = {};
let metrics = {};
let sparklineData = {}; // Store historical data for sparklines

// Load settings from localStorage
function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    settings = stored ? JSON.parse(stored) : {};
  } catch (e) {
    settings = {};
  }
  return settings;
}

// Save settings to localStorage
function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save macro settings:', e);
  }
}

// Get all tickers to fetch
function getAllTickers() {
  const tickers = new Set();
  DEFAULT_INDICES.forEach(i => tickers.add(i.ticker));
  tickers.add(DEFAULT_VIX.ticker);
  DEFAULT_RATES.forEach(r => tickers.add(r.ticker));
  DEFAULT_COMMODITIES.forEach(c => tickers.add(c.ticker));
  GLOBAL_INDICES.forEach(g => tickers.add(g.ticker));
  DEFAULT_SECTORS.forEach(s => tickers.add(s.ticker));
  ROTATION_ETFS.forEach(r => tickers.add(r.ticker));
  const mag7List = settings.mag7 || DEFAULT_MAG7;
  mag7List.forEach(item => {
    const ticker = typeof item === 'string' ? item : item.ticker;
    tickers.add(ticker);
  });
  if (settings.customIndices) {
    settings.customIndices.split(',').forEach(t => {
      const trimmed = t.trim().toUpperCase();
      if (trimmed) tickers.add(trimmed);
    });
  }
  return [...tickers];
}

// Fetch snapshot for a single ticker
async function fetchSnapshot(ticker) {
  try {
    const data = await fetchPolygon(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
    return data?.ticker || null;
  } catch (e) {
    console.warn(`Failed to fetch ${ticker}:`, e.message);
    return null;
  }
}

// Fetch historical data for sparklines (last 5 days, hourly)
async function fetchSparklineData(ticker) {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 5);

    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/range/1/hour/${from}/${to}?adjusted=true&sort=asc&limit=100`);

    if (data?.results?.length > 0) {
      // Extract closing prices and normalize to percentage change from first point
      const prices = data.results.map(r => r.c);
      const firstPrice = prices[0];
      const normalized = prices.map(p => ((p - firstPrice) / firstPrice) * 100);
      return { prices, normalized, firstPrice };
    }
    return null;
  } catch (e) {
    console.warn(`Failed to fetch sparkline for ${ticker}:`, e.message);
    return null;
  }
}

// Fetch sparklines for rotation pairs
async function fetchRotationSparklines() {
  const pairs = [
    ['IWF', 'IWD'],
    ['HYG', 'LQD'],
    ['UUP'],
    ['EEM', 'SPY'],
    ['XLP', 'XLY'],
    ['SPY', 'IWM']
  ];

  const allTickers = [...new Set(pairs.flat())];

  const results = await Promise.allSettled(
    allTickers.map(ticker => fetchSparklineData(ticker))
  );

  allTickers.forEach((ticker, i) => {
    if (results[i].status === 'fulfilled' && results[i].value) {
      sparklineData[ticker] = results[i].value;
    }
  });
}

// Generate SVG sparkline path - returns object with SVG and colors for legend
function generateSparklineSVG(ticker1, ticker2, width = 100, height = 32) {
  const data1 = sparklineData[ticker1];
  const data2 = ticker2 ? sparklineData[ticker2] : null;

  if (!data1?.normalized?.length) {
    return { svg: '<div class="sparkline-empty">Loading...</div>', color1: '#94a3b8', color2: '#94a3b8' };
  }

  const points1 = data1.normalized;
  const points2 = data2?.normalized || [];

  // Find min/max across both datasets for scaling
  const allPoints = [...points1, ...points2];
  const minVal = Math.min(...allPoints);
  const maxVal = Math.max(...allPoints);
  const range = maxVal - minVal || 1;

  // Add padding to range
  const padding = range * 0.1;
  const adjMin = minVal - padding;
  const adjMax = maxVal + padding;
  const adjRange = adjMax - adjMin;

  // Generate path for line 1
  const pathPoints1 = points1.map((val, i) => {
    const x = (i / (points1.length - 1)) * width;
    const y = height - ((val - adjMin) / adjRange) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path1 = `M${pathPoints1.join(' L')}`;

  // Line 1 color - use distinct colors for comparison
  const color1 = '#6366f1'; // Indigo for primary (first ticker)

  let path2 = '';
  let color2 = '#f59e0b'; // Amber for secondary (second ticker)

  if (points2.length > 0) {
    const pathPoints2 = points2.map((val, i) => {
      const x = (i / (points2.length - 1)) * width;
      const y = height - ((val - adjMin) / adjRange) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    path2 = `M${pathPoints2.join(' L')}`;
  }

  // Zero line position
  const zeroY = height - ((0 - adjMin) / adjRange) * height;

  const svg = `
    <svg class="rotation-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="0" y1="${zeroY.toFixed(1)}" x2="${width}" y2="${zeroY.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2"/>
      ${path2 ? `<path d="${path2}" fill="none" stroke="${color2}" stroke-width="1.5" opacity="0.7"/>` : ''}
      <path d="${path1}" fill="none" stroke="${color1}" stroke-width="2"/>
    </svg>
  `;

  return { svg, color1, color2 };
}

// Process snapshot data into standard format
function processSnapshot(data) {
  if (!data) return null;
  const price = data.lastTrade?.p || data.day?.c || data.prevDay?.c || 0;
  const prevClose = data.prevDay?.c || price;
  const change = data.todaysChange || (price - prevClose);
  const changePercent = data.todaysChangePerc || (prevClose ? ((change / prevClose) * 100) : 0);
  const todayVol = data.day?.v || 0;
  const prevVol = data.prevDay?.v || todayVol; // Use prev day volume as baseline
  return {
    price,
    prevClose,
    change,
    changePercent,
    high: data.day?.h || price,
    low: data.day?.l || price,
    volume: todayVol,
    prevVolume: prevVol,
    avgVolume: prevVol, // Use prev day as approximation for avg
    updated: data.updated
  };
}

// Fetch all macro data
async function fetchAllMacroData() {
  const allTickers = getAllTickers();
  console.log('Fetching macro data for:', allTickers);

  // Fetch snapshots and sparklines in parallel
  const [results] = await Promise.all([
    Promise.allSettled(allTickers.map(ticker => fetchSnapshot(ticker))),
    fetchRotationSparklines()
  ]);

  allTickers.forEach((ticker, i) => {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      const processed = processSnapshot(result.value);
      if (processed) {
        macroData[ticker] = processed;
        setStockPrice(ticker, processed.price);
      }
    }
  });

  // Calculate derived metrics
  metrics = calculateMetrics();
  updateLastUpdate();
}

// Calculate all derived metrics
function calculateMetrics() {
  const spy = macroData['SPY'];
  const qqq = macroData['QQQ'];
  const dia = macroData['DIA'];
  const iwm = macroData['IWM'];
  const tlt = macroData['TLT'];
  const shy = macroData['SHY'];
  const gld = macroData['GLD'];
  const uvxy = macroData['UVXY'];

  // Market Regime
  const regime = calculateMarketRegime(spy, qqq, tlt, uvxy, gld);

  // Yield Curve: TLT change - SHY change (steepening vs flattening)
  const yieldCurveSpread = (tlt?.changePercent || 0) - (shy?.changePercent || 0);
  let yieldCurveSignal = 'NEUTRAL';
  if (yieldCurveSpread > 0.3) yieldCurveSignal = 'STEEPENING';
  else if (yieldCurveSpread < -0.3) yieldCurveSignal = 'FLATTENING';

  // Risk Appetite: SPY - TLT
  const riskAppetite = (spy?.changePercent || 0) - (tlt?.changePercent || 0);
  let riskSignal = 'NEUTRAL';
  if (riskAppetite > 0.5) riskSignal = 'RISK-ON';
  else if (riskAppetite < -0.5) riskSignal = 'RISK-OFF';

  // Volatility Regime
  const vixPrice = uvxy?.price || 20;
  const vixChange = uvxy?.changePercent || 0;
  let volSignal = 'NORMAL';
  if (vixPrice > 50) volSignal = 'EXTREME';
  else if (vixPrice > 30) volSignal = 'FEAR';
  else if (vixPrice > 20) volSignal = 'ELEVATED';
  else if (vixPrice < 12) volSignal = 'COMPLACENT';

  // Tech vs Value: QQQ - IWM
  const techValue = (qqq?.changePercent || 0) - (iwm?.changePercent || 0);
  let techValueSignal = 'BALANCED';
  if (techValue > 0.5) techValueSignal = 'TECH';
  else if (techValue < -0.5) techValueSignal = 'VALUE';

  // Gold Signal
  const goldChange = gld?.changePercent || 0;
  const spyChange = spy?.changePercent || 0;
  let goldSignal = 'NEUTRAL';
  if (goldChange > 0.3 && spyChange < -0.3) goldSignal = 'SAFE HAVEN';
  else if (goldChange > 0.3 && spyChange > 0.3) goldSignal = 'INFLATION';
  else if (goldChange < -0.3 && spyChange > 0.3) goldSignal = 'RISK-ON';
  else if (goldChange < -0.3 && spyChange < -0.3) goldSignal = 'DEFLATION';

  // Breadth
  const indices = [spy, qqq, dia, iwm].filter(d => d);
  const upCount = indices.filter(d => d.changePercent > 0).length;
  const breadth = `${upCount}/${indices.length}`;
  let breadthSignal = 'MIXED';
  if (upCount === indices.length) breadthSignal = 'STRONG';
  else if (upCount >= indices.length - 1) breadthSignal = 'HEALTHY';
  else if (upCount <= 1) breadthSignal = 'WEAK';

  // === ROTATION METRICS ===
  const iwf = macroData['IWF'];
  const iwd = macroData['IWD'];
  const hyg = macroData['HYG'];
  const lqd = macroData['LQD'];
  const uup = macroData['UUP'];
  const eem = macroData['EEM'];
  const xlp = macroData['XLP'];
  const xly = macroData['XLY'];

  // Growth vs Value (IWF - IWD)
  const growthValueSpread = (iwf?.changePercent || 0) - (iwd?.changePercent || 0);
  let growthValueSignal = 'BALANCED';
  if (growthValueSpread > 0.3) growthValueSignal = 'GROWTH';
  else if (growthValueSpread < -0.3) growthValueSignal = 'VALUE';

  // Credit Spread (HYG - LQD)
  const creditSpread = (hyg?.changePercent || 0) - (lqd?.changePercent || 0);
  let creditSignal = 'NEUTRAL';
  if (creditSpread > 0.2) creditSignal = 'RISK-ON';
  else if (creditSpread < -0.2) creditSignal = 'RISK-OFF';

  // Dollar Strength
  const dollarChange = uup?.changePercent || 0;
  let dollarSignal = 'STABLE';
  if (dollarChange > 0.3) dollarSignal = 'STRONG';
  else if (dollarChange < -0.3) dollarSignal = 'WEAK';

  // EM Flow (EEM - SPY)
  const emSpread = (eem?.changePercent || 0) - (spy?.changePercent || 0);
  let emSignal = 'NEUTRAL';
  if (emSpread > 0.3) emSignal = 'EM LEADING';
  else if (emSpread < -0.3) emSignal = 'US LEADING';

  // Defensive Rotation (XLP - XLY)
  const defensiveSpread = (xlp?.changePercent || 0) - (xly?.changePercent || 0);
  let defensiveSignal = 'BALANCED';
  if (defensiveSpread > 0.3) defensiveSignal = 'DEFENSIVE';
  else if (defensiveSpread < -0.3) defensiveSignal = 'CYCLICAL';

  // Quality Spread (SPY - IWM)
  const qualitySpread = (spy?.changePercent || 0) - (iwm?.changePercent || 0);
  let qualitySignal = 'NEUTRAL';
  if (qualitySpread > 0.3) qualitySignal = 'LARGE CAP';
  else if (qualitySpread < -0.3) qualitySignal = 'SMALL CAP';

  return {
    regime,
    yieldCurve: { value: yieldCurveSpread, signal: yieldCurveSignal },
    riskAppetite: { value: riskAppetite, signal: riskSignal },
    volRegime: { value: vixPrice, change: vixChange, signal: volSignal },
    techValue: { value: techValue, signal: techValueSignal },
    goldSignal: { value: goldChange, signal: goldSignal },
    breadth: { value: breadth, upCount, total: indices.length, signal: breadthSignal },
    // Rotation metrics
    growthValue: { value: growthValueSpread, signal: growthValueSignal },
    creditSpread: { value: creditSpread, signal: creditSignal },
    dollarStrength: { value: dollarChange, signal: dollarSignal },
    emFlow: { value: emSpread, signal: emSignal },
    defensiveRotation: { value: defensiveSpread, signal: defensiveSignal },
    qualitySpread: { value: qualitySpread, signal: qualitySignal }
  };
}

// Calculate market regime
function calculateMarketRegime(spy, qqq, tlt, uvxy, gld) {
  const spyUp = (spy?.changePercent || 0) > 0.1;
  const qqqUp = (qqq?.changePercent || 0) > 0.1;
  const tltDown = (tlt?.changePercent || 0) < -0.1;
  const vixDown = (uvxy?.changePercent || 0) < -0.5;
  const vixUp = (uvxy?.changePercent || 0) > 1;
  const spyDown = (spy?.changePercent || 0) < -0.1;
  const tltUp = (tlt?.changePercent || 0) > 0.1;

  // Calculate risk score (-100 to +100)
  let score = 0;
  score += (spy?.changePercent || 0) * 15;
  score += (qqq?.changePercent || 0) * 10;
  score -= (uvxy?.changePercent || 0) * 5;
  score -= (tlt?.changePercent || 0) * 5;
  score = Math.max(-100, Math.min(100, score));

  let regime = 'NEUTRAL';
  let description = 'Mixed signals';

  if (spyUp && qqqUp && vixDown && tltDown) {
    regime = 'RISK-ON';
    description = 'Stocks up, VIX down, Bonds down';
  } else if (spyDown && vixUp && tltUp) {
    regime = 'RISK-OFF';
    description = 'Stocks down, VIX up, Bonds up';
  } else if (spyUp && !qqqUp) {
    regime = 'ROTATION';
    description = 'Sector rotation in progress';
  } else if ((spyUp && vixUp) || (spyDown && vixDown)) {
    regime = 'DIVERGENCE';
    description = 'Unusual cross-asset moves';
  } else if (spyUp || qqqUp) {
    regime = 'RISK-ON';
    description = 'Stocks leading higher';
  } else if (spyDown || vixUp) {
    regime = 'RISK-OFF';
    description = 'Defensive posture';
  }

  return { regime, description, score };
}

// Update last update timestamp
function updateLastUpdate() {
  const el = document.getElementById('macroLastUpdate');
  if (el) {
    el.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  }
}

// Render tooltip HTML
function renderTooltip(key) {
  const tip = TOOLTIPS[key];
  if (!tip) return '';
  return `
    <div class="macro-tooltip" data-tooltip="${key}">
      <span class="tooltip-icon">?</span>
      <div class="tooltip-content">
        <div class="tooltip-title">${tip.title}</div>
        <div class="tooltip-text">${tip.content.replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;
}

// Render market regime bar
function renderRegimeBar() {
  const container = document.getElementById('macroRegimeBar');
  if (!container || !metrics.regime) return;

  const { regime, description, score } = metrics.regime;
  const normalizedScore = (score + 100) / 2; // 0-100

  let regimeClass = 'neutral';
  if (regime === 'RISK-ON') regimeClass = 'risk-on';
  else if (regime === 'RISK-OFF') regimeClass = 'risk-off';
  else if (regime === 'ROTATION') regimeClass = 'rotation';
  else if (regime === 'DIVERGENCE') regimeClass = 'divergence';

  container.innerHTML = `
    <div class="regime-header">
      <div class="regime-label">MARKET REGIME</div>
      <div class="regime-value ${regimeClass}">${regime}</div>
      ${renderTooltip('regime')}
    </div>
    <div class="regime-gauge">
      <div class="regime-gauge-track">
        <div class="regime-gauge-fill" style="width: ${normalizedScore}%"></div>
        <div class="regime-gauge-marker" style="left: ${normalizedScore}%"></div>
      </div>
      <div class="regime-gauge-labels">
        <span>Risk-Off</span>
        <span>Neutral</span>
        <span>Risk-On</span>
      </div>
    </div>
    <div class="regime-description">${description}</div>
  `;
}

// Render quick metrics row - compact strip layout
function renderQuickMetrics() {
  const container = document.getElementById('macroQuickMetrics');
  if (!container) return;

  const m = metrics;

  const getSignalClass = (signal) => {
    if (['RISK-ON', 'STEEPENING', 'TECH', 'STRONG', 'HEALTHY', 'COMPLACENT'].includes(signal)) return 'bullish';
    if (['RISK-OFF', 'FLATTENING', 'VALUE', 'WEAK', 'FEAR', 'EXTREME', 'SAFE HAVEN', 'DEFLATION'].includes(signal)) return 'bearish';
    return 'neutral';
  };

  const metricsData = [
    { label: 'YIELD', signal: m.yieldCurve?.signal, value: `${m.yieldCurve?.value >= 0 ? '+' : ''}${(m.yieldCurve?.value || 0).toFixed(2)}%` },
    { label: 'RISK', signal: m.riskAppetite?.signal, value: `${m.riskAppetite?.value >= 0 ? '+' : ''}${(m.riskAppetite?.value || 0).toFixed(2)}%` },
    { label: 'VOL', signal: m.volRegime?.signal, value: `$${(m.volRegime?.value || 0).toFixed(0)}` },
    { label: 'TECH/VAL', signal: m.techValue?.signal, value: `${m.techValue?.value >= 0 ? '+' : ''}${(m.techValue?.value || 0).toFixed(2)}%` },
    { label: 'GOLD', signal: m.goldSignal?.signal, value: `${m.goldSignal?.value >= 0 ? '+' : ''}${(m.goldSignal?.value || 0).toFixed(2)}%` },
    { label: 'BREADTH', signal: m.breadth?.signal, value: `${m.breadth?.value || '--'}` }
  ];

  container.innerHTML = metricsData.map(item => {
    const tip = METRIC_TIPS[item.label] || '';
    return `
    <div class="metric-card" data-tip="${tip}">
      <span class="metric-label">${item.label}</span>
      <span class="metric-signal ${getSignalClass(item.signal)}">${item.signal || '--'}</span>
      <span class="metric-value">${item.value}</span>
    </div>
  `;
  }).join('');
}

// Generate mini sparkline SVG for rotation cards
function generateMiniSparkline(ticker1, ticker2, width = 70, height = 16) {
  const data1 = sparklineData[ticker1];
  const data2 = ticker2 ? sparklineData[ticker2] : null;

  if (!data1?.normalized?.length) return '';

  const points1 = data1.normalized;
  const points2 = data2?.normalized || [];

  const allPoints = [...points1, ...points2];
  const minVal = Math.min(...allPoints);
  const maxVal = Math.max(...allPoints);
  const range = maxVal - minVal || 1;
  const padding = range * 0.15;
  const adjMin = minVal - padding;
  const adjMax = maxVal + padding;
  const adjRange = adjMax - adjMin;

  const pathPoints1 = points1.map((val, i) => {
    const x = (i / (points1.length - 1)) * width;
    const y = height - ((val - adjMin) / adjRange) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path1 = `M${pathPoints1.join(' L')}`;

  const color1 = '#6366f1';
  const color2 = '#f59e0b';

  let path2 = '';
  if (points2.length > 0) {
    const pathPoints2 = points2.map((val, i) => {
      const x = (i / (points2.length - 1)) * width;
      const y = height - ((val - adjMin) / adjRange) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    path2 = `M${pathPoints2.join(' L')}`;
  }

  const zeroY = height - ((0 - adjMin) / adjRange) * height;

  return `
    <svg class="rotation-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="0" y1="${zeroY.toFixed(1)}" x2="${width}" y2="${zeroY.toFixed(1)}" stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="2,1"/>
      ${path2 ? `<path d="${path2}" fill="none" stroke="${color2}" stroke-width="1" opacity="0.5"/>` : ''}
      <path d="${path1}" fill="none" stroke="${color1}" stroke-width="1.5"/>
    </svg>
  `;
}

// Render rotation metrics row - compact strip layout with sparklines
function renderRotationMetrics() {
  const container = document.getElementById('macroRotationMetrics');
  if (!container) return;

  const m = metrics;

  // Signal classification
  const getSignalClass = (signal) => {
    if (['GROWTH', 'RISK-ON', 'WEAK', 'EM LEADING', 'CYCLICAL', 'SMALL CAP'].includes(signal)) return 'bullish';
    if (['VALUE', 'RISK-OFF', 'STRONG', 'US LEADING', 'DEFENSIVE', 'LARGE CAP'].includes(signal)) return 'bearish';
    return 'neutral';
  };

  // Arrow direction based on signal
  const getArrowClass = (signal) => {
    const bullish = ['GROWTH', 'RISK-ON', 'WEAK', 'EM LEADING', 'CYCLICAL', 'SMALL CAP'];
    const bearish = ['VALUE', 'RISK-OFF', 'STRONG', 'US LEADING', 'DEFENSIVE', 'LARGE CAP'];
    if (bullish.includes(signal)) return 'up';
    if (bearish.includes(signal)) return 'down';
    return 'flat';
  };

  // Compact arrow icon SVG
  const getArrowIcon = (direction) => {
    if (direction === 'up') return '<svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><path d="M5 1L9 6H1L5 1Z"/></svg>';
    if (direction === 'down') return '<svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><path d="M5 9L1 4H9L5 9Z"/></svg>';
    return '<svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="4" width="8" height="2" rx="1"/></svg>';
  };

  // Rotation card definitions with sparkline tickers
  const rotationCards = [
    { key: 'growthValue', label: 'GRW/VAL', data: m.growthValue, t1: 'IWF', t2: 'IWD' },
    { key: 'creditSpread', label: 'CREDIT', data: m.creditSpread, t1: 'HYG', t2: 'LQD' },
    { key: 'dollarStrength', label: 'DOLLAR', data: m.dollarStrength, t1: 'UUP', t2: null },
    { key: 'emFlow', label: 'EM FLOW', data: m.emFlow, t1: 'EEM', t2: 'SPY' },
    { key: 'defensiveRotation', label: 'DEF/CYC', data: m.defensiveRotation, t1: 'XLP', t2: 'XLY' },
    { key: 'qualitySpread', label: 'LG/SM', data: m.qualitySpread, t1: 'SPY', t2: 'IWM' }
  ];

  container.innerHTML = rotationCards.map(card => {
    const signal = card.data?.signal || 'NEUTRAL';
    const value = card.data?.value || 0;
    const signalClass = getSignalClass(signal);
    const arrowClass = getArrowClass(signal);
    const arrowIcon = getArrowIcon(arrowClass);
    const valueClass = value >= 0 ? 'positive' : 'negative';
    const sparkline = generateMiniSparkline(card.t1, card.t2);
    const tip = ROTATION_TIPS[card.key] || '';

    return `
      <div class="rotation-card ${signalClass}" data-key="${card.key}" data-tip="${tip}">
        <div class="rotation-header">
          <span class="rotation-label">${card.label}</span>
        </div>
        <div class="rotation-signal-row">
          <div class="rotation-arrow ${arrowClass}">${arrowIcon}</div>
          <span class="rotation-signal-text ${signalClass}">${signal}</span>
          <span class="rotation-value-num ${valueClass}">${value >= 0 ? '+' : ''}${value.toFixed(2)}%</span>
        </div>
        ${sparkline ? `<div class="rotation-sparkline-wrap">${sparkline}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Render a single asset card
function renderAssetCard(ticker, name, data, options = {}) {
  const { isVix = false, mini = false } = options;

  if (!data) {
    return `
      <div class="asset-card loading ${mini ? 'mini' : ''}" data-ticker="${ticker}">
        <div class="asset-ticker">${ticker}</div>
        <div class="asset-price">--</div>
        <div class="asset-change">--</div>
      </div>
    `;
  }

  let changePercent = data.changePercent;
  let changeClass = changePercent >= 0 ? 'positive' : 'negative';
  if (isVix) changeClass = changePercent >= 0 ? 'negative' : 'positive';

  const priceDisplay = data.price >= 1000 ? data.price.toFixed(0) : data.price >= 100 ? data.price.toFixed(1) : data.price.toFixed(2);

  return `
    <div class="asset-card ${changeClass} ${mini ? 'mini' : ''}" data-ticker="${ticker}" onclick="window.macroAnalyzeTicker && macroAnalyzeTicker('${ticker}')">
      <div class="asset-ticker">${mini ? ticker : name}</div>
      <div class="asset-price">$${priceDisplay}</div>
      <div class="asset-change ${changeClass}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</div>
    </div>
  `;
}

// Render data strip item
function renderDataItem(ticker, data, options = {}) {
  const { isVix = false, label = null } = options;
  const tip = DATA_TIPS[ticker] || '';
  const tipAttr = tip ? `data-tip="${tip}"` : '';

  if (!data) {
    return `
      <div class="data-item ${isVix ? 'vix' : ''}" data-ticker="${ticker}" ${tipAttr}>
        <span class="data-item-ticker">${label || ticker}</span>
        <span class="data-item-price">--</span>
        <span class="data-item-change flat">--</span>
      </div>
    `;
  }

  const changeClass = data.changePercent > 0.05 ? 'up' : data.changePercent < -0.05 ? 'down' : 'flat';
  const priceDisplay = data.price >= 1000 ? data.price.toFixed(0) : data.price >= 100 ? data.price.toFixed(1) : data.price.toFixed(2);
  const changeDisplay = `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`;

  return `
    <div class="data-item ${isVix ? 'vix' : ''}" data-ticker="${ticker}" ${tipAttr} onclick="window.macroAnalyzeTicker && macroAnalyzeTicker('${ticker}')">
      <span class="data-item-ticker">${label || ticker}</span>
      <span class="data-item-price">${priceDisplay}</span>
      <span class="data-item-change ${changeClass}">${changeDisplay}</span>
    </div>
  `;
}

// Render indices section
function renderIndices() {
  const container = document.getElementById('indicesCards');
  if (!container) return;

  const items = DEFAULT_INDICES.map(idx =>
    renderDataItem(idx.ticker, macroData[idx.ticker])
  ).join('');

  const vixItem = renderDataItem(DEFAULT_VIX.ticker, macroData[DEFAULT_VIX.ticker], { isVix: true, label: 'VIX' });

  container.innerHTML = `
    <div class="data-strip">
      ${renderStripLabel('IDX', 'IDX')}
      <div class="data-strip-items"><div class="data-strip-items-inner">${items}${vixItem}</div></div>
    </div>
  `;
}

// Render treasury rates section
function renderBonds() {
  const container = document.getElementById('bondsCards');
  if (!container) return;

  // Calculate curve steepness: TLT vs SHY (long vs short duration)
  const tlt = macroData['TLT'];
  const shy = macroData['SHY'];
  const curveMove = tlt && shy ? (tlt.changePercent - shy.changePercent).toFixed(2) : null;
  const isSteepening = curveMove && parseFloat(curveMove) > 0.1;
  const isFlattening = curveMove && parseFloat(curveMove) < -0.1;

  const items = DEFAULT_RATES.map(rate =>
    renderDataItem(rate.ticker, macroData[rate.ticker], { label: rate.label })
  ).join('');

  // Curve indicator
  const curveItem = curveMove !== null ? `
    <div class="data-item curve" data-tip="CURVE SHAPE = economic signal. STEEP (TLT outperforming) = growth expectations rising. FLAT/INVERTED = recession warning, Fed too tight.">
      <span class="data-item-ticker">CURVE</span>
      <span class="data-item-price">${isSteepening ? 'STEEP' : isFlattening ? 'FLAT' : 'HOLD'}</span>
      <span class="data-item-change ${isSteepening ? 'up' : isFlattening ? 'down' : 'flat'}">${curveMove > 0 ? '+' : ''}${curveMove}%</span>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="data-strip">
      ${renderStripLabel('RATE', 'RATE')}
      <div class="data-strip-items"><div class="data-strip-items-inner">${items}${curveItem}</div></div>
    </div>
  `;
}

// Render commodities section
function renderCommodities() {
  const container = document.getElementById('commoditiesCards');
  if (!container) return;

  const items = DEFAULT_COMMODITIES.map(comm =>
    renderDataItem(comm.ticker, macroData[comm.ticker])
  ).join('');

  container.innerHTML = `
    <div class="data-strip">
      ${renderStripLabel('CMDY', 'CMDY')}
      <div class="data-strip-items"><div class="data-strip-items-inner">${items}</div></div>
    </div>
  `;
}

// Render global indices section
function renderGlobalIndices() {
  const container = document.getElementById('globalIndicesCards');
  if (!container) return;

  const items = GLOBAL_INDICES.map(idx =>
    renderDataItem(idx.ticker, macroData[idx.ticker])
  ).join('');

  container.innerHTML = `
    <div class="data-strip">
      ${renderStripLabel('GLBL', 'GLBL')}
      <div class="data-strip-items"><div class="data-strip-items-inner">${items}</div></div>
    </div>
  `;
}

// Format volume for display (e.g., 1.2M, 450K)
function formatVolume(vol) {
  if (!vol || vol === 0) return '--';
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(0) + 'K';
  return vol.toString();
}

// Render Mag7 as compact professional list with all metrics on single line
function renderMag7() {
  const container = document.getElementById('mag7Cards');
  const summaryEl = document.getElementById('mag7Summary');
  if (!container) return;

  const mag7List = settings.mag7 || DEFAULT_MAG7;

  // Build compact list HTML with all columns
  let html = `
    <div class="mag7-list">
      <div class="mag7-list-header">
        <span>SYM</span>
        <span>NAME</span>
        <span>PRICE</span>
        <span>CHG%</span>
        <span>VOL</span>
        <span>V/AVG</span>
      </div>
  `;

  mag7List.forEach(item => {
    const ticker = typeof item === 'string' ? item : item.ticker;
    const name = typeof item === 'string' ? item : item.name;
    const data = macroData[ticker];
    const tip = DATA_TIPS[ticker] || name;

    if (!data) {
      html += `
        <div class="mag7-list-row loading" data-ticker="${ticker}" title="${tip}">
          <span class="mag7-list-ticker">${ticker}</span>
          <span class="mag7-list-name">${name}</span>
          <span class="mag7-list-price">--</span>
          <span class="mag7-list-change-pct">--</span>
          <span class="mag7-list-vol">--</span>
          <span class="mag7-list-volratio">--</span>
        </div>
      `;
      return;
    }

    const changeClass = data.changePercent >= 0 ? 'positive' : 'negative';
    const rowClass = data.changePercent >= 0 ? 'positive-row' : 'negative-row';
    const priceDisplay = data.price >= 1000 ? data.price.toFixed(0) : data.price.toFixed(2);
    const changePct = `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`;
    const volDisplay = formatVolume(data.volume);

    // Vol/Avg ratio - use avgVolume if available, otherwise estimate based on typical patterns
    const avgVol = data.avgVolume || data.volume; // fallback to current vol if no avg
    const volRatio = avgVol > 0 ? (data.volume / avgVol) : 1;
    const volRatioDisplay = volRatio.toFixed(1) + 'x';
    const volRatioClass = volRatio >= 1.5 ? 'high' : volRatio <= 0.7 ? 'low' : 'normal';

    html += `
      <div class="mag7-list-row ${rowClass}" data-ticker="${ticker}" title="${tip}" onclick="window.macroAnalyzeTicker && macroAnalyzeTicker('${ticker}')">
        <span class="mag7-list-ticker">${ticker}</span>
        <span class="mag7-list-name">${name}</span>
        <span class="mag7-list-price">$${priceDisplay}</span>
        <span class="mag7-list-change-pct ${changeClass}">${changePct}</span>
        <span class="mag7-list-vol">${volDisplay}</span>
        <span class="mag7-list-volratio ${volRatioClass}">${volRatioDisplay}</span>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  // Update summary
  const mag7Data = mag7List.map(item => {
    const ticker = typeof item === 'string' ? item : item.ticker;
    return macroData[ticker];
  }).filter(d => d);

  if (mag7Data.length > 0 && summaryEl) {
    const avgChange = mag7Data.reduce((sum, d) => sum + d.changePercent, 0) / mag7Data.length;
    const upCount = mag7Data.filter(d => d.changePercent > 0).length;
    const changeClass = avgChange >= 0 ? 'positive' : 'negative';
    summaryEl.innerHTML = `
      <span class="${changeClass}">${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
      <span class="mag7-ratio">${upCount}/${mag7Data.length}</span>
    `;
  }
}

// Render correlations
function renderCorrelations() {
  const container = document.getElementById('correlationsGrid');
  if (!container) return;

  // Simple same-day correlation approximation based on direction
  const pairs = [
    { a: 'SPY', b: 'QQQ', expected: 'Usually high (~0.9)' },
    { a: 'SPY', b: 'TLT', expected: 'Usually negative' },
    { a: 'SPY', b: 'GLD', expected: 'Context dependent' },
    { a: 'SPY', b: 'UVXY', expected: 'Always negative' }
  ];

  container.innerHTML = pairs.map(({ a, b, expected }) => {
    const dataA = macroData[a];
    const dataB = macroData[b];

    if (!dataA || !dataB) {
      return `<div class="corr-item"><span class="corr-pair">${a}/${b}</span><span class="corr-value">--</span></div>`;
    }

    // Simple same-direction indicator
    const sameDir = (dataA.changePercent * dataB.changePercent) > 0;
    const isVix = b === 'UVXY';
    const expected_same = !isVix && (a === 'SPY' && b === 'QQQ');
    const expected_opp = isVix || b === 'TLT';

    let status = 'normal';
    if (expected_same && sameDir) status = 'expected';
    else if (expected_opp && !sameDir) status = 'expected';
    else if (expected_same && !sameDir) status = 'unusual';
    else if (expected_opp && sameDir) status = 'unusual';

    const direction = sameDir ? 'Same' : 'Opposite';

    return `
      <div class="corr-item ${status}">
        <span class="corr-pair">${a}/${b}</span>
        <span class="corr-direction">${direction}</span>
        <span class="corr-note">${expected}</span>
      </div>
    `;
  }).join('');
}

// Render sector heatmap - flexbox with proportional widths
function renderSectorHeatmap() {
  const container = document.getElementById('sectorHeatmap');
  const summaryEl = document.getElementById('sectorSummary');
  if (!container) return;

  // Get sector data with performance
  const sectors = DEFAULT_SECTORS.map(sector => {
    const data = macroData[sector.ticker];
    return {
      ...sector,
      changePercent: data?.changePercent || 0,
      price: data?.price || 0,
      hasData: !!data
    };
  });

  // Calculate summary stats
  const validSectors = sectors.filter(s => s.hasData);
  const upCount = validSectors.filter(s => s.changePercent > 0).length;
  const avgChange = validSectors.length > 0
    ? validSectors.reduce((sum, s) => sum + s.changePercent, 0) / validSectors.length
    : 0;

  if (summaryEl && validSectors.length > 0) {
    const changeClass = avgChange >= 0 ? 'positive' : 'negative';
    summaryEl.innerHTML = `
      <span class="${changeClass}">${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>
      <span class="sector-ratio">${upCount}/${validSectors.length} up</span>
    `;
  }

  // Find max absolute change for color scaling
  const maxAbsChange = Math.max(...sectors.map(s => Math.abs(s.changePercent)), 0.5);

  // Total weight for calculating flex basis
  const totalWeight = sectors.reduce((sum, s) => sum + s.weight, 0);

  // Render flexbox tiles with proportional widths
  container.innerHTML = `<div class="sector-flex-grid">` + sectors.map(sector => {
    // Calculate flex basis as percentage of total weight
    const flexBasis = ((sector.weight / totalWeight) * 100).toFixed(1);
    // Minimum width based on weight
    const minWidth = sector.weight >= 10 ? '80px' : sector.weight >= 5 ? '60px' : '50px';
    const tip = DATA_TIPS[sector.ticker] || `${sector.name} Sector`;

    if (!sector.hasData) {
      return `
        <div class="sector-tile" style="flex: ${sector.weight} 1 ${minWidth};" data-ticker="${sector.ticker}" data-tip="${tip}">
          <div class="sector-ticker">${sector.ticker}</div>
          <div class="sector-name">${sector.name}</div>
          <div class="sector-change">--</div>
        </div>
      `;
    }

    const isPositive = sector.changePercent > 0;
    const isNegative = sector.changePercent < 0;
    const intensity = Math.min(Math.abs(sector.changePercent) / maxAbsChange, 1);

    // Generate color based on performance
    let bgColor, textColor;
    if (isPositive) {
      const h = 142;
      const s = 60 + intensity * 30;
      const l = 42 - intensity * 17;
      bgColor = `hsl(${h}, ${s}%, ${l}%)`;
      textColor = '#fff';
    } else if (isNegative) {
      const h = 0;
      const s = 65 + intensity * 25;
      const l = 45 - intensity * 15;
      bgColor = `hsl(${h}, ${s}%, ${l}%)`;
      textColor = '#fff';
    } else {
      bgColor = '#94a3b8';
      textColor = '#fff';
    }

    return `
      <div class="sector-tile"
           style="flex: ${sector.weight} 1 ${minWidth}; background: ${bgColor}; color: ${textColor}"
           onclick="window.macroAnalyzeTicker && macroAnalyzeTicker('${sector.ticker}')"
           data-ticker="${sector.ticker}"
           data-tip="${tip}">
        <div class="sector-ticker">${sector.ticker}</div>
        <div class="sector-name">${sector.name}</div>
        <div class="sector-change">${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}%</div>
      </div>
    `;
  }).join('') + `</div>`;
}

// Render calendar date
function renderCalendarDate() {
  const dateEl = document.getElementById('calendarDate');
  if (dateEl) {
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }
}

// Render all sections
function renderAll() {
  renderRegimeBar();
  renderQuickMetrics();
  renderRotationMetrics();
  renderSectorHeatmap();
  renderIndices();
  renderGlobalIndices();
  renderBonds();
  renderCommodities();
  renderMag7();
  renderCorrelations();
  renderCalendarDate();
  loadCachedAiAnalysis();
  loadCachedAiTooltips();
}

// Show loading state
function showLoading() {
  const loadingHtml = '<div class="macro-loading">Loading...</div>';
  ['sectorHeatmap', 'indicesCards', 'globalIndicesCards', 'bondsCards', 'commoditiesCards', 'mag7Cards'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = loadingHtml;
  });
}

// Start auto-refresh
function startAutoRefresh() {
  stopAutoRefresh();
  const interval = settings.refreshInterval || 60000;
  if (interval > 0) {
    refreshInterval = setInterval(async () => {
      await fetchAllMacroData();
      renderAll();
    }, interval);
  }
}

// Stop auto-refresh
function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Main loader function
export async function loadMacro() {
  console.log('[MACRO] loadMacro called');
  try {
    loadSettings();
    console.log('[MACRO] showing loading state');
    showLoading();
    console.log('[MACRO] fetching data...');
    await fetchAllMacroData();
    console.log('[MACRO] rendering...');
    renderAll();
    console.log('[MACRO] done');
    startAutoRefresh();
  } catch (e) {
    console.error('loadMacro error:', e);
    ['indicesCards', 'bondsCards', 'commoditiesCards', 'mag7Cards'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="macro-loading" style="color:#ef4444">Error: ${e.message}</div>`;
    });
  }
}

// Cleanup function - call when leaving macro page
export function unloadMacro() {
  stopAutoRefresh();
}

// Refresh macro data manually
export function refreshMacro() {
  showLoading();
  fetchAllMacroData().then(renderAll);
}

// Open settings modal
export function openMacroSettings() {
  const modal = document.getElementById('macroSettingsModal');
  if (modal) {
    modal.classList.add('active');
    document.getElementById('macroRefreshInterval').value = settings.refreshInterval || 60000;
    document.getElementById('customMag7').value = settings.mag7?.join(',') || '';
    document.getElementById('customIndices').value = settings.customIndices || '';
  }
}

// Close settings modal
export function closeMacroSettings() {
  const modal = document.getElementById('macroSettingsModal');
  if (modal) modal.classList.remove('active');
}

// Save settings from modal
export function saveMacroSettings(e) {
  e.preventDefault();
  settings.refreshInterval = parseInt(document.getElementById('macroRefreshInterval').value);
  const customMag7 = document.getElementById('customMag7').value.trim();
  settings.mag7 = customMag7 ? customMag7.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : null;
  settings.customIndices = document.getElementById('customIndices').value.trim();
  saveSettings();
  closeMacroSettings();
  startAutoRefresh();
  loadMacro();
}

// Fetch economic calendar via AI
export async function fetchEconomicCalendar() {
  const container = document.getElementById('calendarList');
  if (!container) return;

  container.innerHTML = '<div class="calendar-loading">Fetching events...</div>';

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 14); // Next 2 weeks

  const formatDate = (d) => d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const prompt = `List major US economic events, Fed speeches, and significant earnings from ${formatDate(today)} to ${formatDate(endDate)}.
Return ONLY a valid JSON array with NO markdown.
Format: [{"date":"Mon Jan 13","time":"8:30 AM ET","event":"Event Name","impact":"high"}]
impact: "high", "medium", or "low". Include date field for each event. Max 15 events, prioritize high impact. If none, return [].`;

  try {
    const response = await fetchClaude(prompt, true);
    let events = [];
    try {
      events = JSON.parse(response);
    } catch {
      const match = response.match(/\[[\s\S]*?\]/);
      if (match) events = JSON.parse(match[0]);
    }

    if (!Array.isArray(events) || events.length === 0) {
      container.innerHTML = '<div class="calendar-empty">No major events scheduled</div>';
      return;
    }

    // Group events by date
    const groupedEvents = {};
    events.forEach(e => {
      const date = e.date || 'Upcoming';
      if (!groupedEvents[date]) groupedEvents[date] = [];
      groupedEvents[date].push(e);
    });

    container.innerHTML = Object.entries(groupedEvents).map(([date, dayEvents]) => `
      <div class="calendar-date-group">
        <div class="calendar-date-header">${date}</div>
        ${dayEvents.map(e => `
          <div class="calendar-item impact-${e.impact || 'low'}">
            <span class="calendar-time">${e.time || '--'}</span>
            <span class="calendar-event">${e.event || 'Unknown'}</span>
            <span class="calendar-impact ${e.impact || 'low'}">${(e.impact || 'low').toUpperCase()}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `
      <div class="calendar-empty">
        <div class="calendar-note">Failed to fetch events</div>
        <button class="btn-secondary btn-sm" onclick="fetchEconomicCalendar()">Retry</button>
      </div>
    `;
  }
}

// Navigate to analyze page for a ticker
function macroAnalyzeTicker(ticker) {
  window.location.hash = `#analyze/${ticker}`;
}

// Toggle AI analysis section (collapsed class = hidden)
function toggleMacroAi() {
  const section = document.getElementById('macroAiSection');
  if (section) {
    section.classList.toggle('collapsed');
  }
}

// Generate AI macro analysis
async function generateMacroAnalysis() {
  const section = document.getElementById('macroAiSection');
  const container = document.getElementById('macroAiContent');
  const timeEl = document.getElementById('macroAiTime');
  const refreshBtn = document.querySelector('.macro-ai-refresh');
  if (!container) return;

  // Expand the section (remove collapsed class)
  if (section) section.classList.remove('collapsed');

  // Disable refresh button and show loading
  if (refreshBtn) refreshBtn.disabled = true;
  container.innerHTML = `
    <div class="macro-ai-loading">
      <div class="spinner"></div>
      <span>Analyzing cross-asset signals...</span>
    </div>
  `;

  // Build comprehensive market snapshot
  const buildMarketSnapshot = () => {
    const m = metrics;
    const lines = [];

    // Market regime
    lines.push(`MARKET REGIME: ${m.regime?.regime || 'N/A'} (Score: ${m.regime?.score || 0})`);
    lines.push(`Description: ${m.regime?.description || 'N/A'}`);
    lines.push('');

    // Core metrics
    lines.push('CORE SIGNALS:');
    lines.push(`- Yield Curve: ${m.yieldCurve?.signal} (${m.yieldCurve?.value?.toFixed(2)}%)`);
    lines.push(`- Risk Appetite (SPY-TLT): ${m.riskAppetite?.signal} (${m.riskAppetite?.value?.toFixed(2)}%)`);
    lines.push(`- Vol Regime (UVXY): ${m.volRegime?.signal} ($${m.volRegime?.value?.toFixed(1)}, ${m.volRegime?.change?.toFixed(1)}%)`);
    lines.push(`- Tech vs Value (QQQ-IWM): ${m.techValue?.signal} (${m.techValue?.value?.toFixed(2)}%)`);
    lines.push(`- Gold Signal: ${m.goldSignal?.signal} (${m.goldSignal?.value?.toFixed(2)}%)`);
    lines.push(`- Market Breadth: ${m.breadth?.signal} (${m.breadth?.value})`);
    lines.push('');

    // Rotation metrics
    lines.push('ROTATION & FLOW:');
    lines.push(`- Growth/Value (IWF-IWD): ${m.growthValue?.signal} (${m.growthValue?.value?.toFixed(2)}%)`);
    lines.push(`- Credit Spread (HYG-LQD): ${m.creditSpread?.signal} (${m.creditSpread?.value?.toFixed(2)}%)`);
    lines.push(`- Dollar: ${m.dollarStrength?.signal} (${m.dollarStrength?.value?.toFixed(2)}%)`);
    lines.push(`- EM Flow (EEM-SPY): ${m.emFlow?.signal} (${m.emFlow?.value?.toFixed(2)}%)`);
    lines.push(`- Defensive/Cyclical (XLP-XLY): ${m.defensiveRotation?.signal} (${m.defensiveRotation?.value?.toFixed(2)}%)`);
    lines.push(`- Large/Small Cap (SPY-IWM): ${m.qualitySpread?.signal} (${m.qualitySpread?.value?.toFixed(2)}%)`);
    lines.push('');

    // Indices
    lines.push('INDICES:');
    DEFAULT_INDICES.forEach(idx => {
      const d = macroData[idx.ticker];
      if (d) lines.push(`- ${idx.name} (${idx.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
    });
    const vix = macroData[DEFAULT_VIX.ticker];
    if (vix) lines.push(`- VIX (UVXY): $${vix.price?.toFixed(2)} (${vix.changePercent >= 0 ? '+' : ''}${vix.changePercent?.toFixed(2)}%)`);
    lines.push('');

    // Sectors
    lines.push('SECTOR PERFORMANCE (sorted by change):');
    const sectors = DEFAULT_SECTORS.map(s => ({
      ...s,
      changePercent: macroData[s.ticker]?.changePercent || 0
    })).sort((a, b) => b.changePercent - a.changePercent);
    sectors.forEach(s => {
      lines.push(`- ${s.name} (${s.ticker}): ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`);
    });
    lines.push('');

    // Bonds
    lines.push('BONDS:');
    DEFAULT_BONDS.forEach(b => {
      const d = macroData[b.ticker];
      if (d) lines.push(`- ${b.name} (${b.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
    });
    lines.push('');

    // Commodities
    lines.push('COMMODITIES:');
    DEFAULT_COMMODITIES.forEach(c => {
      const d = macroData[c.ticker];
      if (d) lines.push(`- ${c.name} (${c.ticker}): $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%)`);
    });

    return lines.join('\n');
  };

  const marketSnapshot = buildMarketSnapshot();
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const prompt = `Quick macro snapshot for ${today}:

${marketSnapshot}

Respond in EXACTLY this format (no markdown headers, no ##):

**REGIME**
One sentence: risk-on/off/rotation? What's driving it?

**KEY SIGNALS**
• First signal observation
• Second signal observation
• Third signal observation

**TRADE IDEAS**
• First trade idea
• Second trade idea

Rules:
- Use <span class="bullish">text</span> for bullish signals
- Use <span class="bearish">text</span> for bearish signals
- Use **bold** for emphasis
- Be direct and concise`;

  try {
    const response = await fetchClaude(prompt);

    // Parse sections from the response - handle multiple formats
    const sections = [];
    const sectionTitles = ['REGIME', 'KEY SIGNALS', 'TRADE IDEAS'];

    sectionTitles.forEach((title, i) => {
      // Match formats: "## REGIME", "1. **REGIME**", "**REGIME**", "REGIME:"
      const patterns = [
        new RegExp(`(?:^|\\n)#{1,3}\\s*${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i'),
        new RegExp(`\\d+\\.\\s*\\*\\*${title}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?=\\d+\\.\\s*\\*\\*|\\n#{1,3}|$)`, 'i'),
        new RegExp(`\\*\\*${title}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?=\\*\\*[A-Z]|\\n#{1,3}|$)`, 'i')
      ];

      for (const regex of patterns) {
        const match = response.match(regex);
        if (match && match[1]) {
          let content = match[1].trim();
          // Format content
          content = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^[-•]\s*/gm, '• ')
            .replace(/\n\n+/g, '<br><br>')
            .replace(/\n/g, '<br>');
          sections.push({ title, content });
          break;
        }
      }
    });

    // If parsing failed, use simple format with better markdown handling
    if (sections.length === 0) {
      let content = response
        .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')  // Convert ## headers to bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n+/g, '<br><br>')
        .replace(/\n/g, '<br>');
      sections.push({ title: 'MARKET ANALYSIS', content });
    }

    const timestamp = new Date().toLocaleTimeString();
    const dateStr = new Date().toLocaleDateString();

    const html = `
      <div class="macro-ai-box">
        ${sections.map(s => `
          <div class="macro-ai-section-block">
            <div class="macro-ai-section-title">${s.title}</div>
            <div class="macro-ai-section-content">${s.content}</div>
          </div>
        `).join('')}
      </div>
      <div class="macro-ai-timestamp">Generated ${dateStr} at ${timestamp}</div>
    `;

    container.innerHTML = html;

    // Update time in header
    if (timeEl) {
      timeEl.textContent = `${timestamp}`;
    }

    // Cache the result
    try {
      localStorage.setItem(AI_CACHE_KEY, JSON.stringify({
        html,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to cache AI analysis:', e);
    }

    // Also refresh all tooltip AI insights
    refreshAllAiTooltips();

  } catch (e) {
    console.error('AI analysis error:', e);
    container.innerHTML = `
      <div class="macro-ai-empty">
        <p style="color: #f87171;">Failed to generate analysis: ${e.message}</p>
        <button class="btn-secondary btn-sm" onclick="generateMacroAnalysis()" style="margin-top: 12px;">Retry</button>
      </div>
    `;
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// Load cached AI analysis (pre-loads content but doesn't auto-show)
function loadCachedAiAnalysis() {
  try {
    const cached = localStorage.getItem(AI_CACHE_KEY);
    if (cached) {
      const { html, timestamp } = JSON.parse(cached);
      // Load cached content if less than 24 hours old
      const age = Date.now() - timestamp;
      if (age < 24 * 60 * 60 * 1000) {
        const container = document.getElementById('macroAiContent');
        const timeEl = document.getElementById('macroAiTime');
        if (container) {
          container.innerHTML = html;
        }
        // Show cached time
        if (timeEl) {
          const cachedDate = new Date(timestamp);
          timeEl.textContent = cachedDate.toLocaleTimeString();
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load cached AI analysis:', e);
  }
}

// Expose functions to window
window.refreshMacro = refreshMacro;
window.openMacroSettings = openMacroSettings;
window.closeMacroSettings = closeMacroSettings;
window.saveMacroSettings = saveMacroSettings;
window.fetchEconomicCalendar = fetchEconomicCalendar;
window.macroAnalyzeTicker = macroAnalyzeTicker;
window.toggleMacroAi = toggleMacroAi;
window.generateMacroAnalysis = generateMacroAnalysis;
window.refreshAllAiTooltips = refreshAllAiTooltips;
window.unloadMacro = unloadMacro;
