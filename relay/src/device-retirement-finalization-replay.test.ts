/**
 * Phase 01 / H13: is retirement finalization idempotent, and is it replayable?
 *
 * Finalization is the last step of device retirement: the relay has already erased its credentials
 * and holds only a DPAPI-protected receipt. Presenting a server-issued finalization retires the
 * receipt and writes the retirement guard. Two failure shapes:
 *
 *  1. **Not idempotent.** Cleanup retry is the normal case here — the operator reruns finalization
 *     because the first attempt's response was lost, not because anything is wrong. If the second
 *     call throws or half-completes, a retry strands the machine mid-retirement.
 *
 *  2. **Replayable across retirements.** The finalization envelope names a `retirementId` and a
 *     `deviceId`. If those are not matched against the stored receipt, a finalization captured from
 *     one retirement completes a different one.
 *
 * The design under test is unusual and worth stating: each retirement mints its **own one-use
 * signing key** (`device-retirement-finalization-key.ts`), so the server signing key cannot reach
 * this verifier at all. That is the separation-by-key property the cross-protocol matrix records as
 * absent from the other three protocols, so it is asserted here rather than assumed.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { signingKeysFromSeed } = await import("../../src/lib/tickets/server-signing-key");
const { issueDeviceRetirementFinalization } = await import(
  "../../src/lib/relay/retirement/device-retirement-finalization"
);
const { InMemorySecureStore } = await import("./in-memory-secure-store");
const { writeDeviceRetirementReceipt, readDeviceRetirementReceipt, finalizeLocalDeviceRetirement } =
  await import("./device-retirement-receipt");

const finalizationKeys = signingKeysFromSeed(randomBytes(32));
const serverKeys = signingKeysFromSeed(randomBytes(32));

const RETIREMENT = {
  authorizationId: "auth-1",
  retirementId: "retire-1",
  deviceId: "device-1",
  recipientPublicKey: "aa".repeat(32),
  completionHash: "bb".repeat(32),
};

let home: string;
let store: InstanceType<typeof InMemorySecureStore>;

function cleanedReceipt() {
  return {
    v: 1 as const,
    stage: "cleaned" as const,
    authorization: "signed-authorization-placeholder",
    proof: "proof-placeholder",
    serverPublicKeyHex: serverKeys.publicKeyHex,
    finalizationPublicKeyHex: finalizationKeys.publicKeyHex,
    webOrigin: "https://example.invalid",
    ...RETIREMENT,
  };
}

function finalization(overrides: Partial<typeof RETIREMENT> = {}, key = finalizationKeys.privateKey) {
  return issueDeviceRetirementFinalization({ ...RETIREMENT, ...overrides }, key, Date.now());
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "mkt-retire-"));
  store = new InMemorySecureStore();
  writeDeviceRetirementReceipt(store, cleanedReceipt());
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("H13: idempotence", () => {
  it("finalizes once and reports success (control)", () => {
    expect(finalizeLocalDeviceRetirement(finalization(), store, home)).toBe(true);
    expect(readDeviceRetirementReceipt(store)).toBeNull();
  });

  it("is safe to retry after success, reporting no work rather than throwing", () => {
    const signed = finalization();
    expect(finalizeLocalDeviceRetirement(signed, store, home)).toBe(true);

    // The retry case this design exists for: the operator reruns because the reply was lost.
    expect(() => finalizeLocalDeviceRetirement(signed, store, home)).not.toThrow();
    expect(finalizeLocalDeviceRetirement(signed, store, home)).toBe(false);
  });

  it("does not resurrect a receipt on replay", () => {
    finalizeLocalDeviceRetirement(finalization(), store, home);
    finalizeLocalDeviceRetirement(finalization(), store, home);
    expect(readDeviceRetirementReceipt(store)).toBeNull();
  });
});

describe("H13: replay across retirements", () => {
  it("refuses a finalization naming a different retirement", () => {
    // Differential: identical in every field except the one under test.
    expect(finalizeLocalDeviceRetirement(finalization({ retirementId: "retire-2" }), store, home)).toBe(
      false,
    );
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
    expect(finalizeLocalDeviceRetirement(finalization(), store, home)).toBe(true);
  });

  it("refuses a finalization naming a different device", () => {
    expect(finalizeLocalDeviceRetirement(finalization({ deviceId: "device-2" }), store, home)).toBe(
      false,
    );
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });

  it("refuses a finalization naming a different recipient key", () => {
    expect(
      finalizeLocalDeviceRetirement(finalization({ recipientPublicKey: "cc".repeat(32) }), store, home),
    ).toBe(false);
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });

  it("refuses a finalization carrying a different completion hash", () => {
    expect(
      finalizeLocalDeviceRetirement(finalization({ completionHash: "dd".repeat(32) }), store, home),
    ).toBe(false);
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });
});

describe("H13: separation by key", () => {
  it("refuses a finalization signed by the server key instead of the one-use key", () => {
    /**
     * The property that makes this protocol structurally safer than the other three: no
     * server-signed artifact can reach this verifier, because the verifier's key is minted per
     * retirement. Asserted so a future refactor toward the shared server key is caught here.
     */
    expect(() =>
      finalizeLocalDeviceRetirement(finalization({}, serverKeys.privateKey), store, home),
    ).toThrow();
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });

  it("refuses a finalization signed by another retirement's one-use key", () => {
    const otherRetirement = signingKeysFromSeed(randomBytes(32));
    expect(() =>
      finalizeLocalDeviceRetirement(finalization({}, otherRetirement.privateKey), store, home),
    ).toThrow();
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });

  it("refuses a finalization whose signature has been tampered with", () => {
    const signed = finalization();
    const [encoded, signature] = signed.split(".");
    const flipped = Buffer.from(signature, "base64url");
    flipped[0] ^= 0x01;

    expect(() =>
      finalizeLocalDeviceRetirement(
        `${encoded}.${flipped.toString("base64url")}`,
        store,
        home,
      ),
    ).toThrow();
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });
});

describe("H13: stage gating", () => {
  it("refuses to finalize a receipt still in the prepared stage", () => {
    // Finalizing before cleanup completed would retire the receipt while credentials still exist.
    store = new InMemorySecureStore();
    writeDeviceRetirementReceipt(store, { ...cleanedReceipt(), stage: "prepared" });

    expect(finalizeLocalDeviceRetirement(finalization(), store, home)).toBe(false);
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });

  it("reports no work when there is no receipt at all", () => {
    store = new InMemorySecureStore();
    expect(finalizeLocalDeviceRetirement(finalization(), store, home)).toBe(false);
  });
});
