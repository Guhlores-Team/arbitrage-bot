# DESLOPPIFY — cleanup backlog

A prioritized review of tech debt accrued during rapid build-out.

## Status (updated)
**Done:** C1 ✅ · M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ · M6 ✅ · M7 ✅ · M8 ✅ · M9 ✅ · M10 ✅ · N1 ✅ · N4 ✅
**N2 — partially done ✅:** deduped the repeated `iconMask()` helper (real DRY debt).
The remaining inline→CSS migration is left incremental (component-specific, no
functional debt).
**N3 — intentionally NOT done:** JSON→SQLite/Prisma is premature for a
single-process app and would add migration/concurrency complexity for zero
current benefit. Trigger to revisit: multiple processes writing the store, write
contention, or store.json growing unwieldy (big snap images).
Details for each remain below for reference.

Legend — **Safe now**: low blast radius, do anytime · **Coordinate**: touches
shared/behavioral code, do deliberately with tests.

---

## 1) Critical — correctness / trust

### C1 — Dashboard shows a *different* net/ROI than the engine computes
- **Where:** `web/src/lib.ts` (`FEE = 0.18`, `dealNet`, `dealRoi`) vs `src/valuation/value.ts` + `src/valuation/fees.ts`.
- **What:** The web recomputes projected **net** client-side with a flat **18%** fee and ignores the engine's `d.net`/`d.marginPct`, which use **per-category fees (13.25%/14.95%) + shipping** and the conservative p40 reference. Worse: the client recompute is **not lot-aware**, so the LOT qty×comp valuation we just added is **invisible in the Ledger/Hunt cards** (they still show single-item math).
- **Why it matters:** You explicitly asked for *trustworthy numbers*. Right now the UI contradicts the tuned engine, and lots are mis-valued on screen.
- **Recommend:** In `dealNet`/`dealRoi`, prefer the backend values (`d.net`, `d.marginPct`) for non-edited deals; only recompute live inside the Deal Editor preview. Keep one fee source of truth.
- **Safe now?** Safe (frontend display), but verify against a few real deals + a lot after.

---

## 2) Medium — consistency, maintainability, docs

### M1 — `median`/`percentile` duplicated 4–5 times
- **Where:** `src/stats.ts` (percentile), `src/pipeline.ts` (median), `src/valuation/value.ts` (median+percentile), `src/doctor.ts` (inline median), `web/src/lib.ts` (median).
- **Why:** Drift risk; already two slightly different percentile conventions.
- **Recommend:** Backend imports one impl from `src/stats.ts` (pipeline, value, doctor). Web keeps its own (separate bundle) but reuse within the bundle.
- **Safe now?** Safe; covered by existing valuation/stats tests.

### M2 — Built assets committed with no drift guard
- **Where:** `public/app/*` (Vite output) committed next to `web/` source; deploy is `git pull` (no VM build).
- **Why:** Edit `web/` + forget `npm run build:web` → the live app silently goes stale.
- **Recommend:** Add a CI step (or a `predeploy`/`prepush` hook) that runs `npm run build:web` and fails if `git diff --exit-code public/app` is dirty. At minimum, document the rule at the top of `web/`.
- **Safe now?** Safe (additive).

### M3 — Two names for one concept: "opportunity" vs "deal", status vs stage
- **Where:** backend `OpportunityView.status` (`new|bought|sold|skipped`) vs web `Deal`/`Stage` + quest names (`scouting|fighting|looted|fled`); mapping (`STAGES`) lives only in `web/src/lib.ts`.
- **Why:** New contributors (and future you) must hold two vocabularies in their head.
- **Recommend:** Document the canonical model + mapping in one place (a short comment block or `docs/MODEL.md`); consider renaming `Deal`→`Opportunity` in the web for parity (bigger).
- **Safe now?** Docs safe now; rename = Coordinate.

### M4 — The entire web app is untested
- **Where:** `web/src/progression.ts` (`levelFromXp`, `computeHero`, `computeBoss`, `computeQuests`), `web/src/lib.ts` (`dealNet`, `rarity`) — real logic, zero tests. `web/test/` doesn't exist.
- **Why:** Progression/valuation math can regress silently; these are the numbers the user acts on.
- **Recommend:** Add a tiny test runner for the pure functions (node:test can import the `.ts` via tsx, or add vitest). Start with `progression` + `dealNet`.
- **Safe now?** Safe (additive).

### M5 — Legacy `classic.html` (760 lines) still shipped
- **Where:** `public/classic.html`, served at `/classic`.
- **Why:** Unmaintained second dashboard; will rot and confuse. It duplicates control logic now in the React War Table.
- **Recommend:** Decide: keep as a documented break-glass fallback (add a banner/comment) **or** delete now that `/app` covers Watch/Settings. Lean delete.
- **Safe now?** Safe to delete (fallback only); confirm you don't rely on it first.

