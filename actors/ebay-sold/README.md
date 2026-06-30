# eBay Sold Listings Scraper

Get **real, realized eBay sale prices** — the only comp that actually tells you
what something sells for. eBay's own sold-price data (Marketplace Insights API)
is gated behind a hard approval; this actor reads the public **Sold / Completed**
search results instead, behind a residential proxy, so you get sold comps with no
API approval.

## What it returns

Each sold listing as a dataset item:

```json
{
  "id": "ebs_123456789012",
  "title": "Nintendo Switch OLED Console White",
  "price": 245,
  "currency": "USD",
  "condition": "good",
  "soldAt": "2026-03-05T00:00:00.000Z",
  "url": "https://www.ebay.com/itm/123456789012",
  "image": "https://i.ebayimg.com/...",
  "market": "ebay-sold"
}
```

## Input

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `query` | string | — | **required** — what to search sold listings for |
| `maxItems` | integer | 20 | stop after this many comps |
| `condition` | `any`/`new`/`used` | `any` | restrict by condition |
| `maxPrice` | integer | — | drop comps above this price |
| `proxyConfiguration` | object | Apify residential | recommended so eBay doesn't throttle |

## Use cases

- **Resale arbitrage** — price what you find on Marketplace/OfferUp against real eBay solds.
- **Pricing your own listings** — median sold price + days-to-sell signal.
- **Market research** — track realized prices over time for a category.

## Tips

- Use **residential proxy** — datacenter IPs get throttled by eBay search.
- `maxItems` controls cost: each run is one page load; 20–60 comps is plenty for a median.
- Pair with the [Arbitrage Engine](https://github.com/guhlores-team/arbitrage-bot) as its comp source (see repo `actors/README.md`).
