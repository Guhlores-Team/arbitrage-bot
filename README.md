# arbitrage-engine

Source-local, flip-on-eBay arbitrage engine. Pulls candidate deals from a
source marketplace, identifies the real product from title + photos, comps it
against eBay sold listings, nets out fees, and scores the opportunity.

```
source connector → identify (vision+text) → sold comps → verify match → margin → score
```

Everything is built behind two interfaces (`SourceConnector`, `CompConnector`),
so new sources slot in without touching the engine.

## What's included

- **Web dashboard** — four tabs: **Scan** (search, tune thresholds, stats bar +
  sort/filter toolbar over scored cards), **Saved** (passing opportunities,
  persisted), **Watch** (scheduled watchlists), **Settings** (engine + alert
  status, test-alert button). Zero-dep server, binds to loopback.
- **Watch / alert mode** — saved watchlists scanned on a schedule (`npm run
  watch`), auto-saving new passing opportunities and printing alerts.
- **Persistence** — zero-infra JSON store out of the box (saved feed +
  watchlists); Prisma/Postgres schema included as the upgrade path.
- **Craigslist source connector** — uses Craigslist's built-in RSS feed. No
  login, no headless browser. The lowest-friction first source.
- **Facebook Marketplace + OfferUp + Mercari source connectors** — browser-driven
  (Playwright) with **anti-detection hardening** (see below). Facebook uses a
  persistent logged-in session; OfferUp + Mercari browse public results. Optional
  dependency; the rest of the engine runs without it.
- **Multi-source scanning** — target `all` sources (or a comma list) in one pass;
  results merge + de-dupe, and a blocked/erroring source never sinks the scan.
- **Multi-market comps** — value against several sell markets at once via
  `COMP_SOURCES` (e.g. `ebay,pricecharting`). **PriceCharting** connector covers
  games/consoles/cards (real API + mock fallback).
- **eBay comp connector** — real OAuth + Marketplace Insights request shape,
  with a mock-comps fallback so the pipeline runs before you're approved for
  sold-data access.
- **Vision + text identification** — Claude reads the listing photos to identify
  the product when the title is useless ("box of tools $40"). Falls back to a
  title-only heuristic when no `ANTHROPIC_API_KEY` is set.
- **Retrieve-then-rerank matching** — canonical-code fast path, LLM verification
  for the rest, with verdict caching (offline token-overlap fallback).
- **Honest margin math** — eBay final value fee + shipping + returns reserve.
- **Opportunity scoring** with tunable thresholds.
- **`demo` source** — deterministic offline listings so the dashboard works
  instantly with no keys, network, or browser.

## Quick start

```bash
npm install
npm run dashboard           # → http://localhost:3000, pick the "demo" source
```

The dashboard runs end to end with **no setup** on the `demo` source + mock eBay
comps (identify/match drop to offline heuristics without an API key). Add
`ANTHROPIC_API_KEY` to turn on real vision identification.

CLI equivalent:

```bash
npm run run -- "nintendo switch" 150                  # craigslist (default)
npm run run -- "nintendo switch" 150 --source=demo    # offline demo
npm run run -- "nintendo switch" 150 --source=facebook
npm run run -- "nintendo switch" 150 --source=offerup
npm run doctor                                        # live self-test of every source
npm test                                              # node:test suite
```

### Turn on real comps in one step (SerpApi)

The fastest way to get **real** valuations (no eBay approval needed): drop a
SerpApi key into `.env` and that's it —

```bash
echo "SERPAPI_KEY=your_key_here" >> .env
npm run doctor          # comp check should read: serpapi/ebay (sold)
```

With `SERPAPI_KEY` set and no explicit `COMP_SOURCES`, the engine auto-selects
SerpApi. SerpApi scrapes server-side, so its **eBay engine returns eBay data
(including SOLD prices)** without the 403 you hit scraping eBay directly. Tune
with `SERPAPI_ENGINE` (`ebay` default, or `google_shopping`) and
`SERPAPI_EBAY_SOLD` (`true` default = realized sold prices; `false` = active
asks).

