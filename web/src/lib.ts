import type { Deal, Stage } from "./types";

export const FEE = 0.18; // resale fee assumption for projected net

export const STAGES: Record<Stage, { label: string; quest: string; color: string }> = {
  new: { label: "Triage", quest: "Scouting", color: "#7fb6ff" },
  bought: { label: "Buying", quest: "Fighting", color: "#ff9d6b" },
  sold: { label: "Sold", quest: "Looted", color: "#7df0a0" },
  skipped: { label: "Passed", quest: "Fled", color: "#8a8f9e" },
};

export const NEXT: Partial<Record<Stage, Stage>> = { new: "bought", bought: "sold" };

const BEASTS = ["dragon-head","angler-fish","angular-spider","animal-skull","acid-blob","armoured-shell","ammonite","alien-skull","apple-maggot"];

export function rarity(net: number): [string, string] {
  if (net >= 100) return ["Legendary", "#ffb43f"];
  if (net >= 75) return ["Epic", "#c77dff"];
  if (net >= 50) return ["Rare", "#4db6ff"];
  if (net >= 25) return ["Uncommon", "#7df0a0"];
  return ["Common", "#8a8f9e"];
}

export function beastFor(id: string): string {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BEASTS[h % BEASTS.length];
}

export function money(n: number): string {
  const v = Math.round(n || 0);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString();
}

/** Realized profit if sold, else fee-adjusted projected net. */
export function dealNet(d: Deal): number {
  if (d.status === "sold" && d.actualProfit != null) return d.actualProfit;
  const buy = d.boughtPrice ?? d.buy ?? 0;
  return Math.round((d.soldPrice ?? d.resale ?? 0) * (1 - FEE) - buy);
}

export function dealRoi(d: Deal): number {
  const buy = d.boughtPrice ?? d.buy ?? 0;
  return buy > 0 ? dealNet(d) / buy : d.marginPct ?? 0;
}

export function conf(d: Deal): number {
  return Math.round((d.matchConfidence ?? 0) * 100);
}
