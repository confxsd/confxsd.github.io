/**
 * @fileoverview Ticker Universe - Comprehensive stock universe by sector & characteristics
 * This feeds the macro agent's theme expansion
 */

export const universe = {
  // ═══════════════════════════════════════════════════════════════
  // SECTORS (GICS Classification)
  // ═══════════════════════════════════════════════════════════════

  sectors: {
    technology: {
      etf: 'XLK',
      mega: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'CSCO', 'ACN'],
      large: ['INTC', 'IBM', 'QCOM', 'TXN', 'AMAT', 'ADI', 'LRCX', 'MU', 'KLAC', 'SNPS'],
      mid: ['CDNS', 'FTNT', 'MCHP', 'ON', 'MPWR', 'SWKS', 'QRVO', 'TER', 'ENTG', 'WOLF'],
      growth: ['PLTR', 'NET', 'CRWD', 'ZS', 'DDOG', 'MDB', 'SNOW', 'PANW', 'OKTA', 'S'],
    },

    semiconductors: {
      etf: 'SMH',
      leaders: ['NVDA', 'AMD', 'AVGO', 'QCOM', 'TXN', 'ADI', 'INTC', 'MU', 'LRCX', 'AMAT'],
      equipment: ['ASML', 'KLAC', 'SNPS', 'CDNS', 'TER', 'ENTG', 'ONTO', 'ACLS', 'FORM'],
      memory: ['MU', 'WDC', 'STX'],
      fabless: ['NVDA', 'AMD', 'QCOM', 'AVGO', 'MRVL', 'SWKS', 'QRVO', 'MPWR', 'ON'],
      foundry: ['TSM', 'INTC', 'GFS', 'UMC'],
    },

    ai_infrastructure: {
      etf: 'BOTZ',
      compute: ['NVDA', 'AMD', 'INTC', 'AVGO', 'MRVL', 'SMCI'],
      cloud: ['AMZN', 'MSFT', 'GOOGL', 'ORCL', 'IBM'],
      networking: ['ANET', 'CSCO', 'JNPR', 'CIEN', 'LITE'],
      data_centers: ['EQIX', 'DLR', 'AMT', 'CCI'],
      software: ['PLTR', 'AI', 'PATH', 'SNOW', 'MDB', 'DDOG'],
    },

    financials: {
      etf: 'XLF',
      banks_mega: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'USB', 'PNC', 'TFC', 'COF'],
      banks_regional: ['SCHW', 'FITB', 'KEY', 'RF', 'CFG', 'HBAN', 'MTB', 'ZION', 'CMA', 'ALLY'],
      insurance: ['BRK.B', 'PGR', 'CB', 'MET', 'AIG', 'ALL', 'TRV', 'AFL', 'PRU', 'AMP'],
      asset_mgmt: ['BLK', 'BX', 'KKR', 'APO', 'ARES', 'CG', 'OWL', 'TPG'],
      fintech: ['V', 'MA', 'PYPL', 'SQ', 'COIN', 'AFRM', 'UPST', 'SOFI', 'NU'],
    },

    healthcare: {
      etf: 'XLV',
      pharma: ['LLY', 'JNJ', 'MRK', 'ABBV', 'PFE', 'BMY', 'AMGN', 'GILD', 'REGN', 'VRTX'],
      biotech: ['MRNA', 'BIIB', 'ILMN', 'SGEN', 'ALNY', 'BMRN', 'EXEL', 'INCY', 'SRPT', 'RARE'],
      devices: ['ABT', 'TMO', 'DHR', 'MDT', 'SYK', 'BSX', 'EW', 'ISRG', 'ZBH', 'HOLX'],
      services: ['UNH', 'ELV', 'CI', 'HUM', 'CVS', 'MCK', 'CAH', 'ABC', 'CNC', 'MOH'],
      tools: ['TMO', 'DHR', 'A', 'ILMN', 'MTD', 'WAT', 'BIO', 'PKI'],
    },

    consumer_discretionary: {
      etf: 'XLY',
      retail: ['AMZN', 'HD', 'LOW', 'TJX', 'ROST', 'BURL', 'DG', 'DLTR', 'ULTA', 'BBY'],
      auto: ['TSLA', 'GM', 'F', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'TM', 'HMC'],
      restaurants: ['MCD', 'SBUX', 'CMG', 'YUM', 'DRI', 'WING', 'CAVA', 'SHAK', 'DPZ'],
      travel: ['BKNG', 'ABNB', 'MAR', 'HLT', 'EXPE', 'RCL', 'CCL', 'NCLH', 'UAL', 'DAL'],
      apparel: ['NKE', 'LULU', 'GPS', 'ANF', 'AEO', 'UA', 'DECK', 'CROX', 'SKX'],
    },

    consumer_staples: {
      etf: 'XLP',
      mega: ['PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'MDLZ', 'CL', 'KMB'],
      food: ['GIS', 'K', 'CAG', 'SJM', 'CPB', 'HRL', 'TSN', 'KHC', 'HSY', 'MKC'],
      retail: ['WMT', 'COST', 'TGT', 'KR', 'WBA', 'SYY', 'ADM'],
    },

    energy: {
      etf: 'XLE',
      majors: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'OXY', 'PXD'],
      services: ['SLB', 'HAL', 'BKR', 'NOV', 'FTI', 'CHX', 'HP', 'RIG'],
      midstream: ['WMB', 'KMI', 'OKE', 'ET', 'EPD', 'MPLX', 'PAA', 'TRGP'],
      refiners: ['MPC', 'PSX', 'VLO', 'PBF', 'DK', 'HFC'],
    },

    industrials: {
      etf: 'XLI',
      aerospace: ['BA', 'LMT', 'RTX', 'NOC', 'GD', 'LHX', 'TDG', 'HWM', 'TXT', 'SPR'],
      machinery: ['CAT', 'DE', 'CMI', 'PH', 'EMR', 'ROK', 'ITW', 'ETN', 'IR', 'DOV'],
      transport: ['UNP', 'CSX', 'NSC', 'UPS', 'FDX', 'ODFL', 'JBHT', 'XPO', 'CHRW'],
      defense: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'LDOS', 'SAIC'],
    },

    materials: {
      etf: 'XLB',
      chemicals: ['LIN', 'APD', 'SHW', 'ECL', 'DD', 'DOW', 'LYB', 'PPG', 'NEM', 'FCX'],
      metals: ['FCX', 'NEM', 'NUE', 'STLD', 'CLF', 'AA', 'X', 'RS'],
      mining: ['FCX', 'NEM', 'GOLD', 'AEM', 'KGC', 'PAAS', 'HL', 'CDE'],
    },

    utilities: {
      etf: 'XLU',
      electric: ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'PEG', 'ED'],
      gas: ['SRE', 'ATO', 'NI', 'OGE'],
      water: ['AWK', 'WTR', 'WTRG'],
    },

    real_estate: {
      etf: 'XLRE',
      data_centers: ['EQIX', 'DLR', 'AMT', 'CCI'],
      retail: ['SPG', 'O', 'VICI', 'NNN', 'STOR'],
      residential: ['EQR', 'AVB', 'INVH', 'AMH', 'MAA'],
      industrial: ['PLD', 'PSA', 'EXR', 'CUBE'],
      office: ['BXP', 'VNO', 'SLG', 'KRC'],
    },

    communication: {
      etf: 'XLC',
      mega: ['GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS'],
      streaming: ['NFLX', 'DIS', 'WBD', 'PARA', 'ROKU', 'SPOT'],
      gaming: ['EA', 'TTWO', 'ATVI', 'RBLX', 'U'],
      advertising: ['GOOGL', 'META', 'TTD', 'MGNI', 'PUBM', 'DV'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // THEMATIC / CHARACTERISTICS
  // ═══════════════════════════════════════════════════════════════

  themes: {
    // Growth categories
    hypergrowth: ['NVDA', 'PLTR', 'NET', 'CRWD', 'DDOG', 'SNOW', 'MDB', 'ZS', 'PANW', 'ANET'],
    saas_leaders: ['CRM', 'NOW', 'ADBE', 'WDAY', 'TEAM', 'ZM', 'DOCU', 'HUBS', 'VEEV', 'BILL'],

    // Value / Beaten down
    beaten_down: ['PYPL', 'INTC', 'BA', 'DIS', 'NKE', 'NFLX', 'WBD', 'PARA', 'VZ', 'T'],
    deep_value: ['INTC', 'VZ', 'T', 'WBA', 'PARA', 'WBD', 'F', 'GM'],

    // Momentum
    momentum_leaders: [], // Populated dynamically based on recent performance

    // Dividend
    dividend_aristocrats: ['JNJ', 'PG', 'KO', 'PEP', 'MCD', 'MMM', 'ABT', 'ABBV', 'T', 'XOM'],
    high_yield: ['VZ', 'T', 'MO', 'PM', 'IBM', 'KHC', 'WBA'],

    // Speculative
    meme_stocks: ['GME', 'AMC', 'BBBY', 'BB', 'KOSS', 'EXPR'],
    spacs_despacs: ['RIVN', 'LCID', 'JOBY', 'LILM', 'EVTL', 'DNA'],

    // Macro themes
    china_exposure: ['AAPL', 'TSLA', 'NKE', 'SBUX', 'QCOM', 'NVDA', 'WYNN', 'LVS', 'YUM'],
    rate_sensitive: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'SCHW', 'BLK', 'PNC', 'USB', 'TFC'],
    inflation_hedge: ['XOM', 'CVX', 'FCX', 'NEM', 'GOLD', 'MOS', 'NTR', 'CF', 'BHP', 'RIO'],
    recession_resistant: ['WMT', 'COST', 'PG', 'KO', 'JNJ', 'UNH', 'MCD', 'DG', 'DLTR'],

    // Clean energy
    solar: ['ENPH', 'SEDG', 'FSLR', 'RUN', 'NOVA', 'MAXN', 'ARRY', 'CSIQ', 'JKS'],
    ev_ecosystem: ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'QS', 'CHPT', 'BLNK', 'EVGO'],
    battery_materials: ['ALB', 'LAC', 'LTHM', 'SQM', 'PLL', 'MP', 'UUUU'],

    // Crypto related
    crypto: ['COIN', 'MARA', 'RIOT', 'MSTR', 'SQ', 'HOOD', 'PYPL', 'SI', 'SBNY'],

    // Defense & geo
    defense: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'LDOS', 'SAIC', 'KTOS'],
    cybersecurity: ['CRWD', 'PANW', 'ZS', 'FTNT', 'OKTA', 'S', 'TENB', 'QLYS', 'RPD', 'CYBR'],

    // Healthcare innovation
    obesity_drugs: ['LLY', 'NVO', 'AMGN', 'PFE', 'VKTX', 'ALT', 'GPCR'],
    biotech_innovation: ['MRNA', 'BNTX', 'CRSP', 'EDIT', 'NTLA', 'BEAM', 'VERV', 'PRME'],
  },

  // ═══════════════════════════════════════════════════════════════
  // INDEX COMPONENTS (for broad screening)
  // ═══════════════════════════════════════════════════════════════

  indices: {
    sp500_top50: [
      'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
      'XOM', 'JPM', 'V', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'LLY',
      'AVGO', 'PEP', 'KO', 'COST', 'TMO', 'MCD', 'WMT', 'CSCO', 'ABT', 'CRM',
      'ACN', 'DHR', 'LIN', 'VZ', 'ADBE', 'NKE', 'NEE', 'TXN', 'PM', 'RTX',
      'BMY', 'CMCSA', 'ORCL', 'UNP', 'HON', 'LOW', 'T', 'QCOM', 'UPS', 'MS'
    ],

    nasdaq100: [
      'AAPL', 'MSFT', 'AMZN', 'NVDA', 'META', 'TSLA', 'GOOGL', 'AVGO', 'COST', 'PEP',
      'ADBE', 'CSCO', 'NFLX', 'CMCSA', 'AMD', 'INTC', 'TXN', 'QCOM', 'TMUS', 'AMGN',
      'HON', 'INTU', 'SBUX', 'ISRG', 'AMAT', 'BKNG', 'MDLZ', 'ADP', 'GILD', 'ADI',
      'VRTX', 'REGN', 'LRCX', 'MU', 'PYPL', 'CSX', 'PANW', 'MELI', 'SNPS', 'KLAC',
      'CDNS', 'MAR', 'ORLY', 'ASML', 'CTAS', 'MNST', 'FTNT', 'NXPI', 'KDP', 'CHTR'
    ],

    russell2000_leaders: [
      'SMCI', 'CELH', 'DUOL', 'AXON', 'TOST', 'IOT', 'GTLB', 'MGNI', 'BOOT', 'INTA'
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // WATCHLIST CATEGORIES (for quick filtering)
  // ═══════════════════════════════════════════════════════════════

  categories: {
    // Market cap based
    mega_cap: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'V', 'UNH'],

    // Volatility based
    high_beta: ['TSLA', 'NVDA', 'AMD', 'COIN', 'MARA', 'RIOT', 'PLTR', 'SNOW', 'CRWD', 'NET'],
    low_beta: ['JNJ', 'PG', 'KO', 'PEP', 'WMT', 'MCD', 'VZ', 'T', 'NEE', 'DUK'],

    // Short interest
    high_short_interest: ['GME', 'AMC', 'CVNA', 'UPST', 'W', 'BYND', 'PLUG', 'CHPT'],

    // Earnings focus
    earnings_this_week: [], // Populated dynamically

    // Options activity
    high_options_volume: ['AAPL', 'TSLA', 'NVDA', 'AMD', 'SPY', 'QQQ', 'META', 'AMZN', 'MSFT', 'GOOGL'],
  },

  // ═══════════════════════════════════════════════════════════════
  // ETFs for quick sector exposure
  // ═══════════════════════════════════════════════════════════════

  etfs: {
    sectors: ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE'],
    indices: ['SPY', 'QQQ', 'IWM', 'DIA', 'MDY', 'VTI'],
    thematic: ['SMH', 'SOXX', 'XBI', 'IBB', 'ARKK', 'ARKG', 'TAN', 'LIT', 'BOTZ', 'HACK'],
    fixed_income: ['TLT', 'IEF', 'SHY', 'HYG', 'LQD', 'JNK', 'TIP', 'BND'],
    commodities: ['GLD', 'SLV', 'USO', 'UNG', 'COPX', 'WEAT', 'DBA'],
    volatility: ['VXX', 'UVXY', 'SVXY', 'VIXY'],
    international: ['EEM', 'FXI', 'EWZ', 'EWJ', 'VWO', 'INDA', 'KWEB', 'MCHI'],
  },
};

