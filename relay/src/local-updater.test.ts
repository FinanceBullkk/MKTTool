import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDelegationRequest,
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
  signDelegation,
} from "../../scripts/release-authority/release-authority-format.mjs";
import {
  signCompatibilityManifest,
  signDelegationRevocation,
  signedManifestDigest,
} from "../../src/lib/release/compatibility-manifest-crypto";
import { signedDelegationSchema } from "../../src/lib/release/compatibility-manifest-schema";
import { signRollbackAuthorization } from "../../src/lib/release/rollback-authorization";
import {
  clearCompatibilityUpdateMarker,
  readCompatibilityUpdateMarker,
  updateRoot,
} from "./compatibility-update-marker";
import { ACTIVE_ENGINE_PIN_FILE, enginePinFromManifest, parseEnginePin } from "./active-engine-pin";
import {
  activatePreparedCompatibilityUpdate,
  convergeCompatibilityUpdate,
  prepareCompatibilityRollback,
  prepareCompatibilityUpdate,
  rollbackCompatibilitySet,
  type CompatibilityUpdatePlatform,
  type LocalUpdaterOptions,
} from "./local-updater";
import type { PostActivationSmoke } from "./post-activation-smoke";
import { InMemorySecureStore } from "./in-memory-secure-store";
import {
  compatibilitySetRecord,
  readCompatibilityUpdateState,
  writeCompatibilityUpdateState,
  type CompatibilityArtifactKind,
} from "./update-state";

const homes: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const home of homes.splice(0)) rmSync(path.dirname(home), { recursive: true, force: true });
});

