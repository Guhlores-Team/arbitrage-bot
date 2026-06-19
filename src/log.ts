/**
 * Tiny leveled logger — the debug console's backend. Quiet by default (only
 * warn/error). Turn it on with DEBUG=1 or LOG_LEVEL=debug. Everything goes to
 * stderr as structured lines so it never pollutes stdout (JSON output, piped
 * results, the dashboard's API responses).
 */
export type Level = "error" | "warn" | "info" | "debug";

const ORDER: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/** Active threshold, read per-call so tests/CLIs can flip env at runtime. */
function threshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (lvl in ORDER) return ORDER[lvl as Level];
  const dbg = process.env.DEBUG;
  if (dbg && dbg !== "false" && dbg !== "0") return ORDER.debug;
  return ORDER.warn;
}

function safeJson(d: unknown): string {
  try {
    return typeof d === "string" ? d : JSON.stringify(d);
  } catch {
    return String(d);
  }
}

function emit(level: Level, msg: string, data?: unknown): void {
  if (ORDER[level] > threshold()) return;
  const suffix = data === undefined ? "" : " " + safeJson(data);
  console.error(`[${level}] ${msg}${suffix}`);
}

export const log = {
  error: (m: string, d?: unknown) => emit("error", m, d),
  warn: (m: string, d?: unknown) => emit("warn", m, d),
  info: (m: string, d?: unknown) => emit("info", m, d),
  debug: (m: string, d?: unknown) => emit("debug", m, d),
  /** True when a level would print — guard expensive log payloads with this. */
  enabled: (level: Level) => ORDER[level] <= threshold(),
};
