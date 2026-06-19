import { RELICS, RELIC_SLOTS } from "../progression";

function mask(name: string) {
  return { WebkitMaskImage: `url(/art/gi/${name}.svg)`, maskImage: `url(/art/gi/${name}.svg)`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" } as const;
}

export default function Hoard({
  owned, equipped, onToggle,
}: {
  owned: string[]; equipped: string[]; onToggle: (id: string) => void;
}) {
  return (
    <>
      <div style={{ marginBottom: 14, font: "13px 'Hanken Grotesk'", color: "var(--muted2)" }}>
        Relics drop from <b>big flips (net ≥ $75)</b>. Equip up to <b style={{ color: "var(--gold)" }}>{RELIC_SLOTS}</b> for passive edges.
        Slots used: <b>{equipped.length}/{RELIC_SLOTS}</b>
      </div>
      <div className="qgrid">
        {RELICS.map((r) => {
          const have = owned.includes(r.id);
          const on = equipped.includes(r.id);
          return (
            <div className="beast" key={r.id} style={{ borderColor: on ? "var(--gold)" : "var(--line2)", opacity: have ? 1 : 0.45 }}>
              <div className="tile" style={{ ...mask(r.icon), background: on ? "var(--gold)" : have ? "var(--cyan)" : "var(--muted)" }} />
              <div className="bt" style={{ fontSize: 18 }}>{r.name}</div>
              <div className="bs">{r.desc}{have ? "" : " · locked"}</div>
              <div className="bacts" style={{ clear: "both", marginTop: 14 }}>
                {!have ? (
                  <button className="bbtn ghost" style={{ flex: 1 }} disabled>🔒 Not dropped yet</button>
                ) : on ? (
                  <button className="bbtn ghost" style={{ flex: 1, color: "var(--gold)" }} onClick={() => onToggle(r.id)}>Unequip</button>
                ) : (
                  <button className="bbtn loot" style={{ flex: 1 }} onClick={() => onToggle(r.id)}>Equip</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
