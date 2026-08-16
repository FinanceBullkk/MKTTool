/**
 * Phase 01 / H19: does the relay device key reject a malformed, small-order, or aliased X25519 point?
 *
 * The relay device public key is the recipient key for every sealed ticket payload. It arrives from
 * outside — enrolled by the operator, stored as hex, and later used to seal credentials, OTP secrets
 * and operator-key grants. Two failure shapes are pinned here:
 *
 *  1. **Small-order points.** X25519 does not validate its input point. A public key of small order
 *     forces the shared secret to a fixed, attacker-known value regardless of the sender's private
 *     key, so anything "sealed" to it is readable by anyone. `assertRelayPublicKeyUsable` exists and
 *     performs a probe Diffie-Hellman; this block proves whether that probe actually rejects them.
 *
 *  2. **Encoding aliasing.** RFC 7748 says the most-significant bit of the final byte of an X25519
 *     public key is ignored. Two different hex strings can therefore denote the *same* key. The
 *     system uses the hex string as a device identity — `recipientPublicKey` is compared as a string
 *     when binding grants and when revoking devices — so if an alias is accepted, one private key can
 *     hold two distinct identities, and revoking one leaves the other live.
 *
 * `SPKI_X25519_PREFIX` is exported from this module and was flagged by the Phase 00 unused-export
 * scan as appearing exactly once. Whether it guards anything is therefore an open question, asserted
 * here rather than assumed.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { createPublicKey, diffieHellman, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

const {
  normalizeRelayPublicKey,
  relayPublicKeyToKeyObject,
  relayPublicKeyToHex,
  assertRelayPublicKeyUsable,
  generateRelayDeviceKeyPair,
  RELAY_PUBLIC_KEY_BYTES,
  RELAY_PUBLIC_KEY_HEX_LENGTH,
  SPKI_X25519_PREFIX,
} = await import("./relay-device-key");

/**
 * The canonical X25519 small-order points — the set libsodium's `crypto_scalarmult` blacklist
 * rejects. Each forces the shared secret to a value the sender's private key cannot influence.
 */
