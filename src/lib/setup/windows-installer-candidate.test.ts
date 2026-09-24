import { describe, expect, it } from "vitest";
import {
  assertWindowsInstallerCandidateArtifacts,
  assertWindowsInstallerCandidateCanBePublished,
  WINDOWS_INSTALLER_CANDIDATE,
  WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR,
} from "./windows-installer-candidate";
import { WINDOWS_INSTALLER_R2_KEY } from "./windows-installer-release";
import { effectiveMinRelayVersion, TICKET_KINDS } from "../tickets/ticket-types";

const candidate = WINDOWS_INSTALLER_CANDIDATE;
const relay = {
  targetVersion: candidate.relayVersion,
  archiveSha256: candidate.relaySha256,
  archiveSizeBytes: candidate.relaySizeBytes,
};
const engine = {
  kind: candidate.engineKind, channel: candidate.engineChannel, version: candidate.engineVersion,
  sha256: candidate.engineSha256, sizeBytes: candidate.engineSizeBytes,
};

describe("reviewed Windows profile-manager candidate", () => {
  it("retains the exact historical tuple without treating it as promotable", () => {
    expect(() => assertWindowsInstallerCandidateArtifacts(relay, engine)).not.toThrow();
    expect(WINDOWS_INSTALLER_R2_KEY).toBe(`MKTBrowser-${candidate.id}.exe`);
    expect(WINDOWS_INSTALLER_R2_KEY).not.toBe("MKTBrowser-win-x64.exe");
    expect(candidate.relayVersion).toBe(19);
    expect(candidate.promotionStatus).toBe("quarantined");
    expect(WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR).toBe(
      Math.max(
        effectiveMinRelayVersion(TICKET_KINDS.LAUNCH_PROFILE),
        effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE),
      ),
    );
    expect(candidate.relayVersion).toBeLessThan(WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR);
    expect(() => assertWindowsInstallerCandidateCanBePublished()).toThrow(/profile-action.*v20/i);
  });

  it.each(Object.keys(engine))("rejects an absent or changed engine field: %s", (field) => {
    const missing: Record<string, unknown> = { ...engine };
    delete missing[field];
    expect(() => assertWindowsInstallerCandidateArtifacts(relay, missing)).toThrow(/reviewed/);
    expect(() => assertWindowsInstallerCandidateArtifacts(relay, { ...engine, [field]: "wrong" })).toThrow(/reviewed/);
  });

  it.each(Object.keys(relay))("rejects an absent or changed Relay field: %s", (field) => {
    const missing: Record<string, unknown> = { ...relay };
    delete missing[field];
    expect(() => assertWindowsInstallerCandidateArtifacts(missing, engine)).toThrow(/reviewed/);
    expect(() => assertWindowsInstallerCandidateArtifacts({ ...relay, [field]: "wrong" }, engine)).toThrow(/reviewed/);
  });
});
