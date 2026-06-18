import type { SoldComp } from "../types.js";
import { estimateFees, estimateShipping, type FeeConfig } from "./fees.js";

/** Discount applied per condition rank the item sits BELOW its comps (tunable). */
const CONDITION_STEP = clamp01(Number(process.env.CONDITION_STEP_PCT ?? 0.12));

/** Drop comps outside 1.5×IQR — guards against a mis-matched comp skewing value. */
export function trimOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices; // too few to judge outliers
  const s = [...prices].sort((a, b) => a - b);
  const q = (p: number) => s[Math.floor((s.length - 1) * p)];
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const kept = s.filter((x) => x >= lo && x <= hi);
  return kept.length ? kept : s;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median sold price across matched comps, after trimming outliers. */
export function referencePrice(comps: SoldComp[]): number {
  return median(trimOutliers(comps.map((c) => c.soldPrice)));
}

export interface Margin {
  referencePrice: number;
  estimatedFees: number;
  estimatedShipping: number;
  netProfit: number;
  marginPct: number;
  /** how much the condition gap discounted the raw comp median (0 = none) */
  conditionDiscount: number;
}

/**
 * A price gap is NOT profit. Net out fees, shipping, and your buy cost.
 *
 * `conditionDelta` is the signed median of (comp rank − item rank) from the
 * match step: positive means the comps are in BETTER shape than the item, so we
 * discount the resale estimate (a "good" unit won't fetch a "like-new" price).
 * We never inflate when the item is the nicer one — that stays conservative.
 *
 * marginPct is relative to the resale price so it's comparable across items.
 */
export function computeMargin(
  buyCost: number,
  comps: SoldComp[],
  category?: string,
  fees?: FeeConfig,
  conditionDelta = 0,
): Margin {
  const raw = referencePrice(comps);
  const discountFactor = conditionDelta > 0 ? Math.max(0, 1 - conditionDelta * CONDITION_STEP) : 1;
  const ref = Math.round(raw * discountFactor);

  const f = estimateFees(ref, fees);
  const ship = estimateShipping(category);
  const net = ref - f - ship - buyCost;
  return {
    referencePrice: ref,
    estimatedFees: f,
    estimatedShipping: ship,
    netProfit: net,
    marginPct: ref > 0 ? net / ref : 0,
    conditionDiscount: raw - ref,
  };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.12;
}
