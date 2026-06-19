import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { effectiveCompSources } from "../src/settings.js";

const KEYS = ["COMP_SOURCES", "SERPAPI_KEY"];
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

test("comp source defaults to ebay with no config", () => {
  setEnv({});
  assert.equal(effectiveCompSources(), "ebay");
});

test("a SerpApi key alone auto-selects serpapi (zero-config)", () => {
  setEnv({ SERPAPI_KEY: "abc123" });
  assert.equal(effectiveCompSources(), "serpapi");
});

test("explicit COMP_SOURCES wins over the SerpApi auto-default", () => {
  setEnv({ SERPAPI_KEY: "abc123", COMP_SOURCES: "ebay,pricecharting" });
  assert.equal(effectiveCompSources(), "ebay,pricecharting");
});
