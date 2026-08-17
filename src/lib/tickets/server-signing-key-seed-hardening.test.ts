/**
 * Phase 01 / H18: does the server signing key reject a weak or malformed seed?
 *
 * The whole ticket/grant/retirement protocol family rests on one Ed25519 seed read from the
 * environment. If a short, truncated, or placeholder seed can reach `signingKeysFromSeed`, every
 * signature above it inherits that weakness silently — the happy path keeps working.
 *
 * Two distinct attack shapes are pinned here:
 *
 *  1. **Silent truncation.** `Buffer.from(x, "hex")` stops at the first non-hex character and
 *     returns a *short* buffer rather than throwing. A parser that trusts it, on input that is the
 *     right *string* length but not valid hex, yields a seed with far fewer than 32 bytes of real
 *     entropy. The guard must be the parse, not only a downstream length check — `parseSigningSeed`
 *     is exported and any future caller may skip `signingKeysFromSeed`.
 *
 *  2. **Placeholder seeds.** An all-zero or single-repeated-byte seed is mathematically a valid
 *     Ed25519 seed, so no crypto library will complain. It is the shape of a copy-paste from a
 *     template or a `.env.example`, and whether it is rejected is a deliberate policy question,
 *     not an accident. This block records the answer either way.
 *
 * `publicKeyFromHex` is covered too, because it is the *relay's* side of the trust root: the operator
 * pastes the server public key by hand. An identity/small-order point accepted there would make
 * Ed25519 verification forgeable by anyone (with A = identity the verification equation collapses to
 * [S]B = R, which an attacker can satisfy without any private key).
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { createPublicKey, randomBytes, sign, verify, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";

// RFC 8032 test vector, matching the seed the sibling ticket tests use.
const VALID_SEED_HEX = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
process.env.TICKET_SIGNING_KEY = VALID_SEED_HEX;

const {
  parseSigningSeed,
  signingKeysFromSeed,
  publicKeyFromHex,
  publicKeyToHex,
  SIGNING_SEED_BYTES,
  SIGNING_SEED_HEX_LENGTH,
} = await import("./server-signing-key");

const SOURCE = "TICKET_SIGNING_KEY";

/** Parse and report only whether it was accepted, so accept/reject can be compared per input. */
function accepts(raw: string | undefined): boolean {
  try {
    parseSigningSeed(raw, SOURCE);
    return true;
  } catch {
    return false;
  }
}

/** Full load path: parse then derive. This is what `loadServerSigningKeys` actually does. */
function acceptsEndToEnd(raw: string | undefined): boolean {
  try {
    signingKeysFromSeed(parseSigningSeed(raw, SOURCE));
    return true;
  } catch {
    return false;
  }
}

describe("H18: signing seed length and encoding", () => {
  it("accepts the canonical 32-byte hex seed (control)", () => {
    const seed = parseSigningSeed(VALID_SEED_HEX, SOURCE);
    expect(seed).toHaveLength(SIGNING_SEED_BYTES);
    expect(VALID_SEED_HEX).toHaveLength(SIGNING_SEED_HEX_LENGTH);
  });

  it("rejects a seed that is half the required length", () => {
    // 16 bytes = 32 hex chars. Accepting this would halve the key space.
    expect(accepts("9d61b19deffd5a60ba844af492ec2cc4")).toBe(false);
  });

  it("rejects a seed one byte too long instead of truncating it", () => {
    // Truncation would make two different env values derive the same key.
    expect(accepts(`${VALID_SEED_HEX}ff`)).toBe(false);
  });

  it("rejects a seed one byte too short", () => {
    expect(accepts(VALID_SEED_HEX.slice(0, -2))).toBe(false);
  });

  it("rejects an odd-length hex string", () => {
    expect(accepts(VALID_SEED_HEX.slice(0, -1))).toBe(false);
  });

  it("rejects an empty or absent seed", () => {
    expect(accepts(undefined)).toBe(false);
    expect(accepts("")).toBe(false);
    expect(accepts("   ")).toBe(false);
  });
});

