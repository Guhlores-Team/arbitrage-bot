import "./env.js";
import { buildComper, compInfo } from "./comps.js";
import { pickSource } from "./sources.js";
import { runPipelineDetailed } from "./pipeline.js";
import { serpApiSearchCount, resetSerpApiSearchCount } from "./connectors/serpapi.js";
import { THRESHOLDS } from "./scoring/score.js";
import { asc, percentile as pct, round, clamp } from "./stats.js";
import type { Opportunity } from "./types.js";

/**
 * Threshold calibration — answers "are my pass/fail thresholds too strict, or
 * does this source genuinely have no deals?" by running real scans and showing
 * the distribution of every scored candidate's economics, then recommending
 * thresholds off that data instead of guessing.
 *
 *   npm run calibrate                                    # default watchlist, demo source
 *   npm run calibrate -- "nintendo switch,airpods pro" offerup 300
 *   npm run calibrate -- "lego star wars" offerup 200
 *
 * Args: [queries (comma-separated)] [source] [hardPriceCap].
 * Scored candidates already exclude the obvious losers (over cap, off-topic,
 * no comps, asking ≥ median), so the distribution reflects real opportunities.
 * Reuses one comp cache across queries, so duplicate lookups don't re-spend.
 */
if (!process.env.LOG_LEVEL && !process.env.DEBUG) process.env.LOG_LEVEL = "warn"; // keep the report clean

const DEFAULT_QUERIES = ["nintendo switch", "airpods pro", "lego star wars", "dyson vacuum", "kitchenaid mixer"];

const [queriesRaw, source = "demo", capRaw] = process.argv.slice(2);
const queries = (queriesRaw ? queriesRaw.split(",") : DEFAULT_QUERIES).map((q) => q.trim()).filter(Boolean);
const hardPriceCap = capRaw ? Number(capRaw) : undefined;
const limit = Number(process.env.CALIBRATE_LIMIT ?? 12);

async function main() {
  console.log("\n  Arbitrage Engine — threshold calibration\n  " + "─".repeat(48));
  const ci = compInfo();
  console.log(`  source      : ${source}`);
  console.log(`  comp market : ${ci.markets} (${ci.basis})`);
  console.log(`  queries     : ${queries.join(", ")}`);
  console.log(`  per query   : ${limit} listings` + (hardPriceCap ? `  cap=$${hardPriceCap}` : ""));
  if (ci.basis === "mock") console.log("  ⚠ mock comps — calibrate against a live comp market for real numbers");

  resetSerpApiSearchCount();
  const comper = buildComper(); // one cache shared across all queries
  const src = pickSource(source);

  const all: Opportunity[] = [];
  let listings = 0;
  let scored = 0;
  console.log("\n  Scanning …");
  for (const query of queries) {
    const { opportunities, stats } = await runPipelineDetailed(src, comper, { query, limit }, { hardPriceCap });
    listings += stats.listings;
    scored += stats.scored;
    all.push(...opportunities);
    console.log(`   • ${query.padEnd(22)} ${stats.listings} listings → ${stats.scored} scored, ${stats.passed} pass`);
  }

  console.log(`\n  Sample: ${all.length} scored candidates from ${listings} listings` + (process.env.SERPAPI_KEY ? `  (SerpApi searches: ${serpApiSearchCount()})` : ""));
  if (all.length < 5) {
    console.log("  ⚠ small sample — add more queries or raise CALIBRATE_LIMIT for a trustworthy recommendation.");
    if (all.length === 0) {
      console.log("");
      return;
    }
  }

  const margins = asc(all.map((o) => o.marginPct));
  const profits = asc(all.map((o) => o.netProfit));
  const conf = asc(all.map((o) => o.matchConfidence));
  const comps = asc(all.map((o) => o.compCount));

  const ptiles = [10, 25, 50, 75, 90];
  console.log("\n  Distribution of scored candidates:");
  console.log("   metric           " + ptiles.map((p) => `p${p}`.padStart(9)).join(""));
  const row = (label: string, sorted: number[], fmt: (n: number) => string) =>
    console.log("   " + label.padEnd(17) + ptiles.map((p) => fmt(pct(sorted, p)).padStart(9)).join(""));
  row("margin %", margins, (n) => `${Math.round(n * 100)}%`);
  row("net profit $", profits, (n) => `$${Math.round(n)}`);
  row("match conf", conf, (n) => n.toFixed(2));
  row("comp count", comps, (n) => String(Math.round(n)));

  // Pass-count grid: how many candidates survive each (margin%, $profit) combo,
  // holding match-confidence at the current threshold. The lever you actually turn.
  const marginCands = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4];
  const profitCands = [10, 20, 30, 50, 75];
  const minConf = THRESHOLDS.minMatchConfidence;
  const passing = all.filter((o) => o.matchConfidence >= minConf);
  console.log(`\n  Candidates passing at each threshold (match conf ≥ ${minConf}, n=${passing.length}):`);
  console.log("   margin↓ / $profit→ " + profitCands.map((p) => `$${p}`.padStart(7)).join(""));
  for (const m of marginCands) {
    const cells = profitCands.map((p) => String(passing.filter((o) => o.marginPct >= m && o.netProfit >= p).length).padStart(7));
    console.log(`   ${`${Math.round(m * 100)}%`.padEnd(18)}${cells.join("")}`);
  }

  // Recommendation: keep roughly the top 40% of candidates (the p60 cut), but
  // never accept below a profitability floor. Confidence: only relax 0.80 if the
  // data shows real matches routinely score lower.
  const recMargin = clamp(round(pct(margins, 60), 0.05), 0.1, 0.4);
  const recProfit = clamp(round(pct(profits, 60), 5), 10, 100);
  const confP40 = pct(conf, 40);
  const recConf = confP40 < minConf ? clamp(round(confP40, 0.05), 0.6, minConf) : minConf;
  const survivors = all.filter((o) => o.marginPct >= recMargin && o.netProfit >= recProfit && o.matchConfidence >= recConf).length;

  console.log("\n  Recommended starting thresholds (surfaces the top candidates):");
  console.log(`     MIN_MARGIN_PCT=${recMargin}`);
  console.log(`     MIN_ABSOLUTE_PROFIT=${recProfit}`);
  console.log(`     MIN_MATCH_CONFIDENCE=${recConf}`);
  console.log(`   → ${survivors}/${all.length} candidates would pass.`);
  if (survivors === 0) console.log("   (No candidate clears a sane profitability floor — this source/query has no deals right now.)");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
