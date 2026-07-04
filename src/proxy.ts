import { fetch as undiciFetch, ProxyAgent } from "undici";

/**
 * Optional proxy for scraping traffic. Set SCRAPER_PROXY to route the source
 * connectors through a (typically residential/mobile) proxy — the real way to
 * scrape local marketplaces from a cloud/datacenter IP that gets 403'd.
 *
 *   SCRAPER_PROXY=http://user:pass@host:port
 *   SCRAPER_PROXY_SOURCES=craigslist,facebook   # optional: only proxy these
 *
 * If SCRAPER_PROXY_SOURCES is unset, all sources are proxied. Scope it when a
 * proxy helps some sources (Craigslist/Facebook) but hurts others whose results
 * are location-sensitive (OfferUp/Mercari often return more on a direct IP).
 *
 * Only marketplace traffic is proxied: browser sources via Playwright's proxy
 * option, the Craigslist HTTP feed via undici. eBay/OpenRouter stay direct.
 */

export function proxyUrl(): string | undefined {
  return process.env.SCRAPER_PROXY || undefined;
}

/**
 * Parse `[scheme://]user:pass@host:port` WITHOUT Node's URL parser, which throws
 * "Invalid URL" when the credentials contain characters residential providers
 * routinely use (`@`, `:`, `#`, `/`, …). Splits on the LAST `@` so a `@` in the
 * password is handled, and the FIRST `:` in the creds so a `:` in the password is
 * kept. Credentials are used raw (as the provider gives them).
 */
function parseProxy(raw?: string): { server: string; username?: string; password?: string } | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  const scheme = /^(\w+):\/\//.exec(s)?.[1] ?? "http";
  s = s.replace(/^\w+:\/\//, "");
  const at = s.lastIndexOf("@");
  const creds = at >= 0 ? s.slice(0, at) : "";
  const hostport = at >= 0 ? s.slice(at + 1) : s;
  if (!hostport) return undefined;
  const ci = creds.indexOf(":");
  const username = at >= 0 ? (ci >= 0 ? creds.slice(0, ci) : creds) : undefined;
  const password = at >= 0 && ci >= 0 ? creds.slice(ci + 1) : undefined;
  return { server: `${scheme}://${hostport}`, username, password };
}

/** Should this source's traffic go through the proxy? */
export function proxyEnabledFor(source?: string): boolean {
  if (!proxyUrl()) return false;
  const only = process.env.SCRAPER_PROXY_SOURCES;
  if (!only) return true; // proxy everything by default
  if (!source) return true;
  return only.split(",").map((s) => s.trim()).filter(Boolean).includes(source);
}

/**
 * Turn a failed scrape response into an actionable error. A 403/429 from a
 * marketplace almost always means the IP is blocked (datacenter/cloud IPs are
 * routinely banned), so point at the fix — a residential/mobile SCRAPER_PROXY —
 * instead of a cryptic status code.
 */
export function blockedHint(source: string, status: number, url?: string): string {
  if (status === 403 || status === 429) {
    const fix = proxyEnabledFor(source)
      ? `a SCRAPER_PROXY is set but still blocked — use a residential/mobile proxy (datacenter proxies get 403'd too)`
      : `${source} blocks datacenter/cloud IPs — set SCRAPER_PROXY=http://user:pass@host:port (residential/mobile) to route ${source} through it`;
    return `${source} ${status} (IP blocked): ${fix}`;
  }
  return `${source} ${status}${url ? ` for ${url}` : ""}`;
}

let _dispatcher: ProxyAgent | undefined;
function dispatcher(): ProxyAgent {
  if (_dispatcher) return _dispatcher;
  const p = parseProxy(proxyUrl())!;
  // Pass credentials as a Basic auth token, not embedded in the URI — undici's
  // URI parser rejects special characters the same way Node's URL does.
  const opts: any = { uri: p.server };
  if (p.username != null) opts.token = `Basic ${Buffer.from(`${p.username}:${p.password ?? ""}`).toString("base64")}`;
  return (_dispatcher = new ProxyAgent(opts));
}

/** Playwright `proxy` option, or undefined if this source shouldn't be proxied. */
export function playwrightProxy(
  source?: string,
): { server: string; username?: string; password?: string } | undefined {
  if (!proxyEnabledFor(source)) return undefined;
  return parseProxy(proxyUrl());
}

/**
 * fetch() for HTTP scraping sources — uses undici's own fetch so the proxy
 * dispatcher is actually honored (Node's global fetch silently ignores a
 * dispatcher from a separately-installed undici). Falls back to a direct
 * request when this source isn't proxied.
 */
export async function scrapeFetch(url: string, init: any = {}, source?: string): Promise<any> {
  // Proxy path uses undici's own fetch so the dispatcher is honored; the direct
  // path uses global fetch (identical to before, and stubbable in tests).
  if (proxyEnabledFor(source)) return undiciFetch(url, { ...init, dispatcher: dispatcher() });
  return fetch(url, init);
}
