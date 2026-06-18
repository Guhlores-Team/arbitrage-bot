import { EbayCompConnector } from "./connectors/ebay.js";
import { PriceChartingConnector } from "./connectors/pricecharting.js";
import { KeepaConnector } from "./connectors/keepa.js";
import { StockXConnector } from "./connectors/stockx.js";
import { MultiCompConnector } from "./connectors/multicomp.js";
import { RoutingCompConnector } from "./connectors/routing.js";
import type { CompConnector } from "./connectors/connector.js";

/** Comp markets the engine can value against. */
export const COMP_MARKETS = ["ebay", "pricecharting", "keepa", "stockx"] as const;

function makeComp(name: string): CompConnector | null {
  switch (name) {
    case "ebay":
      return new EbayCompConnector();
    case "pricecharting":
      return new PriceChartingConnector();
    case "keepa":
    case "amazon":
      return new KeepaConnector();
    case "stockx":
      return new StockXConnector();
    default:
      return null;
  }
}

/**
 * Build the comp connector from COMP_SOURCES (default "ebay"):
 *   - "auto"            → category routing (eBay baseline + the best specialized
 *                         market per item: games→PriceCharting, sneakers→StockX)
 *   - "ebay,pricecharting,…" → blend the listed markets equally
 *   - single name       → just that market
 */
export function buildComper(): CompConnector {
  const names = (process.env.COMP_SOURCES ?? "ebay")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (names.includes("auto")) {
    return new RoutingCompConnector(new EbayCompConnector(), makeComp);
  }

  const comps = names.map(makeComp).filter((c): c is CompConnector => Boolean(c));
  if (comps.length === 0) return new EbayCompConnector();
  return comps.length === 1 ? comps[0] : new MultiCompConnector(comps);
}

/** Human-readable description of the active comp market(s), for health/UI. */
export function compInfo(): { markets: string; basis: string } {
  const comper = buildComper();
  return { markets: comper.market, basis: comper.basis ?? "sold" };
}
