# INSTITUTIONAL FILING SCANNER & SENTIMENT EXTRACTION SYSTEM

## Comprehensive Knowledge Base & Implementation Guide for Claude Code

**Version**: 2.0 — Evolved from Vulture Hunter v1 (SIG/IONQ/USAR system)
**Date**: February 4, 2026
**Purpose**: Build an automated system to scan SEC filings from institutional investors (like Alyeska, SIG, Citadel, etc.), process filing data, and generate actionable sentiment signals for options trading.

---

# PART 1: CORE THESIS — WHY THIS SYSTEM EXISTS

## The Information Asymmetry Problem

Institutional predators (market-neutral hedge funds, PIPE investors, market makers) file legally required documents with the SEC that reveal their positioning, accumulation, and distribution patterns. But:

1. **13F filings** are 45+ days delayed (filed 45 days after quarter end)
2. **13D/13G filings** reveal 5%+ ownership but lag the actual transaction
3. **S-1 registration statements** reveal PIPE investors when they file for resale rights
4. **8-K filings** reveal corporate events (PIPEs, mergers, restructurings) but omit key schedules
5. **Form 4 filings** reveal insider transactions within 2 business days
6. **SC 13D/A amendments** reveal position changes of activist investors

**The edge**: While each filing individually is delayed, the COMBINATION of filings across multiple funds creates a near-real-time picture of institutional sentiment. If Alyeska files a 13G/A increasing their position in Stock X, AND Citadel files a 13F showing new positions in the same sector, AND an 8-K reveals a PIPE deal — the convergence is the signal.

## What We Learned From IONQ/SIG and USAR/Alyeska

### The SIG/IONQ Playbook (Discovered Q4 2025)

SIG (Susquehanna International Group) used PIPE investments in IONQ as a multi-layered extraction machine:

- **$3B total PIPE commitment** across July 2024 ($55.49/share) and October 2024 ($93.00/share) PIPEs
- **79M warrant shares** at strikes ranging from $99.88 to $155.00
- SIG is NOT a directional trader — they HARVEST through 12+ simultaneous revenue streams:
  1. Options premium harvesting (theta decay on both sides)
  2. Covered calls against warrants ($100-200M/year income estimate)
  3. GEX flip exploitation (volatility regime manipulation)
  4. Manufactured volatility cycles (dump-pump-dump)
  5. Max pain pinning (both option sides expire worthless)
  6. Stealth distribution via dark pool + algorithmic selling
  7. Short squeeze weaponization (farming shorts, not fighting them)
  8. Analyst coverage coordination (pump timing with exit liquidity)
  9. Lock-up gaming (pump before expiry, distribute after)
  10. Warrant anti-dilution exploitation
  11. Total Return Swap arbitrage
  12. Multiple endgame options (convert, sell, let expire based on conditions)

**Key detection signal**: Rally/dip volume ratio. If volume is 1.5x+ higher on up days than down days, institutions are selling into retail buying. This was confirmed on IONQ.

### The Alyeska/USAR Playbook (Discovered Q1 2026)

Alyeska Investment Group (Anand Parekh, ex-Citadel global head of equities) applied the predator template to USAR (USA Rare Earth):

**Profile:**

- AUM: $31.6B, 578 holdings, 56 employees, 3 fund vehicles
- Strategy: Market-neutral long/short + event-driven
- Fee structure: 2-3% management + 20% performance (netting risk means effective 15-30%)
- Turnover: 40% per quarter — this is extraction capital, not buy-and-hold
- DNA: Direct Citadel lineage, pod shop architecture

**USAR Timeline Mapped:**

1. **Phase 1 (SPAC Setup)**: Inflection Point (IPXX) merges with USARE, March 2025. Pro forma EV: $870M
2. **Phase 2 (Quiet Accumulation)**: Alyeska builds to 12.8M shares + 14.65M warrants, cost basis ~$130-180M. During boring, low-volume period
3. **Phase 3 (Catalyst Injection)**: Government "Project Vault" $12B stockpile announcement, $1.5B PIPE at $21.50
4. **Phase 4 (Distribution or Hold)**: TBD — watch Q4 2025 13F (due mid-Feb 2026) and 13G/A filings

**Critical Pattern**: Same cast of characters appears on BOTH IONQ and USAR — Alyeska, SIG, Citadel, Jane Street, UBS. This is NOT coincidence. These firms systematically participate in PIPE/SPAC liquidity events and can be tracked.

**PIPE Structure Intelligence:**

- May 2025 PIPE ($75M): Single unnamed investor (later confirmed Alyeska via S-1 filing), 8.55M shares + pre-funded warrants + 10.7M warrants at $7.00 strike
- September 2025 PIPE: Single unnamed purchaser
- January 2026 PIPE ($1.5B): Multiple purchasers. "Large mutual fund complexes" — names to be revealed in S-1 by ~Feb 27, 2026

**Filing Timeline Intelligence:**

- 13F: Filed 45 days after quarter end (Q4 2025 → mid-February 2026)
- 13D/13G: Filed within 10 days of crossing 5% ownership (or 45 days for passive 13G)
- 13D/A or 13G/A: Amendments filed when material changes occur
- S-1: Registration statement filed 30-90 days after PIPE (reveals ALL selling stockholders by name)
- 8-K: Filed within 4 business days of material event (but can omit schedules under Reg S-K 601(b)(2))
- Form 4: Insider trades filed within 2 business days

---

# PART 2: SYSTEM ARCHITECTURE

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FILING SCANNER SYSTEM                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │ SEC EDGAR │──>│ Filing Parser│──>│ Entity Resolution │   │
│  │ Full-Text │   │ & Classifier │   │ (Fund → Ticker    │   │
│  │ Search API│   │              │   │  Mapping)         │   │
│  └──────────┘   └──────────────┘   └─────────┬─────────┘   │
│                                               │             │
│  ┌──────────┐   ┌──────────────┐              │             │
│  │ Massive  │──>│ Price/Volume │              │             │
│  │ API      │   │ Context      │──────────────┤             │
│  └──────────┘   └──────────────┘              │             │
│                                               │             │
│  ┌──────────┐   ┌──────────────┐              │             │
│  │ Benzinga │──>│ News/Analyst │              │             │
│  │ News API │   │ Sentiment    │──────────────┤             │
│  └──────────┘   └──────────────┘              │             │
│                                               ▼             │
│                                    ┌───────────────────┐    │
│                                    │ SIGNAL AGGREGATOR  │    │
│                                    │ & SCORING ENGINE   │    │
│                                    └─────────┬─────────┘    │
│                                              │              │
│                              ┌───────────────┼──────────┐   │
│                              ▼               ▼          ▼   │
│                     ┌─────────────┐ ┌──────────┐ ┌───────┐  │
│                     │ Watchlist   │ │ Alerts   │ │Report │  │
│                     │ Generator  │ │ System   │ │Engine │  │
│                     └─────────────┘ └──────────┘ └───────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Module 1: SEC EDGAR Filing Scanner

