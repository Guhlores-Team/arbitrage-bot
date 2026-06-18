import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { KeepaConnector } from "../src/connectors/keepa.js";
import { ShopGoodwillConnector } from "../src/connectors/shopgoodwill.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SCRAPER_PROXY;
});

test("Keepa mock comps work with no key", async () => {
  const k = new KeepaConnector("", "1", true);
  assert.equal(k.basis, "mock");
  const comps = await k.getSoldComps("nintendo switch", 5);
  assert.ok(comps.length > 0 && comps.every((c) => c.soldPrice > 0));
  assert.ok(comps.every((c) => c.market === "amazon"));
});

test("Keepa live maps New/Used current prices (cents -> dollars)", async () => {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        products: [{ asin: "B01", title: "Nintendo Switch", stats: { current: [-1, 29999, 18000] } }],
      }),
    }) as any) as typeof fetch;
  const k = new KeepaConnector("key", "1", false);
  assert.equal(k.basis, "sold");
  const comps = await k.getSoldComps("switch", 10);
  // index1 New=299.99->300, index2 Used=180; index0 Amazon=-1 dropped
  assert.deepEqual(comps.map((c) => c.soldPrice).sort((a, b) => a - b), [180, 300]);
  assert.ok(comps.every((c) => c.market === "amazon"));
});

test("ShopGoodwill parses the search API into listings", async () => {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        searchResults: {
          items: [
            { itemId: 111, title: "Dyson V8 vacuum", currentPrice: 45, imageUrlString: "abc/img.jpg" },
            { itemId: 222, title: "Switch console", minimumBid: 80, imageUrlString: "https://x/y.jpg" },
          ],
        },
      }),
    }) as any) as typeof fetch;
  const out = await new ShopGoodwillConnector().search({ query: "vacuum", limit: 10 });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "sg_111");
  assert.equal(out[0].price, 45);
  assert.equal(out[0].url, "https://shopgoodwill.com/item/111");
  assert.ok(out[0].imageUrls[0].startsWith("https://"));
  assert.equal(out[1].price, 80);
});

test("ShopGoodwill respects maxPrice", async () => {
  globalThis.fetch = (async () =>
    ({ ok: true, json: async () => ({ searchResults: { items: [
      { itemId: 1, title: "cheap", currentPrice: 20 },
      { itemId: 2, title: "pricey", currentPrice: 500 },
    ] } }) }) as any) as typeof fetch;
  const out = await new ShopGoodwillConnector().search({ query: "x", maxPrice: 100 });
  assert.deepEqual(out.map((l) => l.price), [20]);
});
