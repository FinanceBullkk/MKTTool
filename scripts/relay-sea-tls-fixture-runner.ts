import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Server as HttpsServer } from "node:https";
import type { Server as NetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import type { CompatibilityManifest } from "../src/lib/release/compatibility-manifest-schema";
import { relayExecutableEnvironment } from "./relay-executable-harness";
import type { TlsFixtureCertificate, TlsFixtureCertificates } from "./compatibility-artifact-tls-fixture-certificates";
import {
  closeFixtureServer,
  createCompatibilityFixturePayloads,
  fixtureServerOrigin,
  startConnectionResetFixtureServer,
  startCompatibilityFixtureServer,
  type CompatibilityFixturePayloads,
  type CompatibilityFixtureResponse,
} from "./compatibility-artifact-tls-fixture-server";

export type RelaySeaTlsFixtureExpectedResult =
  | "staged"
  | "COMPATIBILITY_ARTIFACT_TLS"
  | "COMPATIBILITY_ARTIFACT_NETWORK"
  | "COMPATIBILITY_ARTIFACT_HTTP"
  | "COMPATIBILITY_ARTIFACT_SIZE"
  | "COMPATIBILITY_ARTIFACT_HASH";

export interface RelaySeaTlsFixtureTestCase {
  name: string;
  certificate?: TlsFixtureCertificate;
  trustFixtureCa: boolean;
  response: CompatibilityFixtureResponse;
  expected: RelaySeaTlsFixtureExpectedResult;
}

interface FixtureReport {
  outcome: "staged" | "rejected" | "unexpected";
  code?: string;
  artifactCount?: number;
  stagingDirectoryPresent: boolean;
  tlsEnvironment: Record<string, string | null>;
  tlsEnvironmentKeys: string[];
}

const ARTIFACT_COUNT = 5;

export async function runRelaySeaTlsFixtureTestCase(
  executable: string,
  certificates: TlsFixtureCertificates,
  testCase: RelaySeaTlsFixtureTestCase,
): Promise<void> {
  const payloads = createCompatibilityFixturePayloads();
  let server: HttpsServer | NetServer | undefined;
  let origin: string;
  if (testCase.certificate) {
    server = await startCompatibilityFixtureServer(
      certificates.certificatePfxPaths[testCase.certificate],
      certificates.passphrase,
      payloads,
      testCase.response,
    );
    origin = fixtureServerOrigin(server);
  } else {
    server = await startConnectionResetFixtureServer();
    origin = fixtureServerOrigin(server);
  }
  try {
    const report = await runStageOnlyFixture(
      executable,
      origin,
      payloads,
      testCase.trustFixtureCa ? certificates.rootCertificatePath : undefined,
    );
    assertReport(testCase, report, certificates.rootCertificatePath);
  } finally {
    if (server) await closeFixtureServer(server);
  }
}

async function runStageOnlyFixture(
  executable: string,
  origin: string,
  payloads: CompatibilityFixturePayloads,
  fixtureCaPath?: string,
): Promise<FixtureReport> {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mkttool-relay-sea-tls-case-"));
  const configPath = path.join(directory, "fixture.json");
  const reportPath = path.join(directory, "result.json");
  writeFileSync(
    configPath,
    `${JSON.stringify({ home: path.join(directory, "Relay"), reportPath, verified: fixtureManifest(origin, payloads) })}\n`,
    "utf8",
  );
  try {
    const child = spawn(executable, [], {
      env: relayExecutableEnvironment(
        { MKTTOOL_RELAY_STAGE_ONLY_TLS_FIXTURE: configPath },
        { fixtureExtraCaCertPath: fixtureCaPath, inheritedEnvironment: poisonedEnvironment() },
      ),
      stdio: "ignore",
      windowsHide: true,
    });
    await waitForExit(child);
    if (!existsSync(reportPath)) throw new Error("The stage-only Relay SEA fixture produced no report.");
    return JSON.parse(readFileSync(reportPath, "utf8")) as FixtureReport;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function fixtureManifest(origin: string, payloads: CompatibilityFixturePayloads) {
  const artifact = (kind: keyof CompatibilityFixturePayloads, version = "1.0.0") => ({
    version,
    sizeBytes: payloads[kind].byteLength,
    sha256: createHash("sha256").update(payloads[kind]).digest("hex"),
    url: `${origin}/${kind}`,
  });
  const manifest = {
    schemaVersion: 1,
    type: "mkttool.windows.compatibility-manifest",
    sequence: 1,
    channel: "pilot",
    platform: "windows-x64",
    issuedAt: "2026-09-24T00:00:00.000Z",
    expiresAt: "2026-09-25T00:00:00.000Z",
    delegatedKeyId: "a".repeat(64),
    transition: { fromSequences: [0], retainedSequence: null },
    artifacts: {
      installer: { ...artifact("installer"), kind: "installer" },
      relay: {
        ...artifact("relay"),
        kind: "relay",
        supportedBrowserContract: { min: 4, max: 4 },
        secureStoreSchemaVersion: 1,
      },
      browser: {
        ...artifact("browser"),
        kind: "browser",
        contractVersion: 4,
        profileSchemaVersion: 3,
        engineKind: "fixture-engine",
      },
      controlContract: { ...artifact("controlContract"), kind: "control-contract", contractVersion: 4 },
      engine: { ...artifact("engine"), kind: "engine", engineKind: "fixture-engine" },
    },
  } satisfies CompatibilityManifest;
  // Signature verification belongs to the handler contract; this fixture isolates the packaged downloader.
  return { signed: { fixture: true }, manifest, manifestDigest: "b".repeat(64), observedRevokedDelegatedKeyIds: [] };
}

function poisonedEnvironment(): Record<string, string | undefined> {
  return {
    ...process.env,
    NODE_OPTIONS: "--require=must-not-load",
    NODE_EXTRA_CA_CERTS: "C:\\inherited-ca.pem",
    NODE_USE_SYSTEM_CA: "1",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    node_options: "--require=must-not-load-lowercase",
  };
}

function assertReport(
  testCase: RelaySeaTlsFixtureTestCase,
  report: FixtureReport,
  fixtureCaPath: string,
): void {
  const expectedKeys = testCase.trustFixtureCa ? ["NODE_EXTRA_CA_CERTS"] : [];
  if (
    JSON.stringify(report.tlsEnvironmentKeys) !== JSON.stringify(expectedKeys) ||
    report.tlsEnvironment.NODE_OPTIONS !== null ||
    report.tlsEnvironment.NODE_USE_SYSTEM_CA !== null ||
    report.tlsEnvironment.NODE_TLS_REJECT_UNAUTHORIZED !== null ||
    (testCase.trustFixtureCa && report.tlsEnvironment.NODE_EXTRA_CA_CERTS !== fixtureCaPath)
  ) {
    throw new Error(`${testCase.name}: inherited Node trust overrides reached the SEA fixture.`);
  }
  if (testCase.expected === "staged") {
    if (report.outcome !== "staged" || report.artifactCount !== ARTIFACT_COUNT || !report.stagingDirectoryPresent) {
      throw new Error(`${testCase.name}: the SEA fixture did not stage all compatibility artifacts.`);
    }
    return;
  }
  if (report.outcome !== "rejected" || report.code !== testCase.expected || report.stagingDirectoryPresent) {
    throw new Error(`${testCase.name}: expected ${testCase.expected} with cleaned staging.`);
  }
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("The stage-only Relay SEA fixture timed out."));
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("The stage-only Relay SEA fixture could not start."));
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("The stage-only Relay SEA fixture exited unexpectedly."));
      }
    });
  });
}
