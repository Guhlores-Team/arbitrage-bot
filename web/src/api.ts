import type { Deal, Game, OutcomePatch, SourceHealth } from "./types";

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

/** Kick off a scan; resolves when the job finishes (or errors). */
export async function runScan(query: string, source: string, onStatus?: (s: string) => void): Promise<void> {
  const j = await fetch(`${API}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, source }),
  })
    .then((r) => r.json())
    .catch(() => null);
  if (!j?.id) return;
  await new Promise<void>((resolve) => {
    const poll = setInterval(async () => {
      const s = await fetch(`${API}/api/search/${j.id}`).then((r) => r.json()).catch(() => null);
      if (s && (s.status === "done" || s.status === "error")) {
        clearInterval(poll);
        onStatus?.(s.status);
        resolve();
      }
    }, 2500);
  });
}
