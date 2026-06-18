import type { ProductIdentity, SourceListing } from "../types.js";
import { complete, llmConfigured, type LlmImage } from "../llm.js";

/**
 * Turn a messy local listing (vague title + photos) into a structured product
 * identity we can comp against eBay. Photos are the point here: local titles
 * are often useless ("box of tools $40"), so we let the model look at the
 * images to identify the actual product.
 *
 * Uses whichever LLM provider is configured (Anthropic or OpenRouter). Returns
 * strict JSON. We cache by listing id upstream so we never re-pay for the same
 * listing.
 */
export async function identifyProduct(listing: SourceListing): Promise<ProductIdentity> {
  // No provider configured → run a heuristic identity so the pipeline (and
  // dashboard) still work offline. Lower confidence reflects no vision/LLM pass.
  if (!llmConfigured()) return heuristicIdentity(listing);

  const images = await buildImages(listing.imageUrls.slice(0, 4));

  const system =
    "You identify the exact resale product from a marketplace listing. " +
    "Use the photos as the primary signal when the title is vague. " +
    "Respond with ONLY a JSON object, no prose, no markdown fences.";

  const prompt = `Listing title: ${listing.rawTitle}
Description: ${listing.description ?? "(none)"}
Asking price: ${listing.price ? `$${listing.price}` : "(unknown)"}

Return JSON with exactly these fields:
{
  "brand": string | null,
  "model": string | null,
  "variant": object | null,         // e.g. {"storage":"256GB","color":"black"}
  "category": string | null,
  "condition": "new"|"like_new"|"good"|"fair"|"for_parts"|"unknown",
  "canonicalCode": string | null,   // model number / style code / UPC if visible
  "confidence": number,             // 0..1 that you identified the real product
  "searchString": string            // clean query to find sold comps, no fluff
}`;

  let text: string;
  try {
    text = (await complete({ system, prompt, images, maxTokens: 1000, model: process.env.IDENTIFY_MODEL }))
      .replace(/```json|```/g, "")
      .trim();
  } catch {
    return { condition: "unknown", confidence: 0, searchString: listing.rawTitle };
  }

  try {
    const j = JSON.parse(text);
    return {
      brand: j.brand ?? undefined,
      model: j.model ?? undefined,
      variant: j.variant ?? undefined,
      category: j.category ?? undefined,
      condition: j.condition ?? "unknown",
      canonicalCode: j.canonicalCode ?? undefined,
      confidence: typeof j.confidence === "number" ? j.confidence : 0,
      searchString: j.searchString || listing.rawTitle,
    };
  } catch {
    // fall back to raw title so the pipeline keeps moving
    return { condition: "unknown", confidence: 0, searchString: listing.rawTitle };
  }
}

/**
 * Title-only product identity used when no ANTHROPIC_API_KEY is set. Strips the
 * common local-listing noise so the search string is comp-able, and guesses
 * condition from obvious phrases. Confidence stays modest on purpose.
 */
function heuristicIdentity(listing: SourceListing): ProductIdentity {
  const t = listing.rawTitle.toLowerCase();
  const condition =
    /sealed|brand new|bnib/.test(t) ? "new" :
    /like new|mint|barely/.test(t) ? "like_new" :
    /for parts|broken|repair|not working/.test(t) ? "for_parts" :
    /fair|scratched|cracked/.test(t) ? "fair" :
    /good|used|gently/.test(t) ? "good" : "unknown";

  const searchString = listing.rawTitle
    .replace(/[—-].*$/, "") // drop trailing " — like new in box" style suffixes
    .replace(/\b(obo|cash only|must go|moving sale|local pickup|firm|price|new|used|like new|barely used|sealed|bundle|w\/|with)\b/gi, "")
    .replace(/[()|$0-9,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || listing.rawTitle;

  return { condition, confidence: 0.4, searchString };
}

async function buildImages(urls: string[]): Promise<LlmImage[]> {
  const images: LlmImage[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "image/jpeg";
      if (!type.startsWith("image/")) continue;
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      images.push({ mediaType: type, dataBase64: b64 });
    } catch {
      // skip unreachable images
    }
  }
  return images;
}
