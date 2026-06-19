import type { View } from "../types";

export default function TopBar({
  view, onView, onScan, onReload,
}: {
  view: View;
  onView: (v: View) => void;
  onScan: () => void;
  onReload: () => void;
}) {
  return (
    <div className="topbar">
      <h1>{view === "hunt" ? "The Hunt" : "The Ledger"}</h1>
      <div className="seg">
        <button className={view === "hunt" ? "on" : ""} onClick={() => onView("hunt")}>⚔ QUEST</button>
        <button className={view === "ledger" ? "on" : ""} onClick={() => onView("ledger")}>📊 LEDGER</button>
      </div>
      <button className="iconbtn" title="Explore (scan)" onClick={onScan}>🧭</button>
      <button className="iconbtn" title="Refresh" onClick={onReload}>⟳</button>
    </div>
  );
}