### Data Source: SEC EDGAR Full-Text Search API

**Base URL**: `https://efts.sec.gov/LATEST/search-index`

**EDGAR FULL-TEXT SEARCH API** (free, no auth required):

```
GET https://efts.sec.gov/LATEST/search-index?q={query}&forms={form_types}&dateRange=custom&startdt={YYYY-MM-DD}&enddt={YYYY-MM-DD}
```

**EDGAR Company Filings API**:

```
GET https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={filing_type}&dateb=&owner=include&count=40&output=atom
```

**EDGAR Submissions JSON** (faster, structured):

```
GET https://data.sec.gov/submissions/CIK{padded_cik}.json
```

**EDGAR Full-Text Search (EFTS)** — the most powerful endpoint:

```
GET https://efts.sec.gov/LATEST/search-index?q="Alyeska"&forms=SC%2013G,SC%2013D,13F-HR&dateRange=custom&startdt=2026-01-01&enddt=2026-02-04
```

### Filing Types to Scan

| Filing Type  | What It Reveals                                                            | Lag                          | Priority |
| ------------ | -------------------------------------------------------------------------- | ---------------------------- | -------- |
| **13F-HR**   | Quarterly long equity positions (>$100M AUM managers)                      | 45 days after quarter        | HIGH     |
| **13F-HR/A** | Amended 13F (corrections, additions)                                       | Variable                     | HIGH     |
| **SC 13G**   | Passive 5%+ ownership declaration                                          | 45 days after calendar year  | MEDIUM   |
| **SC 13G/A** | Amendment to 13G (position change)                                         | 10 days of material change   | HIGH     |
| **SC 13D**   | Activist 5%+ ownership (with intent to influence)                          | 10 days of crossing 5%       | CRITICAL |
| **SC 13D/A** | Amendment to 13D (position/intent changes)                                 | Promptly after change        | CRITICAL |
| **S-1**      | Registration statement (IPO, PIPE resale) — REVEALS PIPE INVESTORS BY NAME | 30-90 days after PIPE        | CRITICAL |
| **S-1/A**    | Amended S-1                                                                | Variable                     | CRITICAL |
| **8-K**      | Material event (PIPE, merger, restructuring, government deal)              | 4 business days              | HIGH     |
| **Form 4**   | Insider trades (officers, directors, 10%+ holders)                         | 2 business days              | HIGH     |
| **Form 3**   | Initial insider ownership statement                                        | 10 days of becoming insider  | MEDIUM   |
| **DEF 14A**  | Proxy statement (compensation, governance)                                 | Before annual meeting        | LOW      |
| **10-K**     | Annual report (full financials)                                            | 60-90 days after fiscal year | MEDIUM   |
| **10-Q**     | Quarterly report                                                           | 40-45 days after quarter     | MEDIUM   |

### Target Fund Watchlist (The Predator Registry)

These are the institutional predators whose filings we track. CIK numbers are for direct EDGAR API queries.

```python
PREDATOR_REGISTRY = {
    # TIER 1: Pod Shops / Multi-Strategy (Citadel DNA)
    "Alyeska Investment Group": {
        "cik": "0001537994",
        "type": "market_neutral_event_driven",
        "aum_approx": 31_600_000_000,
        "key_person": "Anand Parekh",
        "lineage": "Citadel",
        "signals": ["PIPE_participant", "high_turnover", "pairs_trading"],
        "filing_types": ["13F-HR", "SC 13G", "SC 13G/A", "SC 13D"],
        "known_patterns": [
            "Accumulates quietly during low-vol periods",
            "Participates in PIPE deals then distributes via S-1 registration",
            "40% quarterly turnover — photograph of a river",
            "56 employees managing $31.6B — pure leverage machine",
            "Pod team bonuses create netting risk asymmetry",
        ]
    },
    "Susquehanna International Group (SIG)": {
        "cik": "0001446194",  # Susquehanna Securities LLC
        "alt_ciks": ["0001397545"],  # SIG Holdings, etc.
        "type": "market_maker_options",
        "aum_approx": 500_000_000_000,  # Options notional
        "key_person": "Jeff Yass",
        "lineage": "Options trading + poker theory",
        "signals": ["PIPE_participant", "warrant_holder", "options_market_maker", "GEX_manipulator"],
        "filing_types": ["13F-HR", "SC 13G", "SC 13G/A"],
        "known_patterns": [
            "Uses PIPE warrants as options inventory (not directional bets)",
            "Harvests through 12+ revenue streams per position",
            "GEX flip exploitation — manufactures volatility regimes",
            "Stealth distribution via dark pool + algo selling",
            "Never needs stock to go up OR down — needs it to MOVE",
        ]
    },
    "Citadel Advisors": {
        "cik": "0001423053",
        "type": "multi_strategy_market_maker",
        "aum_approx": 65_000_000_000,
        "key_person": "Ken Griffin",
        "lineage": "Citadel (origin)",
        "signals": ["PIPE_participant", "market_maker", "total_return_swaps"],
        "filing_types": ["13F-HR", "SC 13G", "SC 13G/A"],
        "known_patterns": [
            "Largest market maker — sees all retail order flow",
            "Uses total return swaps for invisible positioning",
            "Systematic PIPE participation across SPAC/growth ecosystem",
        ]
    },
    "Jane Street Group": {
        "cik": "0001595097",
        "type": "quantitative_market_maker",
        "aum_approx": 200_000_000_000,
        "key_person": "Institutional",
        "lineage": "Quant trading",
        "signals": ["market_maker", "ETF_arbitrage", "options_flow"],
        "filing_types": ["13F-HR"],
        "known_patterns": [
            "ETF creation/redemption arbitrage",
            "Statistical arbitrage across correlated names",
        ]
    },
    "Millennium Management": {
        "cik": "0001273087",
        "type": "multi_strategy_pod_shop",
        "aum_approx": 67_000_000_000,
        "key_person": "Israel Englander",
        "lineage": "Pod shop pioneer",
        "signals": ["PIPE_participant", "high_turnover", "sector_rotation"],
        "filing_types": ["13F-HR", "SC 13G"],
        "known_patterns": [
            "Similar netting risk structure to Alyeska",
            "350+ independent trading teams",
            "Very fast rotation — positions can change within days of filing",
        ]
    },
    "Point72 Asset Management": {
        "cik": "0001603466",
        "type": "multi_strategy_pod_shop",
        "aum_approx": 35_000_000_000,
        "key_person": "Steve Cohen",
        "lineage": "SAC Capital → Point72",
        "signals": ["PIPE_participant", "event_driven", "fundamental_long_short"],
        "filing_types": ["13F-HR", "SC 13G", "SC 13D"],
        "known_patterns": [
            "Strong event-driven component",
            "Technology sector concentration",
        ]
    },
    "D.E. Shaw": {
        "cik": "0001009207",
        "type": "quantitative_multi_strategy",
        "aum_approx": 60_000_000_000,
        "key_person": "David Shaw",
        "lineage": "Quantitative pioneer",
        "signals": ["systematic_trading", "PIPE_participant"],
        "filing_types": ["13F-HR"],
        "known_patterns": [
            "Highly systematic — filing patterns are more predictable",
            "Large factor exposures that can crowd with other quants",
        ]
    },
    "Hudson Bay Capital Management": {
        "cik": "0001569391",
        "type": "event_driven_convertible_arb",
        "aum_approx": 20_000_000_000,
        "key_person": "Sander Gerber",
        "lineage": "Convertible arbitrage",
        "signals": ["PIPE_specialist", "convertible_arb", "toxic_financing"],
        "filing_types": ["13F-HR", "SC 13G", "SC 13D"],
        "known_patterns": [
            "KNOWN toxic PIPE financier — serial participant",
            "Convertible note specialist — gets shares at discount",
            "Often the unnamed 'Selling Stockholder' in S-1 filings",
            "Distribution pattern: get shares via PIPE → register via S-1 → sell into retail",
        ]
    },
    "Heights Capital Management": {
        "cik": "0001689731",  # Verify — subsidiary of SIG
        "type": "pipe_specialist",
        "aum_approx": 10_000_000_000,
        "key_person": "SIG subsidiary",
        "lineage": "Susquehanna subsidiary",
        "signals": ["PIPE_specialist", "warrant_accumulator"],
        "filing_types": ["13F-HR", "SC 13G"],
        "known_patterns": [
            "SIG's dedicated PIPE investment arm",
            "Used in IONQ PIPE — $3B commitment",
            "Warrants are used as options inventory for SIG's market making",
        ]
    },
    "Inflection Point Partners": {
        "cik": None,  # Need to find — David Blitzer's vehicle
        "type": "spac_sponsor_insider",
        "key_person": "David Blitzer",
        "lineage": "Blackstone → Harris Blitzer Sports",
        "signals": ["SPAC_sponsor", "insider_alignment_concern"],
        "filing_types": ["SC 13D", "Form 4"],
        "known_patterns": [
            "USAR SPAC sponsor — created the vehicle",
            "Extracted $55M in August 2025 at $15.75",
            "Re-bought $2.1M at $21.44 in January 2026 for headline optics",
            "Anchored the $1.5B PIPE — but how much of own money vs placement?",
        ]
    },
}
```

