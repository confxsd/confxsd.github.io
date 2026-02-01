/**
 * @fileoverview Macro Thesis Agent
 * Unix philosophy: Read the world, output a thesis
 */

import Agent from './base.js';
import polygon from '../providers/polygon.js';
import claude from '../providers/claude.js';
import config from '../config.js';

/**
 * MacroAgent - Synthesizes market data into macro thesis
 */
export class MacroAgent extends Agent {
  constructor() {
    super('MacroAgent', 'Generates macro thesis from market signals');
  }

  async process(input = {}) {
    // Gather market data in parallel
    const [indices, vix, breadth, news] = await Promise.all([
      this.getIndexData(),
      this.getVolData(),
      this.getBreadthData(),
      this.getMarketNews()
    ]);

    // Synthesize with AI
    const thesis = await claude.generateMacroThesis({
      indices,
      vix,
      breadth,
      news,
      additionalContext: input.context || '',
      availableThemes: Object.keys(config.universe.themes)
    });

    // Map themes to tickers for next stage (async for AI fallback)
    const targetTickers = await this.expandThemesToTickers(thesis.themes || []);

    return {
      timestamp: new Date(),
      ...thesis,
      targetTickers,
      raw: { indices, vix, breadth }
    };
  }

  /**
   * Expand identified themes into specific tickers to scan
   * Uses tiered matching: exact → keyword → AI batch
   */
  async expandThemesToTickers(themes) {
    const tickers = new Set();
    const themeKeys = Object.keys(config.universe.themes);

    // Phase 1: Fast local matching (free)
    const matched = new Map();
    const unmatched = [];

    for (const theme of themes) {
      const key = this.matchThemeLocal(theme.name, themeKeys);
      if (key) {
        matched.set(theme.name, key);
      } else {
        unmatched.push(theme.name);
      }
    }

    // Phase 2: AI batch for unmatched (cheap, one call)
    if (unmatched.length > 0) {
      console.log(`[Macro] AI classifying ${unmatched.length} unmatched themes:`, unmatched);
      const aiMatches = await claude.classifyThemes(unmatched, themeKeys);
      for (const [name, key] of Object.entries(aiMatches)) {
        if (key && themeKeys.includes(key)) {
          matched.set(name, key);
          console.log(`[Macro] AI matched: "${name}" → ${key}`);
        }
      }
    }

    console.log(`[Macro] Theme matching: ${matched.size}/${themes.length} matched`);

    // Expand matched themes to tickers
    for (const theme of themes) {
      const key = matched.get(theme.name);
      if (key && config.universe.theme_tickers[key]) {
        // Add tickers for high conviction themes
        if (theme.conviction >= 6) {
          config.universe.theme_tickers[key].forEach(t => tickers.add(t));
        }
        // Add sector ETFs for any identified theme
        if (config.universe.themes[key]) {
          config.universe.themes[key].forEach(t => tickers.add(t));
        }
      }
    }

    // Always include macro instruments for context
    config.universe.macro.forEach(t => tickers.add(t));

    return Array.from(tickers);
  }

  /**
   * Local theme matching: exact + keyword (free, instant)
   */
  matchThemeLocal(themeName, themeKeys) {
    const normalized = themeName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const words = normalized.split(/\s+/);

    // Tier 1: Exact match (with underscores)
    const underscored = normalized.replace(/\s+/g, '_');
    if (themeKeys.includes(underscored)) return underscored;

    // Tier 2: Word-boundary keyword match (order by specificity)
    // More specific keywords first to avoid false positives
    const KEYWORDS = [
      // Highly specific (match first)
      ['semiconductor', 'ai_infrastructure'],
      ['datacenter', 'ai_infrastructure'],
      ['nvidia', 'ai_infrastructure'],
      ['bitcoin', 'crypto'],
      ['geopolitical', 'defense'],
      ['manufacturing', 'industrials'],

      // Medium specific
      ['defense', 'defense'],
      ['military', 'defense'],
      ['biotech', 'healthcare'],
      ['pharma', 'healthcare'],
      ['healthcare', 'healthcare'],
      ['crypto', 'crypto'],
      ['solar', 'energy_transition'],
      ['energy', 'energy_transition'],
      ['clean', 'energy_transition'],
      ['china', 'china'],
      ['emerging', 'china'],
      ['commodity', 'commodities'],
      ['industrial', 'industrials'],
      ['consumer', 'consumer'],
      ['retail', 'consumer'],

      // Short keywords last (more prone to false positives)
      ['chip', 'ai_infrastructure'],
      ['gpu', 'ai_infrastructure'],
      ['rate', 'rates_sensitive'],
      ['fed', 'rates_sensitive'],
      ['bank', 'rates_sensitive'],
      ['yield', 'rates_sensitive'],
      ['gold', 'commodities'],
      ['oil', 'commodities'],
      ['copper', 'commodities'],
      ['drug', 'healthcare'],
      ['ev', 'energy_transition'],
      ['ai', 'ai_infrastructure']  // Last: 'ai' is very short, prone to false matches
    ];

    // Check if any word starts with or equals the keyword
    for (const [keyword, theme] of KEYWORDS) {
      for (const word of words) {
        if (word === keyword || word.startsWith(keyword)) {
          return theme;
        }
      }
    }

    return null;
  }

