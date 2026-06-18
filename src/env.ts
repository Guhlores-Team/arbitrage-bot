/**
 * Loads .env into process.env at startup. tsx/node do not do this automatically,
 * so without it the documented keys (ANTHROPIC_API_KEY, EBAY_*, thresholds)
 * silently never apply. Uses Node's built-in loader (>=20.12 / 22) — no dep.
 * Safe to import from every entrypoint; missing .env is a no-op.
 */
try {
  // @ts-ignore - present on Node 20.12+/22, not yet in all @types/node versions
  process.loadEnvFile?.(".env");
} catch {
  // no .env file — fine, rely on the ambient environment
}
