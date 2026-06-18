/**
 * Shared, Node-side parsing for browser-scraped listing cards.
 *
 * The browser-context extractors (Facebook, OfferUp) only collect raw, stable
 * bits — the item link, the visible text fragments, and image attributes — and
 * hand them here. Keeping the messy price/title/location heuristics in plain
 * Node functions means they're unit-tested instead of trapped inside a
 * page.evaluate() we can't reach.
 */

export interface RawCard {
  id: string;
  url: string;
  /** visible text fragments from the card, in DOM order */
  texts: string[];
  /** img src / srcset as found, for best-image selection */
  src?: string;
  srcset?: string;
}

export interface ParsedCard {
  id: string;
  url: string;
  title: string;
  price: number;
  location?: string;
  image?: string;
}

/** Parse a price from marketplace text. "Free" -> 0; ranges take the low end. */
export function parsePrice(text: string): number {
  const t = text.trim();
  if (/^free\b/i.test(t)) return 0;
  // first $-amount, allowing commas and optional decimals
  const m = t.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  return m ? Math.round(Number(m[1].replace(/,/g, ""))) : 0;
}

/** Does a text fragment look like a "City, ST" / "City, State" place? */
function looksLikeLocation(t: string): boolean {
  if (!t || t.length > 40) return false;
  // Require a comma followed by a capitalized region — distinctive enough that
  // it won't swallow a capitalized product title.
  return /,\s*[A-Z][a-zA-Z]/.test(t);
}

const PURE_PRICE = /^(free|\$\s?[\d,]+(?:\.\d{1,2})?)$/i;
const LEADING_PRICE = /^\s*(free|\$\s?[\d,]+(?:\.\d{1,2})?)\s+/i;

/** Pick the highest-resolution image from a srcset, else fall back to src. */
export function pickImage(src?: string, srcset?: string): string | undefined {
  if (srcset) {
    const best = srcset
      .split(",")
      .map((part) => {
        const [url, w] = part.trim().split(/\s+/);
        return { url, w: w ? parseInt(w) : 0 };
      })
      .filter((x) => x.url)
      .sort((a, b) => b.w - a.w)[0];
    if (best?.url) return best.url;
  }
  return src || undefined;
}

/**
 * Turn a raw card into structured fields. Heuristic but deterministic:
 *   price   = first $-bearing fragment ("Free" -> 0)
 *   title   = longest non-price, non-location fragment
 *   location= a "City, ST"-looking fragment, else the last short non-title text
 */
export function parseCard(raw: RawCard): ParsedCard {
  const texts = raw.texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Pull the price from a price-only fragment or a "$X Title…" blob, and keep
  // the remaining text as title/location candidates.
  let price = 0;
  const parts: string[] = [];
  for (const t of texts) {
    if (PURE_PRICE.test(t)) {
      if (!price) price = parsePrice(t);
      continue;
    }
    const lead = t.match(LEADING_PRICE);
    if (lead) {
      if (!price) price = parsePrice(lead[1]);
      const rest = t.slice(lead[0].length).trim();
      if (rest) parts.push(rest);
    } else {
      parts.push(t);
    }
  }

  const location = parts.find(looksLikeLocation);
  const titleCandidates = parts.filter((t) => t !== location);
  const title =
    titleCandidates.sort((a, b) => b.length - a.length)[0]?.slice(0, 140) ||
    parts[0]?.slice(0, 140) ||
    "(untitled)";

  return { id: raw.id, url: raw.url, title, price, location, image: pickImage(raw.src, raw.srcset) };
}
