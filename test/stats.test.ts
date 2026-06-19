import { test } from "node:test";
import assert from "node:assert/strict";
import { asc, percentile, round, clamp } from "../src/stats.js";

test("asc returns a sorted copy without mutating input", () => {
  const xs = [3, 1, 2];
  assert.deepEqual(asc(xs), [1, 2, 3]);
  assert.deepEqual(xs, [3, 1, 2]);
});

test("percentile uses nearest-rank on sorted data", () => {
  const s = asc([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(percentile(s, 10), 10);
  assert.equal(percentile(s, 50), 50);
  assert.equal(percentile(s, 90), 90);
  assert.equal(percentile(s, 100), 100);
});

test("percentile handles edges and empty input", () => {
  assert.ok(Number.isNaN(percentile([], 50)));
  assert.equal(percentile([42], 10), 42);
  assert.equal(percentile([42], 90), 42);
});

test("round snaps to a step without float noise", () => {
  assert.equal(round(0.6000000000000001, 0.05), 0.6);
  assert.equal(round(0.123, 0.05), 0.1);
  assert.equal(round(17, 5), 15);
  assert.equal(round(18, 5), 20);
});

test("clamp bounds a value", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});
