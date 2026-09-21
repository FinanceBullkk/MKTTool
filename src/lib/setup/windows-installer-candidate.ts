/** Reviewed profile-manager candidate; changing this tuple requires a new release freeze. */
export const WINDOWS_INSTALLER_CANDIDATE = Object.freeze({
  id: "20260922-browser-0.3.24-relay-18-fast-profile-reuse-cft",
  browserVersion: "0.3.24",
  relayVersion: 18,
  relaySha256: "fabb6ebbe4ec166662689487cd60114be5baefd88d93f65b4e7faf802fac44f4",
  relaySizeBytes: 35113380,
  engineKind: "cft",
  engineChannel: "chrome-for-testing",
  engineVersion: "152.0.7977.64",
  engineSha256: "b0db25dea445822429d8ebd36d53344cadcd63127308759456964029bbe18004",
  engineSizeBytes: 202713690,
});

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
    throw new Error("The release manifest does not match the reviewed Relay v18/CFT candidate.");
  }
}
