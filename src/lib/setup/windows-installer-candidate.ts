/** Reviewed profile-manager candidate; changing this tuple requires a new release freeze. */
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
    throw new Error("The release manifest does not match the reviewed Relay v19/CFT candidate.");
  }
}
