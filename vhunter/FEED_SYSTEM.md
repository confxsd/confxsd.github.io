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

Fold new signals into thesis. Thesis evolves, doesn't reset.

```javascript
// POST /api/thesis/update

const thesisUpdatePrompt = `
You are a macro PM updating your working thesis.

CURRENT THESIS:
${JSON.stringify(currentThesis, null, 2)}

NEW SIGNALS (${insights.length}):
${insights.map(i => `- [${i.direction}] ${i.signal} (${i.theme})`).join('\n')}

Update the thesis:
1. Adjust regime/bias if signals warrant
2. Update narrative (1-2 sentences)
3. Add/remove themes based on signal clustering
4. Shift sector tilts if rotation evident
5. Update catalysts (next 2-3 only)
6. Note new risks or remove stale ones

Output JSON (same structure):
{
  "regime": "...",
  "bias": "...",
  "narrative": "...",
  "themes": [...],
  "sectors": { "ow": [...], "uw": [...] },
  "catalysts": [...],
  "risks": [...]
}

Be decisive. This is your live trading view.
`;
```

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
