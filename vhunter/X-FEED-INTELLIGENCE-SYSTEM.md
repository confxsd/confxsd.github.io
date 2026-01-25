# X Feed Intelligence System

## Overview

Automated market intelligence pipeline that scrapes X/Twitter, extracts trading signals using AI, and generates professional hedge fund-quality briefings.

**Built for:** VHunter Trading Platform
**API Base:** `https://api.rome.markets`
**Infrastructure:** Cloudflare Workers + D1 + R2

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATED PIPELINE (4x Daily)                 │
│    6:00 AM | 10:00 AM | 2:00 PM | 6:00 PM EST via Cron          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. SCRAPE                                                       │
│  ─────────                                                       │
│  • Fetch tweets from tracked X accounts (GraphQL API)            │
│  • Pre-filter: Regex removes Wordle, greetings, games            │
│  • AI Batch Filter: Haiku judges market relevance                │
│  • Dedupe: Skip already-captured tweets                          │
│  • Store: Save to feed_items with status='raw'                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. EXTRACT                                                      │
│  ──────────                                                      │
│  • Process raw items with Claude Haiku                           │
│  • Extract: signal, direction, tickers, levels, trade ideas     │
│  • Noise check: Mark non-market content as status='noise'        │
│  • Images: Analyze charts via vision API                         │
│  • Store: Update with insight_data, status='processed'           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. THESIS                                                       │
│  ─────────                                                       │
│  • Aggregate all processed signals                               │
│  • Generate macro thesis with Claude Sonnet                      │
│  • Output: regime, bias, themes, sectors, trade ideas, risks    │
│  • Store: Update macro_thesis table                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Feed Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/feed` | GET | List feed items with optional `?status=` filter |
| `/api/feed` | POST | Add manual feed item |
| `/api/feed/:id` | PUT | Update feed item |
| `/api/feed/:id` | DELETE | Delete feed item |
| `/api/feed/upload` | POST | Upload image to R2 |

### Daily Insight Tools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/feed/sync` | POST | **One-click pipeline**: scrape → extract → thesis |
| `/api/feed/briefing` | GET | **AI-generated daily briefing** (assistant-style) |
| `/api/feed/dashboard` | GET | Quick stats: counts, sentiment, themes, top signals |
| `/api/feed/insights` | GET | Filtered signals query |
| `/api/feed/extract` | POST | Manually trigger extraction |
| `/api/feed/bulk` | POST | Bulk operations: archive, delete, reprocess |

### Thesis

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/thesis` | GET | Get current macro thesis |
| `/api/thesis/update` | POST | Manually regenerate thesis |

### X Scraper Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/x/scrape` | POST | Manually trigger scrape |
| `/api/x/accounts` | GET | List tracked accounts |
| `/api/x/accounts` | POST | Add account to track |
| `/api/x/accounts/:username` | PUT | Update account settings |
| `/api/x/accounts/:username` | DELETE | Remove account |
| `/api/x/stats` | GET | Scraper statistics |

---

## Query Parameters

### `/api/feed/briefing`
| Param | Default | Description |
|-------|---------|-------------|
| `hours` | 24 | Look back period |

### `/api/feed/dashboard`
| Param | Default | Description |
|-------|---------|-------------|
| `hours` | 24 | Look back period |

### `/api/feed/insights`
| Param | Default | Description |
|-------|---------|-------------|
| `hours` | 48 | Look back period |
| `direction` | - | Filter: `bullish`, `bearish`, `neutral` |
| `conviction` | - | Filter: `high`, `medium`, `low` |
| `theme` | - | Filter by theme |
| `ticker` | - | Filter by ticker mention |
| `limit` | 50 | Max results |

### `/api/feed/bulk` (POST body)
```json
{
  "action": "archive|delete|reprocess",
  "ids": ["id1", "id2"],
  // OR use filter:
  "filter": {
    "status": "processed",
    "olderThanDays": 7,
    "conviction": "low"
  }
}
```

---

## Database Schema

### `feed_items`
```sql
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT CHECK(source_type IN ('tweet', 'blog', 'chart', 'link')),
  author TEXT,
  content TEXT NOT NULL,
  image_urls TEXT,              -- JSON array of image URLs
  url TEXT,                     -- Original source URL
  insight_data TEXT,            -- JSON: extracted signal data
  status TEXT DEFAULT 'raw' CHECK(status IN ('raw', 'processed', 'archived', 'noise')),
  created_at TEXT,
  processed_at TEXT
);
```

