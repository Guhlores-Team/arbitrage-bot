import "./env.js";
import { buildComper } from "./comps.js";
import { resolveSource } from "./sources.js";
import { runPipeline } from "./pipeline.js";

/**
 * Demo runner. Usage:
 *   npm run run -- "nintendo switch" 150
 *   npm run run -- "nintendo switch" 150 --source=facebook
 *
 * Args: <query> [hardPriceCap] [--source=craigslist|facebook]
 *
 * With EBAY_USE_MOCK_COMPS=true and no real keys, this runs end to end on
 * mock comps so you can see the shape of the output immediately.
 */
async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = new Map(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const [k, v] = a.replace(/^--/, "").split("=");
        return [k, v ?? "true"] as const;
      }),
  );

  const query = positional[0] ?? "nintendo switch";
  const cap = positional[1] ? Number(positional[1]) : undefined;
  const sourceName = flags.get("source") ?? "craigslist"; // single name, "all", or "a,b,c"

  const source = resolveSource(sourceName);
  const comper = buildComper();

  console.log(`\nSearching ${sourceName} for "${query}"${cap ? ` under $${cap}` : ""}...\n`);

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
