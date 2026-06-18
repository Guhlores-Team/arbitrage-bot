import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

const saved = process.env.SCRAPER_PROXY;
beforeEach(() => delete process.env.SCRAPER_PROXY);
afterEach(() => {
  if (saved === undefined) delete process.env.SCRAPER_PROXY;
  else process.env.SCRAPER_PROXY = saved;
});

const { proxyUrl, playwrightProxy, proxyDispatcher } = await import("../src/proxy.js");

test("no proxy configured -> everything undefined", () => {
  assert.equal(proxyUrl(), undefined);
  assert.equal(playwrightProxy(), undefined);
  assert.equal(proxyDispatcher(), undefined);
});

test("playwrightProxy splits credentials out of the URL", () => {
  process.env.SCRAPER_PROXY = "http://user:p%40ss@gw.proxy.io:8080";
  const p = playwrightProxy();
  assert.deepEqual(p, { server: "http://gw.proxy.io:8080", username: "user", password: "p@ss" });
});

test("playwrightProxy works without auth", () => {
  process.env.SCRAPER_PROXY = "http://10.0.0.5:3128";
  assert.deepEqual(playwrightProxy(), { server: "http://10.0.0.5:3128", username: undefined, password: undefined });
});

test("proxyDispatcher is created when configured", () => {
  process.env.SCRAPER_PROXY = "http://10.0.0.5:3128";
  assert.ok(proxyDispatcher(), "expected a dispatcher instance");
});