describe("local compatibility updater", () => {
  it("refuses an open profile before downloads or process stops", async () => {
    const fixture = createFixture();
    fixture.platform.open = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(prepare(fixture)).rejects.toThrow("Close every MKT Browser profile");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.platform.calls).toEqual([]);
  });

  it("abandons staging when a profile opens during artifact downloads", async () => {
    const fixture = createFixture();
    fixture.platform.hasOpenProfiles = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    stubArtifacts(fixture.payloads);

    await expect(prepare(fixture)).rejects.toThrow("Close every MKT Browser profile");

    expect(readCompatibilityUpdateState(fixture.store)?.pending).toBeNull();
    expect(existsSync(path.join(updateRoot(fixture.home), "staging", "2"))).toBe(false);
    expect(fixture.platform.calls).toEqual([]);
  });

  it("serializes concurrent update and rollback preparation for the same Relay home", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    let releaseProfileCheck!: () => void;
    const profileCheckGate = new Promise<void>((resolve) => {
      releaseProfileCheck = resolve;
    });
    fixture.platform.hasOpenProfiles = vi.fn()
      .mockImplementationOnce(async () => {
        await profileCheckGate;
        return false;
      })
      .mockResolvedValue(false);

    const update = prepare(fixture);
    await vi.waitFor(() => expect(fixture.platform.hasOpenProfiles).toHaveBeenCalledOnce());
    await expect(
      prepareCompatibilityRollback(
        {},
        { serverPublicKeyHex: "00", deviceId: "device-1" },
        fixture.options,
      ),
    ).rejects.toThrow("already being prepared");
    releaseProfileCheck();
    await update;

    expect(readCompatibilityUpdateState(fixture.store)?.pending?.mode).toBe("update");
  });

  it("refuses a manifest signed by a key this device already recorded as revoked", async () => {
    const fixture = createFixture();
    const state = readCompatibilityUpdateState(fixture.store)!;
    writeCompatibilityUpdateState(fixture.store, {
      ...state,
      revokedDelegatedKeyIds: [fixture.signed.delegation.delegation.delegatedKeyId],
    });
    stubArtifacts(fixture.payloads);

    // The payload carries no revocation statement at all — the refusal must come from memory.
    await expect(prepare(fixture)).rejects.toThrow("revoked");
  });

  it("records a proven revocation before staging can fail and lose it", async () => {
    const fixture = createFixture();
    const supersededKeyId = "a".repeat(64);
    fixture.validation.revocations = [
      signDelegationRevocation(fixture.rootPrivateKey, {
        schemaVersion: 1,
        type: "mkttool.release-delegation-revocation",
        rootKeyId: fixture.rootTrust.rootKeyId,
        delegatedKeyId: supersededKeyId,
        revokedAt: "2026-08-15T12:00:00.000Z",
        reason: "Superseded key",
      }),
    ];
    // Staging downloads nothing successfully here, so the update fails after validation.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(prepare(fixture)).rejects.toThrow();

    expect(readCompatibilityUpdateState(fixture.store)?.revokedDelegatedKeyIds).toEqual([
      supersededKeyId,
    ]);
  });

  it("resolves download headers per URL so server credentials never reach the engine host", async () => {
    const fixture = createFixture();
    fixture.options.downloadHeadersForUrl = (url) =>
      url.endsWith("/engine") ? new Headers() : new Headers({ authorization: "scoped" });
    const fetchMock = stubArtifacts(fixture.payloads);

    await prepare(fixture);

    for (const [input, init] of fetchMock.mock.calls) {
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toBe(String(input).endsWith("/engine") ? null : "scoped");
    }
  });

  it("stages the full set and rolls back activated artifacts after a fault", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    fixture.options.injectFault = (point: string) => {
      if (point === "after-activate-browser") throw new Error("injected activation fault");
    };
    await expect(activatePreparedCompatibilityUpdate(fixture.options)).rejects.toThrow("injected");
    expect(fixture.platform.calls).toEqual([
      "stop",
      "activate:engine",
      "activate:installer",
      "activate:browser",
      "restore:installer",
      "restore:browser",
      "restore:engine",
      "start",
    ]);
    expect(readCompatibilityUpdateState(fixture.store)?.current?.sequence).toBe(1);
    expect(readCompatibilityUpdateState(fixture.store)?.pending).toBeNull();
    expect(readCompatibilityUpdateMarker(fixture.home)).toBeNull();
  });

  it("journals activation intent before a platform mutation can fail partially", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    fixture.platform.failActivation = "browser";
    await expect(activatePreparedCompatibilityUpdate(fixture.options)).rejects.toThrow(
      "partial browser activation",
    );
    expect(fixture.platform.calls).toEqual([
      "stop",
      "activate:engine",
      "activate:installer",
      "activate:browser",
      "restore:installer",
      "restore:browser",
      "restore:engine",
      "start",
    ]);
  });

  it("revalidates staged bytes after handoff before stopping owned processes", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    writeFileSync(
      path.join(updateRoot(fixture.home), "staging", "2", "installer.artifact"),
      "tampered",
    );

    await expect(activatePreparedCompatibilityUpdate(fixture.options)).rejects.toThrow(
      "does not match its signed manifest",
    );
    expect(fixture.platform.calls).toEqual([]);
  });

  it("stops downloading when an artifact exceeds its signed byte size", async () => {
    const fixture = createFixture();
    fixture.signed.manifest.artifacts.installer.sizeBytes -= 1;
    fixture.signed = signCompatibilityManifest(
      fixture.delegatedPrivateKey,
      fixture.signed.delegation,
      fixture.signed.manifest,
      fixture.signed.signedAt,
    );
    stubArtifacts(fixture.payloads);
    await expect(prepare(fixture)).rejects.toThrow("exceeds its signed byte size");
    expect(fixture.platform.calls).toEqual([]);
  });

  it("rejects a signed control-contract artifact whose contents do not match the tuple", async () => {
    const fixture = createFixture();
    const artifact = fixture.signed.manifest.artifacts.controlContract;
    const bytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        type: "mktbrowser.windows-control-contract",
        appVersion: "0.0.0",
        contractVersion: artifact.contractVersion,
        profileSchemaVersion: fixture.signed.manifest.artifacts.browser.profileSchemaVersion,
      }),
    );
    fixture.payloads[artifact.url] = bytes;
    artifact.sizeBytes = bytes.length;
    artifact.sha256 = sha256(bytes);
    fixture.signed = signCompatibilityManifest(
      fixture.delegatedPrivateKey,
      fixture.signed.delegation,
      fixture.signed.manifest,
      fixture.signed.signedAt,
    );
    stubArtifacts(fixture.payloads);

    await expect(prepare(fixture)).rejects.toThrow(
      "control-contract artifact does not match the compatibility tuple",
    );
    expect(fixture.platform.calls).toEqual([]);
  });

  it("converges a rebooted staged update to one complete new set", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    expect(readCompatibilityUpdateMarker(fixture.home)?.phase).toBe("staged");
    await convergeCompatibilityUpdate(fixture.options);
    const state = readCompatibilityUpdateState(fixture.store);
    expect(state).toMatchObject({ highestAcceptedSequence: 2, pending: null });
    expect(state?.current?.sequence).toBe(2);
    expect(state?.retained?.sequence).toBe(1);
    expect(state?.smokeProfileId).toBe("test-profile");
    expect(fixture.smokeCalls).toEqual(["health", "list", "open", "cookie", "proxy", "close"]);
    expect(readCompatibilityUpdateMarker(fixture.home)).toBeNull();
  });

  it("recreates a deleted public marker from protected pending state before convergence", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    clearCompatibilityUpdateMarker(fixture.home);
    fixture.options.injectFault = (point: string) => {
      if (point === "after-marker-reconciled") throw new Error("stop after marker repair");
    };
    await expect(convergeCompatibilityUpdate(fixture.options)).rejects.toThrow("marker repair");
    expect(readCompatibilityUpdateMarker(fixture.home)).toMatchObject({
      sequence: 2,
      phase: "staged",
    });
    expect(fixture.platform.calls).toEqual([]);
  });

  it.each([
    ["stopping", []],
    ["activating", ["engine"]],
    ["activating", ["engine", "installer"]],
    ["smoke", artifactKinds()],
  ] as const)("converges an interrupted %s phase after Relay restarts", async (phase, activatedArtifacts) => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    const state = readCompatibilityUpdateState(fixture.store)!;
    writeCompatibilityUpdateState(fixture.store, {
      ...state,
      pending: { ...state.pending!, phase, activatedArtifacts: [...activatedArtifacts] },
    });
    await convergeCompatibilityUpdate(fixture.options);
    expect(readCompatibilityUpdateState(fixture.store)?.current?.sequence).toBe(2);
    expect(readCompatibilityUpdateState(fixture.store)?.pending).toBeNull();
  });

  it("converges to the retained set when a reboot occurs after staged-set promotion", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    const staging = path.join(updateRoot(fixture.home), "staging", "2");
    const promoted = path.join(updateRoot(fixture.home), "sets", "2");
    mkdirSync(path.dirname(promoted), { recursive: true });
    renameSync(staging, promoted);
    const state = readCompatibilityUpdateState(fixture.store)!;
    writeCompatibilityUpdateState(fixture.store, {
      ...state,
      pending: { ...state.pending!, phase: "smoke", activatedArtifacts: artifactKinds() },
    });
    await convergeCompatibilityUpdate(fixture.options);
    expect(readCompatibilityUpdateState(fixture.store)?.current?.sequence).toBe(1);
    expect(readCompatibilityUpdateState(fixture.store)?.pending).toBeNull();
    expect(fixture.platform.calls).toEqual([
      "restore:installer",
      "restore:browser",
      "restore:relay",
      "restore:controlContract",
      "restore:engine",
      "start",
    ]);
  });

  it("uses a signed ADMIN rollback authorization once and preserves the monotonic high-water mark", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    await activatePreparedCompatibilityUpdate(fixture.options);
    fixture.platform.calls.length = 0;
    const server = generateKeyPairSync("ed25519");
    const authorization = signRollbackAuthorization(server.privateKey, {
      schemaVersion: 1,
      type: "mkttool.compatibility-rollback-authorization",
      authorizationId: "3d1971be-ae6e-4c2a-9a1b-92ba75c748ab",
      adminUserId: "admin-1",
      authorizedRole: "ADMIN",
      deviceId: "device-1",
      currentSequence: 2,
      retainedSequence: 1,
      issuedAt: "2026-08-16T00:00:00.000Z",
      expiresAt: "2026-08-16T00:01:00.000Z",
    });
    await rollbackCompatibilitySet(
      authorization,
      {
        serverPublicKeyHex: publicKeyHex(server.publicKey),
        deviceId: "device-1",
        now: new Date("2026-08-16T00:00:59.000Z"),
      },
      fixture.options,
    );
    const state = readCompatibilityUpdateState(fixture.store);
    expect(state?.current?.sequence).toBe(1);
    expect(state?.retained?.sequence).toBe(2);
    expect(state?.highestAcceptedSequence).toBe(2);
    expect(state?.usedRollbackAuthorizationIds).toContain(authorization.authorizationId);
    expect(fixture.platform.calls).toEqual([
      "stop",
      "restore:installer",
      "restore:browser",
      "restore:relay",
      "restore:controlContract",
      "restore:engine",
      "start",
    ]);
  });

  it("finishes a prepared ADMIN rollback after Relay restarts", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    await activatePreparedCompatibilityUpdate(fixture.options);
    fixture.platform.calls.length = 0;
    const server = generateKeyPairSync("ed25519");
    const authorization = rollbackAuthorization(server.privateKey);
    await prepareCompatibilityRollback(
      authorization,
      {
        serverPublicKeyHex: publicKeyHex(server.publicKey),
        deviceId: "device-1",
        now: new Date("2026-08-16T00:00:30.000Z"),
      },
      fixture.options,
    );
    await convergeCompatibilityUpdate(fixture.options);
    const state = readCompatibilityUpdateState(fixture.store);
    expect(state?.current?.sequence).toBe(1);
    expect(state?.retained?.sequence).toBe(2);
    expect(state?.usedRollbackAuthorizationIds).toContain(authorization.authorizationId);
  });

  it("consumes rollback authorization when owned-process shutdown fails", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    await activatePreparedCompatibilityUpdate(fixture.options);
    fixture.platform.calls.length = 0;
    fixture.platform.failStopOnce = true;
    const server = generateKeyPairSync("ed25519");
    const authorization = rollbackAuthorization(server.privateKey);

    await expect(
      rollbackCompatibilitySet(
        authorization,
        {
          serverPublicKeyHex: publicKeyHex(server.publicKey),
          deviceId: "device-1",
          now: new Date("2026-08-16T00:00:30.000Z"),
        },
        fixture.options,
      ),
    ).rejects.toThrow("owned-process shutdown failed");

    const recovered = readCompatibilityUpdateState(fixture.store);
    expect(recovered?.current?.sequence).toBe(2);
    expect(recovered?.pending).toBeNull();
    expect(recovered?.usedRollbackAuthorizationIds).toContain(authorization.authorizationId);
    expect(fixture.platform.calls).toEqual(["stop", "start"]);
  });

  it.each(artifactKinds())(
    "restores the current tuple when rollback %s restoration fails",
    async (failedKind) => {
      const fixture = createFixture();
      stubArtifacts(fixture.payloads);
      await prepare(fixture);
      await activatePreparedCompatibilityUpdate(fixture.options);
      fixture.platform.calls.length = 0;
      fixture.platform.failRestoreOnce = failedKind;
      const server = generateKeyPairSync("ed25519");
      const authorization = rollbackAuthorization(server.privateKey);

      await expect(
        rollbackCompatibilitySet(
          authorization,
          {
            serverPublicKeyHex: publicKeyHex(server.publicKey),
            deviceId: "device-1",
            now: new Date("2026-08-16T00:00:30.000Z"),
          },
          fixture.options,
        ),
      ).rejects.toThrow(`partial ${failedKind} restoration`);

      const recovered = readCompatibilityUpdateState(fixture.store);
      expect(recovered?.current?.sequence).toBe(2);
      expect(recovered?.retained?.sequence).toBe(1);
      expect(recovered?.pending).toBeNull();
      expect(recovered?.usedRollbackAuthorizationIds).toContain(authorization.authorizationId);
      expect(fixture.platform.calls.at(-1)).toBe("start");
    },
  );

  it("restores the current tuple and consumes authorization when rollback smoke fails", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    await activatePreparedCompatibilityUpdate(fixture.options);
    fixture.platform.calls.length = 0;
    fixture.options.smoke = {
      run: async () => {
        throw new Error("rollback smoke rejected");
      },
    };
    const server = generateKeyPairSync("ed25519");
    const authorization = rollbackAuthorization(server.privateKey);

    await expect(
      rollbackCompatibilitySet(
        authorization,
        {
          serverPublicKeyHex: publicKeyHex(server.publicKey),
          deviceId: "device-1",
          now: new Date("2026-08-16T00:00:30.000Z"),
        },
        fixture.options,
      ),
    ).rejects.toThrow("rollback smoke rejected");

    const recovered = readCompatibilityUpdateState(fixture.store);
    expect(recovered?.current?.sequence).toBe(2);
    expect(recovered?.retained?.sequence).toBe(1);
    expect(recovered?.pending).toBeNull();
    expect(recovered?.usedRollbackAuthorizationIds).toContain(authorization.authorizationId);
    expect(readCompatibilityUpdateMarker(fixture.home)).toBeNull();
    expect(
      parseEnginePin(
        readFileSync(path.join(updateRoot(fixture.home), ACTIVE_ENGINE_PIN_FILE), "utf8"),
      ).sequence,
    ).toBe(2);
    expect(fixture.platform.calls).toEqual([
      "stop",
      "restore:installer",
      "restore:browser",
      "restore:relay",
      "restore:controlContract",
      "restore:engine",
      "restore:installer",
      "restore:browser",
      "restore:relay",
      "restore:controlContract",
      "restore:engine",
      "start",
    ]);

    fixture.platform.calls.length = 0;
    await expect(
      prepareCompatibilityRollback(
        authorization,
        {
          serverPublicKeyHex: publicKeyHex(server.publicKey),
          deviceId: "device-1",
          now: new Date("2026-08-16T00:00:30.000Z"),
        },
        fixture.options,
      ),
    ).rejects.toThrow(/already been used/i);
    expect(fixture.platform.calls).toEqual([]);

    const freshAuthorization = rollbackAuthorization(
      server.privateKey,
      "4d1971be-ae6e-4c2a-9a1b-92ba75c748ab",
    );
    await prepareCompatibilityRollback(
      freshAuthorization,
      {
        serverPublicKeyHex: publicKeyHex(server.publicKey),
        deviceId: "device-1",
        now: new Date("2026-08-16T00:00:30.000Z"),
      },
      fixture.options,
    );
    expect(readCompatibilityUpdateState(fixture.store)?.pending?.authorizationId).toBe(
      freshAuthorization.authorizationId,
    );
  });

  it("revalidates retained bytes before rollback stops owned processes", async () => {
    const fixture = createFixture();
    stubArtifacts(fixture.payloads);
    await prepare(fixture);
    await activatePreparedCompatibilityUpdate(fixture.options);
    fixture.platform.calls.length = 0;
    const server = generateKeyPairSync("ed25519");
    await prepareCompatibilityRollback(
      rollbackAuthorization(server.privateKey),
      {
        serverPublicKeyHex: publicKeyHex(server.publicKey),
        deviceId: "device-1",
        now: new Date("2026-08-16T00:00:30.000Z"),
      },
      fixture.options,
    );
    writeFileSync(
      path.join(updateRoot(fixture.home), "sets", "1", "installer.artifact"),
      "tampered",
    );

    await expect(convergeCompatibilityUpdate(fixture.options)).rejects.toThrow(
      "does not match its signed manifest",
    );
    expect(fixture.platform.calls).toEqual([]);
  });
});

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkt-update-"));
  const home = path.join(root, "MKTTool-Relay");
  homes.push(home);
  mkdirSync(home, { recursive: true });
  const store = new InMemorySecureStore();
  const authority = createSignedManifest();
  const payloads = fixturePayloads(authority.signed.manifest);
  authority.signed = signCompatibilityManifest(
    authority.delegatedPrivateKey,
    authority.signed.delegation,
    authority.signed.manifest,
    authority.signed.signedAt,
  );
  const currentManifest = structuredClone(authority.signed.manifest);
  currentManifest.sequence = 1;
  currentManifest.transition = { fromSequences: [0], retainedSequence: null };
  for (const artifact of Object.values(currentManifest.artifacts)) {
    artifact.url = artifact.url.replace("/2/", "/1/");
  }
  const currentPayloads = fixturePayloads(currentManifest);
  const currentSigned = signCompatibilityManifest(
    authority.delegatedPrivateKey,
    authority.signed.delegation,
    currentManifest,
    authority.signed.signedAt,
  );
  const currentDirectory = path.join(updateRoot(home), "sets", "1");
  writeCompatibilitySetFixture(currentDirectory, currentSigned, currentPayloads);
  const current = compatibilitySetRecord(currentSigned.manifest, signedManifestDigest(currentSigned));
  writeCompatibilityUpdateState(store, {
    schemaVersion: 1,
    highestAcceptedSequence: 1,
    rollbackFloorSequence: 1,
    smokeProfileId: null,
    current,
    retained: null,
    pending: null,
    usedRollbackAuthorizationIds: [],
    revokedDelegatedKeyIds: [],
  });

  const platform = new TestPlatform();
  const smokeCalls: string[] = [];
  const smoke = smokeRecorder(smokeCalls);
  const options: LocalUpdaterOptions = { home, store, platform, smoke, testProfileId: "test-profile" };
  return {
    home,
    store,
    platform,
    smokeCalls,
    payloads,
    signed: authority.signed,
    delegatedPrivateKey: authority.delegatedPrivateKey,
    rootPrivateKey: authority.rootPrivateKey,
    rootTrust: authority.rootTrust,
    validation: {
      now: new Date("2026-08-16T00:00:00.000Z"),
      rootTrust: authority.rootTrust,
      revocations: [] as unknown[],
    },
    options,
  };
}

