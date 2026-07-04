import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

const savedUrl = process.env.SCRAPER_PROXY;
const savedSrc = process.env.SCRAPER_PROXY_SOURCES;
const savedSticky = process.env.SCRAPER_STICKY_LIFETIME;
beforeEach(() => {
  delete process.env.SCRAPER_PROXY;
  delete process.env.SCRAPER_PROXY_SOURCES;
  delete process.env.SCRAPER_STICKY_LIFETIME;
});
afterEach(() => {
  savedUrl === undefined ? delete process.env.SCRAPER_PROXY : (process.env.SCRAPER_PROXY = savedUrl);
  savedSrc === undefined ? delete process.env.SCRAPER_PROXY_SOURCES : (process.env.SCRAPER_PROXY_SOURCES = savedSrc);
  savedSticky === undefined ? delete process.env.SCRAPER_STICKY_LIFETIME : (process.env.SCRAPER_STICKY_LIFETIME = savedSticky);
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

test("SCRAPER_STICKY_LIFETIME pins one IP per scan via a session suffix", () => {
  process.env.SCRAPER_PROXY = "http://user:secret@geo.iproyal.com:12321";
  process.env.SCRAPER_STICKY_LIFETIME = "10m";
  const a = playwrightProxy()!;
  const b = playwrightProxy()!;
  assert.equal(a.server, "http://geo.iproyal.com:12321");
  assert.equal(a.username, "user");
  // password gets a random session id + the configured lifetime appended
  assert.match(a.password!, /^secret_session-[a-z0-9]+_lifetime-10m$/);
  // different scans get different session ids (so they rotate across the pool)
  assert.notEqual(a.password, b.password);
});

test("no sticky suffix is added when SCRAPER_STICKY_LIFETIME is unset", () => {
  process.env.SCRAPER_PROXY = "http://user:secret@geo.iproyal.com:12321";
  assert.equal(playwrightProxy()!.password, "secret");
});
