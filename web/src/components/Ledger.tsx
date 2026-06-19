import type { Filters } from "../App";
import type { Deal, Stage } from "../types";
import { lotFlag } from "../types";
import { STAGES, NEXT, dealNet, dealRoi, conf, money, median } from "../lib";

function Kpis({ deals }: { deals: Deal[] }) {
  const open = deals.filter((d) => d.status === "new" || d.status === "bought" || d.status == null);
  const sold = deals.filter((d) => d.status === "sold");
  const realized = sold.reduce((a, d) => a + dealNet(d), 0);
  const projected = open.reduce((a, d) => a + dealNet(d), 0);
  const capital = deals.filter((d) => d.status === "bought").reduce((a, d) => a + (d.boughtPrice ?? d.buy ?? 0), 0);
  const medRoi = median(open.map(dealRoi)); // median ROI — robust to tiny-buy outliers
  const winRate = sold.length ? sold.filter((d) => dealNet(d) > 0).length / sold.length : 0;
  const card = (l: string, v: string, c: string) => (
    <div className="kpi"><div className="l">{l}</div><div className="v" style={{ color: c }}>{v}</div></div>
  );
  return (
    <div className="kpis">
      {card("Realized P/L", money(realized), realized >= 0 ? "var(--green)" : "var(--red)")}
      {card("Projected (open)", money(projected), "var(--gold)")}
      {card("Capital deployed", money(capital), "var(--ink)")}
      {card("Median ROI", Math.round(medRoi * 100) + "%", "var(--cyan)")}
      {card("Win rate", Math.round(winRate * 100) + "%", "var(--purple)")}
    </div>
  );
}

function Board({ deals, onAdvance }: { deals: Deal[]; onAdvance: (id: string, to: Stage) => void }) {
  const cols: [Stage, string][] = [["new", "Triage"], ["bought", "Buying"], ["sold", "Sold"], ["skipped", "Passed"]];
  return (
    <div className="board">
      {cols.map(([st, label]) => {
        const items = deals.filter((d) => (d.status ?? "new") === st);
        const c = STAGES[st].color;
        const next = NEXT[st];
        return (
          <div className="col" key={st}>
            <h3><span className="dot" style={{ background: c }} />{label}<span className="ct">{items.length}</span></h3>
            {items.length === 0 && <div style={{ color: "var(--muted)", font: "11px 'DM Mono'", padding: 4 }}>empty</div>}
            {items.slice(0, 12).map((d) => {
              const n = dealNet(d);
              return (
                <div className="mini" key={d.id}>
                  <div className="t">{d.title}</div>
                  <div className="r">
                    <span style={{ color: n >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>{money(n)}</span>
                    <span style={{ color: "var(--muted)" }}>{Math.round(dealRoi(d) * 100)}%</span>
                    {next && <button className="adv" onClick={() => onAdvance(d.id, next)}>→</button>}
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

export default function Ledger({
  deals, filtered, filters, setFilters, sources, onAdvance, onEdit,
}: {
  deals: Deal[];
  filtered: Deal[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  sources: string[];
  onAdvance: (id: string, to: Stage) => void;
  onEdit: (d: Deal) => void;
}) {
  return (
    <>
      <Kpis deals={deals} />
      <Board deals={deals} onAdvance={onAdvance} />

      <div className="toolbar">
        <input type="text" placeholder="Search items…" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })}>
          <option value="">All stages</option>
          <option value="new">Triage</option><option value="bought">Buying</option>
          <option value="sold">Sold</option><option value="skipped">Passed</option>
        </select>
        <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as Filters["sort"] })}>
          <option value="net">Sort: Net ↓</option><option value="roi">ROI ↓</option>
          <option value="conf">Confidence ↓</option><option value="score">Score ↓</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No deals yet — hit 🧭 Explore to scan, or wait for the watch runner.</div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Item</th><th className="hide-sm">Source</th><th>Stage</th><th>Buy</th><th className="hide-sm">Resale</th>
            <th>Net</th><th>ROI</th><th className="hide-sm">Conf</th><th className="hide-sm">Comps</th><th>Move</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((d) => {
              const st = STAGES[d.status ?? "new"], n = dealNet(d), c = conf(d), next = NEXT[d.status ?? "new"];
              return (
                <tr key={d.id}>
                  <td>
                    <button className="link" onClick={() => onEdit(d)}>{d.title}</button>
                    {lotFlag(d.flags) && <span className="pill" style={{ marginLeft: 6, color: "var(--orange)", background: "#3a2a1a" }}>{lotFlag(d.flags)}</span>}
                  </td>
                  <td className="mono hide-sm" style={{ color: "var(--muted2)" }}>{d.source ?? "—"}</td>
                  <td><span className="pill" style={{ color: st.color, background: st.color + "22" }}>{st.label}</span></td>
                  <td className="mono">{money(d.boughtPrice ?? d.buy)}</td>
                  <td className="mono hide-sm">{money(d.resale)}</td>
                  <td className="mono" style={{ color: n >= 0 ? "var(--green)" : "var(--red)" }}>{money(n)}</td>
                  <td className="mono">{Math.round(dealRoi(d) * 100)}%</td>
                  <td className="mono hide-sm" style={{ color: c >= 80 ? "var(--green)" : c >= 60 ? "var(--gold)" : "var(--muted)" }}>{c}%</td>
                  <td className="mono hide-sm">{d.compCount ?? 0}</td>
                  <td>{next ? <button className="tbtn" onClick={() => onAdvance(d.id, next)}>advance</button> : "—"}</td>
                  <td>{d.url && <a className="link" href={d.url} target="_blank" rel="noopener">↗</a>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </>
  );
}