const SMALL_ORDER_POINTS: ReadonlyArray<readonly [string, string]> = [
  ["order 1 — all zero", "00".repeat(32)],
  ["order 1 — one", `01${"00".repeat(31)}`],
  ["order 8 — first", "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800"],
  ["order 8 — second", "5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157"],
  ["order 2 — p-1", "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
  ["order 4 — p", "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
  ["order 1 — p+1", "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
];

/** Run the module's full accept path for a pasted key: normalize, import, then usability-assert. */
function acceptsAsRecipient(hex: string): boolean {
  try {
    const key = relayPublicKeyToKeyObject(hex);
    assertRelayPublicKeyUsable(key);
    return true;
  } catch {
    return false;
  }
}

describe("H19: shape validation", () => {
  it("round-trips a freshly generated device key (control)", () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    expect(publicKeyHex).toHaveLength(RELAY_PUBLIC_KEY_HEX_LENGTH);
    expect(relayPublicKeyToHex(relayPublicKeyToKeyObject(publicKeyHex))).toBe(publicKeyHex);
    expect(acceptsAsRecipient(publicKeyHex)).toBe(true);
  });

  it("rejects wrong-length, non-hex and empty keys", () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    expect(() => relayPublicKeyToKeyObject(publicKeyHex.slice(0, -2))).toThrow();
    expect(() => relayPublicKeyToKeyObject(`${publicKeyHex}ff`)).toThrow();
    expect(() => relayPublicKeyToKeyObject("z".repeat(RELAY_PUBLIC_KEY_HEX_LENGTH))).toThrow();
    expect(() => relayPublicKeyToKeyObject("")).toThrow();
  });

  it("normalizes whitespace and case without changing the key", () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const messy = ` ${publicKeyHex.toUpperCase().replace(/(.{8})/g, "$1 ")} \n`;
    expect(normalizeRelayPublicKey(messy)).toBe(publicKeyHex);
  });

  it("cannot distinguish an Ed25519 key pasted where an X25519 key belongs", () => {
    /**
     * OBSERVATION, not a finding — recorded because the hypothesis that drove this test was wrong
     * and the reason is worth keeping.
     *
     * An Ed25519 public key and an X25519 u-coordinate are both 32 opaque bytes. There is no
     * validation that separates them, so a cross-curve paste is undetectable at this layer. The
     * consequence is recoverability, not confidentiality: secrets get sealed to a point whose
     * X25519 private half the operator does not hold.
     *
     * `server-signing-key.ts:145` warns about exactly the mirror-image mistake ("did you paste the
     * relay's X25519 key?"), which it *can* catch only because Ed25519 import validates the point.
     * The reverse direction has no such check available. Detection would require a self-describing
     * key format — which is what the now-unused `SPKI_X25519_PREFIX` would have provided had the
     * wire format carried DER rather than bare hex.
     */
    function edKeyHex(): string {
      const ed = generateKeyPairSync("ed25519");
      const jwk = ed.publicKey.export({ format: "jwk" }) as { x: string };
      return Buffer.from(jwk.x, "base64url").toString("hex");
    }

    // Ed25519 stores the sign of x in bit 255 — the very bit X25519 ignores — so roughly half of
    // all Ed25519 keys now trip the C4 canonical-form guard. That is a genuine partial mitigation
    // for this paste error, arrived at incidentally. Both halves are pinned so the split is not
    // mistaken for flakiness.
    let withBitSet: string | null = null;
    let withBitClear: string | null = null;
    for (let i = 0; i < 200 && (withBitSet === null || withBitClear === null); i += 1) {
      const hex = edKeyHex();
      if ((Buffer.from(hex, "hex")[31] & 0x80) !== 0) withBitSet ??= hex;
      else withBitClear ??= hex;
    }
    expect(withBitSet).not.toBeNull();
    expect(withBitClear).not.toBeNull();

    expect(withBitClear).toHaveLength(RELAY_PUBLIC_KEY_HEX_LENGTH);
    // Caught only by accident of encoding, not by any cross-curve check.
    expect(acceptsAsRecipient(withBitSet as string)).toBe(false);
    // The other half remains undetectable, which is the observation this test exists to record.
    expect(acceptsAsRecipient(withBitClear as string)).toBe(true);
  });

  it("keeps SPKI_X25519_PREFIX honest if anything ever uses it", () => {
    // The constant is exported but unreferenced (Phase 00 unused-export scan). It is not a guard.
    // Pin its value so a future reintroduction as a real check starts from a correct constant.
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const der = relayPublicKeyToKeyObject(publicKeyHex).export({ type: "spki", format: "der" });
    expect(der.subarray(0, SPKI_X25519_PREFIX.length)).toEqual(SPKI_X25519_PREFIX);
    expect(der.subarray(SPKI_X25519_PREFIX.length).toString("hex")).toBe(publicKeyHex);
  });
});

describe("H19: small-order points", () => {
  it("pins which small-order points survive the full accept path (finding scope)", () => {
    // Data, not pass/fail, so the breadth of any gap is unambiguous and future changes show as diffs.
    const surveyed = Object.fromEntries(
      SMALL_ORDER_POINTS.map(([label, hex]) => [label, acceptsAsRecipient(hex)]),
    );
    expect(surveyed).toEqual({
      "order 1 — all zero": false,
      "order 1 — one": false,
      "order 8 — first": false,
      "order 8 — second": false,
      "order 2 — p-1": false,
      "order 4 — p": false,
      "order 1 — p+1": false,
    });
  });

  it.each(SMALL_ORDER_POINTS)(
    "refuses %s as a sealing recipient",
    (_label, hex) => {
      expect(acceptsAsRecipient(hex)).toBe(false);
    },
  );

  it("would otherwise yield a shared secret independent of the sender (why this matters)", () => {
    /**
     * Differential, and the justification for the assertions above: against a genuine recipient two
     * different senders derive two different shared secrets. Against a small-order point they derive
     * the *same* one, so the seal protects nothing. Asserted directly on node:crypto so the claim
     * does not depend on the module under test.
     */
    const genuine = relayPublicKeyToKeyObject(generateRelayDeviceKeyPair().publicKeyHex);
    const senderA = generateKeyPairSync("x25519").privateKey;
    const senderB = generateKeyPairSync("x25519").privateKey;

    const genuineA = diffieHellman({ privateKey: senderA, publicKey: genuine }).toString("hex");
    const genuineB = diffieHellman({ privateKey: senderB, publicKey: genuine }).toString("hex");
    expect(genuineA).not.toBe(genuineB);

    // The all-zero point, imported directly so the module's guard cannot mask the property.
    const degenerate = createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: Buffer.alloc(32).toString("base64url") },
      format: "jwk",
    });

    let secretA: string | null = null;
    let secretB: string | null = null;
    try {
      secretA = diffieHellman({ privateKey: senderA, publicKey: degenerate }).toString("hex");
      secretB = diffieHellman({ privateKey: senderB, publicKey: degenerate }).toString("hex");
    } catch {
      // Node refusing outright is an equally good outcome — the point is that it is never a
      // sender-dependent secret.
      expect(secretA).toBeNull();
      return;
    }
    expect(secretA).toBe(secretB);
    expect(secretA).toBe("00".repeat(RELAY_PUBLIC_KEY_BYTES));
  });
});

