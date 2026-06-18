import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";

/**
 * Redundant source: try several connectors for the SAME marketplace in order and
 * return the first one that actually yields listings. This is the "don't fail"
 * layer — e.g. the free in-process Facebook scraper first, and if it's blocked,
 * logged out, or returns nothing, fall back to the Apify actor (residential
 * proxy). You only pay for the paid path when the free one comes up empty.
 *
 * Children are tried sequentially (never concurrently, so browser sources don't
 * open multiple Chromium contexts). A child that throws OR returns zero listings
 * is treated as a miss and the next child is tried. If every child misses, the
 * last error is surfaced so the scan still reports why.
 */
export class FailoverSourceConnector implements SourceConnector {
  readonly source: string;

  constructor(
    private children: SourceConnector[],
    label?: string,
  ) {
    this.source = label ?? children[0]?.source ?? "failover";
  }

  async search(q: SearchQuery): Promise<SourceListing[]> {
    let lastErr: unknown;
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      try {
        const listings = await child.search(q);
        if (listings.length > 0) {
          if (i > 0) console.error(`[failover] "${this.source}" served by fallback #${i} (${child.source})`);
          // Re-tag to the unified source name so the dashboard groups them as one source.
          return listings.map((l) => ({ ...l, source: this.source as SourceListing["source"] }));
        }
      } catch (e: any) {
        lastErr = e;
        console.error(`[failover] "${this.source}" path ${i} (${child.source}) failed: ${e?.message ?? e}`);
      }
    }
    if (lastErr) throw lastErr; // every path errored — surface why
    return []; // every path returned empty (no error) — genuinely nothing found
  }
}
