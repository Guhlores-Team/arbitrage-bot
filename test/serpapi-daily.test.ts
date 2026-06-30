import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

// SERPAPI_DAILY_MAX is a hard, persisted ceiling on live searches per calendar
// day — the guard that keeps a runaway autonomous loop from blowing the monthly
// free-tier quota in an afternoon. Env is set before importing so the module
// picks up the temp usage file and the cap.
test("SERPAPI_DAILY_MAX caps live searches for the day", async () => {
  process.env.SERPAPI_KEY = "test-key";
  process.env.SERPAPI_DAILY_MAX = "1";
  process.env.SERPAPI_USAGE_FILE = join(tmpdir(), `serp-usage-${Math.random().toString(36).slice(2)}.json`);

  const { SerpApiShoppingConnector, serpApiDailyCount } = await import("../src/connectors/serpapi.ts");

  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("account.json")) {
      return { ok: true, json: async () => ({ searches_per_month: 250, total_searches_left: 250, this_month_usage: 0 }) } as any;
    }
    return {
      ok: true,
      json: async () => ({ organic_results: [{ title: "x", price: { extracted: 50 }, condition: "Used", link: "u" }] }),
    } as any;
  }) as any;

  const c = new SerpApiShoppingConnector();

  const first = await c.getSoldComps("nintendo switch", 5);
  assert.ok(first.length > 0, "first search returns comps");
  assert.equal(serpApiDailyCount(), 1, "first search counted");

  const second = await c.getSoldComps("playstation 5", 5);
  assert.equal(second.length, 0, "second search blocked by the daily cap");
  assert.equal(serpApiDailyCount(), 1, "blocked search did not increment the counter");
});
