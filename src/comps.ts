import { EbayCompConnector } from "./connectors/ebay.js";
import { PriceChartingConnector } from "./connectors/pricecharting.js";
import { KeepaConnector } from "./connectors/keepa.js";
import { StockXConnector } from "./connectors/stockx.js";
import { SerpApiShoppingConnector } from "./connectors/serpapi.js";
import { ApifyCompConnector, parseApifyComps } from "./connectors/apify-comp.js";
import { MultiCompConnector } from "./connectors/multicomp.js";
import { RoutingCompConnector } from "./connectors/routing.js";
import { CachingCompConnector } from "./connectors/cache.js";
import { effectiveCompSources } from "./settings.js";
import type { CompConnector } from "./connectors/connector.js";

/** Comp markets the engine can value against. */
export const COMP_MARKETS = ["ebay", "ebay-sold", "pricecharting", "keepa", "stockx", "google"] as const;

/** Your own Apify comp actors, keyed by the market they cover (from APIFY_COMPS). */
const apifyCompsByMarket = new Map(parseApifyComps().map((c) => [c.market, c]));

function makeComp(name: string): CompConnector | null {
  // A market wired to your own Apify actor (e.g. stockx) returns real data.
  const apifyCfg = apifyCompsByMarket.get(name);
  if (apifyCfg) return new ApifyCompConnector(apifyCfg);

  switch (name) {
    case "ebay":
      return new EbayCompConnector();
    case "ebay-sold":
    case "apify":
      // Real eBay SOLD prices from your own Apify actor (/actors/ebay-sold).
      return new ApifyCompConnector();
    case "pricecharting":
      return new PriceChartingConnector();
    case "keepa":
    case "amazon":
      return new KeepaConnector();
    case "stockx":
      return new StockXConnector();
    case "google":
    case "serpapi":
      return new SerpApiShoppingConnector();
    default:
      return null;
  }
}

/**
 * The general-purpose baseline comp market: SerpApi (eBay sold, ungated) when a
 * key is present, else the eBay API connector. Used for un-routed items and as
 * the `auto` baseline — so routing never falls back to mock when SerpApi is live.
 */
function defaultBaseline(): CompConnector {
  return process.env.SERPAPI_KEY ? new SerpApiShoppingConnector() : new EbayCompConnector();
}

/**
 * Build the comp connector from COMP_SOURCES (default: SerpApi if keyed, else
 * eBay):
 *   - "auto"            → category routing: the best specialized market per item
 *                         (games→PriceCharting, sneakers→StockX) over a SerpApi
 *                         baseline. COMP_ROUTING=replace (default) uses the
 *                         specialized market instead of the baseline to save
 *                         quota; =blend queries both.
 *   - "serpapi,pricecharting,…" → blend the listed markets equally
 *   - single name       → just that market
 *
 * Wrapped in a TTL cache (COMP_CACHE_TTL_MIN, default 720) so duplicate lookups
 * don't spend repeat searches.
 */
export function buildComper(): CompConnector {
  const names = effectiveCompSources()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let comper: CompConnector;
  if (names.includes("auto")) {
    const mode = process.env.COMP_ROUTING === "blend" ? "blend" : "replace";
    comper = new RoutingCompConnector(defaultBaseline(), makeComp, mode);
  } else {
    const comps = names.map(makeComp).filter((c): c is CompConnector => Boolean(c));
    comper = comps.length === 0 ? defaultBaseline() : comps.length === 1 ? comps[0] : new MultiCompConnector(comps);
  }

  const ttlMin = Number(process.env.COMP_CACHE_TTL_MIN ?? 720);
  const persistPath = process.env.COMP_CACHE_FILE?.trim() || undefined;
  return ttlMin > 0 ? new CachingCompConnector(comper, ttlMin * 60_000, persistPath) : comper;
}

/** Human-readable description of the active comp market(s), for health/UI. */
export function compInfo(): { markets: string; basis: string } {
  const comper = buildComper();
  return { markets: comper.market, basis: comper.basis ?? "sold" };
}
