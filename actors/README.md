# Apify actors

Deployable Apify actors built from our scraping logic. Run them on your own
Apify account (Creator plan works — it allows running *your own* actors and
includes usage credit + Apify residential proxies), feed their output back into
the engine via the Apify source connector, and optionally **publish them to the
Apify Store to monetize** (rental or pay-per-result).

| Actor | Status |
|-------|--------|
| `facebook-marketplace/` | ✅ ready to deploy |
| `offerup/` | planned |
| `mercari/` | planned |

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

## Publish & monetize (optional)

1. In the Console, open the actor → **Publication** → set title, description,
   categories, and **pricing** (monthly rental or pay-per-result).
2. Submit for review. Once live, it appears in the Apify Store and earns when
   others run it.

A clean, well-documented actor (good README, sensible input schema, reliable
output) is what sells — the files here are structured for that.
