import type { ClassId } from "../types";
import { CLASSES, SKILLS } from "../progression";

function mask(name: string) {
  return { WebkitMaskImage: `url(/art/gi/${name}.svg)`, maskImage: `url(/art/gi/${name}.svg)`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" } as const;
}

export default function ClassView({
  current, onPick, skills, availableSP, onUnlock,
}: {
  current: ClassId;
  onPick: (c: ClassId) => void;
  skills: string[];
  availableSP: number;
  onUnlock: (id: string) => void;
}) {
  const ids = Object.keys(CLASSES) as ClassId[];
  return (
    <>
      <h2 style={{ font: "700 15px 'Cinzel'", margin: "0 0 12px" }}>Class</h2>
      <div className="qgrid" style={{ marginBottom: 26 }}>
        {ids.map((id) => {
          const c = CLASSES[id], on = current === id;
          return (
            <div className="beast" key={id} style={{ borderColor: on ? "var(--gold)" : "var(--line2)", boxShadow: on ? "0 0 30px #e9c66b33" : "none" }}>
              <div className="tile" style={{ ...mask(c.icon), background: on ? "var(--gold)" : "var(--muted2)" }} />
              <div className="bt" style={{ fontSize: 20 }}>{c.name}</div>
              <div className="bs">{c.perk}</div>
              <div className="bacts" style={{ clear: "both", marginTop: 14 }}>
                <button className={on ? "bbtn ghost" : "bbtn loot"} style={{ flex: 1 }} disabled={on} onClick={() => onPick(id)}>{on ? "✓ Equipped" : "Choose class"}</button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 style={{ font: "700 15px 'Cinzel'", margin: "0 0 4px" }}>Skills</h2>
      <div style={{ marginBottom: 12, font: "12px 'DM Mono'", color: "var(--muted2)" }}>
        Skill points: <b style={{ color: availableSP > 0 ? "var(--gold)" : "var(--muted)" }}>{availableSP}</b> (earn 1 per level)
      </div>
      <div className="qgrid">
        {SKILLS.map((s) => {
          const has = skills.includes(s.id);
          return (
            <div className="beast" key={s.id} style={{ borderColor: has ? "var(--green)" : "var(--line2)" }}>
              <div className="bt" style={{ fontSize: 17, float: "none" }}>{s.name}</div>
              <div className="bs">{s.desc}</div>
              <div className="bacts" style={{ marginTop: 14 }}>
                {has ? (
                  <button className="bbtn ghost" style={{ flex: 1, color: "var(--green)" }} disabled>✓ Unlocked</button>
                ) : (
                  <button className="bbtn loot" style={{ flex: 1, opacity: availableSP > 0 ? 1 : 0.4, cursor: availableSP > 0 ? "pointer" : "not-allowed" }}
                    disabled={availableSP <= 0} onClick={() => onUnlock(s.id)}>Unlock (1 SP)</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
