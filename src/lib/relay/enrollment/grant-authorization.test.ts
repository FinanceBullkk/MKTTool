import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GRANT_AUTHORIZATION_CLOCK_SKEW_MS,
  GrantAuthorizationError,
  issueGrantAuthorization,
  verifyGrantAuthorization,
} from "./grant-authorization";

const keys = generateKeyPairSync("ed25519");
const delivery = {
  kind: "delivery" as const,
  authorizationId: "auth-1",
  deviceId: "device-1",
  recipientPublicKey: "ab".repeat(32),
  grantId: "grant-1",
  generation: 2,
  grantHash: "11".repeat(32),
  completionHash: "22".repeat(32),
  completionEphemeralPublicKey: "cd".repeat(32),
  completionSealed: "v1.iv.tag.ciphertext",
};

describe("grant authorization", () => {
  it("accepts the signed recipient-bound envelope before expiry", () => {
    const signed = issueGrantAuthorization(delivery, keys.privateKey, 1_000, 30_000);
    expect(verifyGrantAuthorization(signed, keys.publicKey, 30_999)).toMatchObject(delivery);
  });

  it("rejects tampering and expiry", () => {
    const signed = issueGrantAuthorization(delivery, keys.privateKey, 1_000, 30_000);
    const [encoded, signature] = signed.split(".");
    const changed = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(encoded, "base64url").toString()), generation: 3 }),
    ).toString("base64url");

    expect(() => verifyGrantAuthorization(`${changed}.${signature}`, keys.publicKey, 2_000)).toThrow(
      GrantAuthorizationError,
    );
    expect(() =>
      verifyGrantAuthorization(signed, keys.publicKey, 31_000 + GRANT_AUTHORIZATION_CLOCK_SKEW_MS)
    ).toThrow(/expired/i);
  });

  it("tolerates one minute of clock skew but rejects a larger drift with recovery guidance", () => {
    const signed = issueGrantAuthorization(delivery, keys.privateKey, 60_000, 30_000);

    expect(verifyGrantAuthorization(signed, keys.publicKey, 0)).toMatchObject(delivery);
    expect(verifyGrantAuthorization(signed, keys.publicKey, 149_999)).toMatchObject(delivery);
    expect(() => verifyGrantAuthorization(signed, keys.publicKey, -1)).toThrow(/sync windows/i);
    expect(() => verifyGrantAuthorization(signed, keys.publicKey, 150_000)).toThrow(/sync windows/i);
  });

  it("uses the five-minute lifetime supplied by the local-entry issuer", () => {
    const signed = issueGrantAuthorization(
      { ...delivery, kind: "bootstrap", authorizationId: "bootstrap-1" },
      keys.privateKey,
      5_000,
      300_000,
    );
    expect(verifyGrantAuthorization(signed, keys.publicKey, 304_999).kind).toBe("bootstrap");
    expect(() =>
      verifyGrantAuthorization(signed, keys.publicKey, 305_000 + GRANT_AUTHORIZATION_CLOCK_SKEW_MS)
    ).toThrow(/expired/i);
  });
});