function fixturePayloads(
  manifest: ReturnType<typeof createSignedManifest>["signed"]["manifest"],
): Record<string, Buffer> {
  const payloads = Object.fromEntries(
    artifactKinds().map((kind) => [manifest.artifacts[kind].url, Buffer.from(kind)]),
  );
  payloads[manifest.artifacts.controlContract.url] = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      type: "mktbrowser.windows-control-contract",
      appVersion: manifest.artifacts.browser.version,
      contractVersion: manifest.artifacts.controlContract.contractVersion,
      profileSchemaVersion: manifest.artifacts.browser.profileSchemaVersion,
    }),
  );
  for (const kind of artifactKinds()) {
    const bytes = payloads[manifest.artifacts[kind].url];
    manifest.artifacts[kind].sizeBytes = bytes.length;
    manifest.artifacts[kind].sha256 = sha256(bytes);
  }
  return payloads;
}

function writeCompatibilitySetFixture(
  directory: string,
  signed: ReturnType<typeof createSignedManifest>["signed"],
  payloads: Record<string, Buffer>,
): void {
  mkdirSync(directory, { recursive: true });
  for (const kind of artifactKinds()) {
    writeFileSync(
      path.join(directory, `${kind}.artifact`),
      payloads[signed.manifest.artifacts[kind].url],
    );
  }
  writeFileSync(path.join(directory, "signed-manifest.json"), JSON.stringify(signed));
  writeFileSync(
    path.join(directory, ACTIVE_ENGINE_PIN_FILE),
    JSON.stringify(enginePinFromManifest(signed.manifest)),
  );
}

