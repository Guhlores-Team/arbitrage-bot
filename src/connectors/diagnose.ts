/**
 * Diagnose why a browser-scraped search returned no cards. Keeps the heuristics
 * in a pure, testable function so the connectors and the `doctor` self-test
 * agree on what "blocked" vs "login required" vs "just empty" means.
 */

export type ScrapeState = "ok" | "login_required" | "blocked" | "empty";

export interface Diagnosis {
  state: ScrapeState;
  detail: string;
}

const LOGIN_URL = /\/login|\/checkpoint|\/authentication/i;
const BLOCK_TEXT =
  /(are you a robot|captcha|access denied|temporarily blocked|unusual activity|verify (you'?re|you are) human|enable javascript|request was blocked|automated traffic)/i;

/**
 * @param finalUrl  the URL after any redirects
 * @param cardCount how many listing cards were extracted
 * @param bodyText  a sample of visible page text (for block/challenge detection)
 */
export function classifyPage(finalUrl: string, cardCount: number, bodyText = ""): Diagnosis {
  if (LOGIN_URL.test(finalUrl)) return { state: "login_required", detail: "redirected to a login/checkpoint page" };
  if (cardCount > 0) return { state: "ok", detail: `${cardCount} cards found` };
  if (BLOCK_TEXT.test(bodyText)) return { state: "blocked", detail: "anti-bot / challenge page detected" };
  return { state: "empty", detail: "page loaded but no listing cards matched (no results, or markup changed)" };
}
