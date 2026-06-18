import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OpportunityView } from "./view.js";

/**
 * Zero-infra persistence: a single JSON file. No database to stand up, so the
 * dashboard's saved feed and watchlists work out of the box. The Prisma schema
 * in /prisma is the upgrade path once you want Postgres + concurrency.
 *
 * Writes are atomic (temp file + rename) so a crash mid-write can't corrupt the
 * store. Everything is small and personal-scale, so we keep it all in memory and
 * flush on change.
 */

export interface Watchlist {
  id: string;
  query: string;
  source: string;
  maxPrice?: number;
  thresholds?: { minMarginPct: number; minAbsoluteProfit: number; minMatchConfidence: number };
  intervalMin: number;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastFoundCount?: number;
}

interface StoreData {
  opportunities: OpportunityView[];
  watchlists: Watchlist[];
}

const MAX_OPPORTUNITIES = 1000;

export class JsonStore {
  private data: StoreData = { opportunities: [], watchlists: [] };
  private loaded = false;

  constructor(private file = process.env.STORE_FILE ?? join("data", "store.json")) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.data = {
        opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
        watchlists: Array.isArray(parsed.watchlists) ? parsed.watchlists : [],
      };
    } catch {
      this.data = { opportunities: [], watchlists: [] }; // fresh store
    }
    this.loaded = true;
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2));
    await rename(tmp, this.file);
  }

  // --- opportunities (saved feed) ---

  /**
   * Upsert opportunities by listing id, keeping the most recent scan's figures.
   * Tags each with the source/query/time it was found. Returns how many were new.
   */
  async saveOpportunities(
    opps: OpportunityView[],
    meta: { source: string; query: string },
  ): Promise<number> {
    await this.load();
    const now = new Date().toISOString();
    const byId = new Map(this.data.opportunities.map((o) => [o.id, o]));
    let added = 0;
    for (const o of opps) {
      if (!byId.has(o.id)) added++;
      byId.set(o.id, { ...o, source: meta.source, query: meta.query, savedAt: now });
    }
    this.data.opportunities = [...byId.values()]
      .sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""))
      .slice(0, MAX_OPPORTUNITIES);
    await this.flush();
    return added;
  }

  async listOpportunities(opts: { passingOnly?: boolean } = {}): Promise<OpportunityView[]> {
    await this.load();
    const list = opts.passingOnly ? this.data.opportunities.filter((o) => o.passes) : this.data.opportunities;
    return [...list].sort((a, b) => b.score - a.score);
  }

  async clearOpportunities(): Promise<void> {
    await this.load();
    this.data.opportunities = [];
    await this.flush();
  }

  // --- watchlists (scheduled scans) ---

  async listWatchlists(): Promise<Watchlist[]> {
    await this.load();
    return [...this.data.watchlists];
  }

  async addWatchlist(w: Omit<Watchlist, "id" | "createdAt" | "enabled"> & { enabled?: boolean }): Promise<Watchlist> {
    await this.load();
    const watchlist: Watchlist = {
      ...w,
      id: `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      enabled: w.enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    this.data.watchlists.push(watchlist);
    await this.flush();
    return watchlist;
  }

  async updateWatchlist(id: string, patch: Partial<Watchlist>): Promise<Watchlist | undefined> {
    await this.load();
    const wl = this.data.watchlists.find((w) => w.id === id);
    if (!wl) return undefined;
    Object.assign(wl, patch);
    await this.flush();
    return wl;
  }

  async removeWatchlist(id: string): Promise<boolean> {
    await this.load();
    const before = this.data.watchlists.length;
    this.data.watchlists = this.data.watchlists.filter((w) => w.id !== id);
    const removed = this.data.watchlists.length < before;
    if (removed) await this.flush();
    return removed;
  }
}

/** Shared default store instance. */
export const store = new JsonStore();
