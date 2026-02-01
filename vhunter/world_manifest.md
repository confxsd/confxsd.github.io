# World Manifest: Asymmetric Trade Hunter

> "Position for asymmetric outcomes before the crowd arrives."

## Philosophy

- **Frontrun** — act before things are priced in
- **Asymmetry** — limited downside, unlimited upside
- **Contrarian** — profit from crowd psychology
- **Accept wrong** — small losses, massive wins
- **Dynamic** — thesis evolves with the world

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WORLD SIGNAL LAYER                          │
│       [Polygon API] [News] [Options Flow] [Sentiment]           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. MACRO THESIS ENGINE                    agents/macro.js       │
│    └─► Regime + Themes → AUTO-EXPAND to tickers                 │
│        "AI infrastructure" → [NVDA, AMD, AVGO, SMH...]          │
│        "Rates sensitive"   → [JPM, BAC, XLF, TLT...]            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. OPPORTUNITY HUNTER                agents/opportunity.js      │
│    └─► Scan THEME-DRIVEN tickers → Score → Filter               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. ANALYST AGENT                        agents/analyst.js       │
│    └─► Deep dive: Equity + Options + Technicals + AI            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. TRADER AGENT                          agents/trader.js       │
│    └─► Construct trades: Structure + Size + Entry/Exit          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ TRADE MANIFEST  │
                    └─────────────────┘
```

**Key insight**: You don't pick tickers. The macro thesis identifies themes, themes auto-expand to relevant tickers via `config.universe.theme_tickers`.

---

## Module Structure

```
hunter/
├── index.js           # Main entry, API
├── config.js          # Configuration
├── types.js           # Type definitions
├── pipeline.js        # Orchestrator
├── scoring.js         # Asymmetry/Kelly math
├── utils.js           # Helpers, cache
├── providers/
│   ├── index.js       # Provider exports
│   ├── polygon.js     # Market data (Polygon/Massive API)
│   └── claude.js      # AI reasoning
└── agents/
    ├── index.js       # Agent exports
    ├── base.js        # Base agent class
    ├── macro.js       # Macro thesis
    ├── opportunity.js # Opportunity hunting
    ├── analyst.js     # Deep analysis
    └── trader.js      # Trade construction
```

---

## Usage

```javascript
import hunter from './hunter/index.js';

// Full pipeline - THESIS DRIVEN, no watchlist needed
// 1. Macro agent identifies themes (AI, rates, etc.)
// 2. Themes auto-expand to relevant tickers
// 3. Those tickers get scanned for opportunities
const result = await hunter.run({
  portfolioValue: 100000,
  riskBudget: 0.02
});

console.log(result.manifest.trades);

// Optionally add extra tickers to scan alongside theme-driven ones
const result2 = await hunter.run({
  watchlist: ['AAPL'],  // Add to theme-driven universe
  portfolioValue: 100000
});

// Quick scan specific tickers (bypasses macro)
const opps = await hunter.scan(['META', 'GOOGL']);

// Single ticker deep analysis
const analysis = await hunter.analyze('NVDA', {
  thesis: 'AI datacenter capex acceleration'
});
```

---

## Pipeline Stages

### 1. Macro Agent

**Input**: Market context (indices, VIX, breadth, news)
**Output**: `MacroReport` + `targetTickers`

```javascript
{
  regime: 'risk-on' | 'risk-off' | 'transition',
  themes: [{ name, conviction, timeframe, sectors, catalysts }],
  risk_signals: [{ type, severity, description }],
  contrarian_view: '...',

  // AUTO-GENERATED from themes with conviction >= 6
  targetTickers: ['NVDA', 'AMD', 'SMH', 'JPM', 'TLT', ...]
}
```

### 2. Opportunity Agent

**Input**: `MacroReport` + Universe
**Output**: Scored opportunity list

```javascript
{
  ticker: 'NVDA',
  thesis_summary: 'Oversold + volume surge',
  edge_score: 7,
  timing_score: 8,
  asymmetry_score: 7,
  priority: 'high'
}
```

### 3. Analyst Agent

**Input**: Top opportunities
**Output**: Enriched with deep data

- Equity analysis (valuation, catalysts)
- Options analysis (IV, skew, flow)
- Technical analysis (trend, support/resistance)
- AI synthesis

### 4. Trader Agent

**Input**: Enriched opportunities
**Output**: Trade recommendations

```javascript
{
  ticker: 'NVDA',
  instrument: {
    type: 'spread',
    description: 'Feb 900/950 Call Spread',
    legs: [...]
  },
  asymmetry: {
    score: 8.2,
    max_loss: 1500,
    potential_gain: 5000,
    risk_reward: 3.3
  },
  entry: { price: 15.00 },
  stop_loss: { price: 7.50 },
  sizing: { recommended_pct: 2 },
  conviction: 'high',
  reasoning: ['...']
}
```

---

## Scoring

### Asymmetry Score (1-10)

```javascript
score = (riskReward * 0.3) +
        (upsideMultiple * 0.2) +
        (kellyEV * 0.3) +
        (catalystClarity * 0.2)
