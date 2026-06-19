import type { SoldComp } from "../types.js";
import type { CompConnector } from "./connector.js";
import { log } from "../log.js";

/** Live SerpApi searches made by this process (each costs one search credit). */
let liveSearches = 0;
// Budget state: undefined = not yet checked, null = unknown (don't guard).
let budget: { left: number } | null | undefined;
let warnedBudget = false; // warn once per run, not once per skipped listing

/** Searches this process has spent — surfaced by the debug console / doctor. */
export function serpApiSearchCount(): number {
  return liveSearches;
}
/**
 * Reset the per-run counter + budget state. Call this at the start of each scan
 * run (the watch runner does, per tick) so SERPAPI_MAX_PER_RUN is a per-run cap
 * and the monthly figure is re-read fresh each time — a long-running server then
 * never permanently locks itself out after one cap hit.
 */
export function resetSerpApiSearchCount(): void {
  liveSearches = 0;
  budget = undefined;
  warnedBudget = false;
}

/** Log the quota-skip once per run instead of once per skipped listing (spam). */
function noteBudgetSkip(): void {
  if (warnedBudget) return;
  warnedBudget = true;
  log.warn("serpapi: quota guard — comps paused for this run (near monthly cap or SERPAPI_MAX_PER_RUN)", {
    left: budget?.left ?? null,
    spent: liveSearches,
  });
}

/**
 * Quota guard: returns true when we should stop spending live searches, so a
 * scan degrades gracefully (returns no comps) instead of erroring at the cap.
 *   SERPAPI_MAX_PER_RUN  hard cap on searches per process (0 = unlimited)
 *   SERPAPI_MIN_RESERVE  keep this many monthly searches in reserve (default 0)
 * The monthly figure is read once per run from the (free) account endpoint.
 */
async function budgetExhausted(key: string): Promise<boolean> {
  const maxPerRun = Math.max(0, Number(process.env.SERPAPI_MAX_PER_RUN ?? 0));
  if (maxPerRun && liveSearches >= maxPerRun) return true;

  const reserve = Math.max(0, Number(process.env.SERPAPI_MIN_RESERVE ?? 0));
  if (budget === undefined) {
    try {
      const u = await serpApiUsage(key);
      budget = u && u.total > 0 ? { left: u.left } : null; // only guard on a confident total
    } catch {
      budget = null;
    }
  }
  return budget != null && budget.left - liveSearches <= reserve;
}

export interface SerpApiUsage {
  plan: string;
  used: number; // searches used this month
  left: number; // searches remaining this month
  total: number; // monthly allowance
}

/**
 * Authoritative quota from SerpApi's account endpoint (doesn't spend a search).
 * Returns null with no key. Lets the doctor/debug console tell you how close you
 * are to the free-tier cap before it bites.
 */
