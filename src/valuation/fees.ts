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

/** Category-adjusted fee config — eBay's final-value fee varies by category. */
export function categoryFees(category?: string, base: FeeConfig = DEFAULT_FEES): FeeConfig {
  const c = (category ?? "").toLowerCase();
  const media = ["book", "textbook", "dvd", "blu-ray", "blu ray", "cd", "vinyl", "record", "movie"];
  if (media.some((m) => c.includes(m))) return { ...base, finalValuePct: 0.1495 }; // media FVF is higher
  return base;
}

/**
 * Shipping estimate by category. Bulky goods are effectively freight/local-only
 * (a high number correctly kills mail-resale margin); small goods ship cheap.
 */
export function estimateShipping(category?: string): number {
  const c = (category ?? "").toLowerCase();
  const has = (arr: string[]) => arr.some((h) => c.includes(h));
  if (has(["furniture", "couch", "sofa", "mattress", "appliance", "refrigerator", "washer", "dryer", "treadmill", "tv", "television", "peloton"])) return 45;
  if (has(["console", "playstation", "xbox", "monitor", "speaker", "amplifier", "vacuum", "mixer", "printer", "guitar", "stroller"])) return 18;
  if (has(["card", "game", "jewelry", "watch", "phone", "airpod", "earbud", "sunglass", "ring"])) return 5;
  if (has(["book", "dvd", "blu", "vinyl", "record"])) return 4;
  return 9;
}
