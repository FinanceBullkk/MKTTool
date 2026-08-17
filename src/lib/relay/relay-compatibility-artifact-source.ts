import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  CHECKSUM_METADATA_KEY,
  headRelayCompatibilityArtifact,
  openRelayCompatibilityArtifact,
  readRelayReleaseR2Config,
  relayCompatibilityArtifactR2Key,
  type RelayCompatibilityArtifactKind,
} from "./relay-release-r2";
import { relayReleaseDir } from "./relay-release-file";

export interface RelayCompatibilityArtifactSource {
  sizeBytes: number;
  sha256: string;
  open(): Promise<ReadableStream<Uint8Array>>;
}

export function relayCompatibilityArtifactDirectory(): string {
  return (
    process.env.RELAY_COMPATIBILITY_ARTIFACT_DIR?.trim() ||
    path.join(relayReleaseDir(), "compatibility-artifacts")
  );
}

export function relayCompatibilityArtifactPath(
  version: number,
  kind: RelayCompatibilityArtifactKind,
): string {
  return path.join(
    relayCompatibilityArtifactDirectory(),
    relayCompatibilityArtifactR2Key(version, kind),
  );
}

/**
 * Resolve an artifact for the download route, checked against the signed manifest.
 *
 * ## Why the R2 path compares metadata instead of hashing the bytes it serves
 *
 * On the R2 path the checksum comes from the object's stored metadata, not from the stream the
 * route is about to send. That looks like a hole and is worth stating plainly: it is not the
 * integrity control, and it was never load-bearing.
 *
 * Whoever could replace an object's bytes in the bucket holds write credentials, and the same
 * credentials set that object's metadata. So hashing on the way out would not stop that adversary
 * either — it would only cost a full re-read of a 280 MB engine on every request. What actually
 * stops them is on the device: `compatibility-artifact-staging.ts` hashes every downloaded byte
 * against the signed manifest as it streams, re-checks size and digest from disk afterwards, and
 * `compatibility-set-integrity.ts` verifies the whole set again at activation.
 *
 * This comparison is therefore a publication sanity check — it catches a mismatched or half-replaced
 * upload before a device wastes a download on it. Treat a failure here as an operational fault, not
 * as an attack that was repelled.
 *
 * The local-file path below does hash, because there the file is cheap to read and there is no
 * separately-maintained metadata to compare against.
 */
export async function readRelayCompatibilityArtifactSource(
  version: number,
  kind: RelayCompatibilityArtifactKind,
  expected: { sizeBytes: number; sha256: string },
): Promise<RelayCompatibilityArtifactSource> {
  const config = readRelayReleaseR2Config();
  if (config) {
    const info = await headRelayCompatibilityArtifact(config, version, kind);
    if (!info) throw new Error(`Compatibility artifact ${kind} was not found.`);
    const checksum = info.metadata[CHECKSUM_METADATA_KEY]?.toLowerCase();
    assertExpectedArtifact(info.sizeBytes, checksum, expected, kind);
    return {
      sizeBytes: info.sizeBytes,
      sha256: checksum!,
      open: () => openRelayCompatibilityArtifact(config, version, kind),
    };
  }

  const filePath = relayCompatibilityArtifactPath(version, kind);
  const sizeBytes = statSync(filePath).size;
  const sha256 = await sha256File(filePath);
  assertExpectedArtifact(sizeBytes, sha256, expected, kind);
  return {
    sizeBytes,
    sha256,
    open: async () => Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>,
  };
}

function assertExpectedArtifact(
  sizeBytes: number,
  sha256: string | undefined,
  expected: { sizeBytes: number; sha256: string },
  kind: string,
): void {
  if (sizeBytes !== expected.sizeBytes || sha256 !== expected.sha256) {
    throw new Error(`Compatibility artifact ${kind} does not match the signed manifest.`);
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
