import { stat, readdir } from "node:fs/promises";
import { EbayCompConnector } from "./connectors/ebay.js";
import { notifierStatus } from "./notify.js";

/**
 * Preflight: can each source actually run, and is the money path (comps +
 * identify + alerts) wired? Surfaced in the dashboard's Settings tab so you
 * know what's missing before you go hunting for real deals.
 */

export interface SourceHealth {
  source: string;
  ready: boolean;
  note: string;
}

export async function health() {
  const playwright = await hasPlaywright();
  const fbSession = await dirHasFiles(process.env.FACEBOOK_USER_DATA_DIR ?? ".fb-session");
  const comper = new EbayCompConnector();

  const sources: SourceHealth[] = [
    { source: "demo", ready: true, note: "offline sample data" },
    {
      source: "craigslist",
      ready: true,
      note: (process.env.CRAIGSLIST_ENRICH ?? "false") === "true" ? "RSS + page enrichment (photos)" : "RSS only — set CRAIGSLIST_ENRICH=true for photos",
    },
    {
      source: "facebook",
      ready: playwright && fbSession,
      note: !playwright ? "install Playwright" : !fbSession ? "run `npm run fb:login`" : "logged-in session ready",
    },
    {
      source: "offerup",
      ready: playwright,
      note: playwright ? "ready (public browse)" : "install Playwright",
    },
  ];

  return {
    playwright,
    sources,
    comps: {
      source: comper.effectiveSource,
      live: comper.effectiveSource !== "mock",
      note:
        comper.effectiveSource === "mock"
          ? "mock comps — set EBAY_* keys + EBAY_USE_MOCK_COMPS=false"
          : comper.effectiveSource === "browse"
            ? "live active asks (discounted to sold estimate)"
            : "live data",
    },
    identify: process.env.ANTHROPIC_API_KEY ? "ai-vision" : "offline-heuristic",
    notifiers: notifierStatus(),
  };
}

async function hasPlaywright(): Promise<boolean> {
  try {
    await import("playwright");
    return true;
  } catch {
    return false;
  }
}

async function dirHasFiles(dir: string): Promise<boolean> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return false;
    return (await readdir(dir)).length > 0;
  } catch {
    return false;
  }
}
