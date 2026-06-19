import type { View } from "../types";

const TITLES: Record<View, string> = {
  ledger: "The Ledger", hunt: "The Hunt", party: "Your Party",
  realms: "Realms", quests: "Quests", classv: "Class & Skills",
};

export default function TopBar({
  view, onView, onScan, onReload, muted, onMute,
}: {
  view: View; onView: (v: View) => void; onScan: () => void; onReload: () => void; muted: boolean; onMute: () => void;
}) {
  return (
    <div className="topbar">
      <h1>{TITLES[view]}</h1>
      <div className="seg">
        <button className={view === "hunt" ? "on" : ""} onClick={() => onView("hunt")}>⚔ QUEST</button>
        <button className={view === "ledger" ? "on" : ""} onClick={() => onView("ledger")}>📊 LEDGER</button>
      </div>
      <button className="iconbtn" title={muted ? "Unmute" : "Mute"} onClick={onMute}>{muted ? "🔇" : "🔊"}</button>
      <button className="iconbtn" title="Explore (scan)" onClick={onScan}>🧭</button>
      <button className="iconbtn" title="Refresh" onClick={onReload}>⟳</button>
    </div>
  );
}
