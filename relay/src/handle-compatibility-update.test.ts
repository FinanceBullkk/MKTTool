import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDelegationRequest,
  signDelegation,
} from "../../scripts/release-authority/release-authority-format.mjs";
import {
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
} from "../../scripts/release-authority/release-authority-key-primitives.mjs";
import { signCompatibilityManifest } from "../../src/lib/release/compatibility-manifest-crypto";
import { signedManifestDigest } from "../../src/lib/release/compatibility-manifest-crypto";
import { signedDelegationSchema } from "../../src/lib/release/compatibility-manifest-schema";
import { signCompatibilityUpdateAuthorization } from "../../src/lib/release/compatibility-update-authorization";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { issueTicket } from "../../src/lib/tickets/ticket-issuer";
import {
  resetServerSigningKeysCache,
  signingKeysFromSeed,
} from "../../src/lib/tickets/server-signing-key";
import { TicketReplayGuard } from "../../src/lib/tickets/ticket-replay-guard";
import { MIN_RELAY_VERSION, TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import { handleCompatibilityUpdate } from "./handle-compatibility-update";
import { InMemorySecureStore } from "./in-memory-secure-store";
import type { CompatibilityUpdatePlatform } from "./local-updater";
import { readCompatibilityUpdateState } from "./update-state";

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TICKET_SIGNING_KEY;
  resetServerSigningKeysCache();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("compatibility update Relay endpoint", () => {
  it("repairs missing protected state, scopes artifact credentials, and stages the signed set", async () => {
    const fixture = createFixture(true);

    const result = await handleCompatibilityUpdate(
      request("https://mkt.example"),
      JSON.stringify({ ticket: fixture.ticket }),
      fixture.dependencies,
    );

    expect(result).toMatchObject({
      ok: true,
      updateStarted: true,
      targetSequence: 1,
      repairInitialized: true,
    });
    expect(readCompatibilityUpdateState(fixture.store)?.pending).toMatchObject({
      mode: "update",
      smokeProfileId: "smoke-1",
      target: { sequence: 1 },
    });
    expect(fixture.dependencies.onPrepared).toHaveBeenCalledOnce();
    for (const [input, init] of fixture.fetchMock.mock.calls) {
      const header = new Headers(init?.headers).get("authorization");
      expect(String(input)).toMatch(/^https:\/\/mkt\.example\/api\/relay\/download\//);
      expect(header?.startsWith("MKTTool-Compatibility ") ?? false).toBe(true);
    }
  });

  it("requires explicit ADMIN repair authority before creating state or downloading", async () => {
    const fixture = createFixture(false);
    const result = await handleCompatibilityUpdate(
      request("https://mkt.example"),
      JSON.stringify({ ticket: fixture.ticket }),
      fixture.dependencies,
    );

    expect(result).toMatchObject({ ok: false });
    expect(result.message).toMatch(/ADMIN repair/i);
    expect(readCompatibilityUpdateState(fixture.store)).toBeNull();
    expect(fixture.fetchMock).not.toHaveBeenCalled();
    expect(fixture.createProfile).not.toHaveBeenCalled();
  });
});

function createFixture(repairMissingState: boolean) {
  const now = new Date();
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-update-handler-"));
  roots.push(root);
  const home = path.join(root, "Relay");
  const store = new InMemorySecureStore();
  const serverSeed = randomBytes(32);
  process.env.TICKET_SIGNING_KEY = serverSeed.toString("hex");
  resetServerSigningKeysCache();
  const serverKeys = signingKeysFromSeed(serverSeed);
  const deviceKeys = generateKeyPairSync("x25519");
  const release = createRelease(now);
  const paths = ["installer", "relay", "browser", "control-contract", "engine"].map(
    (kind) => `/api/relay/download/v12/artifact/${kind}`,
  );
  const authorization = signCompatibilityUpdateAuthorization(serverKeys.privateKey, {
    schemaVersion: 1,
    type: "mkttool.compatibility-update-authorization",
    authorizationId: "741d4377-4c55-4fb0-8c41-133aaa15057a",
    actorUserId: "admin-1",
    authorizedRole: "ADMIN",
    deviceId: "device-1",
    sequence: 1,
    manifestDigest: signedManifestDigest(release.signed),
    repairMissingState,
    authenticatedArtifactPaths: paths,
    issuedAt: now.toISOString(),
    commandExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
    artifactExpiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  });
  const ticket = issueTicket(
    {
      kind: TICKET_KINDS.COMPATIBILITY_UPDATE,
      manifest: release.signed,
      revocations: [],
      authorization,
      smokeProfile: {
        proxyLabel: "Observer1",
        proxyCountry: "US",
        proxy: { protocol: "http", host: "127.0.0.1", port: 8080 },
      },
    },
    { deviceId: "device-1", publicKey: relayPublicKeyToHex(deviceKeys.publicKey) },
    now.getTime(),
  );
  const payloads: Record<string, string> = Object.fromEntries(
    Object.values(release.signed.manifest.artifacts).map((artifact) => [artifact.url, artifact.kind]),
  );
  payloads[release.signed.manifest.artifacts.controlContract.url] = release.controlContract;
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    new Response(payloads[String(input)]),
  );
  vi.stubGlobal("fetch", fetchMock);
  const createProfile = vi.fn(async () => ({ profileId: "smoke-1" }));
  const adapter = {
    listProfiles: vi.fn(async () => []),
    fingerprintOptions: vi.fn(async () => ({
      devices: [{ family: "windows-desktop", label: "Windows desktop", screens: [{ width: 1920, height: 1080 }] }],
      locales: [{ id: "en-US", label: "English (US)", country: "US", timezones: ["America/New_York"] }],
    })),
    createProfile,
  };
  const platform = new TestPlatform();
  return {
    store,
    ticket,
    fetchMock,
    createProfile,
    dependencies: {
      allowedOrigin: "https://mkt.example",
      home,
      store,
      identity: {
        deviceId: "device-1",
        // The security floor, not a literal. Hard-coded fixture versions are what broke three
        // suites when MIN_RELAY_VERSION was raised on 18 Aug 2026 -- the C35 lesson, one layer up.
        version: MIN_RELAY_VERSION,
        privateKey: deviceKeys.privateKey,
        serverPublicKey: serverKeys.publicKey,
        replayGuard: new TicketReplayGuard(),
      },
      antidetect: { getAdapter: () => adapter },
      createPlatform: () => platform,
      serverPublicKeyHex: serverKeys.publicKeyHex,
      deviceId: "device-1",
      installerFloorSequence: 1,
      rootTrust: release.rootTrust,
      now,
      onPrepared: vi.fn(),
    },
  };
}

function createRelease(now: Date) {
  const rootPrivateKey = privateKeyFromSeed(randomBytes(32));
  const rootPublicKeyHex = publicKeyHex(rootPrivateKey);
  const rootTrust = { rootKeyId: releaseKeyId(rootPublicKeyHex), publicKeyHex: rootPublicKeyHex } as const;
  const delegatedPrivateKey = privateKeyFromSeed(randomBytes(32));
  const request = buildDelegationRequest({
    publicHex: publicKeyHex(delegatedPrivateKey),
    createdAt: new Date(now.getTime() - 60_000).toISOString(),
    notBefore: new Date(now.getTime() - 60_000).toISOString(),
    expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    label: "test-owner",
  });
  const delegation = signedDelegationSchema.parse(
    signDelegation(rootPrivateKey, rootTrust.rootKeyId, request, now.toISOString()),
  );
  const artifact = (kind: string, url: string) => {
    const bytes = Buffer.from(kind);
    return { version: "1", sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length, url };
  };
  const origin = "https://mkt.example/api/relay/download/v12/artifact";
  const manifest = {
    schemaVersion: 1 as const,
    type: "mkttool.windows.compatibility-manifest" as const,
    sequence: 1,
    channel: "pilot" as const,
    platform: "windows-x64" as const,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    delegatedKeyId: request.delegatedKeyId,
    transition: { fromSequences: [0], retainedSequence: null },
    artifacts: {
      installer: { ...artifact("installer", `${origin}/installer`), kind: "installer" as const },
      relay: { ...artifact("relay", `${origin}/relay`), kind: "relay" as const, supportedBrowserContract: { min: 4, max: 4 }, secureStoreSchemaVersion: 1 },
      browser: { ...artifact("browser", `${origin}/browser`), kind: "browser" as const, contractVersion: 4, profileSchemaVersion: 3, engineKind: "cloakbrowser" },
      controlContract: { ...artifact("control-contract", `${origin}/control-contract`), kind: "control-contract" as const, contractVersion: 4 },
      engine: { ...artifact("engine", `${origin}/engine`), kind: "engine" as const, engineKind: "cloakbrowser" },
    },
  };
  const controlContract = JSON.stringify({
    schemaVersion: 1,
    type: "mktbrowser.windows-control-contract",
    appVersion: manifest.artifacts.browser.version,
    contractVersion: manifest.artifacts.controlContract.contractVersion,
    profileSchemaVersion: manifest.artifacts.browser.profileSchemaVersion,
  });
  manifest.artifacts.controlContract.sizeBytes = Buffer.byteLength(controlContract);
  manifest.artifacts.controlContract.sha256 = createHash("sha256")
    .update(controlContract)
    .digest("hex");
  return {
    rootTrust,
    controlContract,
    signed: signCompatibilityManifest(delegatedPrivateKey, delegation, manifest, now.toISOString()),
  };
}

function request(origin: string): IncomingMessage {
  return { headers: { origin } } as IncomingMessage;
}

class TestPlatform implements CompatibilityUpdatePlatform {
  async hasOpenProfiles() { return false; }
  async stopOwnedProcesses() {}
  async activateArtifact() {}
  async restoreArtifact() {}
  async startOwnedProcesses() {}
}
