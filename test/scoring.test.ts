import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreOpportunity, type Thresholds } from "../src/scoring/score.js";
import type { Margin } from "../src/valuation/value.js";

const T: Thresholds = { minMarginPct: 0.25, minAbsoluteProfit: 20, minMatchConfidence: 0.8 };

const margin = (netProfit: number, marginPct: number): Margin => ({
  referencePrice: 100,
  estimatedFees: 15,
  estimatedShipping: 8,
  netProfit,
  marginPct,
});

test("a strong opportunity passes with no killing flags", () => {
  const r = scoreOpportunity(
    { margin: margin(60, 0.5), matchConfidence: 0.9, identityConfidence: 0.9, compCount: 8, buyCostKnown: true },
    T,
  );
  assert.equal(r.passes, true);
  assert.ok(r.score > 0.6);
  assert.ok(!r.flags.includes("below margin threshold"));
});

test("below-threshold margin fails and is flagged", () => {
  const r = scoreOpportunity(
    { margin: margin(60, 0.1), matchConfidence: 0.9, identityConfidence: 0.9, compCount: 8, buyCostKnown: true },
    T,
  );
  assert.equal(r.passes, false);
  assert.ok(r.flags.includes("below margin threshold"));
});

test("low match confidence fails and is flagged", () => {
  const r = scoreOpportunity(
    { margin: margin(60, 0.5), matchConfidence: 0.5, identityConfidence: 0.9, compCount: 8, buyCostKnown: true },
    T,
  );
  assert.equal(r.passes, false);
  assert.ok(r.flags.includes("below match-confidence threshold"));
});

test("thin comps and unknown buy price raise advisory flags", () => {
  const r = scoreOpportunity(
    { margin: margin(60, 0.5), matchConfidence: 0.9, identityConfidence: 0.9, compCount: 2, buyCostKnown: false },
    T,
  );
  assert.ok(r.flags.includes("thin comps — low confidence in resale value"));
  assert.ok(r.flags.includes("buy price unknown — verify before acting"));
});

test("score stays within 0..1", () => {
  const r = scoreOpportunity(
    { margin: margin(100000, 100), matchConfidence: 1, identityConfidence: 1, compCount: 1000, buyCostKnown: true },
    T,
  );
  assert.ok(r.score >= 0 && r.score <= 1);
});
