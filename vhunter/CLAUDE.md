# VHunter - AI Stock Signal Terminal

## Project Overview
VHunter is an AI-powered stock analysis terminal that provides technical indicators, AI-generated trade ideas, and position tracking.

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
├── index.html          # Main HTML with sidebar navigation, 4 pages
├── css/style.css       # All styles including responsive design
├── js/
│   ├── app.js          # Main application logic, page switching, CRUD
│   ├── api.js          # Polygon.io and Claude API calls via proxy
│   ├── db.js           # Database API module (positions, watchlist, notes)
│   ├── ui.js           # UI update functions
│   ├── charts.js       # Chart.js chart rendering
│   ├── indicators.js   # Technical indicator calculations
│   ├── prompts.js      # AI prompt builders
│   └── config.js       # Configuration (proxy URL, etc.)
```

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
  type TEXT NOT NULL CHECK(type IN ('long', 'short', 'call', 'put')),
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

## Current User Positions (as of Dec 27, 2025)

User ID: `vhunter-serhat`

| ID | Ticker | Type | Entry | Qty | Notes |
|----|--------|------|-------|-----|-------|
| pos-001 | IONQ | short | $47.82 | 130 | Short stock -130 shares @ $47.82 |
| pos-002 | CVNA | put | $14.95 | 1 | CVNA 16JAN26 450 P |
| pos-003 | IONQ | put | $3.52 | 2 | IONQ 23JAN26 49 P |
| pos-004 | LMND | put | $5.37 | 1 | LMND 30JAN26 75 P |
| pos-005 | RGTI | put | $1.70 | 4 | RGTI 23JAN26 23 P |
| pos-006 | WDAY | put | $2.14 | 2 | WDAY 16JAN26 210 P |
| pos-007 | WDAY | put | $3.15 | 6 | WDAY 23JAN26 210 P |

### P&L Calculation Logic

For open positions, P&L is calculated in real-time:
- **Long**: `(currentPrice - entryPrice) * quantity`
- **Short**: `(entryPrice - currentPrice) * quantity`
- **Put**: Intrinsic value = `max(0, strike - currentPrice)`, estimated option value includes ~30% time value
- **Call**: Intrinsic value = `max(0, currentPrice - strike)`, estimated option value includes ~30% time value

Option notes format: `TICKER DDMMMYY STRIKE C/P` (e.g., "IONQ 23JAN26 49 P")

## UI Structure

### Pages (sidebar navigation)
1. **Analyze** - Stock analysis with charts, indicators, AI insights
2. **Positions** - Track open/closed positions with P&L
3. **Watchlist** - Track tickers with price alerts
4. **Notes** - Trading notes with tags

### Key UI Elements
- Sidebar: Fixed on desktop, slide-out on mobile (< 1024px)
- Header: Search bar, signal score (only on Analyze page)
- Modals: Position form, close position, watchlist, notes

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

## Important Notes

1. **API Response Format**: API returns arrays directly, NOT `{ data: [...] }`
2. **Position IDs**: String format (e.g., "pos-001"), not integers
3. **Options Multiplier**: For options, quantity is contracts (each = 100 shares)
4. **P&L Calculation**: Calculated on close: `(exit - entry) * qty * multiplier` where multiplier is -1 for short/put
