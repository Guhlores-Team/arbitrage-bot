import type { Deal, Stage } from "../types";
import { dealNet, dealRoi, conf, money, rarity, beastFor } from "../lib";

export default function Hunt({
  deals, onAdvance, onEdit, realm, onClearRealm,
}: {
  deals: Deal[];
  onAdvance: (id: string, to: Stage) => void;
  onEdit: (d: Deal) => void;
  realm?: string;
  onClearRealm?: () => void;
}) {
  return (
    <>
      {realm && (
        <div style={{ marginBottom: 12, font: "12px 'DM Mono'", color: "var(--muted2)" }}>
          Hunting in <b style={{ color: "var(--gold)" }}>{realm}</b>
          <button className="tbtn" style={{ marginLeft: 10 }} onClick={onClearRealm}>all realms</button>
        </div>
      )}
      {deals.length === 0 ? (
        <div className="empty">No beasts in these hunting grounds yet.</div>
      ) : (
        <div className="qgrid">
          {deals.map((d) => {
            const n = dealNet(d);
            const [rname, rcol] = rarity(n);
            const pct = Math.max(4, Math.min(100, (n / 150) * 100));
            const c = conf(d);
            const tile = d.image
              ? { background: `url('${d.image}') center/cover` }
              : {
                  background: rcol,
                  WebkitMaskImage: `url(/art/gi/${beastFor(d.id)}.svg)`, maskImage: `url(/art/gi/${beastFor(d.id)}.svg)`,
                  WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center", maskPosition: "center",
                  WebkitMaskSize: "contain", maskSize: "contain",
                };
            return (
              <div className="beast" key={d.id} style={{ borderColor: rcol, boxShadow: `0 0 30px ${rcol}33` }}>
                <div className="tile" style={tile as React.CSSProperties} />
                <div className="bt">{d.title.slice(0, 42)}</div>
                <div className="bs">{rname} · {d.source ?? "—"}{c >= 90 ? " · ⚡CRIT" : ""}</div>
                <div className="bounty"><div className="bountyfill" style={{ width: pct + "%" }} /></div>
                <div className="brow">
                  <span>ROI <b>{Math.round(dealRoi(d) * 100)}%</b></span>
                  <span>CONF <b>{c}%</b></span>
                  <span>COMPS <b>{d.compCount ?? 0}</b></span>
                  <span>NET <b style={{ color: n >= 0 ? "var(--green)" : "var(--red)" }}>{money(n)}</b></span>
                </div>
                <div className="bacts">
                  <button className="bbtn atk" onClick={() => onAdvance(d.id, "bought")}>⚔ ATTACK</button>
                  <button className="bbtn loot" onClick={() => onAdvance(d.id, "sold")}>💰 LOOT</button>
                  <button className="bbtn ghost" onClick={() => onEdit(d)}>✎</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
