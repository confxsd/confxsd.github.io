/**
 * @fileoverview Trader Agent - Constructs asymmetric trades
 * Unix philosophy: Take analysis, output actionable trades
 */

import Agent from './base.js';
import polygon from '../providers/polygon.js';
import claude from '../providers/claude.js';
import scoring from '../scoring.js';
import config from '../config.js';

/**
 * TraderAgent - Constructs optimal trade structures
 */
export class TraderAgent extends Agent {
  constructor() {
    super('TraderAgent', 'Constructs asymmetric trade recommendations');
  }

  async process(input) {
    const { enrichedOpportunities, portfolioValue = 100000, riskBudget = 0.02 } = input;

    // Only process top opportunities
    const topOpps = enrichedOpportunities
      .filter(o => o.recommendation !== 'PASS' && o.composite >= 6)
      .slice(0, config.thresholds.max_trades);

    // Construct trades for each
    const trades = [];
    for (const opp of topOpps) {
      const trade = await this.constructTrade(opp, portfolioValue, riskBudget);
      if (trade) trades.push(trade);
    }

    // Final ranking by asymmetry
    trades.sort((a, b) => b.asymmetry.score - a.asymmetry.score);

    return {
      timestamp: new Date(),
      portfolio_value: portfolioValue,
      risk_budget: riskBudget,
      trades: trades.slice(0, config.thresholds.max_trades),
      total_trades: trades.length
    };
  }

  async constructTrade(opportunity, portfolioValue, riskBudget) {
    const { ticker, options, technicals, aiAnalysis, thesis_summary } = opportunity;

    try {
      // Get fresh options chain
      const optionsChain = await polygon.getOptionsSnapshot(ticker);

      if (!optionsChain?.length) {
        // Stock-only trade
        return this.constructStockTrade(opportunity, portfolioValue, riskBudget);
      }

      // Find optimal structure
      const structure = this.findOptimalStructure(opportunity, optionsChain, technicals);

      if (!structure) {
        return this.constructStockTrade(opportunity, portfolioValue, riskBudget);
      }

      // Calculate asymmetry
      const asymmetry = scoring.calculateAsymmetry({
        maxLoss: structure.maxLoss,
        expectedGain: structure.expectedGain,
        potentialGain: structure.potentialGain,
        probabilityOfProfit: structure.pop,
        catalystClarity: opportunity.catalysts?.length > 2 ? 'clear' : 'probable'
      });

      // Position sizing
      const sizing = scoring.calculatePositionSize(
        portfolioValue,
        structure.maxLoss,
        config.risk.default_stop_loss_pct / 100
      );

      // AI trade reasoning
      const aiTrade = await claude.constructTrade(
        { ticker, thesis: thesis_summary, direction: structure.direction },
        { structure: structure.name, strikes: structure.strikes }
      ).catch(() => null);

      return {
        id: `trade-${ticker}-${Date.now()}`,
        timestamp: new Date(),
        ticker,
        thesis: thesis_summary,
        thesis_type: opportunity.thesis_type,
        instrument: {
          type: structure.type,
          description: structure.description,
          legs: structure.legs
        },
        asymmetry: {
          score: asymmetry,
          max_loss: structure.maxLoss,
          expected_gain: structure.expectedGain,
          potential_gain: structure.potentialGain,
          risk_reward_ratio: structure.expectedGain / structure.maxLoss,
          probability_of_profit: structure.pop
        },
        entry: {
          price: structure.entryPrice,
          condition: `Limit order at ${structure.entryPrice.toFixed(2)}`
        },
        stop_loss: {
          price: structure.entryPrice * 0.5,
          type: 'hard',
          rationale: '50% loss of premium'
        },
        take_profit: {
          targets: [
            { price: structure.entryPrice * 2, size_pct: 50 },
            { price: structure.entryPrice * 3, size_pct: 50 }
          ]
        },
        catalyst: {
          event: opportunity.catalysts?.[0] || 'Technical',
          date: 'unknown',
          time_to_catalyst: 'N/A'
        },
        sizing: {
          kelly_fraction: scoring.calculateKelly(structure.pop, structure.expectedGain / structure.maxLoss),
          recommended_size_pct: Math.min(sizing.portfolioPct, config.risk.max_position_pct),
          max_portfolio_risk_pct: (structure.maxLoss / portfolioValue) * 100
        },
        invalidation: {
          price_level: technicals?.support || structure.strikes[0] * 0.9,
          thesis_break: 'Break below key support or fundamental deterioration'
        },
        conviction: opportunity.recommendation === 'STRONG BUY' ? 'high' :
          opportunity.recommendation === 'BUY' ? 'medium' : 'low',
        reasoning: aiTrade?.reasoning || [
          `${thesis_summary}`,
          `Entry: ${structure.description}`,
          `Risk/Reward: ${(structure.expectedGain / structure.maxLoss).toFixed(1)}:1`
        ],
        raw: { structure, opportunity_scores: { edge: opportunity.edge, timing: opportunity.timing } }
      };
    } catch (e) {
      return null;
    }
  }

