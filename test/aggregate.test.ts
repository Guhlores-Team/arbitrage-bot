import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MultiSourceConnector } from "../src/connectors/multi.js";
import { MultiCompConnector } from "../src/connectors/multicomp.js";
import { PriceChartingConnector } from "../src/connectors/pricecharting.js";
import { expandSourceSpec, isValidSourceSpec, resolveSource, LIVE_SOURCES } from "../src/sources.js";
import type { SourceConnector } from "../src/connectors/connector.js";
import type { CompConnector } from "../src/connectors/connector.js";
import type { SourceListing, SoldComp } from "../src/types.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const fakeSource = (source: string, ids: string[]): SourceConnector => ({
  source,
  async search(): Promise<SourceListing[]> {
    return ids.map((id) => ({
      id,
      source: source as any,
      rawTitle: id,
      price: 10,
      currency: "USD",
      imageUrls: [],
      url: "u",
      fetchedAt: new Date().toISOString(),
    }));
  },
});

const throwingSource = (source: string): SourceConnector => ({
  source,
  async search(): Promise<SourceListing[]> {
    throw new Error("blocked");
  },
});

test("MultiSource merges children and de-dupes by id", async () => {
  const m = new MultiSourceConnector([fakeSource("a", ["1", "2"]), fakeSource("b", ["2", "3"])]);
  const out = await m.search({ query: "x" });
  assert.deepEqual(out.map((l) => l.id).sort(), ["1", "2", "3"]);
});

test("MultiSource is resilient — one failing source doesn't sink the scan", async () => {
  const m = new MultiSourceConnector([throwingSource("bad"), fakeSource("good", ["7"])]);
  const out = await m.search({ query: "x" });
  assert.deepEqual(out.map((l) => l.id), ["7"]);
});

test("source spec expansion: all, list, single", () => {
  assert.deepEqual(expandSourceSpec("all"), [...LIVE_SOURCES]);
  assert.deepEqual(expandSourceSpec("craigslist, offerup"), ["craigslist", "offerup"]);
  assert.deepEqual(expandSourceSpec("mercari"), ["mercari"]);
  assert.ok(isValidSourceSpec("all"));
  assert.ok(isValidSourceSpec("craigslist,mercari"));
  assert.ok(!isValidSourceSpec("craigslist,nope"));
});

test("resolveSource returns a multi connector for 'all'", () => {
  const c = resolveSource("all");
  assert.ok(c.source === "all");
});

test("PriceCharting mock comps work with no token", async () => {
  const pc = new PriceChartingConnector("", true);
  assert.equal(pc.basis, "mock");
  const comps = await pc.getSoldComps("pokemon red", 6);
  assert.ok(comps.length > 0 && comps.every((c) => c.soldPrice > 0));
});

test("PriceCharting live maps loose/cib/new prices (pennies -> dollars)", async () => {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        products: [{ id: "G1", "product-name": "Pokemon Red", "console-name": "GB", "loose-price": 2500, "cib-price": 6000, "new-price": 0 }],
      }),
    }) as any) as typeof fetch;
  const pc = new PriceChartingConnector("tok", false);
  assert.equal(pc.basis, "sold");
  const comps = await pc.getSoldComps("pokemon red", 10);
  assert.equal(comps.length, 2); // new-price 0 dropped
  assert.deepEqual(comps.map((c) => c.soldPrice).sort((a, b) => a - b), [25, 60]);
});

test("MultiComp blends comps from several markets", async () => {
  const m1: CompConnector = { market: "m1", basis: "ask", async getSoldComps() { return [{ id: "a", title: "x", soldPrice: 100, currency: "USD", condition: "good", url: "u" } as SoldComp]; } };
  const m2: CompConnector = { market: "m2", basis: "sold", async getSoldComps() { return [{ id: "b", title: "y", soldPrice: 120, currency: "USD", condition: "good", url: "u" } as SoldComp]; } };
  const blend = new MultiCompConnector([m1, m2]);
  assert.equal(blend.basis, "sold"); // best basis wins
  const comps = await blend.getSoldComps("x", 20);
  assert.equal(comps.length, 2);
});
