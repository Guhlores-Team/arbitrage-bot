import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { OpportunityView } from "../src/view.js";

const env = { ...process.env };
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.LLM_PROVIDER;
});
afterEach(() => {
  process.env = { ...env };
});

const { generateListing } = await import("../src/listing.js");

const opp = (over: Partial<OpportunityView> = {}): OpportunityView =>
  ({ id: "x", title: "Nintendo Switch OLED white", brand: "Nintendo", model: "Switch OLED", image: null, url: "u", location: null, buy: 120, resale: 250, resaleLow: 220, resaleHigh: 290, net: 90, marginPct: 0.36, fees: 30, shipping: 8, compCount: 6, matchConfidence: 0.9, identityConfidence: 0.9, condition: "good", score: 0.85, passes: true, markets: [], flags: [], ...over });

test("heuristic draft (no LLM key) produces a usable listing", async () => {
  const d = await generateListing(opp());
  assert.ok(d.title.length > 0 && d.title.length <= 80);
  assert.match(d.title, /Nintendo/);
  assert.equal(d.price, 250); // suggested from resale point
  assert.ok(d.description.length > 0);
});

test("title is clamped to eBay's 80-char limit", async () => {
  const long = "A".repeat(200);
  const d = await generateListing(opp({ title: long, brand: null, model: null }));
  assert.ok(d.title.length <= 80);
});
