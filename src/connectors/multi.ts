import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";

/**
 * Runs several source connectors for one query and merges the results — "scan
 * everywhere at once". Children run sequentially (so browser-based sources never
 * open multiple Chromium contexts at the same time) and are isolated: if one
 * source is blocked or erroring, the others still return. De-duped by listing id.
 */
export class MultiSourceConnector implements SourceConnector {
  readonly source: string;

  constructor(
    private children: SourceConnector[],
    label?: string,
  ) {
    this.source = label ?? children.map((c) => c.source).join("+");
  }

  // (search below)

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const seen = new Set<string>();
    const out: SourceListing[] = [];
    const perSourceMs = Number(process.env.SOURCE_TIMEOUT_MS ?? 60_000);
    for (const child of this.children) {
      try {
        const listings = await withTimeout(child.search(q), perSourceMs, child.source);
        for (const listing of listings) {
          // De-dupe on id AND normalized URL so the same item arriving via two
          // paths (e.g. in-process + Apify) collapses to one card.
          const keys = dedupeKeys(listing);
          if (keys.some((k) => seen.has(k))) continue;
          for (const k of keys) seen.add(k);
          out.push(listing);
        }
      } catch (e: any) {
        // One source failing/timing out (blocked, login, network) must not sink the scan.
        console.error(`[multi] source "${child.source}" failed: ${e?.message ?? e}`);
      }
    }
    return out;
  }
}

/** Identity keys for de-duping a listing: its id plus a normalized URL. */
function dedupeKeys(l: SourceListing): string[] {
  const keys = [`id:${l.id}`];
  const url = normalizeUrl(l.url);
  if (url) keys.push(`url:${url}`);
  return keys;
}

/** Strip query/hash/trailing slash so the same item URL matches across sources.
 *  Returns undefined for non-URL-shaped values (e.g. placeholders) so only real
 *  links cross-collapse — ids still de-dupe everything else. */
function normalizeUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  let host = "";
  let path = "/";
  try {
    const u = new URL(raw);
    host = u.host;
    path = u.pathname;
  } catch {
    const bare = raw.replace(/^https?:\/\//i, "");
    if (!/^[\w.-]+\.[a-z]{2,}/i.test(bare)) return undefined; // needs a domain to count as a URL
    const [h, ...rest] = bare.split(/[?#]/)[0].split("/");
    host = h;
    path = "/" + rest.join("/");
  }
  if (!host) return undefined;
  return `${host}${path}`.replace(/\/+$/, "").toLowerCase();
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}