### CRITICAL: Filing Types by Information Value

```python
FILING_PRIORITY = {
    # TIER 1: Highest alpha per filing
    "SC 13D": {
        "alpha": "CRITICAL",
        "reason": "Activist intent — fund wants to CHANGE the company. Direction = conviction.",
        "signal": "ACCUMULATION with conviction — they're putting their name on it publicly",
        "lag": "10 calendar days from crossing 5%",
        "parse_fields": [
            "item_4_purpose",       # WHY they crossed 5% — the money quote
            "item_5_shares_owned",  # Exact share count
            "item_5_percent",       # Ownership percentage
            "item_6_contracts",     # Options, warrants, derivatives
            "item_7_material",      # Agreements with issuer
        ]
    },
    "SC 13D/A": {
        "alpha": "CRITICAL",
        "reason": "CHANGE in activist position — either adding, reducing, or changing intent",
        "signal": "Watch for purpose changes: 'investment purposes' → 'may engage with management'",
        "lag": "Promptly after material change",
        "parse_fields": ["amendment_text", "shares_change", "purpose_change"]
    },
    "S-1": {
        "alpha": "CRITICAL",
        "reason": "REVEALS PIPE INVESTORS BY NAME — the 'Selling Stockholders' table",
        "signal": "Once filed, PIPE investors can begin distributing shares to retail",
        "lag": "30-90 days after PIPE closing",
        "parse_fields": [
            "selling_stockholders_table",  # Fund name → share count mapping
            "shares_offered",              # How many shares they plan to sell
            "use_of_proceeds",             # Often 'we will not receive any proceeds'
            "warrant_terms",               # Strike prices, expiry dates
            "registration_rights",         # When they CAN sell
        ]
    },
    "8-K": {
        "alpha": "HIGH",
        "reason": "Material events: PIPE announcements, government deals, restructurings",
        "signal": "The FIRST public signal of a PIPE or catalyst",
        "lag": "4 business days from event",
        "parse_fields": [
            "item_1_01",  # Entry into material agreement
            "item_2_01",  # Completion of acquisition
            "item_3_02",  # Unregistered sales of equity (PIPE!)
            "item_5_02",  # Departure/election of directors
            "item_7_01",  # Regulation FD disclosure
            "item_8_01",  # Other events
            "item_9_01",  # Financial statements (exhibits)
        ],
        "critical_item": "item_3_02 = PIPE DEAL. This is the filing that announces private placements."
    },
    "Form 4": {
        "alpha": "HIGH",
        "reason": "Insider transactions — officers, directors, 10%+ holders",
        "signal": "Cluster selling = distribution. Buying = conviction signal.",
        "lag": "2 business days",
        "parse_fields": [
            "transaction_type",   # P=purchase, S=sale, A=award, M=exercise
            "shares",             # Number of shares
            "price",              # Transaction price
            "ownership_type",     # D=direct, I=indirect
            "post_transaction_shares",  # What they hold after
        ]
    },
    "13F-HR": {
        "alpha": "MEDIUM-HIGH",
        "reason": "Full long portfolio snapshot — but 45 days delayed",
        "signal": "Best for tracking sector rotation, new positions, complete exits",
        "lag": "45 days after quarter end",
        "parse_fields": [
            "holdings_table",      # CUSIP → shares → value mapping
            "put_call_indicator",  # Shows options positions (limited)
            "changes_from_prior",  # Computed: new positions, exits, increases, decreases
        ],
        "critical_insight": "Complete exits are the strongest signal. When a fund dumps entirely, the thesis is dead or they've extracted what they wanted. New positions show where smart money is GOING."
    },
    "SC 13G": {
        "alpha": "MEDIUM",
        "reason": "Passive 5%+ ownership — less alpha than 13D but still shows conviction",
        "signal": "Fund is large enough to matter but claims passive intent",
        "lag": "45 days after calendar year end (or 10 days if >10%)",
        "parse_fields": ["shares_owned", "percent_of_class", "beneficial_owner"]
    },
    "SC 13G/A": {
        "alpha": "HIGH",
        "reason": "Change in passive ownership — increase = accumulation, decrease = distribution",
        "signal": "Watch for 13G → 13D conversion (passive → activist = major signal)",
        "lag": "10 days of material change",
        "parse_fields": ["shares_change", "percent_change", "conversion_to_13d"]
    },
}
```

