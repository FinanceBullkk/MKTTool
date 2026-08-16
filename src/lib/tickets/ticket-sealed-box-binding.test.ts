/**
 * Phase 01 / H20: ephemeral key reuse, and whether a seal is bound to the envelope carrying it.
 *
 * `sealForDevice` is the confidentiality layer under every ticket: credentials, OTP secrets and
 * operator-key grants all travel as `{ ephemeralPublicKey, sealed }` inside a server-signed
 * envelope. Three properties are pinned here:
 *
 *  1. **Ephemeral uniqueness.** Reusing an ephemeral X25519 key across seals collapses two
 *     ciphertexts onto one AES key. With AES-GCM that is catastrophic — a repeated key/IV pair
 *     leaks the XOR of the plaintexts and, worse, the GCM authentication subkey.
 *
 *  2. **Integrity.** Tampering with any part of the box must fail closed, including substituting
 *     the ephemeral public key, which is transmitted in the clear.
 *
 *  3. **Envelope binding (the H20 hypothesis).** `sealForDevice(payload, devicePublicKeyHex)` takes
 *     no context argument, so there is structurally no associated data binding a seal to the ticket
 *     id, kind, or expiry it is delivered with. This block asserts what that costs and what still
 *     covers it, rather than assuming either.
 *
 * Also probed: `openSealedPayload` imports the *attacker-supplied* ephemeral public key without the
 * `assertRelayPublicKeyUsable` check that the enrollment path applies to recipient keys.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { describe, expect, it } from "vitest";

const { sealForDevice, openSealedPayload } = await import("./ticket-sealed-box");
const { generateRelayDeviceKeyPair, relayPrivateKeyToKeyObject } = await import(
  "./relay-device-key"
);

function newDevice() {
  const { publicKeyHex, privateKeyHex } = generateRelayDeviceKeyPair();
  return { publicKeyHex, privateKey: relayPrivateKeyToKeyObject(privateKeyHex) };
}

const PAYLOAD = { secret: "value-under-seal", kind: "CREDENTIAL" };

describe("H20: ephemeral key uniqueness", () => {
  it("mints a fresh ephemeral key for every seal", () => {
    const device = newDevice();
    const ephemerals = new Set<string>();
    const ciphertexts = new Set<string>();

    for (let i = 0; i < 64; i += 1) {
      const box = sealForDevice(PAYLOAD, device.publicKeyHex);
      ephemerals.add(box.ephemeralPublicKey);
      ciphertexts.add(box.sealed);
    }

    // Identical plaintext, identical recipient: only a fresh ephemeral makes these differ.
    expect(ephemerals.size).toBe(64);
    expect(ciphertexts.size).toBe(64);
  });

  it("never reuses an IV within the AES-GCM layer", () => {
    // `sealed` is `v1.iv.tag.ct`. A repeated (key, iv) pair is the failure this guards.
    const device = newDevice();
    const pairs = new Set<string>();

    for (let i = 0; i < 64; i += 1) {
      const box = sealForDevice(PAYLOAD, device.publicKeyHex);
      const [version, iv] = box.sealed.split(".");
      expect(version).toBe("v1");
      pairs.add(`${box.ephemeralPublicKey}:${iv}`);
    }

    expect(pairs.size).toBe(64);
  });

  it("round-trips through the intended recipient (control)", () => {
    const device = newDevice();
    const box = sealForDevice(PAYLOAD, device.publicKeyHex);
    expect(openSealedPayload(box, device.privateKey)).toEqual(PAYLOAD);
  });
});

describe("H20: integrity", () => {
  it("refuses a box whose ciphertext was altered", () => {
    const device = newDevice();
    const box = sealForDevice(PAYLOAD, device.publicKeyHex);
    const [version, iv, tag, ct] = box.sealed.split(".");

    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0x01;
    const tampered = {
      ...box,
      sealed: [version, iv, tag, flipped.toString("base64url")].join("."),
    };

    expect(() => openSealedPayload(tampered, device.privateKey)).toThrow();
    // Differential: the untouched box still opens, so the throw is the tamper and nothing else.
    expect(openSealedPayload(box, device.privateKey)).toEqual(PAYLOAD);
  });

  it("refuses a box whose authentication tag was altered", () => {
    const device = newDevice();
    const box = sealForDevice(PAYLOAD, device.publicKeyHex);
    const [version, iv, tag, ct] = box.sealed.split(".");

    const flipped = Buffer.from(tag, "base64url");
    flipped[0] ^= 0x01;

    expect(() =>
      openSealedPayload(
        { ...box, sealed: [version, iv, flipped.toString("base64url"), ct].join(".") },
        device.privateKey,
      ),
    ).toThrow();
  });

  it("refuses a box whose ephemeral public key was swapped for another seal's", () => {
    // The ephemeral key travels in the clear, so substitution is the cheapest attack on the box.
    const device = newDevice();
    const first = sealForDevice(PAYLOAD, device.publicKeyHex);
    const second = sealForDevice(PAYLOAD, device.publicKeyHex);

    expect(first.ephemeralPublicKey).not.toBe(second.ephemeralPublicKey);
    expect(() =>
      openSealedPayload(
        { ephemeralPublicKey: second.ephemeralPublicKey, sealed: first.sealed },
        device.privateKey,
      ),
    ).toThrow();
  });

  it("refuses a box sealed for a different device", () => {
    const alice = newDevice();
    const mallory = newDevice();
    const box = sealForDevice(PAYLOAD, alice.publicKeyHex);

    expect(() => openSealedPayload(box, mallory.privateKey)).toThrow();
    expect(openSealedPayload(box, alice.privateKey)).toEqual(PAYLOAD);
  });
});

describe("H20: envelope binding", () => {
  it("takes no associated data, so a seal is interchangeable between contexts", () => {
    /**
     * FINDING C5 (P3) reproduction, stated as the fact it is rather than a pass/fail.
     *
     * Two seals minted for the same device in two different logical contexts — different ticket
     * kind, different id, different expiry — are freely interchangeable at this layer. The box
     * carries nothing that names the envelope it belongs to, so it cannot detect being moved.
     *
     * What actually prevents the move today is the Ed25519 signature over the whole envelope
     * (`epk` and `sealed` included), which is the same single layer that finding C1 shows carries
     * no domain separation. Both the binding and the separation therefore rest on one mechanism.
     */
    const device = newDevice();
    const credentialSeal = sealForDevice(
      { kind: "CREDENTIAL", jti: "ticket-one", secret: "aaa" },
      device.publicKeyHex,
    );
    const otpSeal = sealForDevice(
      { kind: "OTP", jti: "ticket-two", secret: "bbb" },
      device.publicKeyHex,
    );

    // Each opens on its own terms...
    expect(openSealedPayload(credentialSeal, device.privateKey)).toMatchObject({ jti: "ticket-one" });
    expect(openSealedPayload(otpSeal, device.privateKey)).toMatchObject({ jti: "ticket-two" });

    // ...and each opens just as happily when presented as the other. Nothing at this layer objects.
    const movedIntoOtherEnvelope = openSealedPayload(credentialSeal, device.privateKey);
    expect(movedIntoOtherEnvelope).toMatchObject({ kind: "CREDENTIAL", jti: "ticket-one" });
  });

  it("does not validate the attacker-supplied ephemeral key the way it validates recipients", () => {
    /**
     * Asymmetry worth recording: enrollment runs `assertRelayPublicKeyUsable` on a *recipient* key,
     * but `openSealedPayload` imports the *ephemeral* key straight from the box. That key is
     * attacker-chosen in any scenario where a box reaches this function without a verified
     * signature above it.
     *
     * Small-order points fail closed here — OpenSSL refuses the derivation, so the box throws
     * rather than deriving a predictable key. That is the outcome we want; it is asserted so a
     * future change to a hand-rolled derivation cannot lose it silently.
     */
    const device = newDevice();
    const smallOrder = [
      "00".repeat(32),
      `01${"00".repeat(31)}`,
      "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800",
      "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
    ];
    const box = sealForDevice(PAYLOAD, device.publicKeyHex);

    for (const ephemeralPublicKey of smallOrder) {
      expect(
        () => openSealedPayload({ ephemeralPublicKey, sealed: box.sealed }, device.privateKey),
        `small-order ephemeral ${ephemeralPublicKey} did not fail closed`,
      ).toThrow();
    }
  });
});
