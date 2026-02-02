# VHunter Feed System Design

## Overview

The Feed System is a signal intelligence layer that captures qualitative market insights (tweets, blog posts, charts) and processes them into a **cumulative macro thesis**. Insights are extracted as **general market signals** (not ticker-specific) and used as context for any stock analysis. It bridges the gap between social/fundamental signals and trading decisions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  CAPTURE │    │  STORE   │    │ EXTRACT  │    │   MACRO THESIS   │  │
│  │          │    │          │    │          │    │                  │  │
│  │ • Tweet  │───▶│ D1 + R2  │───▶│ Claude   │───▶│  Living document │  │
│  │ • Blog   │    │ feed_items    │ extracts │    │  updated by AI   │  │
│  │ • Chart  │    │          │    │ insights │    │  from insights   │  │
│  │ • Link   │    │          │    │          │    │                  │  │
│  └──────────┘    └──────────┘    └──────────┘    └────────┬─────────┘  │
│                                                            │            │
│       Mobile          Backend         On-demand            ▼            │
│       FAB/Form        Worker          Batch         ┌──────────────┐   │
│                                                     │   ANALYSIS   │   │
│                                                     │ Thesis used  │   │
│                                                     │ as context   │   │
│                                                     │ for any stock│   │
│                                                     └──────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Tables

```sql
-- feed_items: raw signals from tweets, blogs, charts
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT,               -- tweet/blog/chart/link
  author TEXT,
  content TEXT NOT NULL,
  image_urls TEXT,                -- JSON array
  insight_data TEXT,              -- AI-extracted: {signal, direction, theme, timeframe}
  status TEXT DEFAULT 'raw',      -- raw/processed
  created_at TEXT,
  processed_at TEXT
);

-- macro_thesis: single evolving view
CREATE TABLE macro_thesis (
  id TEXT PRIMARY KEY DEFAULT 'current',
  version INTEGER DEFAULT 1,
  signals_count INTEGER DEFAULT 0,
  thesis_data TEXT,               -- JSON: {regime, bias, narrative, themes, sectors, catalysts, risks}
  updated_at TEXT
);
```

---

## Data Structures

### Extracted Insight (per feed item)

Stored in `feed_items.insight_data`. **Lean extraction** - one signal per feed item, feeds into thesis.

```json
{
  "signal": "Rotation from speculative growth to value accelerating",
  "direction": "risk-off",
  "theme": "rotation",
  "timeframe": "near-term",
  "catalyst": "lockup expiries"  // optional, only if specific event mentioned
}
```

That's it. No nested arrays, no categories. One clean signal per item.

### Macro Thesis (cumulative)

Stored in `macro_thesis` table. **PM's working view** - fits on a post-it note.

```json
{
  "version": 12,
  "updated_at": "2024-12-28",
  "signals_count": 45,

  "regime": "rotation",
  "bias": "cautious",

  "narrative": "Growth-to-value rotation accelerating. Speculative names under pressure from lockups and valuation resets. Risk-off bid building.",

  "themes": ["rotation", "risk-off", "dollar-weakness"],

  "sectors": {
    "ow": ["value", "commodities", "defensives"],
    "uw": ["speculative-growth", "meme", "crypto-adjacent"]
  },

  "catalysts": ["FOMC 1/29", "NFP 2/7"],

  "risks": ["fed-pivot", "melt-up", "geopolitical-shock"]
}
```

**7 fields that matter:**
| Field | Purpose |
|-------|---------|
| `regime` | Market environment: risk-on, risk-off, rotation, range |
| `bias` | Net stance: bullish, bearish, cautious, neutral |
| `narrative` | 1-2 sentence thesis (human readable) |
| `themes` | Active market narratives |
| `sectors.ow/uw` | Overweight/Underweight tilts |
| `catalysts` | Next 2-3 macro events |
| `risks` | What breaks the thesis |

---

## Processing Pipeline

### Step 1: Extract Insight

One signal per feed item. Keep it atomic.

```javascript
// POST /api/feed/extract-batch?limit=20

const extractionPrompt = `
Extract ONE market signal from this content.

SOURCE: ${source_type} by ${author}
CONTENT: ${content}

Output JSON (5 fields max):
{
  "signal": "one sentence market observation",
  "direction": "risk-on|risk-off|bullish|bearish|neutral",
  "theme": "rotation|risk-off|momentum|value|growth|macro|sector|flow",
  "timeframe": "near|medium|long",
  "catalyst": "specific event if mentioned, else null"
}

