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
type WindowsInstallerCandidatePublicationState = Readonly<{
  id: string;
  promotionStatus: WindowsInstallerCandidatePromotionStatus;
  relayVersion: number;
}>;

/** Candidate identity; changing any payload field requires a new release freeze. */
export const WINDOWS_INSTALLER_CANDIDATE = Object.freeze({
  id: "20260929-browser-0.3.29-relay-21-self-service-onboarding-cft",
  browserVersion: "0.3.29",
  relayVersion: 21,
  relaySha256: "45f6e669da892f002c63c58ffe92d8f05a17229797833b0c763efd4e088d3ed0",
  relaySizeBytes: 35123253,
  engineKind: "cft",
  engineChannel: "chrome-for-testing",
  engineVersion: "152.0.7977.64",
  engineSha256: "b0db25dea445822429d8ebd36d53344cadcd63127308759456964029bbe18004",
  engineSizeBytes: 202713690,
  // Source eligibility only; VM, operator, public-TLS, and promotion gates remain separate.
  promotionStatus: "eligible" as WindowsInstallerCandidatePromotionStatus,
});

/**
 * Publication is separate from source eligibility. A tuple must meet the active Relay floor and
 * still pass its own release-freeze and downstream promotion gates.
 */
export function assertWindowsInstallerCandidateCanBePublished(
  candidate: WindowsInstallerCandidatePublicationState = WINDOWS_INSTALLER_CANDIDATE,
): void {
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
    throw new Error("The release manifest does not match the reviewed Relay/CFT candidate.");
  }
}
