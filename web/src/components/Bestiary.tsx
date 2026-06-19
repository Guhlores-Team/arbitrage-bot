import { useState } from "react";
import { CATALOG, TIER_META, TIER_ORDER } from "../catalog";

// The catalog of profitable targets. Each entry can be hunted now (one scan) or
// watched (recurring) on the chosen source — no more blank-search-box paralysis.
export default function Bestiary({
  onHunt, onWatch,
}: {
  onHunt: (term: string, source: string) => void;
  onWatch: (term: string, source: string) => void;
}) {
  const [source, setSource] = useState("offerup");
  const [q, setQ] = useState("");
  const ql = q.toLowerCase();

  return (
    <>
      <div className="toolbar">
        <input type="text" placeholder="Filter the bestiary…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label style={{ font: "11px 'DM Mono'", color: "var(--muted)" }}>Hunt on
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ marginLeft: 8 }}>
            {["offerup", "facebook", "mercari", "craigslist", "all"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span style={{ font: "11px 'DM Mono'", color: "var(--muted)" }}>🧭 = scan once · 👁 = watch (recurring)</span>
      </div>

      {TIER_ORDER.map((tier) => {
        const meta = TIER_META[tier];
        const items = CATALOG.filter((c) => c.tier === tier && (!ql || c.term.includes(ql) || c.category.toLowerCase().includes(ql)));
        if (!items.length) return null;
        return (
          <div key={tier} style={{ marginBottom: 22 }}>
            <h2 style={{ font: "700 14px 'Cinzel'", margin: "0 0 10px", color: meta.color, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="pill" style={{ color: meta.color, background: meta.color + "22" }}>{meta.label}</span>
              <span style={{ font: "11px 'DM Mono'", color: "var(--muted)" }}>{meta.range}</span>
            </h2>
            <div className="qgrid">
              {items.map((c) => (
                <div className="beast" key={c.term} style={{ borderColor: meta.color + "66" }}>
                  <div className="bt" style={{ fontSize: 18, float: "none", textTransform: "capitalize" }}>{c.term}</div>
                  <div className="bs">{c.category}</div>
                  <div className="brow" style={{ marginTop: 10, color: "var(--muted2)" }}><span>{c.tip}</span></div>
                  <div className="bacts">
                    <button className="bbtn atk" onClick={() => onHunt(c.term, source)}>🧭 Hunt</button>
                    <button className="bbtn loot" onClick={() => onWatch(c.term, source)}>👁 Watch</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
