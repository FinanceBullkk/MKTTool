import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OPERATOR_KEY_FINGERPRINT_ENV,
  fingerprintOperatorKey,
  operatorKeyFingerprintMatches,
  readExpectedOperatorKeyFingerprint,
} from "./operator-key-fingerprint";

const KEY = "500492c4cba32f2a2f5e5c9f0a002c5998c98ea1f0f93afc862a02a7059e8e77";

describe("operator-key fingerprint", () => {
  it("is stable, case-insensitive, and domain-separated from a bare key hash", () => {
    const fingerprint = fingerprintOperatorKey(KEY);
    const bareHash = createHash("sha256").update(Buffer.from(KEY, "hex")).digest("hex");

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOperatorKey(KEY.toUpperCase())).toBe(fingerprint);
    expect(fingerprint).not.toBe(bareHash);
  });

  it("rejects malformed keys and verifier configuration", () => {
    expect(() => fingerprintOperatorKey("abc")).toThrow(/64 hexadecimal/i);
    expect(() => readExpectedOperatorKeyFingerprint({})).toThrow(
      new RegExp(OPERATOR_KEY_FINGERPRINT_ENV),
    );
    expect(() =>
      readExpectedOperatorKeyFingerprint({ [OPERATOR_KEY_FINGERPRINT_ENV]: "z".repeat(64) }),
    ).toThrow(/64 hexadecimal/i);
  });

  it("compares only canonical fingerprints", () => {
    const expected = fingerprintOperatorKey(KEY);
    expect(operatorKeyFingerprintMatches(expected, expected)).toBe(true);
    expect(operatorKeyFingerprintMatches("0".repeat(64), expected)).toBe(false);
    expect(operatorKeyFingerprintMatches("not-a-fingerprint", expected)).toBe(false);
  });
});
