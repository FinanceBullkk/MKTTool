import { describe, expect, it, vi } from "vitest";
import type { CompatibilityUpdateAuthorization } from "../../src/lib/release/compatibility-update-authorization";
import { ensureCompatibilitySmokeProfile } from "./compatibility-smoke-profile";
import type { CompatibilityUpdateState } from "./update-state";

describe("compatibility smoke profile provisioning", () => {
  it("reuses the protected binding when the dedicated profile still exists", async () => {
    const adapter = fixtureAdapter([{ id: "smoke-1", name: "Smoke" }]);
    await expect(
      ensureCompatibilitySmokeProfile({
        state: state({ smokeProfileId: "smoke-1" }),
        payload: smokeProfile(),
        authorization: authorization(),
        adapter,
      }),
    ).resolves.toBe("smoke-1");
    expect(adapter.createProfile).not.toHaveBeenCalled();
  });

  it("creates one managed no-login profile with the selected ObserverProxy", async () => {
    const adapter = fixtureAdapter([]);
    await expect(
      ensureCompatibilitySmokeProfile({
        state: state(),
        payload: smokeProfile(),
        authorization: authorization(),
        adapter,
      }),
    ).resolves.toBe("smoke-2");
    expect(adapter.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRef: "mkttool:compatibility-smoke",
        tags: ["mkttool", "mkttool-compatibility-smoke"],
        proxy: smokeProfile().proxy,
      }),
    );
  });
});

function fixtureAdapter(profiles: Array<{ id: string; name: string }>) {
  return {
    listProfiles: vi.fn(async () => profiles),
    fingerprintOptions: vi.fn(async () => ({
      devices: [
        { family: "windows-desktop", label: "Windows desktop", screens: [{ width: 1920, height: 1080 }] },
      ],
      locales: [
        { id: "en-US", label: "English (US)", country: "US", timezones: ["America/New_York"] },
      ],
    })),
    createProfile: vi.fn(async () => ({ profileId: "smoke-2" })),
  };
}

function smokeProfile() {
  return {
    proxyLabel: "Observer 1",
    proxyCountry: "US",
    proxy: { protocol: "http" as const, host: "127.0.0.1", port: 8080 },
  };
}

function authorization(): CompatibilityUpdateAuthorization {
  return {
    schemaVersion: 1,
    type: "mkttool.compatibility-update-authorization",
    authorizationId: "741d4377-4c55-4fb0-8c41-133aaa15057a",
    actorUserId: "admin",
    authorizedRole: "ADMIN",
    deviceId: "device-1",
    sequence: 1,
    manifestDigest: "a".repeat(64),
    repairMissingState: true,
    authenticatedArtifactPaths: [],
    issuedAt: "2026-08-15T00:00:00.000Z",
    commandExpiresAt: "2026-08-15T00:01:00.000Z",
    artifactExpiresAt: "2026-08-15T01:00:00.000Z",
    signature: "s".repeat(86),
  };
}

function state(overrides: Partial<CompatibilityUpdateState> = {}): CompatibilityUpdateState {
  return {
    schemaVersion: 1,
    highestAcceptedSequence: 0,
    rollbackFloorSequence: 1,
    smokeProfileId: null,
    current: null,
    retained: null,
    pending: null,
    usedRollbackAuthorizationIds: [],
    revokedDelegatedKeyIds: [],
    ...overrides,
  };
}
