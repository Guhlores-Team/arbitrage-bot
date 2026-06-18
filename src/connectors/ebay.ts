import type { SoldComp, Condition } from "../types.js";
import type { CompConnector } from "./connector.js";

/**
 * eBay sell-market connector — provides SOLD comparables to value an item.
 *
 * Real sold data comes from the Marketplace Insights API, which is GATED:
 * you apply to eBay for access. Until you're approved (EBAY_USE_MOCK_COMPS=true),
 * this returns deterministic mock comps so the whole pipeline runs end to end.
 *
 * The OAuth + request shape below is the real client-credentials flow, so once
 * you have keys + access you flip EBAY_USE_MOCK_COMPS=false and wire the real
 * endpoint in fetchRealComps().
 */
export class EbayCompConnector implements CompConnector {
  readonly market = "ebay";
  private token?: { value: string; expiresAt: number };

  constructor(
    private clientId = process.env.EBAY_CLIENT_ID ?? "",
    private clientSecret = process.env.EBAY_CLIENT_SECRET ?? "",
    private useMock = (process.env.EBAY_USE_MOCK_COMPS ?? "true") === "true",
  ) {}

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    if (this.useMock || !this.clientId) return this.mockComps(searchString, limit);
    return this.fetchRealComps(searchString, limit);
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

  // --- real sold-comps call (Marketplace Insights; requires granted access) ---
  private async fetchRealComps(searchString: string, limit: number): Promise<SoldComp[]> {
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
