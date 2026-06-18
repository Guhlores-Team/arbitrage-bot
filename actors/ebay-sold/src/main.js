import { Actor } from "apify";
import { CheerioCrawler, log } from "crawlee";

/**
 * eBay Sold Listings Scraper (Apify actor).
 *
 * Pulls eBay's SOLD / completed search results — the real realized prices that
 * make a resale comp trustworthy. eBay search pages are server-rendered HTML, so
 * we fetch over plain HTTP with browser-like headers (CheerioCrawler) behind a
 * US residential proxy. No browser to launch means it's cheap and fast, and a
 * plain request often sidesteps the headless-Chromium bot challenge.
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
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" },
} = input;

if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

// LH_Sold=1 + LH_Complete=1 = sold & completed; _sop=13 = ended recently; _ipg = page size.
const params = new URLSearchParams({ _nkw: query, LH_Sold: "1", LH_Complete: "1", _sop: "13", _ipg: "60" });
if (condition === "new") params.set("LH_ItemCondition", "1000");
if (condition === "used") params.set("LH_ItemCondition", "3000");
const startUrl = `https://www.ebay.com/sch/i.html?${params.toString()}`;

const crawler = new CheerioCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: 60,
  requestHandler: async ({ $, body }) => {
    const out = extractItems($)
      .map(parseItem)
      .filter((c) => c.title && c.price > 0 && !/^shop on ebay$/i.test(c.title))
      .filter((c) => !maxPrice || c.price <= maxPrice)
      .slice(0, maxItems);

    if (!out.length) {
      log.warning(`0 sold comps — page title "${$("title").text().trim()}" (len=${(body || "").length}; challenge?).`);
    }
    log.info(`Scraped ${out.length} sold comps for "${query}".`);
    await Actor.pushData(out);
  },
});

// Let got-scraping generate a full, consistent browser fingerprint (UA +
// sec-ch-ua + TLS); partial manual headers tripped eBay's 403. Retries rotate
// to fresh residential IPs, since eBay blocks are often per-IP.
await crawler.run([startUrl]);
await Actor.exit();

// ---------- helpers ----------

/**
 * Pull raw fields per sold card. Prefer eBay's .s-item markup; if that class
 * isn't present (markup rotation), fall back to keying off /itm/ links and
 * climbing to the nearest price-bearing ancestor.
 */
function extractItems($) {
  const out = [];
  const cards = $("li.s-item, .s-item");
  if (cards.length) {
    cards.each((_, el) => {
      const card = $(el);
      const link = card.find("a.s-item__link, a[href*='/itm/']").first();
      const href = String(link.attr("href") || "").split("?")[0];
      const m = href.match(/\/itm\/(\d+)/);
      const img = card.find("img").first();
      out.push({
        id: m ? m[1] : "",
        url: href,
        title: card.find(".s-item__title").first().text().trim(),
        price: card.find(".s-item__price").first().text().trim(),
        condition: card.find(".SECONDARY_INFO, .s-item__subtitle").first().text().trim(),
        sold: card.find(".s-item__caption--signal, .s-item__caption, .POSITIVE").first().text().trim(),
        image: img.attr("src") || img.attr("data-src"),
      });
    });
    return out;
  }

  const priceRe = /\$\s?[\d,]+(?:\.\d{1,2})?/;
  const seen = new Set();
  $("a[href*='/itm/']").each((_, a) => {
    const link = $(a);
    const href = String(link.attr("href") || "").split("?")[0];
    const m = href.match(/\/itm\/(\d+)/);
    const id = m ? m[1] : href;
    if (seen.has(id)) return;
    let card = link;
    for (let i = 0; i < 6; i++) {
      if (priceRe.test(card.text())) break;
      const p = card.parent();
      if (!p.length) break;
      card = p;
    }
    const cardText = card.text();
    const priceM = cardText.match(priceRe);
    const soldM = cardText.match(/Sold\s+[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}/);
    seen.add(id);
    out.push({
      id: m ? m[1] : "",
      url: href,
      title: link.text().trim() || card.find("img").first().attr("alt") || "",
      price: priceM ? priceM[0] : "",
      condition: card.find(".SECONDARY_INFO, .s-item__subtitle").first().text().trim(),
      sold: soldM ? soldM[0] : "",
      image: card.find("img").first().attr("src"),
    });
  });
  return out;
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
