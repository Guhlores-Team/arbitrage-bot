import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/store.js";

function freshStore() {
  return new JsonStore(join(tmpdir(), `arb-sweep-${Date.now()}-${Math.random().toString(36).slice(2)}.json`));
}

test("addSweep trims keywords, defaults cursor/perTick/enabled", async () => {
  const s = freshStore();
  const sw = await s.addSweep({
    label: "Electronics",
    keywords: [" nintendo switch ", "", "dyson vacuum"],
    source: "demo",
    intervalMin: 30,
    perTick: 0,
  });
  assert.deepEqual(sw.keywords, ["nintendo switch", "dyson vacuum"]);
  assert.equal(sw.cursor, 0);
  assert.equal(sw.perTick, 1); // clamped up from 0
  assert.equal(sw.enabled, true);
  assert.ok(sw.id.startsWith("sw_"));
});

test("update + remove sweep persists", async () => {
  const s = freshStore();
  const sw = await s.addSweep({ label: "X", keywords: ["a"], source: "demo", intervalMin: 30, perTick: 1 });
  await s.updateSweep(sw.id, { cursor: 3, enabled: false, totalFound: 5 });
  let got = (await s.listSweeps())[0];
  assert.equal(got.cursor, 3);
  assert.equal(got.enabled, false);
  assert.equal(got.totalFound, 5);

  assert.equal(await s.removeSweep(sw.id), true);
  assert.equal((await s.listSweeps()).length, 0);
});

test("sweeps persist across store instances (same file)", async () => {
  const file = join(tmpdir(), `arb-sweep-persist-${Date.now()}.json`);
  const a = new JsonStore(file);
  await a.addSweep({ label: "Keep", keywords: ["a", "b"], source: "demo", intervalMin: 15, perTick: 2 });
  const b = new JsonStore(file);
  const sweeps = await b.listSweeps();
  assert.equal(sweeps.length, 1);
  assert.equal(sweeps[0].label, "Keep");
});
