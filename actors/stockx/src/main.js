import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * StockX Scraper (Apify actor) — sneaker/streetwear comps.
 *
 * StockX is bot-protected, so this runs a real browser behind a residential
 * proxy. It prefers StockX's embedded __NEXT_DATA__ JSON (more stable than CSS
 * classes) and falls back to product tiles. Prices are the tile's market price
 * (lowest ask / last sale) — tight on StockX, so a sound comp.
 *
 * Best-effort: if StockX changes its markup, adjust extractFromTiles() — the
 * __NEXT_DATA__ path usually keeps working across redesigns.
 *
 * Input:  { query, maxItems, proxyConfiguration }
 * Output: { id, title, price, currency, condition, url, image, market }
 */

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const { query, maxItems = 20, proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } } = input;
if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
const startUrl = `https://stockx.com/search?s=${encodeURIComponent(query)}`;

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 70,
  requestHandlerTimeoutSecs: 180,
  launchContext: { launchOptions: { args: ["--disable-blink-features=AutomationControlled"] } },
  requestHandler: async ({ page }) => {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2500);

    let items = await extractFromNextData(page);
    if (!items.length) items = await extractFromTiles(page);

    const out = items
      .filter((i) => i.title && i.price > 0)
      .slice(0, maxItems)
      .map((i) => ({
        id: `sx_${i.id || Math.random().toString(36).slice(2)}`,
        title: String(i.title).slice(0, 160),
        price: Math.round(i.price),
        currency: "USD",
        condition: "new",
        url: i.url ? (i.url.startsWith("http") ? i.url : `https://stockx.com${i.url}`) : "https://stockx.com",
        image: i.image,
        market: "stockx",
      }));

    log.info(`Scraped ${out.length} StockX comps for "${query}".`);
    await Actor.pushData(out);
  },
});

await crawler.run([startUrl]);
await Actor.exit();

// ---------- helpers ----------

/** Prefer StockX's server-rendered JSON — survives CSS redesigns. */
async function extractFromNextData(page) {
  return page.evaluate(() => {
    const out = [];
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      // Product-like objects expose a title/name + a market/price field.
      const title = node.title || node.name || node.primaryTitle;
      const price =
        node?.market?.lowestAsk ?? node?.market?.lastSale ?? node?.lowestAsk ?? node?.lastSale ?? node?.price;
      const url = node.url || node.urlKey || node.slug;
      if (title && typeof price === "number" && price > 0 && url) {
        out.push({ id: node.id || node.uuid || url, title, price, url: typeof url === "string" && url.startsWith("/") ? url : `/${url}`, image: node.media?.imageUrl || node.imageUrl });
      }
      for (const k in node) visit(node[k]);
    };
    try {
      const tag = document.getElementById("__NEXT_DATA__");
      if (tag) visit(JSON.parse(tag.textContent || "{}"));
    } catch {}
    // de-dupe by url
    const seen = new Set();
    return out.filter((o) => (seen.has(o.url) ? false : (seen.add(o.url), true)));
  });
}

/** Fallback: scrape visible product tiles. */
async function extractFromTiles(page) {
  return page.$$eval('a[href^="/"]', (anchors) => {
    const out = [];
    for (const a of anchors) {
      const txt = (a.textContent || "").replace(/\s+/g, " ").trim();
      const pm = txt.match(/\$\s?([\d,]+)/);
      if (!pm) continue;
      const href = a.getAttribute("href") || "";
      if (!/^\/[a-z0-9-]+$/i.test(href)) continue; // product slugs only
      const img = a.querySelector("img");
      const title = (img && img.getAttribute("alt")) || txt.replace(/\$\s?[\d,]+.*/, "").trim();
      out.push({ id: href, title, price: Number(pm[1].replace(/,/g, "")), url: href, image: img ? img.getAttribute("src") || undefined : undefined });
    }
    const seen = new Set();
    return out.filter((o) => (seen.has(o.url) ? false : (seen.add(o.url), true)));
  });
}
