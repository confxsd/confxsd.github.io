# VHunter - AI Market Intel Terminal

## Overview
AI-powered stock analysis terminal with technical indicators, options analytics, multi-agent intelligence, institutional filing research, and position tracking.

## Architecture

### Frontend (This Directory)
- **Location**: `/Users/serhat/Code/market/confxsd.github.io/vhunter/`
- **Hosted at**: https://confxsd.github.io/vhunter/
- **Tech**: Vanilla ES6 modules, Chart.js, no framework (intentional)

### Backend (Cloudflare Worker)
- **Location**: `/Users/serhat/Code/market/vhunter-proxy/`
- **Deployed at**: https://api.rome.markets
- **Tech**: CF Workers + D1 + KV + R2 + Durable Objects + Queues

### ML Layer (Python)
- **Location**: `/Users/serhat/Code/market/vhunter-ml/`
- **Tech**: pandas, scikit-learn, scipy → pushes results to D1

## File Structure

```
vhunter/
├── index.html                    # Single-page app with all pages embedded
├── js/
│   ├── app.js                    # Init, page registration, global handlers
│   ├── config.js                 # CONFIG: PROXY_URL, CLAUDE_MODEL, defaults
│   ├── api.js                    # Polygon.io & Claude API calls via proxy
│   ├── db.js                     # D1 database CRUD (positions, watchlist, notes, feed, memory, etc.)
│   ├── cache.js                  # In-memory cache with 1-min TTL (prices, options, details)
│   ├── router.js                 # Hash-based routing (parseRoute, updateRoute)
│   ├── pages.js                  # Page switching, loader registration, section collapse
│   ├── ui.js                     # DOM helpers ($() selector), formatting, signal/status updates
│   │
│   ├── analysis.js               # Core analysis engine (~28k lines) - data fetch, indicators, AI
│   ├── charts.js                 # Chart.js rendering, multi-timeframe, reference lines
│   ├── indicators.js             # RSI, EMA, MACD, ATR, SMA, Bollinger, VWAP, MFI, A/D, ADX
│   ├── financial-math.js         # Black-Scholes, log returns, expected move, straddle pricing
│   │
│   ├── options-page.js           # Options terminal: IV term structure, skew, GEX, dealer positioning
│   ├── gamma.js                  # GEX/DEX calculations, gamma exposure, delta hedging
│   ├── vol-tools.js              # Straddle pricing, expected moves, earnings vol, three lenses
│   ├── iv-history.js             # IV tracking (localStorage 252-day rolling), IV Rank/Percentile
│   │
│   ├── positions.js              # Position CRUD, real-time P&L, option parsing
│   ├── portfolio.js              # AI portfolio analysis, risk scoring, thesis alignment
│   ├── watchlist.js              # Watchlist CRUD, Hunt feature (scan for opportunities)
│   ├── notes.js                  # Notes CRUD with tags
│   │
│   ├── feed.js                   # Signal capture (tweets, blogs, charts), AI extraction, thesis gen
│   ├── memory-map.js             # Semantic memory layer, entity matching
│   ├── opportunities.js          # Trading opportunities, multi-agent analysis display
│   ├── filings.js                # SEC filings UI (~84k lines), PIPE deals, fund holdings
│   ├── filings-analytics.js      # Institutional analytics (lazy-loaded), AI synthesis
│   │
│   ├── terminal.js               # Bloomberg-style grid with TradingView widgets
│   ├── macro.js                  # Macro dashboard: indices, VIX, rates, commodities, rotation
│   ├── strategy.js               # SIG Incentive Dashboard, focus stock tracking
│   ├── daily-checker.js          # Daily check scheduling, results display
│   ├── ticker-pipeline.js        # Per-ticker scoring stages, auto-polling
│   ├── active-trades.js          # Active/closed trades, AI evaluation
│   ├── deep-analysis.js          # ML filing analytics, smart money detection
│   ├── signal-log.js             # Signal accuracy tracking, backtesting
│   ├── signal-scorer.js          # Client-side opportunity scoring vs live data
│   │
│   ├── prompts/                  # Modular AI prompt builders
│   │   ├── index.js              # Prompt exports
│   │   ├── combined.js           # Analysis prompts
│   │   ├── portfolio.js          # Portfolio prompts
│   │   ├── summary.js            # Summary prompts
│   │   └── builders/             # Prompt builder utilities
│   ├── llm-export.js             # Data export for LLM consumption (modal)
│   │
│   ├── history.js                # Ticker search history (10 max)
│   ├── utils.js                  # formatNum, avg, erf, formatTimeAgo, calculateMaxPain
│   ├── teaching-tips.js          # Educational tooltips (VRP, IV, GEX concepts)
│   ├── tooltip.js                # Auto-positioning tooltip system
│   └── tooltip-position.js       # Unified tooltip positioning portal
│
├── css/                          # 25 modular CSS files
│   ├── base.css                  # CSS variables, reset, typography
│   ├── layout.css                # App layout, sidebar, header
│   ├── components.css            # Buttons, modals, forms, cards
│   ├── responsive.css            # Mobile/tablet breakpoints
│   ├── analyze.css               # Overview page
│   ├── options.css               # Options terminal
│   ├── positions.css             # Positions page
│   ├── watchlist.css             # Watchlist page
│   ├── feed.css                  # Feed page
│   ├── filings.css               # Filings page
│   ├── filings-analytics.css     # Analytics dashboard
│   ├── terminal.css              # Terminal grid
│   ├── macro.css                 # Macro dashboard
│   ├── daily-checker.css         # Daily checker
│   ├── ticker-pipeline.css       # Ticker pipeline
│   ├── active-trades.css         # Active trades
│   ├── opportunities.css         # Opportunities
│   ├── memory-map.css            # Memory map
│   ├── strategy.css              # Strategy page
│   ├── notes.css                 # Notes page
│   ├── signal-log.css            # Signal log
│   ├── teaching.css              # Teaching tips
│   └── tooltip.css               # Tooltips
│
└── hunter/                       # Hunt feature views
```

