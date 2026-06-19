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
  notes?: string;
}

export type View = "ledger" | "hunt";

export interface OutcomePatch {
  status?: Stage;
  boughtPrice?: number;
  soldPrice?: number;
  notes?: string;
}
