# Facebook Marketplace Scraper

Scrape Facebook Marketplace search results — **title, price, location, image, and
listing URL** — using your own login cookies and a residential proxy.

## Input

| Field | Type | Notes |
|-------|------|-------|
| `query` | string (required) | What to search for, e.g. `nintendo switch` |
| `location` | string | Marketplace location slug (`nyc`, `la`, `sfbay`) |
| `maxItems` | integer | Stop after N listings (default 20) |
| `maxScrolls` | integer | Scroll-cycle cap (cost vs. depth) |
| `maxPrice` | integer | Drop listings above this price |
| `cookies` | array | Your Facebook cookies as JSON (export with **Cookie-Editor**). Required — Marketplace needs an authenticated session. |
| `proxyConfiguration` | object | Apify residential proxy recommended |

## Output (dataset)

```json
{ "id": "fb_123", "title": "Nintendo Switch OLED", "price": 250, "currency": "USD",
  "location": "Brooklyn, NY", "image": "https://...", "url": "https://www.facebook.com/marketplace/item/123/", "source": "facebook" }
```

## Getting your cookies

1. Install the **Cookie-Editor** browser extension.
2. Log into facebook.com, open Cookie-Editor → **Export → JSON**.
3. Paste the JSON array into the `cookies` input field.

Cookies expire periodically; re-export when results stop returning.

## Notes

- Scraping Facebook is against Meta's Terms of Service. Use responsibly, at
  personal-research scale, with a real logged-in account.
- Selectors track Marketplace's markup and may need updates when Facebook
  changes its DOM.
