/** Reviewed profile-manager candidate; changing this tuple requires a new release freeze. */
export const WINDOWS_INSTALLER_CANDIDATE = Object.freeze({
  id: "20260909-browser-0.3.17-relay-17-browser-ip-observer-cft",
  browserVersion: "0.3.17",
  relayVersion: 17,
  relaySha256: "d8bf25dcb446d779bd5461419ea7562044e280ac1d16592a71a52f156f6359cf",
  relaySizeBytes: 34289393,
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
    throw new Error("The release manifest does not match the reviewed Relay v17/CFT candidate.");
  }
}
