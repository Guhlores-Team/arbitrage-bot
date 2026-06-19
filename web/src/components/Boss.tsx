import type { Boss as BossT } from "../progression";
import { money } from "../lib";

function countdown(ms: number): string {
  if (ms <= 0) return "resets now";
  const d = Math.floor(ms / 86400_000), h = Math.floor((ms % 86400_000) / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
  return `${d}d ${h}h ${m}m`;
}

export default function Boss({ boss, bossMult }: { boss: BossT; bossMult: number }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="beast" style={{ borderColor: boss.slain ? "var(--green)" : "var(--pink)", boxShadow: `0 0 40px ${(boss.slain ? "#7df0a0" : "#ff5d7a")}33` }}>
        <div className="tile" style={{ width: 96, height: 96, background: boss.slain ? "var(--green)" : "var(--pink)", WebkitMaskImage: "url(/art/gi/dragon-head.svg)", maskImage: "url(/art/gi/dragon-head.svg)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
        <div className="bt" style={{ fontSize: 26 }}>Weekly Raid Boss · Lv {boss.level}</div>
        <div className="bs">Resets in {countdown(boss.msToEnd)} · damage = your realized profit this week{bossMult > 1 ? ` ×${bossMult.toFixed(2)}` : ""}</div>

        <div className="bounty" style={{ clear: "both", height: 18, marginTop: 18 }}>
          <div className="bountyfill" style={{ width: `${100 - boss.pct}%`, background: boss.slain ? "var(--green)" : "linear-gradient(90deg,#ff5d7a,#ffb43f)" }} />
        </div>
        <div className="brow" style={{ fontSize: 12, marginTop: 8 }}>
          <span>HP <b>{money(boss.hp).replace("$", "")} / {money(boss.maxHp).replace("$", "")}</b></span>
          <span style={{ marginLeft: "auto" }}>Damage dealt <b style={{ color: "var(--gold)" }}>{money(boss.damage)}</b></span>
        </div>

        {boss.slain ? (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#11261f", border: "1px solid #2a5446", color: "var(--green)", font: "700 14px 'Cinzel'" }}>
            ⚔ BOSS SLAIN — reward: {boss.reward}. A fiercer boss rises next week.
          </div>
        ) : (
          <div style={{ marginTop: 16, font: "13px 'Hanken Grotesk'", color: "var(--muted2)" }}>
            Deal <b style={{ color: "var(--ink)" }}>{money(boss.hp)}</b> more in realized profit this week to slay it. Every LOOT in The Hunt hits the boss.
          </div>
        )}
      </div>
      <div style={{ marginTop: 14, font: "11px 'DM Mono'", color: "var(--muted)" }}>
        Single-player season. Multi-user leaderboard / rivals = a future phase (needs a shared backend).
      </div>
    </div>
  );
}
