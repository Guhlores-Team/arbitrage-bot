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

/** Comp markets: dashboard setting → env → default. */
export function effectiveCompSources(): string {
  return cache.compSources || process.env.COMP_SOURCES || "ebay";
}
