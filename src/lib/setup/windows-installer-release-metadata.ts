/**
 * Canonical, non-secret metadata carried by a published Windows installer object.
 *
 * The installer bytes and their metadata are one release tuple. A file that exists without the
 * tuple is not downloadable through the setup route: showing a version or checksum inferred from a
 * filename would turn an incomplete object into a false release claim.
 */

export const WINDOWS_INSTALLER_METADATA_KEYS = {
  candidateId: "candidate-id",
  browserVersion: "browser-version",
  installerSha256: "sha256",
  bundledRelayVersion: "bundled-relay-version",
  bundledRelaySha256: "bundled-relay-sha256",
  payloadManifestSha256: "payload-manifest-sha256",
  payloadFileCount: "payload-file-count",
  browserSourceSha: "browser-source-sha",
  browserSourceTree: "browser-source-tree",
  engineKind: "engine-kind",
  engineChannel: "engine-channel",
  engineVersion: "engine-version",
  engineSha256: "engine-sha256",
  signingStatus: "signing-status",
  signingExceptionExpiresAt: "signing-exception-expires-at",
} as const;

export type InstallerSigningStatus =
  | "authenticode"
  | "unsigned-internal-exception"
  | "unknown";

export interface WindowsInstallerReleaseMetadata {
  candidateId: string | null;
  browserVersion: string | null;
  installerSha256: string | null;
  bundledRelayVersion: number | null;
  bundledRelaySha256: string | null;
  payloadManifestSha256: string | null;
  payloadFileCount: number | null;
  browserSourceSha: string | null;
  browserSourceTree: string | null;
  engineKind: string | null;
  engineChannel: string | null;
  engineVersion: string | null;
  engineSha256: string | null;
  signingStatus: InstallerSigningStatus;
  /** Required for the unsigned internal exception; ignored for a verified signing status. */
  signingExceptionExpiresAt: string | null;
  metadataComplete: boolean;
  metadataMissing: string[];
}

export interface ParseWindowsInstallerReleaseMetadataOptions {
  /** Injected clock for deterministic tests; production defaults to the current instant. */
  now?: Date | number;
}

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const SHA1 = /^[0-9a-f]{40}$/i;
const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const WINDOWS_INSTALLER_EXPIRED_SIGNING_EXCEPTION = "expired-signing-exception";

function trimmed(metadata: Record<string, string>, key: string): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function text(
  metadata: Record<string, string>,
  key: string,
  missing: string[],
  predicate: (value: string) => boolean = (value) => SAFE_TEXT.test(value),
): string | null {
  const value = trimmed(metadata, key);
  if (!value || !predicate(value)) {
    missing.push(key);
    return null;
  }
  return value;
}

function sha(
  metadata: Record<string, string>,
  key: string,
  missing: string[],
  required = true,
): string | null {
  const value = trimmed(metadata, key).toLowerCase();
  if (!value || !SHA256.test(value)) {
    if (required) missing.push(key);
    return null;
  }
  return value;
}

function sourceSha(
  metadata: Record<string, string>,
  key: string,
  missing: string[],
): string | null {
  const value = trimmed(metadata, key).toLowerCase();
  if (!value || !SHA1.test(value)) {
    missing.push(key);
    return null;
  }
  return value;
}

function positiveInteger(
  metadata: Record<string, string>,
  key: string,
  missing: string[],
): number | null {
  const value = trimmed(metadata, key);
  if (!value || !/^\d+$/.test(value)) {
    missing.push(key);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    missing.push(key);
    return null;
  }
  return parsed;
}

function signing(metadata: Record<string, string>, missing: string[]): InstallerSigningStatus {
  const value = trimmed(metadata, WINDOWS_INSTALLER_METADATA_KEYS.signingStatus);
  if (value === "authenticode" || value === "unsigned-internal-exception") return value;
  missing.push(WINDOWS_INSTALLER_METADATA_KEYS.signingStatus);
  return "unknown";
}

function signingExceptionExpiry(
  metadata: Record<string, string>,
  signingStatus: InstallerSigningStatus,
  missing: string[],
  nowMs: number,
): string | null {
  if (signingStatus !== "unsigned-internal-exception") return null;

  const key = WINDOWS_INSTALLER_METADATA_KEYS.signingExceptionExpiresAt;
  const value = trimmed(metadata, key);
  const parsed = value && ISO_INSTANT.test(value) ? Date.parse(value) : Number.NaN;
  if (!value || !Number.isFinite(parsed)) {
    missing.push(key);
    return null;
  }
  const canonical = new Date(parsed).toISOString();
  if (parsed <= nowMs) missing.push(WINDOWS_INSTALLER_EXPIRED_SIGNING_EXCEPTION);
  return canonical;
}

/** Parse and validate the release tuple without returning unknown metadata or secrets. */
export function parseWindowsInstallerReleaseMetadata(
  metadata: Record<string, string>,
  options: ParseWindowsInstallerReleaseMetadataOptions = {},
): WindowsInstallerReleaseMetadata {
  const missing: string[] = [];
  const keys = WINDOWS_INSTALLER_METADATA_KEYS;
  const suppliedNow =
    options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  const nowMs = Number.isFinite(suppliedNow) ? suppliedNow : Date.now();
  const browserVersion = text(metadata, keys.browserVersion, missing, (value) => SEMVER.test(value));
  const signingStatus = signing(metadata, missing);
  return {
    candidateId: text(metadata, keys.candidateId, missing),
    browserVersion,
    installerSha256: sha(metadata, keys.installerSha256, missing),
    bundledRelayVersion: positiveInteger(metadata, keys.bundledRelayVersion, missing),
    bundledRelaySha256: sha(metadata, keys.bundledRelaySha256, missing),
    payloadManifestSha256: sha(metadata, keys.payloadManifestSha256, missing),
    payloadFileCount: positiveInteger(metadata, keys.payloadFileCount, missing),
    browserSourceSha: sourceSha(metadata, keys.browserSourceSha, missing),
    browserSourceTree: sourceSha(metadata, keys.browserSourceTree, missing),
    engineKind: text(metadata, keys.engineKind, missing),
    engineChannel: text(metadata, keys.engineChannel, missing),
    engineVersion: text(metadata, keys.engineVersion, missing),
    engineSha256: sha(metadata, keys.engineSha256, missing),
    signingStatus,
    signingExceptionExpiresAt: signingExceptionExpiry(metadata, signingStatus, missing, nowMs),
    metadataComplete: missing.length === 0,
    metadataMissing: missing,
  };
}

/** A disk/development release has bytes but no publish tuple and must remain non-downloadable. */
export function emptyWindowsInstallerReleaseMetadata(): WindowsInstallerReleaseMetadata {
  return parseWindowsInstallerReleaseMetadata({});
}
