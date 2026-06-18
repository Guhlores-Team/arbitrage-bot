import type { SoldComp, Condition } from "../types.js";
import type { CompConnector } from "./connector.js";
import { parsePrice } from "./parse.js";

/**
 * Comps from YOUR OWN Apify actor — the truest comp short of eBay's gated
 * Marketplace Insights API. Point it at the eBay-sold actor in /actors/ebay-sold
 * (or any actor that returns sold listings) and its realized sale prices flow
 * straight into the valuation as basis "sold".
 *
 * Configure via env (no token/actor = deterministic mock, so the pipeline runs):
 *   APIFY_TOKEN=apify_api_xxx
 *   APIFY_COMP_ACTOR=you~ebay-sold      # actor id  (use this OR a task)
 *   APIFY_COMP_TASK=task_xxx            # task id (preferred if it has saved input)
 *   APIFY_COMP_MARKET=ebay-sold         # label shown in the per-market breakdown
 *   APIFY_COMP_QUERY_FIELD=query        # actor input field for the search term
 *   APIFY_COMP_INPUT={"maxItems":20}    # extra static actor input (JSON)
 *
 * Output field names are auto-detected (price/soldPrice, url/link, …); override
 * any of them with APIFY_COMP_MAP={"price":"soldPrice","date":"soldAt"}.
 */
export interface ApifyCompConfig {
  token?: string;
  actor?: string;
  taskId?: string;
  market?: string;
  queryField?: string;
  input?: Record<string, unknown>;
  map?: Partial<Record<"id" | "title" | "price" | "url" | "condition" | "date", string>>;
}

export class ApifyCompConnector implements CompConnector {
  readonly market: string;
  private cfg: ApifyCompConfig;

  constructor(cfg: ApifyCompConfig = {}) {
    this.cfg = {
      token: cfg.token ?? process.env.APIFY_TOKEN,
      actor: cfg.actor ?? process.env.APIFY_COMP_ACTOR,
      taskId: cfg.taskId ?? process.env.APIFY_COMP_TASK,
      market: cfg.market ?? process.env.APIFY_COMP_MARKET ?? "ebay-sold",
      queryField: cfg.queryField ?? process.env.APIFY_COMP_QUERY_FIELD ?? "query",
      input: cfg.input ?? parseJsonEnv(process.env.APIFY_COMP_INPUT),
      map: cfg.map ?? parseJsonEnv(process.env.APIFY_COMP_MAP),
    };
    this.market = this.cfg.market!;
  }

  /** Live sold prices when wired; mock otherwise so valuation never blocks. */
  get basis(): "sold" | "mock" {
    return this.configured ? "sold" : "mock";
  }

  private get configured(): boolean {
    return Boolean(this.cfg.token && (this.cfg.actor || this.cfg.taskId));
  }

  async getSoldComps(searchString: string, limit = 20): Promise<SoldComp[]> {
    if (!this.configured) return this.mock(searchString, limit);

    const base = this.cfg.taskId
      ? `https://api.apify.com/v2/actor-tasks/${this.cfg.taskId}`
      : `https://api.apify.com/v2/acts/${this.cfg.actor!.replace("/", "~")}`;
    const url = `${base}/run-sync-get-dataset-items?token=${this.cfg.token}&timeout=180`;

    const input = { [this.cfg.queryField!]: searchString, maxItems: limit, ...(this.cfg.input ?? {}) };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`apify comp ${this.cfg.taskId ?? this.cfg.actor} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const items = (await res.json()) as any[];
    if (!Array.isArray(items)) return [];

    const m = this.cfg.map ?? {};
    return items
      .slice(0, limit)
      .map((it): SoldComp => {
        const raw = pick(it, m.price, ["soldPrice", "price", "salePrice", "amount", "currentPrice"]);
        const link = String(pick(it, m.url, ["url", "link", "itemUrl", "listingUrl"]) ?? "");
        const idVal = String(pick(it, m.id, ["id", "itemId", "productId"]) ?? "");
        return {
          id: `apifyc_${this.market}_${idVal || link || Math.random().toString(36).slice(2)}`,
          title: String(pick(it, m.title, ["title", "name", "productName"]) ?? searchString).trim(),
          soldPrice: typeof raw === "number" ? Math.round(raw) : parsePrice(String(raw ?? "")),
          currency: "USD",
          condition: mapCondition(pick(it, m.condition, ["condition", "itemCondition"])),
          soldAt: optStr(pick(it, m.date, ["soldAt", "soldDate", "date", "endTime"])),
          url: link || "https://www.ebay.com",
          market: this.market,
        };
      })
      .filter((c) => c.soldPrice > 0);
  }

  /** Deterministic stand-in so the pipeline runs before the actor is deployed. */
  private mock(searchString: string, limit: number): SoldComp[] {
    const base = 70 + (hash(searchString) % 280);
    return Array.from({ length: Math.min(limit, 8) }, (_, i) => ({
      id: `apifyc_mock_${hash(searchString + i)}`,
      title: `${searchString} (sold comp ${i + 1})`,
      soldPrice: Math.round(base * (0.85 + ((hash(searchString + i) % 30) / 100))),
      currency: "USD",
      condition: "good" as Condition,
      url: "https://www.ebay.com",
      market: this.market,
    }));
  }
}

function mapCondition(v: unknown): Condition {
  const s = String(v ?? "").toLowerCase();
  if (/\bnew\b|sealed|bnib/.test(s)) return "new";
  if (/open box|like new|excellent/.test(s)) return "like_new";
  if (/used|pre-?owned|good/.test(s)) return "good";
  if (/fair|acceptable/.test(s)) return "fair";
  if (/parts|repair|broken/.test(s)) return "for_parts";
  return "unknown";
}
function pick(obj: any, override: string | undefined, fallbacks: string[]): unknown {
  if (override && obj[override] != null) return obj[override];
  for (const k of fallbacks) if (obj[k] != null) return obj[k];
  return undefined;
}
function optStr(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}
function parseJsonEnv(raw?: string): any {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
