import { effectiveMinRelayVersion, TICKET_KINDS } from "../tickets/ticket-types";

/**
 * The installer must carry a Relay that can accept both profile-action ticket kinds. This is
 * deliberately derived from the ticket contract rather than copied from the security-only floor.
 */
export const WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR = Math.max(
  effectiveMinRelayVersion(TICKET_KINDS.LAUNCH_PROFILE),
  effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE),
);

type WindowsInstallerCandidatePromotionStatus = "eligible" | "quarantined";

/** Recorded historical tuple; changing any payload field requires a new release freeze. */
export const WINDOWS_INSTALLER_CANDIDATE = Object.freeze({
  id: "20260924-browser-0.3.25-relay-19-cold-start-tls-profiles-cft",
  browserVersion: "0.3.25",
  relayVersion: 19,
  relaySha256: "896fc47238a4da00a636eed2a77f6c93fe53f0e55a6af1ecfa94f4cea3ef6968",
  relaySizeBytes: 35118160,
  engineKind: "cft",
  engineChannel: "chrome-for-testing",
  engineVersion: "152.0.7977.64",
  engineSha256: "b0db25dea445822429d8ebd36d53344cadcd63127308759456964029bbe18004",
  engineSizeBytes: 202713690,
  // v19 predates the bounded profile-read contract, so its measured bytes are retained but cannot ship.
  promotionStatus: "quarantined" as WindowsInstallerCandidatePromotionStatus,
});

/**
 * Publication is separate from retaining or inspecting a historical tuple. A future tuple must
 * supply v20-or-newer bytes and explicitly change this status after its own release freeze.
 */
export function assertWindowsInstallerCandidateCanBePublished(): void {
  const candidate = WINDOWS_INSTALLER_CANDIDATE;
  if (
    candidate.promotionStatus !== "eligible" ||
    candidate.relayVersion < WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR
  ) {
    throw new Error(
      `Windows installer candidate ${candidate.id} is ${candidate.promotionStatus}: ` +
        `profile-action tickets require Relay v${WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR} or newer. ` +
        "Build and freeze a new Relay tuple before publication.",
    );
  }
}

export function assertWindowsInstallerCandidateArtifacts(
  relay: Record<string, unknown>,
  engine: Record<string, unknown>,
): void {
  const expected = WINDOWS_INSTALLER_CANDIDATE;
  if (
    relay.targetVersion !== expected.relayVersion ||
    relay.archiveSha256 !== expected.relaySha256 ||
    relay.archiveSizeBytes !== expected.relaySizeBytes ||
    engine.kind !== expected.engineKind ||
    engine.channel !== expected.engineChannel ||
    engine.version !== expected.engineVersion ||
    engine.sha256 !== expected.engineSha256 ||
    engine.sizeBytes !== expected.engineSizeBytes
  ) {
    throw new Error("The release manifest does not match the reviewed Relay v19/CFT candidate.");
  }
}
