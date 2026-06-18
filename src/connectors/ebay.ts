import type { SoldComp, Condition } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * eBay sell-market connector — provides comparables to value an item against.
 *
 * Three comp sources, picked by EBAY_COMP_SOURCE (default "auto"):
 *   - "insights": Marketplace Insights API → real SOLD prices. GATED: you must
 *     apply to eBay for access. The truest comp.
 *   - "browse":   Browse API → ACTIVE asking prices. Works with just app
 *     credentials (no gated access). A rougher comp (asks, not solds) but free
 *     and ungated, so it's the practical default once you have keys.
 *   - "mock":     deterministic offline comps so the pipeline runs with no keys.
 *   - "auto":     try insights, fall back to browse, fall back to mock.
 *
 * EBAY_USE_MOCK_COMPS=true (or missing client id) forces mock regardless.
 */
export type CompSource = "auto" | "insights" | "browse" | "mock";

export class EbayCompConnector implements CompConnector {
  readonly market = "ebay";
  private token?: { value: string; expiresAt: number };

  constructor(
    private clientId = process.env.EBAY_CLIENT_ID ?? "",
    private clientSecret = process.env.EBAY_CLIENT_SECRET ?? "",
    private useMock = (process.env.EBAY_USE_MOCK_COMPS ?? "true") === "true",
    private compSource: CompSource = (process.env.EBAY_COMP_SOURCE as CompSource) ?? "auto",
    // Browse returns ACTIVE asks, which sit above realized sale prices. Discount
    // them toward a likely sold value so margins aren't fantasy. Tune per market.
    private browseAskToSold = clamp01(Number(process.env.EBAY_BROWSE_ASK_TO_SOLD ?? 0.9)),
  ) {}

  /** Which comp source this instance will actually use, for display/debugging. */
  get effectiveSource(): CompSource {
    if (this.useMock || !this.clientId) return "mock";
    return this.compSource;
  }

  /** What the comp prices represent — drives the resale-confidence flag. */
  get basis(): "sold" | "ask" | "mock" {
    const s = this.effectiveSource;
    return s === "mock" ? "mock" : s === "browse" ? "ask" : "sold";
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    return (await this.fetchComps(searchString, limit)).map((c) => ({ ...c, market: "ebay" }));
  }

  private async fetchComps(searchString: string, limit: number): Promise<SoldComp[]> {
    if (this.useMock || !this.clientId) return this.mockComps(searchString, limit);

    switch (this.compSource) {
      case "mock":
        return this.mockComps(searchString, limit);
      case "insights":
        return this.fetchInsights(searchString, limit);
      case "browse":
        return this.fetchBrowse(searchString, limit);
      case "auto":
      default:
        try {
          return await this.fetchInsights(searchString, limit);
        } catch {
          try {
            return await this.fetchBrowse(searchString, limit);
          } catch {
            return this.mockComps(searchString, limit);
          }
        }
    }
  }

  // --- real OAuth client-credentials token ---
  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
    });
    if (!res.ok) throw new Error(`ebay oauth ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return this.token.value;
  }

  // --- SOLD comps (Marketplace Insights; requires granted access) ---
  private async fetchInsights(searchString: string, limit: number): Promise<SoldComp[]> {
    const token = await this.getToken();
    const url =
      "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?" +
      new URLSearchParams({ q: searchString, limit: String(limit) }).toString();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
      },
    });
    if (!res.ok) throw new Error(`ebay insights ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    return (json.itemSales ?? []).map((s: any): SoldComp => ({
      id: s.itemId,
      title: s.title,
      soldPrice: Number(s.lastSoldPrice?.value ?? 0),
      currency: s.lastSoldPrice?.currency ?? "USD",
      condition: mapEbayCondition(s.condition),
      soldAt: s.lastSoldDate,
      url: s.itemWebUrl,
    }));
  }

  // --- ACTIVE asks (Browse API; ungated, just needs app credentials) ---
  private async fetchBrowse(searchString: string, limit: number): Promise<SoldComp[]> {
    const token = await this.getToken();
    const url =
      "https://api.ebay.com/buy/browse/v1/item_summary/search?" +
      new URLSearchParams({ q: searchString, limit: String(Math.min(limit, 200)) }).toString();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
      },
    });
    if (!res.ok) throw new Error(`ebay browse ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    return (json.itemSummaries ?? [])
      .map((s: any): SoldComp => {
        // Browse returns ASKING prices; discount toward a likely sold value.
        const ask = Number(s.price?.value ?? 0);
        return {
          id: s.itemId,
          title: s.title,
          soldPrice: Math.round(ask * this.browseAskToSold),
          currency: s.price?.currency ?? "USD",
          condition: mapEbayCondition(s.condition),
          url: s.itemWebUrl,
        };
      })
      .filter((c: SoldComp) => c.soldPrice > 0);
  }

  // --- deterministic mock so the pipeline runs before you have access ---
  private mockComps(searchString: string, limit: number): SoldComp[] {
    const base = 60 + (hash(searchString) % 240); // pseudo "market price" $60..$300
    const out: SoldComp[] = [];
    for (let i = 0; i < Math.min(limit, 8); i++) {
      const jitter = ((hash(searchString + i) % 40) - 20) / 100; // +/-20%
      out.push({
        id: `mock_${i}`,
        title: `${searchString} (sold comp ${i + 1})`,
        soldPrice: Math.round(base * (1 + jitter)),
        currency: "USD",
        condition: i % 3 === 0 ? "like_new" : "good",
        soldAt: new Date(Date.now() - i * 86_400_000).toISOString(),
        url: "https://www.ebay.com/",
      });
    }
    return out;
  }
}

function mapEbayCondition(c?: string): Condition {
  switch ((c ?? "").toLowerCase()) {
    case "new": return "new";
    case "open box":
    case "certified refurbished":
    case "excellent": return "like_new";
    case "very good":
    case "good": return "good";
    case "acceptable": return "fair";
    case "for parts or not working": return "for_parts";
    default: return "unknown";
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.9;
}
