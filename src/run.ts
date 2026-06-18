import { CraigslistConnector } from "./connectors/craigslist.js";
import { EbayCompConnector } from "./connectors/ebay.js";
import { runPipeline } from "./pipeline.js";

/**
 * Demo runner. Usage:
 *   npm run run -- "nintendo switch" 150
 * (second arg = optional hard price cap)
 *
 * With EBAY_USE_MOCK_COMPS=true and no real keys, this runs end to end on
 * mock comps so you can see the shape of the output immediately.
 */
async function main() {
  const query = process.argv[2] ?? "nintendo switch";
  const cap = process.argv[3] ? Number(process.argv[3]) : undefined;

  const source = new CraigslistConnector();
  const comper = new EbayCompConnector();

  console.log(`\nSearching "${query}"${cap ? ` under $${cap}` : ""}...\n`);

  const opps = await runPipeline(source, comper, { query, maxPrice: cap, limit: 25 }, { hardPriceCap: cap });

  if (opps.length === 0) {
    console.log("No opportunities found (or all filtered out).");
    return;
  }

  for (const o of opps.slice(0, 10)) {
    const pass = o.flags.includes("DOES NOT PASS THRESHOLDS") ? "✗" : "✓";
    console.log(
      `${pass} score=${o.score.toFixed(2)}  buy=$${o.sourceListing.price}  ` +
        `resale≈$${o.referencePrice}  net=$${o.netProfit.toFixed(0)} (${(o.marginPct * 100).toFixed(0)}%)\n` +
        `   ${o.identity.brand ?? ""} ${o.identity.model ?? o.sourceListing.rawTitle}\n` +
        `   ${o.sourceListing.url}\n` +
        (o.flags.length ? `   flags: ${o.flags.join("; ")}\n` : ""),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
