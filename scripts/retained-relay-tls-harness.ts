import { strict as assert } from "node:assert";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SERVER_SIGNING_KEY_ENV,
  resetServerSigningKeysCache,
  signingKeysFromSeed,
} from "../src/lib/tickets/server-signing-key";
import { issueTicket } from "../src/lib/tickets/ticket-issuer";
import { TICKET_KINDS } from "../src/lib/tickets/ticket-types";
import {
  readCompatibilityUpdateMarker,
  updateRoot,
} from "../relay/src/compatibility-update-marker";
import { ACTIVE_ENGINE_PIN_FILE } from "../relay/src/active-engine-pin";
import { writeRelayConfig } from "../relay/src/relay-config";
import { RELAY_SECRET_NAMES } from "../relay/src/secure-store";
import { readCompatibilityUpdateState } from "../relay/src/update-state";
import { WindowsSecureStore } from "../relay/src/windows-secure-store";
import {
  prepareRelayCandidate,
  relayCall,
  relayExecutableEnvironment,
  startRelay,
  stopRelayAndRemoveTempHomes,
  type PreparedRelayCandidate,
  type RunningRelay,
} from "./relay-executable-harness";
import {
  createTlsFixtureCertificates,
  type TlsFixtureCertificate,
  type TlsFixtureCertificates,
} from "./compatibility-artifact-tls-fixture-certificates";
import { createRetainedRelayTlsFixture } from "./retained-relay-tls-fixture";
import { startRetainedRelayMcpFixture } from "./retained-relay-mcp-fixture";

export const RETAINED_RELAY_V20_ARCHIVE_SHA256 = "9cc71eba405c8ea5ff9f288491ea0b827c7403b3c43541d1fa18c48a87126d69";
export const RETAINED_RELAY_V20_EXECUTABLE_SHA256 = "dd05b68d97dc2e8689bb6966e34911a38297331742d29fb229366040d5d4199a";

const RETAINED_RELAY_VERSION = 20;
const BASE_SEQUENCE = 9_260_925;

interface TlsCase {
  name: string;
  certificate: TlsFixtureCertificate;
  expectedCode: "staged" | "COMPATIBILITY_ARTIFACT_TLS";
}

const TLS_CASES: readonly TlsCase[] = [
  { name: "trusted scoped-fixture chain", certificate: "trusted", expectedCode: "staged" },
  { name: "missing intermediate", certificate: "missingIntermediate", expectedCode: "COMPATIBILITY_ARTIFACT_TLS" },
  { name: "wrong hostname", certificate: "wrongHostname", expectedCode: "COMPATIBILITY_ARTIFACT_TLS" },
];

export interface RetainedRelayTlsHarnessOptions {
  archivePath: string;
  metadataPath: string;
}

export interface RelayTlsHandoffCandidate {
  label: string;
  version: number;
  archiveSha256: string;
  executableSha256: string;
  compatibilityFloor: number;
}

export interface RelayTlsHandoffHarnessOptions extends RetainedRelayTlsHarnessOptions {
  candidate: RelayTlsHandoffCandidate;
}

export interface RetainedRelayTlsHarnessResult {
  archiveSha256: string;
  executableSha256: string;
  cases: string[];
}

/** Runs the retained v20 executable only; it does not build, publish, or activate any payload. */
export async function runRetainedRelayTlsHarness(
  options: RetainedRelayTlsHarnessOptions,
): Promise<RetainedRelayTlsHarnessResult> {
  return runRelayTlsHandoffHarness({
    ...options,
    candidate: {
      label: "retained Relay v20",
      version: RETAINED_RELAY_VERSION,
      archiveSha256: RETAINED_RELAY_V20_ARCHIVE_SHA256,
      executableSha256: RETAINED_RELAY_V20_EXECUTABLE_SHA256,
      compatibilityFloor: 26,
    },
  });
}

