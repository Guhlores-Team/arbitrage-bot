import "./env.js";
import { store, type Watchlist, type Sweep } from "./store.js";
import { runScan } from "./scan.js";
import { notifyOpportunities, notifierStatus } from "./notify.js";
import { pickSweepBatch, STARTER_KEYWORDS } from "./sweep.js";

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
    for (const sw of await store.listSweeps()) {
      if (!sw.enabled) continue;
      const dueAt = sw.lastRunAt ? new Date(sw.lastRunAt).getTime() + sw.intervalMin * 60_000 : 0;
      if (now >= dueAt) await runSweep(sw);
    }
  } finally {
    ticking = false;
  }
}

/** Run the next round-robin batch of a sweep's keywords against the source + eBay. */
async function runSweep(sw: Sweep): Promise<void> {
  const { batch, nextCursor } = pickSweepBatch(sw.keywords, sw.cursor, sw.perTick);
  if (!batch.length) return;
  let found = 0;
  for (const query of batch) {
    const tag = `[sweep:${sw.label}] "${query}"`;
    try {
      const res = await runScan({ query, source: sw.source, maxPrice: sw.maxPrice, thresholds: sw.thresholds });
      const passing = res.opportunities.filter((o) => o.passes);
      const added = passing.length ? await store.saveOpportunities(passing, { source: sw.source, query }) : [];
      found += added.length;
      console.log(`${new Date().toLocaleTimeString()}  ${tag}: ${res.meta.count} scanned, ${passing.length} pass, ${added.length} new`);
      if (added.length) await notifyOpportunities({ source: `${sw.source} · sweep`, query }, added);
    } catch (err: any) {
      console.error(`${new Date().toLocaleTimeString()}  ${tag}: ERROR ${err?.message ?? err}`);
    }
  }
  await store.updateSweep(sw.id, {
    cursor: nextCursor,
    lastRunAt: new Date().toISOString(),
    lastKeyword: batch[batch.length - 1],
    totalFound: (sw.totalFound ?? 0) + found,
  });
}

/**
 * Start the watch loop. Safe to call from the dashboard server (so a single
 * process serves the UI and runs scheduled scans) or from the standalone
 * `npm run watch` entrypoint. Idempotent.
 */
export async function startWatch(): Promise<void> {
  if (started) return;
  started = true;
  await seedDefaultSweep();
  const wls = await store.listWatchlists();
  const sweeps = await store.listSweeps();
  const n = notifierStatus();
  const channels = [n.telegram && "Telegram", n.webhook && "webhook"].filter(Boolean).join(" + ") || "console only";
  console.log(
    `  Watch runner active — ${wls.filter((w) => w.enabled).length} watchlist(s), ` +
      `${sweeps.filter((s) => s.enabled).length} sweep(s). Alerts: ${channels}.`,
  );
  await tick();
  setInterval(tick, TICK_MS);
}

/**
 * Turnkey discovery: the first time the scheduler ever runs, drop in an enabled
 * "Auto-discovery" sweep across all sources using the starter category pack — so
 * the engine starts hunting underpriced inventory with zero setup. Gated by a
 * one-time settings flag, so deleting the sweep in the UI makes it stay gone.
 */
async function seedDefaultSweep(): Promise<void> {
  const settings = await store.getSettings();
  if (settings.seededDiscovery) return;
  const existing = await store.listSweeps();
  if (existing.length === 0) {
    await store.addSweep({
      label: "Auto-discovery",
      keywords: STARTER_KEYWORDS,
      source: "all",
      intervalMin: 30,
      perTick: 3,
    });
    console.log(`  Seeded default Auto-discovery sweep (${STARTER_KEYWORDS.length} categories, all sources).`);
  }
  await store.setSettings({ seededDiscovery: true });
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
