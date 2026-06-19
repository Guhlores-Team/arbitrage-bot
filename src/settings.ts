import { store, type Settings } from "./store.js";

/**
 * Runtime settings: editable from the dashboard, persisted in the store, with
 * env-var fallbacks. Cached in memory so sync call sites (e.g. buildComper) can
 * read it; refreshed on save and at server startup.
 */
let cache: Settings = {};

export async function initSettings(): Promise<void> {
  cache = await store.getSettings();
}

export function getSettings(): Settings {
  return cache;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  cache = await store.setSettings(patch);
  return cache;
}

/**
 * Comp markets: dashboard setting → COMP_SOURCES env → smart default.
 *
 * Zero-config: if you've set a SERPAPI_KEY but no explicit source, use SerpApi —
 * it returns real comps out of the box (eBay engine, incl. sold), so dropping
 * one key into .env is enough. Otherwise fall back to the eBay connector.
 */
export function effectiveCompSources(): string {
  const explicit = cache.compSources || process.env.COMP_SOURCES;
  if (explicit) return explicit;
  if (process.env.SERPAPI_KEY) return "serpapi";
  return "ebay";
}
