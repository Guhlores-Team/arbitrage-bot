import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * Nextdoor "For Sale & Free" Scraper (Apify actor).
 * Needs login cookies (Nextdoor is auth-walled). Best-effort selectors anchored
 * on for-sale item links; tune extractCards() if the markup shifts.
 *
 * Input:  { query, maxItems, maxScrolls, maxPrice, cookies, proxyConfiguration }
 * Output: { id, title, price, currency, image, url, source }
 */

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
  query,
  maxItems = 24,
  maxScrolls = 12,
  maxPrice,
  cookies,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;
if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
const startUrl = `https://nextdoor.com/for_sale_and_free/?query=${encodeURIComponent(query)}`;

const seen = new Map();
const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 240,
  launchContext: { launchOptions: { args: ["--disable-blink-features=AutomationControlled"] } },
  preNavigationHooks: [
    async ({ page }) => {
      if (Array.isArray(cookies) && cookies.length) {
        try { await page.context().addCookies(normalizeCookies(cookies)); }
        catch (e) { log.warning(`Could not add cookies: ${e.message}`); }
      }
    },
  ],
  requestHandler: async ({ page }) => {
    await page.waitForTimeout(2500);
    if (/\/login|\/register/.test(page.url())) {
      log.warning("Redirected to login — cookies missing/expired. Provide fresh Nextdoor cookies.");
    }
    for (let i = 0; i < maxScrolls && seen.size < maxItems; i++) {
      for (const c of await extractCards(page)) if (!seen.has(c.id)) seen.set(c.id, c);
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1300 + Math.random() * 1500);
    }
    const out = [...seen.values()].slice(0, maxItems).map(parseCard)
      .filter((l) => l.title && (!maxPrice || l.price === 0 || l.price <= maxPrice));
    log.info(`Scraped ${out.length} Nextdoor items for "${query}".`);
    await Actor.pushData(out);
  },
});
await crawler.run([startUrl]);
await Actor.exit();

async function extractCards(page) {
  return page.$$eval('a[href*="/for_sale_and_free/"], a[href*="/p/"]', (anchors) => {
    const out = [];
    for (const a of anchors) {
      const href = String(a.href).split("?")[0];
      const m = href.match(/\/(?:for_sale_and_free|p)\/(?:[\w-]*?)(\d{5,})\/?$/) || href.match(/\/([\w-]{6,})\/?$/);
      if (!m) continue;
      const texts = Array.from(a.querySelectorAll("span,div,p")).map((s) => (s.textContent ?? "").trim()).filter(Boolean);
      const img = a.querySelector("img");
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
  const isFree = texts.some((t) => /^free\b/i.test(t));
  const pm = texts.map((t) => t.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/)).find(Boolean);
  const price = isFree ? 0 : pm ? Math.round(Number(pm[1].replace(/,/g, ""))) : 0;
  const title = (raw.alt || texts.filter((t) => !/\$|^free$/i.test(t) && t.length > 3).sort((a, b) => b.length - a.length)[0] || `nextdoor ${raw.id}`).slice(0, 140);
  return { id: `nd_${raw.id}`, title, price, currency: "USD", image: raw.src, url: raw.url, source: "nextdoor" };
}

function normalizeCookies(raw) {
  const mapSameSite = (v) => { const s = String(v ?? "").toLowerCase(); if (s === "strict") return "Strict"; if (s === "no_restriction" || s === "none") return "None"; return "Lax"; };
  const out = [];
  for (const c of raw) {
    if (!c?.name || c.value == null || !c.domain) continue;
    const sameSite = mapSameSite(c.sameSite);
    out.push({
      name: String(c.name), value: String(c.value), domain: String(c.domain), path: c.path ? String(c.path) : "/",
      expires: typeof c.expirationDate === "number" ? Math.round(c.expirationDate) : typeof c.expires === "number" ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly), secure: sameSite === "None" ? true : Boolean(c.secure), sameSite,
    });
  }
  return out;
}
