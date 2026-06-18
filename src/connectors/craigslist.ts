import { XMLParser } from "fast-xml-parser";
import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";
import { scrapeFetch } from "../proxy.js";

/**
 * Craigslist source connector.
 *
 * Uses Craigslist's built-in RSS output (append &format=rss to any search).
 * This is a published feed format, which is why it's the lowest-friction
 * first source — no headless browser, no login wall, no anti-bot fight.
 *
 * RSS gives title, link, description, price-ish text and a timestamp. It does
 * NOT reliably give structured price or images, so we parse what we can and
 * leave gaps for the identify step (which can fetch the listing page later if
 * you want richer data).
 */
export class CraigslistConnector implements SourceConnector {
  readonly source = "craigslist";
  private parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  constructor(
    private region = process.env.CRAIGSLIST_REGION ?? "sfbay",
    private enrich = (process.env.CRAIGSLIST_ENRICH ?? "false") === "true",
  ) {}

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const params = new URLSearchParams({ query: q.query, format: "rss" });
    if (q.maxPrice) params.set("max_price", String(q.maxPrice));
    const url = `https://${this.region}.craigslist.org/search/sss?${params.toString()}`;

    const res = await scrapeFetch(
      url,
      { headers: { "User-Agent": "arbitrage-engine/0.1 (personal research)" } },
      "craigslist",
    );
    if (!res.ok) throw new Error(`craigslist ${res.status} for ${url}`);
    const xml = await res.text();

    const doc = this.parser.parse(xml);
    // Craigslist RSS is RDF: items live under rdf:RDF.item (array or single).
    const rawItems = doc?.["rdf:RDF"]?.item ?? doc?.rss?.channel?.item ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    const now = new Date().toISOString();
    const out: SourceListing[] = [];
    for (const it of items.slice(0, q.limit ?? 50)) {
      if (!it?.link) continue;
      const title = String(it.title ?? "").trim();
      out.push({
        id: this.idFromLink(String(it.link)),
        source: "craigslist",
        rawTitle: title,
        description: this.stripHtml(String(it.description ?? "")),
        price: this.priceFrom(title, String(it.description ?? "")),
        currency: "USD",
        imageUrls: [], // RSS omits images; fetch the listing page later if needed
        url: String(it.link),
        postedAt: it["dc:date"] ? String(it["dc:date"]) : undefined,
        fetchedAt: now,
      });
    }

    // RSS gives no images and unreliable prices. When enrichment is on, fetch
    // each listing page (throttled, capped) to fill imageUrls + missing prices
    // so the vision identify step actually has photos to work with.
    if (this.enrich) await this.enrichAll(out);

    return out;
  }

  /** Sequentially enrich listings from their detail pages (polite, bounded). */
  private async enrichAll(listings: SourceListing[], cap = 20): Promise<void> {
    for (const l of listings.slice(0, cap)) {
      try {
        const res = await scrapeFetch(
          l.url,
          { headers: { "User-Agent": "arbitrage-engine/0.1 (personal research)" } },
          "craigslist",
        );
        if (!res.ok) continue;
        const html = await res.text();
        l.imageUrls = this.imagesFrom(html);
        if (l.price === 0) l.price = this.priceFrom(html);
      } catch {
        // skip unreachable / changed pages
      }
      await sleep(400 + Math.random() * 400); // be gentle on the source
    }
  }

  /** Pull craigslist-hosted image URLs from a listing page (deduped, capped). */
  private imagesFrom(html: string, max = 4): string[] {
    const re = /https:\/\/images\.craigslist\.org\/[\w]+_[\w]+(?:_[0-9x]+)?\.jpg/g;
    const seen = new Set<string>();
    for (const m of html.matchAll(re)) {
      // normalize to a larger variant when craigslist gives a thumbnail size
      seen.add(m[0].replace(/_[0-9]+x[0-9]+\.jpg$/, "_600x450.jpg"));
      if (seen.size >= max) break;
    }
    return [...seen];
  }

  private idFromLink(link: string): string {
    const m = link.match(/(\d+)\.html/);
    return m ? `cl_${m[1]}` : `cl_${Buffer.from(link).toString("base64url").slice(0, 16)}`;
  }

  private priceFrom(...texts: string[]): number {
    for (const t of texts) {
      const m = t.match(/\$\s?([\d,]+)/);
      if (m) return Number(m[1].replace(/,/g, ""));
    }
    return 0; // unknown — identify/scoring will flag it
  }

  private stripHtml(s: string): string {
    return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
