import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  serpApiUsage,
  serpApiSearchCount,
  resetSerpApiSearchCount,
  SerpApiShoppingConnector,
} from "../src/connectors/serpapi.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  resetSerpApiSearchCount();
  delete process.env.SERPAPI_ENGINE;
  delete process.env.SERPAPI_EBAY_SOLD;
});

test("serpApiUsage returns null without a key (no wasted call)", async () => {
  assert.equal(await serpApiUsage(""), null);
});

test("serpApiUsage parses the account endpoint", async () => {
  let calledUrl = "";
  globalThis.fetch = (async (u: any) => {
    calledUrl = String(u);
    return {
      ok: true,
      json: async () => ({
        plan_name: "Free",
        searches_per_month: 250,
        this_month_usage: 30,
        total_searches_left: 220,
        plan_searches_left: 220,
      }),
    };
  }) as any as typeof fetch;

  const u = await serpApiUsage("k");
  assert.ok(u);
  assert.equal(u!.plan, "Free");
  assert.equal(u!.total, 250);
  assert.equal(u!.used, 30);
  assert.equal(u!.left, 220);
  assert.ok(calledUrl.startsWith("https://serpapi.com/account.json"));
});

test("each live comp lookup increments the per-run search counter", async () => {
  process.env.SERPAPI_ENGINE = "ebay";
  process.env.SERPAPI_EBAY_SOLD = "true";
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({ organic_results: [{ position: 1, title: "Nintendo Switch OLED", price: { extracted: 250 }, link: "https://ebay/x" }] }),
    }) as any) as typeof fetch;

  resetSerpApiSearchCount();
  assert.equal(serpApiSearchCount(), 0);
  const c = new SerpApiShoppingConnector("key");
  await c.getSoldComps("switch", 5);
  await c.getSoldComps("airpods", 5);
  assert.equal(serpApiSearchCount(), 2);
});

test("mock mode (no key) does not spend a search credit", async () => {
  resetSerpApiSearchCount();
  const c = new SerpApiShoppingConnector("");
  await c.getSoldComps("switch", 5);
  assert.equal(serpApiSearchCount(), 0);
});
