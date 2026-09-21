export const MKT_BROWSER_PROVIDER_NAME = "MKT Browser";
export const MKT_BROWSER_PROVIDER_SLUG = "mkt-browser";
export const MKT_BROWSER_DEFAULT_MCP_PORT = 47_822;
export const MKT_BROWSER_DEFAULT_MCP_URL = `http://127.0.0.1:${MKT_BROWSER_DEFAULT_MCP_PORT}`;
export const MKT_BROWSER_MCP_URL_ENV = "MKT_BROWSER_MCP_URL";
export const MKT_BROWSER_MCP_TOKEN_ENV = "MKT_BROWSER_MCP_TOKEN";

export const MKT_BROWSER_RUNTIME_INFO_TOOL = "get_runtime_info";
export const MKT_BROWSER_REFRESH_LICENSE_CAPACITY_TOOL = "refresh_license_capacity";

/**
 * Contract versions this MKTTool build knows how to drive. It is a list rather than a minimum
 * because compatibility is not monotonic: a future desktop build may drop something this code
 * still calls, and silently trusting "newer is fine" is how a device fails at launch time instead
 * of at health-check time.
 */
export const MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS = [1, 2, 3, 4, 5] as const;

/**
 * Mirrors the desktop contract's codes. MKTTool branches on these; it must never match a
 * human-readable message, which the desktop is free to reword.
 */
export const MKT_BROWSER_ERROR_CODES = [
  "INVALID_INPUT",
  "FORBIDDEN",
  "PROFILE_NOT_FOUND",
  "PROFILE_NOT_RUNNING",
  "PROFILE_ALREADY_RUNNING",
  "PROXY_REJECTED",
  "ENGINE_UNAVAILABLE",
  "UNKNOWN_TOOL",
  "MANAGED_PROFILE_LOCKED",
  "PROFILE_DELETION_PENDING",
  "INTERNAL_ERROR",
] as const;

export type MktBrowserErrorCode = (typeof MKT_BROWSER_ERROR_CODES)[number];

export function isMktBrowserErrorCode(value: unknown): value is MktBrowserErrorCode {
  return MKT_BROWSER_ERROR_CODES.includes(value as MktBrowserErrorCode);
}

export interface MktBrowserEngineInfo {
  kind: string;
  /** `null` while the engine is missing or still being prepared. */
  version: string | null;
  status: string;
}

export type MktBrowserLicenseAvailability =
  | "ready"
  | "checking"
  | "in-use"
  | "cooling"
  | "recovering"
  | "unable-to-verify";

export interface MktBrowserLicenseCapacity {
  total: number;
  free: number;
  active: number;
  pendingRecovery: number;
  cooling: number;
  /** Earliest local manual retry, never proof that the vendor released a seat. */
  retryAt?: string;
  availability?: MktBrowserLicenseAvailability;
  reason?: string;
  observedAt?: string;
  freshUntil?: string;
  vendorActive?: number;
  vendorLimit?: number;
}

const LICENSE_AVAILABILITY = new Set<MktBrowserLicenseAvailability>([
  "ready",
  "checking",
  "in-use",
  "cooling",
  "recovering",
  "unable-to-verify",
]);

/** Sanitize both the MCP reply and the Relay health reply before trusting capacity. */
export function parseMktBrowserLicenseCapacity(value: unknown): MktBrowserLicenseCapacity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const capacity = value as Record<string, unknown>;
  const counts = [
    capacity.total, capacity.free, capacity.active, capacity.pendingRecovery, capacity.cooling,
  ];
  if (counts.some((count) => !Number.isSafeInteger(count) || Number(count) < 0)) return null;
  if (
    capacity.total !== Number(capacity.free) + Number(capacity.active) +
      Number(capacity.pendingRecovery) + Number(capacity.cooling)
  ) return null;

  const retryAt = capacity.retryAt;
  if (retryAt !== undefined) {
    if (
      typeof retryAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(retryAt)
    ) return null;
    const instant = Date.parse(retryAt);
    if (!Number.isFinite(instant) || new Date(instant).toISOString() !== retryAt) return null;
    if (capacity.free !== 0 || Number(capacity.cooling) === 0) return null;
  }

  const hasAvailability = capacity.availability !== undefined;
  const hasReason = capacity.reason !== undefined;
  if (hasAvailability !== hasReason) return null;
  if (
    hasAvailability &&
    (typeof capacity.availability !== "string" ||
      !LICENSE_AVAILABILITY.has(capacity.availability as MktBrowserLicenseAvailability) ||
      typeof capacity.reason !== "string" ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(capacity.reason))
  ) return null;

  const hasObservedAt = capacity.observedAt !== undefined;
  const hasFreshUntil = capacity.freshUntil !== undefined;
  if (hasObservedAt !== hasFreshUntil) return null;
  if (
    hasObservedAt &&
    (typeof capacity.observedAt !== "string" ||
      typeof capacity.freshUntil !== "string" ||
      !isCanonicalTimestamp(capacity.observedAt) ||
      !isCanonicalTimestamp(capacity.freshUntil) ||
      Date.parse(capacity.freshUntil) < Date.parse(capacity.observedAt))
  ) return null;

  const hasVendorActive = capacity.vendorActive !== undefined;
  const hasVendorLimit = capacity.vendorLimit !== undefined;
  if (hasVendorActive !== hasVendorLimit) return null;
  if (
    hasVendorActive &&
    (!hasObservedAt ||
      !Number.isSafeInteger(capacity.vendorActive) ||
      Number(capacity.vendorActive) < 0 ||
      !Number.isSafeInteger(capacity.vendorLimit) ||
      Number(capacity.vendorLimit) < 1 ||
      Number(capacity.vendorActive) > Number(capacity.vendorLimit))
  ) return null;

  return {
    total: Number(capacity.total),
    free: Number(capacity.free),
    active: Number(capacity.active),
    pendingRecovery: Number(capacity.pendingRecovery),
    cooling: Number(capacity.cooling),
    ...(typeof retryAt === "string" ? { retryAt } : {}),
    ...(hasAvailability
      ? {
          availability: capacity.availability as MktBrowserLicenseAvailability,
          reason: capacity.reason as string,
        }
      : {}),
    ...(hasObservedAt
      ? {
          observedAt: capacity.observedAt as string,
          freshUntil: capacity.freshUntil as string,
        }
      : {}),
    ...(hasVendorActive
      ? {
          vendorActive: Number(capacity.vendorActive),
          vendorLimit: Number(capacity.vendorLimit),
        }
      : {}),
  };
}

function isCanonicalTimestamp(value: string): boolean {
  const instant = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(instant) &&
    new Date(instant).toISOString() === value
  );
}

export interface MktBrowserRuntimeInfo {
  provider: string;
  appVersion: string;
  contractVersion: number;
  profileSchemaVersion: number;
  engine: MktBrowserEngineInfo;
  capabilities: string[];
  licenseCapacity: MktBrowserLicenseCapacity | null;
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
