// Canonical data model. Every connector normalizes into these shapes so the
// rest of the engine never needs to know which marketplace data came from.

export type Condition =
  | "new"
  | "like_new"
  | "good"
  | "fair"
  | "for_parts"
  | "unknown";

export type Source = "craigslist" | "ebay" | "facebook" | "offerup" | "mercari";

/** A raw listing as pulled from a SOURCE marketplace (the place you buy from). */
export interface SourceListing {
  id: string;
  source: Source;
  rawTitle: string;
  description?: string;
  price: number;
  currency: string;
  imageUrls: string[];
  url: string;
  location?: string;
  postedAt?: string; // ISO
  fetchedAt: string; // ISO
}

/** Structured product identity, produced by the extraction step. */
export interface ProductIdentity {
  brand?: string;
  model?: string;
  /** size / storage / color / edition etc. */
  variant?: Record<string, string>;
  category?: string;
  condition: Condition;
  /** model number / style code / UPC if recoverable — the matching gold. */
  canonicalCode?: string;
  /** 0..1, how sure the extractor is it identified the real product. */
  confidence: number;
  /** a clean, normalized search string for comping against the sell market. */
  searchString: string;
}

/** A comparable SOLD record from the SELL market (eBay). */
export interface SoldComp {
  id: string;
  title: string;
  soldPrice: number;
  currency: string;
  condition: Condition;
  soldAt?: string; // ISO
  url: string;
}

/** Verdict from the LLM match-verification step. */
export interface MatchVerdict {
  isMatch: boolean;
  confidence: number; // 0..1
  variantMatch: boolean;
  conditionDelta: number; // signed: comp condition - source condition
  reasoning: string;
}

/** Fully evaluated, fee-adjusted opportunity. */
export interface Opportunity {
  sourceListing: SourceListing;
  identity: ProductIdentity;
  referencePrice: number; // median of matched sold comps
  compCount: number;
  matchConfidence: number;
  estimatedFees: number;
  estimatedShipping: number;
  netProfit: number;
  marginPct: number;
  score: number; // 0..1 composite
  flags: string[];
}
