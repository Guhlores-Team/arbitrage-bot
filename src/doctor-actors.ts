import "./env.js";

/**
 * Actor health check — run each of your deployed Apify actors once and report
 * whether it returns data, so you know which are ready to wire and which need
 * selector tuning:
 *
 *   npm run doctor:actors                 # check all
 *   npm run doctor:actors stockx poshmark # check just these
 *
 * It calls each actor synchronously with a representative query and a small
 * maxItems (to keep cost low), then prints the item count + a sample row, or the
 * error. These actors drive real browsers behind a residential proxy, so a full
 * sweep takes a few minutes; each actor is capped at PER_ACTOR_TIMEOUT.
 */

const PER_ACTOR_TIMEOUT_MS = 150_000;
const MAX_ITEMS = 5;

/**
 * Apify account that owns the deployed actors. Override with APIFY_ACTOR_OWNER
 * when the actors live under a different account (e.g. a team), so the org move
 * doesn't require editing the actor names below.
 */
const OWNER = process.env.APIFY_ACTOR_OWNER || "Guhlore";

/** Deployed actors, with a query that should return results for each. */
const ACTORS: { name: string; actor: string; query: string; note?: string }[] = [
  { name: "ebay-sold", actor: `${OWNER}~ebay-sold-listings-scraper`, query: "nintendo switch oled" },
  { name: "stockx", actor: `${OWNER}~stockx-scraper`, query: "jordan 1" },
  { name: "poshmark", actor: `${OWNER}~poshmark-scraper`, query: "lululemon define jacket" },
  { name: "depop", actor: `${OWNER}~depop-scraper`, query: "carhartt jacket" },
  { name: "mercari", actor: `${OWNER}~mercari-scraper`, query: "nintendo switch" },
  { name: "offerup", actor: `${OWNER}~offerup-scraper`, query: "nintendo switch" },
  { name: "craigslist", actor: `${OWNER}~craigslist-scraper`, query: "nintendo switch" },
  { name: "ebay", actor: `${OWNER}~ebay-scraper`, query: "nintendo switch" },
  { name: "hibid", actor: `${OWNER}~hibid-auction-scraper`, query: "macbook" },
  { name: "nextdoor", actor: `${OWNER}~nextdoor-scraper`, query: "free", note: "needs logged-in cookies — expect 0 without them" },
];

const ok = (b: boolean) => (b ? "✓" : "✗");

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms))]);
}

async function probeActor(token: string, a: (typeof ACTORS)[number]): Promise<string> {
  // Force 4 GB so the Playwright/Chromium actors can launch regardless of the
  // actor's saved default (a leftover low memory from a Cheerio build = 0 items).
  const url = `https://api.apify.com/v2/acts/${a.actor}/run-sync-get-dataset-items?token=${token}&timeout=140&memory=4096`;
  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: a.query, maxItems: MAX_ITEMS }),
      }),
      PER_ACTOR_TIMEOUT_MS,
    );
    if (!res.ok) return `${ok(false)} ${a.name}: HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`;
    const items = (await res.json()) as any[];
    const n = Array.isArray(items) ? items.length : 0;
    const sample = n ? items.find((i) => i && (i.title || i.name)) : null;
    const eg = sample ? ` — e.g. $${sample.price ?? "?"} ${String(sample.title ?? sample.name).slice(0, 44)}` : "";
    const tail = n === 0 && a.note ? ` (${a.note})` : "";
    return `${ok(n > 0)} ${a.name}: ${n} item(s)${eg}${tail}`;
  } catch (e: any) {
    return `${ok(false)} ${a.name}: ${e?.message ?? e}`;
  }
}

async function main() {
  console.log("\n  Apify actor health check\n  " + "─".repeat(48));
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("  ✗ APIFY_TOKEN not set — add it to .env to run this check.\n");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const toProbe = args.length ? ACTORS.filter((a) => args.includes(a.name)) : ACTORS;
  if (!toProbe.length) {
    console.error(`  no matching actors. known: ${ACTORS.map((a) => a.name).join(", ")}\n`);
    process.exit(1);
  }

  console.log(`  Probing ${toProbe.length} actor(s), ${MAX_ITEMS} items each — this can take a few minutes.\n`);
  for (const a of toProbe) {
    console.log("   " + (await probeActor(token, a)));
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
