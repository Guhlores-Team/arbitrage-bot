import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * Depop Scraper (Apify actor).
 * Input:  { query, maxItems, maxScrolls, maxPrice, proxyConfiguration }
 * Output: { id, title, price, currency, image, url, source }
 */

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
  query,
  maxItems = 24,
  maxScrolls = 10,
  maxPrice,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;
if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
const startUrl = `https://www.depop.com/search/?q=${encodeURIComponent(query)}`;

const seen = new Map();
const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 240,
  launchContext: { launchOptions: { args: ["--disable-blink-features=AutomationControlled"] } },
  requestHandler: async ({ page }) => {
    await page.waitForTimeout(2500);
    for (let i = 0; i < maxScrolls && seen.size < maxItems; i++) {
      for (const c of await extractCards(page)) if (!seen.has(c.id)) seen.set(c.id, c);
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1200 + Math.random() * 1500);
    }
    const out = [...seen.values()].slice(0, maxItems).map(parseCard)
      .filter((l) => l.title && (!maxPrice || l.price === 0 || l.price <= maxPrice));
    log.info(`Scraped ${out.length} Depop items for "${query}".`);
    await Actor.pushData(out);
  },
});
await crawler.run([startUrl]);
await Actor.exit();

async function extractCards(page) {
  return page.$$eval('a[href*="/products/"]', (anchors) => {
    const out = [];
    for (const a of anchors) {
      const href = String(a.href).split("?")[0];
      const m = href.match(/\/products\/([\w-]+)\/?$/i);
      if (!m) continue;
      const texts = Array.from(a.querySelectorAll("p,span,div")).map((s) => (s.textContent ?? "").trim()).filter(Boolean);
      const img = a.querySelector("img");
      out.push({
        id: m[1],
        url: href,
        texts: texts.length ? texts : [(a.textContent ?? "").trim()].filter(Boolean),
        src: img ? img.getAttribute("src") || img.getAttribute("srcset")?.split(" ")[0] || undefined : undefined,
        alt: img ? img.getAttribute("alt") || undefined : undefined,
      });
    }
    return out;
  });
}

function parseCard(raw) {
  const texts = (raw.texts ?? []).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Depop shows discounted price too; take the lowest $ value on the tile.
  const prices = texts.flatMap((t) => [...t.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, ""))));
  const price = prices.length ? Math.round(Math.min(...prices)) : 0;
  const title = (raw.alt || texts.filter((t) => !/\$/.test(t) && t.length > 3).sort((a, b) => b.length - a.length)[0] || `depop ${raw.id}`).slice(0, 140);
  return { id: `dp_${raw.id}`, title, price, currency: "USD", image: raw.src, url: raw.url, source: "depop" };
}
