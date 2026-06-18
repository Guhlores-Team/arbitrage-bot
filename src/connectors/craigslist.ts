import { XMLParser } from "fast-xml-parser";
import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";

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

  constructor(private region = process.env.CRAIGSLIST_REGION ?? "sfbay") {}

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const params = new URLSearchParams({ query: q.query, format: "rss" });
    if (q.maxPrice) params.set("max_price", String(q.maxPrice));
    const url = `https://${this.region}.craigslist.org/search/sss?${params.toString()}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "arbitrage-engine/0.1 (personal research)" },
    });
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
    return out;
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
