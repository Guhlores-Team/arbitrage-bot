import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ApifyConnector, parseApifySources } from "../src/connectors/apify.js";

const realFetch = globalThis.fetch;
const env = { ...process.env };
beforeEach(() => {
  delete process.env.APIFY_TOKEN;
  delete process.env.APIFY_SOURCES;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

test("parseApifySources reads valid configs and ignores junk", () => {
  process.env.APIFY_SOURCES = JSON.stringify([
    { name: "fb", actor: "apify/facebook-marketplace-scraper" },
    { name: "bad" }, // missing actor -> dropped
  ]);
  const cfgs = parseApifySources();
  assert.equal(cfgs.length, 1);
  assert.equal(cfgs[0].name, "fb");
});

test("parseApifySources returns [] on malformed env", () => {
  process.env.APIFY_SOURCES = "{not json";
  assert.deepEqual(parseApifySources(), []);
});

test("ApifyConnector runs the actor and maps dataset items (with field overrides)", async () => {
  process.env.APIFY_TOKEN = "apify_xxx";
  let calledUrl = "";
  let sentBody: any = null;
  globalThis.fetch = (async (u: any, init: any) => {
    calledUrl = String(u);
    sentBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => [
        { itemId: "1", name: "Nintendo Switch", currentPrice: 120, listingUrl: "https://fb/1", photo: "https://img/1.jpg", city: "Brooklyn, NY" },
        { itemId: "2", name: "no price", currentPrice: 0, listingUrl: "https://fb/2" },
      ],
    } as any;
  }) as typeof fetch;

  const c = new ApifyConnector({
    name: "fb",
    actor: "apify/facebook-marketplace-scraper",
    queryField: "keyword",
    input: { maxItems: 25 },
    map: { id: "itemId", title: "name", price: "currentPrice", url: "listingUrl", image: "photo", location: "city" },
  });
  const out = await c.search({ query: "switch", limit: 10 });

  assert.match(calledUrl, /acts\/apify~facebook-marketplace-scraper\/run-sync-get-dataset-items/);
  assert.equal(sentBody.keyword, "switch"); // query injected into the configured field
  assert.equal(sentBody.maxItems, 25); // static input preserved
  assert.equal(out.length, 2);
  assert.equal(out[0].source, "fb");
  assert.equal(out[0].price, 120);
  assert.equal(out[0].location, "Brooklyn, NY");
  assert.equal(out[0].imageUrls[0], "https://img/1.jpg");
  assert.ok(out[0].id.startsWith("apify_fb_"));
});

test("ApifyConnector throws a clear error without a token", async () => {
  const c = new ApifyConnector({ name: "fb", actor: "x/y" });
  await assert.rejects(() => c.search({ query: "z" }), /APIFY_TOKEN/);
});