describe("H18: silent hex truncation", () => {
  /**
   * Each of these is exactly `SIGNING_SEED_HEX_LENGTH` characters, so a length-only check on the
   * *string* passes, but `Buffer.from(_, "hex")` decodes to far fewer than 32 bytes.
   */
  const truncating: ReadonlyArray<readonly [string, string, number]> = [
    ["all non-hex characters", "z".repeat(SIGNING_SEED_HEX_LENGTH), 0],
    [
      "valid prefix then non-hex",
      `${VALID_SEED_HEX.slice(0, 2)}${"z".repeat(SIGNING_SEED_HEX_LENGTH - 2)}`,
      1,
    ],
    [
      "non-hex in the final byte only",
      `${VALID_SEED_HEX.slice(0, SIGNING_SEED_HEX_LENGTH - 2)}zz`,
      SIGNING_SEED_BYTES - 1,
    ],
    ["0x-prefixed hex", `0x${VALID_SEED_HEX.slice(2)}`, 0],
  ];

  it.each(truncating)(
    "rejects %s rather than returning a short seed",
    (_label, raw, decodedBytes) => {
      // Confirm the input really is a truncation vector before asserting the guard catches it,
      // otherwise a pass here would prove nothing about hex handling.
      expect(raw).toHaveLength(SIGNING_SEED_HEX_LENGTH);
      expect(Buffer.from(raw, "hex")).toHaveLength(decodedBytes);

      expect(accepts(raw)).toBe(false);
    },
  );

  it("never returns a seed shorter than the required length when it does accept", () => {
    // `parseSigningSeed` is exported independently of `signingKeysFromSeed`. A future caller that
    // uses only the parser must not be handed an under-length buffer.
    for (const [, raw] of truncating.map((entry) => [entry[0], entry[1]] as const)) {
      let parsed: Buffer | null = null;
      try {
        parsed = parseSigningSeed(raw, SOURCE);
      } catch {
        parsed = null;
      }
      if (parsed !== null) {
        expect(parsed).toHaveLength(SIGNING_SEED_BYTES);
      }
    }
  });
});

describe("H18: placeholder and low-entropy seeds", () => {
  const placeholders: ReadonlyArray<readonly [string, string]> = [
    ["all-zero", "00".repeat(SIGNING_SEED_BYTES)],
    ["all-0xff", "ff".repeat(SIGNING_SEED_BYTES)],
    ["single repeated byte", "ab".repeat(SIGNING_SEED_BYTES)],
    ["ascending counter", Array.from({ length: SIGNING_SEED_BYTES }, (_, i) => i.toString(16).padStart(2, "0")).join("")],
  ];

  /**
   * FINDING C2 (P3) — closed 17 August 2026. These were `it.fails` retest gates while no
   * placeholder policy existed; they turned RED the moment the guard landed and are now ordinary
   * assertions. The assertion never changed — only the code under it did.
   *
   * Each seed here is well-formed hex of exactly the right length, so nothing but a placeholder
   * policy can reject it. That is the point: length and charset were never the missing check.
   */
  it.each(placeholders)("rejects the %s seed", (_label, raw) => {
    expect(raw).toHaveLength(SIGNING_SEED_HEX_LENGTH);
    expect(Buffer.from(raw, "hex")).toHaveLength(SIGNING_SEED_BYTES);

    expect(acceptsEndToEnd(raw)).toBe(false);
  });

  it("names the placeholder pattern and points at the keygen script", () => {
    // A rejection nobody can act on gets worked around. The message has to say which rule fired
    // and what to run instead.
    expect(() => parseSigningSeed("00".repeat(SIGNING_SEED_BYTES), SOURCE)).toThrow(
      /keys:server-keygen/,
    );
    expect(() => parseSigningSeed("00".repeat(SIGNING_SEED_BYTES), SOURCE)).toThrow(/byte/);
  });

  /**
   * The other half of the guard, and the one that would hurt if it were wrong: a real seed must
   * still pass. A placeholder policy that rejects genuine keys is worse than the gap it closes.
   */
  it("accepts real random seeds — 200 of them, no false rejection", () => {
    for (let i = 0; i < 200; i += 1) {
      const raw = randomBytes(SIGNING_SEED_BYTES).toString("hex");
      expect(acceptsEndToEnd(raw), `random seed ${raw}`).toBe(true);
    }
  });

  it("accepts the RFC 8032 test vector seed", () => {
    expect(acceptsEndToEnd(VALID_SEED_HEX)).toBe(true);
  });
});

