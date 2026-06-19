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

/**
 * A discovery sweep: a rotating list of broad keywords the watch loop cycles
 * through (round-robin, a few per tick) so the engine is always hunting the
 * "next thing" instead of only your fixed money-makers.
 */
export interface Sweep {
  id: string;
  label: string;
  keywords: string[];
  source: string;
  maxPrice?: number;
  thresholds?: { minMarginPct: number; minAbsoluteProfit: number; minMatchConfidence: number };
  intervalMin: number;
  /** how many keywords to run each due interval (round-robin) */
  perTick: number;
  /** rotation position into keywords */
  cursor: number;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastKeyword?: string;
  totalFound?: number;
}

export interface Settings {
  compSources?: string; // e.g. "ebay,google" or "auto"
  thresholds?: { minMarginPct: number; minAbsoluteProfit: number; minMatchConfidence: number };
  defaultSource?: string;
  watchIntervalMin?: number;
  /** set once we've auto-created the starter discovery sweep, so we never re-add it */
  seededDiscovery?: boolean;
}

/**
 * Cosmetic/game progression state that can't be derived from deals (the level,
 * gold, XP etc. ARE derived from the deals on the client). Only the player's
 * choices + claim records live here.
 */
export interface GameState {
  name?: string;
  classId?: "hunter" | "scrapper" | "merchant";
  claimedQuests?: string[]; // date-stamped quest ids the player has claimed
  bonusXp?: number; // XP granted by claimed quests (added on top of deal-derived XP)
  skills?: string[]; // unlocked skill ids (cost skill points earned by leveling)
  equipped?: string[]; // equipped relic ids (relics are earned from big flips)
  lastSeenLevel?: number; // for "level up" detection across sessions
}

interface StoreData {
  opportunities: OpportunityView[];
  watchlists: Watchlist[];
  sweeps: Sweep[];
  settings: Settings;
  game: GameState;
}

const MAX_OPPORTUNITIES = 1000;

