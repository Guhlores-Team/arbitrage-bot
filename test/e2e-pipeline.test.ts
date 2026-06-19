import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runPipelineDetailed } from "../src/pipeline.js";
import type { SourceConnector, CompConnector } from "../src/connectors/connector.js";
import type { SourceListing, SoldComp } from "../src/types.js";
import type { Thresholds } from "../src/scoring/score.js";

// Force the offline identify/match heuristics so the e2e path is deterministic
// (no network, no LLM). Save + restore so we don't disturb other suites.
const LLM_KEYS = ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "LLM_PROVIDER"];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of LLM_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of LLM_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const GENEROUS: Thresholds = { minMarginPct: 0.05, minAbsoluteProfit: 1, minMatchConfidence: 0.5 };

function listing(over: Partial<SourceListing> = {}): SourceListing {
  return {
    id: "L1",
    source: "demo",
    rawTitle: "Nintendo Switch OLED console",
    price: 120,
    currency: "USD",
    imageUrls: [],
    url: "https://example.com/L1",
    fetchedAt: new Date().toISOString(),
    ...over,
  };
}

function comp(soldPrice: number, id: string, title = "Nintendo Switch OLED"): SoldComp {
  return { id, title, soldPrice, currency: "USD", condition: "good", url: "https://ebay/" + id, market: "ebay" };
}

class StubSource implements SourceConnector {
  readonly source = "demo";
  constructor(private listings: SourceListing[]) {}
  async search() {
    return this.listings;
  }
}

class StubComp implements CompConnector {
  readonly market = "ebay";
  constructor(
    private comps: SoldComp[],
    readonly basis: "sold" | "ask" | "mock" = "sold",
  ) {}
  async getSoldComps() {
    return this.comps;
  }
}

const comps250 = [comp(240, "c1"), comp(250, "c2"), comp(260, "c3")];

test("e2e happy path: cheap listing vs higher comps -> a passing opportunity", async () => {
  const { opportunities, stats } = await runPipelineDetailed(
    new StubSource([listing({ price: 120 })]),
    new StubComp(comps250),
    { query: "switch" },
    { thresholds: GENEROUS },
  );
  assert.equal(stats.listings, 1);
  assert.equal(stats.compLookups, 1);
  assert.equal(stats.scored, 1);
  assert.equal(stats.passed, 1);
  assert.equal(opportunities.length, 1);
  assert.ok(opportunities[0].netProfit > 0);
  assert.ok(!opportunities[0].flags.includes("DOES NOT PASS THRESHOLDS"));
});

test("edge: no listings -> empty result, zeroed funnel", async () => {
  const { opportunities, stats } = await runPipelineDetailed(new StubSource([]), new StubComp(comps250), { query: "x" });
  assert.equal(opportunities.length, 0);
  assert.equal(stats.listings, 0);
  assert.equal(stats.compLookups, 0);
});

test("edge: everything over the hard price cap is priced out before any comp call", async () => {
  const { opportunities, stats } = await runPipelineDetailed(
    new StubSource([listing({ id: "a", price: 500 }), listing({ id: "b", price: 600 })]),
    new StubComp(comps250),
    { query: "x" },
    { hardPriceCap: 200 },
  );
  assert.equal(opportunities.length, 0);
  assert.equal(stats.pricedOut, 2);
  assert.equal(stats.compLookups, 0); // never paid for comps
});

test("edge: no comps available -> counted as noComps, no opportunity", async () => {
  const { opportunities, stats } = await runPipelineDetailed(new StubSource([listing()]), new StubComp([]), { query: "x" });
  assert.equal(opportunities.length, 0);
  assert.equal(stats.noComps, 1);
});

test("edge: asking >= median comp -> skipped as no headroom", async () => {
  const { opportunities, stats } = await runPipelineDetailed(
    new StubSource([listing({ price: 300 })]), // median is 250
    new StubComp(comps250),
    { query: "x" },
  );
  assert.equal(opportunities.length, 0);
  assert.equal(stats.askAboveMedian, 1);
});

test("edge: comps that don't match the product -> noMatch", async () => {
  const unrelated = [comp(250, "u1", "Apple iPhone 14 Pro"), comp(260, "u2", "Dyson V11 vacuum")];
  const { opportunities, stats } = await runPipelineDetailed(new StubSource([listing()]), new StubComp(unrelated), { query: "x" });
  assert.equal(opportunities.length, 0);
  assert.equal(stats.noMatch, 1);
});

test("edge: malformed comp prices (NaN/0/negative) are dropped, valid ones still value", async () => {
  const messy = [comp(Number.NaN, "n1"), comp(0, "z1"), comp(-50, "neg"), comp(250, "ok")];
  const { opportunities, stats } = await runPipelineDetailed(
    new StubSource([listing({ price: 120 })]),
    new StubComp(messy),
    { query: "x" },
    { thresholds: GENEROUS },
  );
  assert.equal(stats.scored, 1);
  assert.equal(opportunities.length, 1);
  assert.ok(Number.isFinite(opportunities[0].netProfit));
});

test("flags: mock-basis comps surface the 'not real resale data' flag", async () => {
  const { opportunities } = await runPipelineDetailed(
    new StubSource([listing({ price: 120 })]),
    new StubComp(comps250, "mock"),
    { query: "x" },
    { thresholds: GENEROUS },
  );
  assert.equal(opportunities.length, 1);
  assert.ok(opportunities[0].flags.some((f) => f.includes("mock comps")));
});

test("stress: 2000 listings complete, are scored, and come back sorted by score", async () => {
  const many = Array.from({ length: 2000 }, (_, i) => listing({ id: "L" + i, price: 100 + (i % 50) }));
  const { opportunities, stats } = await runPipelineDetailed(
    new StubSource(many),
    new StubComp(comps250),
    { query: "x" },
    { thresholds: GENEROUS },
  );
  assert.equal(stats.listings, 2000);
  assert.equal(opportunities.length, 2000);
  for (let i = 1; i < opportunities.length; i++) {
    assert.ok(opportunities[i - 1].score >= opportunities[i].score, "results must be sorted desc by score");
  }
  assert.ok(stats.durationMs >= 0);
});
