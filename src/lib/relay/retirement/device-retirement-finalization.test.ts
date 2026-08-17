import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  issueDeviceRetirementFinalization,
  verifyDeviceRetirementFinalization,
} from "./device-retirement-finalization";

const keys = generateKeyPairSync("ed25519");

function issue(overrides: Partial<Parameters<typeof issueDeviceRetirementFinalization>[0]> = {}) {
  return issueDeviceRetirementFinalization(
    {
      authorizationId: "finalization-1",
      retirementId: "retirement-1",
      deviceId: "device-1",
      recipientPublicKey: "ab".repeat(32),
      completionHash: "cd".repeat(32),
      ...overrides,
    },
    keys.privateKey,
    10_000,
  );
}

describe("device retirement finalization authorization", () => {
  it("verifies a signed recipient-bound completion", () => {
    expect(verifyDeviceRetirementFinalization(issue(), keys.publicKey)).toMatchObject({
      kind: "device-retirement-finalization",
      retirementId: "retirement-1",
      deviceId: "device-1",
      recipientPublicKey: "ab".repeat(32),
      completionHash: "cd".repeat(32),
      completedAt: 10_000,
    });
  });

  it("rejects tampering and malformed completion time", () => {
    const authorization = issue();
    const tampered = `${authorization[0] === "a" ? "b" : "a"}${authorization.slice(1)}`;
    expect(() =>
      verifyDeviceRetirementFinalization(tampered, keys.publicKey),
    ).toThrow(/signature/i);
    const malformed = issueDeviceRetirementFinalization(
      {
        authorizationId: "finalization-2",
        retirementId: "retirement-1",
        deviceId: "device-1",
        recipientPublicKey: "ab".repeat(32),
        completionHash: "cd".repeat(32),
      },
      keys.privateKey,
      0,
    );
    expect(() => verifyDeviceRetirementFinalization(malformed, keys.publicKey)).toThrow(/shape/i);
  });
});
