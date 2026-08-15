import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publicKeyHex } from "../../../scripts/release-authority/release-authority-key-primitives.mjs";
import {
  ROLLBACK_AUTHORIZATION_CLOCK_SKEW_MS,
  ROLLBACK_AUTHORIZATION_MAX_LIFETIME_MS,
  signRollbackAuthorization,
  verifyRollbackAuthorization,
  type RollbackAuthorization,
} from "./rollback-authorization";

const keys = generateKeyPairSync("ed25519");
const now = new Date("2026-08-16T00:00:30.000Z");

describe("compatibility rollback authorization", () => {
  it("accepts one active authorization bound to the exact device and retained set", () => {
    const authorization = signedAuthorization();

    expect(verify(authorization)).toEqual(authorization);
  });

  it("rejects tampering, replay, floor bypass, and a non-rollback transition", () => {
    const authorization = signedAuthorization();
    expect(() => verify({ ...authorization, retainedSequence: 2 })).toThrow(/signature/i);
    expect(() => verify(authorization, { usedAuthorizationIds: [authorization.authorizationId] })).toThrow(
      /already been used/i,
    );
    expect(() => verify(authorization, { rollbackFloorSequence: 2 })).toThrow(/rollback floor/i);

    const forward = signedAuthorization({ currentSequence: 2, retainedSequence: 2 });
    expect(() => verify(forward, { retainedSequence: 2 })).toThrow(/older than the active/i);
  });

  it("allows bounded issuance clock skew but expires at the exact signed deadline", () => {
    const future = signedAuthorization({
      issuedAt: new Date(now.getTime() + ROLLBACK_AUTHORIZATION_CLOCK_SKEW_MS).toISOString(),
      expiresAt: new Date(now.getTime() + ROLLBACK_AUTHORIZATION_CLOCK_SKEW_MS + 60_000).toISOString(),
    });
    expect(() => verify(future)).not.toThrow();

    const invalid = signedAuthorization({
      issuedAt: "2026-08-16T00:02:00.000Z",
      expiresAt: "2026-08-16T00:01:00.000Z",
    });
    expect(() => verify(invalid)).toThrow(/lifetime/i);

    const tooLong = signedAuthorization({
      expiresAt: new Date(
        Date.parse("2026-08-16T00:00:00.000Z") + ROLLBACK_AUTHORIZATION_MAX_LIFETIME_MS + 1,
      ).toISOString(),
    });
    expect(() => verify(tooLong)).toThrow(/lifetime/i);

    const expired = signedAuthorization({
      issuedAt: "2026-08-15T23:59:30.000Z",
      expiresAt: now.toISOString(),
    });
    expect(() => verify(expired)).toThrow(/expired/i);
  });
});

function signedAuthorization(
  overrides: Partial<Omit<RollbackAuthorization, "signature">> = {},
): RollbackAuthorization {
  return signRollbackAuthorization(keys.privateKey, {
    schemaVersion: 1,
    type: "mkttool.compatibility-rollback-authorization",
    authorizationId: "3d1971be-ae6e-4c2a-9a1b-92ba75c748ab",
    adminUserId: "admin-1",
    authorizedRole: "ADMIN",
    deviceId: "device-1",
    currentSequence: 2,
    retainedSequence: 1,
    issuedAt: "2026-08-16T00:00:00.000Z",
    expiresAt: "2026-08-16T00:01:00.000Z",
    ...overrides,
  });
}

function verify(
  authorization: RollbackAuthorization,
  overrides: Partial<Parameters<typeof verifyRollbackAuthorization>[1]> = {},
) {
  return verifyRollbackAuthorization(authorization, {
    serverPublicKeyHex: publicKeyHex(keys.publicKey),
    deviceId: "device-1",
    currentSequence: 2,
    retainedSequence: 1,
    rollbackFloorSequence: 1,
    usedAuthorizationIds: [],
    now,
    ...overrides,
  });
}
