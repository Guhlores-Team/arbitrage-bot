import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";
import { pickFingerprint, contextOptions, STEALTH_INIT_SCRIPT, humanScroll, humanPause } from "./stealth.js";

/**
 * OfferUp source connector — the realistic "local app" second source.
 *
 * Like Facebook, OfferUp is a client-rendered SPA with no public feed, so this
 * drives a browser (Playwright) with the anti-detection hardening in
 * ./stealth.ts. Unlike Facebook it doesn't require login to browse public
 * search results, so there's no persistent-session step — but it still has
 * anti-bot, so the same safeguards apply: one tab, throttled, capped scrolling,
 * result limit. Scraping is against OfferUp's ToS; keep volume personal-scale.
 *
 * Status: best-effort. OfferUp's markup is obfuscated and changes; selectors are
 * anchored on the stable `/item/detail/` link pattern and adjusted as needed.
 * Playwright is an optional dependency, dynamically imported.
 */

export interface OfferUpSafeguards {
  headful: boolean;
  delayMs: [number, number];
  maxScrolls: number;
  navTimeoutMs: number;
}

const DEFAULTS: OfferUpSafeguards = {
  headful: (process.env.OFFERUP_HEADFUL ?? "false") === "true",
  delayMs: [1500, 3500],
  maxScrolls: 10,
  navTimeoutMs: 45_000,
};

export class OfferUpConnector implements SourceConnector {
  readonly source = "offerup";
  private cfg: OfferUpSafeguards;

  constructor(overrides: Partial<OfferUpSafeguards> = {}) {
    this.cfg = { ...DEFAULTS, ...overrides };
  }

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const chromium = await loadChromium();
    const limit = q.limit ?? 25;
    const fp = pickFingerprint();
    const opts = contextOptions(fp, !this.cfg.headful);
    const browser = await chromium.launch({ headless: opts.headless, args: opts.args });

    try {
      const ctx = await browser.newContext({
        userAgent: fp.userAgent,
        viewport: fp.viewport,
        locale: fp.locale,
        timezoneId: fp.timezoneId,
      });
      await ctx.addInitScript(STEALTH_INIT_SCRIPT);
      const page = await ctx.newPage();
      page.setDefaultNavigationTimeout(this.cfg.navTimeoutMs);

      const params = new URLSearchParams({ q: q.query });
      if (q.maxPrice) params.set("price_max", String(q.maxPrice));
      await page.goto(`https://offerup.com/search?${params.toString()}`, { waitUntil: "domcontentloaded" });
      await humanPause(...this.cfg.delayMs);

      const seen = new Map<string, RawCard>();
      let stale = 0;
      for (let i = 0; i < this.cfg.maxScrolls && seen.size < limit; i++) {
        const before = seen.size;
        for (const card of await this.extractCards(page)) {
          if (!seen.has(card.id)) seen.set(card.id, card);
        }
        stale = seen.size === before ? stale + 1 : 0;
        if (stale >= 2) break;
        await humanScroll(page);
        await humanPause(...this.cfg.delayMs);
      }

      const now = new Date().toISOString();
      return [...seen.values()]
        .slice(0, limit)
        .map((c): SourceListing => ({
          id: `ou_${c.id}`,
          source: "offerup",
          rawTitle: c.title,
          price: c.price,
          currency: "USD",
          imageUrls: c.image ? [c.image] : [],
          url: c.url,
          location: c.location,
          fetchedAt: now,
        }))
        .filter((l) => !q.maxPrice || l.price === 0 || l.price <= q.maxPrice);
    } finally {
      await browser.close();
    }
  }

  /** Anchor on item-detail links; read price/title/image relative to each. */
  private async extractCards(page: any): Promise<RawCard[]> {
    return page.$$eval('a[href*="/item/detail/"]', (anchors: any[]): RawCard[] => {
      const parsePrice = (t: string): number => {
        const m = t.match(/\$\s?([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, "")) : 0;
      };
      const out: RawCard[] = [];
      for (const a of anchors) {
        const href = String(a.href).split("?")[0];
        const idMatch = href.match(/\/item\/detail\/([\w-]+)/);
        if (!idMatch) continue;
        const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const img = a.querySelector("img");
        out.push({
          id: idMatch[1],
          url: href,
          title: text.replace(/^\$[\d,]+\s*/, "").slice(0, 140),
          price: parsePrice(text),
          image: img ? img.getAttribute("src") || undefined : undefined,
          location: undefined,
        });
      }
      return out;
    });
  }
}

interface RawCard {
  id: string;
  url: string;
  title: string;
  price: number;
  image?: string;
  location?: string;
}

async function loadChromium(): Promise<any> {
  try {
    const pw: any = await import("playwright");
    return pw.chromium;
  } catch {
    throw new Error(
      "Playwright is required for the OfferUp source but isn't installed. " +
        "Run: npm i playwright && npx playwright install chromium",
    );
  }
}
