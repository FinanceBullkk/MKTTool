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

  /**
   * The chain, attacked at the delegation rather than at the manifest.
   *
   * Every case below produces a payload that is internally consistent: the manifest signature
   * verifies against the key the delegation names, and the delegation verifies against the key
   * that signed it. Only the pinned root separates them from a genuine release, which is exactly
   * what makes them the interesting inputs — a verifier that checked "is this signed?" instead of
   * "is this signed by the root?" would accept every one of them.
   */
  describe("forged delegation chains", () => {
    it("rejects a delegation minted by an attacker's own root while naming the real root", () => {
      const fixture = createFixture({ delegationRoot: "attacker", claimedRootKeyId: "real" });
      expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
        "delegation signature is invalid",
      );
    });

    it("rejects a delegation that names the attacker's own root", () => {
      const fixture = createFixture({ delegationRoot: "attacker", claimedRootKeyId: "attacker" });
      expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
        "wrong release root",
      );
    });

    it("rejects a root-signed delegation whose delegated public key was swapped", () => {
      const fixture = createFixture();
      const attackerKey = privateKeyFromSeed(randomBytes(32));
      const attackerPublicHex = publicKeyHex(attackerKey);
      fixture.signed.delegation.delegation.delegatedPublicKeyHex = attackerPublicHex;
      fixture.signed.delegation.delegation.delegatedKeyId = releaseKeyId(attackerPublicHex);
      fixture.signed.manifest.delegatedKeyId = releaseKeyId(attackerPublicHex);
      fixture.signed = signCompatibilityManifest(
        attackerKey,
        fixture.signed.delegation,
        fixture.signed.manifest,
        fixture.signed.signedAt,
      );
      expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
        "delegation signature is invalid",
      );
    });

    it("rejects a manifest that does not name the key its delegation carries", () => {
      const fixture = createFixture();
      fixture.signed.manifest.delegatedKeyId = "c".repeat(64);
      expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
        "does not name the key that signed it",
      );
    });

    it("rejects a pinned root whose fingerprint does not match its own public key", () => {
      const fixture = createFixture();
      expect(() =>
        validateCompatibilityManifest(fixture.signed, {
          ...fixture.options,
          rootTrust: { rootKeyId: "d".repeat(64), publicKeyHex: fixture.rootTrust.publicKeyHex },
        }),
      ).toThrow("pinned release root fingerprint is invalid");
    });
  });

  describe("authority window", () => {
    it("rejects a manifest signed under an expired delegation", () => {
      const fixture = createFixture({ delegationExpiresAt: "2026-08-10T00:00:00.000Z" });
      expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
        "inactive or expired",
      );
    });

    /**
     * A delegated key must not be able to authorize a compatibility set that outlives the
     * delegation itself. Without this rule, one manifest signed on the last valid day would keep
     * a retired key's decision in force indefinitely.
     */
    it("rejects a manifest that expires after its delegation does", () => {
      const fixture = createFixture({
        delegationExpiresAt: "2026-09-01T00:00:00.000Z",
        expiresAt: "2026-09-15T00:00:00.000Z",
      });
      expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
        "inactive or expired",
      );
    });

    it("rejects a manifest signed before its delegation became active", () => {
      const fixture = createFixture({ delegationNotBefore: "2026-08-20T00:00:00.000Z" });
      expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
        "inactive or expired",
      );
    });
  });

  /**
   * Revocation has to fail closed on a malformed or foreign-signed statement. Skipping an
   * unverifiable statement and carrying on would let whoever serves the payload disarm the
   * revocation check by corrupting the statement rather than omitting it.
   */
  it("rejects a revocation statement signed by a key other than the root", () => {
    const fixture = createFixture();
    const attackerRoot = privateKeyFromSeed(randomBytes(32));
    const revocation = signDelegationRevocation(attackerRoot, {
      schemaVersion: 1,
      type: "mkttool.release-delegation-revocation",
      rootKeyId: fixture.rootTrust.rootKeyId,
      delegatedKeyId: "e".repeat(64),
      revokedAt: "2026-08-15T12:00:00.000Z",
      reason: "Forged revocation",
    });
    fixture.options.revocations = [revocation];
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow(
      "revocation statement is invalid",
    );
  });

  it("rejects a manifest carrying an unknown field", () => {
    const fixture = createFixture();
    (fixture.signed.manifest as unknown as Record<string, unknown>).rolloutPercentage = 100;
    expect(() => validateCompatibilityManifest(fixture.signed, fixture.options)).toThrow();
  });
});

function createFixture(overrides: {
  sequence?: number;
  fromSequence?: number;
  expiresAt?: string;
  browserContractVersion?: number;
  /** Which key actually signs the delegation. The pinned root stays the real one either way. */
  delegationRoot?: "real" | "attacker";
  /** Which root the delegation claims to come from. */
  claimedRootKeyId?: "real" | "attacker";
  delegationNotBefore?: string;
  delegationExpiresAt?: string;
} = {}) {
  const rootPrivateKey = privateKeyFromSeed(randomBytes(32));
  const rootPublicHex = publicKeyHex(rootPrivateKey);
  const rootTrust = { rootKeyId: releaseKeyId(rootPublicHex), publicKeyHex: rootPublicHex } as const;
  const attackerRootPrivateKey = privateKeyFromSeed(randomBytes(32));
  const attackerRootKeyId = releaseKeyId(publicKeyHex(attackerRootPrivateKey));
  const delegatedPrivateKey = privateKeyFromSeed(randomBytes(32));
  const delegatedPublicHex = publicKeyHex(delegatedPrivateKey);
  const delegationRequest = buildDelegationRequest({
    publicHex: delegatedPublicHex,
    createdAt: "2026-08-14T00:00:00.000Z",
    notBefore: overrides.delegationNotBefore ?? "2026-08-14T00:00:00.000Z",
    expiresAt: overrides.delegationExpiresAt ?? "2027-08-14T00:00:00.000Z",
    label: "test-owner",
  });
  const signingRoot =
    overrides.delegationRoot === "attacker" ? attackerRootPrivateKey : rootPrivateKey;
  const claimedRootKeyId =
    overrides.claimedRootKeyId === "attacker" ? attackerRootKeyId : rootTrust.rootKeyId;
  const delegation = signedDelegationSchema.parse(
    signDelegation(signingRoot, claimedRootKeyId, delegationRequest, "2026-08-14T00:01:00.000Z"),
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
