import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * eBay Sold Listings Scraper (Apify actor).
 *
 * Pulls eBay's SOLD / completed search results — the real realized prices that
 * make a resale comp trustworthy. No eBay API approval (Marketplace Insights is
 * gated); just the public sold-listings search behind a residential proxy.
 *
 * Input:  { query, maxItems, condition, maxPrice, proxyConfiguration }
 * Output: { id, title, price, currency, condition, soldAt, url, image, market }
 */

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  query,
  maxItems = 20,
  condition = "any",
  maxPrice,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;

if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

// LH_Sold=1 + LH_Complete=1 = sold & completed; _sop=13 = ended recently; _ipg = page size.
const params = new URLSearchParams({
  _nkw: query,
  LH_Sold: "1",
  LH_Complete: "1",
  _sop: "13",
  _ipg: "120",
});
if (condition === "new") params.set("LH_ItemCondition", "1000");
if (condition === "used") params.set("LH_ItemCondition", "3000");
const startUrl = `https://www.ebay.com/sch/i.html?${params.toString()}`;

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 180,
  launchContext: {
    launchOptions: { args: ["--disable-blink-features=AutomationControlled"] },
  },
  requestHandler: async ({ page }) => {
    await page.waitForLoadState("domcontentloaded");
    // Sold results render server-side; a short settle is enough.
    await page.waitForTimeout(1500);

    const raw = await extractItems(page);
    const out = raw
      .map(parseItem)
      .filter((c) => c.title && c.price > 0 && !/^shop on ebay$/i.test(c.title))
      .filter((c) => !maxPrice || c.price <= maxPrice)
      .slice(0, maxItems);

    log.info(`Scraped ${out.length} sold comps for "${query}".`);
    await Actor.pushData(out);
  },
});

await crawler.run([startUrl]);
await Actor.exit();

// ---------- helpers ----------

/** Pull raw fields from each sold result card (runs in the browser). */
async function extractItems(page) {
  return page.$$eval("li.s-item, .s-item", (cards) => {
    const text = (el, sel) => {
      const n = el.querySelector(sel);
      return n ? (n.textContent ?? "").trim() : "";
    };
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
        sold: text(el, ".s-item__caption--signal, .s-item__caption, .POSITIVE"),
        image: img ? img.getAttribute("src") || img.getAttribute("data-src") || undefined : undefined,
      });
    }
    return out;
  });
}

/** Normalize a raw card into the comp shape the engine consumes. */
function parseItem(raw) {
  const title = (raw.title ?? "").replace(/^new listing/i, "").replace(/\s+/g, " ").trim();
  return {
    id: `ebs_${raw.id || Math.random().toString(36).slice(2)}`,
    title: title.slice(0, 160),
    price: parsePrice(raw.price),
    currency: "USD",
    condition: normalizeCondition(raw.condition),
    soldAt: parseSoldDate(raw.sold),
    url: raw.url || "https://www.ebay.com",
    image: raw.image,
    market: "ebay-sold",
  };
}

/** First dollar amount in the text ("$123.45", "$100.00 to $200.00" -> 100). */
function parsePrice(t) {
  const m = String(t ?? "").match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  return m ? Math.round(Number(m[1].replace(/,/g, ""))) : 0;
}

function normalizeCondition(t) {
  const s = String(t ?? "").toLowerCase();
  if (/\bnew\b|sealed|brand new/.test(s)) return "new";
  if (/open box|like new/.test(s)) return "like_new";
  if (/parts|not working/.test(s)) return "for_parts";
  if (/pre-?owned|used/.test(s)) return "good";
  return "unknown";
}

/** "Sold Mar 5, 2026" -> ISO date (best effort). */
function parseSoldDate(t) {
  const m = String(t ?? "").match(/Sold\s+(.+)/i);
  if (!m) return undefined;
  const d = new Date(m[1].trim());
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
