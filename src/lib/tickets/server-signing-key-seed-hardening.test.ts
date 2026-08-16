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
import { randomBytes, sign, verify } from "node:crypto";
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
   * FINDING C2 (P3) — retest gate. There is no entropy/placeholder policy on the signing seed.
   *
   * `it.fails` pins the gap honestly: it is green while the guard is absent and turns RED the
   * moment someone adds one, which is the prompt to convert these into ordinary assertions. The
   * assertion itself is the one we actually want to hold — it is not weakened to obtain green.
   *
   * Contrast `release-download-token.ts:44`, which does enforce a minimum strength
   * (`MIN_RELEASE_DOWNLOAD_TOKEN_LENGTH = 32`) on a far less powerful secret.
   */
  it.fails.each(placeholders)("does not yet reject the %s seed", (_label, raw) => {
    expect(raw).toHaveLength(SIGNING_SEED_HEX_LENGTH);
    // Well-formed hex of the right length — nothing but an entropy policy can reject these.
    expect(Buffer.from(raw, "hex")).toHaveLength(SIGNING_SEED_BYTES);

    expect(acceptsEndToEnd(raw)).toBe(false);
  });

  it("accepts them today, deriving a usable key from a guessable seed", () => {
    // The concrete consequence, asserted rather than asserted-about: a placeholder seed yields a
    // working server signing key, so anyone who guesses the placeholder signs every protocol.
    const keys = signingKeysFromSeed(parseSigningSeed("00".repeat(SIGNING_SEED_BYTES), SOURCE));
    expect(keys.publicKeyHex).toHaveLength(SIGNING_SEED_HEX_LENGTH);
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

  it("treats the identity point as a well-formed key today (finding C3 reproduction)", () => {
    // Shape-only validation: 64 lowercase hex characters is all that is required, and the identity
    // point satisfies it. Recorded as a fact so the forgery test below is unambiguous.
    expect(IDENTITY_POINT_HEX).toMatch(/^[0-9a-f]{64}$/);
    expect(importsKey(IDENTITY_POINT_HEX)).toBe(true);
  });

  /**
   * FINDING C3 (P3) — retest gate. See the C2 note above for why `it.fails` is used.
   * Turns RED once a point-validity check lands, which is the prompt to make it a real assertion.
   */
  it.fails("does not yet reject the identity point, which makes every signature forgeable", () => {
    expect(importsKey(IDENTITY_POINT_HEX)).toBe(false);
  });

  it("demonstrates the forgery the missing point check would prevent", () => {
    /**
     * Differential: one artifact, two keys. Under a genuine server key it must be rejected; under
     * the identity point it is accepted for arbitrary messages. The outcomes differing is the
     * finding — a boolean on either key alone would prove nothing.
     */
    const genuine = publicKeyFromHex(validPublicKeyHex);
    const identity = publicKeyFromHex(IDENTITY_POINT_HEX);

    for (const text of ["forged-authorization", "retire every device", ""]) {
      const message = Buffer.from(text, "utf8");
      expect(verify(null, message, genuine, UNIVERSAL_FORGERY)).toBe(false);
      expect(
        verify(null, message, identity, UNIVERSAL_FORGERY),
        "identity point should have been rejected at import",
      ).toBe(true);
    }
  });

  /** The canonical Ed25519 small-order / non-canonical encodings, by their documented role. */
  const LOW_ORDER_POINTS: ReadonlyArray<readonly [string, string]> = [
    ["identity (order 1)", IDENTITY_POINT_HEX],
    ["order 2", "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
    ["y = 0 (order 4)", "00".repeat(32)],
    ["order 8", "0000000000000000000000000000000000000000000000000000000000000080"],
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
  function survey(hex: string): { importable: boolean; forgeableForSomeMessage: boolean } {
    let key;
    try {
      key = publicKeyFromHex(hex);
    } catch {
      return { importable: false, forgeableForSomeMessage: false };
    }
    for (let i = 0; i < 64; i += 1) {
      try {
        if (verify(null, Buffer.from(`forged-authorization-${i}`, "utf8"), key, UNIVERSAL_FORGERY)) {
          return { importable: true, forgeableForSomeMessage: true };
        }
      } catch {
        /* treat a throw as a rejection for this message and keep searching */
      }
    }
    return { importable: true, forgeableForSomeMessage: false };
  }

  it("pins which low-order points are importable and forgeable (finding C3 scope)", () => {
    // Recorded as data rather than pass/fail so the finding's true breadth is unambiguous and any
    // future change in this surface — wider or narrower — shows up as a diff.
    const surveyed = Object.fromEntries(
      LOW_ORDER_POINTS.map(([label, hex]) => [label, survey(hex)]),
    );

    expect(surveyed).toEqual({
      "identity (order 1)": { importable: true, forgeableForSomeMessage: true },
      "order 2": { importable: true, forgeableForSomeMessage: true },
      "y = 0 (order 4)": { importable: true, forgeableForSomeMessage: true },
      "order 8": { importable: true, forgeableForSomeMessage: true },
      "non-canonical y = p": { importable: true, forgeableForSomeMessage: true },
    });
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
   * FINDING C3 (P3) — retest gate. Every low-order point should be refused at import.
   * Green while the guard is absent; RED once it lands, prompting conversion to a real assertion.
   */
  it.fails("does not yet reject any low-order point at import", () => {
    for (const [label, hex] of LOW_ORDER_POINTS) {
      expect(survey(hex).importable, `${label} was importable`).toBe(false);
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
