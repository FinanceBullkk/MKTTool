import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildDelegationRequest,
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
  signDelegation,
} from "../../../scripts/release-authority/release-authority-format.mjs";
import {
  signCompatibilityManifest,
  signDelegationRevocation,
} from "./compatibility-manifest-crypto";
import { signedDelegationSchema } from "./compatibility-manifest-schema";
import {
  validateCompatibilityManifest,
  type CompatibilityManifest,
} from "./compatibility-manifest";

const NOW = new Date("2026-08-16T00:00:00.000Z");

describe("compatibility manifest release authority", () => {
  it("accepts a valid signed compatible transition", () => {
    const fixture = createFixture();
    const verified = validateCompatibilityManifest(fixture.signed, fixture.options);
    expect(verified.manifest.sequence).toBe(2);
    expect(verified.manifestDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an altered manifest", () => {
    const fixture = createFixture();
    fixture.signed.manifest.artifacts.relay.sha256 = "f".repeat(64);
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
      "signature is invalid",
    );
  });

  it("rejects a stale manifest", () => {
    const fixture = createFixture({ expiresAt: "2026-08-15T23:59:59.000Z" });
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow("stale");
  });

  it("rejects a replayed sequence", () => {
    const fixture = createFixture();
    fixture.options.state.highestAcceptedSequence = 2;
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
      "replayed or attempts a downgrade",
    );
  });

  it("rejects a manifest signed by the wrong delegated key", () => {
    const fixture = createFixture();
    const wrongKey = privateKeyFromSeed(randomBytes(32));
    fixture.signed = signCompatibilityManifest(
      wrongKey,
      fixture.signed.delegation,
      fixture.signed.manifest,
      fixture.signed.signedAt,
    );
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
      "signature is invalid",
    );
  });

  it("rejects a root-signed revoked delegation", () => {
    const fixture = createFixture();
    const revocation = signDelegationRevocation(fixture.rootPrivateKey, {
      schemaVersion: 1,
      type: "mkttool.release-delegation-revocation",
      rootKeyId: fixture.rootTrust.rootKeyId,
      delegatedKeyId: fixture.signed.delegation.delegation.delegatedKeyId,
      revokedAt: "2026-08-15T12:00:00.000Z",
      reason: "Test revocation",
    });
    fixture.options.revocations = [revocation];
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow("revoked");
  });

  it("refuses a remembered revoked key even when the payload omits the statement", () => {
    const fixture = createFixture();
    expect(() =>
      validateCompatibilityManifest(fixture.signed, {
        ...fixture.options,
        revocations: [],
        knownRevokedDelegatedKeyIds: [fixture.signed.delegation.delegation.delegatedKeyId],
      }),
    ).toThrow("revoked");
  });

  it("reports a proven revocation of another key so the device can remember it", () => {
    const fixture = createFixture();
    const supersededKeyId = "a".repeat(64);
    const revocation = signDelegationRevocation(fixture.rootPrivateKey, {
      schemaVersion: 1,
      type: "mkttool.release-delegation-revocation",
      rootKeyId: fixture.rootTrust.rootKeyId,
      delegatedKeyId: supersededKeyId,
      revokedAt: "2026-08-15T12:00:00.000Z",
      reason: "Superseded key",
    });

    const verified = validateCompatibilityManifest(fixture.signed, {
      ...fixture.options,
      revocations: [revocation],
    });

    expect(verified.observedRevokedDelegatedKeyIds).toEqual([supersededKeyId]);
  });

  it("does not remember a revocation that is not yet in force", () => {
    const fixture = createFixture();
    const futureKeyId = "b".repeat(64);
    const revocation = signDelegationRevocation(fixture.rootPrivateKey, {
      schemaVersion: 1,
      type: "mkttool.release-delegation-revocation",
      rootKeyId: fixture.rootTrust.rootKeyId,
      delegatedKeyId: futureKeyId,
      revokedAt: "2026-08-17T00:00:00.000Z",
      reason: "Scheduled rotation",
    });

    const verified = validateCompatibilityManifest(fixture.signed, {
      ...fixture.options,
      revocations: [revocation],
    });

    expect(verified.observedRevokedDelegatedKeyIds).toEqual([]);
  });

  it("rejects an incompatible Relay, Browser, and contract tuple", () => {
    const fixture = createFixture({ browserContractVersion: 5 });
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
      "tuple is incompatible",
    );
  });

  it("rejects a network-driven downgrade", () => {
    const fixture = createFixture({ sequence: 1, fromSequence: 2 });
    fixture.options.state = {
      highestAcceptedSequence: 2,
      currentSequence: 2,
      installerFloorSequence: 1,
    };
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
      "replayed or attempts a downgrade",
    );
  });

  it("rejects a sequence that is not newer than the active set even if the high-water mark is corrupt", () => {
    const fixture = createFixture({ sequence: 2, fromSequence: 2 });
    fixture.options.state = {
      highestAcceptedSequence: 1,
      currentSequence: 2,
      installerFloorSequence: 1,
    };
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
      "not newer than the active compatibility set",
    );
  });
});

