import type { Margin } from "../valuation/value.js";

export interface ScoreInputs {
  margin: Margin;
  matchConfidence: number; // 0..1
  identityConfidence: number; // 0..1
  compCount: number;
  buyCostKnown: boolean;
}

export interface Thresholds {
  minMarginPct: number;
  minAbsoluteProfit: number;
  minMatchConfidence: number;
}

export const THRESHOLDS: Thresholds = {
  minMarginPct: Number(process.env.MIN_MARGIN_PCT ?? 0.25),
  minAbsoluteProfit: Number(process.env.MIN_ABSOLUTE_PROFIT ?? 20),
  minMatchConfidence: Number(process.env.MIN_MATCH_CONFIDENCE ?? 0.8),
};

/**
 * Composite 0..1 score blending profit, confidence, and liquidity, plus the
 * human-readable flags that explain (or kill) an opportunity.
 */
export function scoreOpportunity(i: ScoreInputs, t: Thresholds = THRESHOLDS) {
  const flags: string[] = [];

  if (!i.buyCostKnown) flags.push("buy price unknown — verify before acting");
  if (i.compCount < 3) flags.push("thin comps — low confidence in resale value");
  if (i.identityConfidence < 0.5) flags.push("weak product ID — photos may be ambiguous");
  if (i.margin.marginPct < t.minMarginPct) flags.push("below margin threshold");
  if (i.margin.netProfit < t.minAbsoluteProfit) flags.push("below absolute profit threshold");
  if (i.matchConfidence < t.minMatchConfidence) flags.push("below match-confidence threshold");

  // normalize each driver into 0..1
  const profitScore = clamp01(i.margin.netProfit / 100); // $100 net -> 1.0
  const marginScore = clamp01(i.margin.marginPct / 0.6); // 60% margin -> 1.0
  const liquidityScore = clamp01(i.compCount / 8); // 8+ comps -> 1.0
  const confidence = i.matchConfidence * i.identityConfidence;

  const score = clamp01(
    0.35 * profitScore + 0.25 * marginScore + 0.2 * liquidityScore + 0.2 * confidence,
  );

  const passes =
    i.margin.marginPct >= t.minMarginPct &&
    i.margin.netProfit >= t.minAbsoluteProfit &&
    i.matchConfidence >= t.minMatchConfidence;

  return { score, passes, flags };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
