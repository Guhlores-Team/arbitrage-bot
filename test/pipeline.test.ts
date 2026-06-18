import { test } from "node:test";
import assert from "node:assert/strict";

// Fully offline: demo source + eBay mock comps + heuristic identify/match.
delete process.env.ANTHROPIC_API_KEY;
process.env.EBAY_USE_MOCK_COMPS = "true";

const { runPipeline } = await import("../src/pipeline.js");
const { MockSourceConnector } = await import("../src/connectors/mock.js");
const { EbayCompConnector } = await import("../src/connectors/ebay.js");

test("pipeline runs end-to-end on the demo source and returns scored opportunities", async () => {
  const opps = await runPipeline(new MockSourceConnector(), new EbayCompConnector(), {
    query: "nintendo switch",
    limit: 12,
  });
  assert.ok(opps.length > 0, "expected opportunities");
  for (const o of opps) {
    assert.ok(o.score >= 0 && o.score <= 1);
    assert.ok(o.referencePrice > 0);
    assert.equal(typeof o.netProfit, "number");
  }
});

test("opportunities are sorted by score descending", async () => {
  const opps = await runPipeline(new MockSourceConnector(), new EbayCompConnector(), {
    query: "macbook pro",
    limit: 12,
  });
  for (let i = 1; i < opps.length; i++) {
    assert.ok(opps[i - 1].score >= opps[i].score);
  }
});

test("custom thresholds change which opportunities pass", async () => {
  const source = new MockSourceConnector();
  const comper = new EbayCompConnector();
  const q = { query: "nintendo switch", limit: 12 };

  const strict = await runPipeline(source, comper, q, {
    thresholds: { minMarginPct: 0.9, minAbsoluteProfit: 999, minMatchConfidence: 0.99 },
  });
  const loose = await runPipeline(source, comper, q, {
    thresholds: { minMarginPct: 0, minAbsoluteProfit: 0, minMatchConfidence: 0 },
  });

  const passing = (os: typeof strict) => os.filter((o) => !o.flags.includes("DOES NOT PASS THRESHOLDS")).length;
  assert.ok(passing(loose) >= passing(strict));
});
