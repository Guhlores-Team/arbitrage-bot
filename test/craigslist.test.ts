import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CraigslistConnector } from "../src/connectors/craigslist.js";

const SAMPLE_RSS = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item>
    <title>Nintendo Switch OLED - $180 (downtown)</title>
    <link>https://sfbay.craigslist.org/sfc/vgm/7712345678.html</link>
    <description>&lt;p&gt;Barely used, $180 firm&lt;/p&gt;</description>
    <dc:date>2026-06-17T12:00:00-07:00</dc:date>
  </item>
  <item>
    <title>Free couch</title>
    <link>https://sfbay.craigslist.org/sfc/fuo/7712999999.html</link>
    <description>no price here</description>
  </item>
</rdf:RDF>`;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("parses craigslist RSS into normalized listings", async () => {
  globalThis.fetch = (async () =>
    ({ ok: true, status: 200, text: async () => SAMPLE_RSS }) as any) as typeof fetch;

  const out = await new CraigslistConnector("sfbay").search({ query: "switch" });
  assert.equal(out.length, 2);

  const [a, b] = out;
  assert.equal(a.id, "cl_7712345678");
  assert.equal(a.source, "craigslist");
  assert.equal(a.price, 180); // pulled from title
  assert.ok(!/<p>/.test(a.description ?? "")); // html stripped
  assert.equal(a.postedAt, "2026-06-17T12:00:00-07:00");

  assert.equal(b.price, 0); // no price -> 0 (flagged downstream)
});

test("throws a useful error on non-ok responses", async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 503, text: async () => "" }) as any) as typeof fetch;
  await assert.rejects(() => new CraigslistConnector("sfbay").search({ query: "switch" }), /503/);
});

test("enrichment pulls images (and missing prices) from the listing page", async () => {
  const PAGE = `<html><meta property="og:image" content="x">
    <img src="https://images.craigslist.org/abc123_def456_300x300.jpg">
    <img src="https://images.craigslist.org/zzz999_yyy888_600x450.jpg">
    <span class="price">$150</span></html>`;
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    const body = url.includes("format=rss") ? SAMPLE_RSS : PAGE;
    return { ok: true, status: 200, text: async () => body } as any;
  }) as typeof fetch;

  const out = await new CraigslistConnector("sfbay", true).search({ query: "switch" });
  const couch = out.find((l) => l.id === "cl_7712999999")!;
  assert.ok(couch.imageUrls.length >= 1);
  assert.ok(couch.imageUrls.every((u) => u.startsWith("https://images.craigslist.org/")));
  // thumbnail size is normalized up
  assert.ok(couch.imageUrls.some((u) => u.endsWith("_600x450.jpg")));
  assert.equal(couch.price, 150); // was 0 from RSS, filled from page
});
