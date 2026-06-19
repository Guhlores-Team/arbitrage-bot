import { test } from "node:test";
import assert from "node:assert/strict";
import { referencePrice, computeMargin } from "../src/valuation/value.js";
import { estimateFees, estimateShipping, DEFAULT_FEES } from "../src/valuation/fees.js";
import type { SoldComp } from "../src/types.js";

const comp = (soldPrice: number, id = String(soldPrice)): SoldComp => ({
  id,
  title: "x",
  soldPrice,
  currency: "USD",
  condition: "good",
  url: "https://e.bay",
});

test("referencePrice: median of odd count", () => {
  assert.equal(referencePrice([comp(10), comp(30), comp(20)]), 20);
});

test("referencePrice: median of even count averages middle two", () => {
  assert.equal(referencePrice([comp(10), comp(20), comp(30), comp(40)]), 25);
});

test("referencePrice: empty -> 0", () => {
  assert.equal(referencePrice([]), 0);
});

test("estimateFees: final value + per-order + returns reserve", () => {
  const f = estimateFees(100);
  const expected = 100 * DEFAULT_FEES.finalValuePct + DEFAULT_FEES.perOrderFee + 100 * DEFAULT_FEES.returnsReservePct;
  assert.equal(f, expected);
});

test("estimateShipping: bulky freight, small ships cheap, sane default", () => {
  assert.equal(estimateShipping("furniture"), 45);
  assert.equal(estimateShipping("video games"), 5);
  assert.equal(estimateShipping(undefined), 9);
});

test("computeMargin: net = resale - fees - shipping - buy", () => {
  const comps = [comp(100), comp(100), comp(100)];
  const m = computeMargin(40, comps, "video games");
  assert.equal(m.referencePrice, 100);
  const fees = estimateFees(100);
  assert.equal(m.estimatedFees, fees);
  assert.equal(m.estimatedShipping, 5);
  assert.equal(m.netProfit, 100 - fees - 5 - 40);
  assert.ok(Math.abs(m.marginPct - m.netProfit / 100) < 1e-9);
});

test("computeMargin: a lot is valued as qty × per-item, minus one buy", () => {
  const comps = [comp(20), comp(20), comp(20)]; // $20/item
  const single = computeMargin(50, comps, "video games");
  const lot = computeMargin(50, comps, "video games", undefined, 0, 20); // 20-game lot for $50
  assert.equal(lot.referencePrice, single.referencePrice * 20);
  const perItemNet = 20 - estimateFees(20) - 5;
  assert.ok(Math.abs(lot.netProfit - (perItemNet * 20 - 50)) < 1e-9);
  assert.ok(lot.netProfit > single.netProfit, "a 20-item lot should net more than a single item");
});

test("computeMargin: zero reference -> zero margin pct, no divide-by-zero", () => {
  const m = computeMargin(40, [], undefined);
  assert.equal(m.referencePrice, 0);
  assert.equal(m.marginPct, 0);
});
