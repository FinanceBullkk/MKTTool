import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CredentialDecryptionError,
  decryptCredential,
  decryptOptionalCredential,
  encryptCredential,
  encryptOptionalCredential,
} from "./credential-encryption";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

describe("credential-encryption", () => {
  it("returns the original string after encryption and decryption", () => {
    const secret = "Password!@#123 with Unicode café";
    expect(decryptCredential(encryptCredential(secret, KEY), KEY)).toBe(secret);
  });

  it("produces different ciphertext for the same input because the IV is random", () => {
    const a = encryptCredential("same-input", KEY);
    const b = encryptCredential("same-input", KEY);
    expect(a).not.toBe(b);
    expect(decryptCredential(a, KEY)).toBe(decryptCredential(b, KEY));
  });

  it("throws CredentialDecryptionError for the wrong key instead of returning garbage", () => {
    const encoded = encryptCredential("top-secret", KEY);
    expect(() => decryptCredential(encoded, OTHER_KEY)).toThrow(CredentialDecryptionError);
  });

  it("detects modified ciphertext through the authentication tag", () => {
    const encoded = encryptCredential("top-secret", KEY);
    const parts = encoded.split(".");
    const tampered = Buffer.from(parts[3], "base64url");
    tampered[0] ^= 0xff;
    parts[3] = tampered.toString("base64url");
    expect(() => decryptCredential(parts.join("."), KEY)).toThrow(CredentialDecryptionError);
  });

  it("does not include plaintext inside the ciphertext", () => {
    const encoded = encryptCredential("SuperSecretPassword", KEY);
    expect(encoded).not.toContain("SuperSecretPassword");
  });

  it("rejects malformed encrypted values", () => {
    expect(() => decryptCredential("not-a-valid-format", KEY)).toThrow(
      CredentialDecryptionError,
    );
    expect(() => decryptCredential("v2.a.b.c", KEY)).toThrow(/Unsupported encryption version/);
  });

  it("handles empty strings and null for optional fields", () => {
    expect(encryptOptionalCredential(null, KEY)).toBeNull();
    expect(encryptOptionalCredential("", KEY)).toBeNull();
    expect(decryptOptionalCredential(null, KEY)).toBeNull();

    const encoded = encryptOptionalCredential("JBSWY3DPEHPK3PXP", KEY);
    expect(decryptOptionalCredential(encoded, KEY)).toBe("JBSWY3DPEHPK3PXP");
  });
});
