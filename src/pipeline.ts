import type { CompConnector, SourceConnector, SearchQuery } from "./connectors/connector.js";
import { identifyProduct } from "./extraction/identify.js";
import { verifyMatches } from "./matching/match.js";
import { computeMargin } from "./valuation/value.js";
import { scoreOpportunity, THRESHOLDS, type Thresholds } from "./scoring/score.js";
import { median } from "./stats.js";
import { log } from "./log.js";
import type { Opportunity, MarketStat, SoldComp } from "./types.js";

export interface PipelineOpts {
  /** skip identify/comp when the source price already exceeds this cap */
  hardPriceCap?: number;
  /** only run LLM identify when there's a plausible gap vs a quick price guess */
  identifyConfidenceFloor?: number;
  /** override scoring thresholds (dashboard tuning); defaults to env THRESHOLDS */
  thresholds?: Thresholds;
}

/**
 * Funnel counters: how many listings dropped at each stage and why. Surfaced by
 * the debug console so you can see whether a dry scan died on price, comps, or
 * matching — and the per-run cost (how many comp lookups it made).
 */
export interface PipelineStats {
  listings: number; // pulled from the source
  pricedOut: number; // skipped: over hardPriceCap
  offTopic: number; // skipped: identified product unrelated to the query (junk pre-filter)
  noComps: number; // skipped: no usable comps for the identity
  askAboveMedian: number; // skipped: asking >= median comp (no headroom)
  noMatch: number; // skipped: no comp verified as the same product
  scored: number; // produced an opportunity (pass or fail)
  passed: number; // opportunities that cleared thresholds
  compLookups: number; // comp queries made (your SerpApi/eBay call count)
  durationMs: number;
}

function emptyStats(): PipelineStats {
  return { listings: 0, pricedOut: 0, offTopic: 0, noComps: 0, askAboveMedian: 0, noMatch: 0, scored: 0, passed: 0, compLookups: 0, durationMs: 0 };
}

