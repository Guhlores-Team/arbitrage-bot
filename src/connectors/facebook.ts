import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";
import {
  pickFingerprint,
  contextOptions,
  STEALTH_INIT_SCRIPT,
  humanScroll,
  humanPause,
} from "./stealth.js";
import { parseCard, type RawCard } from "./parse.js";

/**
 * Facebook Marketplace source connector.
 *
 * Unlike Craigslist, Marketplace has no public API and no published feed: the
 * listings live behind auth and are rendered client-side, with active anti-bot.
 * So this connector drives a real (Playwright) browser using a PERSISTENT
 * logged-in session — you sign in once by hand, the cookies are reused after —
 * with the anti-detection hardening in ./stealth.ts applied.
 *
 * Responsible-operation note: scraping Marketplace is against Meta's Terms of
 * Service and risks account/IP rate-limiting or bans. This connector is built
 * for low-volume personal research: it runs one tab at a time, throttles every
 * action with randomized human-ish delays, caps how far it scrolls, and stops
 * at your result limit. Keep it that way. Prefer official APIs/feeds where they
 * exist; this is the fallback for a market that offers neither.
 *
 * Playwright is an OPTIONAL dependency, dynamically imported below, so the rest
 * of the engine (and the Craigslist path) installs and runs without a browser.
 * If you want this source: `npm i playwright && npx playwright install chromium`.
 */

export interface FacebookSafeguards {
  /** persistent profile dir holding your logged-in session (cookies). */
  userDataDir: string;
  /** run with a visible window. Required the first time so you can log in. */
  headful: boolean;
  /** [min, max] ms to wait between scrolls / actions — randomized each time. */
  delayMs: [number, number];
  /** hard cap on scroll cycles, independent of result count. */
  maxScrolls: number;
  /** Marketplace location slug or city id, e.g. "nyc", "sfbay", "la". */
  location: string;
  /** overall navigation timeout (ms). */
  navTimeoutMs: number;
}

const DEFAULT_SAFEGUARDS: FacebookSafeguards = {
  userDataDir: process.env.FACEBOOK_USER_DATA_DIR ?? ".fb-session",
  headful: (process.env.FACEBOOK_HEADFUL ?? "false") === "true",
  delayMs: [1500, 3500],
  maxScrolls: 12,
  location: process.env.FACEBOOK_MARKETPLACE_LOCATION ?? "nyc",
  navTimeoutMs: 45_000,
};

export class FacebookConnector implements SourceConnector {
  readonly source = "facebook";
  private cfg: FacebookSafeguards;

  constructor(overrides: Partial<FacebookSafeguards> = {}) {
    this.cfg = { ...DEFAULT_SAFEGUARDS, ...overrides };
  }

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const chromium = await loadChromium();
    const limit = q.limit ?? 25;

    // Persistent context + a per-run fingerprint. First run must be headful so
    // you can complete login (and any checkpoint).
    const fp = pickFingerprint();
    const ctx = await chromium.launchPersistentContext(
      this.cfg.userDataDir,
      contextOptions(fp, !this.cfg.headful),
    );

    try {
      // Apply anti-detection patches before any page navigates.
      await ctx.addInitScript(STEALTH_INIT_SCRIPT);

      const page = await ctx.newPage();
      page.setDefaultNavigationTimeout(this.cfg.navTimeoutMs);

      const url = this.buildSearchUrl(q);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await humanPause(...this.cfg.delayMs);

      // Login wall detection: Marketplace bounces logged-out sessions to /login.
      if (/\/login|\/checkpoint/.test(page.url())) {
        throw new Error(
          "Facebook session is not logged in. Run `npm run fb:login` (headful) " +
            "and sign in once; cookies persist in the userDataDir for later runs.",
        );
      }

      const seen = new Map<string, RawCard>();
      let stale = 0;
      for (let i = 0; i < this.cfg.maxScrolls && seen.size < limit; i++) {
        const before = seen.size;
        for (const card of await this.extractCards(page)) {
          if (!seen.has(card.id)) seen.set(card.id, card);
        }
        // Stop early if scrolling stops yielding anything new (end of results).
        stale = seen.size === before ? stale + 1 : 0;
        if (stale >= 2) break;
        await humanScroll(page);
        await humanPause(...this.cfg.delayMs);
      }

      const now = new Date().toISOString();
      return [...seen.values()]
        .slice(0, limit)
        .map((raw) => parseCard(raw))
        .map((c): SourceListing => ({
          id: `fb_${c.id}`,
          source: "facebook",
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
      await ctx.close();
    }
  }

  private buildSearchUrl(q: SearchQuery): string {
    const params = new URLSearchParams({ query: q.query });
    if (q.maxPrice) params.set("maxPrice", String(q.maxPrice));
    // Newest first keeps repeated runs from re-scoring the same stale inventory.
    params.set("sortBy", "creation_time_descend");
    return `https://www.facebook.com/marketplace/${this.cfg.location}/search?${params.toString()}`;
  }

  /**
   * Pull raw listing cards from the current DOM. Marketplace markup is
   * obfuscated and changes often, so we anchor on the one stable thing — item
   * links of the form /marketplace/item/<id>/ — and collect the visible text
   * fragments + image attrs per card. All the messy price/title/location
   * parsing happens Node-side in parse.ts (so it's testable). The callback
   * below runs in the browser, so it's plain JS with no Node types.
   */
  private async extractCards(page: FbPage): Promise<RawCard[]> {
    return page.$$eval('a[href*="/marketplace/item/"]', (anchors: any[]): RawCard[] => {
      const out: RawCard[] = [];
      for (const a of anchors) {
        const href = String(a.href).split("?")[0];
        const idMatch = href.match(/\/marketplace\/item\/(\d+)/);
        if (!idMatch) continue;
        const spans = Array.from(a.querySelectorAll("span")) as any[];
        let texts = spans.map((s) => (s.textContent ?? "").trim()).filter(Boolean);
        if (!texts.length) {
          const t = (a.textContent ?? "").trim();
          if (t) texts = [t];
        }
        if (!texts.length) continue;
        const img = a.querySelector("img");
        out.push({
          id: idMatch[1],
          url: href,
          texts,
          src: img ? img.getAttribute("src") || undefined : undefined,
          srcset: img ? img.getAttribute("srcset") || undefined : undefined,
        });
      }
      return out;
    });
  }
}

// --- Playwright loaded lazily so it stays an optional dependency. ---
// Typed loosely (any) on purpose: the package may not be installed, and we
// don't want its types to be a hard compile dependency for the rest of the engine.
type FbPage = any;
type FbChromium = { launchPersistentContext(dir: string, opts: any): Promise<any> };

async function loadChromium(): Promise<FbChromium> {
  try {
    const pw: any = await import("playwright");
    return pw.chromium;
  } catch {
    throw new Error(
      "Playwright is required for the Facebook source but isn't installed. " +
        "Run: npm i playwright && npx playwright install chromium",
    );
  }
}