  findOptimalStructure(opportunity, optionsChain, technicals) {
    const current = technicals?.current || opportunity.raw?.quote?.close;
    if (!current) return null;

    // Filter to valid options with liquidity
    const validOptions = optionsChain.filter(o =>
      o.bid && o.ask && o.volume > 10 &&
      (o.ask - o.bid) / o.ask < 0.15 // Reasonable spread
    );

    if (!validOptions.length) return null;

    // Find ATM strike
    const strikes = [...new Set(validOptions.map(o => o.strike))].sort((a, b) => a - b);
    const atmStrike = strikes.reduce((best, s) =>
      Math.abs(s - current) < Math.abs(best - current) ? s : best
    );

    // Determine direction from thesis
    const direction = opportunity.thesis_summary?.toLowerCase().includes('bearish') ||
      opportunity.thesis_summary?.toLowerCase().includes('put') ? 'bearish' : 'bullish';

    // Strategy selection based on IV and outlook
    const avgIV = validOptions.reduce((s, o) => s + (o.iv || 0), 0) / validOptions.length * 100;
    const ivHigh = avgIV > 40;

    if (direction === 'bullish') {
      return ivHigh
        ? this.buildCallSpread(validOptions, atmStrike, current)
        : this.buildLongCall(validOptions, atmStrike, current);
    } else {
      return ivHigh
        ? this.buildPutSpread(validOptions, atmStrike, current)
        : this.buildLongPut(validOptions, atmStrike, current);
    }
  }

  buildLongCall(options, atmStrike, current) {
    // Find OTM call 5-10% above current
    const targetStrike = current * 1.05;
    const call = options
      .filter(o => o.type === 'call' && o.strike >= targetStrike)
      .sort((a, b) => a.strike - b.strike)[0];

    if (!call) return null;

    const midPrice = (call.bid + call.ask) / 2;
    const contracts = 1;
    const maxLoss = midPrice * 100 * contracts;

    return {
      type: 'call',
      name: 'Long Call',
      description: `${call.expiry} ${call.strike}C`,
      direction: 'bullish',
      legs: [{ action: 'buy', strike: call.strike, expiry: call.expiry, type: 'call' }],
      strikes: [call.strike],
      entryPrice: midPrice,
      maxLoss,
      expectedGain: maxLoss * 2,
      potentialGain: maxLoss * 10,
      pop: 0.35
    };
  }

  buildCallSpread(options, atmStrike, current) {
    // Buy ATM call, sell OTM call
    const buyStrike = atmStrike;
    const sellStrike = current * 1.1;

    const buyCall = options.find(o => o.type === 'call' && o.strike === buyStrike);
    const sellCall = options
      .filter(o => o.type === 'call' && o.strike >= sellStrike)
      .sort((a, b) => a.strike - b.strike)[0];

    if (!buyCall || !sellCall) return this.buildLongCall(options, atmStrike, current);

    const buyMid = (buyCall.bid + buyCall.ask) / 2;
    const sellMid = (sellCall.bid + sellCall.ask) / 2;
    const netDebit = buyMid - sellMid;
    const maxGain = (sellCall.strike - buyCall.strike) - netDebit;

    return {
      type: 'spread',
      name: 'Bull Call Spread',
      description: `${buyCall.expiry} ${buyCall.strike}/${sellCall.strike}C`,
      direction: 'bullish',
      legs: [
        { action: 'buy', strike: buyCall.strike, expiry: buyCall.expiry, type: 'call' },
        { action: 'sell', strike: sellCall.strike, expiry: sellCall.expiry, type: 'call' }
      ],
      strikes: [buyCall.strike, sellCall.strike],
      entryPrice: netDebit,
      maxLoss: netDebit * 100,
      expectedGain: maxGain * 100 * 0.7,
      potentialGain: maxGain * 100,
      pop: 0.45
    };
  }

