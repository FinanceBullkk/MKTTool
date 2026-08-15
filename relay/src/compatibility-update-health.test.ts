import { describe, expect, it } from "vitest";
import { describeCompatibilityUpdateHealth } from "./compatibility-update-health";
import type { CompatibilityUpdateState } from "./update-state";

describe("compatibility update health", () => {
  it("reports missing state without claiming rollback readiness", () => {
    expect(describeCompatibilityUpdateHealth(null)).toMatchObject({
      initialized: false,
      rollbackAvailable: false,
    });
  });

  it("offers rollback only for an older retained set above the protected floor", () => {
    expect(describeCompatibilityUpdateHealth(state())).toMatchObject({
      initialized: true,
      currentSequence: 2,
      retainedSequence: 1,
      rollbackAvailable: true,
    });
    expect(
      describeCompatibilityUpdateHealth(state({ rollbackFloorSequence: 2 })),
    ).toMatchObject({ rollbackAvailable: false });
    expect(
      describeCompatibilityUpdateHealth(state({ smokeProfileId: null })),
    ).toMatchObject({ rollbackAvailable: false });
  });
});

function state(overrides: Partial<CompatibilityUpdateState> = {}): CompatibilityUpdateState {
  const record = (sequence: number) => ({
    sequence,
    manifestDigest: String(sequence).repeat(64),
    versions: {
      installer: "1",
      relay: "1",
      browser: "1",
      controlContract: "1",
      engine: "1",
    },
  });
  return {
    schemaVersion: 1,
    highestAcceptedSequence: 2,
    rollbackFloorSequence: 1,
    smokeProfileId: "smoke-profile",
    current: record(2),
    retained: record(1),
    pending: null,
    usedRollbackAuthorizationIds: [],
    revokedDelegatedKeyIds: [],
    ...overrides,
  };
}
