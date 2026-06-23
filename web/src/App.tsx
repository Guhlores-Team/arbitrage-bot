import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deal, Game, OutcomePatch, Stage, View, SourceHealth, ClassId } from "./types";
import { fetchDeals, patchDeal, deleteDeal, runScan, fetchGame, saveGame, fetchHealth, createManual, createWatchlist } from "./api";
import { downscale } from "./img";
import { dealNet, dealRoi, conf } from "./lib";
import { computeHero, computeQuests, computeBoss, buffsFrom, relicsOwned, RELIC_SLOTS, SKILLS } from "./progression";
import { isMuted, toggleMute, sfxLoot, sfxAdvance, sfxLevel } from "./sound";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Ledger from "./components/Ledger";
import Hunt from "./components/Hunt";
import DealEditor from "./components/DealEditor";
import Realms from "./components/Realms";
import Quests from "./components/Quests";
import ClassView from "./components/ClassView";
import Party from "./components/Party";
import Boss from "./components/Boss";
import Hoard from "./components/Hoard";
import WarTable from "./components/WarTable";
import Bestiary from "./components/Bestiary";
import CoinBurst from "./components/CoinBurst";

export interface Filters { q: string; source: string; stage: string; sort: "net" | "roi" | "conf" | "score"; }

export default function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [game, setGame] = useState<Game>({});
  const [health, setHealth] = useState<SourceHealth[]>([]);
  const [view, setView] = useState<View>(() => (localStorage.getItem("lq_view") as View) || "ledger");
  const [editing, setEditing] = useState<Deal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [muted, setMuted] = useState(isMuted());
  const [filters, setFilters] = useState<Filters>({ q: "", source: "", stage: "", sort: "net" });

  const load = useCallback(async () => setDeals(await fetchDeals()), []);
  useEffect(() => { void load(); void fetchGame().then(setGame); void fetchHealth().then(setHealth); }, [load]);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);
  const switchView = useCallback((v: View) => { setView(v); localStorage.setItem("lq_view", v); }, []);
  const updateGame = useCallback(async (patch: Game) => { setGame((g) => ({ ...g, ...patch })); await saveGame(patch); }, []);

  const classId: ClassId = game.classId ?? "hunter";
  const skills = game.skills ?? [];
  const equipped = game.equipped ?? [];
  const buffs = useMemo(() => buffsFrom(classId, skills, equipped), [classId, skills, equipped]);
  const hero = useMemo(() => computeHero(deals, game.bonusXp ?? 0, buffs), [deals, game.bonusXp, buffs]);
  const quests = useMemo(() => computeQuests(deals, game.claimedQuests ?? []), [deals, game.claimedQuests]);
  const boss = useMemo(() => computeBoss(deals, buffs.bossMult), [deals, buffs.bossMult]);
  const owned = useMemo(() => relicsOwned(deals), [deals]);
  const availableSP = Math.max(0, hero.skillPoints - skills.length);

  const initLevel = useRef(false);
  useEffect(() => {
    if (game.lastSeenLevel == null) {
      if (!initLevel.current) { initLevel.current = true; void updateGame({ lastSeenLevel: hero.level }); }
      return;
    }
    if (hero.level > game.lastSeenLevel) {
      flash(`🆙 LEVEL ${hero.level}! +1 skill point`);
      if (!muted) sfxLevel();
      void updateGame({ lastSeenLevel: hero.level });
    }
  }, [hero.level, game.lastSeenLevel, updateGame, flash, muted]);

  const sources = useMemo(() => [...new Set(deals.map((d) => d.source).filter(Boolean))].sort() as string[], [deals]);
  const filtered = useMemo(() => {
    const q = filters.q.toLowerCase();
    const key = { net: dealNet, roi: dealRoi, conf, score: (d: Deal) => d.score ?? 0 }[filters.sort];
    return deals
      .filter((d) => (!q || d.title.toLowerCase().includes(q)) && (!filters.source || d.source === filters.source) && (!filters.stage || (d.status ?? "new") === filters.stage))
      .sort((a, b) => key(b) - key(a));
  }, [deals, filters]);

  const advance = useCallback(async (id: string, to: Stage) => {
    const d = deals.find((x) => x.id === id);
    if (!d) return;
    const patch: OutcomePatch = { status: to };
    if (to === "bought" && d.boughtPrice == null) patch.boughtPrice = d.buy;
    if (to === "sold" && d.soldPrice == null) patch.soldPrice = d.resale;
    await patchDeal(id, patch);
    if (to === "sold") { setBurst((b) => b + 1); if (!muted) sfxLoot(); flash(`💰 Looted ${d.title.slice(0, 22)}`); }
    else { if (!muted) sfxAdvance(); flash("⚔ Advanced"); }
    await load();
  }, [deals, flash, load, muted]);

  const saveEdit = useCallback(async (patch: OutcomePatch) => {
    if (!editing) return;
    if (patch.status === "sold" && editing.status !== "sold") { setBurst((b) => b + 1); if (!muted) sfxLoot(); }
    await patchDeal(editing.id, patch);
    setEditing(null); flash("Saved"); await load();
  }, [editing, flash, load, muted]);

  const removeDeal = useCallback(async () => {
    if (!editing) return;
    await deleteDeal(editing.id);
    setEditing(null); flash("Deal removed"); await load();
  }, [editing, flash, load]);

  const scan = useCallback(async () => {
    const query = prompt("Explore — search query?", "nintendo switch");
    if (!query) return;
    const source = prompt("Source? (offerup, facebook, mercari)", "offerup") || "offerup";
    flash(`🧭 Scanning ${source}…`);
    await runScan(query, source, (s) => flash(s === "done" ? "Scan complete" : "Scan failed"));
    await load();
  }, [flash, load]);

  const claimQuest = useCallback(async (id: string, reward: number) => {
    await updateGame({ claimedQuests: [...(game.claimedQuests ?? []), id], bonusXp: (game.bonusXp ?? 0) + reward });
    flash(`✨ Quest claimed · +${reward} XP`);
  }, [game.claimedQuests, game.bonusXp, updateGame, flash]);

  const unlockSkill = useCallback((id: string) => {
    if (availableSP <= 0 || skills.includes(id)) return;
    void updateGame({ skills: [...skills, id] });
    flash(`🎓 Unlocked ${SKILLS.find((s) => s.id === id)?.name}`);
  }, [availableSP, skills, updateGame, flash]);

  const toggleRelic = useCallback((id: string) => {
    if (equipped.includes(id)) { void updateGame({ equipped: equipped.filter((x) => x !== id) }); return; }
    if (equipped.length >= RELIC_SLOTS) { flash(`Only ${RELIC_SLOTS} relic slots`); return; }
    void updateGame({ equipped: [...equipped, id] });
  }, [equipped, updateGame, flash]);

  const pickRealm = useCallback((source: string) => { setFilters((f) => ({ ...f, source })); switchView("hunt"); }, [switchView]);

  const huntTerm = useCallback(async (term: string, source: string) => {
    flash(`🧭 Hunting "${term}" on ${source}…`);
    await runScan(term, source, (s) => flash(s === "done" ? `Scan complete: ${term}` : "Scan failed"));
    await load();
  }, [flash, load]);

  const watchTerm = useCallback(async (term: string, source: string) => {
    await createWatchlist({ query: term, source, intervalMin: 60 });
    flash(`👁 Watching "${term}" on ${source}`);
  }, [flash]);

  const snapRef = useRef<HTMLInputElement>(null);
  const onSnapFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    flash("📸 Processing photo…");
    const image = await downscale(f).catch(() => undefined);
    const title = prompt("What did you snap?", "Snapped find") || "Snapped find";
    const o = await createManual({ title, image, source: "snap" });
    await load();
    if (o) setEditing(o); // open the editor to set buy / resale / stage
  }, [flash, load]);

  return (
    <div className="root">
      <Sidebar hero={hero} game={game} view={view} onView={switchView}
        onRename={() => { const n = prompt("Hero name?", game.name || "Operator"); if (n) void updateGame({ name: n }); }} />
      <main className="main">
        <TopBar view={view} onView={switchView} onScan={scan} onReload={load} muted={muted} onMute={() => setMuted(toggleMute())} onSnap={() => snapRef.current?.click()} />
        <div className="content">
          {view === "ledger" && <Ledger deals={deals} filtered={filtered} filters={filters} setFilters={setFilters} sources={sources} onAdvance={advance} onEdit={setEditing} />}
          {view === "hunt" && <Hunt deals={filtered.filter((d) => (d.status ?? "new") !== "skipped")} onAdvance={advance} onEdit={setEditing} realm={filters.source} onClearRealm={() => setFilters((f) => ({ ...f, source: "" }))} />}
          {view === "party" && <Party deals={deals} onAdvance={advance} onEdit={setEditing} />}
          {view === "realms" && <Realms health={health} sources={sources} active={filters.source} onPick={pickRealm} />}
          {view === "quests" && <Quests quests={quests} onClaim={claimQuest} />}
          {view === "classv" && <ClassView current={classId} onPick={(c) => void updateGame({ classId: c })} skills={skills} availableSP={availableSP} onUnlock={unlockSkill} />}
          {view === "boss" && <Boss boss={boss} bossMult={buffs.bossMult} />}
          {view === "hoard" && <Hoard owned={owned} equipped={equipped} onToggle={toggleRelic} />}
          {view === "war" && <WarTable onToast={flash} />}
          {view === "bestiary" && <Bestiary onHunt={huntTerm} onWatch={watchTerm} />}
        </div>
      </main>
      <input ref={snapRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onSnapFile} />
      {editing && <DealEditor deal={editing} onSave={saveEdit} onClose={() => setEditing(null)} onDelete={removeDeal} />}
      <CoinBurst trigger={burst} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
