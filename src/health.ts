import { stat, readdir } from "node:fs/promises";
import { compInfo } from "./comps.js";
import { notifierStatus } from "./notify.js";
import { llmInfo } from "./llm.js";
import { proxyUrl } from "./proxy.js";

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

  const proxied = Boolean(proxyUrl());
  const proxyNote = proxied ? " · via proxy" : " · datacenter IPs may be 403'd (set SCRAPER_PROXY)";
  const sources: SourceHealth[] = [
    { source: "demo", ready: true, note: "offline sample data" },
    {
      source: "craigslist",
      ready: true,
      note: ((process.env.CRAIGSLIST_ENRICH ?? "false") === "true" ? "RSS + photos" : "RSS only") + proxyNote,
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
    {
      source: "mercari",
      ready: playwright,
      note: playwright ? "ready (public browse)" : "install Playwright",
    },
    {
      source: "shopgoodwill",
      ready: true,
      note: "JSON API — no browser needed" + proxyNote,
    },
  ];

  const comps = compInfo();
  return {
    playwright,
    sources,
    comps: {
      source: comps.markets,
      live: comps.basis !== "mock",
      note:
        comps.basis === "mock"
          ? "mock comps — set EBAY_* keys (EBAY_USE_MOCK_COMPS=false) and/or PRICECHARTING_TOKEN"
          : comps.basis === "ask"
            ? "live active asks (discounted to sold estimate)"
            : "live sold/market data",
    },
    identify: llmInfo().configured ? `ai-vision (${llmInfo().provider}/${llmInfo().model})` : "offline-heuristic",
    notifiers: notifierStatus(),
    proxy: Boolean(proxyUrl()),
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