  async getIndexData() {
    const tickers = config.universe.indices;
    const quotes = await polygon.getBatchQuotes(tickers);

    const results = [];
    for (const quote of quotes) {
      const history = await polygon.getHistory(quote.ticker, 20);
      const returns = this.calculateReturns(history);
      results.push({
        ticker: quote.ticker,
        price: quote.close,
        change: history.length > 1
          ? ((quote.close - history[history.length - 2]?.close) / history[history.length - 2]?.close) * 100
          : 0,
        returns_5d: returns.r5d,
        returns_20d: returns.r20d,
        trend: this.detectTrend(history)
      });
    }
    return results;
  }

  async getVolData() {
    try {
      const vixQuote = await polygon.getQuote('VIX');
      const vixHistory = await polygon.getHistory('VIX', 30);

      const current = vixQuote?.close || 15;
      const avg30 = vixHistory.reduce((s, h) => s + h.close, 0) / vixHistory.length;
      const high30 = Math.max(...vixHistory.map(h => h.close));
      const low30 = Math.min(...vixHistory.map(h => h.close));

      return {
        vix: current,
        vix_avg30: avg30,
        vix_percentile: ((current - low30) / (high30 - low30)) * 100,
        regime: current < 15 ? 'low' : current < 25 ? 'normal' : current < 35 ? 'elevated' : 'crisis'
      };
    } catch (e) {
      return { vix: 15, regime: 'normal', error: e.message };
    }
  }

  async getBreadthData() {
    // Calculate breadth from sector performance
    const sectors = config.universe.sectors;
    const quotes = await polygon.getBatchQuotes(sectors);

    let advancing = 0, declining = 0;
    for (const q of quotes) {
      const history = await polygon.getHistory(q.ticker, 2);
      if (history.length >= 2) {
        const change = history[1].close - history[0].close;
        if (change > 0) advancing++;
        else declining++;
      }
    }

    return {
      advancing,
      declining,
      ratio: advancing / (declining || 1),
      breadth_score: (advancing - declining) / sectors.length
    };
  }

  async getMarketNews() {
    const news = await polygon.getNews('SPY', 5);
    return news.map(n => ({
      title: n.title,
      published: n.published,
      tickers: n.tickers
    }));
  }

  calculateReturns(history) {
    if (history.length < 2) return { r5d: 0, r20d: 0 };

    const latest = history[history.length - 1].close;
    const r5d = history.length >= 6
      ? ((latest - history[history.length - 6].close) / history[history.length - 6].close) * 100
      : 0;
    const r20d = history.length >= 21
      ? ((latest - history[0].close) / history[0].close) * 100
      : 0;

    return { r5d, r20d };
  }

  detectTrend(history) {
    if (history.length < 10) return 'unknown';

    const recent = history.slice(-5);
    const prior = history.slice(-10, -5);

    const recentAvg = recent.reduce((s, h) => s + h.close, 0) / recent.length;
    const priorAvg = prior.reduce((s, h) => s + h.close, 0) / prior.length;

    const change = (recentAvg - priorAvg) / priorAvg;
    if (change > 0.02) return 'uptrend';
    if (change < -0.02) return 'downtrend';
    return 'sideways';
  }
}

export default new MacroAgent();
