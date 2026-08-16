/**
 * Phase 01 / H14: is a device-retirement authorization bound to the device it names?
 *
 * Retirement is the one destructive operation the relay performs on itself: it erases the device
 * private key, the operator domain key and the operator grant state. An authorization that one
 * relay accepts on another relay's behalf is cross-device destruction — the highest-impact failure
 * in the retirement protocol, and the reason this is tested at the consumer rather than at
 * `verifyDeviceRetirementAuthorization`, which is a pure signature/shape verifier and cannot know
 * which machine is running it.
 *
 * Every case is **differential** on a single variable: the same fixture, one field changed, and the
 * assertion is not merely "it threw" but "it threw *and the secrets are still there*". A rejection
 * that still erased the credentials would be a failure dressed as a pass, and a boolean on the throw
 * alone would not distinguish the two.
 *
 * Existing `device-retirement.test.ts` covers the happy path, crash resume, and read-back failures.
 * It does not vary the identity, which is the gap this file closes.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { issueDeviceRetirementAuthorization } from "../../src/lib/relay/retirement/device-retirement-authorization";
import {
  generateRelayDeviceKeyPair,
  relayPrivateKeyToKeyObject,
} from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { retireLocalRelayDevice, type ActiveRetirementIdentity } from "./device-retirement";
import { readDeviceRetirementReceipt } from "./device-retirement-receipt";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { CONFIG_FILE, DEVICE_KEY_FILE } from "./relay-home";
import { RELAY_SECURITY_STATE_FILE } from "./relay-security-state";
import { RELAY_SECRET_NAMES } from "./secure-store";

const homes: string[] = [];
const serverKeys = generateKeyPairSync("ed25519");
const NOW = 2_000;

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function ed25519PublicHex(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): string {
  const jwk = key.export({ format: "jwk" }) as { x: string };
  return Buffer.from(jwk.x, "base64url").toString("hex");
}

/**
 * A relay that is enrolled, holds live secrets, and has a valid authorization waiting for it.
 * `overrides` perturb exactly one aspect of the binding so each test isolates one variable.
 */
function fixture(
  overrides: {
    authorizationDeviceId?: string;
    authorizationRecipientKey?: string;
    sealCompletionTo?: string;
    completionProof?: string;
    signWith?: ReturnType<typeof generateKeyPairSync>["privateKey"];
  } = {},
) {
  const home = mkdtempSync(path.join(os.tmpdir(), "mkt-relay-binding-"));
  homes.push(home);

  const device = generateRelayDeviceKeyPair();
  const proof = "retirement-proof";
  const completion = sealForDevice(
    { proof: overrides.completionProof ?? proof },
    overrides.sealCompletionTo ?? device.publicKeyHex,
  );
  const finalizationKeys = generateKeyPairSync("ed25519");

  const authorization = issueDeviceRetirementAuthorization(
    {
      authorizationId: "authorization-1",
      retirementId: "retirement-1",
      deviceId: overrides.authorizationDeviceId ?? "device-1",
      recipientPublicKey: overrides.authorizationRecipientKey ?? device.publicKeyHex,
      completionHash: createHash("sha256").update(proof, "utf8").digest("hex"),
      completionEphemeralPublicKey: completion.ephemeralPublicKey,
      completionSealed: completion.sealed,
      finalizationPublicKey: ed25519PublicHex(finalizationKeys.publicKey),
    },
    overrides.signWith ?? serverKeys.privateKey,
    1_000,
    30_000,
  );

  const store = new InMemorySecureStore({
    [RELAY_SECRET_NAMES.devicePrivateKey]: device.privateKeyHex,
    [RELAY_SECRET_NAMES.operatorDomainKey]: "aa".repeat(32),
    [RELAY_SECRET_NAMES.operatorGrantState]: JSON.stringify({ operatorKey: "bb".repeat(32) }),
  });
  writeFileSync(path.join(home, CONFIG_FILE), '{"deviceId":"device-1"}\n', "utf8");
  writeFileSync(path.join(home, DEVICE_KEY_FILE), '{"privateKeyLocation":"protected"}\n', "utf8");
  writeFileSync(path.join(home, RELAY_SECURITY_STATE_FILE), '{"schemaVersion":1}\n', "utf8");

  const activeIdentity: ActiveRetirementIdentity = {
    deviceId: "device-1",
    devicePublicKey: device.publicKeyHex,
    devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
    serverPublicKey: serverKeys.publicKey,
    webOrigin: "https://mkttool.example.com",
  };

  return { authorization, device, home, store, activeIdentity, proof };
}

