import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * eBay Scraper (Apify actor) — active listings.
 * Input:  { query, maxItems, sort, condition, maxPrice, proxyConfiguration }
 * Output: { id, title, price, currency, condition, url, image, source }
 */

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
  query,
  maxItems = 40,
  sort = "price_asc",
  condition = "any",
  maxPrice,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;
if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
const sop = { best_match: "12", price_asc: "15", newly_listed: "10" }[sort] ?? "12";
const params = new URLSearchParams({ _nkw: query, _sop: sop, _ipg: "120" });
if (condition === "new") params.set("LH_ItemCondition", "1000");
if (condition === "used") params.set("LH_ItemCondition", "3000");
const startUrl = `https://www.ebay.com/sch/i.html?${params.toString()}`;

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 180,
  launchContext: { launchOptions: { args: ["--disable-blink-features=AutomationControlled"] } },
  requestHandler: async ({ page }) => {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    const raw = await extractItems(page);
    const out = raw
      .map(parseItem)
      .filter((l) => l.title && l.price > 0 && !/^shop on ebay$/i.test(l.title))
      .filter((l) => !maxPrice || l.price <= maxPrice)
      .slice(0, maxItems);
    log.info(`Scraped ${out.length} listings for "${query}".`);
    await Actor.pushData(out);
  },
});

await crawler.run([startUrl]);
await Actor.exit();

async function extractItems(page) {
  return page.$$eval("li.s-item, .s-item", (cards) => {
    const text = (el, sel) => { const n = el.querySelector(sel); return n ? (n.textContent ?? "").trim() : ""; };
    const out = [];
    for (const el of cards) {
      const link = el.querySelector("a.s-item__link, a[href*='/itm/']");
      const href = link ? String(link.href).split("?")[0] : "";
      const m = href.match(/\/itm\/(\d+)/);
      const img = el.querySelector(".s-item__image-wrapper img, .s-item__image img, img");
      out.push({
        id: m ? m[1] : "",
        url: href,
        title: text(el, ".s-item__title"),
        price: text(el, ".s-item__price"),
        condition: text(el, ".s-item__subtitle, .SECONDARY_INFO"),
        image: img ? img.getAttribute("src") || img.getAttribute("data-src") || undefined : undefined,
      });
    }
    return out;
  });
}

function parseItem(raw) {
  const title = (raw.title ?? "").replace(/^new listing/i, "").replace(/\s+/g, " ").trim();
  const m = String(raw.price ?? "").match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  return {
    id: `eb_${raw.id || Math.random().toString(36).slice(2)}`,
    title: title.slice(0, 160),
    price: m ? Math.round(Number(m[1].replace(/,/g, ""))) : 0,
    currency: "USD",
    condition: normalizeCondition(raw.condition),
    url: raw.url || "https://www.ebay.com",
    image: raw.image,
    source: "ebay",
  };
}
function normalizeCondition(t) {
  const s = String(t ?? "").toLowerCase();
  if (/\bnew\b|sealed|brand new/.test(s)) return "new";
  if (/open box|like new/.test(s)) return "like_new";
  if (/parts|not working/.test(s)) return "for_parts";
  if (/pre-?owned|used/.test(s)) return "good";
  return "unknown";
}
