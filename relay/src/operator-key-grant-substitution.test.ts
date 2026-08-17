/**
 * Phase 01 / H09 + H12: is a delivered operator-key grant bound to *this* authorization and *this*
 * device, and can an old generation be replayed?
 *
 * `handleReceiveOperatorKey` accepts two independent values in one request body — a signed
 * `authorization` and an unsigned, sealed `grant`. Only the authorization carries a signature. The
 * `grantHash` comparison is therefore the *only* thing tying the sealed blob to the authority that
 * approved it: without it, a valid authorization can be paired with a different sealed grant, and
 * the relay stores an operator key nobody authorized.
 *
 * That check had no coverage. Disabling `grantHash !== authorization.grantHash` outright left all 11
 * tests in `handle-receive-operator-key.test.ts` green, while disabling the device binding turned 1
 * red and the generation guard turned 2 red. So the sibling guards were verified and this one was
 * not — the gap this file closes.
 *
 * H09 (generation replay) and H12 (device binding) are covered by that existing suite and were
 * confirmed load-bearing by the same sabotage. They are re-asserted here only where doing so
 * isolates a single variable, since the existing test bundles four concerns into one case.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueGrantAuthorization } from "../../src/lib/relay/enrollment/grant-authorization";
import {
  hashGrantCompletionProof,
  hashOperatorKeyGrant,
} from "../../src/lib/relay/enrollment/grant-digests";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { handleReceiveOperatorKey } from "./handle-receive-operator-key";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { readOperatorGrantState } from "./operator-grant-state";
import type { IncomingMessage } from "node:http";

const AUTHORIZED_KEY = "c4".repeat(32);
const ATTACKER_KEY = "9e".repeat(32);
const ORIGIN = "https://app.example";

function fixture(now = 1_000, generation = 1, grantId = "grant-1") {
  const device = generateKeyPairSync("x25519");
  const signer = generateKeyPairSync("ed25519");
  const publicKey = relayPublicKeyToHex(device.publicKey);
  const grant = sealForDevice({ vaultKeyOperator: AUTHORIZED_KEY }, publicKey);
  const proof = `proof-${grantId}`;
  const completion = sealForDevice({ proof }, publicKey);
  const authorization = issueGrantAuthorization(
    {
      kind: "delivery",
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
    now,
    30_000,
  );
  return { device, signer, publicKey, grant, proof, authorization, now };
}

type Fixture = ReturnType<typeof fixture>;

function deliver(
  f: Fixture,
  store = new InMemorySecureStore(),
  body: { grant?: unknown; authorization?: string } = {},
) {
  const request = { headers: { origin: ORIGIN } } as IncomingMessage;
  return handleReceiveOperatorKey(
    request,
    JSON.stringify({ grant: body.grant ?? f.grant, authorization: body.authorization ?? f.authorization }),
    {
      allowedOrigin: ORIGIN,
      deviceId: "device-1",
      devicePublicKey: f.publicKey,
      devicePrivateKey: f.device.privateKey,
      serverPublicKey: f.signer.publicKey,
      secureStore: store,
      now: () => f.now + 1,
      onConfigured: () => ({ ok: true, message: "ready" }),
    },
  );
}

describe("H12: the sealed grant is bound to the authorization that approved it", () => {
  it("accepts the grant the authorization names (control)", () => {
    const f = fixture();
    const store = new InMemorySecureStore();

    expect(deliver(f, store).ok).toBe(true);
    expect(readOperatorGrantState(store)?.operatorKey).toBe(AUTHORIZED_KEY);
  });

  it("refuses a substituted grant carrying a different operator key", () => {
    /**
     * The attack the `grantHash` check exists to stop. The authorization is genuine, signed, unexpired
     * and correctly addressed; only the sealed blob is swapped for one the attacker chose — sealed to
     * the same device, so it opens perfectly.
     *
     * Differential and stated as a value, not a boolean: if this were accepted the relay would hold
     * ATTACKER_KEY as its operator key, which is materially worse than "the call returned false".
     */
    const f = fixture();
    const store = new InMemorySecureStore();
    const substituted = sealForDevice({ vaultKeyOperator: ATTACKER_KEY }, f.publicKey);

    expect(hashOperatorKeyGrant(substituted)).not.toBe(hashOperatorKeyGrant(f.grant));

    const result = deliver(f, store, { grant: substituted });

    expect(result.ok).toBe(false);
    expect(readOperatorGrantState(store)).toBeNull();
  });

  it("refuses a grant resealed from the same plaintext under a fresh ephemeral key", () => {
    // Even an honest-looking reseal of the *correct* key must fail: the hash covers the ciphertext,
    // so any re-encryption is a different grant. Guards against a hash over plaintext instead.
    const f = fixture();
    const store = new InMemorySecureStore();
    const resealed = sealForDevice({ vaultKeyOperator: AUTHORIZED_KEY }, f.publicKey);

    expect(resealed.sealed).not.toBe(f.grant.sealed);
    expect(deliver(f, store, { grant: resealed }).ok).toBe(false);
    expect(readOperatorGrantState(store)).toBeNull();
  });

  it("refuses a grant whose ciphertext was altered in place", () => {
    const f = fixture();
    const store = new InMemorySecureStore();
    const tampered = { ...f.grant, sealed: `${f.grant.sealed}0` };

    expect(deliver(f, store, { grant: tampered }).ok).toBe(false);
    expect(readOperatorGrantState(store)).toBeNull();
  });

  it("refuses a grant whose ephemeral key was swapped for another grant's", () => {
    // `hashOperatorKeyGrant` covers ephemeralPublicKey *and* sealed; both halves must be bound.
    const f = fixture();
    const store = new InMemorySecureStore();
    const other = sealForDevice({ vaultKeyOperator: AUTHORIZED_KEY }, f.publicKey);

    expect(
      deliver(f, store, { grant: { ...f.grant, ephemeralPublicKey: other.ephemeralPublicKey } }).ok,
    ).toBe(false);
    expect(readOperatorGrantState(store)).toBeNull();
  });

  it("refuses a grant paired with another authorization (cross-pairing)", () => {
    // Two legitimate deliveries; each half is genuine but they belong to different grants.
    const first = fixture(1_000, 1, "grant-1");
    const second = fixture(1_000, 1, "grant-2");
    const store = new InMemorySecureStore();

    expect(deliver(first, store, { grant: second.grant }).ok).toBe(false);
    expect(readOperatorGrantState(store)).toBeNull();
  });
});

