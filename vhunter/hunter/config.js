/**
 * @fileoverview Hunter system configuration
 * Unix philosophy: Configuration is data
 */

export const config = {
  // API endpoints
  endpoints: {
    proxy: 'https://vhunter-proxy.vhunter.workers.dev',
    massive: 'https://api.massive.so/v1'
  },

  // Scoring thresholds
  thresholds: {
    min_edge_score: 6,
    min_asymmetry_score: 7,
    min_timing_score: 5,
    max_opportunities: 20,
    max_trades: 10
  },

  // Risk parameters
  risk: {
    max_position_pct: 5,
    max_sector_pct: 20,
    max_loss_per_trade_pct: 2,
    default_stop_loss_pct: 50
  },

  // Kelly criterion bounds
  kelly: {
    max_fraction: 0.25,
    min_fraction: 0.01
  },

  // Asymmetry scoring weights
  asymmetry_weights: {
    risk_reward: 0.30,
    upside_multiple: 0.20,
    kelly_ev: 0.30,
    catalyst: 0.20
  },

  // Cache TTLs (ms)
  cache: {
    macro: 4 * 60 * 60 * 1000,      // 4 hours
    quotes: 60 * 1000,               // 1 minute
    options: 5 * 60 * 1000,          // 5 minutes
    financials: 24 * 60 * 60 * 1000  // 24 hours
  },

  // Agent defaults
  agents: {
    macro: {
      refresh_hours: [6, 18]
    },
    opportunity: {
      scan_hours: [7, 19]
    },
    analyst: {
      parallel_limit: 5
    },
    trader: {
      construction_hours: [8, 20]
    }
  },

  // Default universe - theme-driven
  universe: {
    // Core instruments
    indices: ['SPY', 'QQQ', 'IWM', 'DIA'],
    sectors: ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE'],

    // Macro instruments for regime detection (indices + vol + rates + fx)
    macro: ['SPY', 'QQQ', 'IWM', 'DIA', 'VIX', 'TLT', 'HYG', 'DXY', 'GLD'],

    // Theme -> Sector ETF mapping
    themes: {
      'ai_infrastructure': ['SMH', 'SOXX', 'XLK'],
      'energy_transition': ['XLE', 'TAN', 'ICLN', 'LIT'],
      'rates_sensitive': ['XLF', 'XLU', 'XLRE', 'TLT'],
      'consumer': ['XLY', 'XLP', 'XRT'],
      'healthcare': ['XLV', 'XBI', 'IBB'],
      'industrials': ['XLI', 'ITA', 'XAR'],
      'china': ['FXI', 'KWEB', 'MCHI'],
      'commodities': ['GLD', 'SLV', 'USO', 'UNG', 'COPX'],
      'crypto': ['BITO', 'COIN', 'MARA', 'RIOT'],
      'defense': ['ITA', 'XAR', 'PPA']
    },

    // Theme -> Top tickers mapping (expand when theme is identified)
    theme_tickers: {
      'ai_infrastructure': ['NVDA', 'AMD', 'AVGO', 'MRVL', 'TSM', 'ASML', 'ANET', 'SMCI'],
      'energy_transition': ['TSLA', 'ENPH', 'FSLR', 'RUN', 'ALB', 'LAC'],
      'rates_sensitive': ['JPM', 'BAC', 'GS', 'MS', 'C', 'WFC'],
      'consumer': ['AMZN', 'HD', 'LOW', 'TGT', 'COST', 'WMT'],
      'healthcare': ['UNH', 'JNJ', 'PFE', 'MRNA', 'LLY', 'ABBV'],
      'industrials': ['CAT', 'DE', 'BA', 'LMT', 'RTX', 'GE'],
      'china': ['BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'XPEV'],
      'commodities': ['XOM', 'CVX', 'FCX', 'NEM', 'GOLD'],
      'crypto': ['COIN', 'MARA', 'RIOT', 'MSTR', 'SQ'],
      'defense': ['LMT', 'RTX', 'NOC', 'GD', 'BA']
    }
  }
};

export default config;
