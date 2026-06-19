import type { CompConnector, SourceConnector, SearchQuery } from "./connectors/connector.js";
import { identifyProduct } from "./extraction/identify.js";
import { verifyMatches } from "./matching/match.js";
import { computeMargin } from "./valuation/value.js";
import { scoreOpportunity, THRESHOLDS, type Thresholds } from "./scoring/score.js";
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
  noComps: number; // skipped: no usable comps for the identity
  askAboveMedian: number; // skipped: asking >= median comp (no headroom)
  noMatch: number; // skipped: no comp verified as the same product
  scored: number; // produced an opportunity (pass or fail)
  passed: number; // opportunities that cleared thresholds
  compLookups: number; // comp queries made (your SerpApi/eBay call count)
  durationMs: number;
}

function emptyStats(): PipelineStats {
  return { listings: 0, pricedOut: 0, noComps: 0, askAboveMedian: 0, noMatch: 0, scored: 0, passed: 0, compLookups: 0, durationMs: 0 };
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

  for (const listing of listings) {
    if (opts.hardPriceCap && listing.price > opts.hardPriceCap) {
      stats.pricedOut++;
      log.debug("skip: over price cap", { id: listing.id, price: listing.price, cap: opts.hardPriceCap });
      continue;
    }

    // 1. identify the real product (vision + text)
    const identity = await identifyProduct(listing);

    // 2. pull sold comps from the sell market (the paid call — count it)
    stats.compLookups++;
    const rawComps = (await comper.getSoldComps(identity.searchString, 20)).filter(
      (c) => Number.isFinite(c.soldPrice) && c.soldPrice > 0,
    );
    if (rawComps.length === 0) {
      stats.noComps++;
      log.debug("skip: no usable comps", { id: listing.id, q: identity.searchString });
      continue;
    }

    // 2a. cheap price pre-filter: if asking >= median sold, skip the LLM verify
    const quickMedian = median(rawComps.map((c) => c.soldPrice));
    if (listing.price > 0 && listing.price >= quickMedian) {
      stats.askAboveMedian++;
      log.debug("skip: asking >= median comp", { id: listing.id, price: listing.price, median: quickMedian });
      continue;
    }

    // 3. verify which comps truly match (LLM rerank, cached)
    const verified = await verifyMatches(identity, rawComps);
    if (verified.length === 0) {
      stats.noMatch++;
      log.debug("skip: no verified match", { id: listing.id, q: identity.searchString });
      continue;
    }
    const matchedComps = verified.map((v) => v.comp);
    const matchConfidence = avg(verified.map((v) => v.verdict.confidence));
    // typical condition gap between the comps and our item (signed median)
    const conditionDelta = median(verified.map((v) => v.verdict.conditionDelta));

    // 4. fee-adjusted, condition-adjusted margin
    const margin = computeMargin(listing.price, matchedComps, identity.category, undefined, conditionDelta);

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
  }

  stats.durationMs = Date.now() - t0;
  log.info("pipeline: funnel", stats);
  return { opportunities: opportunities.sort((a, b) => b.score - a.score), stats };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
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
