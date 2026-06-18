import { EbayCompConnector } from "./connectors/ebay.js";
import { PriceChartingConnector } from "./connectors/pricecharting.js";
import { KeepaConnector } from "./connectors/keepa.js";
import { MultiCompConnector } from "./connectors/multicomp.js";
import type { CompConnector } from "./connectors/connector.js";

/** Comp markets the engine can value against. */
export const COMP_MARKETS = ["ebay", "pricecharting", "keepa"] as const;

function makeComp(name: string): CompConnector | null {
  switch (name) {
    case "ebay":
      return new EbayCompConnector();
    case "pricecharting":
      return new PriceChartingConnector();
    case "keepa":
    case "amazon":
      return new KeepaConnector();
    default:
      return null;
  }
}

/**
 * Build the comp connector from COMP_SOURCES (comma-separated; default "ebay").
 * Multiple markets are blended so resale triangulates across places you can
 * actually sell. e.g. COMP_SOURCES=ebay,pricecharting
 */
export function buildComper(): CompConnector {
  const names = (process.env.COMP_SOURCES ?? "ebay")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const comps = names.map(makeComp).filter((c): c is CompConnector => Boolean(c));
  if (comps.length === 0) return new EbayCompConnector();
  return comps.length === 1 ? comps[0] : new MultiCompConnector(comps);
}

/** Human-readable description of the active comp market(s), for health/UI. */
export function compInfo(): { markets: string; basis: string } {
  const comper = buildComper();
  return { markets: comper.market, basis: comper.basis ?? "sold" };
}
