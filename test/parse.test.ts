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
