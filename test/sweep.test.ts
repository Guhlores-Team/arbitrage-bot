import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSweepBatch, STARTER_KEYWORDS } from "../src/sweep.js";

test("pickSweepBatch returns perTick keywords from the cursor", () => {
  const r = pickSweepBatch(["a", "b", "c", "d"], 0, 2);
  assert.deepEqual(r.batch, ["a", "b"]);
  assert.equal(r.nextCursor, 2);
});

test("pickSweepBatch wraps around the end of the list", () => {
  const r = pickSweepBatch(["a", "b", "c"], 2, 2);
  assert.deepEqual(r.batch, ["c", "a"]);
  assert.equal(r.nextCursor, 1);
});

test("a full rotation visits every keyword exactly once", () => {
  const kw = ["a", "b", "c", "d", "e"];
  let cursor = 0;
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = pickSweepBatch(kw, cursor, 1);
    seen.push(...r.batch);
    cursor = r.nextCursor;
  }
  assert.deepEqual([...seen].sort(), [...kw].sort());
  assert.equal(cursor, 0); // back to start
});

test("perTick is clamped to the list length and >=1", () => {
  assert.equal(pickSweepBatch(["a", "b"], 0, 99).batch.length, 2);
  assert.equal(pickSweepBatch(["a", "b"], 0, 0).batch.length, 1);
});

test("empty keyword list is handled", () => {
  assert.deepEqual(pickSweepBatch([], 0, 3), { batch: [], nextCursor: 0 });
});

test("starter pack is non-trivial and unique", () => {
  assert.ok(STARTER_KEYWORDS.length >= 15);
  assert.equal(new Set(STARTER_KEYWORDS).size, STARTER_KEYWORDS.length);
});
