import type { Deal, ClassId } from "./types";
import { dealNet } from "./lib";

export const CLASSES: Record<ClassId, { name: string; perk: string; xpMult: number; gemMult: number; bossMult: number; icon: string }> = {
  hunter: { name: "Bounty Hunter", perk: "+15% boss damage", xpMult: 1, gemMult: 1, bossMult: 1.15, icon: "crossed-swords" },
  scrapper: { name: "Scrapper", perk: "+25% XP", xpMult: 1.25, gemMult: 1, bossMult: 1, icon: "armor-vest" },
  merchant: { name: "Merchant", perk: "2× gem find", xpMult: 1, gemMult: 2, bossMult: 1, icon: "anvil" },
};

export interface Skill { id: string; name: string; desc: string; xp?: number; gem?: number; boss?: number; }
export const SKILLS: Skill[] = [
  { id: "appraiser", name: "Appraiser", desc: "+10% XP", xp: 0.1 },
  { id: "quickdraw", name: "Quick Draw", desc: "+10% XP", xp: 0.1 },
  { id: "lootlust", name: "Lootlust", desc: "+50% gem find", gem: 0.5 },
  { id: "streakmaster", name: "Streak Master", desc: "+15% XP", xp: 0.15 },
  { id: "haggler", name: "Haggler", desc: "+15% boss damage", boss: 0.15 },
  { id: "whalehunter", name: "Whale Hunter", desc: "+30% boss damage", boss: 0.3 },
];

export interface Relic { id: string; name: string; desc: string; icon: string; xp?: number; gem?: number; boss?: number; }
export const RELICS: Relic[] = [
  { id: "goldfang", name: "Gold Fang", desc: "+10% XP", icon: "dragon-head", xp: 0.1 },
  { id: "gemheart", name: "Gem Heart", desc: "+1× gem find", icon: "ammonite", gem: 1 },
  { id: "warbanner", name: "War Banner", desc: "+30% boss damage", icon: "angel-wings", boss: 0.3 },
  { id: "scrapcharm", name: "Scrap Charm", desc: "+15% XP", icon: "armoured-shell", xp: 0.15 },
  { id: "krakeneye", name: "Kraken Eye", desc: "+50% gem find", icon: "angler-fish", gem: 0.5 },
];
export const RELIC_SLOTS = 3;

export interface Buffs { xpMult: number; gemMult: number; bossMult: number; }

export function buffsFrom(classId: ClassId, skills: string[], equipped: string[]): Buffs {
  const b: Buffs = { xpMult: 1, gemMult: 1, bossMult: 1 };
  const cls = CLASSES[classId];
  b.xpMult *= cls.xpMult; b.gemMult *= cls.gemMult; b.bossMult *= cls.bossMult;
  const add = (s: { xp?: number; gem?: number; boss?: number }) => {
    b.xpMult += s.xp ?? 0; b.gemMult += s.gem ?? 0; b.bossMult += s.boss ?? 0;
  };
  for (const id of skills) { const s = SKILLS.find((x) => x.id === id); if (s) add(s); }
  for (const id of equipped) { const r = RELICS.find((x) => x.id === id); if (r) add(r); }
  return b;
}

function hash(s: string): number { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/** Relics are EARNED, not bought: any Epic+ flip (net ≥ $75) drops one (by hash). */
export function relicsOwned(deals: Deal[]): string[] {
  const owned = new Set<string>();
  for (const d of deals) if (d.status === "sold" && dealNet(d) >= 75) owned.add(RELICS[hash(d.id) % RELICS.length].id);
  return [...owned];
}

const XP = { scouted: 5, bought: 15, sold: 60 };
function rarityXp(net: number): number { return net >= 100 ? 80 : net >= 75 ? 50 : net >= 50 ? 30 : net >= 25 ? 15 : 0; }

export interface Hero {
  level: number; xp: number; xpInLevel: number; xpToNext: number; pct: number;
  gold: number; gems: number; streak: number; skillPoints: number; soldCount: number;
}

export function levelFromXp(xp: number): { level: number; xpInLevel: number; xpToNext: number } {
  let level = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; level++; need = Math.round(need * 1.35); }
  return { level, xpInLevel: xp - acc, xpToNext: need };
}

