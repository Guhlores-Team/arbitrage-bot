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

    // Stage 2: LLM verification (cached). Without an API key, fall back to a
    // token-overlap heuristic so the pipeline still runs offline.
    const key = `${identity.searchString}::${comp.id}`;
    let verdict = verdictCache.get(key);
    if (!verdict) {
      verdict = process.env.ANTHROPIC_API_KEY
        ? await llmVerify(identity, comp)
        : heuristicVerify(identity, comp);
      verdictCache.set(key, verdict);
    }
    if (verdict.isMatch) results.push({ comp, verdict });
  }

  return results;
}

/**
 * Offline match check: Jaccard token overlap between the search string and the
 * comp title. Coarse but keyed to the same threshold idea — enough to make the
 * demo/no-key path produce sensible matches without paying for an LLM.
 */
function heuristicVerify(identity: ProductIdentity, comp: SoldComp): MatchVerdict {
  const tokens = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1));
  const a = tokens(identity.searchString);
  const b = tokens(comp.title);
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter || 1;
  const confidence = inter / union;
  return {
    isMatch: confidence >= 0.3,
    confidence,
    variantMatch: confidence >= 0.6,
    conditionDelta: 0,
    reasoning: `token overlap ${(confidence * 100).toFixed(0)}% (offline heuristic)`,
  };
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