### M6 — `as any` papering over type gaps in app code
- **Where:** `web/src/progression.ts` (`(d as any).statusAt` ×3 — `Deal` type lacks `statusAt`), `web/src/components/WarTable.tsx` (`createSweep(... as any)` — API type lacks `thresholds`).
- **Why:** Defeats type safety exactly where data shape matters.
- **Recommend:** Add `statusAt?: string` to `Deal`; widen the `createSweep`/`createWatchlist` param types to include `thresholds`.
- **Safe now?** Safe.

### M7 — Threshold defaults duplicated in 3+ places
- **Where:** `src/scoring/score.ts` (`THRESHOLDS`), `web/src/components/WarTable.tsx` (`{0.2,25,0.8}`), watchlist/sweep interval defaults.
- **Why:** Change one, forget another → inconsistent behavior.
- **Recommend:** Surface defaults via `/api/config` (already partly there) and have the UI read them instead of hardcoding.
- **Safe now?** Coordinate (small).

### M8 — No `.env.example`
- **Where:** repo root. Many vars exist (`SERPAPI_*`, `SCRAPER_LAT/LNG`, `SCRAPER_PROXY*`, `PIPELINE_CONCURRENCY`, `COMP_*`, `PREFILTER_OFFTOPIC`, `FACEBOOK_*`, `TELEGRAM_*`, `PORT/HOST`, `WATCH_IN_SERVER`).
- **Why:** Onboarding/recovery is guesswork; you literally ran `SERPAPI_KEY=YOUR_NEW_KEY` once.
- **Recommend:** Add a documented `.env.example` enumerating every var with a one-line note + safe default.
- **Safe now?** Safe.

### M9 — README actor table overstates readiness
- **Where:** `actors/README.md` — all actors marked "✅ ready to deploy", but `doctor:actors` showed `ebay-sold`, `ebay`, `craigslist`, `depop`, `nextdoor` returning 0.
- **Why:** Misleading; you'll trust a dead actor.
- **Recommend:** Update the table to real status (✅ working: stockx/poshmark/mercari/offerup/hibid; ⚠️ blocked/needs-work: the rest).
- **Safe now?** Safe (docs).

### M10 — Silent error swallowing + unbounded scan poll
- **Where:** `web/src/api.ts` (catches → returns `{}`/`[]`), `runScan` poll has no timeout (polls forever if a job never resolves).
- **Why:** Failures vanish; a stuck scan loops indefinitely.
- **Recommend:** Cap the poll (e.g., 2–3 min then give up + toast), and surface fetch failures as a toast rather than empty data.
- **Safe now?** Safe.

---

## 3) Nice-to-have — polish

### N1 — Dashboard auth (currently wide open on the tailnet)
- **Where:** `src/server.ts` — no auth; all `/api/*` mutate freely.
- **Why:** Fine while tailnet-only; becomes a real issue if ever Funnel-exposed.
- **Recommend:** A simple shared-secret/basic-auth env gate before any public exposure. Not urgent on a private tailnet.
- **Safe now?** Safe (additive) — do before exposing publicly.

### N2 — Heavy inline styles across all components
- **Where:** every `web/src/components/*.tsx`.
- **Why:** Verbose; harder to theme consistently. (Consistent with the design handoff, so low priority.)
- **Recommend:** Migrate repeated inline styles to CSS classes opportunistically.
- **Safe now?** Safe, incremental.

### N3 — JSON file store won't survive concurrency/scale
- **Where:** `src/store.ts` (single `store.json`, temp-rename writes). Prisma path referenced but unused.
- **Why:** Fine for one process; multi-process/high-write would race; big snap images bloat the file.
- **Recommend:** Note the ceiling; revisit Prisma/SQLite only if you outgrow single-process.
- **Safe now?** Wait (no need yet).

### N4 — Lot qty parser misses some forms
- **Where:** `src/pipeline.ts` `detectLot`.
- **Why:** Conservative by design; some lots won't get a qty (still flagged).
- **Recommend:** Expand patterns later as you see real misses.
- **Safe now?** Safe, incremental.

---

## Suggested order
1. **C1** (trust — the numbers must match)
2. **M9 + M8 + M2** (cheap docs/guardrails, high leverage)
3. **M1 + M6** (dedupe + types)
4. **M4** (web tests — lock in correctness before more features)
5. **M10 + M5 + M7 + M3**
6. Nice-to-haves as time allows
