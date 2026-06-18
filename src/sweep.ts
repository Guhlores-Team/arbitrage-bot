/**
 * Discovery sweeps: rotate through broad keywords so the engine is always
 * hunting the "next thing", not just your fixed watchlists.
 */

/** Proven flip categories — a sensible default sweep so discovery works day one. */
export const STARTER_KEYWORDS: string[] = [
  "nintendo switch",
  "ps5 console",
  "xbox series x",
  "lego set sealed",
  "dyson vacuum",
  "kitchenaid mixer",
  "dewalt drill",
  "milwaukee m18",
  "airpods pro",
  "apple watch",
  "ipad",
  "macbook",
  "dji drone",
  "gopro",
  "instant pot",
  "vitamix",
  "sony headphones",
  "bose speaker",
  "the north face jacket",
  "carhartt",
  "rtx graphics card",
  "mechanical keyboard",
  "cast iron lodge",
  "power tools lot",
  "canon camera lens",
];

/**
 * Round-robin selection of the next `perTick` keywords starting at `cursor`,
 * wrapping around the list. Returns the batch and the next cursor position.
 * Pure + deterministic so the rotation is unit-testable.
 */
export function pickSweepBatch(
  keywords: string[],
  cursor: number,
  perTick: number,
): { batch: string[]; nextCursor: number } {
  const n = keywords.length;
  if (n === 0) return { batch: [], nextCursor: 0 };
  const take = Math.min(Math.max(1, perTick), n);
  const start = ((cursor % n) + n) % n; // normalize negative / overflow
  const batch: string[] = [];
  for (let i = 0; i < take; i++) batch.push(keywords[(start + i) % n]);
  return { batch, nextCursor: (start + take) % n };
}
