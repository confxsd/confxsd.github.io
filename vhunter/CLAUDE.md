# VHunter - AI Market Intel Terminal

## Project Overview

VHunter is an AI-powered stock analysis terminal that provides technical indicators, AI-generated trade ideas, options analytics, and position tracking.

## Architecture

### Frontend (This Directory)

- **Location**: `/Users/serhat/Code/confxsd.github.io/vhunter/`
- **Hosted at**: https://confxsd.github.io/vhunter/
- **Tech**: Vanilla JS with ES modules, Chart.js

### Backend (Cloudflare Worker)

- **Location**: `/Users/serhat/Code/vhunter-proxy/`
- **Deployed at**: https://vhunter-proxy.vhunter.workers.dev
- **Tech**: Cloudflare Worker with D1 database and KV cache

## File Structure

```
vhunter/
├── index.html              # Main HTML with sidebar navigation, 6 pages
├── css/
│   ├── base.css            # CSS variables, reset, typography
│   ├── layout.css          # App layout, sidebar, header
│   ├── components.css      # Buttons, modals, forms, cards
│   ├── analyze.css         # Overview/Analyze page styles
│   ├── options.css         # Options terminal page styles
│   ├── positions.css       # Positions page styles
│   ├── watchlist.css       # Watchlist page styles
│   ├── notes.css           # Notes page styles
│   ├── feed.css            # Feed page styles
│   ├── teaching.css        # Teaching tips popups
│   └── responsive.css      # Mobile/tablet breakpoints
├── js/
│   ├── app.js              # Main app initialization, global exports
│   ├── api.js              # Polygon.io and Claude API calls via proxy
│   ├── db.js               # Database API module (positions, watchlist, notes, feed)
│   ├── config.js           # Configuration (proxy URL, etc.)
│   ├── router.js           # Page routing and navigation
│   ├── pages.js            # Page switching logic
│   ├── ui.js               # UI update functions for analyze page
│   ├── charts.js           # Chart.js chart rendering
│   ├── indicators.js       # Technical indicator calculations
│   ├── prompts.js          # AI prompt builders
│   ├── analysis.js         # Stock analysis and AI insights
│   ├── options-page.js     # Options terminal page logic
│   ├── gamma.js            # GEX/DEX gamma exposure calculations
│   ├── vol-tools.js        # Volatility tools (VRP, cone, straddle)
│   ├── iv-history.js       # IV history and term structure
│   ├── positions.js        # Positions page logic and P&L
│   ├── watchlist.js        # Watchlist page and Hunt feature
│   ├── notes.js            # Notes page logic
│   ├── feed.js             # Feed page (signals, thesis, extract)
│   ├── portfolio.js        # AI portfolio analysis
│   ├── history.js          # Ticker history strip
│   ├── cache.js            # Client-side caching utilities
│   ├── utils.js            # Utility functions
│   └── teaching-tips.js    # Interactive teaching tips
```

## Pages

### 1. Overview (Analyze)

- Stock analysis with technical charts (Price, Volume, RSI, MACD, ADX, Bollinger, MFI, A/D, ATR)
- Signal bars (Trend, Momentum, Volume, Volatility)
- Technical signals panel
- Key stats and money flow
- AI thesis, trade ideas, news
- Options flow and key levels
- Volatility premium (VRP) gauge

### 2. Options

Professional quant-style options terminal:

- **Volatility Analysis**: IV term structure, skew, expected moves, volatility cone
- **Flow & Sentiment**: Call/Put volume, OI, sentiment gauge
- **Key Strikes**: Max pain levels, OI walls, GEX zones, dealer positioning
- **Vol Tools**: Multi-window VRP, straddle pricing, earnings vol extractor, three lenses framework
- **Trade Scanner**: Filter by type, delta, DTE, IV rank
- **AI Insight**: Market maker positioning, thesis-aligned opportunities

### 3. Feed

- Capture tweets, blog posts, charts, links
- Image attachment support
- AI-powered insight extraction
- Thesis generation from accumulated signals
- Filter by type (tweet, blog, chart)

### 4. Positions

- Track open/closed positions with real-time P&L
- Support for long, short, call, put, short_call, short_put
- AI portfolio analysis with risk score
- Thesis alignment and expiry alerts
- Win rate and performance stats

### 5. Watchlist

- Track tickers with price alerts
- Hunt feature: Scan all tickers for options opportunities
- Metrics: IV-HV, P/C ratio, put premium %, Vol/OI
- AI-generated hunt summary

### 6. Notes

- Trading notes with tags
- Filter by ticker

## API Endpoints (Cloudflare Worker)

Base URL: `https://vhunter-proxy.vhunter.workers.dev`

### Market Data (Polygon.io Proxy)

- `GET /polygon/*` - Proxies to Polygon.io API

### AI Analysis (Claude Proxy)

- `POST /claude` - Proxies to Anthropic Claude API with KV caching

### Positions API

- `GET /api/positions?status=open|closed` - Get user positions
- `POST /api/positions` - Create position
- `PUT /api/positions/:id` - Update position (close with exit_price)
- `DELETE /api/positions/:id` - Delete position

### Watchlist API

- `GET /api/watchlist` - Get user watchlist
- `POST /api/watchlist` - Add to watchlist
- `DELETE /api/watchlist/:id` - Remove from watchlist

### Notes API

- `GET /api/notes?ticker=XXX` - Get notes (optional ticker filter)
- `POST /api/notes` - Create note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

### Feed API

- `GET /api/feed` - Get user feed items
- `POST /api/feed` - Create feed item
- `PUT /api/feed/:id` - Update feed item
- `DELETE /api/feed/:id` - Delete feed item

### Thesis API

- `GET /api/thesis` - Get user thesis
- `POST /api/thesis` - Create/update thesis

