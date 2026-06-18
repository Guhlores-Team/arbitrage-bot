import { test } from "node:test";
import assert from "node:assert/strict";
import { FailoverSourceConnector } from "../src/connectors/failover.js";
import { MultiSourceConnector } from "../src/connectors/multi.js";
import type { SearchQuery, SourceConnector } from "../src/connectors/connector.js";
import type { SourceListing } from "../src/types.js";

function stub(source: string, listings: SourceListing[] | Error): SourceConnector {
  return {
    source,
    async search(_q: SearchQuery) {
      if (listings instanceof Error) throw listings;
      return listings;
    },
  };
}
function listing(id: string, url: string, source = "x"): SourceListing {
  return { id, source: source as any, rawTitle: id, price: 10, currency: "USD", imageUrls: [], url, fetchedAt: "now" };
}

test("failover returns the first child that yields listings", async () => {
  const fo = new FailoverSourceConnector(
    [stub("free", []), stub("apify", [listing("a", "https://x/a")])],
    "facebook",
  );
  const out = await fo.search({ query: "q" });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "facebook"); // re-tagged to the unified name
});

test("failover skips an erroring child and uses the next", async () => {
  const fo = new FailoverSourceConnector([stub("free", new Error("blocked")), stub("apify", [listing("a", "https://x/a")])]);
  const out = await fo.search({ query: "q" });
  assert.equal(out.length, 1);
});

test("failover surfaces the last error when every path errors", async () => {
  const fo = new FailoverSourceConnector([stub("a", new Error("e1")), stub("b", new Error("e2"))]);
  await assert.rejects(() => fo.search({ query: "q" }), /e2/);
});

test("failover returns [] when all paths are empty (no error)", async () => {
  const fo = new FailoverSourceConnector([stub("a", []), stub("b", [])]);
  assert.deepEqual(await fo.search({ query: "q" }), []);
});

test("multi de-dupes the same item arriving via two paths by URL", async () => {
  // Different ids (in-process vs apify wrapper) but the same listing URL.
  const multi = new MultiSourceConnector([
    stub("inproc", [listing("fb_1", "https://m.facebook.com/marketplace/item/1")]),
    stub("apify", [listing("apify_fb_1", "https://m.facebook.com/marketplace/item/1/?ref=x")]),
  ]);
  const out = await multi.search({ query: "q" });
  assert.equal(out.length, 1); // collapsed on normalized URL
});