/**
 * Get all unique tickers from universe
 */
export function getAllTickers() {
  const tickers = new Set();

  // Add from sectors
  for (const sector of Object.values(universe.sectors)) {
    for (const [key, arr] of Object.entries(sector)) {
      if (Array.isArray(arr)) {
        arr.forEach(t => tickers.add(t));
      } else if (typeof arr === 'string') {
        tickers.add(arr); // ETF
      }
    }
  }

  // Add from themes
  for (const arr of Object.values(universe.themes)) {
    if (Array.isArray(arr)) {
      arr.forEach(t => tickers.add(t));
    }
  }

  // Add from indices
  for (const arr of Object.values(universe.indices)) {
    arr.forEach(t => tickers.add(t));
  }

  // Add ETFs
  for (const arr of Object.values(universe.etfs)) {
    arr.forEach(t => tickers.add(t));
  }

  return Array.from(tickers);
}

/**
 * Get tickers by sector
 */
export function getTickersBySector(sectorName) {
  const sector = universe.sectors[sectorName];
  if (!sector) return [];

  const tickers = new Set();
  for (const [key, arr] of Object.entries(sector)) {
    if (Array.isArray(arr)) {
      arr.forEach(t => tickers.add(t));
    }
  }
  return Array.from(tickers);
}

