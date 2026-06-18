import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";
import { parsePrice } from "./parse.js";

/**
 * Generic Apify-backed source connector. Apify hosts maintained "actors" that
 * scrape marketplaces (Facebook, OfferUp, Mercari, Amazon, Nextdoor, …) behind
 * their own proxies/anti-bot — so you add a buy source by config, not new code.
 *
 * Configure via env (no token = these sources just don't register):
 *   APIFY_TOKEN=apify_api_xxx
 *   APIFY_SOURCES=[{"name":"fb","actor":"apify/facebook-marketplace-scraper",
 *                   "queryField":"keyword","input":{"maxItems":25},
 *                   "map":{"price":"price","url":"listingUrl","image":"image"}}]
 *
 * - name:       source name shown in the dashboard / used in scans
 * - actor:      Apify actor id ("user/actor" or "user~actor")
 * - queryField: actor input field that takes the search term (default "search")
 * - input:      extra static actor input (filters, maxItems, location, …)
 * - map:        override output field names (id/title/price/url/image/location)
 */

export interface ApifySourceConfig {
  name: string;
  actor: string;
  queryField?: string;
  input?: Record<string, unknown>;
  map?: Partial<Record<"id" | "title" | "price" | "url" | "image" | "location", string>>;
}

export class ApifyConnector implements SourceConnector {
  readonly source: string;

  constructor(private cfg: ApifySourceConfig) {
    this.source = cfg.name;
  }

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN not set");
    const actor = this.cfg.actor.replace("/", "~");
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=180`;

    const input = {
      [this.cfg.queryField ?? "search"]: q.query,
      ...(q.maxPrice ? { maxPrice: q.maxPrice } : {}),
      ...(this.cfg.input ?? {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`apify ${this.cfg.actor} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const items = (await res.json()) as any[];
    if (!Array.isArray(items)) return [];

    const m = this.cfg.map ?? {};
    const now = new Date().toISOString();
    const limit = q.limit ?? 25;
    return items
      .slice(0, limit)
      .map((it): SourceListing => {
        const url = String(pick(it, m.url, ["url", "link", "itemUrl", "listingUrl", "detailUrl"]) ?? "");
        const rawPrice = pick(it, m.price, ["price", "currentPrice", "amount", "priceValue"]);
        const img = pick(it, m.image, ["image", "imageUrl", "thumbnail", "img", "photo"]);
        const idVal = String(pick(it, m.id, ["id", "itemId", "productId"]) ?? "");
        return {
          id: `apify_${this.cfg.name}_${idVal || url || Math.random().toString(36).slice(2)}`,
          source: this.cfg.name as any,
          rawTitle: String(pick(it, m.title, ["title", "name", "productName"]) ?? "").trim(),
          price: typeof rawPrice === "number" ? Math.round(rawPrice) : parsePrice(String(rawPrice ?? "")),
          currency: "USD",
          imageUrls: img ? [String(img)] : [],
          url: url || "https://apify.com",
          location: optStr(pick(it, m.location, ["location", "city", "area"])),
          fetchedAt: now,
        };
      })
      .filter((l) => l.rawTitle && (!q.maxPrice || l.price === 0 || l.price <= q.maxPrice));
  }
}

function pick(obj: any, override: string | undefined, fallbacks: string[]): unknown {
  if (override && obj[override] != null) return obj[override];
  for (const k of fallbacks) if (obj[k] != null) return obj[k];
  return undefined;
}
function optStr(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}

/** Parse APIFY_SOURCES env into connector configs (ignored if malformed). */
export function parseApifySources(): ApifySourceConfig[] {
  const raw = process.env.APIFY_SOURCES;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c) => c && typeof c.name === "string" && typeof c.actor === "string");
  } catch {
    return [];
  }
}
