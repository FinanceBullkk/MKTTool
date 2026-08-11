import { readFileSync } from "node:fs";
import { win32 } from "node:path";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export type MktBrowserTokenSource = "config-override" | "mkt-browser-data";

export interface ResolvedMktBrowserToken {
  value: string;
  source: MktBrowserTokenSource;
}

interface TokenDiscoveryOptions {
  platform?: NodeJS.Platform;
  localAppData?: string;
}

export function isMktBrowserToken(value: string): boolean {
  return TOKEN_PATTERN.test(value.trim());
}

export function resolveMktBrowserTokenPath(
  options: TokenDiscoveryOptions = {},
): string | null {
  if ((options.platform ?? process.platform) !== "win32") return null;

  const localAppData = (options.localAppData ?? process.env.LOCALAPPDATA)?.trim();
  if (!localAppData || !win32.isAbsolute(localAppData)) return null;

  return win32.join(localAppData, "MKTTool", "MKTBrowser", "mcp-token");
}

export function readMktBrowserToken(tokenPath: string): string | null {
  try {
    const token = readFileSync(tokenPath, "utf8").trim();
    return isMktBrowserToken(token) ? token : null;
  } catch {
    return null;
  }
}

/** Prefer the explicit development override, otherwise read MKT Browser's owned token file. */
export function resolveMktBrowserToken(
  configuredToken?: string,
  options: TokenDiscoveryOptions = {},
): ResolvedMktBrowserToken | null {
  const override = configuredToken?.trim();
  if (override && isMktBrowserToken(override)) {
    return { value: override, source: "config-override" };
  }

  const tokenPath = resolveMktBrowserTokenPath(options);
  if (!tokenPath) return null;

  const discovered = readMktBrowserToken(tokenPath);
  return discovered ? { value: discovered, source: "mkt-browser-data" } : null;
}