async function prepare(fixture: ReturnType<typeof createFixture>) {
  return prepareCompatibilityUpdate(fixture.signed, fixture.validation, fixture.options);
}

function createSignedManifest() {
  const rootPrivateKey = privateKeyFromSeed(randomBytes(32));
  const rootPublicHex = publicKeyHex(rootPrivateKey);
  const rootTrust = { rootKeyId: releaseKeyId(rootPublicHex), publicKeyHex: rootPublicHex } as const;
  const delegatedPrivateKey = privateKeyFromSeed(randomBytes(32));
  const delegatedPublicHex = publicKeyHex(delegatedPrivateKey);
  const request = buildDelegationRequest({
    publicHex: delegatedPublicHex,
    createdAt: "2026-08-14T00:00:00.000Z",
    notBefore: "2026-08-14T00:00:00.000Z",
    expiresAt: "2027-08-14T00:00:00.000Z",
    label: "test-owner",
  });
  const delegation = signedDelegationSchema.parse(
    signDelegation(rootPrivateKey, rootTrust.rootKeyId, request, "2026-08-14T00:01:00.000Z"),
  );
  const base = (kind: CompatibilityArtifactKind, version: string) => ({
    kind,
    version,
    sha256: "a".repeat(64),
    sizeBytes: 1,
    url: `https://releases.example/2/${kind}`,
  });
  const manifest = {
    schemaVersion: 1 as const,
    type: "mkttool.windows.compatibility-manifest" as const,
    sequence: 2,
    channel: "pilot" as const,
    platform: "windows-x64" as const,
    issuedAt: "2026-08-15T00:00:00.000Z",
    expiresAt: "2026-09-15T00:00:00.000Z",
    delegatedKeyId: request.delegatedKeyId,
    transition: { fromSequences: [1], retainedSequence: 1 },
    artifacts: {
      installer: { ...base("installer", "0.3.1"), kind: "installer" as const },
      relay: {
        ...base("relay", "12"),
        kind: "relay" as const,
        supportedBrowserContract: { min: 1, max: 4 },
        secureStoreSchemaVersion: 1,
      },
      browser: {
        ...base("browser", "0.3.1"),
        kind: "browser" as const,
        contractVersion: 4,
        profileSchemaVersion: 3,
        engineKind: "cft",
      },
      controlContract: {
        ...base("controlContract", "4"),
        kind: "control-contract" as const,
        contractVersion: 4,
      },
      engine: { ...base("engine", "145"), kind: "engine" as const, engineKind: "cft" },
    },
  };
  return {
    rootTrust,
    rootPrivateKey,
    delegatedPrivateKey,
    signed: signCompatibilityManifest(
      delegatedPrivateKey,
      delegation,
      manifest,
      "2026-08-15T00:01:00.000Z",
    ),
  };
}

