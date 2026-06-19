import type { Deal, ClassId } from "./types";
import { dealNet } from "./lib";

export const CLASSES: Record<ClassId, { name: string; perk: string; goldMult: number; xpMult: number; gemMult: number; icon: string }> = {
  hunter: { name: "Bounty Hunter", perk: "+10% gold", goldMult: 1.1, xpMult: 1, gemMult: 1, icon: "crossed-swords" },
  scrapper: { name: "Scrapper", perk: "+25% XP", goldMult: 1, xpMult: 1.25, gemMult: 1, icon: "armor-vest" },
  merchant: { name: "Merchant", perk: "2× gem chance", goldMult: 1, xpMult: 1, gemMult: 2, icon: "anvil" },
};

const XP = { scouted: 5, bought: 15, sold: 60 };
function rarityXp(net: number): number {
  return net >= 100 ? 80 : net >= 75 ? 50 : net >= 50 ? 30 : net >= 25 ? 15 : 0;
}

export interface Hero {
  level: number; xp: number; xpInLevel: number; xpToNext: number; pct: number;
  gold: number; gems: number; streak: number; skillPoints: number; soldCount: number;
}

/** Increasing XP curve: 100, then ×1.35 per level. */
export function levelFromXp(xp: number): { level: number; xpInLevel: number; xpToNext: number } {
  let level = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; level++; need = Math.round(need * 1.35); }
  return { level, xpInLevel: xp - acc, xpToNext: need };
}

export function computeHero(deals: Deal[], classId: ClassId, bonusXp = 0): Hero {
  const cls = CLASSES[classId];
  let rawXp = 0, gold = 0, gems = 0;
  for (const d of deals) {
    const st = d.status ?? "new";
    if (st !== "skipped") rawXp += XP.scouted;
    if (st === "bought" || st === "sold") rawXp += XP.bought;
    if (st === "sold") {
      const net = dealNet(d);
      rawXp += XP.sold + rarityXp(net);
      gold += net; // gold = real realized P/L (kept honest — matches the Ledger)
      if (net >= 50) gems += cls.gemMult;
    }
  }
  const xp = Math.round(rawXp * cls.xpMult) + Math.max(0, bonusXp);
  const { level, xpInLevel, xpToNext } = levelFromXp(xp);
  // streak = trailing run of profitable sells (chronological by statusAt)
  const sold = deals.filter((d) => d.status === "sold").sort((a, b) => (a as any).statusAt?.localeCompare?.((b as any).statusAt) ?? 0);
  let streak = 0;
  for (let i = sold.length - 1; i >= 0; i--) { if (dealNet(sold[i]) > 0) streak++; else break; }
  return { level, xp, xpInLevel, xpToNext, pct: Math.round((xpInLevel / xpToNext) * 100), gold: Math.round(gold), gems, streak, skillPoints: level - 1, soldCount: sold.length };
}

export interface Quest { id: string; key: string; label: string; progress: number; target: number; reward: number; claimable: boolean; claimed: boolean; }

function today(): string { return new Date().toISOString().slice(0, 10); }
function isToday(iso?: string): boolean { return !!iso && iso.slice(0, 10) === today(); }

export function computeQuests(deals: Deal[], claimed: string[]): Quest[] {
  const soldToday = deals.filter((d) => d.status === "sold" && isToday((d as any).statusAt));
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
