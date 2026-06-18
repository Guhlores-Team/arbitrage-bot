import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { notifierStatus, notify, notifyOpportunities } from "../src/notify.js";
import type { OpportunityView } from "../src/view.js";

const realFetch = globalThis.fetch;
const env = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});
beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.ALERT_WEBHOOK_URL;
});

test("notifierStatus reflects configured channels", () => {
  assert.deepEqual(notifierStatus(), { telegram: false, webhook: false, any: false });
  process.env.ALERT_WEBHOOK_URL = "https://hooks.example/x";
  assert.deepEqual(notifierStatus(), { telegram: false, webhook: true, any: true });
});

test("notify is a no-op when nothing is configured", async () => {
  let called = 0;
  globalThis.fetch = (async () => {
    called++;
    return { ok: true } as any;
  }) as typeof fetch;
  assert.equal(await notify("hi"), 0);
  assert.equal(called, 0);
});

test("notify posts to telegram and webhook when configured", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "bot123";
  process.env.TELEGRAM_CHAT_ID = "42";
  process.env.ALERT_WEBHOOK_URL = "https://hooks.example/x";
  const hits: string[] = [];
  globalThis.fetch = (async (input: any) => {
    hits.push(String(input));
    return { ok: true } as any;
  }) as typeof fetch;

  const sent = await notify("hello");
  assert.equal(sent, 2);
  assert.ok(hits.some((u) => u.includes("api.telegram.org/botbot123/sendMessage")));
  assert.ok(hits.some((u) => u === "https://hooks.example/x"));
});

test("notifyOpportunities skips empty and sends for non-empty", async () => {
  process.env.ALERT_WEBHOOK_URL = "https://hooks.example/x";
  let bodies: any[] = [];
  globalThis.fetch = (async (_u: any, init: any) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true } as any;
  }) as typeof fetch;

  assert.equal(await notifyOpportunities({ source: "demo", query: "x" }, []), 0);

  const opp = { title: "Switch", buy: 100, net: 50, marginPct: 0.3, score: 0.8, url: "u" } as OpportunityView;
  const sent = await notifyOpportunities({ source: "demo", query: "switch" }, [opp]);
  assert.equal(sent, 1);
  assert.match(bodies[0].text, /1 new demo deal/);
  assert.match(bodies[0].text, /Switch/);
});
