import "./env.js";
import { readFile } from "node:fs/promises";

/**
 * Import Facebook cookies into the persistent session WITHOUT a screen — so you
 * can authenticate on a headless VM.
 *
 *   1. In your normal browser (logged into Facebook), use a cookie-export
 *      extension (e.g. "Cookie-Editor") → Export → JSON. Copy it.
 *   2. On the VM, paste it into a file:
 *        cat > fb-cookies.json      (paste, then press Ctrl-D)
 *   3. Load it into the session (headless, no display needed):
 *        npm run fb:import fb-cookies.json
 *
 * Accepts a Cookie-Editor style array OR a Playwright storageState object.
 * Writes the cookies into FACEBOOK_USER_DATA_DIR (default .fb-session) so the
 * Facebook source connector is then logged in.
 */

function mapSameSite(v: any): "Strict" | "Lax" | "None" {
  const s = String(v ?? "").toLowerCase();
  if (s === "strict") return "Strict";
  if (s === "no_restriction" || s === "none") return "None";
  return "Lax";
}

function normalize(raw: any[]): any[] {
  const out: any[] = [];
  for (const c of raw) {
    if (!c?.name || c.value == null || !c.domain) continue;
    const sameSite = mapSameSite(c.sameSite);
    out.push({
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain),
      path: c.path ? String(c.path) : "/",
      expires: typeof c.expirationDate === "number" ? Math.round(c.expirationDate) : typeof c.expires === "number" ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: sameSite === "None" ? true : Boolean(c.secure),
      sameSite,
    });
  }
  return out;
}

async function main() {
  const file = process.argv[2] ?? process.env.FACEBOOK_COOKIES_FILE;
  if (!file) {
    console.error("usage: npm run fb:import <cookies.json>");
    process.exit(1);
  }
  const userDataDir = process.env.FACEBOOK_USER_DATA_DIR ?? ".fb-session";

  let parsed: any;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (e: any) {
    console.error(`could not read/parse ${file}: ${e?.message ?? e}`);
    process.exit(1);
  }
  const rawCookies = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.cookies) ? parsed.cookies : null;
  if (!rawCookies) {
    console.error("expected a JSON array of cookies (Cookie-Editor export) or a {cookies:[...]} object");
    process.exit(1);
  }

  const cookies = normalize(rawCookies).filter((c) => /facebook\.com$/.test(c.domain.replace(/^\./, "")) || c.domain.includes("facebook"));
  if (!cookies.length) {
    console.error("no facebook.com cookies found in that file");
    process.exit(1);
  }

  let chromium: any;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Playwright not installed. Run: npm i playwright && npx playwright install chromium");
    process.exit(1);
  }

  // Headless persistent context — addCookies persists them into the profile dir.
  const ctx = await chromium.launchPersistentContext(userDataDir, { headless: true });
  await ctx.addCookies(cookies);
  // touch facebook so the session is associated; ignore nav result
  try {
    const page = await ctx.newPage();
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const loggedIn = !/\/login|\/checkpoint/.test(page.url());
    console.log(loggedIn ? "✓ session looks logged in" : "⚠ loaded but redirected to login — cookies may be stale/incomplete");
  } catch {
    // network/proxy hiccup is fine; cookies are still saved
  }
  await ctx.close();
  console.log(`Imported ${cookies.length} cookies into ${userDataDir}. Try: npm run doctor facebook`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