Rules:
- Extract the MARKET SIGNAL, not stock opinion
- "Rotation accelerating" not "IONQ going down"
- One signal only. If multiple, pick the strongest.
- Be terse. This feeds a trading thesis.
`;
```

### Step 2: Update Thesis

Fold new signals into thesis with **historical context**. Thesis evolves based on both recent signals AND overall signal distribution.

```javascript
// POST /api/thesis/update

// Historical context from last 7 days (50 signal sample for efficiency):
// - Direction distribution: Bull 45% | Bear 35% | Neutral 20%
// - Theme ranking: macro:12, rotation:8, flow:6, technicals:5
// - Ticker ranking: NVDA(8+), SPX(6~), VIX(4-), TSLA(3+)

const thesisUpdatePrompt = `
You are a macro strategist synthesizing market signals into a thesis.

CURRENT THESIS:
Regime: ${currentThesis.regime} | Bias: ${currentThesis.bias}
${currentThesis.narrative}

7-DAY CONTEXT (${totalSignals} signals): Bull 45% | Bear 35%
Themes: macro:12, rotation:8, flow:6
Tickers: NVDA(8+), SPX(6~), VIX(4-)
NOTE: Balance new signals with overall distribution. Don't let recent spikes override patterns.

NEW SIGNALS (${insights.length}):
Bull: 3 | Bear: 2 | Neutral: 1
...

Balance historical patterns with new signals. Note divergences. Keep thematic coverage broad.
Output ONLY JSON, no markdown. Be concise.
`;
```

**Key improvement**: Historical context prevents thesis from being dominated by a few recent tweets. The AI sees:
- 7-day direction distribution (bull/bear %)
- Theme flow across time (not just new themes)
- Ticker sentiment with bias indicators (+/- /~)

### Step 3: Inject into Stock Analysis

Thesis becomes context header for any ticker analysis.

```javascript
// In prompts.js

const macroContext = `
MACRO: ${thesis.regime} | ${thesis.bias}
${thesis.narrative}
Themes: ${thesis.themes.join(', ')}
OW: ${thesis.sectors.ow.join(', ')} | UW: ${thesis.sectors.uw.join(', ')}
Catalysts: ${thesis.catalysts.join(', ')}
Risks: ${thesis.risks.join(', ')}
`;

// Prepend to any stock analysis prompt
const analysisPrompt = `
${macroContext}
---
Analyze ${ticker}. Consider macro backdrop above.
`;
```

**3 lines of context, not a wall of text.** The AI connects dots between macro view and specific stock.

---

## API Endpoints (Phase 2-3)

```
POST /api/feed/extract          # Extract insights from unprocessed feeds
POST /api/thesis/update         # Fold new insights into thesis
GET  /api/thesis                # Get current thesis
```

That's the core. Everything else is CRUD we already have.

---

## Workflow

```
CAPTURE → EXTRACT → UPDATE THESIS → ANALYZE
   ↓         ↓            ↓             ↓
 Mobile    Batch AI    Fold into     Inject as
 or Web    process     live view     context
```

**Daily**: Capture signals → Extract → Update thesis
**Per-trade**: Thesis auto-injected into stock analysis

---

## Implementation Checklist

### Phase 1: Feed Capture ✓
- [x] D1 schema, R2 bucket
- [x] CRUD endpoints + image upload
- [x] Feed page, modal, FAB

### Phase 2: Insight Extraction ✓
- [x] `POST /api/feed/extract` endpoint
- [x] Extraction prompt (signal, direction, theme, timeframe)
- [x] "Extract" button in Feed UI
- [x] Show insight badge on processed items

### Phase 3: Thesis ✓
- [x] `macro_thesis` table
- [x] `POST /api/thesis/update` endpoint
- [x] `GET /api/thesis` endpoint
- [x] Thesis card in UI (dark gradient, regime/bias badges)

### Phase 4: Integration ✓
- [x] Import `getCurrentThesis()` in prompts.js
- [x] Dynamic macro context injected into analysis prompts
- [x] Portfolio analysis uses same thesis context

---

## Usage

**Capture** (mobile/desktop): See signal → FAB → paste/screenshot → save

**Process** (batch): Extract button → AI extracts signals → Update Thesis button → thesis evolves

**Analyze** (per-stock): Enter ticker → macro context auto-injected → AI produces thesis-aware analysis
