import type { SoldComp, Condition } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * Keepa (Amazon) comp connector — Amazon is a huge resale outlet with deep
 * price data. Keepa exposes it via a paid API: set KEEPA_API_KEY to go live
 * (https://keepa.com/#!api). We search by keyword and map the current New /
 * Used / Amazon prices to comps. Without a key it returns mock comps so the
 * pipeline still runs.
 *
 * Keepa is an API (not a scraped site), so it ignores SCRAPER_PROXY.
 */
export class KeepaConnector implements CompConnector {
  readonly market = "amazon";

  constructor(
    private key = process.env.KEEPA_API_KEY ?? "",
    private domain = process.env.KEEPA_DOMAIN ?? "1", // 1 = amazon.com (US)
    private useMock = !process.env.KEEPA_API_KEY,
  ) {}

  get basis(): "sold" | "mock" {
    return this.useMock ? "mock" : "sold";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    if (this.useMock) return this.mock(searchString, limit);
    const url =
      "https://api.keepa.com/search?" +
      new URLSearchParams({ key: this.key, domain: this.domain, type: "product", term: searchString, stats: "1" });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`keepa ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    const out: SoldComp[] = [];
    for (const p of (json.products ?? []).slice(0, limit)) {
      const cur: number[] = p?.stats?.current ?? [];
      // Keepa price indices (cents, -1 = none): 0 Amazon, 1 New, 2 Used
      for (const [idx, cond] of [
        [1, "new"],
        [2, "good"],
        [0, "new"],
      ] as [number, Condition][]) {
        const cents = Number(cur[idx] ?? -1);
        if (cents > 0) {
          out.push({
            id: `kp_${p.asin}_${idx}`,
            title: String(p.title ?? searchString),
            soldPrice: Math.round(cents / 100),
            currency: "USD",
            condition: cond,
            url: p.asin ? `https://www.amazon.com/dp/${p.asin}` : "https://www.amazon.com/",
            market: "amazon",
          });
        }
      }
    }
    return out;
  }

  private mock(searchString: string, limit: number): SoldComp[] {
    const base = 30 + (hash(searchString) % 170);
    const conds: Condition[] = ["good", "new"];
    const out: SoldComp[] = [];
    for (let i = 0; i < Math.min(limit, 5); i++) {
      out.push({
        id: `kp_mock_${i}`,
        title: `${searchString} (amazon ${conds[i % 2]})`,
        soldPrice: Math.round(base * (1 + i * 0.15)),
        currency: "USD",
        condition: conds[i % 2],
        url: "https://www.amazon.com/",
        market: "amazon",
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
