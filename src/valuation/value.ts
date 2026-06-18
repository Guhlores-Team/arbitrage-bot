import type { SoldComp } from "../types.js";
import { estimateFees, estimateShipping, type FeeConfig } from "./fees.js";

/** Median sold price across matched comps — the reference resale value. */
export function referencePrice(comps: SoldComp[]): number {
  if (comps.length === 0) return 0;
  const sorted = comps.map((c) => c.soldPrice).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface Margin {
  referencePrice: number;
  estimatedFees: number;
  estimatedShipping: number;
  netProfit: number;
  marginPct: number;
}

/**
 * A price gap is NOT profit. Net out fees, shipping, and your buy cost.
 * marginPct is relative to the resale price so it's comparable across items.
 */
export function computeMargin(
  buyCost: number,
  comps: SoldComp[],
  category?: string,
  fees?: FeeConfig,
): Margin {
  const ref = referencePrice(comps);
  const f = estimateFees(ref, fees);
  const ship = estimateShipping(category);
  const net = ref - f - ship - buyCost;
  return {
    referencePrice: ref,
    estimatedFees: f,
    estimatedShipping: ship,
    netProfit: net,
    marginPct: ref > 0 ? net / ref : 0,
  };
}
