import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SerpApiShoppingConnector } from "../src/connectors/serpapi.js";

const realFetch = globalThis.fetch;
const ENV_KEYS = ["SERPAPI_ENGINE", "SERPAPI_EBAY_SOLD", "SERPAPI_EBAY_DOMAIN"];
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setEnv(e: Record<string, string>) {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(e)) process.env[k] = v;
}

test("SerpApi mock comps work with no key", async () => {
  setEnv({ SERPAPI_ENGINE: "google_shopping" });
  const c = new SerpApiShoppingConnector("");
  assert.equal(c.basis, "mock");
  const comps = await c.getSoldComps("nintendo switch", 6);
  assert.ok(comps.length > 0 && comps.every((x) => x.soldPrice > 0 && x.market === "google"));
});

test("SerpApi live maps google_shopping results", async () => {
  setEnv({ SERPAPI_ENGINE: "google_shopping" });
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

test("SerpApi ebay engine maps SOLD results (basis sold, sold filter applied)", async () => {
  setEnv({ SERPAPI_ENGINE: "ebay", SERPAPI_EBAY_SOLD: "true" });
  let calledUrl = "";
  globalThis.fetch = (async (u: any) => {
    calledUrl = String(u);
    return {
      ok: true,
      json: async () => ({
        organic_results: [
          { position: 1, title: "Nintendo Switch OLED", price: { extracted: 250 }, link: "https://ebay/x", condition: "Used" },
          { position: 2, title: "No price", price: { extracted: 0 }, link: "https://ebay/y" },
        ],
      }),
    };
  }) as any as typeof fetch;
  const c = new SerpApiShoppingConnector("key");
  assert.equal(c.market, "ebay");
  assert.equal(c.basis, "sold");
  const comps = await c.getSoldComps("switch", 10);
  assert.equal(comps.length, 1); // priceless one dropped
  assert.equal(comps[0].soldPrice, 250);
  assert.equal(comps[0].market, "ebay");
  assert.equal(comps[0].condition, "good");
  assert.ok(calledUrl.includes("engine=ebay"), "uses ebay engine");
  assert.ok(calledUrl.includes("LH_Sold=1"), "applies sold filter");
});

test("SerpApi ebay engine without sold filter is basis ask", async () => {
  setEnv({ SERPAPI_ENGINE: "ebay", SERPAPI_EBAY_SOLD: "false" });
  const c = new SerpApiShoppingConnector("key");
  assert.equal(c.basis, "ask");
});
