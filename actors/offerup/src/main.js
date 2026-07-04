import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * OfferUp Scraper (Apify actor).
 * Input:  { query, maxItems, maxScrolls, maxPrice, proxyConfiguration }
 * Output: { id, title, price, currency, location, image, url, source }
 */

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  query,
  maxItems = 20,
  maxScrolls = 12,
  maxPrice,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;

if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

const params = new URLSearchParams({ q: query });
if (maxPrice) params.set("price_max", String(maxPrice));
const startUrl = `https://offerup.com/search?${params.toString()}`;

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
      for (const card of await extractCards(page)) {
        if (!seen.has(card.id)) seen.set(card.id, card);
      }
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1200 + Math.random() * 1800);
    }

    const out = [...seen.values()]
      .slice(0, maxItems)
      .map(parseCard)
      .filter((l) => l.title && (!maxPrice || l.price === 0 || l.price <= maxPrice));

    if (out.length === 0) {
      // Diagnose 0-result: is it a bot-challenge/redirect, or did the card markup
      // change? Report the page identity + how many candidate anchors exist.
      const diag = await page.evaluate(() => ({
        detail: document.querySelectorAll('a[href*="/item/detail/"]').length,
        item: document.querySelectorAll('a[href*="/item/"]').length,
        anchors: document.querySelectorAll("a").length,
        bodyLen: document.body ? document.body.innerText.length : 0,
      }));
      log.warning(`0 listings — title="${await page.title()}" url="${page.url()}" ${JSON.stringify(diag)}`);
    }
    log.info(`Scraped ${out.length} listings for "${query}".`);
    await Actor.pushData(out);
  },
});

await crawler.run([startUrl]);
await Actor.exit();

// ---------- helpers ----------

async function extractCards(page) {
  return page.$$eval('a[href*="/item/detail/"]', (anchors) => {
    const out = [];
    for (const a of anchors) {
      const href = String(a.href).split("?")[0];
      const m = href.match(/\/item\/detail\/([\w-]+)/);
      if (!m) continue;
      const spans = Array.from(a.querySelectorAll("span")).map((s) => (s.textContent ?? "").trim()).filter(Boolean);
      const img = a.querySelector("img");
      out.push({
        id: m[1],
        url: href,
        texts: spans.length ? spans : [(a.textContent ?? "").trim()].filter(Boolean),
        src: img ? img.getAttribute("src") || undefined : undefined,
        srcset: img ? img.getAttribute("srcset") || undefined : undefined,
        ariaLabel: a.getAttribute("aria-label") || undefined,
        imgAlt: img ? img.getAttribute("alt") || undefined : undefined,
      });
    }
    return out;
  });
}

/** Structured fields from a raw card (mirrors the engine's parse.ts). */
function parseCard(raw) {
  const texts = (raw.texts ?? []).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const LEADING_PRICE = /^\s*(free|\$\s?[\d,]+(?:\.\d{1,2})?)\s+/i;
  const parsePrice = (t) => {
    if (/^free\b/i.test(t.trim())) return 0;
    const m = String(t).match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
    return m ? Math.round(Number(m[1].replace(/,/g, ""))) : 0;
  };
  const looksLikeLocation = (t) => !!t && t.length <= 40 && /,\s*[A-Z][a-zA-Z]/.test(t);

  let price = 0;
  for (const t of [...texts, raw.ariaLabel ?? ""]) {
    if (/\$|^free\b/i.test(t)) {
      price = parsePrice(t.match(LEADING_PRICE)?.[1] ?? t);
      if (price > 0 || /^free\b/i.test(t.trim())) break;
    }
  }

  const titleFromAria = (aria) =>
    aria ? aria.replace(/\s+/g, " ").trim().split(/,?\s+(?=\$|free\b)/i)[0].replace(/[,\s]+$/, "").trim() || undefined : undefined;
  const titleFromImgAlt = (alt) => (alt ? alt.replace(/\s+in\s+[A-Za-z .'\-]+,\s*[A-Z]{2}\s*$/, "").trim() || undefined : undefined);
  const locationFromAria = (aria) => {
    const t = aria?.replace(/\s+/g, " ");
    const ou = t?.match(/\bin\s+([A-Za-z .'\-]+,\s*[A-Z]{2})\b/);
    return ou ? ou[1].trim() : undefined;
  };
  const pickImage = (src, srcset) => {
    if (srcset) {
      const best = srcset.split(",").map((p) => { const [u, w] = p.trim().split(/\s+/); return { u, w: w ? parseInt(w) : 0 }; })
        .filter((x) => x.u).sort((a, b) => b.w - a.w)[0];
      if (best?.u) return best.u;
    }
    return src || undefined;
  };

  const cleanSpans = texts.filter((t) => !t.includes("$") && !looksLikeLocation(t));
  const blob = texts.find((t) => LEADING_PRICE.test(t));
  const title = (titleFromAria(raw.ariaLabel) || titleFromImgAlt(raw.imgAlt) ||
    cleanSpans.sort((a, b) => b.length - a.length)[0] || (blob ? blob.replace(LEADING_PRICE, "").trim() : "") ||
    texts[0] || "(untitled)").slice(0, 140);
  const location = locationFromAria(raw.ariaLabel) || texts.find(looksLikeLocation);

  return { id: `ou_${raw.id}`, title, price, currency: "USD", location, image: pickImage(raw.src, raw.srcset), url: raw.url, source: "offerup" };
}