### `macro_thesis`
```sql
CREATE TABLE macro_thesis (
  id TEXT PRIMARY KEY,          -- Same as user_id
  user_id TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  signals_count INTEGER DEFAULT 0,
  thesis_data TEXT,             -- JSON: full thesis document
  updated_at TEXT
);
```

### `x_accounts`
```sql
CREATE TABLE x_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  category TEXT DEFAULT 'general',  -- macro, technicals, options, flow
  priority INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,
  x_user_id TEXT,                   -- Cached X user ID
  last_scraped_at TEXT,
  created_at TEXT
);
```

### `x_captured`
```sql
CREATE TABLE x_captured (
  tweet_id TEXT PRIMARY KEY,
  account TEXT,
  captured_at TEXT
);
```

---

## Noise Filtering Pipeline

### Layer 1: Pre-Filter (Regex)
Runs before AI to save tokens. Blocks obvious noise patterns:

```javascript
const NOISE_PATTERNS = [
  /wordle/i,
  /\b\d\/6\*?\s*\n/,          // Wordle "X/6" pattern
  /[⬜⬛🟨🟩]{5}/,             // Wordle emoji squares
  /connections\s*puzzle/i,
  /good\s*morning|gm\s*everyone/i,
  /happy\s*(monday|tuesday|...)/i,
  /^(gm|gn|good night)[\s!]*$/i,
  /\bbreakfast\b|\blunch\b|\bdinner\b/i,
  /\bcoffee\b.*\bmorning\b/i,
];
```

### Layer 2: AI Batch Filter (Haiku)
Judges remaining tweets in batch. Keeps only:
- Market data, levels, flows, positioning
- Trading signals with specific tickers
- Macro/economic analysis with substance
- Charts showing price action
- Breaking financial news

### Layer 3: Extraction Noise Check
During extraction, AI can mark items as noise:
```json
{"isNoise": true, "reason": "Personal content - game results"}
```
These get `status: 'noise'` and are excluded from briefings.

---

## AI Models Used

| Task | Model | Cost | Reason |
|------|-------|------|--------|
| Batch filtering | `claude-3-5-haiku-20241022` | ~$0.001/batch | Fast, cheap for simple judgment |
| Signal extraction | `claude-3-5-haiku-20241022` | ~$0.01/signal | Good enough for structured extraction |
| Thesis generation | `claude-sonnet-4-20250514` | ~$0.50/run | Needs deeper reasoning |
| Briefing generation | `claude-3-5-haiku-20241022` | ~$0.02/run | Structured output, fast |

**Estimated Monthly Cost:** $30-60 (2 runs/day)

---

## Extracted Signal Structure

```json
{
  "isNoise": false,
  "signal": "SPX breaking below 5800 support on heavy volume...",
  "direction": "risk-on|risk-off|bullish|bearish|neutral",
  "theme": "rotation|macro|flow|technicals|earnings|...",
  "asset_class": "equity|rates|fx|commodities|crypto",
  "sectors": ["tech", "semis", "financials"],
  "tickers": ["SPX", "NVDA", "VIX"],
  "timeframe": "intraday|near-term|medium-term|long-term",
  "conviction": "high|medium|low",
  "catalyst": "FOMC Jan 29",
  "contrarian": false,
  "dataPoints": {
    "levels": ["SPX 5800", "VIX 18"],
    "flows": "dark pool, GEX data",
    "metrics": "IV rank, P/C ratio",
    "targets": "5720 gap fill"
  },
  "tradingImplication": "Sell rallies toward 5850",
  "riskToSignal": "Above 5850 negates bearish thesis",
  "chartAnalysis": {  // Only if images present
    "pattern": "bear flag",
    "keyLevels": {"support": [5780], "resistance": [5850]},
    "trend": "downtrend",
    "volumeConfirmation": "yes"
  }
}
```

---

## Briefing Structure

