import Anthropic from "@anthropic-ai/sdk";
import type { ProductIdentity, SourceListing } from "../types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/**
 * Turn a messy local listing (vague title + photos) into a structured product
 * identity we can comp against eBay. Photos are the point here: local titles
 * are often useless ("box of tools $40"), so we let the model look at the
 * images to identify the actual product.
 *
 * Returns strict JSON. We cache by listing id upstream so we never re-pay for
 * the same listing.
 */
export async function identifyProduct(listing: SourceListing): Promise<ProductIdentity> {
  const imageBlocks = await buildImageBlocks(listing.imageUrls.slice(0, 4));

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

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system,
    messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .replace(/```json|```/g, "")
    .trim();

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

async function buildImageBlocks(urls: string[]): Promise<Anthropic.ImageBlockParam[]> {
  const blocks: Anthropic.ImageBlockParam[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "image/jpeg";
      if (!type.startsWith("image/")) continue;
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: type as any, data: b64 },
      });
    } catch {
      // skip unreachable images
    }
  }
  return blocks;
}
