import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * Poshmark Scraper (Apify actor).
 * availability=available -> buy listings; availability=sold -> resale comps.
 * Input:  { query, availability, maxItems, maxScrolls, maxPrice, proxyConfiguration }
 * Output: { id, title, price, currency, size, image, url, source }
 */

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
  query,
  availability = "available",
  maxItems = 24,
  maxScrolls = 10,
  maxPrice,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;
if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
const params = new URLSearchParams({ query, availability, sort_by: availability === "sold" ? "added_desc" : "best_match" });
const startUrl = `https://poshmark.com/search?${params.toString()}`;

const seen = new Map();
const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 240,
  launchContext: { launchOptions: { args: ["--disable-blink-features=AutomationControlled"] } },
  // Block images/media/fonts/CSS — listings render from JS/DOM regardless, and
  // this cuts residential-proxy bandwidth (the main per-run cost) and runtime.
  preNavigationHooks: [
    async ({ page }) => {
      await page.route("**/*", (route) => {
        const t = route.request().resourceType();
        return t === "image" || t === "media" || t === "font" || t === "stylesheet" ? route.abort() : route.continue();
      });
    },
  ],
  requestHandler: async ({ page }) => {
    await page.waitForTimeout(2500);
    for (let i = 0; i < maxScrolls && seen.size < maxItems; i++) {
      for (const c of await extractCards(page)) if (!seen.has(c.id)) seen.set(c.id, c);
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1200 + Math.random() * 1500);
    }
    const out = [...seen.values()].slice(0, maxItems).map(parseCard)
      .filter((l) => l.title && (!maxPrice || l.price === 0 || l.price <= maxPrice));
    log.info(`Scraped ${out.length} ${availability} Poshmark items for "${query}".`);
    await Actor.pushData(out);
  },
});
await crawler.run([startUrl]);
await Actor.exit();

async function extractCards(page) {
  return page.$$eval('a[href*="/listing/"]', (anchors) => {
    const priceRe = /\$\s?[\d,]+/;
    const seen = new Set();
    const out = [];
    for (const a of anchors) {
      const href = String(a.href).split("?")[0];
      const m = href.match(/\/listing\/[\w-]*-([a-f0-9]+)$/i) || href.match(/\/listing\/([\w-]+)$/i);
      if (!m || seen.has(m[1])) continue;
      // Climb to the nearest ancestor that actually holds a price — the card.
      // (Poshmark's price sits outside the anchor, so scanning the anchor alone
      // yielded $0.)
      let tile = a;
      for (let i = 0; i < 5 && tile; i++) {
        if (priceRe.test(tile.textContent || "")) break;
        tile = tile.parentElement;
      }
      tile = tile || a;
      const texts = Array.from(tile.querySelectorAll("span,div,p")).map((s) => (s.textContent ?? "").trim()).filter(Boolean);
      const img = tile.querySelector("img") || a.querySelector("img");
      seen.add(m[1]);
      out.push({
        id: m[1],
        url: href,
        texts: texts.length ? texts : [(a.textContent ?? "").trim()].filter(Boolean),
        src: img ? img.getAttribute("src") || undefined : undefined,
        alt: img ? img.getAttribute("alt") || undefined : undefined,
      });
    }
    return out;
  });
}

function parseCard(raw) {
  const texts = (raw.texts ?? []).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const priceText = texts.find((t) => /\$\s?[\d,]+/.test(t)) || "";
  const pm = priceText.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  const size = (texts.find((t) => /^size[:\s]/i.test(t)) || "").replace(/^size[:\s]*/i, "").trim() || undefined;
  const title = (raw.alt || texts.filter((t) => !/\$/.test(t) && t.length > 3).sort((a, b) => b.length - a.length)[0] || texts[0] || "(untitled)").slice(0, 140);
  return {
    id: `pm_${raw.id}`,
    title,
    price: pm ? Math.round(Number(pm[1].replace(/,/g, ""))) : 0,
    currency: "USD",
    size,
    image: raw.src,
    url: raw.url,
    source: "poshmark",
  };
}