/**
 * Get tickers by theme
 */
export function getTickersByTheme(themeName) {
  return universe.themes[themeName] || [];
}

/**
 * Get tickers by category
 */
export function getTickersByCategory(categoryName) {
  return universe.categories[categoryName] || [];
}

/**
 * Map theme name to universe keys (for macro agent)
 */
export const themeMapping = {
  'ai_infrastructure': ['sectors.ai_infrastructure', 'sectors.semiconductors', 'themes.hypergrowth'],
  'energy_transition': ['themes.solar', 'themes.ev_ecosystem', 'themes.battery_materials'],
  'rates_sensitive': ['themes.rate_sensitive', 'sectors.financials', 'sectors.real_estate'],
  'consumer': ['sectors.consumer_discretionary', 'sectors.consumer_staples'],
  'healthcare': ['sectors.healthcare', 'themes.obesity_drugs', 'themes.biotech_innovation'],
  'industrials': ['sectors.industrials'],
  'china': ['themes.china_exposure', 'etfs.international'],
  'commodities': ['sectors.energy', 'sectors.materials', 'themes.inflation_hedge'],
  'crypto': ['themes.crypto'],
  'defense': ['themes.defense', 'themes.cybersecurity'],
  'beaten_down': ['themes.beaten_down', 'themes.deep_value'],
  'momentum': ['themes.hypergrowth', 'themes.momentum_leaders'],
  'dividend': ['themes.dividend_aristocrats', 'themes.high_yield'],
  'speculative': ['themes.meme_stocks', 'themes.spacs_despacs'],
};

/**
 * Expand theme to tickers using mapping
 */
export function expandTheme(themeName) {
  const paths = themeMapping[themeName];
  if (!paths) return [];

  const tickers = new Set();

  for (const path of paths) {
    const [category, subcategory] = path.split('.');
    let source;

    if (category === 'sectors') {
      source = universe.sectors[subcategory];
    } else if (category === 'themes') {
      source = universe.themes[subcategory];
    } else if (category === 'etfs') {
      source = universe.etfs[subcategory];
    }

    if (Array.isArray(source)) {
      source.forEach(t => tickers.add(t));
    } else if (source && typeof source === 'object') {
      // It's a sector with sub-arrays
      for (const arr of Object.values(source)) {
        if (Array.isArray(arr)) {
          arr.forEach(t => tickers.add(t));
        }
      }
    }
  }

  return Array.from(tickers);
}

export default universe;