**Watch your quota.** The free tier is capped (currently ~100–250 searches/mo
depending on plan), and each comp lookup spends one. `npm run doctor` prints a
live **SerpApi quota** line (left / used / total, with a ⚠ when nearly out),
read straight from SerpApi's account endpoint — so you know before it bites.

### Debug console

```bash
npm run debug                          # demo source, "nintendo switch"
npm run debug -- "airpods pro" offerup 150   # query, source, price cap
```

Forces verbose logs and runs one real scan, then prints the **funnel** (how many
listings dropped at each stage — priced out / off-topic / no comps / asking ≥
median / no match), the **top opportunities** with flags, your **SerpApi quota**,
and the **comp lookups this run cost**. The funnel tells you whether a dry scan
died on price, comps, or matching. Set `DEBUG=1` (or `LOG_LEVEL=debug`) on any
command (`npm run watch`, `npm run serve`) for the same per-listing logging.

### Performance & quota knobs

| env | default | what it does |
|-----|---------|--------------|
| `PIPELINE_CONCURRENCY` | `5` | listings identified/comped in parallel — the main scan-speed lever (the identify/vision step is the bottleneck) |
| `PREFILTER_OFFTOPIC` | `true` | skip listings whose identified product shares **no** term with your query (keyword-stuffed junk) *before* spending a comp search; only the zero-overlap case is dropped |
| `SERPAPI_MIN_RESERVE` | `0` | keep this many monthly SerpApi searches in reserve — once near the cap, scans return no comps instead of erroring |
| `SERPAPI_MAX_PER_RUN` | `0` (off) | hard cap on SerpApi searches per process — a safety belt against a runaway scan burning the month |

### Calibrate your thresholds

```bash
npm run calibrate                                       # default watchlist, demo source
npm run calibrate -- "nintendo switch,airpods pro" offerup 300
```

Runs real scans across the given queries and reports the **distribution** of
every scored candidate's margin %, net profit, match confidence, and comp count,
a **pass-count grid** (how many deals survive at each margin/profit threshold),
and a **recommended** `MIN_MARGIN_PCT` / `MIN_ABSOLUTE_PROFIT` /
`MIN_MATCH_CONFIDENCE` set ready to paste into `.env`. Use it to tell whether a
quiet scan means your thresholds are too strict or the source simply has no deals
right now. Reuses one comp cache across queries, so it's quota-cheap. Args:
`[queries (comma-separated)] [source] [hardPriceCap]`; `CALIBRATE_LIMIT` (default
12) sets listings pulled per query.

### Going live (production checklist)

A working, quota-aware setup that scans only what pays and what isn't blocked.
Put these in `.env`:

```bash
# Thresholds — from `npm run calibrate` (surface deals worth acting on)
MIN_MARGIN_PCT=0.20
MIN_ABSOLUTE_PROFIT=25
MIN_MATCH_CONFIDENCE=0.8

# SerpApi quota stewardship (free tier = 250 sold-comp lookups/month)
COMP_CACHE_TTL_MIN=1440      # 24h cache → re-scans cost 0 searches; only new listings spend quota
SERPAPI_MIN_RESERVE=10       # stop comping near the cap instead of erroring

# Pipeline
PIPELINE_CONCURRENCY=5       # parallel identify/comp; raise if your API limits allow

# Alerts (set at least one, else alerts are console-only)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
# or: ALERT_WEBHOOK_URL=...  (Slack / Discord)
```

Then configure a sweep in the dashboard (`npm run dashboard` → Watch tab) pointed
at **only the sources that work from your IP** and **categories that calibrated
profitably** — skip sources that 403/500 (they waste a scan) and categories that
ran break-even:

- **Sources:** `offerup,facebook,mercari` (drop craigslist/shopgoodwill unless a
  residential proxy covers them — see `SCRAPER_PROXY` / `SCRAPER_PROXY_SOURCES`)
