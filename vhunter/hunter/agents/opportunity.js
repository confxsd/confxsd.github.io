/**
 * @fileoverview Opportunity Hunter Agent
 * Unix philosophy: Take thesis, output opportunities
 */

import Agent from './base.js';
import polygon from '../providers/polygon.js';
import claude from '../providers/claude.js';
import scoring from '../scoring.js';
import config from '../config.js';
import { ThesisTypes, Priorities } from '../types.js';

/**
 * OpportunityAgent - Finds tradeable opportunities from macro thesis
 */
export class OpportunityAgent extends Agent {
  constructor() {
    super('OpportunityAgent', 'Hunts for asymmetric opportunities');
  }

  async process(input) {
    const { macroReport, universe = [], watchlist = [] } = input;

    // Thesis-driven: use tickers from macro themes, then add custom
    const themeTickers = macroReport?.targetTickers || [];
    const tickers = this.buildUniverse(themeTickers, universe, watchlist);

    // Screen for opportunities in parallel batches
    const batchSize = 10;
    const opportunities = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(ticker => this.screenTicker(ticker, macroReport))
      );
      opportunities.push(...batchResults.filter(Boolean));
    }

    // Score and rank
    const scored = opportunities.map(opp => {
      const scores = scoring.scoreOpportunity(opp);
      return { ...opp, ...scores };
    });

    // Sort by composite score, take top N
    scored.sort((a, b) => b.composite - a.composite);
    const topOpps = scored.slice(0, config.thresholds.max_opportunities);

    return {
      timestamp: new Date(),
      macro_context: macroReport?.regime || 'unknown',
      opportunities: topOpps,
      screened_count: tickers.length,
      passed_count: topOpps.length
    };
  }

  buildUniverse(themeTickers = [], custom = [], watchlist = []) {
    // Priority: theme-driven tickers first, then custom additions
    const universe = new Set([
      ...themeTickers,      // From macro thesis
      ...custom,            // User-specified universe
      ...watchlist          // User watchlist additions
    ]);

    // If no theme tickers, fall back to macro instruments
    if (themeTickers.length === 0) {
      config.universe.macro.forEach(t => universe.add(t));
    }

    return Array.from(universe);
  }

  async screenTicker(ticker, macroReport) {
    try {
      // Fetch data in parallel
      const [quote, history, details, news] = await Promise.all([
        polygon.getQuote(ticker),
        polygon.getHistory(ticker, 60),
        polygon.getTickerDetails(ticker).catch(() => null),
        polygon.getNews(ticker, 3).catch(() => [])
      ]);

      if (!quote || !history.length) return null;

      // Calculate technicals
      const technicals = this.calculateTechnicals(history);

      // Check for opportunity signals
      const signals = this.detectSignals(technicals, quote, macroReport);

      if (!signals.hasOpportunity) return null;

      // Get options data for IV context
      let optionsData = null;
      try {
        const options = await polygon.getOptionsSnapshot(ticker);
        optionsData = this.summarizeOptions(options);
      } catch (e) {
        // No options data available
      }

      return {
        id: `opp-${ticker}-${Date.now()}`,
        ticker,
        name: details?.name || ticker,
        thesis_type: signals.thesisType,
        thesis_summary: signals.thesis,
        catalysts: signals.catalysts,
        risks: signals.risks,
        related_tickers: [],
        requires_deep_dive: true,
        priority: signals.priority,
        // For scoring
        edgeFactors: {
          crowdPositioning: technicals.rsi - 50, // Simplified
          unusualFlow: optionsData?.unusualFlow || false
        },
        timingFactors: {
          ivRank: optionsData?.ivRank || 50,
          trendStrength: technicals.trendStrength,
          momentumScore: technicals.momentum
        },
        raw: { quote, technicals, optionsData }
      };
    } catch (e) {
      return null;
    }
  }

  calculateTechnicals(history) {
    const closes = history.map(h => h.close);
    const volumes = history.map(h => h.volume);
    const n = closes.length;

    // SMA
    const sma20 = closes.slice(-20).reduce((s, c) => s + c, 0) / 20;
    const sma50 = n >= 50 ? closes.slice(-50).reduce((s, c) => s + c, 0) / 50 : sma20;

    // RSI
    const rsi = this.calcRSI(closes, 14);

    // Volatility (20-day)
    const returns = closes.slice(-21).map((c, i, arr) =>
      i > 0 ? Math.log(c / arr[i - 1]) : 0
    ).slice(1);
    const hv20 = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(252) * 100;

    // Volume trend
    const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const volumeRatio = recentVol / avgVol;

    // Trend
    const current = closes[n - 1];
    const trend = current > sma20 ? (current > sma50 ? 'strong_up' : 'up') :
      (current < sma50 ? 'strong_down' : 'down');

    return {
      current,
      sma20,
      sma50,
      rsi,
      hv20,
      volumeRatio,
      trend,
      trendStrength: Math.abs(current - sma20) / sma20 * 100,
      momentum: rsi > 50 ? Math.min(10, (rsi - 50) / 5) : Math.max(1, (rsi - 20) / 3)
    };
  }

  calcRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  detectSignals(technicals, quote, macro) {
    const signals = {
      hasOpportunity: false,
      thesisType: ThesisTypes.TREND,
      thesis: '',
      catalysts: [],
      risks: [],
      priority: Priorities.MEDIUM
    };

    // Oversold bounce
    if (technicals.rsi < 30 && technicals.volumeRatio > 1.5) {
      signals.hasOpportunity = true;
      signals.thesisType = ThesisTypes.TREND;
      signals.thesis = `Oversold (RSI ${technicals.rsi.toFixed(0)}) with volume surge - potential mean reversion`;
      signals.catalysts.push('Oversold bounce');
      signals.priority = technicals.rsi < 25 ? Priorities.HIGH : Priorities.MEDIUM;
    }

    // Breakout
    if (technicals.trend === 'strong_up' && technicals.volumeRatio > 2) {
      signals.hasOpportunity = true;
      signals.thesisType = ThesisTypes.TREND;
      signals.thesis = `Breakout above MAs with ${(technicals.volumeRatio * 100).toFixed(0)}% volume surge`;
      signals.catalysts.push('Momentum breakout');
      signals.priority = Priorities.HIGH;
    }

    // Volatility contraction (cheap options)
    if (technicals.hv20 < 20 && technicals.trendStrength < 5) {
      signals.hasOpportunity = true;
      signals.thesisType = ThesisTypes.FINANCIAL;
      signals.thesis = `Low volatility (${technicals.hv20.toFixed(0)}% HV) - options potentially cheap`;
      signals.catalysts.push('Volatility expansion');
      signals.risks.push('Continued low vol');
    }

    // Macro alignment
    if (macro?.regime === 'risk-on' && technicals.trend.includes('up')) {
      signals.priority = Priorities.HIGH;
      signals.catalysts.push('Macro tailwind');
    } else if (macro?.regime === 'risk-off' && technicals.trend.includes('down')) {
      signals.priority = Priorities.HIGH;
      signals.catalysts.push('Macro confirmation');
    }

    // Add standard risks
    signals.risks.push('Execution slippage', 'Thesis invalidation');

    return signals;
  }

  summarizeOptions(options) {
    if (!options?.length) return null;

    const calls = options.filter(o => o.type === 'call');
    const puts = options.filter(o => o.type === 'put');

    const avgIV = options.reduce((s, o) => s + (o.iv || 0), 0) / options.length;
    const callVol = calls.reduce((s, o) => s + (o.volume || 0), 0);
    const putVol = puts.reduce((s, o) => s + (o.volume || 0), 0);

    return {
      ivRank: 50, // Would need historical IV to calculate
      avgIV: avgIV * 100,
      pcRatio: callVol > 0 ? putVol / callVol : 0,
      unusualFlow: options.some(o => (o.volume || 0) > (o.oi || 0) * 0.5)
    };
  }
}

export default new OpportunityAgent();