function retire(f: ReturnType<typeof fixture>, identity?: Partial<ActiveRetirementIdentity>) {
  return retireLocalRelayDevice(f.authorization, {
    home: f.home,
    secureStore: f.store,
    now: () => NOW,
    activeIdentity: { ...f.activeIdentity, ...identity },
  });
}

/** The security-relevant post-condition: nothing was destroyed. */
function secretsIntact(f: ReturnType<typeof fixture>): boolean {
  return (
    f.store.read(RELAY_SECRET_NAMES.devicePrivateKey) !== null &&
    f.store.read(RELAY_SECRET_NAMES.operatorDomainKey) !== null &&
    f.store.read(RELAY_SECRET_NAMES.operatorGrantState) !== null
  );
}

describe("H14: control — a correctly bound authorization does retire the device", () => {
  it("erases every identity-bearing secret", () => {
    // Without this, every rejection below could be passing for an unrelated reason.
    const f = fixture();
    expect(secretsIntact(f)).toBe(true);

    const result = retire(f);

    expect(result).toMatchObject({ retirementId: "retirement-1", cleanupComplete: true });
    expect(secretsIntact(f)).toBe(false);
  });
});

describe("H14: device identity binding", () => {
  it("refuses an authorization naming a different device, and destroys nothing", () => {
    // The core case: device-2's retirement order presented to device-1.
    const f = fixture({ authorizationDeviceId: "device-2" });

    expect(() => retire(f)).toThrow();
    expect(secretsIntact(f)).toBe(true);
    expect(readDeviceRetirementReceipt(f.store)).toBeNull();
  });

  it("refuses when the running relay's identity names a different device", () => {
    // Same authorization, perturbed from the other side — the relay claims to be device-2.
    const f = fixture();

    expect(() => retire(f, { deviceId: "device-2" })).toThrow();
    expect(secretsIntact(f)).toBe(true);
  });

  it("refuses an authorization addressed to another device's public key", () => {
    const other = generateRelayDeviceKeyPair();
    const f = fixture({ authorizationRecipientKey: other.publicKeyHex });

    expect(() => retire(f)).toThrow();
    expect(secretsIntact(f)).toBe(true);
  });

  it("refuses when the relay presents a public key the authorization does not name", () => {
    const other = generateRelayDeviceKeyPair();
    const f = fixture();

    expect(() => retire(f, { devicePublicKey: other.publicKeyHex })).toThrow();
    expect(secretsIntact(f)).toBe(true);
  });
});

describe("H14: server authority binding", () => {
  it("refuses an authorization signed by a key the relay does not trust", () => {
    const attackerKeys = generateKeyPairSync("ed25519");
    const f = fixture({ signWith: attackerKeys.privateKey });

    expect(() => retire(f)).toThrow();
    expect(secretsIntact(f)).toBe(true);
  });

  it("refuses when the relay trusts a different server key (differential)", () => {
    // Same authorization, genuinely server-signed; only the relay's pinned key differs.
    const otherServer = generateKeyPairSync("ed25519");
    const f = fixture();

    expect(() => retire(f, { serverPublicKey: otherServer.publicKey })).toThrow();
    expect(secretsIntact(f)).toBe(true);

    // ...and it succeeds with the correct pinned key, so the throw is attributable to the key.
    expect(retire(f)).toMatchObject({ cleanupComplete: true });
    expect(secretsIntact(f)).toBe(false);
  });
});

describe("H14: completion proof binding", () => {
  it("refuses an authorization whose completion is sealed to another device", () => {
    // The relay cannot open it, so it cannot produce the proof the server will demand back.
    const other = generateRelayDeviceKeyPair();
    const f = fixture({ sealCompletionTo: other.publicKeyHex });

    expect(() => retire(f)).toThrow();
    expect(secretsIntact(f)).toBe(true);
  });

  it("refuses an authorization whose completion hash does not match the sealed proof", () => {
    // The hash is signed by the server; the sealed proof is not. A mismatch means one of the two
    // was substituted, and neither is safe to act on.
    const f = fixture({ completionProof: "a-different-proof" });

    expect(() => retire(f)).toThrow();
    expect(secretsIntact(f)).toBe(true);
  });
});
