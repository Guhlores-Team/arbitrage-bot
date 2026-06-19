import type { Deal, Stage } from "../types";
import { STAGES, NEXT, dealNet, money } from "../lib";

// Quest-mode pipeline board: same deal records as the Ledger board, themed.
export default function Party({
  deals, onAdvance, onEdit,
}: {
  deals: Deal[]; onAdvance: (id: string, to: Stage) => void; onEdit: (d: Deal) => void;
}) {
  const cols: Stage[] = ["new", "bought", "sold", "skipped"];
  return (
    <div className="board" style={{ marginBottom: 0 }}>
      {cols.map((st) => {
        const items = deals.filter((d) => (d.status ?? "new") === st);
        const c = STAGES[st].color;
        const next = NEXT[st];
        return (
          <div className="col" key={st}>
            <h3><span className="dot" style={{ background: c }} />{STAGES[st].quest}<span className="ct">{items.length}</span></h3>
            {items.length === 0 && <div style={{ color: "var(--muted)", font: "11px 'DM Mono'", padding: 4 }}>empty</div>}
            {items.map((d) => {
              const n = dealNet(d);
              return (
                <div className="mini" key={d.id}>
                  <div className="t" style={{ cursor: "pointer" }} onClick={() => onEdit(d)}>{d.title}</div>
                  <div className="r">
                    <span style={{ color: n >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>{money(n)}</span>
                    {next && <button className="adv" onClick={() => onAdvance(d.id, next)}>{next === "sold" ? "💰" : "→"}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