```

| Score | R/R  | Max Loss | Potential | Catalyst |
|-------|------|----------|-----------|----------|
| 9-10  | >5:1 | <2%      | 10x+      | Dated    |
| 7-8   | 3-5:1| <3%      | 5-10x     | Clear    |
| 5-6   | 2-3:1| <5%      | 3-5x      | Probable |

### Kelly Sizing

```javascript
kelly = winRate - ((1 - winRate) / winLossRatio)
// Capped at 25% max position
```

---

## Configuration

```javascript
// config.js
{
  thresholds: {
    min_edge_score: 6,
    min_asymmetry_score: 7,
    max_trades: 10
  },
  risk: {
    max_position_pct: 5,
    max_loss_per_trade_pct: 2
  },

  // Theme → Ticker mappings (auto-expand)
  universe: {
    theme_tickers: {
      'ai_infrastructure': ['NVDA', 'AMD', 'AVGO', 'TSM', 'ASML', 'ANET', 'SMCI'],
      'energy_transition': ['TSLA', 'ENPH', 'FSLR', 'ALB', 'LAC'],
      'rates_sensitive':   ['JPM', 'BAC', 'GS', 'MS', 'WFC'],
      'consumer':          ['AMZN', 'HD', 'TGT', 'COST', 'WMT'],
      'healthcare':        ['UNH', 'LLY', 'PFE', 'MRNA', 'ABBV'],
      'china':             ['BABA', 'JD', 'PDD', 'NIO'],
      'crypto':            ['COIN', 'MARA', 'RIOT', 'MSTR'],
      'defense':           ['LMT', 'RTX', 'NOC', 'GD']
    }
  }
}
```

---

## Key Principles

### 1. Contrarian Detection

```javascript
// Extreme sentiment = contrarian opportunity
if (Math.abs(sentiment) > 80) {
  direction = sentiment > 0 ? 'short' : 'long';
}
```

### 2. Stop-Loss Discipline

- Every trade has a stop
- Max 2% loss per trade
- 50% premium loss = hard stop for options

### 3. Accept Being Wrong

- Expected win rate: ~35%
- Win/loss ratio: 3:1
- Small losses, large wins

---

## API Reference

| Method | Description |
|--------|-------------|
| `hunter.run(options)` | Full pipeline |
| `hunter.scan(tickers)` | Quick opportunity scan |
| `hunter.analyze(ticker, opts)` | Single ticker deep dive |
| `hunter.getMacro()` | Get current macro thesis |
| `hunter.getOpportunities()` | Get current opportunities |
| `hunter.getTrades()` | Get trade recommendations |
| `hunter.score(opportunity)` | Score an opportunity |
| `hunter.size(portfolio, loss, stop)` | Calculate position size |
| `hunter.getMetrics()` | Get agent metrics |
| `hunter.reset()` | Clear all state |

---

## Trade Structure Selection

```
IV High (>40%)     →  Spreads (defined risk)
IV Low (<30%)      →  Long options (cheap premium)
Bullish thesis     →  Calls / Call spreads
Bearish thesis     →  Puts / Put spreads
```

---

*"Be fearful when others are greedy, greedy when others are fearful."*