---

## Module 2: Filing Parser & Data Extraction

### SEC EDGAR API Implementation

```python
"""
SEC EDGAR Filing Scanner — Core Implementation Spec

CRITICAL: SEC requires User-Agent header with company name and email.
Rate limit: 10 requests/second max.
"""

import requests
import time
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional

# SEC EDGAR requires identifying User-Agent
EDGAR_HEADERS = {
    "User-Agent": "SentinelCapital research@example.com",  # REQUIRED by SEC
    "Accept-Encoding": "gzip, deflate",
}

EDGAR_BASE = "https://www.sec.gov"
EDGAR_EFTS = "https://efts.sec.gov/LATEST"
EDGAR_DATA = "https://data.sec.gov"

# Rate limiter: max 10 req/sec per SEC fair access policy
class EdgarRateLimiter:
    def __init__(self, max_per_second=10):
        self.max_per_second = max_per_second
        self.timestamps = []

    def wait(self):
        now = time.time()
        self.timestamps = [t for t in self.timestamps if now - t < 1.0]
        if len(self.timestamps) >= self.max_per_second:
            sleep_time = 1.0 - (now - self.timestamps[0])
            if sleep_time > 0:
                time.sleep(sleep_time)
        self.timestamps.append(time.time())


@dataclass
class FilingRecord:
    """Represents a single SEC filing with extracted data."""
    filing_type: str           # "13F-HR", "SC 13D", etc.
    filer_name: str            # "Alyeska Investment Group LP"
    filer_cik: str             # "0001537994"
    filed_date: str            # "2026-02-03"
    period_of_report: str      # "2025-12-31"
    accession_number: str      # "0001537994-26-000123"
    filing_url: str            # Full URL to filing
    tickers_mentioned: list = field(default_factory=list)
    extracted_data: dict = field(default_factory=dict)
    sentiment_signal: Optional[str] = None  # "accumulation", "distribution", "neutral"
    conviction_score: float = 0.0           # 0.0 to 1.0
    alert_priority: str = "LOW"             # "LOW", "MEDIUM", "HIGH", "CRITICAL"


# ─────────────────────────────────────────────────────────
# CORE SCANNER FUNCTIONS
# ─────────────────────────────────────────────────────────

def scan_fund_filings(cik: str, filing_types: list, days_back: int = 30) -> list[FilingRecord]:
    """
    Scan EDGAR for recent filings from a specific fund.

    Uses the submissions JSON endpoint (fastest, structured):
    GET https://data.sec.gov/submissions/CIK{padded_cik}.json

    Returns list of FilingRecord objects.
    """
    pass  # IMPLEMENT

def scan_efts_fulltext(query: str, form_types: list, start_date: str, end_date: str) -> list[dict]:
    """
    Use EDGAR Full-Text Search to find filings mentioning specific entities/tickers.

    Endpoint: https://efts.sec.gov/LATEST/search-index
    Params:
        q: search query (fund name, ticker, etc.)
        forms: comma-separated form types
        dateRange: "custom"
        startdt: YYYY-MM-DD
        enddt: YYYY-MM-DD

    This is the MOST POWERFUL endpoint because it searches INSIDE filing text,
    not just metadata. You can find which S-1 mentions "Alyeska" even if
    Alyeska isn't the filer.
    """
    pass  # IMPLEMENT

def scan_ticker_filings(ticker: str, days_back: int = 90) -> list[FilingRecord]:
    """
    Find ALL filings mentioning a specific ticker.
    Combines:
    1. Company filings (the company's own 8-K, 10-Q, S-1)
    2. Institutional filings (13F, 13D, 13G mentioning the ticker)
    3. EFTS full-text search for ticker mentions in ANY filing
    """
    pass  # IMPLEMENT

def get_13f_holdings(cik: str, period: str = None) -> dict:
    """
    Parse a 13F filing to extract the full holdings table.

    13F data is available in XML format:
    https://www.sec.gov/cgi-bin/viewer?action=view&cik={cik}&type=13F&dateb=&owner=include&count=40

    Better: Use the structured XML from the filing's informationtable.xml

    Returns dict: {cusip: {name, shares, value, put_call, change_from_prior}}
    """
    pass  # IMPLEMENT

def compare_13f_quarters(cik: str, current_period: str, prior_period: str) -> dict:
    """
    Compare two 13F filings to detect:
    - NEW positions (not in prior quarter)
    - COMPLETE EXITS (in prior, not in current)
    - SIGNIFICANT INCREASES (>25% share increase)
    - SIGNIFICANT DECREASES (>25% share decrease)

    Complete exits are the STRONGEST signal.
    New positions show where smart money is GOING.
    """
    pass  # IMPLEMENT

def parse_13dg_filing(filing_url: str) -> dict:
    """
    Parse a 13D or 13G filing to extract:
    - Beneficial owner name
    - Number of shares
    - Percent of class
    - Purpose of transaction (13D Item 4 — the critical field)
    - Derivatives/options/warrants held
    - Any agreements with issuer

    Item 4 text is the MOST VALUABLE field — it reveals intent.
    """
    pass  # IMPLEMENT

def parse_s1_selling_stockholders(filing_url: str) -> list[dict]:
    """
    Parse an S-1 registration statement to extract the Selling Stockholders table.
    This is the CRITICAL function — it reveals PIPE investor identities.

    The table typically has columns:
    - Selling Stockholder (name)
    - Shares Beneficially Owned Prior to Offering
    - Maximum Shares to Be Sold
    - Shares Beneficially Owned After Offering

    Sometimes the table includes footnotes revealing warrant details, lock-up terms,
    and affiliated entities.
    """
    pass  # IMPLEMENT

def parse_8k_pipe_deal(filing_url: str) -> dict:
    """
    Parse an 8-K filing for PIPE deal details.
    Focus on Item 3.02 (Unregistered Sales of Equity Securities).

    Extract:
    - Total proceeds
    - Per-share price
    - Number of shares/warrants issued
    - Warrant strike price and expiry
    - Placement agent(s)
    - Registration rights timeline
    - Whether schedule of purchasers is included or omitted
    """
    pass  # IMPLEMENT

def parse_form4_insider_trade(filing_url: str) -> dict:
    """
    Parse Form 4 for insider transaction details.
    Available in XML format for easy parsing.

    Extract:
    - Person name and title
    - Transaction type (Purchase, Sale, Award, Exercise)
    - Shares and price
    - Post-transaction holdings
    - Whether part of a 10b5-1 plan
    """
    pass  # IMPLEMENT
```

