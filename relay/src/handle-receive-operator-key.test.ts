import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  GRANT_AUTHORIZATION_CLOCK_SKEW_MS,
  issueGrantAuthorization,
} from "../../src/lib/relay/enrollment/grant-authorization";
import { hashGrantCompletionProof, hashOperatorKeyGrant } from "../../src/lib/relay/enrollment/grant-digests";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { handleReceiveOperatorKey } from "./handle-receive-operator-key";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { readOperatorGrantState } from "./operator-grant-state";
import { RELAY_SECRET_NAMES } from "./secure-store";
import type { IncomingMessage } from "node:http";

const OPERATOR_KEY = "c4".repeat(32);

function fixture(now = 1_000, generation = 1, grantId = "grant-1") {
  const device = generateKeyPairSync("x25519");
  const signer = generateKeyPairSync("ed25519");
  const publicKey = relayPublicKeyToHex(device.publicKey);
  const grant = sealForDevice({ vaultKeyOperator: OPERATOR_KEY }, publicKey);
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

function deliver(f: ReturnType<typeof fixture>, store = new InMemorySecureStore(), overrides = {}) {
  const request = { headers: { origin: "https://app.example" } } as IncomingMessage;
  return handleReceiveOperatorKey(request, JSON.stringify({ grant: f.grant, authorization: f.authorization }), {
    allowedOrigin: "https://app.example",
    deviceId: "device-1",
    devicePublicKey: f.publicKey,
    devicePrivateKey: f.device.privateKey,
    serverPublicKey: f.signer.publicKey,
    secureStore: store,
    now: () => f.now + 1,
    onConfigured: () => ({ ok: true, message: "ready" }),
    ...overrides,
  });
}

describe("operator key delivery", () => {
  it("atomically stores key, generation, grant ID, and proof", () => {
    const f = fixture();
    const store = new InMemorySecureStore({
      [RELAY_SECRET_NAMES.operatorDomainKey]: "a1".repeat(32),
    });
    expect(deliver(f, store)).toMatchObject({ ok: true, proof: f.proof, generation: 1 });
    expect(readOperatorGrantState(store)).toMatchObject({
      operatorKey: OPERATOR_KEY,
      generation: 1,
      grantId: "grant-1",
      completionProof: f.proof,
    });
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();
  });

  it("returns the cached proof after response loss, page reload, or Relay restart", () => {
    const f = fixture();
    const store = new InMemorySecureStore();
    expect(() => deliver(f, store, { afterStore: () => { throw new Error("lost response"); } })).toThrow();
    const write = vi.spyOn(store, "write");
    store.write(RELAY_SECRET_NAMES.operatorDomainKey, "a1".repeat(32));
    write.mockClear();
    expect(deliver(f, store)).toMatchObject({ ok: true, proof: f.proof });
    expect(deliver(f, store, { now: () => f.now + 30_000 })).toMatchObject({ ok: true, proof: f.proof });
    expect(deliver(f, store)).toMatchObject({ ok: true, proof: f.proof });
    expect(write).not.toHaveBeenCalled();
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();
  });

  it("keeps the legacy key when grant-state read-back verification fails", () => {
    const f = fixture();
    const store = new InMemorySecureStore({
      [RELAY_SECRET_NAMES.operatorDomainKey]: "a1".repeat(32),
    });
    const read = store.read.bind(store);
    vi.spyOn(store, "read").mockImplementation((name) => {
      const value = read(name);
      return name === RELAY_SECRET_NAMES.operatorGrantState && value ? "corrupt" : value;
    });

    expect(() => deliver(f, store)).toThrow(/read-back verification/i);
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe("a1".repeat(32));
  });

  it("keeps committed grant state and retries legacy cleanup after a removal failure", () => {
    const f = fixture();
    const store = new InMemorySecureStore({
      [RELAY_SECRET_NAMES.operatorDomainKey]: "a1".repeat(32),
    });
    const remove = vi.spyOn(store, "remove").mockImplementationOnce(() => {
      throw new Error("remove failed");
    });

    expect(() => deliver(f, store)).toThrow("remove failed");
    expect(readOperatorGrantState(store)).toMatchObject({ grantId: "grant-1", operatorKey: OPERATOR_KEY });
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe("a1".repeat(32));

    expect(deliver(f, store)).toMatchObject({ ok: true, proof: f.proof });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();
  });

  it("returns the cached proof after a simulated reboot with a new secure-store object", () => {
    const f = fixture();
    const before = new InMemorySecureStore();
    expect(deliver(f, before).ok).toBe(true);
    const blob = before.read(RELAY_SECRET_NAMES.operatorGrantState);
    const after = new InMemorySecureStore({ [RELAY_SECRET_NAMES.operatorGrantState]: blob! });
    const write = vi.spyOn(after, "write");
    expect(deliver(f, after, { now: () => f.now + 30_000 })).toMatchObject({ ok: true, proof: f.proof });
    expect(write).not.toHaveBeenCalled();
  });

  it("does not treat a bootstrap record as an exact delivery retry", () => {
    const f = fixture();
    const store = new InMemorySecureStore();
    store.write(RELAY_SECRET_NAMES.operatorGrantState, JSON.stringify({
      v: 1, kind: "bootstrap", operatorKey: OPERATOR_KEY, generation: 1,
      grantId: "grant-1", grantHash: hashOperatorKeyGrant(f.grant), completionProof: "wrong-proof",
    }));
    expect(deliver(f, store)).toMatchObject({ ok: false });
  });

  it("does not mutate storage when the protected write fails", () => {
    const f = fixture();
    const store = new InMemorySecureStore();
    vi.spyOn(store, "write").mockImplementation(() => { throw new Error("store failed"); });
    expect(() => deliver(f, store)).toThrow("store failed");
    expect(readOperatorGrantState(store)).toBeNull();
  });

  it("does not mutate storage when execution stops after proof verification", () => {
    const f = fixture();
    const store = new InMemorySecureStore();
    expect(() => deliver(f, store, { afterProof: () => { throw new Error("fault after proof"); } })).toThrow();
    expect(readOperatorGrantState(store)).toBeNull();
  });

  it("rejects tampering, expiry, wrong recipient, and superseded generations without mutation", () => {
    const f = fixture();
    const store = new InMemorySecureStore();
    const badGrant = { ...f.grant, sealed: `${f.grant.sealed}x` };
    const request = { headers: { origin: "https://app.example" } } as IncomingMessage;
    expect(handleReceiveOperatorKey(request, JSON.stringify({ grant: badGrant, authorization: f.authorization }), {
      allowedOrigin: "https://app.example",
      deviceId: "device-1", devicePublicKey: f.publicKey, devicePrivateKey: f.device.privateKey,
      serverPublicKey: f.signer.publicKey, secureStore: store, onConfigured: () => ({ ok: true, message: "" }),
    }).ok).toBe(false);
    expect(deliver(f, store, {
      now: () => f.now + 30_000 + GRANT_AUTHORIZATION_CLOCK_SKEW_MS,
    }).ok).toBe(false);
    expect(deliver(f, store, { deviceId: "other" }).ok).toBe(false);
    expect(deliver(f, store).ok).toBe(true);
    expect(deliver(fixture(2_000, 1, "conflict"), store).ok).toBe(false);
    expect(readOperatorGrantState(store)?.grantId).toBe("grant-1");
  });

  it("rejects a valid authorization sent by the wrong web origin", () => {
    const f = fixture();
    const request = { headers: { origin: "https://evil.example" } } as IncomingMessage;
    const result = handleReceiveOperatorKey(request, JSON.stringify({ grant: f.grant, authorization: f.authorization }), {
      allowedOrigin: "https://app.example", deviceId: "device-1", devicePublicKey: f.publicKey,
      devicePrivateKey: f.device.privateKey, serverPublicKey: f.signer.publicKey,
      secureStore: new InMemorySecureStore(), onConfigured: () => ({ ok: true, message: "" }),
    });
    expect(result.ok).toBe(false);
  });

  it("accepts bounded clock skew and rejects a first delivery beyond the residual window", () => {
    const f = fixture(10_000);
    expect(deliver(f, new InMemorySecureStore(), { now: () => 39_999 }).ok).toBe(true);
    expect(deliver(f, new InMemorySecureStore(), { now: () => 99_999 }).ok).toBe(true);
    expect(deliver(f, new InMemorySecureStore(), { now: () => 100_000 }).ok).toBe(false);
  });
});
