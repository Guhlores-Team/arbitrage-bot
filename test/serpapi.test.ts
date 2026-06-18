import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SerpApiShoppingConnector } from "../src/connectors/serpapi.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("SerpApi mock comps work with no key", async () => {
  const c = new SerpApiShoppingConnector("");
  assert.equal(c.basis, "mock");
  const comps = await c.getSoldComps("nintendo switch", 6);
  assert.ok(comps.length > 0 && comps.every((x) => x.soldPrice > 0 && x.market === "google"));
});

test("SerpApi live maps google_shopping results", async () => {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        shopping_results: [
          { product_id: "p1", title: "Nintendo Switch OLED", extracted_price: 299.99, link: "https://store/x" },
          { product_id: "p2", title: "No price item", extracted_price: 0, link: "https://store/y" },
        ],
      }),
    }) as any) as typeof fetch;
  const c = new SerpApiShoppingConnector("key");
  assert.equal(c.basis, "ask");
  const comps = await c.getSoldComps("switch", 10);
  assert.equal(comps.length, 1); // priceless one dropped
  assert.equal(comps[0].soldPrice, 300);
  assert.equal(comps[0].market, "google");
});
