import type { SourceListing } from "../types.js";
import type { SearchQuery, SourceConnector } from "./connector.js";
import { scrapeFetch } from "../proxy.js";

/**
 * ShopGoodwill source connector — Goodwill's national online-auction site, a
 * deep well of underpriced inventory. It exposes a JSON search API, so this
 * needs NO browser (great on a headless VM) — just an HTTP POST. Prices are
 * current auction bids / buy-now.
 *
 * Best-effort: the API shape is undocumented and can change; parsing is
 * defensive and a changed response yields 0 results rather than a crash.
 * Proxy-aware via scrapeFetch (source "shopgoodwill").
 */
export class ShopGoodwillConnector implements SourceConnector {
  readonly source = "shopgoodwill";

  async search(q: SearchQuery): Promise<SourceListing[]> {
    const limit = q.limit ?? 25;
    const body = {
      searchText: q.query,
      page: 1,
      pageSize: Math.min(limit, 40),
      sortColumn: "1",
      sortDescending: false,
      highPrice: q.maxPrice ? String(q.maxPrice) : "999999",
      lowPrice: "0",
      searchClosedAuctions: false,
      closedAuctionDaysBack: "0",
      isMultipleCategoryIds: false,
      categoryId: 0,
      categoryLevel: 1,
      selectedCategoryIds: "",
      useBuyerPrefs: true,
    };

    const res = await scrapeFetch(
      "https://buyerapi.shopgoodwill.com/api/Search/ItemListing",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      },
      "shopgoodwill",
    );
    if (!res.ok) throw new Error(`shopgoodwill ${res.status}`);
    const json: any = await res.json();
    const items: any[] = json?.searchResults?.items ?? json?.items ?? [];

    const now = new Date().toISOString();
    return items
      .slice(0, limit)
      .map((it): SourceListing => {
        const id = String(it.itemId ?? it.ItemId ?? "");
        const price = Number(it.currentPrice ?? it.buyNowPrice ?? it.minimumBid ?? 0) || 0;
        const img = it.imageUrlString ?? it.imageURL ?? "";
        return {
          id: `sg_${id}`,
          source: "shopgoodwill",
          rawTitle: String(it.title ?? it.Title ?? "").trim(),
          price,
          currency: "USD",
          imageUrls: img ? [absUrl(String(img))] : [],
          url: id ? `https://shopgoodwill.com/item/${id}` : "https://shopgoodwill.com/",
          postedAt: it.startTime ? String(it.startTime) : undefined,
          fetchedAt: now,
        };
      })
      .filter((l) => l.id !== "sg_" && (!q.maxPrice || l.price === 0 || l.price <= q.maxPrice));
  }
}

function absUrl(s: string): string {
  if (/^https?:\/\//.test(s)) return s;
  return `https://shopgoodwillimages.azureedge.net/production/${s.replace(/^\/+/, "")}`;
}
