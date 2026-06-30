import Anthropic from "@anthropic-ai/sdk";

/**
 * Provider-agnostic LLM access for the identify + match steps.
 *
 * Default is Anthropic-native (the @anthropic-ai/sdk). Set LLM_PROVIDER=openrouter
 * to route through OpenRouter's OpenAI-compatible API instead — one key, many
 * models (Claude, GPT, Gemini, Llama, …), and per-step model routing so you can
 * use a strong vision model to identify and a cheap model to verify matches.
 *
 *   LLM_PROVIDER=openrouter
 *   OPENROUTER_API_KEY=...
 *   OPENROUTER_MODEL=anthropic/claude-sonnet-4     # default; pick any OpenRouter id
 *   IDENTIFY_MODEL=... MATCH_MODEL=...             # optional per-step overrides
 */

export type Provider = "anthropic" | "openrouter";

export interface LlmImage {
  mediaType: string; // e.g. "image/jpeg"
  dataBase64: string;
}

export interface CompleteParams {
  system?: string;
  prompt: string;
  images?: LlmImage[];
  maxTokens?: number;
  model?: string; // per-call override
}

export function provider(): Provider {
  return (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase() === "openrouter" ? "openrouter" : "anthropic";
}

/** Is the active provider usable (has a key)? Callers fall back to heuristics if not. */
export function llmConfigured(): boolean {
  return provider() === "openrouter" ? Boolean(process.env.OPENROUTER_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
}

export function defaultModel(pv: Provider = provider()): string {
  return pv === "openrouter"
    ? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite" // cheap + vision-capable
    : process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
}

export function llmInfo() {
  const pv = provider();
  return { provider: pv, configured: llmConfigured(), model: defaultModel(pv) };
}

/** Run a single completion through the configured provider; returns text. */
export async function complete(p: CompleteParams): Promise<string> {
  return provider() === "openrouter" ? completeOpenRouter(p) : completeAnthropic(p);
}

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  return (_client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
}

async function completeAnthropic(p: CompleteParams): Promise<string> {
  const content: any[] = [
    ...(p.images ?? []).map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.dataBase64 },
    })),
    { type: "text", text: p.prompt },
  ];
  const msg = await anthropic().messages.create({
    model: p.model ?? defaultModel("anthropic"),
    max_tokens: p.maxTokens ?? 1000,
    system: p.system,
    messages: [{ role: "user", content }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

async function completeOpenRouter(p: CompleteParams): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const model = p.model ?? defaultModel("openrouter");

  const userContent: any[] = [{ type: "text", text: p.prompt }];
  for (const img of p.images ?? []) {
    userContent.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` } });
  }
  const messages: any[] = [];
  if (p.system) messages.push({ role: "system", content: p.system });
  messages.push({ role: "user", content: userContent });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/guhlores-team/arbitrage-bot",
      "X-Title": "arbitrage-engine",
    },
    body: JSON.stringify({ model, max_tokens: p.maxTokens ?? 1000, messages }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}