const STOPWORDS = new Set(["the", "a", "an", "for", "with", "and", "of", "in", "to", "new", "used", "lot"]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Conservative junk pre-filter: skip a listing BEFORE spending a comp search
 * when the identified product shares NO meaningful token with the search query
 * (e.g. an "Apple Watch … Nintendo switch" keyword-stuffed listing identifies as
 * an Apple Watch — not what we searched for). Only the zero-overlap case is
 * dropped, so legitimate items are never filtered. Disable with
 * PREFILTER_OFFTOPIC=false.
 */
function isOffTopic(query: string, identity: { searchString: string; brand?: string; model?: string }): boolean {
  if ((process.env.PREFILTER_OFFTOPIC ?? "true") === "false") return false;
  const q = new Set(tokenize(query));
  if (q.size === 0) return false; // no usable query terms → don't filter
  const hay = tokenize([identity.searchString, identity.brand ?? "", identity.model ?? ""].join(" "));
  return !hay.some((w) => q.has(w));
}

/**
 * source -> (price pre-filter) -> identify -> sold comps -> verify match ->
 * margin -> score. Returns scored opportunities, best first.
 *
 * The price pre-filter before identify/match is the main cost lever: cheap
 * listings with no possible upside never reach the paid LLM steps.
 */
export async function runPipeline(
  source: SourceConnector,
  comper: CompConnector,
  query: SearchQuery,
  opts: PipelineOpts = {},
): Promise<Opportunity[]> {
  return (await runPipelineDetailed(source, comper, query, opts)).opportunities;
}

/**
 * Same pipeline, but also returns the funnel {@link PipelineStats}. Use this
 * (over {@link runPipeline}) when you want to see why listings dropped or how
 * many comp lookups a scan cost — the debug console and tests do.
 */
export async function runPipelineDetailed(
  source: SourceConnector,
  comper: CompConnector,
  query: SearchQuery,
  opts: PipelineOpts = {},
): Promise<{ opportunities: Opportunity[]; stats: PipelineStats }> {
  const t0 = Date.now();
  const stats = emptyStats();
  const listings = await source.search(query);
  stats.listings = listings.length;
  log.debug("pipeline: source listings", { source: source.source, count: listings.length });
  const opportunities: Opportunity[] = [];

  // Process listings concurrently (the identify/comp steps are I/O-bound and the
  // dominant latency). Cap with PIPELINE_CONCURRENCY so we don't hammer the
  // vision API / comp source. Stats + opportunities mutate safely on JS's single
  // thread; results are sorted at the end so processing order doesn't matter.
  const concurrency = Math.max(1, Number(process.env.PIPELINE_CONCURRENCY ?? 5));

  const processListing = async (listing: (typeof listings)[number]): Promise<void> => {
    if (opts.hardPriceCap && listing.price > opts.hardPriceCap) {
      stats.pricedOut++;
      log.debug("skip: over price cap", { id: listing.id, price: listing.price, cap: opts.hardPriceCap });
      return;
    }

    // 1. identify the real product (vision + text)
    const identity = await identifyProduct(listing);

    // 1a. conservative junk pre-filter: skip clearly off-topic items before paying
    if (isOffTopic(query.query, identity)) {
      stats.offTopic++;
      log.debug("skip: off-topic (junk pre-filter)", { id: listing.id, query: query.query, identified: identity.searchString });
      return;
    }

    // 2. pull sold comps from the sell market (the paid call — count it)
    stats.compLookups++;
    const rawComps = (await comper.getSoldComps(identity.searchString, 20)).filter(
      (c) => Number.isFinite(c.soldPrice) && c.soldPrice > 0,
    );
    if (rawComps.length === 0) {
      stats.noComps++;
      log.debug("skip: no usable comps", { id: listing.id, q: identity.searchString });
      return;
    }

    // 2a. cheap price pre-filter: if asking >= median sold, skip the LLM verify
    const quickMedian = median(rawComps.map((c) => c.soldPrice));
    if (listing.price > 0 && listing.price >= quickMedian) {
      stats.askAboveMedian++;
      log.debug("skip: asking >= median comp", { id: listing.id, price: listing.price, median: quickMedian });
      return;
    }

    // 3. verify which comps truly match (LLM rerank, cached)
    const verified = await verifyMatches(identity, rawComps);
    if (verified.length === 0) {
      stats.noMatch++;
      log.debug("skip: no verified match", { id: listing.id, q: identity.searchString });
      return;
    }
    const matchedComps = verified.map((v) => v.comp);
    const matchConfidence = avg(verified.map((v) => v.verdict.confidence));
    // typical condition gap between the comps and our item (signed median)
    const conditionDelta = median(verified.map((v) => v.verdict.conditionDelta));

    // 4. fee-adjusted, condition-adjusted margin. Lots are valued as qty × per-item
    //    (a "$5 — 20 games" bundle isn't a $5 single item).
    const lot = detectLot(listing.rawTitle);
    const margin = computeMargin(listing.price, matchedComps, identity.category, undefined, conditionDelta, lot.isLot ? lot.qty ?? 1 : 1);

    // 5. score
    const { score, passes, flags } = scoreOpportunity(
      {
        margin,
        matchConfidence,
        identityConfidence: identity.confidence,
        compCount: matchedComps.length,
        buyCostKnown: listing.price > 0,
      },
      opts.thresholds ?? THRESHOLDS,
    );

    // resale-confidence flags: rougher comp basis / discount / dispersion
    if (comper.basis === "ask") flags.push("resale based on active asks (estimate, discounted)");
    if (comper.basis === "mock") flags.push("mock comps — not real resale data");
    if (margin.conditionDiscount > 0) flags.push(`condition discount −$${margin.conditionDiscount} vs comps`);
    if (margin.spread > 0.6) flags.push("wide price spread — resale uncertain");
    // Lot/bundle guard: flag it so the operator knows the value is qty × comp.
    // When a quantity was parsed, the margin above already reflects qty × per-item.
    if (lot.isLot) flags.push(lot.qty ? `LOT ×${lot.qty} — valued as ${lot.qty} × per-item comp` : "LOT — comps are per-item; value ≈ qty × comp");

    stats.scored++;
    if (passes) stats.passed++;
    opportunities.push({
      sourceListing: listing,
      identity,
      referencePrice: margin.referencePrice,
      resaleLow: margin.resaleLow,
      resaleMid: margin.resaleMid,
      resaleHigh: margin.resaleHigh,
      compCount: matchedComps.length,
      marketBreakdown: marketBreakdown(matchedComps),
      matchConfidence,
      estimatedFees: margin.estimatedFees,
      estimatedShipping: margin.estimatedShipping,
      netProfit: margin.netProfit,
      marginPct: margin.marginPct,
      score,
      flags: passes ? flags : [...flags, "DOES NOT PASS THRESHOLDS"],
    });
  };

  await mapLimit(listings, concurrency, processListing);

  stats.durationMs = Date.now() - t0;
  log.info("pipeline: funnel", stats);
  return { opportunities: opportunities.sort((a, b) => b.score - a.score), stats };
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e: any) {
        log.warn("pipeline: listing failed", { error: e?.message ?? String(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Detect a multi-item lot/bundle and best-effort the quantity. Conservative on
 * quantity so model numbers ("Xbox 360", "PS3") aren't mistaken for counts: only
 * explicit lot/bundle counts, "(N)", "xN", or a LEADING count + a unit word.
 */
export function detectLot(title: string): { isLot: boolean; qty?: number } {
  const t = title.toLowerCase();
  const keyword = /\b(lot|bundle|bulk|wholesale|job\s?lot|pack)\b/.test(t);
  const UNIT = /\b(games?|cards?|items?|pcs|pieces?|books?|figures?|comics?|movies?|dvds?|cds?|records?|vinyls?)\b/;
  let qty: number | undefined;
  const explicit =
    t.match(/\b(?:lot|bundle|set|pack)\s+(?:of\s+)?(\d{1,3})\b/) ||
    t.match(/\b(?:qty|quantity)\s*:?\s*(\d{1,3})\b/) ||
    t.match(/\((\d{1,3})\)/) ||
    t.match(/\bx\s?(\d{1,3})\b/);
  const leading = t.match(/^\s*(\d{1,3})\s+[a-z]/);
  if (explicit) qty = Number(explicit[1]);
  else if (leading && UNIT.test(t) && Number(leading[1]) >= 3) qty = Number(leading[1]);
  const isLot = keyword || qty != null;
  return { isLot, qty: isLot ? qty : undefined };
}

/** Group matched comps by sell market with a count + median price each. */
function marketBreakdown(comps: SoldComp[]): MarketStat[] {
  const by = new Map<string, number[]>();
  for (const c of comps) {
    const m = c.market ?? "ebay";
    (by.get(m) ?? by.set(m, []).get(m)!).push(c.soldPrice);
  }
  return [...by.entries()]
    .map(([market, prices]) => ({ market, count: prices.length, median: Math.round(median(prices)) }))
    .sort((a, b) => b.count - a.count);
}
export { THRESHOLDS };