---

## Module 3: Sentiment Signal Engine

### Signal Generation Logic

```python
"""
SENTIMENT SIGNAL ENGINE

Takes parsed filing data and generates sentiment signals.
Combines multiple filing types for higher conviction.
"""

@dataclass
class SentimentSignal:
    ticker: str
    signal_type: str          # "accumulation", "distribution", "catalyst_setup", "distribution_imminent"
    conviction: float         # 0.0 to 1.0
    direction: str            # "bullish", "bearish", "neutral"
    time_horizon: str         # "immediate" (<1 week), "short" (1-4 weeks), "medium" (1-3 months)
    sources: list             # List of filing records that generated this signal
    narrative: str            # Human-readable explanation
    suggested_action: str     # "watch", "accumulate", "fade_rally", "buy_puts", "sell_calls"
    risk_factors: list        # Known risks to the thesis
    catalyst_dates: list      # Upcoming dates that could confirm or invalidate

# ─────────────────────────────────────────────────────────
# SIGNAL PATTERNS — The Core Intelligence
# ─────────────────────────────────────────────────────────

SIGNAL_PATTERNS = {
    "PIPE_ACCUMULATION_PRE_CATALYST": {
        "description": """
            Fund accumulates shares BEFORE a PIPE deal is announced.
            This means they had advance knowledge of the catalyst or positioned
            for event-driven return. Watch for distribution AFTER the catalyst.
        """,
        "filing_combination": [
            "13F shows new/increased position in prior quarter",
            "8-K announces PIPE deal in current quarter",
            "Fund is a known PIPE participant (check PREDATOR_REGISTRY)"
        ],
        "signal": "bearish_after_catalyst",
        "conviction_base": 0.7,
        "conviction_modifiers": {
            "+0.1": "Fund has >5% ownership (13G filed)",
            "+0.1": "Fund is known PIPE specialist (Hudson Bay, Heights Capital)",
            "+0.1": "S-1 filing imminent (30-90 days after PIPE)",
            "-0.2": "Fund has historically held long-term in this sector",
            "-0.1": "Government/strategic catalyst changes fundamental value"
        },
        "action": "Wait for S-1 filing → distribution window opens → fade rallies with puts"
    },

    "SMART_MONEY_CONVERGENCE": {
        "description": """
            Multiple predator funds file showing new positions in the same ticker/sector
            within the same quarter. When Alyeska, SIG, and Citadel all show up
            on the same name, something is happening.
        """,
        "filing_combination": [
            "2+ funds from PREDATOR_REGISTRY show new/increased position",
            "13F filings from same quarter",
            "Ticker is mid-cap or SPAC/former-SPAC"
        ],
        "signal": "event_catalyst_incoming",
        "conviction_base": 0.6,
        "conviction_modifiers": {
            "+0.15": "3+ predator funds converge",
            "+0.1": "Ticker has upcoming catalyst (earnings, FDA, government)",
            "+0.1": "Options OI shows unusual activity",
            "-0.2": "Convergence is on mega-cap (likely index-driven, not alpha)"
        },
        "action": "Buy straddles/strangles before catalyst window"
    },

    "DISTRIBUTION_IMMINENT": {
        "description": """
            S-1 filed registering shares for resale → PIPE investors can now sell.
            Combined with declining price momentum and elevated volume = distribution.
        """,
        "filing_combination": [
            "S-1 filed listing selling stockholders",
            "S-1 becomes effective (SEC declares effective)",
            "Known predator fund is listed as selling stockholder"
        ],
        "signal": "bearish_distribution",
        "conviction_base": 0.75,
        "conviction_modifiers": {
            "+0.15": "PIPE entry price is significantly below current market (>30% profit)",
            "+0.1": "Volume increasing on down days (rally/dip ratio < 1.0)",
            "+0.1": "Dark pool volume % spiking (institutional off-exchange selling)",
            "-0.2": "Fundamental catalyst incoming that could override (earnings beat, FDA approval)"
        },
        "action": "Buy puts with 60-90 DTE targeting PIPE price as support level"
    },

    "ACTIVIST_ACCUMULATION": {
        "description": """
            13D filed (not 13G) — fund is declaring activist intent.
            Item 4 language reveals whether they want board seats, strategic review,
            asset sales, or management changes.
        """,
        "filing_combination": [
            "SC 13D filed (not 13G — ACTIVIST intent)",
            "Item 4 mentions specific demands",
            "Fund has history of successful activism"
        ],
        "signal": "bullish_catalyst",
        "conviction_base": 0.65,
        "conviction_modifiers": {
            "+0.15": "Fund has >10% ownership",
            "+0.1": "Item 4 mentions 'strategic alternatives' or 'sale of company'",
            "+0.1": "Company is undervalued vs peers on fundamental metrics",
            "-0.2": "Fund has history of settling for token changes",
            "-0.1": "Company has poison pill or other defenses"
        },
        "action": "Buy calls or shares, with defined risk"
    },

    "INSIDER_CLUSTER_SELLING": {
        "description": """
            Multiple Form 4 filings showing insider sales within a short window.
            Especially significant if NOT part of 10b5-1 plans.
        """,
        "filing_combination": [
            "3+ Form 4 insider sales within 2 weeks",
            "Sales NOT under 10b5-1 plan",
            "Insiders include C-suite (CEO, CFO, CTO)"
        ],
        "signal": "bearish_insider_knowledge",
        "conviction_base": 0.6,
        "conviction_modifiers": {
            "+0.15": "CEO selling >25% of holdings",
            "+0.1": "Selling occurs after quiet period ends but before earnings",
            "+0.1": "Stock is near ATH",
            "-0.2": "Selling is small % of holdings and part of routine 10b5-1",
            "-0.1": "Insiders buying simultaneously (mixed signal)"
        },
        "action": "Buy puts or sell calls with 30-60 DTE around earnings"
    },

    "COMPLETE_EXIT_BY_SMART_MONEY": {
        "description": """
            Predator fund completely exits a position (shown in 13F comparison).
            This is the STRONGEST negative signal from 13F data.
            When Alyeska dumped AFRM, OKLO, ALGN entirely in Q3 2025, those were clean kills.
        """,
        "filing_combination": [
            "13F shows 0 shares where prior quarter showed significant position",
            "Fund is from PREDATOR_REGISTRY",
            "Exit is complete (not just trimming)"
        ],
        "signal": "bearish_thesis_dead",
        "conviction_base": 0.7,
        "conviction_modifiers": {
            "+0.1": "Multiple predator funds exit same ticker simultaneously",
            "+0.1": "Position was held for 2+ quarters before exit (not just trading)",
            "-0.2": "45-day lag means current price may already reflect this",
            "-0.1": "New catalyst since filing date could change picture"
        },
        "action": "Short or buy puts only if current price hasn't already declined significantly"
    },

    "WARRANT_EXERCISE_DISTRIBUTION": {
        "description": """
            Fund exercises warrants and immediately registers shares for sale via S-1.
            This is the PIPE extraction endgame — warrants at discount strike → register → sell to retail.
        """,
        "filing_combination": [
            "S-1 shows warrant-derived shares being registered",
            "Warrant strike is significantly below current price (>50% profit)",
            "Fund holds large warrant position (from 13G or prior filings)"
        ],
        "signal": "bearish_dilution_distribution",
        "conviction_base": 0.8,
        "conviction_modifiers": {
            "+0.1": "Warrant shares represent >5% of outstanding shares",
            "+0.1": "Fund has pattern of exercise-and-sell (not hold)",
            "-0.1": "Company has buyback or other anti-dilution measures"
        },
        "action": "Buy puts targeting support at warrant strike price level"
    },

    "PASSIVE_TO_ACTIVIST_CONVERSION": {
        "description": """
            Fund converts from 13G (passive) to 13D (activist).
            This is a MAJOR signal — they're escalating from passive holder to active influencer.
        """,
        "filing_combination": [
            "SC 13D filed by entity that previously filed SC 13G",
            "Same ticker, ownership increased or maintained"
        ],
        "signal": "bullish_activist_catalyst",
        "conviction_base": 0.75,
        "action": "Buy calls — activist campaigns typically drive 15-30% moves"
    },
}
```