/** Runs the strict TLS and terminal-handoff flow against one explicitly hash-bound local candidate. */
export async function runRelayTlsHandoffHarness(
  options: RelayTlsHandoffHarnessOptions,
): Promise<RetainedRelayTlsHarnessResult> {
  if (process.platform !== "win32") throw new Error("The retained Relay TLS harness must run on Windows.");

  const certificates = await createTlsFixtureCertificates();
  try {
    for (const [index, testCase] of TLS_CASES.entries()) {
      await runTlsCase(options, certificates, testCase, BASE_SEQUENCE + index);
      console.log(`PASS  ${options.candidate.label} ${testCase.name}`);
    }
  } finally {
    await certificates.cleanup();
  }

  return {
    archiveSha256: options.candidate.archiveSha256,
    executableSha256: options.candidate.executableSha256,
    cases: TLS_CASES.map((testCase) => testCase.name),
  };
}

async function runTlsCase(
  options: RelayTlsHandoffHarnessOptions,
  certificates: TlsFixtureCertificates,
  testCase: TlsCase,
  sequence: number,
): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-retained-relay-tls-case-"));
  let candidate: PreparedRelayCandidate | null = null;
  let relay: RunningRelay | null = null;
  let fixture: Awaited<ReturnType<typeof createRetainedRelayTlsFixture>> | null = null;
  let mcp: Awaited<ReturnType<typeof startRetainedRelayMcpFixture>> | null = null;
  let executionError: unknown;
  try {
    assertCandidateArchive(options.archivePath, options.candidate);
    candidate = prepareRelayCandidate(options.archivePath, options.metadataPath);
    assertCandidate(candidate, options.candidate);
    fixture = await createRetainedRelayTlsFixture({ certificates, certificate: testCase.certificate, sequence });
    mcp = await startRetainedRelayMcpFixture();
    const serverSeed = randomBytes(32);
    const serverSeedHex = serverSeed.toString("hex");
    const serverKeys = signingKeysFromSeed(serverSeed);
    serverSeed.fill(0);
    const sandbox = prepareSandbox(root, candidate, fixture.origin, mcp.origin, mcp.token, serverKeys.publicKeyHex);
    const protectedPayloads = snapshotProtectedPayloads(sandbox);
    assertNoNodeTlsOverrides(sandbox.home);

    relay = await startRelay(sandbox.home, sandbox.relayExecutable, {
      fixtureExtraCaCertPath: certificates.rootCertificatePath,
      inheritedEnvironment: poisonedFixtureEnvironment(),
      environmentOverrides: {
        LOCALAPPDATA: sandbox.localAppData,
        MKT_BROWSER_INSTALL_DIR: sandbox.browserDirectory,
      },
      startupChild: true,
    });
    const health = await relayCall("/health");
    assert.equal(
      health.relayVersion,
      options.candidate.version,
      `The ${options.candidate.label} executable reported the wrong Relay version.`,
    );
    assert.match(String(health.publicKey ?? ""), /^[0-9a-f]{64}$/i, "Relay did not expose a device key.");

    const deviceId = sandbox.deviceId;
    const authorization = fixture.authorize(serverKeys.privateKey, serverKeys.publicKeyHex, deviceId);
    const ticket = issueFixtureTicket(
      serverSeedHex,
      {
        kind: TICKET_KINDS.COMPATIBILITY_UPDATE,
        manifest: fixture.signedManifest,
        revocations: [],
        authorization,
        smokeProfile: {
          proxyLabel: "retained Relay TLS fixture",
          proxyCountry: "US",
          proxy: { protocol: "http", host: "127.0.0.1", port: 9 },
        },
      },
      { deviceId, publicKey: String(health.publicKey) },
    );

    if (testCase.expectedCode === "staged") writeFreshHelperLock(sandbox.home);
    mcp.resetObservation();
    const result = await relayCall("/compatibility-update", { ticket }, { origin: fixture.origin });
    mcp.assertSingleCompatibilityUpdateFlow(result.ok === true);

    if (testCase.expectedCode === "staged") {
      assert.equal(
        result.ok,
        true,
        `The trusted retained Relay update was not staged (${String(result.code)}: ${String(result.message)}; ` +
          `authorized artifact requests: ${fixture.authorizedArtifactRequestCount()}).`,
      );
      assert.equal(result.updateStarted, true, "The trusted retained Relay update did not start staging.");
      fixture.assertAllArtifactsAuthorized();
      await assertStagedWithoutActivation(relay, sandbox, sequence, protectedPayloads);
      relay = null;
    } else {
      assert.equal(result.ok, false, `${testCase.name} unexpectedly staged.`);
      assert.equal(result.code, testCase.expectedCode, `${testCase.name} returned the wrong failure code.`);
      assertRejectedBeforeStaging(
        sandbox,
        sequence,
        authorization.authorizationId,
        protectedPayloads,
        testCase.name,
        options.candidate.compatibilityFloor,
      );
    }
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    try {
      await cleanTlsCase(relay, mcp, fixture, root, candidate);
    } catch (cleanupError) {
      if (executionError) {
        throw new AggregateError(
          [executionError, cleanupError],
          "The retained Relay TLS case failed and its cleanup was incomplete.",
        );
      }
      throw cleanupError;
    }
  }
}

