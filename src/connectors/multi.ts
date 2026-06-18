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
          if (!seen.has(listing.id)) {
            seen.add(listing.id);
            out.push(listing);
          }
        }
      } catch (e: any) {
        // One source failing/timing out (blocked, login, network) must not sink the scan.
        console.error(`[multi] source "${child.source}" failed: ${e?.message ?? e}`);
      }
    }
    return out;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}