---

## Module 4: Price/Volume Context Integration (Massive API)

```python
"""
Use Massive API (available as MCP tools) to add price/volume context to filing signals.

CRITICAL: Filing data alone is insufficient. Must combine with:
- Current price vs PIPE price (is distribution profitable?)
- Volume patterns (rally/dip ratio for distribution detection)
- Options flow (unusual activity confirms filing signals)
- News sentiment (catalyst timing)
"""

# Available Massive API functions (MCP tools):
# - get_aggs / list_aggs: Price bars over time range
# - get_snapshot_ticker: Current snapshot (price, volume, prev close)
# - get_previous_close_agg: Prior day OHLCV
# - list_trades: Recent trade data
# - list_quotes: Recent quote data
# - get_ticker_details: Company info, market cap, shares outstanding
# - list_ticker_news: Recent news
# - list_stock_financials: Fundamental data
# - get_snapshot_direction: Market-wide gainers/losers
# - list_short_interest: Short interest data
# - list_short_volume: Daily short volume
# - list_benzinga_analyst_insights: Analyst ratings
# - list_benzinga_ratings: Rating changes
# - list_benzinga_earnings: Earnings data/calendar
# - list_benzinga_news: Real-time news feed
# - list_benzinga_consensus_ratings: Consensus ratings

def add_price_context(signal: SentimentSignal) -> SentimentSignal:
    """
    Enrich a filing-based signal with price/volume context.

    For DISTRIBUTION signals, calculate:
    1. Current price vs PIPE/warrant entry price (profit potential for distributor)
    2. Rally/dip volume ratio (>1.5 = institutional selling into retail buying)
    3. Short interest trend (increasing = crowded, decreasing = covering)
    4. Days since S-1 effective date (distribution window)

    For ACCUMULATION signals, calculate:
    1. Current price vs 52-week low/high (where in range)
    2. Volume trend (declining = quiet accumulation)
    3. Institutional ownership trend (from 13F comparisons)
    4. Upcoming catalyst calendar

    For ACTIVIST signals, calculate:
    1. Enterprise value vs peers
    2. Free cash flow yield
    3. Book value vs market cap
    4. Sum-of-parts analysis if applicable
    """
    pass  # IMPLEMENT

def calculate_rally_dip_ratio(ticker: str, days: int = 20) -> float:
    """
    THE KEY DISTRIBUTION DETECTION METRIC.

    For each day in the lookback period:
    - If close > open: count as "rally day", record volume
    - If close < open: count as "dip day", record volume

    Rally/Dip Ratio = average(rally_day_volume) / average(dip_day_volume)

    INTERPRETATION:
    > 1.5 = Institutions selling into rallies (DISTRIBUTION)
    0.8-1.2 = Normal/balanced
    < 0.8 = Institutions buying on dips (ACCUMULATION)
    """
    pass  # IMPLEMENT

def get_distribution_score(ticker: str) -> dict:
    """
    Comprehensive distribution detection combining:
    1. Rally/dip volume ratio
    2. Wyckoff distribution phase detection (PSY, BC, AR, SOW, LPSY)
    3. On-balance volume (OBV) divergence from price
    4. Dark pool volume % trend (from FINRA ATS data if available)
    5. Options put/call ratio trend
    6. Short interest trend
    7. Max pain convergence with current price

    Returns dict with:
    - distribution_score: 0.0 to 1.0
    - phase: "early", "mid", "late", "complete"
    - estimated_remaining_supply: shares
    - key_support_levels: list of prices
    - timeline_estimate: days until distribution likely complete
    """
    pass  # IMPLEMENT
```

---

## Module 5: Alert & Reporting System

### Alert Priorities

```python
ALERT_LEVELS = {
    "CRITICAL": {
        "triggers": [
            "SC 13D filed on watchlist ticker",
            "S-1 becomes effective for known PIPE",
            "13G → 13D conversion",
            "Form 4 cluster selling by CEO/CFO",
            "8-K with Item 3.02 (new PIPE deal) on tracked name"
        ],
        "notification": "Immediate — push notification + Telegram"
    },
    "HIGH": {
        "triggers": [
            "13F shows complete exit by predator fund",
            "13F shows new position by 2+ predator funds",
            "S-1 filed (not yet effective)",
            "SC 13G/A showing >2% increase/decrease",
            "Rally/dip ratio exceeds 2.0 on watched name"
        ],
        "notification": "Same-day — email digest"
    },
    "MEDIUM": {
        "triggers": [
            "13F quarterly rotation signals",
            "New 8-K on watched sector",
            "Analyst rating change on watched name",
            "Unusual options volume on watched name"
        ],
        "notification": "Daily digest"
    },
    "LOW": {
        "triggers": [
            "Routine 13F updates",
            "Index inclusion/exclusion changes",
            "Sector-level filing patterns"
        ],
        "notification": "Weekly summary"
    }
}
```

### Daily Report Template

