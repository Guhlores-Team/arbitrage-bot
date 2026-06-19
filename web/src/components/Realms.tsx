import type { SourceHealth } from "../types";

// Marketplace zones. Maps real connector health to RPG "realms". A realm is
// LIVE when its connector is ready; selecting it filters The Hunt to that source.
const REALMS: { source: string; name: string; icon: string }[] = [
  { source: "craigslist", name: "Craigslist Caverns", icon: "acid-blob" },
  { source: "offerup", name: "OfferUp Outpost", icon: "armoured-shell" },
  { source: "mercari", name: "Mercari Marsh", icon: "angler-fish" },
  { source: "facebook", name: "Facebook Fells", icon: "angular-spider" },
  { source: "shopgoodwill", name: "Goodwill Grotto", icon: "ammonite" },
];

export default function Realms({
  health, sources, active, onPick,
}: {
  health: SourceHealth[];
  sources: string[];
  active: string;
  onPick: (source: string) => void;
}) {
  const statusFor = (src: string) => health.find((h) => h.source === src);
  return (
    <>
      <div style={{ marginBottom: 14, font: "13px 'Hanken Grotesk'", color: "var(--muted2)" }}>
        Pick a realm to hunt in — or <button className="tbtn" onClick={() => onPick("")}>All Realms</button>
      </div>
      <div className="qgrid">
        {REALMS.map((r) => {
          const h = statusFor(r.source);
          const live = h?.ready;
          const has = sources.includes(r.source);
          const col = live ? "#7df0a0" : "#ff9d6b";
          return (
            <div key={r.source} className="beast" style={{ borderColor: active === r.source ? "var(--gold)" : "var(--line2)", cursor: "pointer" }}
              onClick={() => onPick(r.source)}>
              <div className="tile mask" style={{ background: col, WebkitMaskImage: `url(/art/gi/${r.icon}.svg)`, maskImage: `url(/art/gi/${r.icon}.svg)`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
              <div className="bt" style={{ fontSize: 18 }}>{r.name}</div>
              <div className="bs">
                <span className="pill" style={{ color: col, background: col + "22" }}>{live ? "LIVE" : "NEEDS SETUP"}</span>
              </div>
              <div className="brow" style={{ clear: "both", marginTop: 12 }}>
                <span>{h?.note ?? "connector not detected"}</span>
              </div>
              <div className="brow"><span>Beasts found: <b>{sources.includes(r.source) ? "yes" : "0 so far"}</b>{has ? "" : ""}</span></div>
            </div>
          );
        })}
      </div>
    </>
  );
}
