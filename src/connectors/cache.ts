import type { SoldComp } from "../types.js";
import type { CompConnector } from "./connector.js";
import { loadJson, saveJson } from "./persist.js";
import { log } from "../log.js";

type DiskEntry = { at: number; comps: SoldComp[] };

/**
 * Wraps a comp connector with a TTL cache keyed by the normalized search string.
 * Duplicate queries — the same product across many listings, or re-scanning the
 * same search later — reuse results instead of spending another paid lookup.
 * This is the main lever for staying under a SerpApi free-tier cap.
 *
 * In-memory: shared across scans in a long-lived process (dashboard / watch),
 * and deduped within a single CLI run. Set COMP_CACHE_TTL_MIN=0 to disable.
 *
 * Optionally PERSISTED to disk (COMP_CACHE_FILE): resolved comps survive a
 * restart, so a pm2 reload / crash doesn't re-burn the quota re-comping the same
 * products. Without it, every restart starts cold.
 */
export class CachingCompConnector implements CompConnector {
  readonly market: string;
  // Store the in-flight promise (not just the result) so concurrent identical
  // queries during a parallel scan share a single paid lookup instead of racing.
  private cache = new Map<string, { at: number; comps: Promise<SoldComp[]> }>();
  // Resolved results loaded from / flushed to disk (only when persistPath set).
  private disk = new Map<string, DiskEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private inner: CompConnector,
    private ttlMs: number,
    private persistPath?: string,
  ) {
    this.market = inner.market;
    if (this.persistPath) {
      const raw = loadJson<Record<string, DiskEntry>>(this.persistPath, {});
      const now = Date.now();
      for (const [k, v] of Object.entries(raw)) {
        if (v && now - v.at < this.ttlMs) this.disk.set(k, v); // drop stale on load
      }
    }
  }

  get basis(): "sold" | "ask" | "mock" | undefined {
    return this.inner.basis;
  }

  /** Lookups served from cache this process — the gap vs paid searches = savings. */
  hits = 0;

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    const key = searchString.trim().toLowerCase().replace(/\s+/g, " ");
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) {
      this.hits++;
      log.debug("comp cache hit", { q: key });
      return (await hit.comps).slice(0, limit);
    }
    const onDisk = this.disk.get(key);
    if (onDisk && Date.now() - onDisk.at < this.ttlMs) {
      this.hits++;
      log.debug("comp cache hit (disk)", { q: key });
      return onDisk.comps.slice(0, limit);
    }
    const promise = this.inner.getSoldComps(searchString, limit);
    this.cache.set(key, { at: Date.now(), comps: promise });
    try {
      const comps = await promise;
      if (this.persistPath) {
        this.disk.set(key, { at: Date.now(), comps });
        this.scheduleSave();
      }
      return comps.slice(0, limit);
    } catch (e) {
      this.cache.delete(key); // never cache a failed lookup
      throw e;
    }
  }

  /** Debounced disk flush, capped so the file can't grow unbounded. */
  private scheduleSave(): void {
    if (!this.persistPath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      let entries = [...this.disk.entries()];
      if (entries.length > 5000) {
        entries = entries.sort((a, b) => b[1].at - a[1].at).slice(0, 5000); // keep freshest
        this.disk = new Map(entries);
      }
      saveJson(this.persistPath!, Object.fromEntries(entries));
    }, 1000);
    this.saveTimer.unref?.(); // don't keep the process alive for a cache flush
  }
}

