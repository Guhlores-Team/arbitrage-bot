import "./env.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { EbayCompConnector } from "./connectors/ebay.js";
import { pickSource, SOURCES } from "./sources.js";
import { runPipeline } from "./pipeline.js";
import { THRESHOLDS } from "./scoring/score.js";
import type { Opportunity } from "./types.js";

/**
 * Dashboard server. Zero external deps — Node's http only — so it starts with
 * `npm run dashboard` and no build step. Serves the static UI in /public and a
 * small JSON API the UI calls to run the pipeline.
 *
 *   GET  /                -> dashboard
 *   GET  /api/config      -> sources + current thresholds + key/mode status
 *   POST /api/search      -> { query, source, maxPrice?, limit?, thresholds? }
 *                            -> { opportunities, meta }
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

    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, {
        sources: SOURCES,
        thresholds: THRESHOLDS,
        hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
        ebayMockComps: (process.env.EBAY_USE_MOCK_COMPS ?? "true") === "true",
      });
    }

    if (req.method === "POST" && url.pathname === "/api/search") {
      const body = await readBody(req);
      return await handleSearch(res, body);
    }

    if (req.method === "GET") return await serveStatic(res, url.pathname);

    return json(res, 405, { error: "method not allowed" });
  } catch (err: any) {
    json(res, 500, { error: String(err?.message ?? err) });
  }
});

async function handleSearch(res: any, body: any) {
  const query = String(body?.query ?? "").trim();
  const source = String(body?.source ?? "demo");
  if (!query) return json(res, 400, { error: "query is required" });
  if (!SOURCES.includes(source as any)) return json(res, 400, { error: `unknown source "${source}"` });

  const maxPrice = body?.maxPrice ? Number(body.maxPrice) : undefined;
  const limit = body?.limit ? Math.min(Number(body.limit), 50) : 25;
  const thresholds = body?.thresholds
    ? {
        minMarginPct: Number(body.thresholds.minMarginPct ?? THRESHOLDS.minMarginPct),
        minAbsoluteProfit: Number(body.thresholds.minAbsoluteProfit ?? THRESHOLDS.minAbsoluteProfit),
        minMatchConfidence: Number(body.thresholds.minMatchConfidence ?? THRESHOLDS.minMatchConfidence),
      }
    : undefined;

  const started = Date.now();
  const opps = await serialize(() =>
    runPipeline(
      pickSource(source),
      new EbayCompConnector(),
      { query, maxPrice, limit },
      { hardPriceCap: maxPrice, thresholds },
    ),
  );

  return json(res, 200, {
    opportunities: opps.map(serializeOpp),
    meta: {
      source,
      query,
      count: opps.length,
      passing: opps.filter((o) => !o.flags.includes("DOES NOT PASS THRESHOLDS")).length,
      tookMs: Date.now() - started,
    },
  });
}

function serializeOpp(o: Opportunity) {
  return {
    id: o.sourceListing.id,
    title: o.sourceListing.rawTitle,
    brand: o.identity.brand ?? null,
    model: o.identity.model ?? null,
    image: o.sourceListing.imageUrls[0] ?? null,
    url: o.sourceListing.url,
    location: o.sourceListing.location ?? null,
    buy: o.sourceListing.price,
    resale: o.referencePrice,
    net: Math.round(o.netProfit),
    marginPct: o.marginPct,
    fees: Math.round(o.estimatedFees),
    shipping: o.estimatedShipping,
    compCount: o.compCount,
    matchConfidence: o.matchConfidence,
    identityConfidence: o.identity.confidence,
    condition: o.identity.condition,
    score: o.score,
    passes: !o.flags.includes("DOES NOT PASS THRESHOLDS"),
    flags: o.flags,
  };
}

async function serveStatic(res: any, pathname: string) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  // prevent path traversal
  const filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: "forbidden" });
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
  const data = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(data);
}

server.listen(PORT, HOST, () => {
  console.log(`\n  Arbitrage dashboard → http://${HOST}:${PORT}\n`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  (no ANTHROPIC_API_KEY: identify/match run in offline heuristic mode)");
  }
  console.log("  Try the 'demo' source for instant results with no setup.\n");
});
