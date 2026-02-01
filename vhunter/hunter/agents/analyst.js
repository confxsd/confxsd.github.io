/**
 * @fileoverview Analyst Agent - Deep dive on opportunities
 * Unix philosophy: Research one thing thoroughly
 */

import Agent from './base.js';
import polygon from '../providers/polygon.js';
import claude from '../providers/claude.js';
import scoring from '../scoring.js';
import config from '../config.js';

/**
 * AnalystAgent - Deep fundamental and options analysis
 */
export class AnalystAgent extends Agent {
  constructor() {
    super('AnalystAgent', 'Deep dive analysis on opportunities');
  }

  async process(input) {
    const { opportunities, parallelLimit = config.agents.analyst.parallel_limit } = input;

    // Process in parallel batches
    const enriched = [];

    for (let i = 0; i < opportunities.length; i += parallelLimit) {
      const batch = opportunities.slice(i, i + parallelLimit);
      const results = await Promise.all(
        batch.map(opp => this.analyzeOpportunity(opp))
      );
      enriched.push(...results.filter(Boolean));
    }

    return {
      timestamp: new Date(),
      analyzed_count: opportunities.length,
      enriched: enriched.sort((a, b) => b.composite - a.composite)
    };
  }

  async analyzeOpportunity(opportunity) {
    const { ticker } = opportunity;

    try {
      // Parallel data fetch
      const [equity, options, technicals] = await Promise.all([
        this.analyzeEquity(ticker),
        this.analyzeOptions(ticker),
        this.analyzeTechnicals(ticker)
      ]);

      // AI synthesis
      const aiAnalysis = await claude.analyzeEquity({
        ticker,
        opportunity: opportunity.thesis_summary,
        equity,
        options: options.summary,
        technicals: technicals.summary
      });

      // Recalculate scores with enriched data
      const enrichedOpp = {
        ...opportunity,
        equity,
        options,
        technicals,
        aiAnalysis,
        edgeFactors: {
          ...opportunity.edgeFactors,
          unusualFlow: options.hasUnusualFlow,
          analystMomentum: equity.analystMomentum || 0
        },
        timingFactors: {
          ...opportunity.timingFactors,
          ivRank: options.ivRank,
          daysToEarnings: equity.daysToEarnings
        },
        asymmetryData: this.estimateAsymmetry(opportunity, options)
      };

      // Rescore
      const scores = scoring.scoreOpportunity(enrichedOpp);

      return {
        ...enrichedOpp,
        ...scores,
        recommendation: this.generateRecommendation(enrichedOpp, scores, aiAnalysis)
      };
    } catch (e) {
      return {
        ...opportunity,
        error: e.message,
        composite: 0
      };
    }
  }

  async analyzeEquity(ticker) {
    const [details, news, history] = await Promise.all([
      polygon.getTickerDetails(ticker).catch(() => null),
      polygon.getNews(ticker, 5).catch(() => []),
      polygon.getHistory(ticker, 252).catch(() => [])
    ]);

    // Calculate basic metrics
    const current = history[history.length - 1]?.close || 0;
    const yearAgo = history[0]?.close || current;
    const ytdReturn = ((current - yearAgo) / yearAgo) * 100;

    // 52-week range
    const high52 = Math.max(...history.map(h => h.high));
    const low52 = Math.min(...history.map(h => h.low));
    const fromHigh = ((current - high52) / high52) * 100;

    return {
      name: details?.name || ticker,
      sector: details?.sector,
      marketCap: details?.marketCap,
      current,
      ytdReturn,
      high52,
      low52,
      fromHigh,
      pctOf52WeekRange: ((current - low52) / (high52 - low52)) * 100,
      newsCount: news.length,
      recentNews: news.slice(0, 3).map(n => n.title),
      analystMomentum: 0, // Would need external data
      daysToEarnings: null // Would need earnings calendar
    };
  }

