/**
 * Phase 01 / H15: is the retirement authorization's validity window bounded on both sides?
 *
 * A device-retirement authorization is a destructive capability — presenting it to a relay erases
 * that machine's credentials. Two ways the window can be wrong:
 *
 *  1. **Asymmetric skew.** `DEVICE_RETIREMENT_CLOCK_SKEW_MS` exists to tolerate a relay whose clock
 *     disagrees with the server. Applied to `exp` it is a small, deliberate grace period. Applied to
 *     `iat` it decides whether a *future-dated* authorization is accepted — one minted now but not
 *     meant to be usable yet.
 *
 *  2. **Unbounded lifetime.** `issueDeviceRetirementAuthorization` takes `lifetimeMs` from its
 *     caller and the envelope carries `exp` directly. If the verifier does not cap `exp - iat`, a
 *     caller that passes a large lifetime mints a destructive token valid for years. Nothing in the
 *     signature layer objects; the whole question is whether the verifier has an opinion.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

const { signingKeysFromSeed } = await import("../../tickets/server-signing-key");
const {
  issueDeviceRetirementAuthorization,
  verifyDeviceRetirementAuthorization,
  DEVICE_RETIREMENT_CLOCK_SKEW_MS,
} = await import("./device-retirement-authorization");

const keys = signingKeysFromSeed(randomBytes(32));
const NOW = 1_760_000_000_000;
const ONE_MINUTE = 60_000;
const LIFETIME = 5 * ONE_MINUTE;

const INPUT = {
  authorizationId: "auth-1",
  retirementId: "retire-1",
  deviceId: "device-1",
  recipientPublicKey: "aa".repeat(32),
  completionHash: "bb".repeat(32),
  completionEphemeralPublicKey: "cc".repeat(32),
  completionSealed: "v1.iv.tag.ct",
  finalizationPublicKey: "dd".repeat(32),
};

function issue(now: number, lifetimeMs: number = LIFETIME): string {
  return issueDeviceRetirementAuthorization(INPUT, keys.privateKey, now, lifetimeMs);
}

function accepts(signed: string, at: number): boolean {
  try {
    verifyDeviceRetirementAuthorization(signed, keys.publicKey, at);
    return true;
  } catch {
    return false;
  }
}

describe("H15: expiry side of the window", () => {
  it("accepts an authorization inside its lifetime (control)", () => {
    expect(accepts(issue(NOW), NOW + ONE_MINUTE)).toBe(true);
  });

  it("accepts an authorization just past expiry, within the skew grace", () => {
    // Documents the deliberate tolerance, so a later change to it is visible rather than silent.
    expect(accepts(issue(NOW), NOW + LIFETIME + DEVICE_RETIREMENT_CLOCK_SKEW_MS - 1)).toBe(true);
  });

  it("rejects an authorization past expiry plus the full skew", () => {
    expect(accepts(issue(NOW), NOW + LIFETIME + DEVICE_RETIREMENT_CLOCK_SKEW_MS + 1)).toBe(false);
  });

  it("rejects an authorization long past expiry", () => {
    expect(accepts(issue(NOW), NOW + 365 * 24 * 60 * ONE_MINUTE)).toBe(false);
  });
});

describe("H15: issue side of the window", () => {
  it("accepts an authorization presented slightly before its issue time", () => {
    // A relay clock running behind the server is the case the skew exists for.
    expect(accepts(issue(NOW), NOW - DEVICE_RETIREMENT_CLOCK_SKEW_MS + 1)).toBe(true);
  });

  it("rejects an authorization presented far before its issue time", () => {
    /**
     * The asymmetry hypothesis. A future-dated authorization is one minted to become usable later;
     * accepting it far ahead of `iat` means the window has no effective lower bound and a
     * pre-issued destructive token works immediately.
     */
    expect(accepts(issue(NOW), NOW - DEVICE_RETIREMENT_CLOCK_SKEW_MS - 1)).toBe(false);
  });

  it("rejects an authorization dated a year in the future", () => {
    const farFuture = NOW + 365 * 24 * 60 * ONE_MINUTE;
    expect(accepts(issue(farFuture), NOW)).toBe(false);
  });

  it("applies the same tolerance to both bounds (differential)", () => {
    // Same magnitude either side of the window; both must land the same way.
    const signed = issue(NOW);
    const insideBefore = accepts(signed, NOW - DEVICE_RETIREMENT_CLOCK_SKEW_MS + 1);
    const insideAfter = accepts(signed, NOW + LIFETIME + DEVICE_RETIREMENT_CLOCK_SKEW_MS - 1);
    const outsideBefore = accepts(signed, NOW - DEVICE_RETIREMENT_CLOCK_SKEW_MS - 1);
    const outsideAfter = accepts(signed, NOW + LIFETIME + DEVICE_RETIREMENT_CLOCK_SKEW_MS + 1);

    expect({ insideBefore, insideAfter }).toEqual({ insideBefore: true, insideAfter: true });
    expect({ outsideBefore, outsideAfter }).toEqual({ outsideBefore: false, outsideAfter: false });
  });
});

describe("H15: lifetime bound", () => {
  it("honors the signed window without capping its span", () => {
    /**
     * OBSERVATION, not a finding — the hypothesis behind this test was over-broad and is corrected
     * here rather than inflated.
     *
     * The verifier enforces the window it is given and does not cap `exp - iat`. That is the
     * ordinary JWT-shaped contract, and the bound is enforced where it is actually decided: the
     * single issue path, `relay-device-retirement-actions.ts:24`, uses a hardcoded
     * `RETIREMENT_LIFETIME_MS = 30_000` matching the ticket lifetime. `lifetimeMs` is not
     * attacker-reachable — a caller able to choose it is the server, which already holds the
     * signing key and needs no long-lived token to do harm.
     *
     * Pinned so that if a second issue path ever appears with a caller-supplied lifetime, the
     * decision to add a verifier-side cap is made deliberately rather than by omission.
     */
    const tenYears = 10 * 365 * 24 * 60 * ONE_MINUTE;
    expect(accepts(issue(NOW, tenYears), NOW + 365 * 24 * 60 * ONE_MINUTE)).toBe(true);
  });

  it("rejects an envelope whose exp precedes its iat", () => {
    // A negative lifetime is never legitimate; accepting it would mean the window check reduces to
    // a single-sided comparison.
    expect(accepts(issue(NOW, -ONE_MINUTE), NOW)).toBe(false);
  });
});
