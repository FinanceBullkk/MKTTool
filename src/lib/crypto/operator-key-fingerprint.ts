import { createHash, timingSafeEqual } from "node:crypto";

export const OPERATOR_KEY_FINGERPRINT_ENV = "VAULT_KEY_OPERATOR_FINGERPRINT";
export const OPERATOR_KEY_FINGERPRINT_HEX_LENGTH = 64;

const OPERATOR_KEY_HEX_LENGTH = 64;
const FINGERPRINT_DOMAIN = Buffer.from("mkttool:operator-key-fingerprint:v1\0", "utf8");

export class OperatorKeyFingerprintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorKeyFingerprintError";
  }
}

/** Derive a non-reversible verifier without moving the operator key off the local PC. */
export function fingerprintOperatorKey(operatorKeyHex: string): string {
  const normalized = operatorKeyHex.trim().toLowerCase();
  if (normalized.length !== OPERATOR_KEY_HEX_LENGTH || !/^[0-9a-f]+$/.test(normalized)) {
    throw new OperatorKeyFingerprintError(
      `The operator key must contain exactly ${OPERATOR_KEY_HEX_LENGTH} hexadecimal characters.`,
    );
  }

  return createHash("sha256")
    .update(FINGERPRINT_DOMAIN)
    .update(Buffer.from(normalized, "hex"))
    .digest("hex");
}

export function readExpectedOperatorKeyFingerprint(
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[OPERATOR_KEY_FINGERPRINT_ENV]?.trim().toLowerCase() ?? "";
  if (
    value.length !== OPERATOR_KEY_FINGERPRINT_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(value)
  ) {
    throw new OperatorKeyFingerprintError(
      `${OPERATOR_KEY_FINGERPRINT_ENV} must contain exactly ` +
        `${OPERATOR_KEY_FINGERPRINT_HEX_LENGTH} hexadecimal characters.`,
    );
  }
  return value;
}

export function operatorKeyFingerprintMatches(actual: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(actual) || !/^[0-9a-f]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