export function computeHero(deals: Deal[], bonusXp: number, buffs: Buffs): Hero {
  let rawXp = 0, gold = 0, gems = 0;
  for (const d of deals) {
    const st = d.status ?? "new";
    if (st !== "skipped") rawXp += XP.scouted;
    if (st === "bought" || st === "sold") rawXp += XP.bought;
    if (st === "sold") {
      const net = dealNet(d);
      rawXp += XP.sold + rarityXp(net);
      gold += net; // gold = real realized P/L — never multiplied
      if (net >= 50) gems += buffs.gemMult;
    }
  }
  const xp = Math.round(rawXp * buffs.xpMult) + Math.max(0, bonusXp);
  const { level, xpInLevel, xpToNext } = levelFromXp(xp);
  const sold = deals.filter((d) => d.status === "sold").sort((a, b) => ((a as any).statusAt ?? "").localeCompare((b as any).statusAt ?? ""));
  let streak = 0;
  for (let i = sold.length - 1; i >= 0; i--) { if (dealNet(sold[i]) > 0) streak++; else break; }
  return { level, xp, xpInLevel, xpToNext, pct: Math.round((xpInLevel / xpToNext) * 100), gold: Math.round(gold), gems: Math.round(gems), streak, skillPoints: level - 1, soldCount: sold.length };
}

// --- Boss Raid (single-player weekly profit boss) ---
function startOfWeek(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day);
  return d.getTime();
}
export interface Boss { level: number; maxHp: number; damage: number; hp: number; pct: number; slain: boolean; msToEnd: number; reward: string; }
export function computeBoss(deals: Deal[], bossMult: number): Boss {
  const wk = startOfWeek();
  const soldCount = deals.filter((d) => d.status === "sold").length;
  const weekNet = deals
    .filter((d) => d.status === "sold" && new Date(d.statusAt ?? 0).getTime() >= wk)
    .reduce((a, d) => a + dealNet(d), 0);
  const level = 1 + Math.floor(soldCount / 5);
  const maxHp = 500 + 100 * Math.floor(soldCount / 5);
  const damage = Math.max(0, Math.round(weekNet * bossMult));
  const hp = Math.max(0, maxHp - damage);
  const msToEnd = wk + 7 * 86400_000 - Date.now();
  return { level, maxHp, damage, hp, pct: Math.round((hp / maxHp) * 100), slain: damage >= maxHp, msToEnd, reward: `${50 * level} gold · 3 gems · relic` };
}

export interface Quest { id: string; key: string; label: string; progress: number; target: number; reward: number; claimable: boolean; claimed: boolean; }
function today(): string { return new Date().toISOString().slice(0, 10); }
function isToday(iso?: string): boolean { return !!iso && iso.slice(0, 10) === today(); }
export function computeQuests(deals: Deal[], claimed: string[]): Quest[] {
  const soldToday = deals.filter((d) => d.status === "sold" && isToday(d.statusAt));
  const banked = soldToday.reduce((a, d) => a + dealNet(d), 0);
  const legendaries = soldToday.filter((d) => dealNet(d) >= 100).length;
  const defs = [
    { key: "flip3", label: "Flip 3 deals today", progress: soldToday.length, target: 3, reward: 120 },
    { key: "legendary", label: "Land a Legendary (net ≥ $100)", progress: legendaries, target: 1, reward: 200 },
    { key: "bank", label: "Bank $300 today", progress: Math.round(banked), target: 300, reward: 150 },
  ];
  const d = today();
  return defs.map((q) => {
    const id = `${q.key}:${d}`;
    const done = q.progress >= q.target;
    return { ...q, id, claimable: done && !claimed.includes(id), claimed: claimed.includes(id) };
  });
}
