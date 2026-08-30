import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RELAY_RELEASE_METADATA_NAME = "MKTTool-Relay.metadata.json";

export interface RelayArtifactMetadata {
  version: number;
  sizeBytes: number;
  sha256: string;
  /** Optional binding for the executable payload inside the archive. */
  executableSizeBytes?: number;
  executableSha256?: string;
  /** Build provenance captured on the pinned Windows host. */
  sourceCommit?: string;
  nodeVersion?: string;
  platform?: string;
  arch?: string;
  webOrigin?: string;
  compatibilityFloor?: number;
}

export function relayArtifactMetadataPath(releaseDir: string): string {
  return path.join(releaseDir, RELAY_RELEASE_METADATA_NAME);
}

export function readRelayArtifactMetadata(releaseDir: string): RelayArtifactMetadata | null {
  try {
    const parsed = JSON.parse(readFileSync(relayArtifactMetadataPath(releaseDir), "utf8")) as {
      version?: unknown;
      sizeBytes?: unknown;
      sha256?: unknown;
      executableSizeBytes?: unknown;
      executableSha256?: unknown;
      sourceCommit?: unknown;
      nodeVersion?: unknown;
      platform?: unknown;
      arch?: unknown;
      webOrigin?: unknown;
      compatibilityFloor?: unknown;
    };
    if (!Number.isSafeInteger(parsed.version) || Number(parsed.version) <= 0) return null;
    if (!Number.isSafeInteger(parsed.sizeBytes) || Number(parsed.sizeBytes) <= 0) return null;
    if (typeof parsed.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(parsed.sha256)) return null;
    const metadata: RelayArtifactMetadata = {
      version: Number(parsed.version),
      sizeBytes: Number(parsed.sizeBytes),
      sha256: parsed.sha256,
    };
    if (parsed.executableSizeBytes !== undefined) {
      if (!Number.isSafeInteger(parsed.executableSizeBytes) || Number(parsed.executableSizeBytes) <= 0) {
        return null;
      }
      metadata.executableSizeBytes = Number(parsed.executableSizeBytes);
    }
    if (parsed.executableSha256 !== undefined) {
      if (typeof parsed.executableSha256 !== "string" || !/^[0-9a-f]{64}$/.test(parsed.executableSha256)) {
        return null;
      }
      metadata.executableSha256 = parsed.executableSha256;
    }
    for (const field of ["sourceCommit", "nodeVersion", "platform", "arch", "webOrigin"] as const) {
      const value = parsed[field];
      if (value !== undefined) {
        if (typeof value !== "string" || value.trim() === "") return null;
        metadata[field] = value.trim();
      }
    }
    if (parsed.compatibilityFloor !== undefined) {
      if (!Number.isSafeInteger(parsed.compatibilityFloor) || Number(parsed.compatibilityFloor) <= 0) {
        return null;
      }
      metadata.compatibilityFloor = Number(parsed.compatibilityFloor);
    }
    return metadata;
  } catch {
    return null;
  }
}

export function writeRelayArtifactMetadata(
  releaseDir: string,
  metadata: RelayArtifactMetadata,
): void {
  const { version, sizeBytes, sha256 } = metadata;
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error(`Relay artifact version must be a positive integer, received ${version}.`);
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error(`Relay artifact size must be a positive integer, received ${sizeBytes}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("Relay artifact SHA-256 must be a lowercase 64-character digest.");
  }
  if (
    metadata.executableSizeBytes !== undefined &&
    (!Number.isSafeInteger(metadata.executableSizeBytes) || metadata.executableSizeBytes <= 0)
  ) {
    throw new Error("Relay executable size must be a positive safe integer.");
  }
  if (
    metadata.executableSha256 !== undefined &&
    !/^[0-9a-f]{64}$/.test(metadata.executableSha256)
  ) {
    throw new Error("Relay executable SHA-256 must be a lowercase 64-character digest.");
  }
  if (
    metadata.compatibilityFloor !== undefined &&
    (!Number.isSafeInteger(metadata.compatibilityFloor) || metadata.compatibilityFloor <= 0)
  ) {
    throw new Error("Relay compatibility floor must be a positive safe integer.");
  }
  writeFileSync(
    relayArtifactMetadataPath(releaseDir),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
}