  buildLongPut(options, atmStrike, current) {
    // Find OTM put 5-10% below current
    const targetStrike = current * 0.95;
    const put = options
      .filter(o => o.type === 'put' && o.strike <= targetStrike)
      .sort((a, b) => b.strike - a.strike)[0];

    if (!put) return null;

    const midPrice = (put.bid + put.ask) / 2;
    const maxLoss = midPrice * 100;

    return {
      type: 'put',
      name: 'Long Put',
      description: `${put.expiry} ${put.strike}P`,
      direction: 'bearish',
      legs: [{ action: 'buy', strike: put.strike, expiry: put.expiry, type: 'put' }],
      strikes: [put.strike],
      entryPrice: midPrice,
      maxLoss,
      expectedGain: maxLoss * 2,
      potentialGain: maxLoss * 10,
      pop: 0.35
    };
  }

  buildPutSpread(options, atmStrike, current) {
    // Buy ATM put, sell OTM put
    const buyStrike = atmStrike;
    const sellStrike = current * 0.9;

    const buyPut = options.find(o => o.type === 'put' && o.strike === buyStrike);
    const sellPut = options
      .filter(o => o.type === 'put' && o.strike <= sellStrike)
      .sort((a, b) => b.strike - a.strike)[0];

    if (!buyPut || !sellPut) return this.buildLongPut(options, atmStrike, current);

    const buyMid = (buyPut.bid + buyPut.ask) / 2;
    const sellMid = (sellPut.bid + sellPut.ask) / 2;
    const netDebit = buyMid - sellMid;
    const maxGain = (buyPut.strike - sellPut.strike) - netDebit;

    return {
      type: 'spread',
      name: 'Bear Put Spread',
      description: `${buyPut.expiry} ${buyPut.strike}/${sellPut.strike}P`,
      direction: 'bearish',
      legs: [
        { action: 'buy', strike: buyPut.strike, expiry: buyPut.expiry, type: 'put' },
        { action: 'sell', strike: sellPut.strike, expiry: sellPut.expiry, type: 'put' }
      ],
      strikes: [buyPut.strike, sellPut.strike],
      entryPrice: netDebit,
      maxLoss: netDebit * 100,
      expectedGain: maxGain * 100 * 0.7,
      potentialGain: maxGain * 100,
      pop: 0.45
    };
  }

  constructStockTrade(opportunity, portfolioValue, riskBudget) {
    const current = opportunity.technicals?.current || opportunity.raw?.quote?.close;
    if (!current) return null;

    const stopPct = 0.05; // 5% stop
    const maxRisk = portfolioValue * riskBudget;
    const shares = Math.floor(maxRisk / (current * stopPct));

    if (shares < 1) return null;

    return {
      id: `trade-${opportunity.ticker}-${Date.now()}`,
      timestamp: new Date(),
      ticker: opportunity.ticker,
      thesis: opportunity.thesis_summary,
      thesis_type: opportunity.thesis_type,
      instrument: {
        type: 'stock',
        description: `Long ${shares} shares`,
        legs: [{ action: 'buy', type: 'stock', quantity: shares }]
      },
      asymmetry: {
        score: 5,
        max_loss: shares * current * stopPct,
        expected_gain: shares * current * 0.15,
        potential_gain: shares * current * 0.30,
        risk_reward_ratio: 3,
        probability_of_profit: 0.50
      },
      entry: {
        price: current,
        condition: 'Market order'
      },
      stop_loss: {
        price: current * 0.95,
        type: 'hard',
        rationale: '5% stop loss'
      },
      take_profit: {
        targets: [
          { price: current * 1.10, size_pct: 50 },
          { price: current * 1.20, size_pct: 50 }
        ]
      },
      catalyst: {
        event: opportunity.catalysts?.[0] || 'Technical',
        date: 'unknown'
      },
      sizing: {
        kelly_fraction: 0.1,
        recommended_size_pct: (shares * current / portfolioValue) * 100,
        max_portfolio_risk_pct: riskBudget * 100
      },
      invalidation: {
        price_level: current * 0.95,
        thesis_break: 'Break below stop loss'
      },
      conviction: 'low',
      reasoning: [opportunity.thesis_summary]
    };
  }
}

export default new TraderAgent();