## Pages (15+)

| Page | Module | Description |
|------|--------|-------------|
| analyze | analysis.js | Stock analysis with charts, signals, AI thesis, trade ideas |
| options | options-page.js | Professional options terminal (IV, skew, GEX, vol tools) |
| positions | positions.js | Position tracking with real-time P&L |
| watchlist | watchlist.js | Watchlist + Hunt scanner |
| notes | notes.js | Trading notes with tags |
| feed | feed.js | Signal capture + AI extraction + thesis |
| memory | memory-map.js | Semantic memory layer |
| opportunities | opportunities.js | Scored trading opportunities |
| filings | filings.js | SEC filings, PIPE deals, fund holdings |
| deep-analysis | deep-analysis.js | ML filing analytics |
| terminal | terminal.js | Bloomberg-style multi-ticker grid |
| macro | macro.js | Macro dashboard (indices, rates, commodities) |
| strategy | strategy.js | Focus stocks + alerts |
| daily | daily-checker.js | Daily check rules + results |
| pipeline | ticker-pipeline.js | Per-ticker scoring pipeline |
| active-trades | active-trades.js | Active trade management + AI eval |

## Configuration (js/config.js)

```javascript
CONFIG = {
  PROXY_URL: 'https://api.rome.markets',
  DEFAULT_TICKER: 'TSLA',
  HISTORY_DAYS: 90,
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  CLAUDE_MAX_TOKENS: 1024
}
```

## Key Patterns

### State Management
- **No framework** - module-level variables + localStorage
- Module state: `let allPositions = []` at top of each module
- Cache: In-memory with 1-min TTL (cache.js), localStorage for persistent data
- DB as source of truth: mutations go to API, state updated from response

### Cross-Module Communication
```javascript
// Callback pattern (not direct imports)
let analysisRunCallback = null;
export function setRunCallback(cb) { analysisRunCallback = cb; }
```

### Page System
```javascript
// Registration in app.js
registerPageLoaders({ positions, watchlist, notes, options, feed, ... })

// Switching
window.switchPage('analyze')  // hash-based routing
```

### DOM Helpers
```javascript
const $  = (id) => document.getElementById(id) || noopElement;
```

### API Calls
- Proxy URL: `CONFIG.PROXY_URL` (https://api.rome.markets)
- User ID: `localStorage.getItem('vhunter_user_id')` or `'vhunter-serhat'`
- Header: `X-User-Id` on all requests
- Response format: Arrays directly, NOT `{ data: [...] }`

### P&L Calculation
- Long: `(currentPrice - entryPrice) * quantity`
- Short: `(entryPrice - currentPrice) * quantity`
- Options: Intrinsic + estimated time value (~30%)
- Option notes format: `TICKER DDMMMYY STRIKE C/P` (e.g., "IONQ 23JAN26 49 P")

## Development

```bash
cd /Users/serhat/Code/market/confxsd.github.io/vhunter
python3 -m http.server 8080
# Open http://localhost:8080
```

## Telegram Bot (@romefinbot)

Handler: `vhunter-proxy/src/handlers/telegram.js`

### Commands
- `/note <text>` - Save note (auto-detects ticker)
- `/idea <text>` - Save idea with #idea tag
- `/signal <text>` - Capture market signal to feed
- `/notes` - List recent notes
- `/thesis` - Show macro thesis
- `/opps` - Show active opportunities

### Claude Q&A
- Mention `@romefinbot` or DM to ask questions
- `--smart` flag uses Sonnet (default Haiku)
- Auto-fetches live market data for context
- Sends HTML formatted messages

## Important Notes

1. **No framework by design** - vanilla JS with ES modules
2. **Modular CSS** - edit the specific page CSS file, not a monolith
3. **Callback pattern** - modules don't directly call each other
4. **Silent failures** - fallback values (--) for missing data
5. **Teaching UX** - extensive tooltip system for options concepts
6. **Largest files**: filings.js (~84k), analysis.js (~28k) - consider reading in sections
