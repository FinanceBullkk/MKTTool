import {
  OPERATOR_KEY_FINGERPRINT_ENV,
  fingerprintOperatorKey,
} from "../src/lib/crypto/operator-key-fingerprint";

const operatorKey = process.env.VAULT_KEY_OPERATOR;
if (!operatorKey) {
  throw new Error(
    "VAULT_KEY_OPERATOR is missing. Run this only in the trusted environment that already holds it.",
  );
}

console.log(`${OPERATOR_KEY_FINGERPRINT_ENV}=${fingerprintOperatorKey(operatorKey)}`);
