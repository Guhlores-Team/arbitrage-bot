import type { SourceListing, SoldComp } from "../types.js";

export interface SearchQuery {
  query: string;
  /** optional price ceiling to pre-filter at the source */
  maxPrice?: number;
  limit?: number;
}

/**
 * A SOURCE connector pulls candidate deals from a marketplace you buy from.
 * Implement this once per source (Craigslist, a scraping provider, etc.).
 * The engine only ever talks to this interface — swapping the underlying
 * mechanism (RSS, API, provider, your own scraper later) changes nothing
 * downstream.
 */
export interface SourceConnector {
  readonly source: string;
  search(q: SearchQuery): Promise<SourceListing[]>;
}

/**
 * A SELL-market connector provides sold comparables to value an item against.
 * Today that's eBay; the same interface lets you add others.
 */
export interface CompConnector {
  readonly market: string;
  /** what the comp prices represent: realized sales, active asks, or mock data */
  readonly basis?: "sold" | "ask" | "mock";
  getSoldComps(searchString: string, limit?: number): Promise<SoldComp[]>;
}
