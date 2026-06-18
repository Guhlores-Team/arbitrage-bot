import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrice, pickImage, parseCard } from "../src/connectors/parse.js";

test("parsePrice handles $, commas, decimals, Free, and none", () => {
  assert.equal(parsePrice("$1,299.99"), 1300);
  assert.equal(parsePrice("$50"), 50);
  assert.equal(parsePrice("Free"), 0);
  assert.equal(parsePrice("FREE - pickup only"), 0);
  assert.equal(parsePrice("no price here"), 0);
  assert.equal(parsePrice("$120 · Brooklyn"), 120);
});

test("pickImage prefers the largest srcset entry, else src", () => {
  assert.equal(
    pickImage("small.jpg", "a.jpg 320w, b.jpg 640w, c.jpg 1280w"),
    "c.jpg",
  );
  assert.equal(pickImage("only.jpg", undefined), "only.jpg");
  assert.equal(pickImage(undefined, undefined), undefined);
});

test("parseCard splits price / title / location from structured spans", () => {
  const c = parseCard({
    id: "1",
    url: "https://fb/item/1",
    texts: ["$120", "Nintendo Switch OLED white", "Brooklyn, NY"],
    src: "img.jpg",
  });
  assert.equal(c.price, 120);
  assert.equal(c.title, "Nintendo Switch OLED white");
  assert.equal(c.location, "Brooklyn, NY");
  assert.equal(c.image, "img.jpg");
});

test("parseCard picks the longest non-price text as the title", () => {
  const c = parseCard({
    id: "2",
    url: "u",
    texts: ["$40", "Bundle", "PlayStation 5 disc edition with two controllers"],
  });
  assert.equal(c.price, 40);
  assert.equal(c.title, "PlayStation 5 disc edition with two controllers");
});

test("parseCard tolerates a single concatenated text blob", () => {
  const c = parseCard({ id: "3", url: "u", texts: ["$200 Dyson V11 vacuum"] });
  assert.equal(c.price, 200);
  assert.ok(c.title.includes("Dyson"));
});

test("parseCard prefers aria-label / img alt over span soup (real OfferUp shape)", () => {
  // exactly the DOM shape OfferUp serves: a concatenated blob span + clean spans
  const c = parseCard({
    id: "4",
    url: "https://offerup.com/item/detail/abc",
    texts: ["Minecraft for Nintendo Switch$25Bennington, NE", "Minecraft for Nintendo Switch", "$25", "$25", "Bennington, NE"],
    ariaLabel: "Minecraft for Nintendo Switch $25  in Bennington, NE ",
    imgAlt: "Minecraft for Nintendo Switch",
  });
  assert.equal(c.title, "Minecraft for Nintendo Switch"); // not the garbled blob
  assert.equal(c.price, 25);
  assert.equal(c.location, "Bennington, NE");
});

test("parseCard derives title + location from aria-label when no img alt", () => {
  const c = parseCard({
    id: "5",
    url: "u",
    texts: ["$450", "Omaha, NE"],
    ariaLabel: "Nintendo switch  $450  in Omaha, NE ",
  });
  assert.equal(c.title, "Nintendo switch");
  assert.equal(c.price, 450);
  assert.equal(c.location, "Omaha, NE");
});

// Real logged-in Facebook Marketplace card shapes (aria = "Title, $Price, City, ST, listing <id>";
// img alt = "Title in City, ST"; spans repeat each field).
test("parseCard handles Facebook aria-label format", () => {
  const c = parseCard({
    id: "1376440694354695",
    url: "https://www.facebook.com/marketplace/item/1376440694354695/",
    ariaLabel: "Nintendo Switch Bundle, $150, Brooklyn, NY, listing 1376440694354695",
    imgAlt: "Nintendo Switch Bundle in Brooklyn, NY",
    texts: ["$150", "$150", "Nintendo Switch Bundle", "Nintendo Switch Bundle", "Brooklyn, NY", "Brooklyn, NY"],
  });
  assert.equal(c.title, "Nintendo Switch Bundle"); // no trailing comma, no " in Brooklyn, NY"
  assert.equal(c.price, 150);
  assert.equal(c.location, "Brooklyn, NY");
});

test("parseCard keeps a long Facebook title intact (canonical code preserved)", () => {
  const c = parseCard({
    id: "2234863793940852",
    url: "u",
    ariaLabel: "Nintendo Switch HAC-001 Console Gray With All Original Accessories, $150, New York, NY, listing 2234863793940852",
    imgAlt: "Nintendo Switch HAC-001 Console Gray With All Original Accessories in New York, NY",
    texts: ["$150", "Nintendo Switch HAC-001 Console Gray With All Original Accessories", "New York, NY"],
  });
  assert.match(c.title, /HAC-001/);
  assert.ok(!/New York/.test(c.title)); // location stripped from the title
  assert.equal(c.location, "New York, NY");
  assert.equal(c.price, 150);
});
