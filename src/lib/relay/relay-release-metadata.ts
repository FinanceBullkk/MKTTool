import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RELAY_RELEASE_METADATA_NAME = "MKTTool-Relay.metadata.json";

export interface RelayArtifactMetadata {
  version: number;
  sizeBytes: number;
  sha256: string;
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
    };
    if (!Number.isSafeInteger(parsed.version) || Number(parsed.version) <= 0) return null;
    if (!Number.isSafeInteger(parsed.sizeBytes) || Number(parsed.sizeBytes) <= 0) return null;
    if (typeof parsed.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(parsed.sha256)) return null;
    return {
      version: Number(parsed.version),
      sizeBytes: Number(parsed.sizeBytes),
      sha256: parsed.sha256,
    };
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
  writeFileSync(
    relayArtifactMetadataPath(releaseDir),
    `${JSON.stringify({ version, sizeBytes, sha256 }, null, 2)}\n`,
    "utf8",
  );
}