async function cleanTlsCase(
  relay: RunningRelay | null,
  mcp: Awaited<ReturnType<typeof startRetainedRelayMcpFixture>> | null,
  fixture: Awaited<ReturnType<typeof createRetainedRelayTlsFixture>> | null,
  root: string,
  candidate: PreparedRelayCandidate | null,
): Promise<void> {
  let failed = false;
  const run = async (step: () => Promise<void> | void): Promise<void> => {
    try {
      await step();
    } catch {
      failed = true;
    }
  };

  await run(() => stopRelayAndRemoveTempHomes(relay, []));
  if (mcp) await run(() => mcp.close());
  if (fixture) await run(() => fixture.close());
  await run(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  if (candidate) {
    await run(() => rmSync(candidate.stagingDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  }
  await run(() => resetServerSigningKeysCache());

  if (failed) throw new Error("The retained Relay TLS case cleanup did not finish.");
}

/** Hash before extraction so an arbitrary ZIP never reaches tar.exe in this retained-byte harness. */
function assertCandidateArchive(archivePath: string, expected: RelayTlsHandoffCandidate): void {
  const supplied = path.resolve(archivePath);
  assert.equal(existsSync(supplied), true, "The Relay archive does not exist.");
  const digest = createHash("sha256").update(readFileSync(supplied)).digest("hex");
  assert.equal(digest, expected.archiveSha256, `The supplied Relay archive does not match ${expected.label}.`);
}

function assertCandidate(candidate: PreparedRelayCandidate, expected: RelayTlsHandoffCandidate): void {
  assert.equal(candidate.version, expected.version, `The supplied Relay candidate is not ${expected.label}.`);
  assert.equal(
    candidate.archiveSha256,
    expected.archiveSha256,
    `The supplied Relay archive does not match ${expected.label}.`,
  );
  assert.equal(
    candidate.executableSha256,
    expected.executableSha256,
    `The supplied Relay executable does not match ${expected.label}.`,
  );
}

interface RelaySandbox {
  home: string;
  localAppData: string;
  browserDirectory: string;
  relayExecutable: string;
  deviceId: string;
  protectedPayloads: string[];
}

function prepareSandbox(
  root: string,
  candidate: PreparedRelayCandidate,
  webOrigin: string,
  mcpOrigin: string,
  mcpToken: string,
  serverPublicKey: string,
): RelaySandbox {
  const home = path.join(root, "relay-home");
  const localAppData = path.join(root, "local-app-data");
  const browserDirectory = path.join(root, "MKTBrowser");
  const relayExecutable = path.join(localAppData, "MKTTool-Relay", "MKTTool-Relay.exe");
  const browserPayload = path.join(browserDirectory, "resources", "app.asar");
  const packagedRelay = path.join(browserDirectory, "resources", "relay", "MKTTool-Relay.zip");
  const browserExecutable = path.join(browserDirectory, "MKTBrowser.exe");
  const deviceId = `retained-relay-tls-${randomUUID()}`;

  mkdirSync(path.dirname(relayExecutable), { recursive: true });
  mkdirSync(path.dirname(packagedRelay), { recursive: true });
  mkdirSync(home, { recursive: true });
  copyFileSync(candidate.executablePath, relayExecutable);
  writeFileSync(browserExecutable, "retained-relay-tls-browser-executable", { flag: "wx" });
  writeFileSync(browserPayload, "retained-relay-tls-browser-payload", { flag: "wx" });
  writeFileSync(packagedRelay, "retained-relay-tls-packaged-relay", { flag: "wx" });
  writeRelayConfig(
    {
      deviceId,
      serverPublicKey,
      vaultKeyOperator: randomBytes(32).toString("hex"),
      webOrigin,
      mktBrowserUrl: mcpOrigin,
      mktBrowserToken: mcpToken,
    },
    home,
  );
  return {
    home,
    localAppData,
    browserDirectory,
    relayExecutable,
    deviceId,
    protectedPayloads: [relayExecutable, browserExecutable, browserPayload, packagedRelay],
  };
}

function snapshotProtectedPayloads(sandbox: RelaySandbox): Buffer[] {
  return sandbox.protectedPayloads.map((filePath) => readFileSync(filePath));
}

function assertProtectedPayloadsUnchanged(
  sandbox: RelaySandbox,
  before: readonly Buffer[],
  context: string,
): void {
  sandbox.protectedPayloads.forEach((filePath, index) => {
    assert.deepEqual(readFileSync(filePath), before[index], `${context} mutated ${path.basename(filePath)}.`);
  });
}

function issueFixtureTicket(
  serverSeedHex: string,
  payload: Parameters<typeof issueTicket>[0],
  recipient: Parameters<typeof issueTicket>[1],
): string {
  const original = process.env[SERVER_SIGNING_KEY_ENV];
  process.env[SERVER_SIGNING_KEY_ENV] = serverSeedHex;
  resetServerSigningKeysCache();
  try {
    return issueTicket(payload, recipient);
  } finally {
    if (original === undefined) delete process.env[SERVER_SIGNING_KEY_ENV];
    else process.env[SERVER_SIGNING_KEY_ENV] = original;
    resetServerSigningKeysCache();
  }
}

function poisonedFixtureEnvironment(): Record<string, string | undefined> {
  const allowed = new Set([
    "APPDATA",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATHEXT",
    "PATH",
    "PROCESSOR_ARCHITECTURE",
    "PROCESSOR_IDENTIFIER",
    "PROCESSOR_LEVEL",
    "PROCESSOR_REVISION",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "PSMODULEPATH",
    "PUBLIC",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERDOMAIN",
    "USERDOMAIN_ROAMINGPROFILE",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
  ]);
  const environment: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key.toUpperCase())) environment[key] = value;
  }
  return {
    ...environment,
    NODE_OPTIONS: "--require=retained-relay-tls-fixture-must-not-load",
    NODE_EXTRA_CA_CERTS: "C:\\retained-relay-tls-fixture-inherited-ca.pem",
    NODE_USE_SYSTEM_CA: "1",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  };
}

