import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * HiBid Auction Scraper (Apify actor).
 * Estate / liquidation / storage-unit lots — often well under resale value.
 * Best-effort selectors anchored on /lot/ links; price is the current bid.
 *
 * Input:  { query, maxItems, maxScrolls, maxPrice, proxyConfiguration }
 * Output: { id, title, price, currency, image, url, source }
 */

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
  query,
  maxItems = 40,
  maxScrolls = 8,
  maxPrice,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;
if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
const startUrl = `https://hibid.com/lots?q=${encodeURIComponent(query)}`;

const seen = new Map();
const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 240,
  launchContext: { launchOptions: { args: ["--disable-blink-features=AutomationControlled"] } },
  requestHandler: async ({ page }) => {
    await page.waitForTimeout(3000);
    for (let i = 0; i < maxScrolls && seen.size < maxItems; i++) {
      for (const c of await extractCards(page)) if (!seen.has(c.id)) seen.set(c.id, c);
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1300 + Math.random() * 1500);
    }
    const out = [...seen.values()].slice(0, maxItems).map(parseCard)
      .filter((l) => l.title && (!maxPrice || l.price === 0 || l.price <= maxPrice));
    log.info(`Scraped ${out.length} HiBid lots for "${query}".`);
    await Actor.pushData(out);
  },
});
await crawler.run([startUrl]);
await Actor.exit();

async function extractCards(page) {
  return page.$$eval('a[href*="/lot/"]', (anchors) => {
    const out = [];
    for (const a of anchors) {
      const href = String(a.href).split("?")[0];
      const m = href.match(/\/lot\/(\d+)/);
      if (!m) continue;
      const card = a.closest("[class*='lot'], .card, li, article") || a;
      const texts = Array.from(card.querySelectorAll("span,div,p,h1,h2,h3")).map((s) => (s.textContent ?? "").trim()).filter(Boolean);
      const img = card.querySelector("img");
      out.push({
        id: m[1],
        url: href,
        texts: texts.length ? texts : [(a.textContent ?? "").trim()].filter(Boolean),
        src: img ? img.getAttribute("src") || img.getAttribute("data-src") || undefined : undefined,
        alt: img ? img.getAttribute("alt") || undefined : undefined,
      });
    }
    return out;
  });
}

function parseCard(raw) {
  const texts = (raw.texts ?? []).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Prefer a "current bid" figure; else the first $ amount on the card.
  const bidLine = texts.find((t) => /current bid|high bid|current price/i.test(t));
  const pm = (bidLine || texts.find((t) => /\$\s?[\d,]+/.test(t)) || "").match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  const title = (raw.alt || texts.filter((t) => !/\$|bid|lot #|qty/i.test(t) && t.length > 4).sort((a, b) => b.length - a.length)[0] || `lot ${raw.id}`).slice(0, 160);
  return {
    id: `hb_${raw.id}`,
    title,
    price: pm ? Math.round(Number(pm[1].replace(/,/g, ""))) : 0,
    currency: "USD",
    image: raw.src,
    url: raw.url,
    source: "hibid",
  };
}
