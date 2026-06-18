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
  /** anchor aria-label, often "Title  $Price  in City, ST" — the best signal */
  ariaLabel?: string;
  /** img alt text, often a clean product title */
  imgAlt?: string;
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
/** "Title  $Price  in City, ST" -> title (everything before the price). */
function titleFromAria(aria?: string): string | undefined {
  if (!aria) return undefined;
  const t = aria.replace(/\s+/g, " ").trim();
  const cut = t.split(/\s+(?=\$|free\b)/i)[0].trim();
  return cut || undefined;
}

/** "… in City, ST" -> "City, ST". */
function locationFromAria(aria?: string): string | undefined {
  const m = aria?.replace(/\s+/g, " ").match(/\bin\s+([A-Za-z .'\-]+,\s*[A-Z]{2})\s*$/);
  return m ? m[1].trim() : undefined;
}

export function parseCard(raw: RawCard): ParsedCard {
  const texts = raw.texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Price: trust pure-price fragments / the aria-label first, then a "$X Title"
  // blob's leading price.
  let price = 0;
  for (const t of [...texts, raw.ariaLabel ?? ""]) {
    if (/\$|^free\b/i.test(t)) {
      price = parsePrice(t.match(LEADING_PRICE)?.[1] ?? t);
      if (price > 0 || /^free\b/i.test(t.trim())) break;
    }
  }

  // Title: prefer the clean structured signals (img alt, aria-label), then a
  // span with no "$" in it (the concatenated blob always contains the merged
  // price, so excluding "$" drops it), then a leading-price strip as last resort.
  const cleanSpans = texts.filter((t) => !t.includes("$") && !looksLikeLocation(t));
  const blobTitle = (() => {
    const blob = texts.find((t) => LEADING_PRICE.test(t));
    return blob?.replace(LEADING_PRICE, "").trim();
  })();
  const title = (
    (raw.imgAlt && raw.imgAlt.trim()) ||
    titleFromAria(raw.ariaLabel) ||
    cleanSpans.sort((a, b) => b.length - a.length)[0] ||
    blobTitle ||
    texts[0] ||
    "(untitled)"
  ).slice(0, 140);

  const location = locationFromAria(raw.ariaLabel) || texts.find(looksLikeLocation);

  return { id: raw.id, url: raw.url, title, price, location, image: pickImage(raw.src, raw.srcset) };
}
