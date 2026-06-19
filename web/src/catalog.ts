// A curated "bestiary" of resale-arbitrage targets, tiered by typical flip value
// (legendary = big-ticket, common = frequent small flips). Gives the operator a
// ready list of profitable things to hunt instead of a blank search box.
export type Tier = "legendary" | "epic" | "rare" | "uncommon" | "common";

export const TIER_META: Record<Tier, { label: string; color: string; range: string }> = {
  legendary: { label: "Legendary", color: "#ffb43f", range: "$100+ typical net" },
  epic: { label: "Epic", color: "#c77dff", range: "$50–100" },
  rare: { label: "Rare", color: "#4db6ff", range: "$25–50" },
  uncommon: { label: "Uncommon", color: "#7df0a0", range: "$10–25" },
  common: { label: "Common", color: "#8a8f9e", range: "frequent, smaller" },
};

export interface CatalogItem { term: string; category: string; tier: Tier; tip: string; }

export const CATALOG: CatalogItem[] = [
  // Legendary
  { term: "macbook pro", category: "Laptops", tier: "legendary", tip: "Boot-test; check battery cycle count & model year." },
  { term: "playstation 5", category: "Consoles", tier: "legendary", tip: "Sealed or disc edition move fast." },
  { term: "dyson", category: "Home", tier: "legendary", tip: "Airwrap & V-series hold value best." },
  { term: "kitchenaid mixer", category: "Kitchen", tier: "legendary", tip: "Heavy but high margin; bowl + attachments add value." },
  { term: "lego star wars", category: "Toys", tier: "legendary", tip: "Retired/sealed sets are gold — note the set number." },
  { term: "rtx graphics card", category: "PC parts", tier: "legendary", tip: "Verify exact model; must be working." },
  { term: "milwaukee tools", category: "Tools", tier: "legendary", tip: "DeWalt/Milwaukee/Snap-on resell strong; batteries too." },
  { term: "herman miller aeron", category: "Furniture", tier: "legendary", tip: "Cheap office chairs flip huge; local pickup." },
  // Epic
  { term: "nintendo switch oled", category: "Consoles", tier: "epic", tip: "OLED > base; check for Joy-Con drift." },
  { term: "ipad", category: "Tablets", tier: "epic", tip: "Check activation lock (iCloud) before buying." },
  { term: "apple watch", category: "Wearables", tier: "epic", tip: "Confirm size + that it's unlocked/unpaired." },
  { term: "xbox series x", category: "Consoles", tier: "epic", tip: "Series X >> Series S for resale." },
  { term: "vitamix", category: "Kitchen", tier: "epic", tip: "Even older models sell; test the motor." },
  { term: "sonos speaker", category: "Audio", tier: "epic", tip: "Bose/Sonos hold value; confirm not bricked." },
  { term: "pokemon cards", category: "Collectibles", tier: "epic", tip: "Sealed > singles unless graded; beware fakes." },
  { term: "carhartt jacket", category: "Apparel", tier: "epic", tip: "Workwear & vintage detroit jackets sell well." },
  // Rare
  { term: "airpods pro", category: "Audio", tier: "rare", tip: "Verify genuine + battery health." },
  { term: "instant pot", category: "Kitchen", tier: "rare", tip: "Larger sizes + accessories add value." },
  { term: "robot vacuum", category: "Home", tier: "rare", tip: "Roomba/roborock; needs working battery + dock." },
  { term: "dji drone", category: "Electronics", tier: "rare", tip: "Mini/Air series; check for crashes & batteries." },
  { term: "golf clubs", category: "Sporting", tier: "rare", tip: "Brand drivers/iron sets; lots can be split." },
  { term: "mechanical keyboard", category: "PC parts", tier: "rare", tip: "Enthusiast boards/switches command premiums." },
  { term: "nintendo switch", category: "Consoles", tier: "rare", tip: "Base model still steady; bundles better." },
  // Uncommon
  { term: "video games lot", category: "Games", tier: "uncommon", tip: "Bulk lots → sort & resell singles for margin." },
  { term: "lego bulk", category: "Toys", tier: "uncommon", tip: "Sold by the pound; sort sets/minifigs out." },
  { term: "funko pop", category: "Collectibles", tier: "uncommon", tip: "Vaulted/exclusives only; most are worthless." },
  { term: "vinyl records", category: "Media", tier: "uncommon", tip: "Check artists/pressings; condition is everything." },
  { term: "cast iron skillet", category: "Kitchen", tier: "uncommon", tip: "Griswold/Wagner vintage = premium." },
  { term: "ti-84 calculator", category: "Electronics", tier: "uncommon", tip: "Evergreen student demand, esp. back-to-school." },
  // Common
  { term: "game controllers", category: "Games", tier: "common", tip: "OEM controllers; bundle for better margin." },
  { term: "board games", category: "Toys", tier: "common", tip: "Must be complete; check for missing pieces." },
  { term: "blu-ray lot", category: "Media", tier: "common", tip: "Steelbooks/anime/box sets carry the value." },
  { term: "textbooks", category: "Books", tier: "common", tip: "Current editions only; ISBN-scan to value." },
];

export const TIER_ORDER: Tier[] = ["legendary", "epic", "rare", "uncommon", "common"];
