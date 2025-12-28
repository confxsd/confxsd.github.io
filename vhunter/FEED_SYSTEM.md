# VHunter Feed System Design

## Overview

The Feed System is a signal intelligence layer that captures qualitative market insights (tweets, blog posts, charts) and processes them to enhance quantitative technical analysis. It bridges the gap between social/fundamental signals and trading decisions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  INPUT   │    │  STORE   │    │ PROCESS  │    │    CONSUME       │  │
│  │          │    │          │    │          │    │                  │  │
│  │ • Tweet  │───▶│ D1 + R2  │───▶│ Claude   │───▶│ Analysis Prompts │  │
│  │ • Blog   │    │          │    │ AI       │    │ Ticker Context   │  │
│  │ • Chart  │    │          │    │          │    │ Thesis Updates   │  │
│  │ • Link   │    │          │    │          │    │                  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────────────┘  │
│                                                                          │
│       Mobile          Backend         Batch           Frontend           │
│       FAB/Form        Worker          Job             Integration        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Model

### feed_items (D1 SQLite)

```sql
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Source metadata
  source_type TEXT CHECK(source_type IN ('tweet', 'blog', 'chart', 'link')),
  author TEXT,                    -- @handle, blog name, source
  content TEXT NOT NULL,          -- raw text content
  image_urls TEXT,                -- JSON array of R2 URLs
  url TEXT,                       -- original source URL

  -- AI-extracted fields (null until processed)
  tickers TEXT,                   -- JSON array: ["IONQ", "RGTI", "SPY"]
  sentiment TEXT,                 -- bullish / bearish / neutral
  signal_type TEXT,               -- thesis / catalyst / technical / flow
  relevance_score INTEGER,        -- 1-10 importance rating
  summary TEXT,                   -- AI-generated key insight

  -- Processing state
  status TEXT DEFAULT 'raw',      -- raw / processed / archived
  created_at TEXT,
  processed_at TEXT
);
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `source_type` | enum | tweet, blog, chart, link |
| `author` | string | Source attribution (@handle, blog name) |
| `content` | text | Raw captured text |
| `image_urls` | JSON | Array of R2 image URLs |
| `tickers` | JSON | Extracted ticker symbols |
| `sentiment` | enum | Market sentiment: bullish/bearish/neutral |
| `signal_type` | enum | Category of signal |
| `relevance_score` | 1-10 | AI-rated importance |
| `summary` | text | Condensed key insight |
| `status` | enum | Processing state |

### Signal Types

| Type | Description | Example |
|------|-------------|---------|
| `thesis` | Macro/structural market view | "QC stocks are in a bubble due to..." |
| `catalyst` | Event-driven signal | "IONQ lockup expiry Jan 15" |
| `technical` | Chart/price action | "Head & shoulders forming on daily" |
| `flow` | Order flow / institutional | "Large put sweep on RGTI" |

## Image Storage (R2)

```
Bucket: vhunter-images
Path:   feed/{timestamp}-{hash}.{ext}
URL:    https://vhunter-proxy.vhunter.workers.dev/images/feed/...
```

- Images uploaded via multipart form
- Served through worker endpoint (cached 1 year)
- Linked to feed items via `image_urls` JSON array

## API Endpoints

### Feed CRUD

```
GET    /api/feed?status=raw&ticker=IONQ&limit=50&offset=0
POST   /api/feed                    # Create feed item
PUT    /api/feed/:id                # Update feed item
DELETE /api/feed/:id                # Delete feed item
```

### Image Upload

```
POST   /api/feed/upload             # Multipart form, returns {url, filename}
GET    /images/:path                # Serve image from R2
```

### Request/Response Examples

**Create Feed Item:**
```json
POST /api/feed
{
  "source_type": "tweet",
  "author": "@hedgefund_anon",
  "content": "IONQ lockup expiring, insiders likely to sell...",
  "image_urls": ["https://.../feed/123-abc.png"],
  "tickers": ["IONQ"],
  "sentiment": "bearish",
  "signal_type": "catalyst"
}
```

**Get Feed Items:**
```json
GET /api/feed?status=raw&limit=10

[
  {
    "id": "abc123",
    "source_type": "tweet",
    "author": "@analyst",
    "content": "...",
    "image_urls": "[\"https://...\"]",
    "tickers": "[\"IONQ\"]",
    "sentiment": "bearish",
    "signal_type": "thesis",
    "status": "raw",
    "created_at": "2024-12-28T10:00:00Z"
  }
]
```

## Frontend Components

### Feed Page (`#feed`)
- Stats bar: Total signals, Unprocessed count, Bearish count
- Filter tabs: All / Tweets / Blogs / Charts
- Feed list with cards showing content, thumbnails, tags
- FAB button (mobile) for quick capture

### Feed Modal
- Source type selector
- Author/source input
- Content textarea
- Image upload with preview
- Ticker tags input
- Sentiment/Signal type dropdowns

### Key Files
```
vhunter/
├── js/feed.js          # Feed module (API, render, modal)
├── css/style.css       # Feed styles (line ~3295)
└── index.html          # Feed page HTML, modal, FAB
```

---

## Phase 2: AI Processing Pipeline

