import { Actor } from "apify";
import { CheerioCrawler, log } from "crawlee";

/**
 * eBay Scraper (Apify actor) — active listings.
 *
 * eBay search pages are server-rendered HTML, so we fetch over plain HTTP with
 * browser-like headers (CheerioCrawler) behind a US residential proxy — cheap,
 * fast, and usually sidesteps the headless-Chromium bot challenge.
 *
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
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" },
} = input;
if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
const sop = { best_match: "12", price_asc: "15", newly_listed: "10" }[sort] ?? "12";
const params = new URLSearchParams({ _nkw: query, _sop: sop, _ipg: "60" });
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
      .filter((l) => l.title && l.price > 0 && !/^shop on ebay$/i.test(l.title))
      .filter((l) => !maxPrice || l.price <= maxPrice)
      .slice(0, maxItems);
    if (!out.length) {
      log.warning(`0 listings — page title "${$("title").text().trim()}" (len=${(body || "").length}; challenge?).`);
    }
    log.info(`Scraped ${out.length} listings for "${query}".`);
    await Actor.pushData(out);
  },
});

await crawler.run([
  {
    url: startUrl,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.ebay.com/",
    },
  },
]);
await Actor.exit();

// ---------- helpers ----------

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
    const priceM = card.text().match(priceRe);
    seen.add(id);
    out.push({
      id: m ? m[1] : "",
      url: href,
      title: link.text().trim() || card.find("img").first().attr("alt") || "",
      price: priceM ? priceM[0] : "",
      condition: card.find(".SECONDARY_INFO, .s-item__subtitle").first().text().trim(),
      image: card.find("img").first().attr("src"),
    });
  });
  return out;
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
