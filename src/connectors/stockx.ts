import type { SoldComp, Condition } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * StockX comp connector — sneakers & streetwear, where condition is binary
 * (new/DS vs used) and sold prices are tight. StockX/GOAT have no open API and
 * are heavily bot-protected, so a *real* integration needs a paid data provider
 * (or their gated partner API). Until one is wired, this returns mock comps and
 * reports basis "mock", which means the routing layer will NOT blend it into a
 * live eBay valuation (so it never pollutes real numbers). Set STOCKX_API_TOKEN
 * + implement fetchLive() when you have provider access.
 */
export class StockXConnector implements CompConnector {
  readonly market = "stockx";

  constructor(private token = process.env.STOCKX_API_TOKEN ?? "") {}

  get basis(): "sold" | "mock" {
    return this.token ? "sold" : "mock";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    if (!this.token) return this.mock(searchString, limit);
    return this.fetchLive(searchString, limit);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async fetchLive(_searchString: string, _limit: number): Promise<SoldComp[]> {
    // Wire a StockX data provider here when available; until then, never reached
    // (basis is "mock" without a token).
    throw new Error("StockX live access not configured");
  }

  private mock(searchString: string, limit: number): SoldComp[] {
    const base = 90 + (hash(searchString) % 260);
    const conds: Condition[] = ["new", "good"];
    const out: SoldComp[] = [];
    for (let i = 0; i < Math.min(limit, 5); i++) {
      out.push({
        id: `sx_mock_${i}`,
        title: `${searchString} (stockx ${conds[i % 2]})`,
        soldPrice: Math.round(base * (1 + i * 0.1)),
        currency: "USD",
        condition: conds[i % 2],
        url: "https://stockx.com/",
        market: "stockx",
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