export async function serpApiUsage(key = process.env.SERPAPI_KEY ?? ""): Promise<SerpApiUsage | null> {
  if (!key) return null;
  const res = await fetch("https://serpapi.com/account.json?" + new URLSearchParams({ api_key: key }));
  if (!res.ok) throw new Error(`serpapi account ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  const used = Number(j.this_month_usage ?? 0);
  const left = Number(j.total_searches_left ?? j.plan_searches_left ?? 0);
  const total = Number(j.searches_per_month ?? used + left);
  return { plan: String(j.plan_name ?? j.plan_id ?? "unknown"), used, left, total };
}

/**
 * Comps via SerpApi — SerpApi does the scraping (and anti-bot) on their side, so
 * you get clean prices without being blocked. Two engines, chosen by env:
 *
 *   SERPAPI_KEY=...                 # required to go live (mock otherwise)
 *   SERPAPI_ENGINE=ebay            # "ebay" (resale, default) or "google_shopping"
 *   SERPAPI_EBAY_SOLD=true         # ebay engine only: realized SOLD prices (basis
 *                                  # "sold"); set false for active asks ("ask")
 *   SERPAPI_EBAY_DOMAIN=ebay.com
 *
 * - ebay engine            → eBay listings; with SOLD on, the realized-price comp
 *                            you actually want — and it bypasses the 403 we hit
 *                            scraping eBay directly.
 * - google_shopping engine → broad retail asking prices across many stores
 *                            (basis "ask"; a ceiling reference, mostly new).
 */
export class SerpApiShoppingConnector implements CompConnector {
  readonly market: string;
  private engine: string;
  private sold: boolean;
  private domain: string;

  constructor(private key = process.env.SERPAPI_KEY ?? "") {
    this.engine = (process.env.SERPAPI_ENGINE ?? "ebay").trim();
    this.sold = (process.env.SERPAPI_EBAY_SOLD ?? "true").toLowerCase() !== "false";
    this.domain = process.env.SERPAPI_EBAY_DOMAIN ?? "ebay.com";
    this.market = this.engine === "google_shopping" ? "google" : "ebay";
  }

  get basis(): "sold" | "ask" | "mock" {
    if (!this.key) return "mock";
    return this.engine === "ebay" && this.sold ? "sold" : "ask";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    if (!this.key) return this.mock(searchString, limit);
    return this.engine === "google_shopping"
      ? this.googleShopping(searchString, limit)
      : this.ebay(searchString, limit);
  }

  /** eBay via SerpApi — handles the anti-bot, supports SOLD/completed filters. */
  private async ebay(searchString: string, limit: number): Promise<SoldComp[]> {
    const params = new URLSearchParams({
      engine: "ebay",
      ebay_domain: this.domain,
      _nkw: searchString,
      api_key: this.key,
    });
    if (this.sold) {
      params.set("LH_Sold", "1");
      params.set("LH_Complete", "1");
    }
    if (await budgetExhausted(this.key)) {
      noteBudgetSkip();
      return [];
    }
    liveSearches++;
    const res = await fetch("https://serpapi.com/search.json?" + params);
    if (!res.ok) throw new Error(`serpapi ebay ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json: any = await res.json();
    return (json.organic_results ?? [])
      .map((r: any): SoldComp => ({
        id: `sebay_${r.epid ?? r.position ?? Math.random().toString(36).slice(2)}`,
        title: String(r.title ?? searchString),
        soldPrice: Math.round(Number(r.price?.extracted ?? r.price?.from?.extracted ?? 0)),
        currency: "USD",
        condition: mapCondition(r.condition),
        url: String(r.link ?? `https://www.${this.domain}`),
        market: "ebay",
      }))
      .filter((c: SoldComp) => c.soldPrice > 0)
      .slice(0, limit);
  }

  /** Google Shopping via SerpApi — broad retail asking prices. */
  private async googleShopping(searchString: string, limit: number): Promise<SoldComp[]> {
    const url =
      "https://serpapi.com/search.json?" +
      new URLSearchParams({ engine: "google_shopping", q: searchString, api_key: this.key, num: String(Math.min(limit, 40)) });
    if (await budgetExhausted(this.key)) {
      noteBudgetSkip();
      return [];
    }
    liveSearches++;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`serpapi ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json: any = await res.json();
    return (json.shopping_results ?? [])
      .map((r: any): SoldComp => ({
        id: `gs_${r.product_id ?? r.position ?? Math.random().toString(36).slice(2)}`,
        title: String(r.title ?? searchString),
        soldPrice: Math.round(Number(r.extracted_price ?? 0)),
        currency: "USD",
        condition: "unknown",
        url: String(r.link ?? r.product_link ?? "https://www.google.com/shopping"),
        market: "google",
      }))
      .filter((c: SoldComp) => c.soldPrice > 0)
      .slice(0, limit);
  }

  private mock(searchString: string, limit: number): SoldComp[] {
    const base = 50 + (hash(searchString) % 200);
    const out: SoldComp[] = [];
    for (let i = 0; i < Math.min(limit, 6); i++) {
      out.push({
        id: `serp_mock_${i}`,
        title: `${searchString} (${this.market} ${i + 1})`,
        soldPrice: Math.round(base * (1 + ((hash(searchString + i) % 30) - 15) / 100)),
        currency: "USD",
        condition: "unknown",
        url: "https://serpapi.com",
        market: this.market,
      });
    }
    return out;
  }
}

function mapCondition(v: unknown): SoldComp["condition"] {
  const s = String(v ?? "").toLowerCase();
  if (/\bnew\b|sealed|brand new/.test(s)) return "new";
  if (/open box|like new/.test(s)) return "like_new";
  if (/parts|not working/.test(s)) return "for_parts";
  if (/pre-?owned|used|good/.test(s)) return "good";
  return "unknown";
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
