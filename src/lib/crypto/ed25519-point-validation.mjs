/**
 * Reject Ed25519 public keys that no honest key generator can produce.
 *
 * ## What goes wrong without this
 *
 * Node/OpenSSL imports any 32 bytes as an Ed25519 public key. Two families are accepted that must
 * never be trusted:
 *
 *  - **Small-order points.** The curve has cofactor 8, so eight points generate a tiny subgroup.
 *    Under every one of them the signature `(R = identity, S = 0)` verifies for a large fraction of
 *    arbitrary messages — no private key, no interaction. Measured against Node: 200/200 messages
 *    for the identity point, 19/200 for the least cooperative order-8 point. A universal forgery at
 *    any of those rates is a universal forgery; the attacker simply picks another message.
 *  - **Non-canonical encodings.** A y-coordinate at or above the field prime re-encodes a point
 *    that already has a canonical form, so one key gains two spellings. That is the same aliasing
 *    that defeated device revocation in the X25519 path (finding C4) — a revoked identity comes
 *    back wearing different bytes.
 *
 * Neither family is reachable by accident: 64 freshly generated keypairs produced no collision with
 * this table and admitted no forgery. Rejecting them therefore costs nothing for real keys, which is
 * why this rejects rather than masks. Masking would silently change a submitted identity.
 *
 * ## Where the constants come from
 *
 * They are **derived**, not recalled. The eight small-order points are exactly the solutions of
 * libsodium's `ge25519_has_small_order` predicate (`X == 0 || Y == 0 || Y*sqrt(-1) == ±X`) on
 * -x² + y² = 1 + d·x²·y². Solving each case gives four distinct y-coordinates; the eight points are
 * those four with both signs of x, and the sign of x lives in the encoding's top bit, which is
 * masked off before comparison. Every derived encoding was then confirmed against Node by measuring
 * the forgery rate above.
 *
 * `ed25519-point-validation.test.ts` re-derives the table from the curve equation on every run, so
 * a typo in these constants fails the suite rather than silently narrowing the guard.
 */

/** 2^255 - 19, the Curve25519 field prime. A canonical y-coordinate is strictly below it. */
const FIELD_PRIME = (1n << 255n) - 19n;

/**
 * The four y-coordinates of the eight small-order points, little-endian hex with the x-sign bit
 * already clear. Order 1 (identity), order 2, order 4, and the two order-8 coordinates.
 */
const SMALL_ORDER_Y_COORDINATES = new Set([
  "0100000000000000000000000000000000000000000000000000000000000000",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "0000000000000000000000000000000000000000000000000000000000000000",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
]);

/**
 * Strip the x-sign bit so a point is judged by its y-coordinate alone.
 *
 * Both spellings of the same small-order point differ only in that bit, so comparing the raw
 * encoding would need a table twice the size and would still miss a variant if one were forgotten.
 */
function yCoordinateHex(hex) {
  const bytes = Buffer.from(hex, "hex");
  bytes[31] &= 0x7f;
  return bytes.toString("hex");
}

function yCoordinateValue(yHex) {
  let value = 0n;
  const bytes = Buffer.from(yHex, "hex");
  for (let index = 31; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]);
  }
  return value;
}

/**
 * Why a 64-character lowercase hex string is rejected as an Ed25519 public key, or `null` when it
 * is acceptable. Callers own the error type, so this stays usable from both key-import paths.
 */
export function ed25519PublicKeyRejection(hex) {
  const yHex = yCoordinateHex(hex);
  if (yCoordinateValue(yHex) >= FIELD_PRIME) {
    return "non-canonical";
  }
  if (SMALL_ORDER_Y_COORDINATES.has(yHex)) {
    return "small-order";
  }
  return null;
}

export { FIELD_PRIME, SMALL_ORDER_Y_COORDINATES };
