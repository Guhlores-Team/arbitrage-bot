import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";

/**
 * Demo source connector. Returns deterministic, offline listings so the
 * dashboard and pipeline are usable with zero setup — no keys, no network, no
 * browser. Prices are seeded to sit BELOW the eBay mock-comp median, so some
 * listings surface as real (mock) opportunities and the UI has something to
 * show. Use the live sources (craigslist/facebook) for real deals.
 */
export class MockSourceConnector implements SourceConnector {
  readonly source = "demo";

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const limit = q.limit ?? 12;
    const now = new Date().toISOString();
    const base = q.query.trim() || "nintendo switch";

    const templates = [
      { suffix: "— like new in box", factor: 0.45, cond: "like new" },
      { suffix: "(barely used)", factor: 0.6, cond: "good" },
      { suffix: "bundle w/ extras", factor: 0.7, cond: "good" },
      { suffix: "for parts / repair", factor: 0.25, cond: "for parts" },
      { suffix: "moving sale must go", factor: 0.5, cond: "good" },
      { suffix: "OBO", factor: 0.65, cond: "fair" },
      { suffix: "sealed, never opened", factor: 0.85, cond: "new" },
      { suffix: "with case + cables", factor: 0.55, cond: "good" },
    ];

    const market = 60 + (hash(base) % 240); // mirror eBay mock "market price"
    const out: SourceListing[] = [];
    for (let i = 0; i < Math.min(limit, templates.length); i++) {
      const t = templates[i];
      const price = Math.max(5, Math.round(market * t.factor));
      out.push({
        id: `demo_${hash(base + i)}`,
        source: "demo",
        rawTitle: `${capitalize(base)} ${t.suffix}`,
        description: `Selling my ${base}. Condition: ${t.cond}. Cash only, local pickup.`,
        price,
        currency: "USD",
        imageUrls: [`https://picsum.photos/seed/${encodeURIComponent(base + i)}/400/300`],
        url: `https://example.com/demo/listing/${hash(base + i)}`,
        location: ["Brooklyn", "Oakland", "Austin", "Chicago"][i % 4],
        postedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        fetchedAt: now,
      });
    }
    return out.filter((l) => !q.maxPrice || l.price <= q.maxPrice);
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
