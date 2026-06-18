import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/store.js";
import type { OpportunityView } from "../src/view.js";

const fresh = () => new JsonStore(join(tmpdir(), `arb-out-${Date.now()}-${Math.random().toString(36).slice(2)}.json`));
const opp = (id: string, over: Partial<OpportunityView> = {}): OpportunityView =>
  ({ id, title: id, brand: null, model: null, image: null, url: "u", location: null, buy: 50, resale: 120, resaleLow: 100, resaleHigh: 140, net: 40, marginPct: 0.3, fees: 15, shipping: 8, compCount: 5, matchConfidence: 0.9, identityConfidence: 0.9, condition: "good", score: 0.8, passes: true, markets: [], flags: [], ...over });

test("new saves default to status 'new'", async () => {
  const s = fresh();
  await s.saveOpportunities([opp("a")], { source: "offerup", query: "x" });
  const list = await s.listOpportunities();
  assert.equal(list[0].status, "new");
});

test("setOpportunityOutcome records buy/sell and computes realized profit", async () => {
  const s = fresh();
  await s.saveOpportunities([opp("a")], { source: "offerup", query: "x" });
  await s.setOpportunityOutcome("a", { status: "bought", boughtPrice: 40 });
  await s.setOpportunityOutcome("a", { status: "sold", soldPrice: 130 });
  const o = (await s.listOpportunities()).find((x) => x.id === "a")!;
  assert.equal(o.status, "sold");
  assert.equal(o.actualProfit, 90); // 130 - 40
});

test("re-scan refreshes price but preserves the tracked outcome", async () => {
  const s = fresh();
  await s.saveOpportunities([opp("a", { buy: 50 })], { source: "offerup", query: "x" });
  await s.setOpportunityOutcome("a", { status: "bought", boughtPrice: 40 });
  // a later scan finds the same listing again at a new price
  await s.saveOpportunities([opp("a", { buy: 45 })], { source: "offerup", query: "x" });
  const o = (await s.listOpportunities()).find((x) => x.id === "a")!;
  assert.equal(o.buy, 45); // price refreshed
  assert.equal(o.status, "bought"); // outcome preserved, not reset to "new"
  assert.equal(o.boughtPrice, 40);
});

test("outcomeStats aggregates realized profit, win rate, and by-source", async () => {
  const s = fresh();
  await s.saveOpportunities([opp("a"), opp("b"), opp("c")], { source: "offerup", query: "x" });
  await s.saveOpportunities([opp("d")], { source: "mercari", query: "y" });
  await s.setOpportunityOutcome("a", { status: "sold", boughtPrice: 40, soldPrice: 130 }); // +90
  await s.setOpportunityOutcome("b", { status: "sold", boughtPrice: 60, soldPrice: 50 }); // -10 (loss)
  await s.setOpportunityOutcome("c", { status: "bought", boughtPrice: 30 });
  const st = await s.outcomeStats();
  assert.equal(st.counts.sold, 2);
  assert.equal(st.counts.bought, 1);
  assert.equal(st.realizedProfit, 80); // 90 - 10
  assert.equal(st.winRate, 0.5); // 1 of 2 sold was a win
  assert.equal(st.bySource.find((x) => x.source === "offerup")?.profit, 80);
});