```json
{
  "headline": "AI Compute Scarcity Drives Tech Rally",
  "tldr": "2-3 sentence executive summary",

  "regime": {
    "current": "rotation",
    "bias": "bullish",
    "conviction": 8,
    "shift": "Description of regime change or null"
  },

  "sections": {
    "shifts": [{
      "title": "AI Infrastructure Breakout",
      "description": "What changed",
      "implication": "What to do"
    }],

    "important": [{
      "title": "Key signal headline",
      "source": "@author",
      "insight": "Core insight",
      "tickers": ["NVDA"],
      "urgency": "immediate|today|this-week"
    }],

    "opportunities": [{
      "idea": "Long AI Infrastructure",
      "direction": "long",
      "tickers": ["NVDA", "AMD"],
      "entry": "Current levels",
      "target": "5-10% upside",
      "conviction": "high",
      "timeframe": "weeks",
      "rationale": "Why this makes sense"
    }],

    "risks": [{
      "risk": "What could go wrong",
      "trigger": "What to watch",
      "hedge": "How to protect",
      "probability": "medium"
    }],

    "watchlist": {
      "bullish": ["NVDA", "AMD"],
      "bearish": ["CAC40"],
      "catalyst": ["Earnings dates"]
    }
  },

  "keyLevels": [
    {"ticker": "SPX", "level": 5800, "type": "support", "note": "Critical"}
  ],

  "actionItems": [
    "Accumulate NVDA on pullbacks",
    "Reduce European exposure"
  ]
}
```

---

## Thesis Structure

```json
{
  "regime": "risk-on|risk-off|rotation|range|neutral",
  "bias": "bullish|bearish|cautious|neutral",
  "conviction": 1-10,
  "timeHorizon": "days|weeks|months",

  "executiveSummary": "3-5 sentence professional summary",
  "primaryThesis": "One clear thesis statement",
  "narrative": "4-8 sentence detailed analysis",

  "marketAnalysis": {
    "currentState": "Description",
    "keyDrivers": ["Driver 1", "Driver 2"],
    "technicalPicture": "Summary",
    "sentimentReading": "Overall sentiment",
    "intermarketSignals": "Cross-asset signals"
  },

  "themes": [{
    "name": "Theme name",
    "description": "Detailed description",
    "conviction": "high|medium|low",
    "signals": ["Supporting signals"],
    "trades": ["How to express"]
  }],

  "sectorAnalysis": {
    "overweight": [{"sector": "", "rationale": "", "tickers": []}],
    "underweight": [{"sector": "", "rationale": "", "tickers": []}],
    "avoid": ["Sectors with binary risk"]
  },

  "tickerIntelligence": [{
    "ticker": "NVDA",
    "signalCount": 5,
    "netBias": "bullish",
    "keySignals": ["..."],
    "technicals": "Levels/patterns",
    "catalyst": "Earnings Feb 21",
    "tradingView": "How to trade"
  }],

  "volatilityAnalysis": {
    "currentLevel": "normal",
    "direction": "stable",
    "strategy": "Vol strategy recommendation",
    "trades": ["Specific vol trades"]
  },

  "keyLevels": {
    "SPX": {"support": [], "resistance": [], "commentary": ""},
    "VIX": {"floor": null, "ceiling": null, "commentary": ""}
  },

  "catalystCalendar": [{
    "date": "Jan 29",
    "event": "FOMC",
    "impact": "high",
    "tradingImplication": "How to position"
  }],

  "riskMatrix": [{
    "risk": "Description",
    "probability": "medium",
    "impact": "high",
    "trigger": "What triggers it",
    "hedge": "How to hedge"
  }],

  "tradeRecommendations": [{
    "idea": "Trade description",
    "rationale": "Why",
    "entry": "Entry criteria",
    "target": "Target",
    "stop": "Stop loss",
    "sizing": "Position size",
    "timeframe": "Holding period",
    "conviction": "high"
  }],

  "contraindicators": ["What invalidates thesis"],
  "rawSignalSummary": "2-3 paragraph synthesis of all signals"
}
```

---

## Cron Schedule (4x Daily)

```toml
# wrangler.toml
[triggers]
crons = ["0 11 * * *", "0 15 * * *", "0 19 * * *", "0 23 * * *"]
```

| Cron | UTC | EST | Purpose |
|------|-----|-----|---------|
| `0 11 * * *` | 11:00 | 6:00 AM | Pre-market: overnight news, Asia/Europe |
| `0 15 * * *` | 15:00 | 10:00 AM | Mid-morning: early session signals |
| `0 19 * * *` | 19:00 | 2:00 PM | Afternoon: midday developments |
| `0 23 * * *` | 23:00 | 6:00 PM | Post-market: EOD wrap-up, thesis update |

---

## Environment Secrets

```bash
# Required secrets (set via wrangler secret put)
wrangler secret put POLYGON_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put X_AUTH_TOKEN      # X cookie: auth_token
wrangler secret put X_CSRF_TOKEN      # X cookie: ct0
```

---

## Daily Workflow

