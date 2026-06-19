import { useEffect, useState } from "react";
import type { Settings, SourceHealth, Watchlist, Sweep } from "../types";
import {
  fetchSettings, saveSettings, fetchHealth,
  fetchWatchlists, createWatchlist, toggleWatchlist, deleteWatchlist, runWatchlist,
  fetchSweeps, createSweep, toggleSweep, deleteSweep, runSweep, testAlert,
} from "../api";

// The operational console (themed "War Table"): thresholds, the sources you scan
// (watchlists + sweeps), connector health and a test alert — everything the old
// dashboard's Watch/Settings tabs did, so /app fully replaces it.
export default function WarTable({ onToast }: { onToast: (m: string) => void }) {
  const [settings, setSettings] = useState<Settings>({});
  const [sources, setSources] = useState<string[]>([]);
  const [health, setHealth] = useState<SourceHealth[]>([]);
  const [wls, setWls] = useState<Watchlist[]>([]);
  const [sweeps, setSweeps] = useState<Sweep[]>([]);

  // forms
  const [wl, setWl] = useState({ query: "", source: "offerup", maxPrice: "", intervalMin: 60 });
  const [sw, setSw] = useState({ label: "", keywords: "", source: "offerup", intervalMin: 60, perTick: 2 });

  const reload = async () => {
    const s = await fetchSettings(); setSettings(s.settings); setSources(s.sources);
    setHealth(await fetchHealth()); setWls(await fetchWatchlists()); setSweeps(await fetchSweeps());
  };
  useEffect(() => { void reload(); }, []);

  const th = settings.thresholds ?? { minMarginPct: 0.2, minAbsoluteProfit: 25, minMatchConfidence: 0.8 };
  const setTh = (k: keyof typeof th, v: number) => setSettings((s) => ({ ...s, thresholds: { ...th, [k]: v } }));

  const sourceSel = (val: string, on: (v: string) => void) => (
    <select value={val} onChange={(e) => on(e.target.value)}>
      {(sources.length ? sources : ["offerup", "facebook", "mercari", "craigslist", "all"]).map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  return (
    <div style={{ maxWidth: 920 }}>
      {/* THRESHOLDS */}
      <h2 style={{ font: "700 15px 'Cinzel'", margin: "0 0 10px" }}>Deal thresholds</h2>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <label style={{ font: "11px 'DM Mono'", color: "var(--muted)" }}>Min margin %
          <input type="number" step="0.05" min="0" max="1" value={th.minMarginPct} style={{ width: 90, marginLeft: 8 }}
            onChange={(e) => setTh("minMarginPct", +e.target.value)} /></label>
        <label style={{ font: "11px 'DM Mono'", color: "var(--muted)" }}>Min net $
          <input type="number" step="5" min="0" value={th.minAbsoluteProfit} style={{ width: 90, marginLeft: 8 }}
            onChange={(e) => setTh("minAbsoluteProfit", +e.target.value)} /></label>
        <label style={{ font: "11px 'DM Mono'", color: "var(--muted)" }}>Min match conf
          <input type="number" step="0.05" min="0" max="1" value={th.minMatchConfidence} style={{ width: 90, marginLeft: 8 }}
            onChange={(e) => setTh("minMatchConfidence", +e.target.value)} /></label>
        <button className="tbtn" onClick={async () => { await saveSettings({ thresholds: th, defaultSource: settings.defaultSource }); onToast("Thresholds saved"); }}>Save</button>
      </div>

      {/* HEALTH + ALERT */}
      <h2 style={{ font: "700 15px 'Cinzel'", margin: "20px 0 10px" }}>Connectors</h2>
      <div className="board" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", marginBottom: 8 }}>
        {health.map((h) => (
          <div className="col" key={h.source} style={{ minHeight: 0 }}>
            <h3><span className="dot" style={{ background: h.ready ? "var(--green)" : "var(--orange)" }} />{h.source}</h3>
            <div style={{ font: "11px 'DM Mono'", color: "var(--muted2)" }}>{h.note}</div>
          </div>
        ))}
      </div>
      <button className="tbtn" onClick={async () => { const r = await testAlert(); onToast(r?.sent ? `Alert sent to ${r.sent} channel(s)` : "No alert channel configured"); }}>Send test alert</button>

      {/* WATCHLISTS */}
      <h2 style={{ font: "700 15px 'Cinzel'", margin: "22px 0 10px" }}>Watchlists</h2>
      <div className="toolbar">
        <input type="text" placeholder="query (use commas for multiple)" value={wl.query} onChange={(e) => setWl({ ...wl, query: e.target.value })} />
        {sourceSel(wl.source, (v) => setWl({ ...wl, source: v }))}
        <input type="number" placeholder="max $" style={{ width: 90 }} value={wl.maxPrice} onChange={(e) => setWl({ ...wl, maxPrice: e.target.value })} />
        <input type="number" placeholder="every min" style={{ width: 90 }} value={wl.intervalMin} onChange={(e) => setWl({ ...wl, intervalMin: +e.target.value })} />
        <button className="tbtn" onClick={async () => {
          if (!wl.query.trim()) return onToast("Enter a query");
          await createWatchlist({ query: wl.query.trim(), source: wl.source, maxPrice: wl.maxPrice ? +wl.maxPrice : undefined, intervalMin: wl.intervalMin, thresholds: th });
          setWl({ ...wl, query: "" }); onToast("Watchlist added"); reload();
        }}>Add</button>
      </div>
      <table style={{ marginBottom: 6 }}>
        <thead><tr><th>Query</th><th>Source</th><th>Every</th><th>Last</th><th>On</th><th></th><th></th></tr></thead>
        <tbody>
          {wls.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted)" }}>none</td></tr>}
          {wls.map((w) => (
            <tr key={w.id}>
              <td>{w.query}</td><td className="mono">{w.source}</td><td className="mono">{w.intervalMin}m</td>
              <td className="mono" style={{ color: "var(--muted)" }}>{w.lastFoundCount ?? 0} found</td>
              <td><button className="tbtn" onClick={async () => { await toggleWatchlist(w.id, !w.enabled); reload(); }}>{w.enabled ? "✓ on" : "off"}</button></td>
              <td><button className="tbtn" onClick={async () => { onToast("Running…"); await runWatchlist(w.id); reload(); }}>run</button></td>
              <td><button className="tbtn" onClick={async () => { await deleteWatchlist(w.id); reload(); }}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SWEEPS */}
      <h2 style={{ font: "700 15px 'Cinzel'", margin: "22px 0 10px" }}>Sweeps (round-robin keyword hunts)</h2>
      <div className="toolbar">
        <input type="text" placeholder="label" style={{ flex: "0 0 120px" }} value={sw.label} onChange={(e) => setSw({ ...sw, label: e.target.value })} />
        <input type="text" placeholder="keywords, comma-separated" value={sw.keywords} onChange={(e) => setSw({ ...sw, keywords: e.target.value })} />
        {sourceSel(sw.source, (v) => setSw({ ...sw, source: v }))}
        <input type="number" placeholder="every min" style={{ width: 90 }} value={sw.intervalMin} onChange={(e) => setSw({ ...sw, intervalMin: +e.target.value })} />
        <input type="number" placeholder="per tick" style={{ width: 80 }} value={sw.perTick} onChange={(e) => setSw({ ...sw, perTick: +e.target.value })} />
        <button className="tbtn" onClick={async () => {
          const keywords = sw.keywords.split(",").map((k) => k.trim()).filter(Boolean);
          if (!keywords.length) return onToast("Enter keywords");
          await createSweep({ label: sw.label || "Sweep", keywords, source: sw.source, intervalMin: sw.intervalMin, perTick: sw.perTick, thresholds: th } as any);
          setSw({ ...sw, label: "", keywords: "" }); onToast("Sweep added"); reload();
        }}>Add</button>
      </div>
      <table>
        <thead><tr><th>Label</th><th>Keywords</th><th>Source</th><th>Every</th><th>Found</th><th>On</th><th></th><th></th></tr></thead>
        <tbody>
          {sweeps.length === 0 && <tr><td colSpan={8} style={{ color: "var(--muted)" }}>none</td></tr>}
          {sweeps.map((s) => (
            <tr key={s.id}>
              <td>{s.label}</td><td className="mono" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.keywords.join(", ")}</td>
              <td className="mono">{s.source}</td><td className="mono">{s.intervalMin}m·{s.perTick}</td>
              <td className="mono" style={{ color: "var(--muted)" }}>{s.totalFound ?? 0}</td>
              <td><button className="tbtn" onClick={async () => { await toggleSweep(s.id, !s.enabled); reload(); }}>{s.enabled ? "✓ on" : "off"}</button></td>
              <td><button className="tbtn" onClick={async () => { onToast("Running…"); await runSweep(s.id); reload(); }}>run</button></td>
              <td><button className="tbtn" onClick={async () => { await deleteSweep(s.id); reload(); }}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
