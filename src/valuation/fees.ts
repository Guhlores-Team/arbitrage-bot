// eBay cost model. Defaults reflect typical non-store final value fees; adjust
// per category and your seller status. Keeping this isolated means margin math
// stays honest and tunable in one place.

export interface FeeConfig {
  finalValuePct: number; // e.g. 0.1325 (~13.25%)
  perOrderFee: number; // e.g. 0.40
  returnsReservePct: number; // hold-back for returns/loss, e.g. 0.04
}

export const DEFAULT_FEES: FeeConfig = {
  finalValuePct: 0.1325,
  perOrderFee: 0.4,
  returnsReservePct: 0.04,
};

/** Total fees+reserve eBay/selling will take on a sale at `sellPrice`. */
export function estimateFees(sellPrice: number, cfg: FeeConfig = DEFAULT_FEES): number {
  return sellPrice * cfg.finalValuePct + cfg.perOrderFee + sellPrice * cfg.returnsReservePct;
}

/** Rough shipping estimate. Replace with category/weight lookup when you have it. */
export function estimateShipping(category?: string): number {
  const heavy = ["furniture", "appliance", "tv", "monitor", "tool"];
  if (category && heavy.some((h) => category.toLowerCase().includes(h))) return 25;
  return 8;
}
