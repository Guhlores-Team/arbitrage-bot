import { Actor } from "apify";
import { CheerioCrawler, log } from "crawlee";

/**
 * Craigslist Scraper (Apify actor).
 *
 * Reads Craigslist's built-in RSS feed (append &format=rss to any search) behind
 * a residential proxy. RSS is a published format — no browser, no anti-bot fight
 * — and residential IPs sidestep the datacenter-IP 403s that break server-side
 * scraping. CheerioCrawler keeps it cheap (no Chromium).
 *
 * Input:  { query, region, category, maxItems, maxPrice, proxyConfiguration }
 * Output: { id, title, price, currency, description, url, postedAt, source }
 */

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  query,
  region = "sfbay",
  category = "sss",
  maxItems = 50,
  maxPrice,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;

if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

const params = new URLSearchParams({ query, format: "rss" });
if (maxPrice) params.set("max_price", String(maxPrice));
const startUrl = `https://${region}.craigslist.org/search/${category}?${params.toString()}`;

const crawler = new CheerioCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  // RSS is XML — let Cheerio parse these content types.
  additionalMimeTypes: ["application/rss+xml", "application/xml", "text/xml", "application/rdf+xml"],
  requestHandler: async ({ $ }) => {
    const out = [];
    $("item").each((_, el) => {
      const item = $(el);
      const title = item.find("title").first().text().trim();
      // RDF feeds carry the URL in rdf:about; plain RSS in <link>.
      const link = (item.attr("rdf:about") || item.find("link").first().text() || "").trim();
      if (!title || !link) return;
      const description = stripHtml(item.find("description").first().text());
      const date = item.find("dc\\:date, date").first().text().trim() || undefined;
      const price = priceFrom(title, description);
      if (maxPrice && price > maxPrice) return;
      out.push({
        id: idFromLink(link),
        title: title.slice(0, 160),
        price,
        currency: "USD",
        description,
        url: link,
        postedAt: date,
        source: "craigslist",
      });
    });

    const limited = out.slice(0, maxItems);
    log.info(`Scraped ${limited.length} listings for "${query}" in ${region}.`);
    await Actor.pushData(limited);
  },
});

await crawler.run([startUrl]);
await Actor.exit();

// ---------- helpers ----------

function idFromLink(link) {
  const m = link.match(/(\d+)\.html/);
  return m ? `cl_${m[1]}` : `cl_${Buffer.from(link).toString("base64url").slice(0, 16)}`;
}
function priceFrom(...texts) {
  for (const t of texts) {
    const m = String(t ?? "").match(/\$\s?([\d,]+)/);
    if (m) return Number(m[1].replace(/,/g, ""));
  }
  return 0;
}
function stripHtml(s) {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
