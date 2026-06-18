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

/** Should this source's traffic go through the proxy? */
export function proxyEnabledFor(source?: string): boolean {
  if (!proxyUrl()) return false;
  const only = process.env.SCRAPER_PROXY_SOURCES;
  if (!only) return true; // proxy everything by default
  if (!source) return true;
  return only.split(",").map((s) => s.trim()).filter(Boolean).includes(source);
}

let _dispatcher: ProxyAgent | undefined;
function dispatcher(): ProxyAgent {
  return (_dispatcher ??= new ProxyAgent(proxyUrl()!));
}

/** Playwright `proxy` option, or undefined if this source shouldn't be proxied. */
export function playwrightProxy(
  source?: string,
): { server: string; username?: string; password?: string } | undefined {
  if (!proxyEnabledFor(source)) return undefined;
  try {
    const u = new URL(proxyUrl()!);
    return {
      server: `${u.protocol}//${u.host}`,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return undefined;
  }
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
