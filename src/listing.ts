import { complete, llmConfigured } from "./llm.js";
import type { OpportunityView } from "./view.js";

/** A ready-to-paste resale listing draft. */
export interface ListingDraft {
  title: string;
  price: number;
  description: string;
}

/**
 * Generate an eBay listing draft for an opportunity you're flipping — a
 * keyword-rich title (≤80 chars, eBay's limit), a suggested price from the
 * resale range, and an honest description. Uses the configured LLM (cheap
 * MATCH_MODEL is fine); falls back to a heuristic draft with no key.
 */
export async function generateListing(o: OpportunityView): Promise<ListingDraft> {
  const price = o.resale || o.resaleHigh || o.resaleLow || 0;
  if (!llmConfigured()) return heuristic(o, price);

  const prompt = `Write an eBay resale listing for this item.
Product: ${[o.brand, o.model, o.title].filter(Boolean).join(" ")}
Condition: ${o.condition}
Suggested price: $${price} (market range $${o.resaleLow}–$${o.resaleHigh})

Return ONLY JSON, no prose:
{"title": "<=80 char keyword-rich eBay title", "price": <number>, "description": "3-5 sentences, honest about condition, mentions what's included"}`;

  try {
    const text = (await complete({ prompt, maxTokens: 500, model: process.env.MATCH_MODEL }))
      .replace(/```json|```/g, "")
      .trim();
    const j = JSON.parse(text);
    return {
      title: String(j.title || o.title).slice(0, 80),
      price: Number(j.price) || price,
      description: String(j.description || "").trim() || heuristic(o, price).description,
    };
  } catch {
    return heuristic(o, price);
  }
}

function heuristic(o: OpportunityView, price: number): ListingDraft {
  const title = [o.brand, o.model, o.title].filter(Boolean).join(" ").slice(0, 80) || o.title;
  const cond = o.condition?.replace(/_/g, " ") ?? "used";
  return {
    title,
    price,
    description: `${o.title}. Condition: ${cond}. Ships fast, carefully packed. Priced to sell — see photos for exact condition. Questions welcome.`,
  };
}
