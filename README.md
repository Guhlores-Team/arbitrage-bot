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
- **Facebook Marketplace + OfferUp source connectors** — browser-driven
  (Playwright) with **anti-detection hardening** (see below). Facebook uses a
  persistent logged-in session; OfferUp browses public results. Optional
  dependency; the rest of the engine runs without it.
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
npm test                                              # node:test suite
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

**Push alerts** — the watch runner (and the dashboard's "run now") send new finds
to any configured channel; nothing configured = console only. Test from the
**Settings** tab. Env:

```bash
TELEGRAM_BOT_TOKEN=...   TELEGRAM_CHAT_ID=...   # Telegram
ALERT_WEBHOOK_URL=https://hooks.slack.com/...  # Slack / Discord / generic webhook
```

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
