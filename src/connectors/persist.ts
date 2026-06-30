import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Best-effort JSON load — returns `fallback` on any missing/corrupt file. */
export function loadJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Best-effort atomic JSON write (temp + rename). Cache/usage data is
 *  disposable, so a failed write is logged-by-silence, never thrown. */
export function saveJson(path: string, data: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path);
  } catch {
    /* disposable cache — never let a persistence hiccup break a scan */
  }
}
