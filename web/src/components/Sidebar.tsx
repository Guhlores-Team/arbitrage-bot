import type { Deal, View } from "../types";
import { dealNet, money } from "../lib";

function mask(name: string) {
  return { WebkitMaskImage: `url(/art/gi/${name}.svg)`, maskImage: `url(/art/gi/${name}.svg)` } as const;
}

const NAV: { icon: string; label: string; view?: View }[] = [
  { icon: "scroll-unfurled", label: "Ledger", view: "ledger" },
  { icon: "crossed-swords", label: "The Hunt", view: "hunt" },
  { icon: "all-for-one", label: "Party" },
  { icon: "anchor", label: "Realms" },
  { icon: "dragon-head", label: "Boss Raid" },
  { icon: "armor-vest", label: "Class" },
  { icon: "anvil", label: "The Hoard" },
];

export default function Sidebar({ deals, view, onView }: { deals: Deal[]; view: View; onView: (v: View) => void }) {
  const sold = deals.filter((d) => d.status === "sold");
  const gold = sold.reduce((a, d) => a + dealNet(d), 0);
  const streak = sold.filter((d) => dealNet(d) > 0).length;

  return (
    <aside className="aside">
      <div className="brand">
        <div className="ico mask" style={mask("crossed-swords")} />
        <div>
          <div className="nm">LOOT QUEST</div>
          <div className="sub">flip · loot · level up</div>
        </div>
      </div>

      <div className="herocard">
        <div className="hero-name">Operator</div>
        <div className="hero-lvl">Lv 1 · Bounty Hunter</div>
        <div className="xpwrap"><div className="xpbar" style={{ width: "8%" }} /></div>
        <div className="stats3">
          <div className="stat3"><div className="v" style={{ color: "var(--gold)" }}>{money(gold)}</div><div className="l">GOLD</div></div>
          <div className="stat3"><div className="v" style={{ color: "var(--cyan)" }}>0</div><div className="l">GEMS</div></div>
          <div className="stat3"><div className="v" style={{ color: "var(--orange)" }}>{streak}</div><div className="l">STREAK</div></div>
        </div>
      </div>

      <nav className="rail">
        {NAV.map((n) => (
          <button
            key={n.label}
            className={n.view && n.view === view ? "on" : ""}
            disabled={!n.view}
            title={n.view ? "" : "next phase"}
            onClick={() => n.view && onView(n.view)}
          >
            <span className="ti mask" style={mask(n.icon)} />
            {n.label}
          </button>
        ))}
      </nav>

      <div className="credits">
        Icons: game-icons.net (CC-BY 3.0) · Twemoji (CC-BY 4.0).<br />
        Phase 1 — Ledger + Hunt over live engine.
      </div>
    </aside>
  );
}
