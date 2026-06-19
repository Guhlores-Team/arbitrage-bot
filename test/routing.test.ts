import { test } from "node:test";
import assert from "node:assert/strict";
import { routeMarket, RoutingCompConnector } from "../src/connectors/routing.js";
import { StockXConnector } from "../src/connectors/stockx.js";
import type { CompConnector } from "../src/connectors/connector.js";
import type { SoldComp } from "../src/types.js";

test("routeMarket sends games/cards to pricecharting, sneakers to stockx, else null", () => {
  assert.equal(routeMarket("pokemon red gameboy"), "pricecharting");
  assert.equal(routeMarket("nintendo switch oled"), "pricecharting");
  assert.equal(routeMarket("jordan 1 retro high"), "stockx");
  assert.equal(routeMarket("yeezy boost 350"), "stockx");
  assert.equal(routeMarket("dyson v11 vacuum"), null);
});

const comp = (market: string, price: number): SoldComp =>
  ({ id: market + price, title: "x", soldPrice: price, currency: "USD", condition: "good", url: "u", market });

function fakeMarket(market: string, basis: "sold" | "mock", price: number): CompConnector & { calls: number } {
  return {
    market,
    basis,
    calls: 0,
    async getSoldComps() {
      (this as any).calls++;
      return [comp(market, price)];
    },
  };
}

test("replace mode (default): a live specialized market is used INSTEAD of the baseline", async () => {
  const baseline = fakeMarket("ebay", "sold", 100);
  const special = fakeMarket("pricecharting", "sold", 130);
  const r = new RoutingCompConnector(baseline, () => special); // default = replace
  const comps = await r.getSoldComps("pokemon red", 20);
  assert.equal(baseline.calls, 0, "baseline quota (SerpApi) is not spent");
  assert.equal(special.calls, 1);
  assert.deepEqual(comps.map((c) => c.market), ["pricecharting"]);
});

test("blend mode: both the baseline and the live specialized market are queried", async () => {
  const baseline = fakeMarket("ebay", "sold", 100);
  const special = fakeMarket("pricecharting", "sold", 130);
  const r = new RoutingCompConnector(baseline, () => special, "blend");
  const comps = await r.getSoldComps("pokemon red", 20);
  assert.equal(baseline.calls, 1);
  assert.equal(special.calls, 1);
  assert.deepEqual(comps.map((c) => c.market).sort(), ["ebay", "pricecharting"]);
});

test("a mock/keyless specialized market never replaces a live baseline", async () => {
  const baseline = fakeMarket("ebay", "sold", 100);
  const special = fakeMarket("stockx", "mock", 200);
  const r = new RoutingCompConnector(baseline, () => special); // replace
  const comps = await r.getSoldComps("jordan 1", 20);
  assert.equal(baseline.calls, 1, "falls back to the live baseline");
  assert.equal(special.calls, 0, "mock source not queried");
  assert.deepEqual(comps.map((c) => c.market), ["ebay"]);
});

test("un-routed categories just use the baseline", async () => {
  const baseline = fakeMarket("ebay", "sold", 100);
  const special = fakeMarket("pricecharting", "sold", 130);
  const r = new RoutingCompConnector(baseline, () => special);
  const comps = await r.getSoldComps("dyson v11 vacuum", 20);
  assert.equal(baseline.calls, 1);
  assert.equal(special.calls, 0);
  assert.deepEqual(comps.map((c) => c.market), ["ebay"]);
});

test("demo mode (baseline also mock): a mock specialized market is allowed", async () => {
  const baseline = fakeMarket("ebay", "mock", 100);
  const r = new RoutingCompConnector(baseline, () => fakeMarket("stockx", "mock", 200)); // replace
  const comps = await r.getSoldComps("jordan 1", 20);
  assert.deepEqual(comps.map((c) => c.market), ["stockx"]);
});

test("StockX is mock without a token (so routing won't pollute live comps)", async () => {
  const sx = new StockXConnector("");
  assert.equal(sx.basis, "mock");
  const comps = await sx.getSoldComps("jordan 1", 5);
  assert.ok(comps.length > 0 && comps.every((c) => c.market === "stockx"));
});
