import "./env.js";
import { store, type Watchlist } from "./store.js";
import { runScan } from "./scan.js";

/**
 * Watch runner: periodically runs each enabled watchlist, saves passing
 * opportunities to the shared store (so the dashboard's Saved tab updates), and
 * prints an alert when new ones appear.
 *
 *   npm run watch
 *
 * A single timer ticks once a minute and runs the watchlists that are due
 * (by their per-watchlist intervalMin), one at a time — never concurrently —
 * so browser-based sources don't open multiple contexts. The store is re-read
 * every tick, so watchlists you add/edit/disable in the dashboard take effect
 * without restarting this process.
 */

const TICK_MS = 60_000;
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return; // a long scan can outlast the interval; skip overlapping ticks
  ticking = true;
  try {
    const now = Date.now();
    for (const wl of await store.listWatchlists()) {
      if (!wl.enabled) continue;
      const dueAt = wl.lastRunAt ? new Date(wl.lastRunAt).getTime() + wl.intervalMin * 60_000 : 0;
      if (now >= dueAt) await runOne(wl);
    }
  } finally {
    ticking = false;
  }
}

async function runOne(wl: Watchlist): Promise<void> {
  const tag = `[${wl.source}] "${wl.query}"`;
  try {
    const res = await runScan({
      query: wl.query,
      source: wl.source,
      maxPrice: wl.maxPrice,
      thresholds: wl.thresholds,
    });
    const passing = res.opportunities.filter((o) => o.passes);
    const added = passing.length ? await store.saveOpportunities(passing, { source: wl.source, query: wl.query }) : 0;
    await store.updateWatchlist(wl.id, { lastRunAt: new Date().toISOString(), lastFoundCount: passing.length });

    const stamp = new Date().toLocaleTimeString();
    console.log(`${stamp}  ${tag}: ${res.meta.count} scanned, ${passing.length} pass, ${added} new`);
    for (const o of passing.slice(0, added).sort((a, b) => b.score - a.score)) {
      console.log(`   🔔 ${o.title} — buy $${o.buy} → net $${o.net} (${Math.round(o.marginPct * 100)}%)  ${o.url}`);
    }
  } catch (err: any) {
    console.error(`${new Date().toLocaleTimeString()}  ${tag}: ERROR ${err?.message ?? err}`);
  }
}

async function main() {
  const wls = await store.listWatchlists();
  console.log(`\n  Watch runner started — ${wls.filter((w) => w.enabled).length} active watchlist(s).`);
  console.log("  Add watchlists from the dashboard (Watch tab). Ctrl+C to stop.\n");
  await tick();
  setInterval(tick, TICK_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