describe("H09: generation is strictly monotonic", () => {
  it("refuses a replay of the generation already stored", () => {
    // Isolated to one variable: same device, same everything, generation not advanced.
    const f = fixture(1_000, 2, "grant-2");
    const store = new InMemorySecureStore();
    expect(deliver(f, store).ok).toBe(true);

    const replay = fixture(1_000, 2, "grant-replay");
    const rebound = rebind(replay, f);
    expect(deliver(rebound, store).ok).toBe(false);
    expect(readOperatorGrantState(store)?.grantId).toBe("grant-2");
  });

  it("refuses an older generation after a newer one is stored", () => {
    const f = fixture(1_000, 5, "grant-5");
    const store = new InMemorySecureStore();
    expect(deliver(f, store).ok).toBe(true);

    const older = rebind(fixture(1_000, 4, "grant-4"), f);
    expect(deliver(older, store).ok).toBe(false);
    expect(readOperatorGrantState(store)?.generation).toBe(5);
  });

  it("accepts a strictly newer generation (differential)", () => {
    // The same shape as the two rejections above, differing only in the generation number.
    const f = fixture(1_000, 5, "grant-5");
    const store = new InMemorySecureStore();
    expect(deliver(f, store).ok).toBe(true);

    const newer = rebind(fixture(1_000, 6, "grant-6"), f);
    expect(deliver(newer, store).ok).toBe(true);
    expect(readOperatorGrantState(store)?.generation).toBe(6);
  });
});

/**
 * Re-issue `next`'s authorization against `base`'s device and signer, so generation is the only
 * thing that differs. Without this, a second `fixture()` would also bring a new device key and the
 * rejection could be attributed to the device binding instead.
 */
function rebind(next: Fixture, base: Fixture): Fixture {
  const envelope = JSON.parse(
    Buffer.from(next.authorization.split(".")[0], "base64url").toString("utf8"),
  ) as Record<string, unknown>;

  const grant = sealForDevice({ vaultKeyOperator: AUTHORIZED_KEY }, base.publicKey);
  const proof = String(envelope.grantId);
  const completion = sealForDevice({ proof }, base.publicKey);

  const authorization = issueGrantAuthorization(
    {
      kind: "delivery",
      authorizationId: String(envelope.authorizationId),
      deviceId: "device-1",
      recipientPublicKey: base.publicKey,
      grantId: String(envelope.grantId),
      generation: Number(envelope.generation),
      grantHash: hashOperatorKeyGrant(grant),
      completionHash: hashGrantCompletionProof(proof),
      completionEphemeralPublicKey: completion.ephemeralPublicKey,
      completionSealed: completion.sealed,
    },
    base.signer.privateKey,
    base.now,
    30_000,
  );

  return { ...base, grant, proof, authorization };
}