- **Keywords:** your winners, e.g. `nintendo switch, pokemon, lego, funko pop, zelda`

Run `npm run doctor` to confirm sources + quota, then `npm run watch` (or
`npm run serve` to run the dashboard and scheduler in one process). Steady-state
SerpApi cost is just newly-listed items; if you outgrow 250/month, upgrade the
SerpApi plan rather than DIY-scraping eBay (its anti-bot blocks plain crawlers).

## Deploy on a VM (always-on, one process)

For a small VM (≈2 vCPU / 4 GB, e.g. an `e2-medium`) running alongside other
workloads:

```bash
# lean install — skips Playwright + Prisma (~150 MB, eBay + Craigslist only)
npm ci --omit=optional

# full install — adds browser sources (~480 MB on disk)
npm ci && npx playwright install chromium
```

Run the dashboard **and** the scheduler in a single process:

```bash
npm run serve     # = WATCH_IN_SERVER=true: UI on :3000 + scheduled watchlists
```

Keep it up across reboots with the included **systemd unit**
(`deploy/arbitrage-engine.service`) — it sets a `MemoryMax` cap so a browser
scrape can never starve a co-located trading stack:

```bash
sudo cp deploy/arbitrage-engine.service /etc/systemd/system/
sudo systemctl enable --now arbitrage-engine
journalctl -u arbitrage-engine -f      # live logs + alerts
```

The dashboard binds to `127.0.0.1`; reach it from your laptop over an SSH
tunnel: `gcloud compute ssh VM -- -L 3000:localhost:3000`.

**Footprint:** ~150 MB lean / ~480 MB full on disk; ~90 MB RAM idle, +~0.3–0.6 GB
transient during a single (serialized) browser scrape. Playwright upgrades can
leave stale Chromium builds — prune with `npm run clean:browsers`.

## Will scraping work here? Run the doctor

```bash
npm run doctor                 # checks keys, sessions, comps + does a live probe
npm run doctor offerup         # probe just one source
```

It reports, per source, whether a live scrape succeeds and — if not — *why*:
network/TLS, an anti-bot **block**, **login required**, or just **empty/changed
markup** (the connectors detect these and fail loudly instead of returning an
empty list silently).

