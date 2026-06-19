import "./env.js";
import { health } from "./health.js";
import { pickSource } from "./sources.js";
import { buildComper } from "./comps.js";
import { serpApiUsage } from "./connectors/serpapi.js";

/**
 * Preflight self-test — run on the machine you'll actually scrape from:
 *
 *   npm run doctor
 *
 * It checks static readiness (keys, sessions, comp source) and then does a tiny
 * LIVE probe of each source so you know, in your environment, whether scraping
 * works — and if not, exactly why (network/TLS, anti-bot block, login required,
 * or changed markup). Datacenter/cloud IPs are commonly 403'd; a residential IP
 * + a logged-in browser is the norm for these sources.
 */

const ok = (b: boolean) => (b ? "✓" : "✗");

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms))]);
}

async function probeSource(name: string): Promise<string> {
  try {
    const listings = await withTimeout(pickSource(name).search({ query: "nintendo switch", limit: 3 }), 60_000);
    return `${ok(true)} ${name}: ${listings.length} listing(s)` + (listings[0] ? ` — e.g. $${listings[0].price} ${listings[0].rawTitle.slice(0, 40)}` : "");
  } catch (e: any) {
    return `${ok(false)} ${name}: ${e?.message ?? e}`;
  }
}

async function probeComps(): Promise<string> {
  // Probe the comper the engine actually uses (per COMP_SOURCES/APIFY_COMPS),
  // so this reflects real wiring — not a hardcoded eBay scraper.
  const comper = buildComper();
  try {
    const comps = await withTimeout(comper.getSoldComps("nintendo switch oled", 5), 30_000);
    const median = comps.length ? [...comps].map((c) => c.soldPrice).sort((a, b) => a - b)[Math.floor(comps.length / 2)] : 0;
    return `${ok(comps.length > 0)} ${comper.market} comps (${comper.basis ?? "?"}): ${comps.length} comps, ~$${median} median`;
  } catch (e: any) {
    return `${ok(false)} ${comper.market} comps: ${e?.message ?? e}`;
  }
}

async function serpApiQuotaLine(): Promise<string> {
  try {
    const u = await withTimeout(serpApiUsage(), 15_000);
    if (!u) return "no key";
    const pct = u.total ? Math.round((u.left / u.total) * 100) : 0;
    const warn = u.left <= 20 ? "  ⚠ nearly out" : "";
    return `${u.left} left / ${u.total} this month (${u.used} used, ${pct}%) — plan ${u.plan}${warn}`;
  } catch (e: any) {
    return `check failed (${e?.message ?? e})`;
  }
}

async function main() {
  console.log("\n  Arbitrage Engine — doctor\n  " + "─".repeat(48));

  const h = await health();
  console.log(`  Playwright installed : ${ok(h.playwright)}`);
  console.log(`  Identify mode        : ${h.identify}`);
  console.log(`  Comp source          : ${h.comps.source} (${h.comps.note})`);
  console.log(`  Scraper proxy        : ${h.proxy ? "on (SCRAPER_PROXY)" : "off — datacenter IPs may be blocked"}`);
  console.log(`  Alerts               : ${h.notifiers.any ? "configured" : "off"}`);
  if (process.env.SERPAPI_KEY) console.log(`  SerpApi quota        : ${await serpApiQuotaLine()}`);
  console.log("\n  Static readiness:");
  for (const s of h.sources) console.log(`   ${ok(s.ready)} ${s.source}: ${s.note}`);

  console.log("\n  Live comp check:");
  console.log("   " + (await probeComps()));

  // Live source probes. Demo is always fine; the browser sources need network +
  // (for Facebook) a logged-in session, so we surface the real failure reason.
  const args = process.argv.slice(2);
  const toProbe = args.length ? args : ["demo", "craigslist", "offerup", "mercari", "facebook"];
  console.log("\n  Live source probes (pass source names as args to narrow):");
  for (const name of toProbe) {
    try {
      console.log("   " + (await probeSource(name)));
    } catch (e: any) {
      console.log(`   ${ok(false)} ${name}: ${e?.message ?? e}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