### Processing Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Raw Feed   │────▶│   Claude    │────▶│  Processed  │
│   Items     │     │   Extract   │     │    Items    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Ticker    │
                    │  Sentiment  │
                    │  Aggregate  │
                    └─────────────┘
```

### Extraction Prompt Template

```
Analyze this market signal and extract structured data:

SOURCE: {source_type} by {author}
CONTENT: {content}
IMAGES: {image_count} chart(s) attached

Extract:
1. TICKERS: List all mentioned stock symbols (e.g., IONQ, SPY, $QQQ)
2. SENTIMENT: Overall market sentiment (bullish/bearish/neutral)
3. SIGNAL_TYPE: Category (thesis/catalyst/technical/flow)
4. RELEVANCE: Score 1-10 for trading relevance
5. SUMMARY: One sentence key insight

Respond in JSON:
{
  "tickers": ["IONQ", "SPY"],
  "sentiment": "bearish",
  "signal_type": "thesis",
  "relevance_score": 8,
  "summary": "Macro rotation thesis suggests QC stocks vulnerable to correction"
}
```

### Batch Processing Endpoint

```
POST /api/feed/process?limit=20

1. Fetch unprocessed items (status='raw')
2. For each item, call Claude with extraction prompt
3. Update item with extracted fields
4. Set status='processed', processed_at=now()
5. Return processing results
```

### Ticker Sentiment Aggregation

After processing, aggregate sentiment per ticker:

```sql
-- Aggregation query
SELECT
  ticker,
  COUNT(*) as total_signals,
  SUM(CASE WHEN sentiment = 'bullish' THEN 1 ELSE 0 END) as bullish,
  SUM(CASE WHEN sentiment = 'bearish' THEN 1 ELSE 0 END) as bearish,
  AVG(relevance_score) as avg_relevance
FROM feed_items, json_each(feed_items.tickers)
WHERE status = 'processed'
  AND created_at > datetime('now', '-7 days')
GROUP BY ticker
```

---

## Phase 3: Analysis Integration

### Enhanced Analysis Prompt

Current prompt structure in `prompts.js`:
```javascript
MACRO THESIS:
- US equity rotation underway...
- Bearish on speculative growth...
```

Enhanced with feed intelligence:
```javascript
MACRO THESIS:
- US equity rotation underway...

FEED INTELLIGENCE FOR ${ticker}:
- Sentiment: ${bearishCount} bearish / ${bullishCount} bullish (7d)
- Recent signals:
  • "${signal1.summary}" (${signal1.sentiment}, ${signal1.signal_type})
  • "${signal2.summary}" (${signal2.sentiment}, ${signal2.signal_type})
- Key catalysts: ${catalysts.join(', ')}
```

### Ticker-Specific Feed Context

When analyzing a ticker, fetch relevant feed items:

```javascript
async function getFeedContext(ticker) {
  const items = await getFeedItems(null, ticker);
  const processed = items.filter(i => i.status === 'processed');

  return {
    bullish: processed.filter(i => i.sentiment === 'bullish').length,
    bearish: processed.filter(i => i.sentiment === 'bearish').length,
    recentSignals: processed.slice(0, 3).map(i => ({
      summary: i.summary,
      sentiment: i.sentiment,
      signal_type: i.signal_type,
      author: i.author
    })),
    catalysts: processed
      .filter(i => i.signal_type === 'catalyst')
      .map(i => i.summary)
  };
}
```

### Thesis Evolution Tracking

Track how thesis evolves over time:

```javascript
// Compare current vs historical sentiment
const currentWeek = await getSentiment(ticker, '7d');
const previousWeek = await getSentiment(ticker, '14d', '7d');

const trendShift = currentWeek.bearishRatio - previousWeek.bearishRatio;
// Positive = becoming more bearish
// Negative = becoming more bullish
```

---

## Implementation Checklist

### Phase 1: Core Feed (Complete)
- [x] D1 table schema
- [x] R2 bucket setup
- [x] CRUD API endpoints
- [x] Image upload endpoint
- [x] Feed page UI
- [x] Modal form
- [x] FAB button (mobile)
- [x] Image carousel display

### Phase 2: AI Processing (Pending)
- [ ] Batch processing endpoint
- [ ] Extraction prompt template
- [ ] Claude API integration for extraction
- [ ] Ticker aggregation queries
- [ ] Processing status UI
- [ ] Manual re-process action

### Phase 3: Analysis Integration (Pending)
- [ ] `getFeedContext()` helper
- [ ] Enhanced analysis prompt template
- [ ] Ticker-specific feed panel
- [ ] Sentiment trend indicators
- [ ] Thesis evolution tracking

---

## Usage Patterns

### Mobile Capture Flow
1. See interesting tweet/chart
2. Copy text / screenshot
3. Tap FAB → Paste content, attach image
4. Quick tag ticker if obvious
5. Save (AI processes later)

### Desktop Review Flow
1. Open Feed page
2. Filter by unprocessed
3. Manually tag/categorize if needed
4. Trigger batch processing
5. Review extracted insights

### Analysis Enhancement Flow
1. Enter ticker in analysis
2. System fetches feed context
3. AI includes recent signals in analysis
4. Thesis reinforced/challenged by feed data
