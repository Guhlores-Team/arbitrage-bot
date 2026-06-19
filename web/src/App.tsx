import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deal, OutcomePatch, Stage, View } from "./types";
import { fetchDeals, patchDeal, runScan } from "./api";
import { dealNet, dealRoi, conf } from "./lib";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Ledger from "./components/Ledger";
import Hunt from "./components/Hunt";
import DealEditor from "./components/DealEditor";

export interface Filters {
  q: string;
  source: string;
  stage: string;
  sort: "net" | "roi" | "conf" | "score";
}

export default function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [view, setView] = useState<View>(() => (localStorage.getItem("lq_view") as View) || "ledger");
  const [editing, setEditing] = useState<Deal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ q: "", source: "", stage: "", sort: "net" });

  const load = useCallback(async () => setDeals(await fetchDeals()), []);
  useEffect(() => { void load(); }, [load]);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const switchView = useCallback((v: View) => {
    setView(v);
    localStorage.setItem("lq_view", v);
  }, []);

  const sources = useMemo(
    () => [...new Set(deals.map((d) => d.source).filter(Boolean))].sort() as string[],
    [deals],
  );

  const filtered = useMemo(() => {
    const q = filters.q.toLowerCase();
    const key = { net: dealNet, roi: dealRoi, conf, score: (d: Deal) => d.score ?? 0 }[filters.sort];
    return deals
      .filter((d) =>
        (!q || d.title.toLowerCase().includes(q)) &&
        (!filters.source || d.source === filters.source) &&
        (!filters.stage || (d.status ?? "new") === filters.stage),
      )
      .sort((a, b) => key(b) - key(a));
  }, [deals, filters]);

  const advance = useCallback(async (id: string, to: Stage) => {
    const d = deals.find((x) => x.id === id);
    if (!d) return;
    const patch: OutcomePatch = { status: to };
    if (to === "bought" && d.boughtPrice == null) patch.boughtPrice = d.buy;
    if (to === "sold" && d.soldPrice == null) patch.soldPrice = d.resale;
    await patchDeal(id, patch);
    flash(to === "sold" ? "💰 Looted!" : "⚔ Advanced");
    await load();
  }, [deals, flash, load]);

  const saveEdit = useCallback(async (patch: OutcomePatch) => {
    if (!editing) return;
    await patchDeal(editing.id, patch);
    setEditing(null);
    flash("Saved");
    await load();
  }, [editing, flash, load]);

  const scan = useCallback(async () => {
    const query = prompt("Explore — search query?", "nintendo switch");
    if (!query) return;
    const source = prompt("Source? (offerup, facebook, mercari)", "offerup") || "offerup";
    flash(`🧭 Scanning ${source}…`);
    await runScan(query, source, (s) => flash(s === "done" ? "Scan complete" : "Scan failed"));
    await load();
  }, [flash, load]);

  return (
    <div className="root">
      <Sidebar deals={deals} view={view} onView={switchView} />
      <main className="main">
        <TopBar view={view} onView={switchView} onScan={scan} onReload={load} />
        <div className="content">
          {view === "ledger" ? (
            <Ledger
              deals={deals}
              filtered={filtered}
              filters={filters}
              setFilters={setFilters}
              sources={sources}
              onAdvance={advance}
              onEdit={setEditing}
            />
          ) : (
            <Hunt deals={filtered.filter((d) => (d.status ?? "new") !== "skipped")} onAdvance={advance} onEdit={setEditing} />
          )}
        </div>
      </main>
      {editing && <DealEditor deal={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
