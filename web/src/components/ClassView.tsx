import type { ClassId } from "../types";
import type { Hero } from "../progression";
import { CLASSES } from "../progression";

export default function ClassView({
  current, onPick, hero,
}: {
  current: ClassId; onPick: (c: ClassId) => void; hero: Hero;
}) {
  const ids = Object.keys(CLASSES) as ClassId[];
  return (
    <>
      <div style={{ marginBottom: 14, font: "13px 'Hanken Grotesk'", color: "var(--muted2)" }}>
        Pick a class — its perk applies to your real progression. You have <b style={{ color: "var(--gold)" }}>{hero.skillPoints} skill point(s)</b> from leveling.
      </div>
      <div className="qgrid">
        {ids.map((id) => {
          const c = CLASSES[id];
          const on = current === id;
          return (
            <div className="beast" key={id} style={{ borderColor: on ? "var(--gold)" : "var(--line2)", boxShadow: on ? "0 0 30px #e9c66b33" : "none" }}>
              <div className="tile mask" style={{ background: on ? "var(--gold)" : "var(--muted2)", WebkitMaskImage: `url(/art/gi/${c.icon}.svg)`, maskImage: `url(/art/gi/${c.icon}.svg)`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
              <div className="bt" style={{ fontSize: 20 }}>{c.name}</div>
              <div className="bs">{c.perk}</div>
              <div className="bacts" style={{ clear: "both", marginTop: 14 }}>
                <button className={on ? "bbtn ghost" : "bbtn loot"} style={{ flex: 1 }} disabled={on} onClick={() => onPick(id)}>
                  {on ? "✓ Equipped" : "Choose class"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
