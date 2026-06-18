import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, computeMargin } from "../src/valuation/value.js";
import type { SoldComp } from "../src/types.js";

const comps = (prices: number[], market = "ebay"): SoldComp[] =>
  prices.map((p, i) => ({ id: `${market}${i}`, title: "x", soldPrice: p, currency: "USD", condition: "good", url: "u", market }));

test("percentile picks the right ranked value", () => {
  const xs = [10, 20, 30, 40, 50];
  assert.equal(percentile(xs, 0), 10);
  assert.equal(percentile(xs, 0.5), 30);
  assert.equal(percentile(xs, 1), 50);
});

test("computeMargin returns a low<=mid<=high resale range", () => {
  const m = computeMargin(50, comps([80, 100, 120, 140, 160, 180]));
  assert.ok(m.resaleLow <= m.resaleMid, `${m.resaleLow} <= ${m.resaleMid}`);
  assert.ok(m.resaleMid <= m.resaleHigh, `${m.resaleMid} <= ${m.resaleHigh}`);
  assert.ok(m.spread > 0);
});

test("net is based on a conservative point at/below the median", () => {
  const m = computeMargin(50, comps([80, 100, 120, 140, 160, 180]));
  assert.ok(m.referencePrice <= m.resaleMid, "conservative reference should not exceed median");
});

test("tight comps -> small spread; scattered comps -> large spread", () => {
  const tight = computeMargin(10, comps([100, 101, 99, 100, 102, 98]));
  const wide = computeMargin(10, comps([40, 80, 120, 200, 260, 320]));
  assert.ok(wide.spread > tight.spread);
});
