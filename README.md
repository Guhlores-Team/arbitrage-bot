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

- **Craigslist source connector** — uses Craigslist's built-in RSS feed. No
  login, no headless browser. The lowest-friction first source.
- **eBay comp connector** — real OAuth + Marketplace Insights request shape,
  with a mock-comps fallback so the pipeline runs before you're approved for
  sold-data access.
- **Vision + text identification** — Claude reads the listing photos to identify
  the product when the title is useless ("box of tools $40").
- **Retrieve-then-rerank matching** — canonical-code fast path, LLM verification
  for the rest, with verdict caching.
- **Honest margin math** — eBay final value fee + shipping + returns reserve.
- **Opportunity scoring** with tunable thresholds.

## Quick start

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY; eBay stays in mock mode
npm run run -- "nintendo switch" 150
```

Runs end to end on mock comps so you can see the output shape immediately.

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
