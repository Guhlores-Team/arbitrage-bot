import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLot } from "../src/pipeline.js";

test("detects explicit lots and pulls quantity", () => {
  assert.deepEqual(detectLot("Lot of 20 PS2 games"), { isLot: true, qty: 20 });
  assert.deepEqual(detectLot("Nintendo DS bundle (12)"), { isLot: true, qty: 12 });
  assert.deepEqual(detectLot("15 Xbox 360 games"), { isLot: true, qty: 15 });
  assert.deepEqual(detectLot("Comic book lot x50"), { isLot: true, qty: 50 });
});

test("flags bulk/wholesale wording even without a number", () => {
  assert.equal(detectLot("Huge bulk video game lot").isLot, true);
  assert.equal(detectLot("Wholesale sneakers pallet").isLot, true);
});

test("leaves single items alone", () => {
  assert.deepEqual(detectLot("Nintendo Switch OLED console"), { isLot: false, qty: undefined });
  assert.deepEqual(detectLot("PlayStation 5 disc edition"), { isLot: false, qty: undefined });
  assert.equal(detectLot("Apple Watch Series 8 45mm").isLot, false);
});
