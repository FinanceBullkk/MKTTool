import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildDelegationRequest,
  decryptRootSeed,
  encryptRootSeed,
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
  signDelegation,
  signRecoveryProof,
  verifyRecoveryProof,
  verifySignedDelegation,
} from "./release-authority-format.mjs";

const TEST_SCRYPT = { N: 16_384, r: 8, p: 1 };

describe("release-authority ceremony format", () => {
  it("signs a domain-separated delegation and rejects tampering", () => {
    const root = privateKeyFromSeed(randomBytes(32));
    const delegated = privateKeyFromSeed(randomBytes(32));
    const delegatedPublicHex = publicKeyHex(delegated);
    const request = buildDelegationRequest({
      publicHex: delegatedPublicHex,
      createdAt: "2026-08-14T00:00:00.000Z",
      notBefore: "2026-08-14T00:00:00.000Z",
      expiresAt: "2027-08-14T00:00:00.000Z",
      label: "test",
    });
    const signed = signDelegation(root, releaseKeyId(publicKeyHex(root)), request, request.createdAt);

    expect(verifySignedDelegation(root, signed).delegation.delegatedKeyId).toBe(
      request.delegatedKeyId,
    );
    expect(() =>
      verifySignedDelegation(root, {
        ...signed,
        delegation: { ...signed.delegation, label: "tampered" },
      }),
    ).toThrow("invalid");
  });

  it("encrypts a root seed and rejects a wrong passphrase or modified metadata", () => {
    const seed = randomBytes(32);
    const privateKey = privateKeyFromSeed(seed);
    const rootPublicHex = publicKeyHex(privateKey);
    const backup = encryptRootSeed(
      seed,
      "a-password-manager-passphrase",
      {
        rootKeyId: releaseKeyId(rootPublicHex),
        publicKeyHex: rootPublicHex,
        createdAt: "2026-08-14T00:00:00.000Z",
        copyLabel: "B",
      },
      TEST_SCRYPT,
    );

    expect(decryptRootSeed(backup, "a-password-manager-passphrase")).toEqual(seed);
    expect(() => decryptRootSeed(backup, "wrong-password-that-is-long")).toThrow();
    expect(() => decryptRootSeed({ ...backup, copyLabel: "A" }, "a-password-manager-passphrase")).toThrow();
  });

  it("proves recovery with the recovered root key", () => {
    const root = privateKeyFromSeed(randomBytes(32));
    const rootKeyId = releaseKeyId(publicKeyHex(root));
    const proof = signRecoveryProof(root, {
      rootKeyId,
      backupLabel: "B",
      backupSha256: "a".repeat(64),
      recoveredAt: "2026-08-14T00:00:00.000Z",
    });

    expect(verifyRecoveryProof(root, proof).rootKeyId).toBe(rootKeyId);
    expect(() => verifyRecoveryProof(root, { ...proof, backupSha256: "b".repeat(64) })).toThrow(
      "invalid",
    );
  });
});
