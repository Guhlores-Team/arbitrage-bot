import { test } from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "../src/types.ts";
import { dealNet, dealRoi, rarity, money, median } from "../src/lib.ts";

const deal = (p: Partial<Deal>): Deal => ({
  id: "1", title: "x", url: "", buy: 50, resale: 100, net: 30, marginPct: 0.3, ...p,
});

test("dealNet: realized actualProfit once sold", () => {
  assert.equal(dealNet(deal({ status: "sold", actualProfit: 42 })), 42);
});

test("dealNet: trusts the engine's net for un-sold deals (not a flat-fee recompute)", () => {
  // engine net=30 must win over any client recompute of resale*(1-FEE)-buy
  assert.equal(dealNet(deal({ status: "new", net: 30 })), 30);
});

test("dealNet: falls back to an estimate only when the engine gave no net", () => {
  const d = deal({ status: "new", resale: 100, buy: 50 });
  delete (d as Partial<Deal>).net;
  assert.equal(dealNet(d), Math.round(100 * 0.82 - 50));
});

test("dealRoi: net over buy", () => {
  assert.equal(dealRoi(deal({ net: 30, buy: 60, status: "new" })), 0.5);
});

test("rarity: net thresholds", () => {
  assert.equal(rarity(120)[0], "Legendary");
  assert.equal(rarity(80)[0], "Epic");
  assert.equal(rarity(10)[0], "Common");
});

test("money + median helpers", () => {
  assert.equal(money(-5), "-$5");
  assert.equal(money(1500), "$1,500");
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), 0);
});
