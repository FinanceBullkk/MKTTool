/** Select the browser-profile adapter from the explicit provider configuration. */
import type { AntidetectAdapter } from "./antidetect-browser-adapter";
import { AdsPowerAdapter } from "./adspower-adapter";
import { MktBrowserAdapter } from "./mkt-browser-adapter";
import {
  MKT_BROWSER_MCP_TOKEN_ENV,
  MKT_BROWSER_MCP_URL_ENV,
  MKT_BROWSER_PROVIDER_SLUG,
  resolveMktBrowserMcpUrl,
} from "./mkt-browser-contract";

export type AntidetectProvider = "mkt-browser" | "adspower";

const DEFAULT_ADSPOWER_URL = "http://local.adspower.net:50325";

let cachedAdapter: AntidetectAdapter | null = null;

export function createAntidetectAdapter(): AntidetectAdapter {
  const provider = (process.env.ANTIDETECT_PROVIDER ?? MKT_BROWSER_PROVIDER_SLUG).toLowerCase();

  switch (provider) {
    case "mkt-browser":
      return new MktBrowserAdapter(
        resolveMktBrowserMcpUrl(process.env[MKT_BROWSER_MCP_URL_ENV]),
        process.env[MKT_BROWSER_MCP_TOKEN_ENV],
      );
    case "adspower":
      return new AdsPowerAdapter(process.env.ADSPOWER_API_URL ?? DEFAULT_ADSPOWER_URL);
    default:
      throw new Error(
        `ANTIDETECT_PROVIDER="${provider}" is invalid. Use "mkt-browser" or "adspower".`,
      );
  }
}

/** Shared process-level adapter. */
export function getAntidetectAdapter(): AntidetectAdapter {
  cachedAdapter ??= createAntidetectAdapter();
  return cachedAdapter;
}

/** Test-only singleton reset. */
export function resetAntidetectAdapter(): void {
  cachedAdapter = null;
}