export class JsonStore {
  private data: StoreData = { opportunities: [], watchlists: [], sweeps: [], settings: {}, game: {} };
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
        sweeps: Array.isArray(parsed.sweeps) ? parsed.sweeps : [],
        settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
        game: parsed.game && typeof parsed.game === "object" ? parsed.game : {},
      };
    } catch {
      this.data = { opportunities: [], watchlists: [], sweeps: [], settings: {}, game: {} }; // fresh store
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
   * Tags each with the source/query/time it was found. Returns the ones that
   * were newly added (not previously in the store) so callers can alert on them.
   */
  async saveOpportunities(
    opps: OpportunityView[],
    meta: { source: string; query: string },
  ): Promise<OpportunityView[]> {
    await this.load();
    const now = new Date().toISOString();
    const byId = new Map(this.data.opportunities.map((o) => [o.id, o]));
    const added: OpportunityView[] = [];
    for (const o of opps) {
      const prev = byId.get(o.id);
      // Re-scans refresh prices but must NOT wipe a tracked outcome.
      const tagged: OpportunityView = {
        ...o,
        source: meta.source,
        query: meta.query,
        savedAt: now,
        status: prev?.status ?? "new",
        boughtPrice: prev?.boughtPrice,
        soldPrice: prev?.soldPrice,
        actualProfit: prev?.actualProfit,
        statusAt: prev?.statusAt,
        notes: prev?.notes,
      };
      if (!prev) added.push(tagged);
      byId.set(o.id, tagged);
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

  /** Record a buy/sell/skip outcome on a saved opportunity (the feedback loop). */
  async setOpportunityOutcome(
    id: string,
    patch: { status?: string; boughtPrice?: number; soldPrice?: number; notes?: string },
  ): Promise<OpportunityView | undefined> {
    await this.load();
    const o = this.data.opportunities.find((x) => x.id === id);
    if (!o) return undefined;
    if (patch.status) o.status = patch.status as OpportunityView["status"];
    if (patch.boughtPrice != null) o.boughtPrice = Number(patch.boughtPrice);
    if (patch.soldPrice != null) o.soldPrice = Number(patch.soldPrice);
    if (patch.notes != null) o.notes = String(patch.notes);
    // realized profit once we know both ends (sale minus what you paid)
    if (o.soldPrice != null && o.boughtPrice != null) o.actualProfit = Math.round(o.soldPrice - o.boughtPrice);
    o.statusAt = new Date().toISOString();
    await this.flush();
    return o;
  }

  /** Create a deal by hand (e.g. snap-capture a thrift find from a phone photo). */
  async addManualOpportunity(input: { title?: string; image?: string; buy?: number; resale?: number; source?: string; url?: string }): Promise<OpportunityView> {
    await this.load();
    const buy = Math.max(0, Number(input.buy) || 0);
    const resale = Math.max(0, Number(input.resale) || 0);
    const fees = Math.round(resale * 0.13);
    const net = Math.round(resale - buy - fees);
    const now = new Date().toISOString();
    const o: OpportunityView = {
      id: `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: (input.title || "Snapped find").slice(0, 160),
      brand: null, model: null,
      image: input.image ?? null,
      url: input.url || "",
      location: null,
      buy, resale, resaleLow: resale, resaleHigh: resale, net,
      markets: [], marginPct: buy > 0 ? net / buy : 0, fees, shipping: 0,
      compCount: 0, matchConfidence: 1, identityConfidence: 1, condition: "unknown",
      score: 0.5, passes: false, flags: ["manual snap"],
      source: input.source || "snap", savedAt: now, status: "new", statusAt: now,
    };
    this.data.opportunities.unshift(o);
    if (this.data.opportunities.length > MAX_OPPORTUNITIES) this.data.opportunities.length = MAX_OPPORTUNITIES;
    await this.flush();
    return o;
  }

  /** Aggregate realized performance — what's actually paying. */
  async outcomeStats() {
    await this.load();
    const os = this.data.opportunities;
    const by = (s: string) => os.filter((o) => o.status === s);
    const sold = by("sold");
    const realized = sold.reduce((sum, o) => sum + (o.actualProfit ?? 0), 0);
    const wins = sold.filter((o) => (o.actualProfit ?? 0) > 0).length;
    const bySource: Record<string, { sold: number; profit: number }> = {};
    for (const o of sold) {
      const k = o.source ?? "?";
      (bySource[k] ??= { sold: 0, profit: 0 });
      bySource[k].sold++;
      bySource[k].profit += o.actualProfit ?? 0;
    }
    return {
      counts: { new: by("new").length, bought: by("bought").length, sold: sold.length, skipped: by("skipped").length },
      realizedProfit: realized,
      winRate: sold.length ? wins / sold.length : 0,
      bySource: Object.entries(bySource).map(([source, v]) => ({ source, ...v })).sort((a, b) => b.profit - a.profit),
    };
  }

  async clearOpportunities(): Promise<void> {
    await this.load();
    this.data.opportunities = [];
    await this.flush();
  }

  // --- settings (editable runtime config) ---

  async getSettings(): Promise<Settings> {
    await this.load();
    return { ...this.data.settings };
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    await this.load();
    this.data.settings = { ...this.data.settings, ...patch };
    await this.flush();
    return { ...this.data.settings };
  }

  // --- game (cosmetic progression state; level/gold/xp are derived from deals) ---

  async getGame(): Promise<GameState> {
    await this.load();
    return { ...this.data.game };
  }

  async setGame(patch: Partial<GameState>): Promise<GameState> {
    await this.load();
    this.data.game = { ...this.data.game, ...patch };
    await this.flush();
    return { ...this.data.game };
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

  // --- sweeps (discovery loop) ---

  async listSweeps(): Promise<Sweep[]> {
    await this.load();
    return [...this.data.sweeps];
  }

  async addSweep(
    s: Omit<Sweep, "id" | "createdAt" | "enabled" | "cursor"> & { enabled?: boolean },
  ): Promise<Sweep> {
    await this.load();
    const sweep: Sweep = {
      ...s,
      keywords: s.keywords.map((k) => k.trim()).filter(Boolean),
      perTick: Math.max(1, s.perTick || 1),
      cursor: 0,
      id: `sw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      enabled: s.enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    this.data.sweeps.push(sweep);
    await this.flush();
    return sweep;
  }

  async updateSweep(id: string, patch: Partial<Sweep>): Promise<Sweep | undefined> {
    await this.load();
    const sw = this.data.sweeps.find((s) => s.id === id);
    if (!sw) return undefined;
    Object.assign(sw, patch);
    await this.flush();
    return sw;
  }

  async removeSweep(id: string): Promise<boolean> {
    await this.load();
    const before = this.data.sweeps.length;
    this.data.sweeps = this.data.sweeps.filter((s) => s.id !== id);
    const removed = this.data.sweeps.length < before;
    if (removed) await this.flush();
    return removed;
  }
}

/** Shared default store instance. */
export const store = new JsonStore();
