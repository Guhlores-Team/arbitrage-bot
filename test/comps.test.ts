import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { compInfo } from "../src/comps.js";

const KEYS = ["SERPAPI_KEY", "COMP_SOURCES", "COMP_ROUTING", "COMP_CACHE_TTL_MIN", "SERPAPI_ENGINE", "SERPAPI_EBAY_SOLD", "EBAY_CLIENT_ID", "EBAY_USE_MOCK_COMPS"];
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setEnv(e: Record<string, string>) {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(e)) process.env[k] = v;
}

test("auto routing baseline is SerpApi (live sold) when a key is set — not mock eBay", () => {
  setEnv({ SERPAPI_KEY: "k", COMP_SOURCES: "auto" });
  const info = compInfo();
  assert.equal(info.markets, "auto");
  assert.equal(info.basis, "sold"); // SerpApi eBay-sold baseline, not the old mock fallback
});

test("with no comp key at all, the baseline falls back to eBay mock", () => {
  setEnv({ COMP_SOURCES: "auto", EBAY_USE_MOCK_COMPS: "true" });
  assert.equal(compInfo().basis, "mock");
});

test("a SerpApi key with no explicit source resolves to live SerpApi comps", () => {
  setEnv({ SERPAPI_KEY: "k" });
  const info = compInfo();
  assert.equal(info.basis, "sold");
});