```
═══════════════════════════════════════════════════════════
    INSTITUTIONAL FILING INTELLIGENCE REPORT
    Date: {date}
═══════════════════════════════════════════════════════════

■ CRITICAL ALERTS
  {list of critical signals with filing links and analysis}

■ NEW FILINGS FROM TRACKED FUNDS
  ┌──────────────────┬────────┬────────────────┬──────────┐
  │ Fund             │ Type   │ Ticker(s)      │ Signal   │
  ├──────────────────┼────────┼────────────────┼──────────┤
  │ Alyeska          │ 13G/A  │ USAR           │ +2.3%    │
  │ SIG/Heights      │ 13F    │ IONQ,-RGTI     │ MIXED    │
  │ Hudson Bay       │ S-1    │ {ticker}       │ DISTRIB  │
  └──────────────────┴────────┴────────────────┴──────────┘

■ PIPE DEAL TRACKER
  ┌────────────┬────────────┬─────────┬──────────────────────┐
  │ Ticker     │ PIPE Date  │ Price   │ S-1 Status           │
  ├────────────┼────────────┼─────────┼──────────────────────┤
  │ USAR       │ Jan 29, 26 │ $21.50  │ Expected ~Feb 27     │
  │ {ticker}   │ {date}     │ ${px}   │ {status}             │
  └────────────┴────────────┴─────────┴──────────────────────┘

■ DISTRIBUTION WATCHLIST
  {tickers with distribution_score > 0.6, with details}

■ ACCUMULATION WATCHLIST
  {tickers with accumulation signals from multiple predator funds}

■ 13F COMPARISON HIGHLIGHTS (Latest Quarter)
  COMPLETE EXITS: {list — STRONGEST bearish signal}
  NEW POSITIONS:  {list — where smart money is going}
  LARGEST INCREASES: {list with % change}
  LARGEST DECREASES: {list with % change}

■ UPCOMING CATALYST CALENDAR
  {dates when S-1 filings expected, earnings, lockup expiries}

═══════════════════════════════════════════════════════════
```

---

# PART 3: IMPLEMENTATION SPECIFICATION

## Tech Stack

```
Language:    Python 3.11+
HTTP:        httpx (async) or requests
Parsing:     beautifulsoup4, lxml (XML), pandas
Storage:     SQLite (local) → PostgreSQL (if scaling)
Scheduling:  APScheduler or cron
Alerts:      python-telegram-bot (Telegram), smtplib (email)
Market Data: Massive API (MCP tools — already available)
News:        Benzinga API (via Massive MCP tools — already available)
```

## Database Schema

```sql
-- Core tables

CREATE TABLE funds (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    cik TEXT UNIQUE NOT NULL,
    fund_type TEXT,
    aum_approx REAL,
    key_person TEXT,
    lineage TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE filings (
    id INTEGER PRIMARY KEY,
    fund_id INTEGER REFERENCES funds(id),
    filing_type TEXT NOT NULL,
    filed_date TEXT NOT NULL,
    period_of_report TEXT,
    accession_number TEXT UNIQUE NOT NULL,
    filing_url TEXT,
    raw_text TEXT,           -- Full text for search
    parsed_data JSON,        -- Structured extracted data
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE holdings_13f (
    id INTEGER PRIMARY KEY,
    filing_id INTEGER REFERENCES filings(id),
    cusip TEXT NOT NULL,
    ticker TEXT,
    company_name TEXT,
    shares REAL,
    value REAL,
    put_call TEXT,           -- "PUT", "CALL", or NULL
    share_change REAL,       -- vs prior quarter (computed)
    pct_change REAL,         -- vs prior quarter (computed)
    is_new_position BOOLEAN DEFAULT FALSE,
    is_complete_exit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ownership_events (
    id INTEGER PRIMARY KEY,
    filing_id INTEGER REFERENCES filings(id),
    fund_id INTEGER REFERENCES funds(id),
    ticker TEXT NOT NULL,
    event_type TEXT,          -- "13D_filed", "13G_increase", "S1_registration", etc.
    shares REAL,
    percent_of_class REAL,
    purpose_text TEXT,        -- Item 4 text for 13D
    sentiment TEXT,           -- "accumulation", "distribution", "neutral"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pipe_deals (
    id INTEGER PRIMARY KEY,
    ticker TEXT NOT NULL,
    filing_id INTEGER REFERENCES filings(id),
    announcement_date TEXT,
    pipe_amount REAL,
    per_share_price REAL,
    warrant_shares REAL,
    warrant_strike REAL,
    warrant_expiry TEXT,
    placement_agent TEXT,
    s1_filed_date TEXT,       -- When S-1 was filed
    s1_effective_date TEXT,   -- When S-1 became effective
    selling_stockholders JSON, -- Parsed from S-1
    distribution_status TEXT,  -- "pre_s1", "s1_filed", "s1_effective", "distributing", "complete"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE signals (
    id INTEGER PRIMARY KEY,
    ticker TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    conviction REAL,
    direction TEXT,
    time_horizon TEXT,
    source_filings JSON,      -- List of filing IDs
    narrative TEXT,
    suggested_action TEXT,
    risk_factors JSON,
    catalyst_dates JSON,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expired_at TIMESTAMP,     -- When signal is no longer relevant
    outcome TEXT              -- For backtesting: "correct", "incorrect", "mixed"
);

-- Indexes for fast queries
CREATE INDEX idx_filings_date ON filings(filed_date);
CREATE INDEX idx_filings_fund ON filings(fund_id);
CREATE INDEX idx_filings_type ON filings(filing_type);
CREATE INDEX idx_holdings_ticker ON holdings_13f(ticker);
CREATE INDEX idx_holdings_filing ON holdings_13f(filing_id);
CREATE INDEX idx_ownership_ticker ON ownership_events(ticker);
CREATE INDEX idx_pipe_ticker ON pipe_deals(ticker);
CREATE INDEX idx_signals_ticker ON signals(ticker);
CREATE INDEX idx_signals_type ON signals(signal_type);
```

## Scheduler Configuration

```python
SCAN_SCHEDULE = {
    # HIGH FREQUENCY — every 30 minutes during market hours
    "form4_scan": {
        "interval": "30min",
        "hours": "06:00-20:00 ET",
        "targets": "all tracked fund CIKs + watchlist tickers",
        "filing_types": ["Form 4"],
        "reason": "Form 4 filings appear within 2 business days — fastest signal"
    },

    # MEDIUM FREQUENCY — every 2 hours
    "8k_scan": {
        "interval": "2h",
        "hours": "06:00-22:00 ET",
        "targets": "watchlist tickers + sector keywords",
        "filing_types": ["8-K"],
        "reason": "8-K filings for PIPE deals, material events"
    },

    # DAILY — end of day
    "13dg_scan": {
        "interval": "daily",
        "time": "18:00 ET",
        "targets": "all tracked fund CIKs",
        "filing_types": ["SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A"],
        "reason": "Ownership changes filed within 10 days of threshold"
    },

    # DAILY — morning
    "s1_scan": {
        "interval": "daily",
        "time": "07:00 ET",
        "targets": "all watchlist tickers + EFTS search for tracked fund names",
        "filing_types": ["S-1", "S-1/A"],
        "reason": "S-1 filings reveal PIPE investor identities"
    },

    # QUARTERLY — after 13F deadline
    "13f_quarterly_analysis": {
        "interval": "quarterly",
        "dates": ["Feb 15", "May 15", "Aug 15", "Nov 15"],
        "targets": "all tracked fund CIKs",
        "filing_types": ["13F-HR", "13F-HR/A"],
        "reason": "Quarterly portfolio snapshot comparison"
    },

    # CONTINUOUS — full EFTS sweep
    "efts_fulltext_sweep": {
        "interval": "6h",
        "targets": "all tracked fund names as search queries",
        "reason": "Find ANY filing mentioning tracked funds (catches S-1 selling stockholder tables)"
    }
}
```

