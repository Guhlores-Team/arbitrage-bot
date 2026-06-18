import type { SoldComp, Condition } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * PriceCharting comp connector — market values for video games, consoles, and
 * trading cards (exactly the high-velocity flip categories). It has a real API:
 * set PRICECHARTING_TOKEN to go live (https://www.pricecharting.com/api). Prices
 * come back in pennies for loose / complete-in-box / new conditions, which we
 * map to comps. Without a token it returns deterministic mock comps so the
 * pipeline still runs.
 */
export class PriceChartingConnector implements CompConnector {
  readonly market = "pricecharting";

  constructor(
    private token = process.env.PRICECHARTING_TOKEN ?? "",
    private useMock = !process.env.PRICECHARTING_TOKEN,
  ) {}

  get basis(): "sold" | "mock" {
    return this.useMock ? "mock" : "sold";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    return (await this.fetch(searchString, limit)).map((c) => ({ ...c, market: "pricecharting" }));
  }

  private async fetch(searchString: string, limit: number): Promise<SoldComp[]> {
    if (this.useMock) return this.mock(searchString, limit);
    const url = "https://www.pricecharting.com/api/products?" + new URLSearchParams({ t: this.token, q: searchString });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`pricecharting ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    const out: SoldComp[] = [];
    for (const p of (json.products ?? []).slice(0, limit)) {
      const name = `${p["product-name"] ?? searchString}${p["console-name"] ? ` (${p["console-name"]})` : ""}`;
      // prices are in pennies; surface each condition as its own comp
      for (const [field, cond] of [
        ["loose-price", "good"],
        ["cib-price", "like_new"],
        ["new-price", "new"],
      ] as [string, Condition][]) {
        const cents = Number(p[field] ?? 0);
        if (cents > 0) {
          out.push({
            id: `pc_${p.id}_${field}`,
            title: name,
            soldPrice: Math.round(cents / 100),
            currency: "USD",
            condition: cond,
            url: p.id ? `https://www.pricecharting.com/game/${p.id}` : "https://www.pricecharting.com/",
          });
        }
      }
    }
    return out;
  }

  private mock(searchString: string, limit: number): SoldComp[] {
    const base = 25 + (hash(searchString) % 120);
    const conds: Condition[] = ["good", "like_new", "new"];
    const out: SoldComp[] = [];
    for (let i = 0; i < Math.min(limit, 6); i++) {
      out.push({
        id: `pc_mock_${i}`,
        title: `${searchString} (pricecharting ${conds[i % 3]})`,
        soldPrice: Math.round(base * (1 + i * 0.2)),
        currency: "USD",
        condition: conds[i % 3],
        url: "https://www.pricecharting.com/",
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
