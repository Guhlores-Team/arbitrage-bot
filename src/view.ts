import type { Opportunity } from "./types.js";

/** Flat, JSON-friendly opportunity shape used by the API, store, and dashboard. */
export interface OpportunityView {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  image: string | null;
  url: string;
  location: string | null;
  buy: number;
  resale: number; // mid/point estimate (back-compat)
  resaleLow: number;
  resaleHigh: number;
  net: number;
  markets: { market: string; count: number; median: number }[];
  marginPct: number;
  fees: number;
  shipping: number;
  compCount: number;
  matchConfidence: number;
  identityConfidence: number;
  condition: string;
  score: number;
  passes: boolean;
  flags: string[];
  /** set when persisted (store/feed); omitted on fresh scan results. */
  source?: string;
  query?: string;
  savedAt?: string;
}

export function toOpportunityView(o: Opportunity): OpportunityView {
  return {
    id: o.sourceListing.id,
    title: o.sourceListing.rawTitle,
    brand: o.identity.brand ?? null,
    model: o.identity.model ?? null,
    image: o.sourceListing.imageUrls[0] ?? null,
    url: o.sourceListing.url,
    location: o.sourceListing.location ?? null,
    buy: o.sourceListing.price,
    resale: o.resaleMid,
    resaleLow: o.resaleLow,
    resaleHigh: o.resaleHigh,
    net: Math.round(o.netProfit),
    markets: o.marketBreakdown,
    marginPct: o.marginPct,
    fees: Math.round(o.estimatedFees),
    shipping: o.estimatedShipping,
    compCount: o.compCount,
    matchConfidence: o.matchConfidence,
    identityConfidence: o.identity.confidence,
    condition: o.identity.condition,
    score: o.score,
    passes: !o.flags.includes("DOES NOT PASS THRESHOLDS"),
    flags: o.flags,
  };
}
