import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

const savedUrl = process.env.SCRAPER_PROXY;
const savedSrc = process.env.SCRAPER_PROXY_SOURCES;
beforeEach(() => {
  delete process.env.SCRAPER_PROXY;
  delete process.env.SCRAPER_PROXY_SOURCES;
});
afterEach(() => {
  savedUrl === undefined ? delete process.env.SCRAPER_PROXY : (process.env.SCRAPER_PROXY = savedUrl);
  savedSrc === undefined ? delete process.env.SCRAPER_PROXY_SOURCES : (process.env.SCRAPER_PROXY_SOURCES = savedSrc);
});

const { proxyUrl, playwrightProxy, proxyEnabledFor } = await import("../src/proxy.js");

test("no proxy configured -> everything off", () => {
  assert.equal(proxyUrl(), undefined);
  assert.equal(playwrightProxy(), undefined);
  assert.equal(proxyEnabledFor("craigslist"), false);
});

test("SCRAPER_PROXY_SOURCES scopes which sources are proxied", () => {
  process.env.SCRAPER_PROXY = "http://10.0.0.5:3128";
  process.env.SCRAPER_PROXY_SOURCES = "craigslist,facebook";
  assert.equal(proxyEnabledFor("craigslist"), true);
  assert.equal(proxyEnabledFor("facebook"), true);
  assert.equal(proxyEnabledFor("offerup"), false);
  assert.equal(playwrightProxy("offerup"), undefined);
  assert.ok(playwrightProxy("facebook"));
});

test("SCRAPER_PROXY with no source list proxies everything", () => {
  process.env.SCRAPER_PROXY = "http://10.0.0.5:3128";
  assert.equal(proxyEnabledFor("offerup"), true);
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
