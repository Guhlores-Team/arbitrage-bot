import type { Game, View } from "../types";
import type { Hero } from "../progression";
import { CLASSES } from "../progression";
import { money, iconMask as mask } from "../lib";

const NAV: { icon: string; label: string; view?: View }[] = [
  { icon: "scroll-unfurled", label: "Ledger", view: "ledger" },
  { icon: "crossed-swords", label: "The Hunt", view: "hunt" },
  { icon: "scroll-unfurled", label: "Bestiary", view: "bestiary" },
  { icon: "all-for-one", label: "Party", view: "party" },
  { icon: "anchor", label: "Realms", view: "realms" },
  { icon: "archery-target", label: "Quests", view: "quests" },
  { icon: "armor-vest", label: "Class & Skills", view: "classv" },
  { icon: "dragon-head", label: "Boss Raid", view: "boss" },
  { icon: "anvil", label: "The Hoard", view: "hoard" },
  { icon: "arrow-cluster", label: "War Table", view: "war" },
];

export default function Sidebar({
  hero, game, view, onView, onRename,
}: {
  hero: Hero; game: Game; view: View; onView: (v: View) => void; onRename: () => void;
}) {
  const cls = CLASSES[game.classId ?? "hunter"];
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
        <div className="hero-name" style={{ cursor: "pointer" }} title="rename" onClick={onRename}>
          {game.name || "Operator"}
        </div>
        <div className="hero-lvl">Lv {hero.level} · {cls.name}</div>
        <div className="xpwrap"><div className="xpbar" style={{ width: `${hero.pct}%` }} /></div>
        <div style={{ font: "9px 'DM Mono'", color: "var(--muted)", marginTop: 4 }}>
          {hero.xpInLevel} / {hero.xpToNext} XP{hero.skillPoints > 0 ? ` · ${hero.skillPoints} SP` : ""}
        </div>
        <div className="stats3">
          <div className="stat3"><div className="v" style={{ color: "var(--gold)" }}>{money(hero.gold)}</div><div className="l">GOLD</div></div>
          <div className="stat3"><div className="v" style={{ color: "var(--cyan)" }}>{hero.gems}</div><div className="l">GEMS</div></div>
          <div className="stat3"><div className="v" style={{ color: "var(--orange)" }}>{hero.streak}🔥</div><div className="l">STREAK</div></div>
        </div>
      </div>

      <nav className="rail">
        {NAV.map((n) => (
          <button key={n.label} className={n.view && n.view === view ? "on" : ""} disabled={!n.view}
            title={n.view ? "" : "next phase"} onClick={() => n.view && onView(n.view)}>
            <span className="ti mask" style={mask(n.icon)} />{n.label}
          </button>
        ))}
      </nav>

      <div className="credits">
        Icons: game-icons.net (CC-BY 3.0) · Twemoji (CC-BY 4.0).<br />
        Gold = your real realized P/L. XP/level = play score.
      </div>
    </aside>
  );
}