class TestPlatform implements CompatibilityUpdatePlatform {
  open = false;
  failActivation: CompatibilityArtifactKind | null = null;
  failRestoreOnce: CompatibilityArtifactKind | null = null;
  failStopOnce = false;
  calls: string[] = [];
  async hasOpenProfiles() {
    return this.open;
  }
  async stopOwnedProcesses() {
    this.calls.push("stop");
    if (this.failStopOnce) {
      this.failStopOnce = false;
      throw new Error("owned-process shutdown failed");
    }
  }
  async activateArtifact(kind: CompatibilityArtifactKind) {
    this.calls.push(`activate:${kind}`);
    if (this.failActivation === kind) throw new Error(`partial ${kind} activation`);
  }
  async restoreArtifact(kind: CompatibilityArtifactKind) {
    this.calls.push(`restore:${kind}`);
    if (this.failRestoreOnce === kind) {
      this.failRestoreOnce = null;
      throw new Error(`partial ${kind} restoration`);
    }
  }
  async startOwnedProcesses() {
    this.calls.push("start");
  }
}

function smokeRecorder(calls: string[]): PostActivationSmoke {
  return {
    run: async () => void calls.push("health", "list", "open", "cookie", "proxy", "close"),
  };
}

function stubArtifacts(payloads: Record<string, Buffer>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const bytes = payloads[String(input)];
      return bytes ? new Response(bytes.toString("utf8")) : new Response(null, { status: 404 });
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function artifactKinds(): CompatibilityArtifactKind[] {
  return ["installer", "relay", "browser", "controlContract", "engine"];
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function rollbackAuthorization(
  privateKey: Parameters<typeof signRollbackAuthorization>[0],
  authorizationId = "3d1971be-ae6e-4c2a-9a1b-92ba75c748ab",
) {
  return signRollbackAuthorization(privateKey, {
    schemaVersion: 1,
    type: "mkttool.compatibility-rollback-authorization",
    authorizationId,
    adminUserId: "admin-1",
    authorizedRole: "ADMIN",
    deviceId: "device-1",
    currentSequence: 2,
    retainedSequence: 1,
    issuedAt: "2026-08-16T00:00:00.000Z",
    expiresAt: "2026-08-16T00:01:00.000Z",
  });
}
