import { Actor } from "apify";
import { PlaywrightCrawler, log } from "crawlee";

/**
 * Facebook Marketplace Scraper (Apify actor).
 * Input: { query, location, maxItems, maxScrolls, maxPrice, cookies, proxyConfiguration }
 * Output (dataset): { id, title, price, currency, location, image, url, source }
 */

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  query,
  location = "nyc",
  maxItems = 20,
  maxScrolls = 12,
  maxPrice,
  cookies,
  proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
} = input;

if (!query) throw new Error('Input "query" is required.');

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);

const params = new URLSearchParams({ query, sortBy: "creation_time_descend" });
if (maxPrice) params.set("maxPrice", String(maxPrice));
const startUrl = `https://www.facebook.com/marketplace/${location}/search?${params.toString()}`;

const seen = new Map();

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  maxRequestsPerCrawl: 1,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 240,
  launchContext: {
    launchOptions: {
      args: ["--disable-blink-features=AutomationControlled", "--disable-features=IsolateOrigins,site-per-process"],
    },
  },
  preNavigationHooks: [
    async ({ page }) => {
      if (Array.isArray(cookies) && cookies.length) {
        try {
          await page.context().addCookies(normalizeCookies(cookies));
        } catch (e) {
          log.warning(`Could not add cookies: ${e.message}`);
        }
      }
    },
  ],
  requestHandler: async ({ page }) => {
    await page.waitForTimeout(2500);
    if (/\/login|\/checkpoint/.test(page.url())) {
      log.warning("Redirected to login — cookies missing/expired. Provide fresh Facebook cookies.");
    }
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

    log.info(`Scraped ${out.length} listings for "${query}".`);
    await Actor.pushData(out);
  },
});

await crawler.run([startUrl]);
await Actor.exit();

// ---------- helpers ----------

/** Pull raw card data from the page (runs in browser). */
async function extractCards(page) {
  return page.$$eval('a[href*="/marketplace/item/"]', (anchors) => {
    const out = [];
    for (const a of anchors) {
      const href = String(a.href).split("?")[0];
      const m = href.match(/\/marketplace\/item\/(\d+)/);
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

  const titleFromAria = (aria) => {
    if (!aria) return undefined;
    return aria.replace(/\s+/g, " ").trim().split(/,?\s+(?=\$|free\b)/i)[0].replace(/[,\s]+$/, "").trim() || undefined;
  };
  const titleFromImgAlt = (alt) => (alt ? alt.replace(/\s+in\s+[A-Za-z .'\-]+,\s*[A-Z]{2}\s*$/, "").trim() || undefined : undefined);
  const locationFromAria = (aria) => {
    const t = aria?.replace(/\s+/g, " ");
    const fb = t?.match(/,\s*([A-Za-z .'\-]+,\s*[A-Z]{2}),\s*listing\b/i);
    if (fb) return fb[1].trim();
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

  return { id: `fb_${raw.id}`, title, price, currency: "USD", location, image: pickImage(raw.src, raw.srcset), url: raw.url, source: "facebook" };
}

/** Cookie-Editor / Playwright cookie array → Playwright addCookies shape. */
function normalizeCookies(raw) {
  const mapSameSite = (v) => {
    const s = String(v ?? "").toLowerCase();
    if (s === "strict") return "Strict";
    if (s === "no_restriction" || s === "none") return "None";
    return "Lax";
  };
  const out = [];
  for (const c of raw) {
    if (!c?.name || c.value == null || !c.domain) continue;
    const sameSite = mapSameSite(c.sameSite);
    out.push({
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain),
      path: c.path ? String(c.path) : "/",
      expires: typeof c.expirationDate === "number" ? Math.round(c.expirationDate) : typeof c.expires === "number" ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: sameSite === "None" ? true : Boolean(c.secure),
      sameSite,
    });
  }
  return out;
}
