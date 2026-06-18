import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ApifyCompConnector, parseApifyComps } from "../src/connectors/apify-comp.js";

const realFetch = globalThis.fetch;
const env = { ...process.env };
beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith("APIFY_")) delete process.env[k];
});

test("parseApifyComps reads per-market configs and drops entries missing market/actor", () => {
  process.env.APIFY_COMPS = JSON.stringify([
    { market: "stockx", actor: "me/stockx-scraper" },
    { actor: "x/y" }, // no market -> dropped
    { market: "poshmark" }, // no actor/task -> dropped
  ]);
  const cfgs = parseApifyComps();
  assert.equal(cfgs.length, 1);
  assert.equal(cfgs[0].market, "stockx");
});

test("parseApifyComps returns [] on malformed env", () => {
  process.env.APIFY_COMPS = "{nope";
  assert.deepEqual(parseApifyComps(), []);
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

test("ApifyCompConnector returns deterministic mock comps with no token (basis mock)", async () => {
  const c = new ApifyCompConnector();
  assert.equal(c.basis, "mock");
  const a = await c.getSoldComps("nintendo switch", 5);
  const b = await c.getSoldComps("nintendo switch", 5);
  assert.ok(a.length > 0 && a.length <= 5);
  assert.deepEqual(a.map((x) => x.soldPrice), b.map((x) => x.soldPrice)); // deterministic
  assert.ok(a.every((x) => x.soldPrice > 0 && x.market === "ebay-sold"));
});

test("ApifyCompConnector runs the actor and maps sold items (basis sold)", async () => {
  process.env.APIFY_TOKEN = "apify_xxx";
  process.env.APIFY_COMP_ACTOR = "me/ebay-sold-listings-scraper";
  let calledUrl = "";
  let sentBody: any = null;
  globalThis.fetch = (async (u: any, init: any) => {
    calledUrl = String(u);
    sentBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => [
        { id: "1", title: "Nintendo Switch OLED", price: 245, condition: "Used", soldAt: "2026-03-05T00:00:00.000Z", url: "https://ebay/itm/1" },
        { id: "2", title: "zero price drop", price: 0, url: "https://ebay/itm/2" },
      ],
    } as any;
  }) as typeof fetch;

  const c = new ApifyCompConnector();
  assert.equal(c.basis, "sold");
  const out = await c.getSoldComps("switch", 10);

  assert.match(calledUrl, /acts\/me~ebay-sold-listings-scraper\/run-sync-get-dataset-items/);
  assert.equal(sentBody.query, "switch");
  assert.equal(out.length, 1); // zero-price comp filtered out
  assert.equal(out[0].soldPrice, 245);
  assert.equal(out[0].condition, "good");
  assert.equal(out[0].market, "ebay-sold");
  assert.ok(out[0].id.startsWith("apifyc_ebay-sold_"));
});

test("ApifyCompConnector honors a task id and field-name overrides", async () => {
  process.env.APIFY_TOKEN = "apify_xxx";
  process.env.APIFY_COMP_TASK = "me~sold-task";
  process.env.APIFY_COMP_MAP = JSON.stringify({ price: "salePrice" });
  let calledUrl = "";
  globalThis.fetch = (async (u: any) => {
    calledUrl = String(u);
    return { ok: true, json: async () => [{ id: "9", title: "x", salePrice: 50, url: "https://ebay/itm/9" }] } as any;
  }) as typeof fetch;

  const out = await new ApifyCompConnector().getSoldComps("x", 5);
  assert.match(calledUrl, /actor-tasks\/me~sold-task\/run-sync-get-dataset-items/);
  assert.equal(out[0].soldPrice, 50);
});
