import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.ANTHROPIC_API_KEY;

const { identifyProduct } = await import("../src/extraction/identify.js");
import type { SourceListing } from "../src/types.js";

const listing = (rawTitle: string): SourceListing => ({
  id: "x",
  source: "demo",
  rawTitle,
  price: 50,
  currency: "USD",
  imageUrls: [],
  url: "https://example.com",
  fetchedAt: new Date().toISOString(),
});

test("heuristic identity reads condition from title phrases", async () => {
  assert.equal((await identifyProduct(listing("iPhone 13 sealed brand new"))).condition, "new");
  assert.equal((await identifyProduct(listing("iPhone 13 like new mint"))).condition, "like_new");
  assert.equal((await identifyProduct(listing("iPhone 13 for parts not working"))).condition, "for_parts");
});

test("heuristic identity strips listing noise from the search string", async () => {
  const id = await identifyProduct(listing("Nintendo Switch OLED — like new in box, OBO cash only"));
  assert.ok(!/obo|cash only|like new/i.test(id.searchString));
  assert.match(id.searchString.toLowerCase(), /nintendo switch/);
});

test("heuristic identity reports modest confidence (no vision pass)", async () => {
  const id = await identifyProduct(listing("Some Gadget"));
  assert.ok(id.confidence > 0 && id.confidence < 0.6);
});