function assertNoNodeTlsOverrides(home: string): void {
  const environment = relayExecutableEnvironment(
    { RELAY_HOME: home },
    { inheritedEnvironment: poisonedFixtureEnvironment() },
  );
  const forbidden = ["NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "NODE_USE_SYSTEM_CA", "NODE_TLS_REJECT_UNAUTHORIZED"];
  assert.equal(
    Object.keys(environment).some((key) => forbidden.includes(key.toUpperCase())),
    false,
    "The retained Relay fixture child inherited a Node TLS override.",
  );
  assert.equal(environment[SERVER_SIGNING_KEY_ENV], undefined, "The fixture ticket signing key reached the Relay child.");
}

function writeFreshHelperLock(home: string): void {
  const directory = updateRoot(home);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "compatibility-helper.lock.json"),
    `${JSON.stringify({ schemaVersion: 1, helperId: randomUUID(), createdAt: new Date().toISOString() })}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

async function assertStagedWithoutActivation(
  relay: RunningRelay,
  sandbox: RelaySandbox,
  sequence: number,
  protectedPayloads: readonly Buffer[],
): Promise<void> {
  const exitCode = await relay.waitForExit(5_000);
  assert.equal(exitCode, 0, "The Relay did not close cleanly after helper-lock suppression.");

  const root = updateRoot(sandbox.home);
  const staging = path.join(root, "staging", String(sequence));
  for (const name of [
    "installer.artifact",
    "relay.artifact",
    "browser.artifact",
    "controlContract.artifact",
    "engine.artifact",
    "signed-manifest.json",
    ACTIVE_ENGINE_PIN_FILE,
  ]) {
    assert.equal(existsSync(path.join(staging, name)), true, `The trusted Relay omitted staged ${name}.`);
  }
  assert.equal(existsSync(path.join(root, "sets", String(sequence))), false, "The fixture activated a staged set.");
  assert.equal(
    existsSync(path.join(root, "MKTTool-Compatibility-Helper.exe")),
    false,
    "The helper lock did not suppress the compatibility helper launch.",
  );
  assert.equal(existsSync(path.join(root, "compatibility-helper.lock.json")), true, "The fixture helper lock disappeared.");
  assertProtectedPayloadsUnchanged(sandbox, protectedPayloads, "The fixture activated");
}

function assertRejectedBeforeStaging(
  sandbox: RelaySandbox,
  sequence: number,
  authorizationId: string,
  protectedPayloads: readonly Buffer[],
  caseName: string,
  compatibilityFloor: number,
): void {
  const root = updateRoot(sandbox.home);
  assert.equal(existsSync(path.join(root, "staging", String(sequence))), false, `${caseName} left a staged compatibility set.`);
  assert.equal(existsSync(path.join(root, "sets", String(sequence))), false, `${caseName} activated a compatibility set.`);
  assert.equal(readCompatibilityUpdateMarker(sandbox.home), null, `${caseName} left an activation marker.`);

  const store = new WindowsSecureStore(sandbox.home);
  const state = readCompatibilityUpdateState(store);
  assert.ok(state, `${caseName} did not leave a readable repaired update state.`);
  assert.equal(state.pending, null, `${caseName} left a pending update.`);
  assert.equal(state.current, null, `${caseName} changed the active compatibility set.`);
  assert.equal(state.retained, null, `${caseName} created a retained compatibility set.`);
  assert.equal(
    state.highestAcceptedSequence,
    compatibilityFloor - 1,
    `${caseName} advanced the accepted sequence before staging.`,
  );
  assert.equal(
    state.rollbackFloorSequence,
    compatibilityFloor,
    `${caseName} changed the installer rollback floor.`,
  );
  assert.equal(state.smokeProfileId, null, `${caseName} persisted a smoke profile before staging.`);
  assert.equal(
    JSON.stringify(state).includes(authorizationId),
    false,
    `${caseName} persisted the failed update authorization.`,
  );
  assert.equal(
    store.read(RELAY_SECRET_NAMES.compatibilityUpdateState) !== null,
    true,
    `${caseName} did not record its required ADMIN state repair.`,
  );
  assertProtectedPayloadsUnchanged(sandbox, protectedPayloads, `${caseName} before staging`);
}
