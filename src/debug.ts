import "./env.js";
import { health } from "./health.js";
import { buildComper, compInfo } from "./comps.js";
import { resolveSource } from "./sources.js";
import { runPipelineDetailed } from "./pipeline.js";
import { serpApiUsage, serpApiSearchCount, resetSerpApiSearchCount } from "./connectors/serpapi.js";

/**
 * Debug console — one command to see the whole money path working and where it
 * leaks:
 *
 *   npm run debug                         # demo source, "nintendo switch"
 *   npm run debug -- "airpods pro" offerup 150
 *   npm run debug -- "switch" offerup,mercari 300   # a list, or "all"
 *
 * Args: [query] [source] [hardPriceCap]. Source is one name, a comma-separated
 * list, or "all". Forces verbose logs, runs a real scan,
 * and prints the funnel (why listings dropped), the top opportunities, your
 * SerpApi quota, and how many comp lookups this run actually cost.
 */
if (!process.env.LOG_LEVEL && !process.env.DEBUG) process.env.LOG_LEVEL = "debug";

const [query = "nintendo switch", source = "demo", capRaw] = process.argv.slice(2);
const hardPriceCap = capRaw ? Number(capRaw) : undefined;

async function main() {
  console.log("\n  Arbitrage Engine — debug console\n  " + "─".repeat(48));
  console.log(`  query="${query}"  source=${source}` + (hardPriceCap ? `  cap=$${hardPriceCap}` : ""));

  const h = await health();
  const ci = compInfo();
  console.log(`  comp source : ${ci.markets} (${ci.basis})`);
  console.log(`  identify    : ${h.identify}`);

  if (process.env.SERPAPI_KEY) {
    try {
      const u = await serpApiUsage();
      if (u) console.log(`  SerpApi     : ${u.left} left / ${u.total} this month (${u.used} used) — plan ${u.plan}`);
    } catch (e: any) {
      console.log(`  SerpApi     : quota check failed (${e?.message ?? e})`);
    }
  }

  resetSerpApiSearchCount();
  console.log("\n  Running pipeline (debug logs below) …\n");
  const { opportunities, stats } = await runPipelineDetailed(resolveSource(source), buildComper(), { query, limit: 10 }, { hardPriceCap });

  console.log("\n  Funnel:");
  console.log(`   listings pulled        : ${stats.listings}`);
  console.log(`   ⤷ priced out (cap)     : ${stats.pricedOut}`);
  console.log(`   ⤷ off-topic (junk)     : ${stats.offTopic}`);
  console.log(`   ⤷ no usable comps      : ${stats.noComps}`);
  console.log(`   ⤷ asking >= median     : ${stats.askAboveMedian}`);
  console.log(`   ⤷ no verified match    : ${stats.noMatch}`);
  console.log(`   scored opportunities   : ${stats.scored} (${stats.passed} pass thresholds)`);
  console.log(`   comp lookups this run  : ${stats.compLookups}` + (process.env.SERPAPI_KEY ? `  (SerpApi searches: ${serpApiSearchCount()})` : ""));
  console.log(`   duration               : ${stats.durationMs}ms`);

  console.log("\n  Top opportunities:");
  if (!opportunities.length) console.log("   (none)");
  for (const o of opportunities.slice(0, 5)) {
    const tag = o.flags.includes("DOES NOT PASS THRESHOLDS") ? "✗" : "✓";
    console.log(
      `   ${tag} score ${o.score.toFixed(2)}  $${o.sourceListing.price} → ~$${o.resaleMid} ` +
        `(net $${o.netProfit.toFixed(2)}, ${Math.round(o.marginPct * 100)}%)  ${o.sourceListing.rawTitle.slice(0, 40)}`,
    );
    if (o.flags.length) console.log(`       flags: ${o.flags.join("; ")}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
