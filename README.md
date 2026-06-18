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

- **Web dashboard** — run scans, pick a source, tune thresholds, and browse
  scored opportunities (thumbnails, net profit, margin, flags). Zero-dep server.
- **Craigslist source connector** — uses Craigslist's built-in RSS feed. No
  login, no headless browser. The lowest-friction first source.
- **Facebook Marketplace source connector** — browser-driven (Playwright) with a
  persistent logged-in session and **anti-detection hardening** (see below).
  Optional dependency; the rest of the engine runs without it.
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
```

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
