import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { geoContextOptions } from "../src/connectors/stealth.js";

afterEach(() => {
  delete process.env.SCRAPER_LAT;
  delete process.env.SCRAPER_LNG;
});

test("returns {} when no coords are set (falls back to IP default)", () => {
  assert.deepEqual(geoContextOptions(), {});
});

test("returns geolocation + permission grant when SCRAPER_LAT/LNG are set", () => {
  process.env.SCRAPER_LAT = "39.9612";
  process.env.SCRAPER_LNG = "-82.9988";
  const g = geoContextOptions();
  assert.deepEqual(g.geolocation, { latitude: 39.9612, longitude: -82.9988, accuracy: 50 });
  assert.deepEqual(g.permissions, ["geolocation"]);
});

test("ignores partial/invalid coords", () => {
  process.env.SCRAPER_LAT = "39.9612";
  // no SCRAPER_LNG
  assert.deepEqual(geoContextOptions(), {});
  process.env.SCRAPER_LNG = "not-a-number";
  assert.deepEqual(geoContextOptions(), {});
});
