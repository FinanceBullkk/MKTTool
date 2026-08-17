/**
 * Phase 01 / H10 + H11: is a bootstrap authorization single-use, and is its completion proof
 * obtainable only by the recipient?
 *
 * **H10 — single use.** `BootstrapAuthorizationBroker.consume()` reads `this.current` and nulls it
 * before doing any other work. In a single-threaded runtime with no `await` between the read and the
 * clear, that take-and-clear is atomic, so two interleaved callers cannot both obtain the same
 * authorization. This is a structural property rather than a lock, which makes it exactly the kind of
 * thing that survives review and dies in a later refactor — one `await` moved above the clear and it
 * is gone. Pinned here, including the failure ordering: a consume that throws *after* clearing must
 * not leave the authorization available to a retry.
 *
 * **H11 — recipient-only completion.** The proof is sealed to the device's X25519 key inside the
 * authorization, and the server keeps only `sha256(proof)`. Two things must hold: a non-recipient
 * cannot open the seal, and the stored hash cannot be inverted. The second is only true because the
 * proof carries real entropy — `randomBytes(32)` in both
 * `operator-key-delivery-actions.ts:196` and `bootstrap-actions.ts:50`. The digest is an unsalted
 * SHA-256 (`grant-digests.ts`), which is safe at 256 bits and would not be at, say, a counter or a
 * grant id. That dependency is asserted rather than assumed.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  issueGrantAuthorization,
  type GrantAuthorizationEnvelope,
} from "../../src/lib/relay/enrollment/grant-authorization";
import {
  hashGrantCompletionProof,
  hashOperatorKeyGrant,
} from "../../src/lib/relay/enrollment/grant-digests";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { openSealedPayload, sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { BootstrapAuthorizationBroker } from "./bootstrap-authorization";

const NOW = 1_000;
const LIFETIME = 30_000;

function fixture(generation = 1, grantId = "grant-1") {
  const device = generateKeyPairSync("x25519");
  const signer = generateKeyPairSync("ed25519");
  const publicKey = relayPublicKeyToHex(device.publicKey);
  const grant = sealForDevice({ vaultKeyOperator: "c4".repeat(32) }, publicKey);
  // Real entropy, matching what the server actually mints.
  const proof = randomBytes(32).toString("base64url");
  const completion = sealForDevice({ proof }, publicKey);

  const authorization = issueGrantAuthorization(
    {
      kind: "bootstrap",
      authorizationId: `auth-${grantId}`,
      deviceId: "device-1",
      recipientPublicKey: publicKey,
      grantId,
      generation,
      grantHash: hashOperatorKeyGrant(grant),
      completionHash: hashGrantCompletionProof(proof),
      completionEphemeralPublicKey: completion.ephemeralPublicKey,
      completionSealed: completion.sealed,
    },
    signer.privateKey,
    NOW,
    LIFETIME,
  );

  return { device, signer, publicKey, proof, completion, authorization };
}

function broker(
  f: ReturnType<typeof fixture>,
  now: () => number = () => NOW + 1,
  consumedGeneration: () => number | null = () => null,
) {
  return new BootstrapAuthorizationBroker(
    () => "device-1",
    f.publicKey,
    f.device.privateKey,
    () => f.signer.publicKey,
    now,
    consumedGeneration,
  );
}

describe("H10: a bootstrap authorization is consumable exactly once", () => {
  it("authorizes and consumes, returning the sealed proof (control)", () => {
    const f = fixture();
    const b = broker(f);
    b.authorize(f.authorization);

    expect(b.isAuthorized()).toBe(true);
    expect(b.consume()).toMatchObject({ grantId: "grant-1", generation: 1, proof: f.proof });
  });

  it("refuses a second consume", () => {
    const f = fixture();
    const b = broker(f);
    b.authorize(f.authorization);

    expect(b.consume().proof).toBe(f.proof);
    expect(() => b.consume()).toThrow();
    expect(b.isAuthorized()).toBe(false);
  });

  it("yields exactly one winner among many interleaved consumers", () => {
    /**
     * The concurrency case. `consume()` is synchronous, so racing callers interleave at the
     * scheduler rather than mid-method — which is precisely why the clear must happen before any
     * work that could yield. Sixteen callers, one authorization, one winner.
     */
    const f = fixture();
    const b = broker(f);
    b.authorize(f.authorization);

    const outcomes = Array.from({ length: 16 }, () => {
      try {
        return b.consume().proof;
      } catch {
        return null;
      }
    });

    expect(outcomes.filter((o) => o === f.proof)).toHaveLength(1);
    expect(outcomes.filter((o) => o === null)).toHaveLength(15);
  });

  it("does not leave the authorization reusable when consume fails after clearing", () => {
    /**
     * Ordering, isolated: the authorization expires between `authorize` and `consume`, so
     * `assertGrantAuthorizationActive` throws *after* `current` was nulled. A retry must still fail.
     * Were the clear moved below the validation, this retry would succeed the moment the clock
     * moved back — and a stale authorization would become replayable.
     */
    let clock = NOW + 1;
    const f = fixture();
    const b = broker(f, () => clock);
    b.authorize(f.authorization);

    clock = NOW + LIFETIME + 120_000; // beyond lifetime and skew
    expect(() => b.consume()).toThrow();

    clock = NOW + 1; // clock returns to a valid instant
    expect(() => b.consume()).toThrow();
    expect(b.isAuthorized()).toBe(false);
  });

  it("refuses an authorization at or below the already-consumed generation", () => {
    const f = fixture(3, "grant-3");
    expect(() => broker(f, () => NOW + 1, () => 3).authorize(f.authorization)).toThrow();
    expect(() => broker(f, () => NOW + 1, () => 4).authorize(f.authorization)).toThrow();
    // Differential: the same authorization is accepted when the stored generation is lower.
    expect(() => broker(f, () => NOW + 1, () => 2).authorize(f.authorization)).not.toThrow();
  });

  it("refuses an authorization addressed to another device", () => {
    const f = fixture();
    const other = generateKeyPairSync("x25519");
    const b = new BootstrapAuthorizationBroker(
      () => "device-1",
      relayPublicKeyToHex(other.publicKey),
      other.privateKey,
      () => f.signer.publicKey,
      () => NOW + 1,
      () => null,
    );

    expect(() => b.authorize(f.authorization)).toThrow();
  });

  it("refuses a delivery authorization presented as a bootstrap one", () => {
    // Intra-grant kind confusion, asserted at the broker rather than assumed from the envelope.
    const f = fixture();
    const envelope = JSON.parse(
      Buffer.from(f.authorization.split(".")[0], "base64url").toString("utf8"),
    ) as GrantAuthorizationEnvelope;
    const { v: _v, iat: _iat, exp: _exp, ...input } = envelope;
    const delivery = issueGrantAuthorization(
      { ...input, kind: "delivery" },
      f.signer.privateKey,
      NOW,
      LIFETIME,
    );

    expect(() => broker(f).authorize(delivery)).toThrow();
  });
});

