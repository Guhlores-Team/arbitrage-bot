import { CraigslistConnector } from "./connectors/craigslist.js";
import { FacebookConnector } from "./connectors/facebook.js";
import { OfferUpConnector } from "./connectors/offerup.js";
import { MercariConnector } from "./connectors/mercari.js";
import { ShopGoodwillConnector } from "./connectors/shopgoodwill.js";
import { MockSourceConnector } from "./connectors/mock.js";
import { MultiSourceConnector } from "./connectors/multi.js";
import type { SourceConnector } from "./connectors/connector.js";

/** Source connectors the CLI and dashboard can select by name. */
export const SOURCES = ["demo", "craigslist", "facebook", "offerup", "mercari", "shopgoodwill"] as const;
export type SourceName = (typeof SOURCES)[number];

/** Real (non-demo) local marketplaces — what "all" sweeps across. */
export const LIVE_SOURCES = SOURCES.filter((s) => s !== "demo");

export function pickSource(name: string): SourceConnector {
  switch (name) {
    case "facebook":
      return new FacebookConnector();
    case "offerup":
      return new OfferUpConnector();
    case "mercari":
      return new MercariConnector();
    case "shopgoodwill":
      return new ShopGoodwillConnector();
    case "craigslist":
      return new CraigslistConnector();
    case "demo":
      return new MockSourceConnector();
    default:
      throw new Error(`unknown source "${name}" (expected ${SOURCES.join("|")})`);
  }
}

/** Expand a source spec into the list of source names it targets. */
export function expandSourceSpec(spec: string): string[] {
  if (spec === "all") return [...LIVE_SOURCES];
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidSourceSpec(spec: string): boolean {
  const names = expandSourceSpec(spec);
  return names.length > 0 && names.every((n) => (SOURCES as readonly string[]).includes(n));
}

/**
 * Build a connector from a spec: a single source name, "all", or a
 * comma-separated list (e.g. "craigslist,offerup,mercari"). Multiple sources
 * are aggregated and de-duped.
 */
export function resolveSource(spec: string): SourceConnector {
  const names = expandSourceSpec(spec);
  if (names.length === 1) return pickSource(names[0]);
  return new MultiSourceConnector(names.map(pickSource), spec === "all" ? "all" : names.join("+"));
}
