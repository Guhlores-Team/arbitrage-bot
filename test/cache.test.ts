import { test } from "node:test";
import assert from "node:assert/strict";
import { CachingCompConnector } from "../src/connectors/cache.js";
import type { CompConnector } from "../src/connectors/connector.js";
import type { SoldComp } from "../src/types.js";

class CountingComp implements CompConnector {
  readonly market = "ebay";
  readonly basis = "sold" as const;
  calls = 0;
  async getSoldComps(q: string, limit = 20): Promise<SoldComp[]> {
    this.calls++;
    return Array.from({ length: 6 }, (_, i) => ({
      id: `${q}-${i}`,
      title: q,
      soldPrice: 100 + i,
      currency: "USD",
      condition: "good" as const,
      url: "https://x",
      market: "ebay",
    }));
  }
}

test("identical queries hit the cache — inner connector called once", async () => {
  const inner = new CountingComp();
  const c = new CachingCompConnector(inner, 60_000);
  await c.getSoldComps("nintendo switch oled");
  await c.getSoldComps("Nintendo Switch OLED"); // case/space-insensitive
  await c.getSoldComps("nintendo   switch   oled");
  assert.equal(inner.calls, 1);
  assert.equal(c.hits, 2);
});

test("different queries each cost a real lookup", async () => {
  const inner = new CountingComp();
  const c = new CachingCompConnector(inner, 60_000);
  await c.getSoldComps("airpods pro");
  await c.getSoldComps("macbook air");
  assert.equal(inner.calls, 2);
  assert.equal(c.hits, 0);
});

test("ttl=0 disables caching (every call is live)", async () => {
  const inner = new CountingComp();
  const c = new CachingCompConnector(inner, 0);
  await c.getSoldComps("same");
  await c.getSoldComps("same");
  assert.equal(inner.calls, 2);
});

test("cache respects the requested limit on a hit", async () => {
  const inner = new CountingComp();
  const c = new CachingCompConnector(inner, 60_000);
  await c.getSoldComps("q", 20);
  const got = await c.getSoldComps("q", 3);
  assert.equal(got.length, 3);
});

test("delegates market and basis to the inner connector", () => {
  const c = new CachingCompConnector(new CountingComp(), 60_000);
  assert.equal(c.market, "ebay");
  assert.equal(c.basis, "sold");
});