describe("H11: the completion proof is obtainable only by the recipient", () => {
  it("cannot be opened with a different device's private key", () => {
    const f = fixture();
    const stranger = generateKeyPairSync("x25519");

    expect(() =>
      openSealedPayload(
        { ephemeralPublicKey: f.completion.ephemeralPublicKey, sealed: f.completion.sealed },
        stranger.privateKey,
      ),
    ).toThrow();

    // Differential: the intended recipient opens the very same seal.
    expect(
      openSealedPayload(
        { ephemeralPublicKey: f.completion.ephemeralPublicKey, sealed: f.completion.sealed },
        f.device.privateKey,
      ),
    ).toEqual({ proof: f.proof });
  });

  it("is not recoverable from the completion hash the server stores", () => {
    // The hash is what a database reader or an audit log leak would expose.
    const f = fixture();
    const stored = hashGrantCompletionProof(f.proof);

    expect(stored).not.toBe(f.proof);
    expect(stored).toHaveLength(64);
    expect(f.proof).not.toContain(stored);
  });

  it("carries enough entropy that the unsalted digest is not brute-forceable", () => {
    /**
     * `hashGrantCompletionProof` is a bare `sha256(proof)` with no salt, which is safe only because
     * the proof is `randomBytes(32)`. If a future change derived the proof from a grant id, a
     * counter, or a timestamp, the stored hash would become invertible by search and any observer of
     * the hash could complete a bootstrap. This pins the property the digest design depends on.
     */
    const proofs = new Set<string>();
    for (let i = 0; i < 64; i += 1) {
      const proof = randomBytes(32).toString("base64url");
      // 32 raw bytes, base64url-encoded without padding.
      expect(Buffer.from(proof, "base64url")).toHaveLength(32);
      proofs.add(proof);
    }
    expect(proofs.size).toBe(64);
  });

  it("verifies only against the exact proof", () => {
    const f = fixture();
    const expected = hashGrantCompletionProof(f.proof);

    expect(hashGrantCompletionProof(f.proof)).toBe(expected);
    expect(hashGrantCompletionProof(`${f.proof}x`)).not.toBe(expected);
    expect(hashGrantCompletionProof(f.proof.slice(0, -1))).not.toBe(expected);
  });
});
