/**
 * Anti-detection ("anti-slip") helpers for the browser-driven sources.
 *
 * Marketplaces fingerprint headless automation: the `navigator.webdriver`
 * flag, a missing plugin list, mismatched UA/timezone, perfectly even timing.
 * This module makes a Playwright session look like an ordinary human browser
 * and adds human-paced interaction. It's strictly for low-volume PERSONAL
 * research — the goal is "not obviously a bot", not industrial evasion.
 *
 * Nothing here defeats login or CAPTCHA; you still sign in by hand once.
 */
import { playwrightProxy } from "../proxy.js";

export interface Fingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezoneId: string;
}

// A small pool of real, current desktop-Chrome fingerprints. Picking one per
// run avoids the dead giveaway of a default Playwright UA, while staying
// internally consistent (UA matches a plausible OS + locale + timezone).
const FINGERPRINTS: Fingerprint[] = [
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "America/New_York",
  },
  {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  },
  {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1536, height: 864 },
    locale: "en-US",
    timezoneId: "America/Chicago",
  },
];

/** Pick a random consistent fingerprint for this session. */
export function pickFingerprint(): Fingerprint {
  return FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)];
}

/** Context options that pin the session to the chosen fingerprint. */
export function contextOptions(fp: Fingerprint, headless: boolean) {
  return {
    headless,
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
    // Opt-in for users behind a TLS-intercepting proxy (corporate / some cloud).
    ignoreHTTPSErrors: (process.env.SCRAPER_IGNORE_HTTPS_ERRORS ?? "false") === "true",
    // Route browser traffic through SCRAPER_PROXY if set (residential proxy for
    // scraping from a datacenter IP). Undefined = direct connection.
    proxy: playwrightProxy(),
    // Chrome flags that remove the most obvious automation tells.
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  };
}

/** Navigate with a few retries + backoff; transient nav failures are common. */
export async function gotoWithRetry(page: any, url: string, opts: any = {}, tries = 3): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", ...opts });
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Runs in the page before any site script. Patches the properties headless
 * detection probes first: webdriver flag, plugins, languages, chrome runtime,
 * and the permissions API quirk that betrays automation.
 */
export const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5].map((i) => ({ name: 'Plugin ' + i })),
  });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  window.chrome = window.chrome || { runtime: {} };
  const _query = window.navigator.permissions && window.navigator.permissions.query;
  if (_query && typeof Notification !== 'undefined') {
    window.navigator.permissions.query = (p) =>
      p && p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : _query(p);
  }
`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** A randomized human-ish pause within [lo, hi] ms. */
export function humanPause(lo = 1500, hi = 3500): Promise<void> {
  return sleep(rand(lo, hi));
}

/**
 * Scroll like a person: a few short wheel nudges with small pauses and a little
 * mouse drift, instead of one robotic jump. `page` is typed loosely because
 * Playwright is an optional dependency.
 */
export async function humanScroll(page: any): Promise<void> {
  const steps = Math.floor(rand(2, 5));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, rand(400, 900));
    await sleep(rand(250, 700));
  }
  // occasional idle mouse move — humans don't hold perfectly still
  if (Math.random() < 0.5) {
    await page.mouse.move(rand(200, 1000), rand(200, 700), { steps: Math.floor(rand(3, 8)) });
  }
}
