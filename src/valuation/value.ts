import type { SoldComp } from "../types.js";
import { estimateFees, estimateShipping, categoryFees, type FeeConfig } from "./fees.js";

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

/** Percentile of an unsorted array via nearest-rank (p in 0..1). */
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.round((s.length - 1) * Math.max(0, Math.min(1, p)));
  return s[idx];
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

/**
 * The conservative percentile of the resale range we use for the profit calc.
 * Slightly below median so a deal has to clear the bar on a *pessimistic* sale
 * price, not a best-case one. Tunable via RESALE_PERCENTILE (0..1).
 */
const RESALE_PCT = clampUnit(Number(process.env.RESALE_PERCENTILE ?? 0.4), 0.4);

export interface Margin {
  /** conservative, condition-adjusted resale used for the net calc */
  referencePrice: number;
  /** resale RANGE across the (trimmed, condition-adjusted) comps */
  resaleLow: number;
  resaleMid: number;
  resaleHigh: number;
  /** (high-low)/mid — how dispersed the comps are (uncertainty signal) */
  spread: number;
  estimatedFees: number;
  estimatedShipping: number;
  netProfit: number;
  marginPct: number;
  /** how much the condition gap discounted the comps (0 = none) */
  conditionDiscount: number;
}

/**
 * A price gap is NOT profit. Net out fees, shipping, and your buy cost — and
 * value against a price RANGE, not one number.
 *
 * We trim outlier comps, take low/median/high percentiles, and base the profit
 * on a conservative point (RESALE_PERCENTILE, default p40) so we don't sell the
 * deal on a best-case price. `conditionDelta` (signed median of comp rank −
 * item rank from the match step) discounts the whole range when the comps are
 * nicer than the item; we never inflate when the item is the nicer one.
 */
export function computeMargin(
  buyCost: number,
  comps: SoldComp[],
  category?: string,
  fees?: FeeConfig,
  conditionDelta = 0,
  quantity = 1,
): Margin {
  const trimmed = trimOutliers(comps.map((c) => c.soldPrice));
  const discount = conditionDelta > 0 ? Math.max(0, 1 - conditionDelta * CONDITION_STEP) : 1;
  const adj = (x: number) => Math.round(x * discount);

  const rawMid = median(trimmed);
  const resaleLow = adj(percentile(trimmed, 0.25));
  const resaleMid = adj(rawMid);
  const resaleHigh = adj(percentile(trimmed, 0.75));
  const ref = adj(percentile(trimmed, RESALE_PCT)); // conservative point for net (per item)
  const spread = resaleMid > 0 ? (resaleHigh - resaleLow) / resaleMid : 0;

  // Lots resell per item: value each unit (resale − fees − shipping), times the
  // quantity, then subtract the single lot buy price. qty=1 = normal single item.
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const cfg = fees ?? categoryFees(category);
  const fPer = estimateFees(ref, cfg);
  const shipPer = estimateShipping(category);
  const net = (ref - fPer - shipPer) * qty - buyCost;
  return {
    referencePrice: ref * qty,
    resaleLow: resaleLow * qty,
    resaleMid: resaleMid * qty,
    resaleHigh: resaleHigh * qty,
    spread,
    estimatedFees: fPer * qty,
    estimatedShipping: shipPer * qty,
    netProfit: net,
    marginPct: ref * qty > 0 ? net / (ref * qty) : 0,
    conditionDiscount: Math.round(rawMid) - resaleMid,
  };
}

function clampUnit(n: number, fallback: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.12;
}
