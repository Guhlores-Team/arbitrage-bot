# Apify actors

Deployable Apify actors built from our scraping logic. Run them on your own
Apify account (Creator plan works — it allows running *your own* actors and
includes usage credit + Apify residential proxies), feed their output back into
the engine via the Apify source connector, and optionally **publish them to the
Apify Store to monetize** (rental or pay-per-result).

| Actor | Status | Role |
|-------|--------|------|
| `facebook-marketplace/` | ⚠️ blocked / needs work | BUY source |
| `ebay-sold/` | ⚠️ blocked / needs work | COMP source (real sold prices) |
| `offerup/` | ✅ working (verified) | BUY source |
| `mercari/` | ✅ working (verified) | BUY source |
| `craigslist/` | ⚠️ blocked / needs work | BUY source (residential proxy beats IP blocks) |
| `ebay/` | ⚠️ blocked / needs work | BUY source (active listings) |
| `stockx/` | ✅ working (verified) | COMP source (sneakers — turns StockX real) |
| `poshmark/` | ✅ working (verified) | BUY + COMP (fashion; sold=comps) |
| `depop/` | ⚠️ blocked / needs work | BUY source (fashion/vintage) |
| `nextdoor/` | ⚠️ blocked / needs work | BUY source (hyperlocal; needs cookies) |
| `auctions-hibid/` | ✅ working (verified) | BUY source (estate/liquidation lots) |

Status from `npm run doctor:actors`; blocked actors are anti-bot/cookie issues, not code bugs — see DESLOPPIFY.md M9. The health check assumes the actors are owned by the `Guhlore` Apify account — set `APIFY_ACTOR_OWNER=<your-apify-account>` if they live under a different account (e.g. a team).

> The fashion/sneaker/local/auction actors use **best-effort selectors** — they
> follow each site's current markup and may need a tweak in `extractCards()` after
> the first real run (this is normal for every scraper here). The architecture
> (parsing, failover, comp bridge) is the durable part.

## Wire a comp actor as a real market (e.g. StockX)

Turn a mock comp market into real data with your own actor — set `APIFY_COMPS`
(JSON array, one entry per market). A market that matches a built-in (like
`stockx`) then returns real data instead of mock:

```bash
APIFY_TOKEN=apify_api_...
APIFY_COMPS=[{"market":"stockx","actor":"<you>~stockx-scraper"},
             {"market":"poshmark","actor":"<you>~poshmark-scraper","input":{"availability":"sold"}}]
```

Then select it in Settings or `COMP_SOURCES` (e.g. `ebay-sold,stockx`). The
single eBay-sold slot (`APIFY_COMP_ACTOR`) still works on its own; `APIFY_COMPS`
is for wiring several at once.

## Redundancy: actor + in-process scraper, "won't fail"

Each buy marketplace has two paths — the free in-process scraper *and* its Apify
actor. Give the Apify source the **same name** as the built-in and the engine
composes them into a **failover**: the free scraper runs first, and only if it's
blocked / logged out / returns nothing does it fall back to the paid Apify actor
(so you don't pay unless you have to). Add `"primary": true` to flip the order —
run Apify first where in-process is unreliable on your host (OfferUp/Mercari time
out, Craigslist 403s from a datacenter VM).

```bash
APIFY_TOKEN=apify_api_...
APIFY_SOURCES=[
  {"name":"facebook","taskId":"<fb-task-id>"},
  {"name":"offerup","actor":"<you>~offerup-scraper","primary":true},
  {"name":"mercari","actor":"<you>~mercari-scraper","primary":true},
  {"name":"craigslist","actor":"<you>~craigslist-scraper","primary":true,"input":{"region":"sfbay"}}
]
```

The actors output `{id,title,price,url,image,location}`, so the field map is 1:1.

## Deploy one to your account

```bash
npm i -g apify-cli
apify login                       # paste your API token
cd actors/facebook-marketplace
apify push                        # builds + uploads to your account
```

Then in the Apify Console:
1. Open the actor → **Create task** → fill input (query, location, cookies, proxy) → **Save**.
2. Note the **Task ID** (API tab).

## Wire it back into the engine

In the engine's `.env`:
```bash
APIFY_TOKEN=apify_api_...
APIFY_SOURCES=[{"name":"facebook","taskId":"<your-task-id>","map":{"price":"price","url":"url","image":"image","title":"title","location":"location"}}]
```
The actor already outputs `{id,title,price,url,image,location}`, so the map is 1:1.
Run `npm run doctor facebook` to confirm.

## Wire the eBay-sold actor as a COMP source

This is the truest comp short of eBay's gated Marketplace Insights API — real
realized sale prices, no approval. Deploy it (`cd actors/ebay-sold && apify push`),
create a task, then in the engine's `.env`:

```bash
APIFY_TOKEN=apify_api_...
APIFY_COMP_ACTOR=<you>~ebay-sold-listings-scraper   # or APIFY_COMP_TASK=<task-id>
# optional: APIFY_COMP_MARKET=ebay-sold (default), APIFY_COMP_INPUT={"condition":"used"}
```

Then turn it on as a comp market — either set `COMP_SOURCES=ebay-sold` (or blend,
e.g. `ebay-sold,google`) in `.env`, or tick **ebay-sold** in the dashboard's
Settings tab. Its output (`{title,price,condition,soldAt,url}`) maps 1:1, so no
field map is needed. Run `npm run doctor` to confirm comps go live (basis `sold`).

Cost on your $500 credit: residential proxy ~$8/GB + a little compute per run —
roughly a cent or two per search; the credit lasts months of continuous hunting.

## Publish & monetize (optional)

1. In the Console, open the actor → **Publication** → set title, description,
   categories, and **pricing** (monthly rental or pay-per-result).
2. Submit for review. Once live, it appears in the Apify Store and earns when
   others run it.

A clean, well-documented actor (good README, sensible input schema, reliable
output) is what sells — the files here are structured for that.
