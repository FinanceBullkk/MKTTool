/**
 * The guard's constants are only trustworthy if something independent can regenerate them.
 *
 * This suite does not assert that the table equals a list copied from the same place the table came
 * from — that proves nothing. It re-derives the small-order points from the curve equation on every
 * run, then confirms with Node that each one really does admit a signature nobody holds a key for.
 * Math and measurement have to agree before the guard is considered correct.
 */
import { createPublicKey, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ed25519PublicKeyRejection,
  SMALL_ORDER_Y_COORDINATES,
} from "./ed25519-point-validation.mjs";
import { publicKeyFromHex as releasePublicKeyFromHex } from "../../../scripts/release-authority/release-authority-key-primitives.mjs";
import { publicKeyFromHex as ticketPublicKeyFromHex } from "../tickets/server-signing-key";

const P = (1n << 255n) - 19n;

function mod(value: bigint): bigint {
  return ((value % P) + P) % P;
}

function power(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let b = mod(base);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}

const inverse = (value: bigint) => power(value, P - 2n);
const D = mod(-121665n * inverse(121666n));
/** p = 5 (mod 8), so 2^((p-1)/4) is a square root of -1. */
const SQRT_MINUS_ONE = power(2n, (P - 1n) / 4n);

function squareRoot(value: bigint): bigint | null {
  const v = mod(value);
  if (v === 0n) return 0n;
  let root = power(v, (P + 3n) / 8n);
  if (mod(root * root) !== v) root = mod(root * SQRT_MINUS_ONE);
  return mod(root * root) === v ? root : null;
}

function encodeY(y: bigint): string {
  const bytes = Buffer.alloc(32);
  let remaining = y;
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes.toString("hex");
}

/**
 * The y-coordinates of the eight small-order points, from libsodium's predicate
 * `X == 0 || Y == 0 || Y*sqrt(-1) == ±X` applied to -x² + y² = 1 + d·x²·y².
 */
function deriveSmallOrderYCoordinates(): Set<string> {
  const coordinates = new Set<string>();
  // X == 0 gives y² = 1: the identity (order 1) and the order-2 point.
  coordinates.add(encodeY(1n));
  coordinates.add(encodeY(mod(-1n)));
  // Y == 0 gives the two order-4 points.
  coordinates.add(encodeY(0n));
  // Y*sqrt(-1) == ±X gives x² = -y², hence d·y⁴ + 2y² - 1 = 0.
  const discriminant = squareRoot(mod(1n + D));
  expect(discriminant).not.toBeNull();
  for (const sign of [discriminant!, mod(-discriminant!)]) {
    const ySquared = mod(mod(-1n + sign) * inverse(D));
    const y = squareRoot(ySquared);
    if (y === null) continue;
    coordinates.add(encodeY(y));
    coordinates.add(encodeY(mod(-y)));
  }
  return coordinates;
}

/** The forgery that small-order points admit: R = identity encoding, S = 0. */
const UNIVERSAL_FORGERY = Buffer.concat([
  Buffer.from(`01${"00".repeat(31)}`, "hex"),
  Buffer.alloc(32),
]);

function forgeryHits(hex: string, trials: number): number {
  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(hex, "hex").toString("base64url") },
    format: "jwk",
  });
  let hits = 0;
  for (let index = 0; index < trials; index += 1) {
    try {
      if (verify(null, randomBytes(24), key, UNIVERSAL_FORGERY)) hits += 1;
    } catch {
      // A throwing verify is not a successful forgery.
    }
  }
  return hits;
}

describe("Ed25519 public key point validation", () => {
  it("blocks exactly the small-order y-coordinates derived from the curve equation", () => {
    expect(new Set(SMALL_ORDER_Y_COORDINATES)).toEqual(deriveSmallOrderYCoordinates());
  });

  it("proves every blocked point really does admit a signature nobody holds a key for", () => {
    for (const yHex of SMALL_ORDER_Y_COORDINATES) {
      expect(forgeryHits(yHex, 120)).toBeGreaterThan(0);
    }
  });

  it("never fires on a freshly generated keypair", () => {
    for (let index = 0; index < 32; index += 1) {
      const { publicKey } = generateKeyPairSync("ed25519");
      const jwk = publicKey.export({ format: "jwk" }) as { x: string };
      const hex = Buffer.from(jwk.x, "base64url").toString("hex");

      expect(ed25519PublicKeyRejection(hex)).toBeNull();
      expect(forgeryHits(hex, 8)).toBe(0);
    }
  });

  it("rejects a small-order point regardless of which x-sign the encoding carries", () => {
    for (const yHex of SMALL_ORDER_Y_COORDINATES) {
      const signed = Buffer.from(yHex, "hex");
      signed[31] |= 0x80;

      expect(ed25519PublicKeyRejection(yHex)).toBe("small-order");
      expect(ed25519PublicKeyRejection(signed.toString("hex"))).toBe("small-order");
    }
  });

  it("rejects y-coordinates at or above the field prime", () => {
    for (const y of [P, P + 1n, (1n << 255n) - 1n]) {
      expect(ed25519PublicKeyRejection(encodeY(y))).toBe("non-canonical");
    }
  });

  /**
   * C3 asked for one fix across both key-import paths. Asserting each one separately is the only
   * way that stays true if someone later gives one of them its own validation.
   */
  it("is enforced by both public key import paths", () => {
    for (const yHex of SMALL_ORDER_Y_COORDINATES) {
      expect(() => releasePublicKeyFromHex(yHex)).toThrow(/small-order point/i);
      expect(() => ticketPublicKeyFromHex(yHex)).toThrow(/điểm bậc nhỏ/i);
    }
    const nonCanonical = encodeY(P + 1n);
    expect(() => releasePublicKeyFromHex(nonCanonical)).toThrow(/non-canonical/i);
    expect(() => ticketPublicKeyFromHex(nonCanonical)).toThrow(/không chuẩn tắc/i);
  });
});
