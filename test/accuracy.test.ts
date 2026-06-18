import { test } from "node:test";
import assert from "node:assert/strict";
import { trimOutliers, referencePrice, computeMargin } from "../src/valuation/value.js";
import type { SoldComp } from "../src/types.js";

const comps = (prices: number[]): SoldComp[] =>
  prices.map((p, i) => ({ id: String(i), title: "x", soldPrice: p, currency: "USD", condition: "good", url: "u" }));

test("trimOutliers drops an absurd comp", () => {
  const kept = trimOutliers([95, 100, 105, 110, 2000]);
  assert.ok(!kept.includes(2000));
  assert.ok(kept.includes(100));
});

test("referencePrice ignores the outlier in the median", () => {
  // without trimming, the 2000 would drag a mean; median is robust but trim makes it tighter
  const ref = referencePrice(comps([90, 100, 110, 120, 5000]));
  assert.ok(ref <= 120, `expected <=120, got ${ref}`);
});

test("condition discount lowers resale when comps are nicer than the item", () => {
  const base = computeMargin(50, comps([100, 100, 100]), undefined, undefined, 0);
  const worse = computeMargin(50, comps([100, 100, 100]), undefined, undefined, 2); // comps 2 ranks better
  assert.equal(base.referencePrice, 100);
  assert.ok(worse.referencePrice < base.referencePrice, "resale should be discounted");
  assert.ok(worse.conditionDiscount > 0);
  assert.ok(worse.netProfit < base.netProfit);
});

test("no inflation when the item is nicer than its comps", () => {
  const better = computeMargin(50, comps([100, 100, 100]), undefined, undefined, -2);
  assert.equal(better.referencePrice, 100); // never bumped above comp median
  assert.equal(better.conditionDiscount, 0);
});