**Reality check:** these sources actively block automation from **datacenter /
cloud IPs** (you'll see `403`/challenge pages). Scraping is far more reliable
from a **residential IP**. To scrape from a cloud VM, route through a
residential/mobile proxy:

```bash
SCRAPER_PROXY=http://user:pass@host:port   # routes all sources (browser + HTTP)
```

It applies to Playwright (Facebook/OfferUp/Mercari) and the Craigslist feed; the
eBay/OpenRouter API calls stay direct. Behind a TLS-intercepting proxy, also set
`SCRAPER_IGNORE_HTTPS_ERRORS=true`.

Some sources (OfferUp/Mercari) return *more* on a direct IP, while others
(Craigslist/Facebook) need the proxy. Scope it per source:
```bash
SCRAPER_PROXY_SOURCES=craigslist,facebook   # only these go through the proxy
```

## Saved feed, watchlists & alerts

Passing opportunities are persisted to a JSON store (`data/store.json`, gitignored;
override with `STORE_FILE`) and surface under the dashboard's **Saved** tab.

Create **watchlists** in the **Watch** tab (query + source + interval + the
current threshold sliders), then run the scheduler:

```bash
npm run watch    # ticks every minute, runs due watchlists, alerts on new finds
```

It re-reads the store each tick, so watchlists you add/pause/edit in the
dashboard take effect without a restart. For Postgres instead of the JSON store,
set `DATABASE_URL` and `npm run prisma:push` (schema in `prisma/`).

## Discovery sweeps (always hunting the next flip)

Watchlists are your fixed money-makers. **Sweeps** are the discovery loop: a
labelled list of broad keywords the watch runner rotates through round-robin
(a few per cycle, by `perTick`), so the engine constantly cross-references new
categories against eBay instead of only the items you named. Create them in the
dashboard's **Discover** tab (or load the 25-keyword starter pack), and the same
`npm run watch` / `npm run serve` process cycles them on their interval —
profitable finds auto-save + alert, deduped. Cost stays bounded: it runs
`perTick` keywords per interval and advances a cursor, cycling the whole list
over time rather than scanning everything at once.

**Push alerts** — the watch runner (and the dashboard's "run now") send new finds
to any configured channel; nothing configured = console only. Test from the
**Settings** tab. Env:

```bash
TELEGRAM_BOT_TOKEN=...   TELEGRAM_CHAT_ID=...   # Telegram
ALERT_WEBHOOK_URL=https://hooks.slack.com/...  # Slack / Discord / generic webhook
```

## LLM provider: Anthropic or OpenRouter

Identify + match run through a provider layer (`src/llm.ts`). Default is
Anthropic; set `LLM_PROVIDER=openrouter` to use OpenRouter instead — one key,
many models, and per-step routing:

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.5-flash-lite   # cheap + vision-capable default
IDENTIFY_MODEL=google/gemini-2.5-flash-lite      # vision step (reads photos)
MATCH_MODEL=deepseek/deepseek-chat               # text-only step — cheapest
```

Cost-effective picks (OpenRouter, ~mid-2026): identify needs a **vision** model —
`google/gemini-2.5-flash-lite` (~$0.10/$0.40 per M) is the cheapest capable one;
`openai/gpt-5-mini` (~$0.25/$2) or `google/gemini-2.5-flash` (~$0.30/$2.50) are
step-ups. The match step is **text-only**, so point `MATCH_MODEL` at the
cheapest text model (DeepSeek tiers are ~$0.10/M or free). The price pre-filter
+ verdict caching keep spend to fractions of a cent per comped listing.

No key for the active provider → identify/match fall back to offline heuristics.

## Profit accuracy

- **Condition-adjusted resale** — the match step's condition gap discounts the
  resale estimate (a "good" unit isn't priced like a "like-new" comp); never
  inflates when your item is the nicer one. Tune with `CONDITION_STEP_PCT`.
- **Outlier-trimmed comps** — comps outside 1.5×IQR are dropped before the
  median, so one mis-matched comp can't skew value.
- **Resale-confidence flags** — opportunities are flagged when comps are active
  asks (`browse`) or mock data, and when a condition discount was applied.

## eBay comps: sold vs. active

`EBAY_COMP_SOURCE` selects how items are valued (default `auto`):

| value | data | access |
|-------|------|--------|
| `insights` | real **sold** prices (Marketplace Insights) | gated — apply to eBay |
| `browse` | **active** asking prices (Browse API) | ungated — just app credentials |
| `mock` | deterministic offline comps | none |
| `auto` | insights → browse → mock fallback | — |

Set `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` and `EBAY_USE_MOCK_COMPS=false` to go
live. Browse asks are a rougher comp than solds, but free and ungated.

**Multiple comp markets:** `COMP_SOURCES=ebay,pricecharting` blends them so resale
triangulates across markets. PriceCharting (games/consoles/cards) needs
`PRICECHARTING_TOKEN`; Keepa (Amazon) needs `KEEPA_API_KEY`; both mock without.

**Category routing:** `COMP_SOURCES=auto` routes each item to the best
specialized market for its category — games/cards → PriceCharting, sneakers →
StockX — over a general baseline (**SerpApi** when `SERPAPI_KEY` is set, else the
eBay connector). A keyless/mock specialized market never replaces or pollutes
live comps. `COMP_ROUTING` controls how a covered item uses the baseline:

| value | behavior |
|-------|----------|
| `replace` (default) | use the specialized market **instead of** the baseline — spends 0 baseline searches on covered items (best on a SerpApi free tier) |
| `blend` | query the baseline **and** the specialized market for maximum comp breadth |

**Comp caching:** every comper is wrapped in a TTL cache keyed by the search
string, so duplicate lookups (same product across listings, or re-scans) don't
spend a repeat search — the main lever for staying under SerpApi's free cap.
Default 12h; set `COMP_CACHE_TTL_MIN` (0 disables). `npm run debug` shows the
gap between comp lookups and actual SerpApi searches.

**Scanning everywhere:** pass `--source=all` (CLI) or pick "all sources" in the
dashboard / watchlists / sweeps to hit Craigslist + Facebook + OfferUp + Mercari
in one query; you can also give a comma list like `craigslist,offerup,mercari`.

## Facebook Marketplace (scrape-with-safeguards)

Marketplace has no public API or feed, so this source drives a real browser:

```bash
npm i playwright && npx playwright install chromium   # optional dep
FACEBOOK_HEADFUL=true npm run fb:login                # sign in once; cookies persist
npm run run -- "nintendo switch" 200 --source=facebook
```

**Anti-detection** (`src/connectors/stealth.ts`): per-run desktop-Chrome
fingerprint (UA/viewport/locale/timezone), `navigator.webdriver` removal, plugin
& permissions patches, and human-paced scroll/mouse with randomized delays.

**Safeguards**: one tab at a time, throttled actions, capped scrolling, result
limit, early stop when results dry up. Scraping Marketplace **violates Meta's
ToS** and risks account/IP bans — keep volume to personal-research scale.

Config (env): `FACEBOOK_USER_DATA_DIR` (default `.fb-session`, gitignored),
`FACEBOOK_MARKETPLACE_LOCATION` (e.g. `nyc`, `sfbay`), `FACEBOOK_HEADFUL`.

**OfferUp** (`--source=offerup`) uses the same browser + stealth layer but needs
no login (public search). Best-effort selectors; same ToS caveat and safeguards.
Set `OFFERUP_HEADFUL=true` to watch it run.

**Apify-backed sources (no DIY scraping):** add buy sources by config — Apify's
maintained actors handle the proxies/anti-bot. Set `APIFY_TOKEN` and define
sources in `APIFY_SOURCES`:
```bash
APIFY_TOKEN=apify_api_xxx
APIFY_SOURCES=[{"name":"fb","actor":"apify/facebook-marketplace-scraper","queryField":"keyword","input":{"maxItems":25},"map":{"price":"price","url":"listingUrl","image":"image"}}]
```
Each becomes a selectable source (and joins `all` sweeps). `map` overrides the
actor's output field names; `queryField` is the actor input that takes the term.

**Craigslist photos** — RSS omits images. Set `CRAIGSLIST_ENRICH=true` to fetch
each listing page (throttled, capped) and fill real image URLs + missing prices,
so the vision-identify step has photos to work with.

## Wiring real data

1. **Anthropic** — set `ANTHROPIC_API_KEY` to enable identify + match steps.
2. **eBay** — create an app at developer.ebay.com, set `EBAY_CLIENT_ID` /
   `EBAY_CLIENT_SECRET`. Apply for **Marketplace Insights** access (gated) to get
   real SOLD comps, then set `EBAY_USE_MOCK_COMPS=false`.
3. **Persistence** — set `DATABASE_URL`, then `npm run prisma:push`.

## Adding sources

Implement `SourceConnector` (see `src/connectors/connector.ts`) and pass it to
`runPipeline`. The engine, matching, valuation, and scoring stay unchanged. This
is where additional source connectors — including provider-backed ones — plug in
later.

## Cost control

- Price pre-filter runs **before** any paid LLM step — cheap listings with no
  upside never reach identify/verify.
- Match verdicts are cached by `searchString::compId`.
- Identify runs once per listing (cache by listing id when you persist).

## Notes on responsible operation

- Use published feeds / official APIs where they exist (Craigslist RSS, eBay).
- Net margin, not gross gap, decides what's worth acting on.
- Validate in alert mode before automating purchases.
