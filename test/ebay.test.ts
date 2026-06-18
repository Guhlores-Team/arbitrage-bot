import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EbayCompConnector } from "../src/connectors/ebay.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const TOKEN_JSON = { access_token: "tok", expires_in: 7200 };

function stub(routes: (url: string) => any) {
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    return { ok: true, status: 200, json: async () => routes(url), text: async () => "" } as any;
  }) as typeof fetch;
}

test("mock comps are deterministic and need no credentials", async () => {
  const c = new EbayCompConnector("", "", true);
  assert.equal(c.effectiveSource, "mock");
  const a = await c.getSoldComps("nintendo switch", 8);
  const b = await c.getSoldComps("nintendo switch", 8);
  // soldAt embeds Date.now(), so compare the deterministic price signal only.
  assert.deepEqual(a.map((x) => x.soldPrice), b.map((x) => x.soldPrice));
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.ok(a.length > 0 && a.every((x) => x.soldPrice > 0));
});

test("browse mode maps active itemSummaries to comps", async () => {
  stub((url) => {
    if (url.includes("/oauth2/token")) return TOKEN_JSON;
    if (url.includes("/browse/v1/item_summary/search"))
      return {
        itemSummaries: [
          { itemId: "v1", title: "Nintendo Switch OLED", price: { value: "299.99", currency: "USD" }, condition: "New", itemWebUrl: "https://ebay/v1" },
          { itemId: "v2", title: "Switch (no price)", price: null, condition: "Good", itemWebUrl: "https://ebay/v2" },
        ],
      };
    throw new Error("unexpected " + url);
  });
  const c = new EbayCompConnector("id", "secret", false, "browse", 1); // no haircut here
  assert.equal(c.effectiveSource, "browse");
  const comps = await c.getSoldComps("switch", 10);
  assert.equal(comps.length, 1); // the priceless one is dropped
  assert.equal(comps[0].soldPrice, 300); // 299.99 rounded
  assert.equal(comps[0].condition, "new");
});

test("browse applies the ask->sold haircut", async () => {
  stub((url) => {
    if (url.includes("/oauth2/token")) return TOKEN_JSON;
    if (url.includes("item_summary/search"))
      return { itemSummaries: [{ itemId: "v1", title: "x", price: { value: "100" }, condition: "Good", itemWebUrl: "u" }] };
    throw new Error("unexpected " + url);
  });
  // ratio 0.8 -> 100 ask becomes 80 sold estimate
  const c = new EbayCompConnector("id", "secret", false, "browse", 0.8);
  const comps = await c.getSoldComps("x", 5);
  assert.equal(comps[0].soldPrice, 80);
});

test("auto falls back from insights to browse when insights fails", async () => {
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    if (url.includes("/oauth2/token")) return { ok: true, json: async () => TOKEN_JSON, text: async () => "" } as any;
    if (url.includes("marketplace_insights")) return { ok: false, status: 403, text: async () => "no access" } as any;
    if (url.includes("item_summary/search"))
      return { ok: true, json: async () => ({ itemSummaries: [{ itemId: "b", title: "x", price: { value: "50" }, condition: "Good", itemWebUrl: "u" }] }), text: async () => "" } as any;
    throw new Error("unexpected " + url);
  }) as typeof fetch;

  const c = new EbayCompConnector("id", "secret", false, "auto", 1); // no haircut here
  const comps = await c.getSoldComps("thing", 5);
  assert.equal(comps.length, 1);
  assert.equal(comps[0].soldPrice, 50);
});