---

# PART 4: KNOWN EDGE CASES & GOTCHAS

## Things That Will Fool You

1. **13F is a photograph of a river** — 45-day lag means positions may have completely changed by the time you see the filing. Never trade SOLELY on 13F data. Combine with real-time price/volume.

2. **Total Return Swaps are invisible** — Like Archegos, funds can hold massive positions via TRS that appear on NO filing. The Alyeska 13G says 9.4M shares, but their swap book could be anything.

3. **Netting risk creates phantom alpha** — Pod shop performance fees are calculated on gross winners, not net portfolio. A fund can look like it's "winning" on a position while the overall investor return is negative.

4. **S-1 filing ≠ immediate distribution** — The S-1 must be declared EFFECTIVE by the SEC before shares can be sold. Track the effectiveness date, not just the filing date.

5. **13G → 13D conversion is the nuclear signal** — When a passive holder converts to activist, the stock typically moves 15-30%. But the conversion might be defensive (fund wants to preserve value) not offensive (fund wants change). Read Item 4 carefully.

6. **Market makers (SIG, Citadel, Jane Street) on 13F ≠ directional bets** — These positions are delta-hedged. Their 13F shows the LONG side of hedged positions. The short side is invisible. Do NOT interpret market maker 13F holdings as conviction longs.

7. **"Large mutual fund complexes" in 8-K = deliberate vagueness** — Companies use this language when they don't want to reveal PIPE investor identities before the S-1 filing. The S-1 is where you get the names.

8. **Dark pool volume spikes** — When institutional off-exchange volume suddenly increases while visible exchange volume drops, that's distribution happening where retail can't see it. Track FINRA ATS data with 2-week lag.

---

# PART 5: DEVELOPMENT PRIORITY ORDER

## Phase 1 (Week 1-2): Foundation

1. EDGAR API wrapper with rate limiting
2. SQLite database setup with schema
3. Fund registry with CIK mapping
4. Basic filing scanner for all tracked funds
5. 13F parser (XML) with quarterly comparison logic

## Phase 2 (Week 3-4): Core Intelligence

6. 13D/13G parser with Item 4 text extraction
7. 8-K parser with Item 3.02 PIPE detection
8. S-1 selling stockholder table parser
9. Form 4 parser (XML — well-structured)
10. Signal pattern matching engine

## Phase 3 (Week 5-6): Integration

11. Massive API integration for price/volume context
12. Rally/dip volume ratio calculator
13. Distribution score engine
14. Benzinga news sentiment integration
15. Alert system (Telegram + email)

## Phase 4 (Week 7-8): Intelligence Layer

16. EFTS full-text search for cross-filing intelligence
17. PIPE deal lifecycle tracker (announcement → S-1 → effective → distribution → complete)
18. Daily report generator
19. Watchlist management with auto-detection
20. Backtesting framework (compare signals vs outcomes)

## Phase 5 (Ongoing): Refinement

21. Conviction score calibration
22. False positive reduction
23. New signal pattern discovery
24. Dashboard UI (optional — CLI is fine)
25. Historical filing database build-out

---

# PART 6: IMMEDIATE CONTEXT — CURRENT WATCHLIST

As of February 4, 2026, these are the active tracking targets:

```
TIER 1 (Active Positions/Thesis):
- USAR: Alyeska 12.8M shares + 14.65M warrants. $1.5B PIPE at $21.50. S-1 expected ~Feb 27.
         Watch for: Q4 2025 13F (mid-Feb), 13G/A from Alyeska, S-1 selling stockholder list.

TIER 2 (Former Positions — Watch for Residual Signals):
- IONQ: SIG/Heights Capital PIPE. Distribution thesis confirmed Q4 2025.
        Watch for: 13F showing further exits, warrant exercise filings.

TIER 3 (Watchlist for New Setups):
- All names where 2+ predator funds file new positions simultaneously
- All SPAC/former-SPAC names where 8-K shows PIPE with Item 3.02
- All names where 13D is filed (activist signal)

KNOWN UPCOMING FILING DATES:
- ~Feb 14-15, 2026: Q4 2025 13F deadline (ALL funds must file)
- ~Feb 27, 2026: USAR S-1 expected (reveals $1.5B PIPE investors)
- Watch for Alyeska 13G/A on USAR (did they participate in Jan PIPE?)
```

---

# PART 7: MINDSET PRINCIPLES

1. **You are not the prey.** You are studying the predators to hunt alongside them. When Alyeska accumulates, you accumulate. When S-1 goes effective, you buy puts.

2. **Filings are breadcrumbs, not the meal.** Each filing reveals a fragment. The signal emerges from the CONVERGENCE of multiple filings across time.

3. **The market maker is not your enemy or your ally — they are the terrain.** SIG, Citadel, Jane Street create the landscape of liquidity. Navigate it, don't fight it.

4. **Speed matters less than interpretation.** Everyone can read a 13F. Few can connect it to the S-1 filed 2 months later by a different entity on the same ticker. THAT is the edge.

5. **The predator's greatest vulnerability is that it cannot stop being what it is.** Pod shops MUST maintain risk limits. They MUST distribute when S-1 goes effective. They MUST exit when thesis breaks. These structural imperatives create predictable patterns.

6. **Rally/dip volume ratio is the single most reliable distribution signal.** Trust the math over the narrative.

7. **Complete exits on 13F are the strongest conviction signal.** When smart money dumps entirely, the thesis is dead. Don't catch falling knives they've already thrown.

---

_This document represents the accumulated intelligence from months of studying institutional predator behavior across IONQ/SIG, USAR/Alyeska, and the broader PIPE/SPAC ecosystem. It is designed to be passed directly to Claude Code for implementation._

**Document Version**: 2.0
**Last Updated**: February 4, 2026
**For Use With**: Claude Code — Institutional Filing Scanner System
