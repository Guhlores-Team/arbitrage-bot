import { test } from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "../src/types.ts";
import { levelFromXp, computeHero, computeBoss, computeQuests, buffsFrom, relicsOwned } from "../src/progression.ts";

const deal = (p: Partial<Deal>): Deal => ({
  id: Math.random().toString(36).slice(2), title: "x", url: "", buy: 10, resale: 30,
  net: 15, marginPct: 0.5, ...p,
});
const todayISO = () => new Date().toISOString();

test("levelFromXp: rising curve, level 1 at 0 xp", () => {
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(99).level, 1);
  assert.equal(levelFromXp(100).level, 2);
  assert.ok(levelFromXp(100000).level > levelFromXp(1000).level);
});

test("computeHero: gold = realized P/L (sum of sold net), unaffected by class mult", () => {
  const deals = [
    deal({ status: "sold", actualProfit: 40, statusAt: todayISO() }),
    deal({ status: "sold", actualProfit: 60, statusAt: todayISO() }),
    deal({ status: "new" }),
  ];
  const hunter = computeHero(deals, 0, buffsFrom("hunter", [], []));
  const merchant = computeHero(deals, 0, buffsFrom("merchant", [], []));
  assert.equal(hunter.gold, 100); // 40 + 60, honest money
  assert.equal(merchant.gold, 100); // class never inflates real P/L
  assert.ok(merchant.gems >= hunter.gems); // merchant only changes the game layer
});

test("computeHero: streak counts trailing profitable sells", () => {
  const deals = [
    deal({ status: "sold", actualProfit: 10, statusAt: "2026-01-01T00:00:00Z" }),
    deal({ status: "sold", actualProfit: -5, statusAt: "2026-01-02T00:00:00Z" }),
    deal({ status: "sold", actualProfit: 20, statusAt: "2026-01-03T00:00:00Z" }),
  ];
  assert.equal(computeHero(deals, 0, buffsFrom("hunter", [], [])).streak, 1);
});

test("buffsFrom: class + skills + relics stack multiplicatively/additively", () => {
  const base = buffsFrom("scrapper", [], []); // +25% xp
  assert.ok(base.xpMult >= 1.25);
  const boosted = buffsFrom("scrapper", ["appraiser"], ["goldfang"]); // +10% +10% xp
  assert.ok(boosted.xpMult > base.xpMult);
});

test("relicsOwned: only Epic+ flips (net ≥ 75) drop relics", () => {
  assert.equal(relicsOwned([deal({ status: "sold", actualProfit: 40 })]).length, 0);
  assert.ok(relicsOwned([deal({ status: "sold", actualProfit: 120 })]).length >= 1);
});

test("computeBoss: damage = this week's realized profit × boss mult", () => {
  const deals = [deal({ status: "sold", actualProfit: 100, statusAt: todayISO() })];
  const boss = computeBoss(deals, 1);
  assert.equal(boss.damage, 100);
  assert.ok(boss.maxHp > 0 && boss.hp >= 0);
});

test("computeQuests: 'flip 3' tracks today's sells and becomes claimable", () => {
  const deals = [1, 2, 3].map(() => deal({ status: "sold", actualProfit: 10, statusAt: todayISO() }));
  const q = computeQuests(deals, []).find((x) => x.key === "flip3")!;
  assert.equal(q.progress, 3);
  assert.equal(q.claimable, true);
  const claimed = computeQuests(deals, [q.id]).find((x) => x.key === "flip3")!;
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.claimable, false);
});
