import { test } from "node:test";
import assert from "node:assert/strict";

// Force the offline heuristic path (no LLM calls in tests).
delete process.env.ANTHROPIC_API_KEY;

const { verifyMatches } = await import("../src/matching/match.js");
import type { ProductIdentity, SoldComp } from "../src/types.js";

const identity = (searchString: string, canonicalCode?: string): ProductIdentity => ({
  condition: "good",
  confidence: 0.5,
  searchString,
  canonicalCode,
});
const comp = (title: string, id = title): SoldComp => ({
  id,
  title,
  soldPrice: 100,
  currency: "USD",
  condition: "good",
  url: "https://e.bay",
});

test("canonical code is a hard match without the LLM", async () => {
  const res = await verifyMatches(identity("anything", "HAC-001"), [comp("Nintendo Switch HAC-001 console")]);
  assert.equal(res.length, 1);
  assert.equal(res[0].verdict.confidence, 0.97);
  assert.match(res[0].verdict.reasoning, /canonical/);
});

test("heuristic keeps high-overlap comps and drops unrelated ones", async () => {
  const res = await verifyMatches(identity("nintendo switch oled"), [
    comp("Nintendo Switch OLED white"),
    comp("Sony PlayStation 5 disc"),
  ]);
  const titles = res.map((r) => r.comp.title);
  assert.ok(titles.includes("Nintendo Switch OLED white"));
  assert.ok(!titles.includes("Sony PlayStation 5 disc"));
});

test("heuristic verdicts are labeled as offline", async () => {
  const res = await verifyMatches(identity("nintendo switch oled"), [comp("Nintendo Switch OLED model")]);
  assert.equal(res.length, 1);
  assert.match(res[0].verdict.reasoning, /offline heuristic/);
});