  async analyzeOptions(ticker) {
    try {
      const options = await polygon.getOptionsSnapshot(ticker);
      if (!options?.length) {
        return {
          available: false,
          summary: 'No options data'
        };
      }

      // Separate calls/puts
      const calls = options.filter(o => o.type === 'call' && o.iv);
      const puts = options.filter(o => o.type === 'put' && o.iv);

      // Calculate IV metrics
      const allIVs = options.filter(o => o.iv).map(o => o.iv * 100);
      const avgIV = allIVs.reduce((s, iv) => s + iv, 0) / allIVs.length;

      // Volume analysis
      const totalCallVol = calls.reduce((s, o) => s + (o.volume || 0), 0);
      const totalPutVol = puts.reduce((s, o) => s + (o.volume || 0), 0);
      const pcRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : 0;

      // Find unusual activity
      const unusual = options.filter(o =>
        o.volume && o.oi && o.volume > o.oi * 0.5 && o.volume > 100
      );

      // Find near ATM options for expected move
      const atmOptions = options
        .filter(o => o.bid && o.ask)
        .sort((a, b) => Math.abs(a.delta || 0.5 - 0.5) - Math.abs(b.delta || 0.5 - 0.5));

      const atmStraddle = atmOptions.length >= 2
        ? (atmOptions[0].bid + atmOptions[0].ask) / 2 +
        (atmOptions[1].bid + atmOptions[1].ask) / 2
        : null;

      // IV term structure (simplified)
      const nearTerm = options.filter(o => {
        if (!o.expiry) return false;
        const days = (new Date(o.expiry) - new Date()) / (1000 * 60 * 60 * 24);
        return days < 30;
      });
      const farTerm = options.filter(o => {
        if (!o.expiry) return false;
        const days = (new Date(o.expiry) - new Date()) / (1000 * 60 * 60 * 24);
        return days >= 30 && days < 90;
      });

      const nearIV = nearTerm.length > 0
        ? nearTerm.reduce((s, o) => s + (o.iv || 0), 0) / nearTerm.length * 100
        : avgIV;
      const farIV = farTerm.length > 0
        ? farTerm.reduce((s, o) => s + (o.iv || 0), 0) / farTerm.length * 100
        : avgIV;

      return {
        available: true,
        ivRank: 50, // Would need IV history
        avgIV,
        nearTermIV: nearIV,
        farTermIV: farIV,
        termStructure: nearIV > farIV * 1.1 ? 'backwardation' :
          nearIV < farIV * 0.9 ? 'contango' : 'flat',
        pcRatio,
        pcSentiment: pcRatio > 1.5 ? 'bearish' : pcRatio < 0.7 ? 'bullish' : 'neutral',
        totalCallVol,
        totalPutVol,
        hasUnusualFlow: unusual.length > 0,
        unusualCount: unusual.length,
        atmStraddle,
        expectedMove: atmStraddle ? `±$${atmStraddle.toFixed(2)}` : 'N/A',
        summary: `IV: ${avgIV.toFixed(1)}%, P/C: ${pcRatio.toFixed(2)}, ${unusual.length} unusual`
      };
    } catch (e) {
      return {
        available: false,
        summary: `Error: ${e.message}`
      };
    }
  }

  async analyzeTechnicals(ticker) {
    const history = await polygon.getHistory(ticker, 60);
    if (!history.length) {
      return { summary: 'No data' };
    }

    const closes = history.map(h => h.close);
    const current = closes[closes.length - 1];

    // Calculate indicators
    const sma20 = closes.slice(-20).reduce((s, c) => s + c, 0) / 20;
    const sma50 = closes.length >= 50
      ? closes.slice(-50).reduce((s, c) => s + c, 0) / 50
      : sma20;

    // RSI
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rs = gains / (losses || 1);
    const rsi = 100 - (100 / (1 + rs));

    // Volatility
    const returns = closes.slice(-21).map((c, i, arr) =>
      i > 0 ? Math.log(c / arr[i - 1]) : 0
    ).slice(1);
    const hv20 = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(252) * 100;

    // Trend
    const trend = current > sma20 && sma20 > sma50 ? 'uptrend' :
      current < sma20 && sma20 < sma50 ? 'downtrend' : 'sideways';

    // Support/Resistance
    const recentLows = history.slice(-20).map(h => h.low);
    const recentHighs = history.slice(-20).map(h => h.high);
    const support = Math.min(...recentLows);
    const resistance = Math.max(...recentHighs);

    return {
      current,
      sma20,
      sma50,
      rsi,
      hv20,
      trend,
      support,
      resistance,
      distanceToSupport: ((current - support) / current) * 100,
      distanceToResistance: ((resistance - current) / current) * 100,
      summary: `${trend.toUpperCase()}, RSI ${rsi.toFixed(0)}, HV20 ${hv20.toFixed(0)}%`
    };
  }

  estimateAsymmetry(opportunity, options) {
    if (!options.available || !options.atmStraddle) {
      return {
        maxLoss: 1000,
        expectedGain: 2000,
        potentialGain: 5000,
        probabilityOfProfit: 0.4,
        catalystClarity: 'unclear'
      };
    }

    // Estimate based on options pricing
    const straddle = options.atmStraddle;

    return {
      maxLoss: straddle * 100, // 1 contract
      expectedGain: straddle * 100 * 2, // 2x target
      potentialGain: straddle * 100 * 5, // 5x home run
      probabilityOfProfit: 0.35 + (opportunity.edge_score || 5) * 0.02,
      catalystClarity: opportunity.catalysts?.length > 2 ? 'clear' :
        opportunity.catalysts?.length > 0 ? 'probable' : 'unclear'
    };
  }

  generateRecommendation(opp, scores, aiAnalysis) {
    if (scores.composite < 5) return 'PASS';
    if (scores.composite >= 8 && scores.meetsThreshold) return 'STRONG BUY';
    if (scores.composite >= 6.5 && scores.meetsThreshold) return 'BUY';
    if (scores.composite >= 5) return 'WATCHLIST';
    return 'PASS';
  }
}

export default new AnalystAgent();
