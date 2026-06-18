import { EbayCompConnector } from "./connectors/ebay.js";
import { pickSource, SOURCES } from "./sources.js";
import { runPipeline } from "./pipeline.js";
import { THRESHOLDS, type Thresholds } from "./scoring/score.js";
import { toOpportunityView, type OpportunityView } from "./view.js";

export interface ScanParams {
  query: string;
  source: string;
  maxPrice?: number;
  limit?: number;
  thresholds?: Thresholds;
}

export interface ScanMeta {
  source: string;
  query: string;
  count: number;
  passing: number;
  tookMs: number;
}

export interface ScanResult {
  opportunities: OpportunityView[];
  meta: ScanMeta;
}

/** Normalize a request into validated params (throws on bad input). */
export function parseScanParams(body: any): ScanParams {
  const query = String(body?.query ?? "").trim();
  const source = String(body?.source ?? "demo");
  if (!query) throw new Error("query is required");
  if (!SOURCES.includes(source as any)) throw new Error(`unknown source "${source}"`);
  return {
    query,
    source,
    maxPrice: body?.maxPrice ? Number(body.maxPrice) : undefined,
    limit: body?.limit ? Math.min(Number(body.limit), 50) : 25,
    thresholds: body?.thresholds
      ? {
          minMarginPct: Number(body.thresholds.minMarginPct ?? THRESHOLDS.minMarginPct),
          minAbsoluteProfit: Number(body.thresholds.minAbsoluteProfit ?? THRESHOLDS.minAbsoluteProfit),
          minMatchConfidence: Number(body.thresholds.minMatchConfidence ?? THRESHOLDS.minMatchConfidence),
        }
      : undefined,
  };
}

/** Run one scan end to end and return view models + summary meta. */
export async function runScan(p: ScanParams): Promise<ScanResult> {
  const started = Date.now();
  const opps = await runPipeline(
    pickSource(p.source),
    new EbayCompConnector(),
    { query: p.query, maxPrice: p.maxPrice, limit: p.limit },
    { hardPriceCap: p.maxPrice, thresholds: p.thresholds },
  );
  const opportunities = opps.map(toOpportunityView);
  return {
    opportunities,
    meta: {
      source: p.source,
      query: p.query,
      count: opportunities.length,
      passing: opportunities.filter((o) => o.passes).length,
      tookMs: Date.now() - started,
    },
  };
}
