import type { Deal, Game, OutcomePatch, SourceHealth, Settings, Watchlist, Sweep } from "./types";

// The dashboard is served from /app but the API lives at the server root.
const API = "";

export async function fetchGame(): Promise<Game> {
  try { return (await (await fetch(`${API}/api/game`)).json()).game ?? {}; } catch { return {}; }
}

export async function saveGame(patch: Game): Promise<Game> {
  try {
    return (await (await fetch(`${API}/api/game`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    })).json()).game ?? {};
  } catch { return patch; }
}

export async function fetchHealth(): Promise<SourceHealth[]> {
  try { return (await (await fetch(`${API}/api/health`)).json()).sources ?? []; } catch { return []; }
}

export async function fetchDeals(): Promise<Deal[]> {
  try {
    const r = await fetch(`${API}/api/opportunities`);
    const j = await r.json();
    return (j.opportunities ?? []) as Deal[];
  } catch {
    return [];
  }
}

export async function patchDeal(id: string, patch: OutcomePatch): Promise<void> {
  await fetch(`${API}/api/opportunities/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteDeal(id: string): Promise<void> {
  await fetch(`${API}/api/opportunities/${id}`, { method: "DELETE" });
}

/** Kick off a scan; resolves when the job finishes (or errors). */
export async function runScan(query: string, source: string, onStatus?: (s: string) => void): Promise<void> {
  const j = await fetch(`${API}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, source }),
  })
    .then((r) => r.json())
    .catch(() => null);
  if (!j?.id) { onStatus?.("error"); return; }
  await new Promise<void>((resolve) => {
    let tries = 0;
    const MAX = 80; // ~3.3 min at 2.5s — give up rather than poll forever
    const poll = setInterval(async () => {
      if (++tries > MAX) { clearInterval(poll); onStatus?.("error"); resolve(); return; }
      const s = await fetch(`${API}/api/search/${j.id}`).then((r) => r.json()).catch(() => null);
      if (s && (s.status === "done" || s.status === "error")) {
        clearInterval(poll);
        onStatus?.(s.status);
        resolve();
      }
    }, 2500);
  });
}

// --- control panel (settings / watchlists / sweeps / alerts) ---
const jget = async (p: string) => { try { return await (await fetch(API + p)).json(); } catch { return {}; } };
const jsend = (p: string, method: string, body?: unknown) =>
  fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json().catch(() => ({})));

export async function fetchSettings(): Promise<{ settings: Settings; sources: string[] }> {
  const j = await jget("/api/settings");
  return { settings: j.settings ?? {}, sources: j.sources ?? [] };
}
export const saveSettings = (body: Settings) => jsend("/api/settings", "PUT", body);

export async function fetchWatchlists(): Promise<Watchlist[]> { return (await jget("/api/watchlists")).watchlists ?? []; }
export const createWatchlist = (b: Partial<Watchlist> & { thresholds?: unknown }) => jsend("/api/watchlists", "POST", b);
export const toggleWatchlist = (id: string, enabled: boolean) => jsend(`/api/watchlists/${id}`, "PATCH", { enabled });
export const deleteWatchlist = (id: string) => fetch(`${API}/api/watchlists/${id}`, { method: "DELETE" });
export const runWatchlist = (id: string) => jsend(`/api/watchlists/${id}/run`, "POST");

export async function fetchSweeps(): Promise<Sweep[]> { return (await jget("/api/sweeps")).sweeps ?? []; }
export const createSweep = (b: Partial<Sweep> & { thresholds?: unknown }) => jsend("/api/sweeps", "POST", b);
export const toggleSweep = (id: string, enabled: boolean) => jsend(`/api/sweeps/${id}`, "PATCH", { enabled });
export const deleteSweep = (id: string) => fetch(`${API}/api/sweeps/${id}`, { method: "DELETE" });
export const runSweep = (id: string) => jsend(`/api/sweeps/${id}/run`, "POST");

export const testAlert = () => jsend("/api/notify/test", "POST");

export const createManual = (input: { title?: string; image?: string; buy?: number; resale?: number; source?: string }) =>
  jsend("/api/opportunities/manual", "POST", input).then((r) => r.opportunity as Deal | undefined);
