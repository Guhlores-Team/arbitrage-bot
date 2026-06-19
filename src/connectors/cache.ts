import type { SoldComp } from "../types.js";
import type { CompConnector } from "./connector.js";
import { log } from "../log.js";

/**
 * Wraps a comp connector with a TTL cache keyed by the normalized search string.
 * Duplicate queries — the same product across many listings, or re-scanning the
 * same search later — reuse results instead of spending another paid lookup.
 * This is the main lever for staying under a SerpApi free-tier cap.
 *
 * In-memory: shared across scans in a long-lived process (dashboard / watch),
 * and deduped within a single CLI run. Set COMP_CACHE_TTL_MIN=0 to disable.
 */
export class CachingCompConnector implements CompConnector {
  readonly market: string;
  private cache = new Map<string, { at: number; comps: SoldComp[] }>();

  constructor(
    private inner: CompConnector,
    private ttlMs: number,
  ) {
    this.market = inner.market;
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
      return hit.comps.slice(0, limit);
    }
    const comps = await this.inner.getSoldComps(searchString, limit);
    this.cache.set(key, { at: Date.now(), comps });
    return comps;
  }
}