## Database (Cloudflare D1)

**Database Name**: `vhunter-db`
**Database ID**: `5b519be9-257c-4141-9164-359d959062ed`

### User Identification

- User ID stored in `localStorage.getItem('vhunter_user_id')`
- Default user: `vhunter-serhat`
- Sent via `X-User-Id` header on all API requests

### Tables

#### positions

```sql
CREATE TABLE positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('long', 'short', 'call', 'put', 'short_call', 'short_put')),
  entry_price REAL NOT NULL,
  quantity REAL NOT NULL,
  entry_date TEXT NOT NULL,
  exit_price REAL,
  exit_date TEXT,
  stop_loss REAL,
  take_profit REAL,
  notes TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  pnl REAL,
  created_at TEXT,
  updated_at TEXT
)
```

#### watchlist

```sql
CREATE TABLE watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  target_price REAL,
  alert_above REAL,
  alert_below REAL,
  notes TEXT,
  priority INTEGER DEFAULT 0,
  created_at TEXT
)
```

#### notes

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  created_at TEXT,
  updated_at TEXT
)
```

#### feed

```sql
CREATE TABLE feed (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('tweet', 'blog', 'chart', 'link')),
  author TEXT,
  content TEXT NOT NULL,
  url TEXT,
  images TEXT,
  insights TEXT,
  status TEXT DEFAULT 'raw' CHECK(status IN ('raw', 'processed')),
  created_at TEXT,
  updated_at TEXT
)
```

#### thesis

```sql
CREATE TABLE thesis (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
)
```

## P&L Calculation Logic

For open positions, P&L is calculated in real-time:

- **Long**: `(currentPrice - entryPrice) * quantity`
- **Short**: `(entryPrice - currentPrice) * quantity`
- **Long Put**: Intrinsic value = `max(0, strike - currentPrice)`, estimated option value includes ~30% time value
- **Long Call**: Intrinsic value = `max(0, currentPrice - strike)`, estimated option value includes ~30% time value
- **Short Call/Put**: Inverse of long options (profit when option loses value)

Option notes format: `TICKER DDMMMYY STRIKE C/P` (e.g., "IONQ 23JAN26 49 P")

## Key Features

### Hunt Feature (Watchlist)

Scans all watchlist tickers for options opportunities:

- IV vs HV spread (volatility premium)
- Put/Call ratio and flow analysis
- Premium distribution (% in puts)
- Volume/OI ratio (unusual activity)
- Composite opportunity score

### AI Portfolio Analysis (Positions)

- Portfolio risk score
- Thesis alignment check
- Expiry alerts for near-term options
- Position-level signals
- Actionable recommendations

### Feed & Thesis

- Capture market signals from various sources
- AI extracts insights from raw signals
- Update thesis synthesizes accumulated insights
- Tracks raw vs processed signal counts

### Options Terminal Features

- **IV Term Structure**: Contango/backwardation analysis
- **Volatility Skew**: 25-delta put/call skew
- **Volatility Cone**: RV percentile by lookback window
- **GEX Zones**: Gamma flip, call/put walls, vol trigger
- **Dealer Positioning**: Delta flow, charm pin, G-ratio
- **Three Lenses**: Cross-sectional, time series, fundamental vol analysis

## Development

### Local Development

```bash
cd /Users/serhat/Code/confxsd.github.io/vhunter
python3 -m http.server 8080
# Open http://localhost:8080
```

### Deploy Worker Changes

```bash
cd /Users/serhat/Code/vhunter-proxy
npx wrangler deploy
```

### Query D1 Database

```bash
cd /Users/serhat/Code/vhunter-proxy
npx wrangler d1 execute vhunter-db --remote --command "SELECT * FROM positions WHERE user_id = 'vhunter-serhat';"
```

## Telegram Bot (@romefinbot)

### Location

`/Users/serhat/Code/vhunter-proxy/src/handlers/telegram.js`

### Overview

Telegram bot integrated into the Cloudflare Worker. Captures trading ideas, answers questions via Claude, and provides access to notes/thesis/opportunities.

### Commands

- `/note <text>` - Save a note (auto-detects ticker)
- `/idea <text>` - Save an idea with #idea tag
- `/signal <text>` - Capture market signal to feed
- `/notes` - List recent notes
- `/thesis` - Show current macro thesis
- `/opps` - Show active opportunities
- `/help` - Show help

### Claude Q&A

- Mention `@romefinbot` in group or send DM to ask questions
- `--smart` flag uses Sonnet model (default is Haiku)
- Auto-detects tickers and fetches live market data for context
- Context includes: recent notes, macro thesis, active opportunities, live price/technicals/options data

### Message Formatting

- Bot sends messages with `parse_mode: 'HTML'`
- Claude is instructed to use HTML tags (`<b>`, `<i>`, `<code>`)
- `markdownToTelegramHtml()` converts any remaining Markdown to HTML as fallback
- Special chars (`&`, `<`, `>`) are escaped before Markdown conversion

### Webhook

- Endpoint: `POST /telegram`
- Setup: `GET /telegram/setup` (one-time webhook configuration)
- Webhook URL: `https://api.rome.markets/telegram`

## Important Notes

1. **API Response Format**: API returns arrays directly, NOT `{ data: [...] }`
2. **Position IDs**: String format (e.g., "pos-001"), not integers
3. **Options Multiplier**: For options, quantity is contracts (each = 100 shares)
4. **P&L Calculation**: Calculated on close: `(exit - entry) * qty * multiplier` where multiplier is -1 for short/put
5. **Modular CSS**: Styles are split into multiple files for easier editing - edit the specific page CSS file
6. **Teaching Tips**: Interactive tooltips explain options concepts (IV rank, VRP, expected move, etc.)
