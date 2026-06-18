import type { CompConnector, SourceConnector, SearchQuery } from "./connectors/connector.js";
import { identifyProduct } from "./extraction/identify.js";
import { verifyMatches } from "./matching/match.js";
import { computeMargin } from "./valuation/value.js";
import { scoreOpportunity, THRESHOLDS, type Thresholds } from "./scoring/score.js";
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
  const listings = await source.search(query);
  const opportunities: Opportunity[] = [];

  for (const listing of listings) {
    if (opts.hardPriceCap && listing.price > opts.hardPriceCap) continue;

    // 1. identify the real product (vision + text)
    const identity = await identifyProduct(listing);

    // 2. pull sold comps from the sell market
    const rawComps = await comper.getSoldComps(identity.searchString, 20);
    if (rawComps.length === 0) continue;

    // 2a. cheap price pre-filter: if asking >= median sold, skip the LLM verify
    const quickMedian = median(rawComps.map((c) => c.soldPrice));
    if (listing.price > 0 && listing.price >= quickMedian) continue;

    // 3. verify which comps truly match (LLM rerank, cached)
    const verified = await verifyMatches(identity, rawComps);
    if (verified.length === 0) continue;
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

  return opportunities.sort((a, b) => b.score - a.score);
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
