import Anthropic from "@anthropic-ai/sdk";
import type { MatchVerdict, ProductIdentity, SoldComp } from "../types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// Simple in-process verdict cache: (identity.searchString + comp.id) -> verdict.
// Swap for a DB/Redis cache when you persist.
const verdictCache = new Map<string, MatchVerdict>();

/**
 * Decide which sold comps genuinely match the identified product, and return
 * the verified comps with their match confidence.
 *
 * Two-stage by design:
 *   Stage 1 (cheap): if we have a canonicalCode, trust it and skip the LLM.
 *   Stage 2 (LLM):   otherwise verify each candidate with a strict-JSON check.
 *
 * Caller is expected to have already price-filtered (don't bother matching
 * listings with no possible margin) — that pre-filter is the biggest cost saver.
 */
export async function verifyMatches(
  identity: ProductIdentity,
  comps: SoldComp[],
): Promise<{ comp: SoldComp; verdict: MatchVerdict }[]> {
  const results: { comp: SoldComp; verdict: MatchVerdict }[] = [];

  for (const comp of comps) {
    // Stage 1: canonical code is a hard join — no LLM needed.
    if (identity.canonicalCode && comp.title.toLowerCase().includes(identity.canonicalCode.toLowerCase())) {
      results.push({
        comp,
        verdict: { isMatch: true, confidence: 0.97, variantMatch: true, conditionDelta: 0, reasoning: "canonical code match" },
      });
      continue;
    }

    // Stage 2: LLM verification (cached).
    const key = `${identity.searchString}::${comp.id}`;
    let verdict = verdictCache.get(key);
    if (!verdict) {
      verdict = await llmVerify(identity, comp);
      verdictCache.set(key, verdict);
    }
    if (verdict.isMatch) results.push({ comp, verdict });
  }

  return results;
}

async function llmVerify(identity: ProductIdentity, comp: SoldComp): Promise<MatchVerdict> {
  const prompt = `Are these the SAME resale product?

PRODUCT A (item to flip):
brand=${identity.brand ?? "?"} model=${identity.model ?? "?"} variant=${JSON.stringify(identity.variant ?? {})} condition=${identity.condition}

PRODUCT B (sold comp): "${comp.title}" condition=${comp.condition}

Respond with ONLY JSON:
{"isMatch":bool,"confidence":0..1,"variantMatch":bool,"conditionDelta":int,"reasoning":string}
conditionDelta = (B condition rank) - (A condition rank), ranks: new=4 like_new=3 good=2 fair=1 for_parts=0.`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").replace(/```json|```/g, "").trim();
    const j = JSON.parse(text);
    return {
      isMatch: !!j.isMatch,
      confidence: typeof j.confidence === "number" ? j.confidence : 0,
      variantMatch: !!j.variantMatch,
      conditionDelta: typeof j.conditionDelta === "number" ? j.conditionDelta : 0,
      reasoning: String(j.reasoning ?? ""),
    };
  } catch {
    return { isMatch: false, confidence: 0, variantMatch: false, conditionDelta: 0, reasoning: "verify failed" };
  }
}
