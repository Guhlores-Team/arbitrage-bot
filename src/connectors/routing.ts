import type { SoldComp } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * Category → best-comp routing. Picks the most relevant specialized sell market
 * for an item (games/cards → PriceCharting, sneakers → StockX) on top of an
 * always-on eBay baseline, so each item is valued against the market that
 * actually prices it well — without losing eBay's breadth.
 */

interface Route {
  market: string;
  test: RegExp;
}

const ROUTES: Route[] = [
  {
    market: "pricecharting",
    test: /\b(game|games|gaming|nintendo|switch|playstation|ps[1-5]|xbox|gamecube|wii|n64|sega|pokemon|zelda|mario|amiibo|tcg|trading card|cards?|funko|console)\b/i,
  },
  {
    market: "stockx",
    test: /\b(jordan|yeezy|nike|adidas|sneaker|sneakers|dunk|new balance|air force|air max|supreme|streetwear)\b/i,
  },
];

/** Which specialized market (if any) best fits this search string. */
export function routeMarket(searchString: string): string | null {
  for (const r of ROUTES) if (r.test.test(searchString)) return r.market;
  return null;
}

export class RoutingCompConnector implements CompConnector {
  readonly market = "auto";

  constructor(
    private baseline: CompConnector,
    private make: (market: string) => CompConnector | null,
  ) {}

  get basis(): "sold" | "ask" | "mock" {
    return this.baseline.basis ?? "sold";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    const conns: CompConnector[] = [this.baseline];
    const m = routeMarket(searchString);
    if (m) {
      const c = this.make(m);
      // Only blend the specialized market when it has real data — a mock/keyless
      // market must never pollute a live eBay valuation. (When the baseline is
      // also mock, e.g. demo mode, allow it for coherence.)
      if (c && (c.basis !== "mock" || this.baseline.basis === "mock")) conns.push(c);
    }
    const per = Math.max(5, Math.ceil(limit / conns.length));
    const pool: SoldComp[] = [];
    for (const c of conns) {
      try {
        for (const comp of await c.getSoldComps(searchString, per)) pool.push(comp);
      } catch (e: any) {
        console.error(`[routing] market "${c.market}" failed: ${e?.message ?? e}`);
      }
    }
    return pool;
  }
}
