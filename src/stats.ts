/** Small numeric helpers for the calibration report (kept pure + testable). */

/** Ascending copy of `xs` (does not mutate the input). */
export const asc = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);

/**
 * Nearest-rank percentile of an ALREADY-ASCENDING array. p in 0..100.
 * Returns NaN for an empty array; p=50 on sorted data is the median-ish rank.
 */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Median of an unsorted array (0 for empty). The one true median impl. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = asc(xs);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Round to a step (e.g. 0.05, 5) without binary-float noise. */
export const round = (n: number, step: number): number => Number((Math.round(n / step) * step).toFixed(4));

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