describe("H18: derivation is genuinely seed-dependent", () => {
  it("derives a distinct public key for every distinct seed", () => {
    // Differential control: guards against a fallback/constant key masking a broken parse.
    const seen = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      const keys = signingKeysFromSeed(randomBytes(SIGNING_SEED_BYTES));
      seen.add(keys.publicKeyHex);
    }
    expect(seen.size).toBe(8);
  });

  it("derives the RFC 8032 public key for the RFC 8032 seed", () => {
    // Pins the derivation itself, not just its variability.
    const keys = signingKeysFromSeed(Buffer.from(VALID_SEED_HEX, "hex"));
    expect(keys.publicKeyHex).toBe(
      "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    );
  });

  it("rejects a raw seed buffer of the wrong length", () => {
    expect(() => signingKeysFromSeed(randomBytes(SIGNING_SEED_BYTES - 1))).toThrow();
    expect(() => signingKeysFromSeed(randomBytes(SIGNING_SEED_BYTES + 1))).toThrow();
    expect(() => signingKeysFromSeed(Buffer.alloc(0))).toThrow();
  });
});

describe("H18: relay-side public key import", () => {
  const validPublicKeyHex = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

  function importsKey(hex: string): boolean {
    try {
      publicKeyFromHex(hex);
      return true;
    } catch {
      return false;
    }
  }

  it("round-trips a genuine server public key (control)", () => {
    const imported = publicKeyFromHex(validPublicKeyHex);
    expect(publicKeyToHex(imported)).toBe(validPublicKeyHex);
  });

  it("rejects wrong-length and non-hex public keys", () => {
    expect(importsKey(validPublicKeyHex.slice(0, -2))).toBe(false);
    expect(importsKey(`${validPublicKeyHex}ff`)).toBe(false);
    expect(importsKey("z".repeat(SIGNING_SEED_HEX_LENGTH))).toBe(false);
    expect(importsKey("")).toBe(false);
  });

  /** The Ed25519 identity point (0, 1) encodes as 0x01 followed by 31 zero bytes. */
  const IDENTITY_POINT_HEX = `01${"00".repeat(31)}`;

  /**
   * Universal forgery against the identity point: R = identity, S = 0.
   *
   * Verification checks [S]B = R + [h]A. With S = 0 the left side is the identity; with A = identity
   * the right side is R + identity = R = identity. It holds for *every* message, and the forger
   * needs no private key and no interaction.
   */
  const UNIVERSAL_FORGERY = Buffer.concat([
    Buffer.from(IDENTITY_POINT_HEX, "hex"),
    Buffer.alloc(32),
  ]);

  it("rejects the identity point at import", () => {
    // Shape validation alone would accept it: 64 lowercase hex characters is all the old guard
    // required. Both facts are asserted together so the reason for the rejection stays legible.
    expect(IDENTITY_POINT_HEX).toMatch(/^[0-9a-f]{64}$/);
    expect(importsKey(IDENTITY_POINT_HEX)).toBe(false);
    expect(() => publicKeyFromHex(IDENTITY_POINT_HEX)).toThrow(/điểm bậc nhỏ/i);
  });

  /**
   * Whether this runtime's Ed25519 backend entertains the forgery at all.
   *
   * Node on Windows — the platform this product ships on — verifies it. The OpenSSL build on the
   * Linux CI runner refuses it outright. That is a property of the backend, not of this repository,
   * so it is measured rather than assumed; the guard's own behaviour is asserted unconditionally.
   */
  const backendAdmitsForgery = (() =>
    verify(null, Buffer.from("probe", "utf8"), rawImport(IDENTITY_POINT_HEX), UNIVERSAL_FORGERY))();

  it("leaves the forgery available whenever the backend permits it, which is why the check exists", () => {
    /**
     * Differential: one artifact, two keys. Under a genuine server key it must be rejected on every
     * backend. Under the identity point it verifies wherever the backend allows it at all. The
     * identity key is built with a raw `createPublicKey` deliberately — going through
     * `publicKeyFromHex` now throws, and asserting only that it throws would delete the evidence
     * that the danger behind the guard is real.
     */
    const genuine = publicKeyFromHex(validPublicKeyHex);
    const identity = rawImport(IDENTITY_POINT_HEX);

    for (const text of ["forged-authorization", "retire every device", ""]) {
      const message = Buffer.from(text, "utf8");
      expect(verify(null, message, genuine, UNIVERSAL_FORGERY)).toBe(false);
      expect(verify(null, message, identity, UNIVERSAL_FORGERY)).toBe(backendAdmitsForgery);
    }
  });

  /**
   * Small-order and non-canonical encodings, by role.
   *
   * The order-8 entries are the genuine order-8 points, derived in
   * `src/lib/crypto/ed25519-point-validation.test.ts` from the curve equation. An earlier revision
   * of this list labelled `00…0080` "order 8"; it is really the order-4 point carrying the opposite
   * x-sign, and the derivation is what corrected it.
   */
  const LOW_ORDER_POINTS: ReadonlyArray<readonly [string, string]> = [
    ["identity (order 1)", IDENTITY_POINT_HEX],
    ["order 2", "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
    ["y = 0 (order 4)", "00".repeat(32)],
    ["y = 0 (order 4), opposite x-sign", "0000000000000000000000000000000000000000000000000000000000000080"],
    ["order 8", "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05"],
    ["order 8, opposite x-sign", "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a"],
    ["non-canonical y = p", "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
  ];

  /**
   * Whether a forgery exists for a message the *attacker* gets to choose.
   *
   * For a point of order n the forgery (R = identity, S = 0) verifies whenever the challenge scalar
   * h = SHA-512(R ‖ A ‖ M) is ≡ 0 mod n — probability 1/n over messages. Testing one fixed message
   * would make this survey a coin flip; the attacker simply searches, so the security-relevant
   * question is "does any message work", not "does this one".
   */
  function forgeableForSomeMessage(key: KeyObject): boolean {
    for (let i = 0; i < 64; i += 1) {
      try {
        if (verify(null, Buffer.from(`forged-authorization-${i}`, "utf8"), key, UNIVERSAL_FORGERY)) {
          return true;
        }
      } catch {
        /* treat a throw as a rejection for this message and keep searching */
      }
    }
    return false;
  }

  function rawImport(hex: string): KeyObject {
    return createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(hex, "hex").toString("base64url") },
      format: "jwk",
    });
  }

  /**
   * Both halves of the finding, kept side by side.
   *
   * Asserting only that import now throws would leave a future reader unable to tell whether these
   * encodings were ever dangerous or whether someone blocked an arbitrary list. So each one is also
   * shown to be forgeable when the guard is bypassed — the guard's justification and its effect,
   * in one place.
   */
  it("refuses every low-order point at import, each forgeable without the guard where the backend allows it", () => {
    const surveyed = Object.fromEntries(
      LOW_ORDER_POINTS.map(([label, hex]) => [
        label,
        {
          importable: importsKey(hex),
          forgeableWithoutGuard: forgeableForSomeMessage(rawImport(hex)),
        },
      ]),
    );

    expect(surveyed).toEqual(
      Object.fromEntries(
        LOW_ORDER_POINTS.map(([label]) => [
          label,
          { importable: false, forgeableWithoutGuard: backendAdmitsForgery },
        ]),
      ),
    );
  });

  it("finds no such forgery under a genuine server key (differential control)", () => {
    // Same artifact, same message search, real key. Proves the survey above measures the key's
    // low order and not some quirk of the forged artifact.
    const genuine = publicKeyFromHex(validPublicKeyHex);
    for (let i = 0; i < 64; i += 1) {
      expect(
        verify(null, Buffer.from(`forged-authorization-${i}`, "utf8"), genuine, UNIVERSAL_FORGERY),
      ).toBe(false);
    }
  });

  /**
   * FINDING C3 (P3) — closed 17 August 2026. This was an `it.fails` retest gate while the guard was
   * absent; it flipped red the moment the guard landed, which is exactly what it was for.
   */
  it("rejects every low-order point at import", () => {
    for (const [label, hex] of LOW_ORDER_POINTS) {
      expect(importsKey(hex), `${label} was importable`).toBe(false);
    }
  });

  it("verifies a genuine signature end to end (control)", () => {
    const keys = signingKeysFromSeed(Buffer.from(VALID_SEED_HEX, "hex"));
    const message = Buffer.from("genuine-authorization", "utf8");
    const signature = sign(null, message, keys.privateKey);

    expect(verify(null, message, publicKeyFromHex(keys.publicKeyHex), signature)).toBe(true);
    // Same signature, different message: must differ.
    expect(
      verify(null, Buffer.from("tampered", "utf8"), publicKeyFromHex(keys.publicKeyHex), signature),
    ).toBe(false);
  });
});
