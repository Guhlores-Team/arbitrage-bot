import type { SoldComp } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * Google Shopping comps via SerpApi — one clean API call returns prices across
 * many retailers, so you get broad comp coverage without scraping anything
 * yourself. Set SERPAPI_KEY to go live (https://serpapi.com); mock otherwise.
 *
 * These are active RETAIL asking prices (mostly new), so basis is "ask" — a
 * ceiling reference, not realized used-sale prices. Best blended with eBay (the
 * range valuation + flags handle the rougher basis).
 */
export class SerpApiShoppingConnector implements CompConnector {
  readonly market = "google";

  constructor(private key = process.env.SERPAPI_KEY ?? "") {}

  get basis(): "ask" | "mock" {
    return this.key ? "ask" : "mock";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    if (!this.key) return this.mock(searchString, limit);
    const url =
      "https://serpapi.com/search.json?" +
      new URLSearchParams({ engine: "google_shopping", q: searchString, api_key: this.key, num: String(Math.min(limit, 40)) });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`serpapi ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    return (json.shopping_results ?? [])
      .map((r: any): SoldComp => ({
        id: `gs_${r.product_id ?? r.position ?? Math.random().toString(36).slice(2)}`,
        title: String(r.title ?? searchString),
        soldPrice: Math.round(Number(r.extracted_price ?? 0)),
        currency: "USD",
        condition: "unknown",
        url: String(r.link ?? r.product_link ?? "https://www.google.com/shopping"),
        market: "google",
      }))
      .filter((c: SoldComp) => c.soldPrice > 0)
      .slice(0, limit);
  }

  private mock(searchString: string, limit: number): SoldComp[] {
    const base = 50 + (hash(searchString) % 200);
    const out: SoldComp[] = [];
    for (let i = 0; i < Math.min(limit, 6); i++) {
      out.push({
        id: `gs_mock_${i}`,
        title: `${searchString} (google shopping ${i + 1})`,
        soldPrice: Math.round(base * (1 + ((hash(searchString + i) % 30) - 15) / 100)),
        currency: "USD",
        condition: "unknown",
        url: "https://www.google.com/shopping",
        market: "google",
      });
    }
    return out;
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
