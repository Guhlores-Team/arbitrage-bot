import "./env.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { SOURCES } from "./sources.js";
import { THRESHOLDS } from "./scoring/score.js";
import { parseScanParams, runScan } from "./scan.js";
import { store } from "./store.js";
import { notify, notifierStatus, notifyOpportunities } from "./notify.js";
import { health } from "./health.js";
import { llmInfo } from "./llm.js";
import { compInfo } from "./comps.js";
import { startWatch } from "./watch.js";
import { STARTER_KEYWORDS } from "./sweep.js";
import { generateListing } from "./listing.js";

/**
 * Dashboard server. Zero external deps — Node's http only — so it starts with
 * `npm run dashboard` and no build step. Serves the static UI in /public and a
 * small JSON API.
 *
 *   GET    /                     -> dashboard
 *   GET    /api/config           -> sources + thresholds + key/mode status
 *   POST   /api/search           -> run a scan (and auto-save passing results)
 *   GET    /api/opportunities    -> saved feed   (?passingOnly=1)
 *   DELETE /api/opportunities    -> clear saved feed
 *   GET    /api/watchlists       -> list watchlists
 *   POST   /api/watchlists       -> create a watchlist
 *   PATCH  /api/watchlists/:id   -> update (e.g. enable/disable)
 *   DELETE /api/watchlists/:id   -> remove
 *   POST   /api/watchlists/:id/run -> run one watchlist now
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);
// Bind to loopback by default: this server triggers scraping and (with keys)
// paid API calls, so it must not be reachable from the network unless you opt in.
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "GET" && path === "/api/config") {
      const llm = llmInfo();
      return json(res, 200, {
        sources: SOURCES,
        thresholds: THRESHOLDS,
        hasAnthropicKey: llm.configured, // back-compat: dashboard reads this as "identify on"
        llmProvider: llm.provider,
        llmModel: llm.model,
        ebayMockComps: (process.env.EBAY_USE_MOCK_COMPS ?? "true") === "true",
        compSource: compInfo().markets,
        compBasis: compInfo().basis,
        notifiers: notifierStatus(),
      });
    }

    if (method === "GET" && path === "/api/health") {
      return json(res, 200, await health());
    }

    if (method === "POST" && path === "/api/notify/test") {
      const status = notifierStatus();
      if (!status.any) return json(res, 200, { sent: 0, status });
      const sent = await notify("✅ Arbitrage Engine test alert — notifications are wired up.");
      return json(res, 200, { sent, status });
    }

    if (method === "POST" && path === "/api/search") {
      return await handleSearch(res, await readBody(req));
    }

    if (path === "/api/opportunities") {
      if (method === "GET") {
        return json(res, 200, {
          opportunities: await store.listOpportunities({ passingOnly: url.searchParams.get("passingOnly") === "1" }),
        });
      }
      if (method === "DELETE") {
        await store.clearOpportunities();
        return json(res, 200, { ok: true });
      }
    }

    if (method === "GET" && path === "/api/stats") {
      return json(res, 200, await store.outcomeStats());
    }

    const oppMatch = path.match(/^\/api\/opportunities\/([\w-]+)$/);
    if (oppMatch && method === "PATCH") {
      const o = await store.setOpportunityOutcome(oppMatch[1], await readBody(req));
      return o ? json(res, 200, { opportunity: o }) : json(res, 404, { error: "not found" });
    }

    const draftMatch = path.match(/^\/api\/opportunities\/([\w-]+)\/draft$/);
    if (draftMatch && method === "POST") {
      const o = (await store.listOpportunities()).find((x) => x.id === draftMatch[1]);
      if (!o) return json(res, 404, { error: "not found" });
      return json(res, 200, { draft: await serialize(() => generateListing(o)) });
    }

    if (path === "/api/watchlists") {
      if (method === "GET") return json(res, 200, { watchlists: await store.listWatchlists() });
      if (method === "POST") return await handleCreateWatchlist(res, await readBody(req));
    }

    const wlMatch = path.match(/^\/api\/watchlists\/([\w-]+)(\/run)?$/);
    if (wlMatch) {
      const id = wlMatch[1];
      const runNow = Boolean(wlMatch[2]);
      if (method === "POST" && runNow) return await handleRunWatchlist(res, id);
      if (method === "PATCH") {
        const wl = await store.updateWatchlist(id, await readBody(req));
        return wl ? json(res, 200, { watchlist: wl }) : json(res, 404, { error: "not found" });
      }
      if (method === "DELETE") {
        const ok = await store.removeWatchlist(id);
        return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: "not found" });
      }
    }

    if (path === "/api/sweeps") {
      if (method === "GET")
        return json(res, 200, { sweeps: await store.listSweeps(), starterKeywords: STARTER_KEYWORDS });
      if (method === "POST") return await handleCreateSweep(res, await readBody(req));
    }

    const swMatch = path.match(/^\/api\/sweeps\/([\w-]+)(\/run)?$/);
    if (swMatch) {
      const id = swMatch[1];
      const runNow = Boolean(swMatch[2]);
      if (method === "POST" && runNow) return await handleRunSweep(res, id);
      if (method === "PATCH") {
        const sw = await store.updateSweep(id, await readBody(req));
        return sw ? json(res, 200, { sweep: sw }) : json(res, 404, { error: "not found" });
      }
      if (method === "DELETE") {
        const ok = await store.removeSweep(id);
        return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: "not found" });
      }
    }

    if (method === "GET") return await serveStatic(res, path);
    return json(res, 405, { error: "method not allowed" });
  } catch (err: any) {
    json(res, 400, { error: String(err?.message ?? err) });
  }
});

async function handleSearch(res: any, body: any) {
  const params = parseScanParams(body);
  const result = await serialize(() => runScan(params));
  // Persist the passing opportunities so they show up in the saved feed.
  const passing = result.opportunities.filter((o) => o.passes);
  const added = passing.length
    ? await store.saveOpportunities(passing, { source: params.source, query: params.query })
    : [];
  return json(res, 200, { ...result, meta: { ...result.meta, newlySaved: added.length } });
}

async function handleCreateWatchlist(res: any, body: any) {
  // Validate the scan portion up front so bad watchlists never get stored.
  const p = parseScanParams(body);
  const intervalMin = Math.max(1, Number(body?.intervalMin ?? 30));
  const wl = await store.addWatchlist({
    query: p.query,
    source: p.source,
    maxPrice: p.maxPrice,
    thresholds: p.thresholds,
    intervalMin,
  });
  return json(res, 201, { watchlist: wl });
}

async function handleRunWatchlist(res: any, id: string) {
  const wl = (await store.listWatchlists()).find((w) => w.id === id);
  if (!wl) return json(res, 404, { error: "not found" });
  const result = await serialize(() =>
    runScan({ query: wl.query, source: wl.source, maxPrice: wl.maxPrice, thresholds: wl.thresholds }),
  );
  const passing = result.opportunities.filter((o) => o.passes);
  const added = passing.length
    ? await store.saveOpportunities(passing, { source: wl.source, query: wl.query })
    : [];
  await store.updateWatchlist(id, { lastRunAt: new Date().toISOString(), lastFoundCount: passing.length });
  if (added.length) await notifyOpportunities({ source: wl.source, query: wl.query }, added);
  return json(res, 200, { meta: result.meta, newlySaved: added.length });
}

async function handleCreateSweep(res: any, body: any) {
  const keywords = Array.isArray(body?.keywords)
    ? body.keywords.map((k: any) => String(k).trim()).filter(Boolean)
    : String(body?.keywords ?? "")
        .split(/[\n,]/)
        .map((k) => k.trim())
        .filter(Boolean);
  if (!keywords.length) return json(res, 400, { error: "keywords are required" });
  const source = String(body?.source ?? "demo");
  if (!SOURCES.includes(source as any)) return json(res, 400, { error: `unknown source "${source}"` });

  const sweep = await store.addSweep({
    label: String(body?.label ?? "Discovery").slice(0, 60),
    keywords,
    source,
    maxPrice: body?.maxPrice ? Number(body.maxPrice) : undefined,
    thresholds: body?.thresholds
      ? {
          minMarginPct: Number(body.thresholds.minMarginPct ?? THRESHOLDS.minMarginPct),
          minAbsoluteProfit: Number(body.thresholds.minAbsoluteProfit ?? THRESHOLDS.minAbsoluteProfit),
          minMatchConfidence: Number(body.thresholds.minMatchConfidence ?? THRESHOLDS.minMatchConfidence),
        }
      : undefined,
    intervalMin: Math.max(1, Number(body?.intervalMin ?? 30)),
    perTick: Math.max(1, Number(body?.perTick ?? 2)),
  });
  return json(res, 201, { sweep });
}

async function handleRunSweep(res: any, id: string) {
  const sw = (await store.listSweeps()).find((s) => s.id === id);
  if (!sw) return json(res, 404, { error: "not found" });
  const { pickSweepBatch } = await import("./sweep.js");
  const { batch, nextCursor } = pickSweepBatch(sw.keywords, sw.cursor, sw.perTick);
  let newlySaved = 0;
  for (const query of batch) {
    const result = await serialize(() =>
      runScan({ query, source: sw.source, maxPrice: sw.maxPrice, thresholds: sw.thresholds }),
    );
    const passing = result.opportunities.filter((o) => o.passes);
    const added = passing.length ? await store.saveOpportunities(passing, { source: sw.source, query }) : [];
    newlySaved += added.length;
    if (added.length) await notifyOpportunities({ source: `${sw.source} · sweep`, query }, added);
  }
  await store.updateSweep(id, {
    cursor: nextCursor,
    lastRunAt: new Date().toISOString(),
    lastKeyword: batch[batch.length - 1],
    totalFound: (sw.totalFound ?? 0) + newlySaved,
  });
  return json(res, 200, { ran: batch, newlySaved });
}

async function serveStatic(res: any, pathname: string) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: "forbidden" }); // no traversal
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    json(res, 404, { error: "not found" });
  }
}

// Serialize pipeline runs: only one scan executes at a time, so concurrent
// requests can't spin up multiple browser contexts (Facebook/OfferUp) at once.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c: Buffer) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res: any, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

server.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(
      `\n  Port ${PORT} is already in use — another instance is running.\n` +
        `  Stop it first:  fuser -k ${PORT}/tcp   (or change PORT in .env)\n`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Arbitrage dashboard → http://${HOST}:${PORT}`);
  if (!llmInfo().configured) {
    console.log("  (no LLM key: identify/match run in offline heuristic mode)");
  }
  // One-process deploy: also run scheduled watchlists here when asked, so a
  // single `npm run dashboard` covers the UI + the scheduler on one VM.
  if ((process.env.WATCH_IN_SERVER ?? "false") === "true") {
    startWatch().catch((e) => console.error("watch loop failed to start:", e));
  } else {
    console.log("  (set WATCH_IN_SERVER=true to run scheduled watchlists in this process)");
  }
  console.log("");
});
