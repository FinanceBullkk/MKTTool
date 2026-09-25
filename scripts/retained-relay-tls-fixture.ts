import { execFileSync } from "node:child_process";
import { createHash, randomUUID, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { signedManifestDigest } from "../src/lib/release/compatibility-manifest-crypto";
import type { CompatibilityManifest, SignedCompatibilityManifest } from "../src/lib/release/compatibility-manifest";
import {
  compatibilityArtifactAuthorizationMatches,
  signCompatibilityUpdateAuthorization,
  type CompatibilityUpdateAuthorization,
} from "../src/lib/release/compatibility-update-authorization";
import type { TlsFixtureCertificate, TlsFixtureCertificates } from "./compatibility-artifact-tls-fixture-certificates";
import {
  closeFixtureServer,
  createCompatibilityFixturePayloads,
  fixtureServerOrigin,
  startCompatibilityFixtureServer,
  type CompatibilityFixtureArtifactKind,
  type CompatibilityFixturePayloads,
} from "./compatibility-artifact-tls-fixture-server";

export const RETAINED_RELAY_ARTIFACT_PATH_PREFIX = "/api/relay/download/v20/artifact";

const ARTIFACT_PATHS: Record<CompatibilityFixtureArtifactKind, string> = {
  installer: "installer",
  relay: "relay",
  browser: "browser",
  controlContract: "control-contract",
  engine: "engine",
};

interface PublicDelegation {
  delegation: { delegatedKeyId: string; expiresAt: string };
}

export interface RetainedRelayTlsFixture {
  readonly origin: string;
  readonly signedManifest: SignedCompatibilityManifest;
  readonly manifestDigest: string;
  authorize(serverPrivateKey: KeyObject, serverPublicKeyHex: string, deviceId: string): CompatibilityUpdateAuthorization;
  authorizedArtifactRequestCount(): number;
  assertAllArtifactsAuthorized(): void;
  close(): Promise<void>;
}

export async function createRetainedRelayTlsFixture(options: {
  certificates: TlsFixtureCertificates;
  certificate: TlsFixtureCertificate;
  sequence: number;
}): Promise<RetainedRelayTlsFixture> {
  const payloads = createCompatibilityFixturePayloads();
  payloads.controlContract = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    type: "mktbrowser.windows-control-contract",
    appVersion: "0.0.0-fixture",
    contractVersion: 6,
    profileSchemaVersion: 3,
  }));
  const workspace = mkdtempSync(path.join(os.tmpdir(), "mkttool-retained-relay-tls-"));
  let origin = "";
  let authorization: CompatibilityUpdateAuthorization | null = null;
  let serverPublicKeyHex: string | null = null;
  const authorizedPaths: string[] = [];

  const server = await startCompatibilityFixtureServer(
    options.certificates.certificatePfxPaths[options.certificate],
    options.certificates.passphrase,
    payloads,
    "normal",
    {
      artifactPathPrefix: RETAINED_RELAY_ARTIFACT_PATH_PREFIX,
      authorizeRequest: (request) => {
        if (!authorization || !serverPublicKeyHex || request.method !== "GET") return false;
        const requestPath = new URL(request.url ?? "/", origin).pathname;
        const accepted = compatibilityArtifactAuthorizationMatches(request.headers.authorization ?? null, {
          serverPublicKeyHex,
          requestPath,
        });
        if (accepted) authorizedPaths.push(requestPath);
        return accepted;
      },
    },
  );
  origin = fixtureServerOrigin(server);

  try {
    const signedManifest = signFixtureManifest(workspace, origin, payloads, options.sequence);
    const manifestDigest = signedManifestDigest(signedManifest);
    return {
      origin,
      signedManifest,
      manifestDigest,
      authorize: (privateKey, publicKeyHex, deviceId) => {
        const now = Date.now();
        serverPublicKeyHex = publicKeyHex;
        authorization = signCompatibilityUpdateAuthorization(privateKey, {
          schemaVersion: 1,
          type: "mkttool.compatibility-update-authorization",
          authorizationId: randomUUID(),
          actorUserId: "retained-relay-tls-fixture",
          authorizedRole: "ADMIN",
          deviceId,
          sequence: signedManifest.manifest.sequence,
          manifestDigest,
          repairMissingState: true,
          authenticatedArtifactPaths: artifactPaths(),
          issuedAt: new Date(now).toISOString(),
          commandExpiresAt: new Date(now + 30_000).toISOString(),
          artifactExpiresAt: new Date(now + 10 * 60_000).toISOString(),
        });
        return authorization;
      },
      authorizedArtifactRequestCount: () => authorizedPaths.length,
      assertAllArtifactsAuthorized: () => {
        const expected = artifactPaths();
        if (
          authorizedPaths.length !== expected.length ||
          authorizedPaths.some((item, index) => item !== expected[index])
        ) {
          throw new Error("The retained Relay did not make the expected single authorized artifact requests.");
        }
      },
      close: async () => {
        try {
          await closeFixtureServer(server);
        } finally {
          rmSync(workspace, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await closeFixtureServer(server);
    rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
}

function signFixtureManifest(
  workspace: string,
  origin: string,
  payloads: CompatibilityFixturePayloads,
  sequence: number,
): SignedCompatibilityManifest {
  const delegationPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "release",
    "release-authority-public-evidence",
    "signed-delegation.json",
  );
  const delegation = JSON.parse(readFileSync(delegationPath, "utf8")) as PublicDelegation;
  const now = Date.now();
  const manifest: CompatibilityManifest = {
    schemaVersion: 1,
    type: "mkttool.windows.compatibility-manifest",
    sequence,
    channel: "pilot",
    platform: "windows-x64",
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(Math.min(now + 10 * 60_000, Date.parse(delegation.delegation.expiresAt) - 60_000)).toISOString(),
    delegatedKeyId: delegation.delegation.delegatedKeyId,
    transition: { fromSequences: [0], retainedSequence: null },
    artifacts: {
      installer: { ...fixtureArtifact("installer", "fixture-installer", origin, payloads), kind: "installer" },
      relay: {
        ...fixtureArtifact("relay", "20", origin, payloads),
        kind: "relay",
        supportedBrowserContract: { min: 1, max: 6 },
        secureStoreSchemaVersion: 1,
      },
      browser: {
        ...fixtureArtifact("browser", "0.0.0-fixture", origin, payloads),
        kind: "browser",
        contractVersion: 6,
        profileSchemaVersion: 3,
        engineKind: "fixture-engine",
      },
      controlContract: {
        ...fixtureArtifact("controlContract", "6", origin, payloads),
        kind: "control-contract",
        contractVersion: 6,
      },
      engine: {
        ...fixtureArtifact("engine", "fixture-engine", origin, payloads),
        kind: "engine",
        engineKind: "fixture-engine",
      },
    },
  };
  const manifestPath = path.join(workspace, "manifest.json");
  const outputPath = path.join(workspace, "signed-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { encoding: "utf8", flag: "wx" });
  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(process.cwd(), "scripts", "sign-compatibility-manifest.ts"),
      "--manifest", manifestPath,
      "--delegation", delegationPath,
      "--output", outputPath,
    ],
    { cwd: process.cwd(), stdio: "pipe", windowsHide: true },
  );
  return JSON.parse(readFileSync(outputPath, "utf8")) as SignedCompatibilityManifest;
}

function fixtureArtifact(
  kind: CompatibilityFixtureArtifactKind,
  version: string,
  origin: string,
  payloads: CompatibilityFixturePayloads,
) {
  const payload = payloads[kind];
  return {
    version,
    sizeBytes: payload.byteLength,
    sha256: createHash("sha256").update(payload).digest("hex"),
    url: `${origin}${RETAINED_RELAY_ARTIFACT_PATH_PREFIX}/${ARTIFACT_PATHS[kind]}`,
  };
}

function artifactPaths(): string[] {
  return Object.values(ARTIFACT_PATHS).map(
    (name) => `${RETAINED_RELAY_ARTIFACT_PATH_PREFIX}/${name}`,
  );
}
