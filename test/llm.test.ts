import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});
beforeEach(() => {
  delete process.env.LLM_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

// fresh import per test so module-level env reads (none here, all runtime) are clean
const { provider, llmConfigured, defaultModel, llmInfo } = await import("../src/llm.js");

test("defaults to anthropic provider", () => {
  assert.equal(provider(), "anthropic");
  assert.equal(llmConfigured(), false);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  assert.equal(llmConfigured(), true);
});

test("openrouter provider keys off OPENROUTER_API_KEY", () => {
  process.env.LLM_PROVIDER = "openrouter";
  assert.equal(provider(), "openrouter");
  assert.equal(llmConfigured(), false);
  process.env.OPENROUTER_API_KEY = "or-x";
  assert.equal(llmConfigured(), true);
});

test("model defaults differ by provider and respect env overrides", () => {
  assert.match(defaultModel("anthropic"), /claude/);
  assert.match(defaultModel("openrouter"), /\//); // openrouter slugs are "vendor/model"
  process.env.OPENROUTER_MODEL = "openai/gpt-4o-mini";
  assert.equal(defaultModel("openrouter"), "openai/gpt-4o-mini");
});

test("llmInfo summarizes provider/model/configured", () => {
  process.env.LLM_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "or-x";
  const info = llmInfo();
  assert.equal(info.provider, "openrouter");
  assert.equal(info.configured, true);
  assert.ok(info.model);
});
