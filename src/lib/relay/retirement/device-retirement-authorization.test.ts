import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEVICE_RETIREMENT_CLOCK_SKEW_MS,
  DeviceRetirementAuthorizationError,
  issueDeviceRetirementAuthorization,
  verifyDeviceRetirementAuthorization,
} from "./device-retirement-authorization";

const signingKeys = generateKeyPairSync("ed25519");
const input = {
  authorizationId: "authorization-1",
  retirementId: "retirement-1",
  deviceId: "device-1",
  recipientPublicKey: "ab".repeat(32),
  completionHash: "cd".repeat(32),
  completionEphemeralPublicKey: "ef".repeat(32),
  completionSealed: "v1.iv.tag.ciphertext",
  finalizationPublicKey: "12".repeat(32),
};

describe("device retirement authorization", () => {
  it("accepts an active server-signed authorization bound to one Relay identity", () => {
    const signed = issueDeviceRetirementAuthorization(input, signingKeys.privateKey, 1_000, 30_000);

    expect(verifyDeviceRetirementAuthorization(signed, signingKeys.publicKey, 30_999)).toMatchObject(
      input,
    );
  });

  it("rejects tampering, expiry, and a malformed recipient binding", () => {
    const signed = issueDeviceRetirementAuthorization(input, signingKeys.privateKey, 1_000, 30_000);
    const [encoded, signature] = signed.split(".");
    const changed = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
        deviceId: "device-2",
      }),
      "utf8",
    ).toString("base64url");

    expect(() =>
      verifyDeviceRetirementAuthorization(`${changed}.${signature}`, signingKeys.publicKey, 2_000),
    ).toThrow(DeviceRetirementAuthorizationError);
    expect(() =>
      verifyDeviceRetirementAuthorization(
        signed,
        signingKeys.publicKey,
        31_000 + DEVICE_RETIREMENT_CLOCK_SKEW_MS,
      ),
    ).toThrow(/expired/i);

    const malformed = issueDeviceRetirementAuthorization(
      { ...input, recipientPublicKey: "not-hex" },
      signingKeys.privateKey,
      1_000,
      30_000,
    );
    expect(() => verifyDeviceRetirementAuthorization(malformed, signingKeys.publicKey, 2_000)).toThrow(
      /invalid shape/i,
    );
  });

  it("can authenticate an expired receipt retry without authorizing a new cleanup", () => {
    const signed = issueDeviceRetirementAuthorization(input, signingKeys.privateKey, 1_000, 30_000);

    expect(
      verifyDeviceRetirementAuthorization(signed, signingKeys.publicKey, 500_000, false),
    ).toMatchObject(input);
  });
});