describe("H19: encoding aliasing", () => {
  /**
   * RFC 7748 §5: the MSB of the last byte of a u-coordinate is ignored. Setting it produces a
   * different 64-character hex string that denotes the same key and derives the same shared secret.
   */
  function withHighBitSet(hex: string): string {
    const bytes = Buffer.from(hex, "hex");
    bytes[31] |= 0x80;
    return bytes.toString("hex");
  }

  it("only tests keys where the alias is genuinely a different string", () => {
    // Guard against a vacuous pass: if the high bit were already set the alias would equal the key.
    let found = 0;
    for (let i = 0; i < 16; i += 1) {
      const { publicKeyHex } = generateRelayDeviceKeyPair();
      if (withHighBitSet(publicKeyHex) !== publicKeyHex) found += 1;
    }
    expect(found).toBeGreaterThan(0);
  });

  it("derives an identical shared secret from the aliased encoding (the underlying fact)", () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const aliased = withHighBitSet(publicKeyHex);
    if (aliased === publicKeyHex) return; // high bit already set; nothing to compare

    const sender = generateKeyPairSync("x25519").privateKey;
    const direct = diffieHellman({
      privateKey: sender,
      publicKey: createPublicKey({
        key: { kty: "OKP", crv: "X25519", x: Buffer.from(publicKeyHex, "hex").toString("base64url") },
        format: "jwk",
      }),
    }).toString("hex");
    const viaAlias = diffieHellman({
      privateKey: sender,
      publicKey: createPublicKey({
        key: { kty: "OKP", crv: "X25519", x: Buffer.from(aliased, "hex").toString("base64url") },
        format: "jwk",
      }),
    }).toString("hex");

    expect(viaAlias).toBe(direct);
  });

  it("never generates a key with the ignored bit set, so masking or rejecting is non-breaking", () => {
    // A genuine u-coordinate is < p = 2^255 - 19, so bit 255 is always clear. This is what makes
    // the remediation safe: no legitimately generated key changes identity under it.
    for (let i = 0; i < 32; i += 1) {
      const { publicKeyHex } = generateRelayDeviceKeyPair();
      expect(Buffer.from(publicKeyHex, "hex")[31] & 0x80).toBe(0);
    }
  });

  /**
   * FINDING C4 (P2) — regression guard. Was `it.fails` while the gap was open; now a plain
   * assertion, because `normalizeRelayPublicKey` rejects the non-canonical encoding.
   *
   * `recipientPublicKey` is matched as a *string* when binding a grant to a device and when
   * revoking one, and `RelayDevice.publicKey` is `@unique` in Postgres. Its schema comment states
   * the invariant this protects verbatim: the same key in two rows means revoking one leaves the
   * other alive.
   */
  it("prevents two device identities sharing one private key", () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const aliased = withHighBitSet(publicKeyHex);
    expect(aliased).not.toBe(publicKeyHex);

    let normalizedAlias: string | null = null;
    try {
      normalizedAlias = relayPublicKeyToHex(relayPublicKeyToKeyObject(aliased));
    } catch {
      normalizedAlias = null; // rejected outright — the outcome the guard produces
    }

    if (normalizedAlias !== null) {
      expect(
        normalizedAlias,
        "aliased encoding accepted without canonicalization, creating a second identity",
      ).toBe(publicKeyHex);
    }
  });

  it("refuses the aliased encoding at the enrollment accept path (C4 regression)", () => {
    // Differential: the canonical string enrolls, the alias does not. Both being accepted is the
    // defect — `@unique` would see them as two rows and revoking one would leave the other live.
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const aliased = withHighBitSet(publicKeyHex);

    expect(aliased).not.toBe(publicKeyHex);
    expect(acceptsAsRecipient(publicKeyHex)).toBe(true);
    expect(acceptsAsRecipient(aliased)).toBe(false);
  });
});
