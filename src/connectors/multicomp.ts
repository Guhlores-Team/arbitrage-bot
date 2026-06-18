import type { SoldComp } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * Blends comps from several sell markets (e.g. eBay + PriceCharting) into one
 * pool, so the resale estimate triangulates across places you could actually
 * sell. Children run sequentially and are isolated — one failing market doesn't
 * sink the valuation.
 */
export class MultiCompConnector implements CompConnector {
  readonly market: string;

  constructor(private children: CompConnector[]) {
    this.market = children.map((c) => c.market).join("+");
  }

  /** Best available basis: a real "sold" beats "ask" beats "mock". */
  get basis(): "sold" | "ask" | "mock" {
    const bases = this.children.map((c) => c.basis ?? "sold");
    if (bases.includes("sold")) return "sold";
    if (bases.includes("ask")) return "ask";
    return "mock";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    const per = Math.max(5, Math.ceil(limit / Math.max(1, this.children.length)));
    const pool: SoldComp[] = [];
    for (const child of this.children) {
      try {
        for (const c of await child.getSoldComps(searchString, per)) pool.push(c);
      } catch (e: any) {
        console.error(`[multicomp] market "${child.market}" failed: ${e?.message ?? e}`);
      }
    }
    return pool;
  }
}
