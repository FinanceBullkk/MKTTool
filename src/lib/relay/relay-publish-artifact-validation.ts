import { RELAY_VERSION } from "./relay-endpoints";
import {
  readRelayReleaseFromDisk,
  relayArchiveChecksum,
  relayReleaseDir,
  type RelayRelease,
} from "./relay-release-file";
import { readRelayArtifactMetadata } from "./relay-release-metadata";

type AvailableRelayRelease = Extract<RelayRelease, { available: true }>;

export async function readVerifiedRelayPublishArtifact(): Promise<{
  local: AvailableRelayRelease;
  checksum: string;
}> {
  const sidecar = readRelayArtifactMetadata(relayReleaseDir());
  if (!sidecar) {
    throw new Error("Relay artifact metadata sidecar is missing or invalid. Run relay:build again.");
  }
  if (sidecar.version !== RELAY_VERSION) {
    throw new Error(
      `Relay artifact metadata version ${sidecar.version} does not equal RELAY_VERSION ${RELAY_VERSION}.`,
    );
  }

  const local = readRelayReleaseFromDisk(RELAY_VERSION);
  if (!local.available) {
    throw new Error(`Relay archive is missing at ${local.expectedPath}. Run relay:build again.`);
  }
  if (local.source !== "disk") {
    throw new Error("Relay publish validation must read the local disk artifact.");
  }
  if (sidecar.sizeBytes !== local.sizeBytes) {
    throw new Error("Relay archive size does not match its metadata sidecar. Run relay:build again.");
  }

  const checksum = await relayArchiveChecksum(local);
  if (!checksum || checksum !== sidecar.sha256) {
    throw new Error("Relay archive SHA-256 does not match its metadata sidecar. Run relay:build again.");
  }
  return { local, checksum };
}
