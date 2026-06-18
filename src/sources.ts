import { CraigslistConnector } from "./connectors/craigslist.js";
import { FacebookConnector } from "./connectors/facebook.js";
import { OfferUpConnector } from "./connectors/offerup.js";
import { MercariConnector } from "./connectors/mercari.js";
import { ShopGoodwillConnector } from "./connectors/shopgoodwill.js";
import { MockSourceConnector } from "./connectors/mock.js";
import { MultiSourceConnector } from "./connectors/multi.js";
import { FailoverSourceConnector } from "./connectors/failover.js";
import { ApifyConnector, parseApifySources } from "./connectors/apify.js";
import type { SourceConnector } from "./connectors/connector.js";

/**
 * Source registry: built-in connectors plus any Apify-backed sources defined in
 * APIFY_SOURCES. Each entry is a factory so connectors are created per-use.
 */
const registry: Record<string, () => SourceConnector> = {
  demo: () => new MockSourceConnector(),
  craigslist: () => new CraigslistConnector(),
  facebook: () => new FacebookConnector(),
  offerup: () => new OfferUpConnector(),
  mercari: () => new MercariConnector(),
  shopgoodwill: () => new ShopGoodwillConnector(),
};

// Register Apify-backed sources from env (config-driven; no code per source).
// If an Apify source shares a name with a built-in scraper, compose the two into
// a failover (free in-process first, Apify fallback — or the reverse if the
// config sets primary=true) so a marketplace has a redundant path and won't fail
// as a whole. A brand-new name registers as an Apify-only source.
for (const cfg of parseApifySources()) {
  const builtin = registry[cfg.name];
  if (builtin) {
    registry[cfg.name] = () => {
      const inProcess = builtin();
      const apify = new ApifyConnector(cfg);
      const chain = cfg.primary ? [apify, inProcess] : [inProcess, apify];
      return new FailoverSourceConnector(chain, cfg.name);
    };
  } else {
    registry[cfg.name] = () => new ApifyConnector(cfg);
  }
}

/** Source names the CLI and dashboard can select. */
export const SOURCES: readonly string[] = Object.keys(registry);

/** Real (non-demo) marketplaces — what "all" sweeps across. */
export const LIVE_SOURCES = SOURCES.filter((s) => s !== "demo");

export function pickSource(name: string): SourceConnector {
  const make = registry[name];
  if (!make) throw new Error(`unknown source "${name}" (expected ${SOURCES.join("|")})`);
  return make();
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
  return names.length > 0 && names.every((n) => SOURCES.includes(n));
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
