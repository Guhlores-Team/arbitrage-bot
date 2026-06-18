import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPage } from "../src/connectors/diagnose.js";

test("cards found -> ok", () => {
  assert.equal(classifyPage("https://offerup.com/search?q=x", 12).state, "ok");
});

test("login/checkpoint url -> login_required (even if cards somehow present)", () => {
  assert.equal(classifyPage("https://www.facebook.com/login/?next=...", 0).state, "login_required");
  assert.equal(classifyPage("https://www.facebook.com/checkpoint/123", 5).state, "login_required");
});

test("anti-bot wording with zero cards -> blocked", () => {
  assert.equal(classifyPage("https://offerup.com/search", 0, "Please verify you are human to continue").state, "blocked");
  assert.equal(classifyPage("https://offerup.com/search", 0, "Access Denied — automated traffic").state, "blocked");
});

test("plain empty page -> empty", () => {
  const d = classifyPage("https://offerup.com/search?q=zzz", 0, "No results found for your search");
  assert.equal(d.state, "empty");
});