### Morning (6:00 AM EST - Auto)
1. Pipeline runs automatically
2. Check `/api/feed/briefing` for AI summary
3. Review high-conviction signals

### Intraday (Manual)
```bash
# Quick sync for new signals
curl -X POST api.rome.markets/api/feed/sync

# Check briefing
curl api.rome.markets/api/feed/briefing

# Filter specific signals
curl "api.rome.markets/api/feed/insights?conviction=high&direction=bullish"
curl "api.rome.markets/api/feed/insights?ticker=NVDA"
```

### End of Day (5:30 PM EST - Auto)
1. Pipeline runs automatically
2. Check `/api/thesis` for full macro view
3. Plan next day positions

---

## Managing X Accounts

```bash
# List accounts
curl api.rome.markets/api/x/accounts

# Add account
curl -X POST api.rome.markets/api/x/accounts \
  -H "Content-Type: application/json" \
  -d '{"username": "dampedspring", "category": "macro", "priority": 2}'

# Disable account
curl -X PUT api.rome.markets/api/x/accounts/dampedspring \
  -d '{"enabled": false}'

# Delete account
curl -X DELETE api.rome.markets/api/x/accounts/dampedspring
```

### Recommended Accounts

| Username | Category | Notes |
|----------|----------|-------|
| `dampedspring` | macro | Macro/rates analysis |
| `naborsky` | macro | Macro commentary |
| `jam_croissant` | macro | Vol/macro |
| `unusual_whales` | flow | Options flow |
| `VolSignals` | options | Vol analysis |
| `spotgamma` | gamma | GEX/dealer positioning |
| `WifeyAlpha` | technicals | Charts |
| `zerohedge` | news | Breaking news |
| `DeItaone` | news | Headlines |

---

## Troubleshooting

### X API Errors
- **401 Unauthorized**: Tokens expired. Get new `auth_token` and `ct0` from browser cookies
- **429 Rate Limited**: Too many requests. Reduce scrape frequency

### Empty Syncs
- Check if accounts are enabled: `GET /api/x/accounts`
- Check stats: `GET /api/x/stats`
- Verify tokens are set: secrets in Cloudflare dashboard

### Noise Getting Through
- Add patterns to `NOISE_PATTERNS` in `x-scraper.js`
- Reprocess with: `POST /api/feed/bulk` with `{"action": "reprocess", "filter": {"status": "processed"}}`

### Thesis Not Updating
- Check if processed signals exist: `GET /api/feed?status=processed`
- Check Anthropic credits
- View logs in Cloudflare dashboard

---

## File Structure

```
vhunter-proxy/
├── src/
│   ├── index.js              # Main router + scheduled handler
│   ├── handlers/
│   │   ├── feed.js           # Feed CRUD + sync + briefing + dashboard
│   │   ├── thesis.js         # Thesis generation
│   │   ├── x-scraper.js      # X API scraping + filtering
│   │   └── ...
│   └── utils/
│       ├── cors.js           # CORS headers
│       └── helpers.js        # ID generation, timestamps
├── schema.sql                # Database schema
├── wrangler.toml             # Cloudflare config + cron
└── docs/
    └── X-FEED-INTELLIGENCE-SYSTEM.md  # This file
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/handlers/x-scraper.js` | X API calls, tweet parsing, noise filtering |
| `src/handlers/feed.js` | Feed CRUD, sync, extraction, briefing, dashboard |
| `src/handlers/thesis.js` | Thesis generation with Sonnet |
| `src/index.js:29-69` | Scheduled pipeline handler |
| `schema.sql` | Database schema |
| `wrangler.toml:24-26` | Cron schedule config |

---

## Version History

| Date | Change |
|------|--------|
| 2026-01-24 | Initial system with X scraping |
| 2026-01-24 | Added batch AI filtering (Haiku) |
| 2026-01-24 | Added noise pre-filter (regex patterns) |
| 2026-01-24 | Added `/api/feed/briefing` endpoint |
| 2026-01-24 | Added `/api/feed/sync` one-click pipeline |
| 2026-01-24 | Added `/api/feed/dashboard` and `/api/feed/insights` |
| 2026-01-24 | Extraction marks noise as `status: 'noise'` |

---

## Next Steps / Ideas

- [ ] Add more X accounts (options flow, technicals)
- [ ] Historical signal performance tracking
- [ ] Telegram/Discord notifications for high-conviction signals
- [ ] Frontend UI for briefing display
- [ ] Backtesting signal accuracy
- [ ] Position sizing recommendations based on conviction
