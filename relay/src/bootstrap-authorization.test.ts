import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GRANT_AUTHORIZATION_CLOCK_SKEW_MS,
  issueGrantAuthorization,
} from "../../src/lib/relay/enrollment/grant-authorization";
import { hashGrantCompletionProof } from "../../src/lib/relay/enrollment/grant-digests";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { BootstrapAuthorizationBroker } from "./bootstrap-authorization";

function fixture(now = 1_000) {
  const device = generateKeyPairSync("x25519");
  const signer = generateKeyPairSync("ed25519");
  const publicKey = relayPublicKeyToHex(device.publicKey);
  const proof = "bootstrap-proof";
  const completion = sealForDevice({ proof }, publicKey);
  const authorization = issueGrantAuthorization({
    kind: "bootstrap", authorizationId: "bootstrap-1", deviceId: "device-1",
    recipientPublicKey: publicKey, grantId: "bootstrap-1", generation: 1,
    grantHash: "aa".repeat(32), completionHash: hashGrantCompletionProof(proof),
    completionEphemeralPublicKey: completion.ephemeralPublicKey, completionSealed: completion.sealed,
  }, signer.privateKey, now, 300_000);
  return { device, signer, publicKey, proof, authorization, now };
}

describe("BootstrapAuthorizationBroker", () => {
  it("accepts one recipient-bound authorization and consumes it once", () => {
    const f = fixture();
    const broker = new BootstrapAuthorizationBroker(() => "device-1", f.publicKey, f.device.privateKey, () => f.signer.publicKey, () => f.now + 1);
    broker.authorize(f.authorization);
    expect(broker.isAuthorized()).toBe(true);
    expect(broker.consume()).toMatchObject({ grantId: "bootstrap-1", proof: f.proof });
    expect(() => broker.consume()).toThrow(/missing/i);
  });

  it("rejects wrong recipient and expiry", () => {
    const f = fixture();
    const wrong = new BootstrapAuthorizationBroker(() => "other", f.publicKey, f.device.privateKey, () => f.signer.publicKey, () => f.now + 1);
    expect(() => wrong.authorize(f.authorization)).toThrow(/different device/i);
    const expired = new BootstrapAuthorizationBroker(
      () => "device-1", f.publicKey, f.device.privateKey, () => f.signer.publicKey,
      () => f.now + 300_000 + GRANT_AUTHORIZATION_CLOCK_SKEW_MS,
    );
    expect(() => expired.authorize(f.authorization)).toThrow(/expired/i);
  });

  it("accepts a bootstrap authorization across the bounded Windows clock-skew window", () => {
    const f = fixture(60_000);
    const broker = new BootstrapAuthorizationBroker(
      () => "device-1", f.publicKey, f.device.privateKey, () => f.signer.publicKey, () => 0,
    );
    broker.authorize(f.authorization);
    expect(broker.isAuthorized()).toBe(true);
  });

  it("rejects an authorization whose generation is already stored", () => {
    const f = fixture();
    const consumed = new BootstrapAuthorizationBroker(
      () => "device-1", f.publicKey, f.device.privateKey, () => f.signer.publicKey,
      () => f.now + 1, () => 1,
    );
    expect(() => consumed.authorize(f.authorization)).toThrow(/consumed/i);
  });
});
