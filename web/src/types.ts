// Mirrors the fields of the engine's OpportunityView (src/view.ts) that the
// dashboard renders. The API returns the full object; we type the subset we use.
export type Stage = "new" | "bought" | "sold" | "skipped";

export interface Deal {
  id: string;
  title: string;
  source?: string;
  url: string;
  image?: string | null;
  location?: string | null;
  buy: number;
  resale: number;
  net: number;
  marginPct: number;
  compCount?: number;
  matchConfidence?: number;
  score?: number;
  status?: Stage;
  boughtPrice?: number;
  soldPrice?: number;
  actualProfit?: number;
  statusAt?: string;
  notes?: string;
  flags?: string[];
}

/** "LOT ×12" extracted from a deal's flags, if present. */
export function lotFlag(flags?: string[]): string | null {
  const f = (flags ?? []).find((x) => x.startsWith("LOT"));
  return f ? f.split(" — ")[0] : null;
}

export type View = "ledger" | "hunt" | "realms" | "party" | "quests" | "classv" | "boss" | "hoard" | "war" | "bestiary";

export type ClassId = "hunter" | "scrapper" | "merchant";

export interface Game {
  name?: string;
  classId?: ClassId;
  claimedQuests?: string[];
  bonusXp?: number;
  skills?: string[];
  equipped?: string[];
  lastSeenLevel?: number;
}

export interface OutcomePatch {
  status?: Stage;
  boughtPrice?: number | null;
  soldPrice?: number | null; // null/empty clears it (undo a sale)
  notes?: string;
}

export interface SourceHealth {
  source: string;
  ready: boolean;
  note: string;
}

export interface Thresholds { minMarginPct: number; minAbsoluteProfit: number; minMatchConfidence: number; }
export interface Settings { compSources?: string; defaultSource?: string; thresholds?: Thresholds; }
export interface Watchlist { id: string; query: string; source: string; maxPrice?: number; intervalMin: number; enabled: boolean; lastRunAt?: string; lastFoundCount?: number; }
export interface Sweep { id: string; label: string; keywords: string[]; source: string; intervalMin: number; perTick: number; enabled: boolean; totalFound?: number; lastKeyword?: string; }
