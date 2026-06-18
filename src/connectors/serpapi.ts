import type { SoldComp } from "../types.js";
import type { CompConnector } from "./connector.js";

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