function createFixture(overrides: {
  sequence?: number;
  fromSequence?: number;
  expiresAt?: string;
  browserContractVersion?: number;
} = {}) {
  const rootPrivateKey = privateKeyFromSeed(randomBytes(32));
  const rootPublicHex = publicKeyHex(rootPrivateKey);
  const rootTrust = { rootKeyId: releaseKeyId(rootPublicHex), publicKeyHex: rootPublicHex } as const;
  const delegatedPrivateKey = privateKeyFromSeed(randomBytes(32));
  const delegatedPublicHex = publicKeyHex(delegatedPrivateKey);
  const delegationRequest = buildDelegationRequest({
    publicHex: delegatedPublicHex,
    createdAt: "2026-08-14T00:00:00.000Z",
    notBefore: "2026-08-14T00:00:00.000Z",
    expiresAt: "2027-08-14T00:00:00.000Z",
    label: "test-owner",
  });
  const delegation = signedDelegationSchema.parse(
    signDelegation(
      rootPrivateKey,
      rootTrust.rootKeyId,
      delegationRequest,
      "2026-08-14T00:01:00.000Z",
    ),
  );
  const manifest = buildManifest(delegationRequest.delegatedKeyId, overrides);
  const signed = signCompatibilityManifest(
    delegatedPrivateKey,
    delegation,
    manifest,
    "2026-08-15T00:01:00.000Z",
  );
  return {
    rootPrivateKey,
    rootTrust,
    signed,
    options: {
      now: NOW,
      rootTrust,
      state: {
        highestAcceptedSequence: 1,
        currentSequence: 1,
        installerFloorSequence: 1,
      },
      revocations: [] as unknown[],
    },
  };
}

function buildManifest(
  delegatedKeyId: string,
  overrides: {
    sequence?: number;
    fromSequence?: number;
    expiresAt?: string;
    browserContractVersion?: number;
  },
): CompatibilityManifest {
  const sequence = overrides.sequence ?? 2;
  const fromSequence = overrides.fromSequence ?? 1;
  const browserContractVersion = overrides.browserContractVersion ?? 4;
  const artifact = (kind: string, version: string) => ({
    kind,
    version,
    sha256: "a".repeat(64),
    sizeBytes: 1024,
    url: `https://releases.example/${sequence}/${kind}`,
  });
  return {
    schemaVersion: 1,
    type: "mkttool.windows.compatibility-manifest",
    sequence,
    channel: "pilot",
    platform: "windows-x64",
    issuedAt: "2026-08-15T00:00:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-09-15T00:00:00.000Z",
    delegatedKeyId,
    transition: { fromSequences: [fromSequence], retainedSequence: fromSequence || null },
    artifacts: {
      installer: { ...artifact("installer", "0.3.1"), kind: "installer" },
      relay: {
        ...artifact("relay", "12"),
        kind: "relay",
        supportedBrowserContract: { min: 1, max: 4 },
        secureStoreSchemaVersion: 2,
      },
      browser: {
        ...artifact("browser", "0.3.1"),
        kind: "browser",
        contractVersion: browserContractVersion,
        profileSchemaVersion: 3,
        engineKind: "cft",
      },
      controlContract: {
        ...artifact("control-contract", "4"),
        kind: "control-contract",
        contractVersion: 4,
      },
      engine: { ...artifact("engine", "145.0.7632.109"), kind: "engine", engineKind: "cft" },
    },
  };
}
