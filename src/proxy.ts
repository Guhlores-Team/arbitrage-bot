import { ProxyAgent } from "undici";

/**
 * Optional proxy for scraping traffic. Set SCRAPER_PROXY to route the source
 * connectors through a (typically residential/mobile) proxy — the real way to
 * scrape local marketplaces from a cloud/datacenter IP that gets 403'd.
 *
 *   SCRAPER_PROXY=http://user:pass@host:port
 *   SCRAPER_PROXY=http://host:port            (no auth)
 *
 * Only the marketplace traffic is proxied: browser sources via Playwright's
 * proxy option, the Craigslist HTTP feed via an undici dispatcher. eBay /
 * OpenRouter / image API calls stay on the direct connection.
 */

export function proxyUrl(): string | undefined {
  return process.env.SCRAPER_PROXY || undefined;
}

let _dispatcher: ProxyAgent | undefined;

/** undici dispatcher to pass as fetch(url, { dispatcher }) for HTTP sources. */
export function proxyDispatcher(): ProxyAgent | undefined {
  const url = proxyUrl();
  if (!url) return undefined;
  return (_dispatcher ??= new ProxyAgent(url));
}

/** Playwright `proxy` option parsed from SCRAPER_PROXY (creds split out). */
export function playwrightProxy():
  | { server: string; username?: string; password?: string }
  | undefined {
  const url = proxyUrl();
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return {
      server: `${u.protocol}//${u.host}`, // host = hostname:port, no credentials
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return undefined;
  }
}
