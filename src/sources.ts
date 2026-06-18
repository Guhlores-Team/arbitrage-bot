import { CraigslistConnector } from "./connectors/craigslist.js";
import { FacebookConnector } from "./connectors/facebook.js";
import { MockSourceConnector } from "./connectors/mock.js";
import type { SourceConnector } from "./connectors/connector.js";

/** Source connectors the CLI and dashboard can select by name. */
export const SOURCES = ["demo", "craigslist", "facebook"] as const;
export type SourceName = (typeof SOURCES)[number];

export function pickSource(name: string): SourceConnector {
  switch (name) {
    case "facebook":
      return new FacebookConnector();
    case "craigslist":
      return new CraigslistConnector();
    case "demo":
      return new MockSourceConnector();
    default:
      throw new Error(`unknown source "${name}" (expected ${SOURCES.join("|")})`);
  }
}
