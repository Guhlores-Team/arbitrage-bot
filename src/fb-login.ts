/**
 * One-time Facebook login to seed the persistent session the connector reuses.
 *
 *   npm run fb:login
 *
 * Opens a real browser window pointed at Facebook. Sign in (and clear any
 * checkpoint/2FA) by hand, then press Enter in this terminal. Your cookies are
 * saved into FACEBOOK_USER_DATA_DIR (default .fb-session, which is gitignored)
 * so later headless runs of the Facebook source are already authenticated.
 */
async function main() {
  const userDataDir = process.env.FACEBOOK_USER_DATA_DIR ?? ".fb-session";
  let chromium: any;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Playwright not installed. Run: npm i playwright && npx playwright install chromium");
    process.exit(1);
  }

  const ctx = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = await ctx.newPage();
  await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded" });

  console.log(
    "\nLog in to Facebook in the opened window (complete any 2FA/checkpoint).\n" +
      `Session is being saved to: ${userDataDir}\n` +
      "When you can see your feed, press Enter here to finish...",
  );

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  await ctx.close();
  console.log("Session saved. The Facebook source can now run headless.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
