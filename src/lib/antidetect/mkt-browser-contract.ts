export const MKT_BROWSER_PROVIDER_NAME = "MKT Browser";
export const MKT_BROWSER_PROVIDER_SLUG = "mkt-browser";
export const MKT_BROWSER_DEFAULT_MCP_PORT = 47_822;
export const MKT_BROWSER_DEFAULT_MCP_URL = `http://127.0.0.1:${MKT_BROWSER_DEFAULT_MCP_PORT}`;
export const MKT_BROWSER_MCP_URL_ENV = "MKT_BROWSER_MCP_URL";
export const MKT_BROWSER_MCP_TOKEN_ENV = "MKT_BROWSER_MCP_TOKEN";

export const MKT_BROWSER_RUNTIME_INFO_TOOL = "get_runtime_info";

/**
 * Contract versions this MKTTool build knows how to drive. It is a list rather than a minimum
 * because compatibility is not monotonic: a future desktop build may drop something this code
 * still calls, and silently trusting "newer is fine" is how a device fails at launch time instead
 * of at health-check time.
 */
export const MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS = [1, 2, 3] as const;

/**
 * Mirrors the desktop contract's codes. MKTTool branches on these; it must never match a
 * human-readable message, which the desktop is free to reword.
 */
export type MktBrowserErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_NOT_RUNNING"
  | "PROFILE_ALREADY_RUNNING"
  | "PROXY_REJECTED"
  | "ENGINE_UNAVAILABLE"
  | "UNKNOWN_TOOL"
  | "MANAGED_PROFILE_LOCKED"
  | "INTERNAL_ERROR";

export interface MktBrowserEngineInfo {
  kind: string;
  /** `null` while the engine is missing or still being prepared. */
  version: string | null;
  status: string;
}

export interface MktBrowserRuntimeInfo {
  provider: string;
  appVersion: string;
  contractVersion: number;
  profileSchemaVersion: number;
  engine: MktBrowserEngineInfo;
  capabilities: string[];
}

export interface MktBrowserCompatibility {
  compatible: boolean;
  /** English, operator-facing, and safe to display. Empty when compatible. */
  reason: string;
}

/**
 * Decide whether this MKTTool build may drive the device that answered.
 *
 * A build too old to expose `get_runtime_info` reports `null`. That is not treated as compatible:
 * it is a known-legacy device that predates the contract, and the caller must say so rather than
 * assume the profile flow will behave.
 */
export function describeMktBrowserCompatibility(
  info: MktBrowserRuntimeInfo | null,
): MktBrowserCompatibility {
  if (!info) {
    return {
      compatible: false,
      reason:
        `This MKT Browser build predates the ${MKT_BROWSER_RUNTIME_INFO_TOOL} contract and cannot ` +
        `report its version. Update MKT Browser on this PC.`,
    };
  }

  if (info.provider !== MKT_BROWSER_PROVIDER_SLUG) {
    return {
      compatible: false,
      reason: `The local MCP endpoint answered as "${info.provider}" instead of ${MKT_BROWSER_PROVIDER_NAME}.`,
    };
  }

  const supported: readonly number[] = MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS;
  if (!supported.includes(info.contractVersion)) {
    return {
      compatible: false,
      reason:
        `${MKT_BROWSER_PROVIDER_NAME} on this PC speaks contract version ${info.contractVersion}; ` +
        `this MKTTool build supports ${supported.join(", ")}. Install the matching release.`,
    };
  }

  return { compatible: true, reason: "" };
}

export function resolveMktBrowserMcpUrl(raw: string | undefined): string {
  const value = raw?.trim() || MKT_BROWSER_DEFAULT_MCP_URL;
  let url: URL;

  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error(`${MKT_BROWSER_MCP_URL_ENV} must be a valid loopback HTTP origin.`, {
      cause,
    });
  }

  const loopbackHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (
    url.protocol !== "http:" ||
    !loopbackHost ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `${MKT_BROWSER_MCP_URL_ENV} must be an HTTP loopback origin such as ${MKT_BROWSER_DEFAULT_MCP_URL}.`,
    );
  }

  return url.origin;
}
