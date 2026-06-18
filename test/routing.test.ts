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

const fakeMarket = (market: string, basis: "sold" | "mock", price: number): CompConnector => ({
  market,
  basis,
  async getSoldComps() {
    return [comp(market, price)];
  },
});

test("routing blends a LIVE specialized market with the eBay baseline", async () => {
  const baseline = fakeMarket("ebay", "sold", 100);
  const r = new RoutingCompConnector(baseline, () => fakeMarket("pricecharting", "sold", 130));
  const comps = await r.getSoldComps("pokemon red", 20);
  const markets = comps.map((c) => c.market).sort();
  assert.deepEqual(markets, ["ebay", "pricecharting"]);
});

test("routing does NOT blend a mock specialized market into a live baseline", async () => {
  const baseline = fakeMarket("ebay", "sold", 100);
  const r = new RoutingCompConnector(baseline, () => fakeMarket("stockx", "mock", 200));
  const comps = await r.getSoldComps("jordan 1", 20);
  assert.deepEqual(comps.map((c) => c.market), ["ebay"]); // mock stockx skipped
});

test("routing DOES blend mock specialized market when baseline is also mock (demo)", async () => {
  const baseline = fakeMarket("ebay", "mock", 100);
  const r = new RoutingCompConnector(baseline, () => fakeMarket("stockx", "mock", 200));
  const comps = await r.getSoldComps("jordan 1", 20);
  assert.deepEqual(comps.map((c) => c.market).sort(), ["ebay", "stockx"]);
});

test("StockX is mock without a token (so routing won't pollute live comps)", async () => {
  const sx = new StockXConnector("");
  assert.equal(sx.basis, "mock");
  const comps = await sx.getSoldComps("jordan 1", 5);
  assert.ok(comps.length > 0 && comps.every((c) => c.market === "stockx"));
});
