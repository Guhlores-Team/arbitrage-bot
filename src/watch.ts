import "./env.js";
import { store, type Watchlist } from "./store.js";
import { runScan } from "./scan.js";
import { notifyOpportunities, notifierStatus } from "./notify.js";

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
let started = false;

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

/**
 * Start the watch loop. Safe to call from the dashboard server (so a single
 * process serves the UI and runs scheduled scans) or from the standalone
 * `npm run watch` entrypoint. Idempotent.
 */
export async function startWatch(): Promise<void> {
  if (started) return;
  started = true;
  const wls = await store.listWatchlists();
  const n = notifierStatus();
  const channels = [n.telegram && "Telegram", n.webhook && "webhook"].filter(Boolean).join(" + ") || "console only";
  console.log(`  Watch runner active — ${wls.filter((w) => w.enabled).length} enabled watchlist(s). Alerts: ${channels}.`);
  await tick();
  setInterval(tick, TICK_MS);
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
    const added = passing.length ? await store.saveOpportunities(passing, { source: wl.source, query: wl.query }) : [];
    await store.updateWatchlist(wl.id, { lastRunAt: new Date().toISOString(), lastFoundCount: passing.length });

    const stamp = new Date().toLocaleTimeString();
    console.log(`${stamp}  ${tag}: ${res.meta.count} scanned, ${passing.length} pass, ${added.length} new`);
    for (const o of [...added].sort((a, b) => b.score - a.score)) {
      console.log(`   🔔 ${o.title} — buy $${o.buy} → net $${o.net} (${Math.round(o.marginPct * 100)}%)  ${o.url}`);
    }
    if (added.length) await notifyOpportunities({ source: wl.source, query: wl.query }, added);
  } catch (err: any) {
    console.error(`${new Date().toLocaleTimeString()}  ${tag}: ERROR ${err?.message ?? err}`);
  }
}

// Standalone entrypoint: run only when invoked directly (npm run watch), not
// when imported by the server.
if (process.argv[1] && /watch\.(ts|js)$/.test(process.argv[1])) {
  console.log("\n  Watch runner — add watchlists from the dashboard (Watch tab). Ctrl+C to stop.\n");
  startWatch().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
