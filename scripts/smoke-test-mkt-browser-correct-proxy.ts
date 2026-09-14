/**
 * Close the MKB-00 positive-path gate without exposing proxy credentials.
 *
 * The script reads one proxy from either a selected vault or the fixed local handoff file, keeps
 * its credentials only in memory, probes it independently, and then sends signed create and launch
 * tickets through the real Relay handler to a disposable MKT Browser root. It never exposes page
 * control tools or prints the proxy endpoint, credentials, bearer token, database URL, or observed
 * IP. The local handoff file is removed before any network or browser action.
 *
 * Usage:
 *   npm run mkt-browser:proxy-smoke -- --database=local --inspect
 *   npm run mkt-browser:proxy-smoke -- --database=production --inspect
 *   npm run mkt-browser:proxy-smoke -- --database=production
 *   npm run mkt-browser:proxy-smoke -- --proxy-file
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import type {
  AntidetectAdapter,
  AntidetectProfileSummary,
  AntidetectProxyConfig,
} from "../src/lib/antidetect/antidetect-browser-adapter";
import { buildProxyConfig } from "../src/lib/antidetect/proxy-config-builder";
import {
  probeDirectExitIp,
  probeExitIpThroughProxy,
} from "../src/lib/proxies/proxy-exit-ip-probe";
import {
  generateRelayDeviceKeyPair,
  relayPrivateKeyToKeyObject,
} from "../src/lib/tickets/relay-device-key";
import { issueTicket } from "../src/lib/tickets/ticket-issuer";
import {
  publicKeyToHex,
  resetServerSigningKeysCache,
  SERVER_SIGNING_KEY_ENV,
  signingKeysFromSeed,
} from "../src/lib/tickets/server-signing-key";
import { TICKET_KINDS } from "../src/lib/tickets/ticket-types";
import { handleTicketRequest } from "../relay/src/handle-ticket";
import { RelayAntidetect } from "../relay/src/relay-antidetect";
import { buildRelayIdentity } from "../relay/src/relay-identity";
import {
  buildBrowserEnvironment, buildInstalledRootEnvironment, exerciseSignedProfileLifecycle,
  parseCftSmokeOptions, stageCftRuntime, type CftSmokeOptions,
} from "./mkt-browser-cft-smoke-runtime";
import {
  assertThrowawayVirtualBoxGuest, cleanupContainedSmoke, listRelayCompanionPids,
  provisionDisposableWebRtcFirewall, type SmokeEngine, stopOwnedSmokeProcesses,
  stopRelayCompanionsStartedSince,
} from "./mkt-browser-cft-smoke-firewall";

const DEFAULT_LABEL = "MKB-00 TEST";
const STARTUP_TIMEOUT_MS = 45_000;
const RUNNING_TIMEOUT_MS = 30_000;

type DatabaseSource = "local" | "production";

interface Options {
  database?: DatabaseSource;
  useProxyFile: boolean;
  inspectOnly: boolean;
  label: string;
  browserExe: string;
  engineCache?: string;
  cft?: CftSmokeOptions;
  disposableVmFirewall: boolean;
  installedRoot: boolean;
  acceptRealMachine: boolean;
}

let sensitiveValues: string[] = [];

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function parseOptions(): Options {
  const database = argumentValue("database");
  const useProxyFile = process.argv.includes("--proxy-file");
  if (database && database !== "local" && database !== "production") {
    throw new Error('Database source must be "--database=local" or "--database=production".');
  }
  if (useProxyFile === Boolean(database)) {
    throw new Error(
      'Pass exactly one proxy source: "--proxy-file", "--database=local", or "--database=production".',
    );
  }

  return {
    database: database as DatabaseSource | undefined,
    useProxyFile,
    inspectOnly: process.argv.includes("--inspect"),
    label: argumentValue("label")?.trim() || DEFAULT_LABEL,
    browserExe:
      argumentValue("browser-exe")?.trim() ||
      path.resolve(
        process.cwd(),
        "..",
        "MKTBrowser",
        "apps",
        "desktop",
        "release",
        "win-unpacked",
        "MKTBrowser.exe",
      ),
    engineCache: argumentValue("engine-cache")?.trim() || undefined,
    cft: parseCftSmokeOptions(process.argv.slice(2)),
    disposableVmFirewall: process.argv.includes("--disposable-vm-firewall"),
    installedRoot: process.argv.includes("--installed-root"),
    acceptRealMachine: process.argv.includes("--accept-real-machine"),
  };
}

/**
 * A disposable root can never satisfy WebRTC containment on a machine that has the product
 * installed: the installer already owns the one rule the desktop will accept for that engine, and
 * it names the installed binary rather than a staged copy. On a throwaway guest the isolation buys
 * nothing anyway, so the gate drives the installed root instead - the path an operator runs.
 */
function assertInstalledRootOptions(options: Options): void {
  if (options.acceptRealMachine && !options.installedRoot) {
    throw new Error("--accept-real-machine means nothing without --installed-root.");
  }
  if (!options.installedRoot) return;
  if (options.cft || options.engineCache || options.disposableVmFirewall) {
    throw new Error(
      "--installed-root uses the installed engine and the installer's own containment rule; " +
        "it takes no --cft-runtime, --engine-cache or --disposable-vm-firewall.",
    );
  }
}

/** The product's own data root, which is also where its `mcp-token` and engine cache live. */
function installedUserDataRoot(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) throw new Error("LOCALAPPDATA is not configured.");
  return path.join(localAppData, "MKTTool", "MKTBrowser");
}

function parseProxyHandoff(contents: string): AntidetectProxyConfig {
  const allowedKeys = new Set([
    "PROXY_PROTOCOL",
    "PROXY_HOST",
    "PROXY_PORT",
    "PROXY_USERNAME",
    "PROXY_PASSWORD",
  ]);
  const values = new Map<string, string>();

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new Error("The local proxy handoff file contains a malformed line.");
    }
    const key = line.slice(0, separator).trim();
    if (!allowedKeys.has(key)) {
      throw new Error("The local proxy handoff file contains an unsupported field.");
    }
    if (values.has(key)) {
      throw new Error("The local proxy handoff file contains a duplicate field.");
    }
    values.set(key, line.slice(separator + 1));
  }

  addSensitive(...values.values());

  const protocol = values.get("PROXY_PROTOCOL")?.trim().toLowerCase();
  const host = values.get("PROXY_HOST")?.trim();
  const portText = values.get("PROXY_PORT")?.trim();
  const port = portText ? Number(portText) : Number.NaN;
  if (protocol !== "http" && protocol !== "socks5") {
    throw new Error('PROXY_PROTOCOL must be "http" or "socks5".');
  }
  if (!host) throw new Error("PROXY_HOST is required.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PROXY_PORT must be an integer from 1 to 65535.");
  }

  const username = values.get("PROXY_USERNAME") || undefined;
  const password = values.get("PROXY_PASSWORD") || undefined;
  return { protocol, host, port, username, password };
}

async function consumeProxyHandoff(): Promise<AntidetectProxyConfig> {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) throw new Error("LOCALAPPDATA is not configured.");

  const handoffRoot = path.resolve(localAppData, "MKTTool");
  const handoffPath = path.resolve(handoffRoot, "mkb00-proxy.env");
  if (path.dirname(handoffPath) !== handoffRoot) {
    throw new Error("The local proxy handoff path failed its safety check.");
  }

  const metadata = await lstat(handoffPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("The local proxy handoff must be a regular file.");
  }

  const contents = await readFile(handoffPath, "utf8");
  try {
    return parseProxyHandoff(contents);
  } finally {
    await unlink(handoffPath);
  }
}

function addSensitive(...values: Array<string | null | undefined>): void {
  for (const value of values) {
    if (!value) continue;
    sensitiveValues.push(value, encodeURIComponent(value));
  }
  sensitiveValues = [...new Set(sensitiveValues)].sort((left, right) => right.length - left.length);
}

function redact(message: string): string {
  return sensitiveValues.reduce(
    (safe, secret) => (secret ? safe.split(secret).join("***") : safe),
    message,
  );
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveEngineCache(explicit?: string): Promise<string> {
  const candidates = [
    explicit,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "MKTTool", "MKTBrowser", "chromium")
      : undefined,
    process.env.APPDATA ? path.join(process.env.APPDATA, "MultiZen", "chromium") : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  throw new Error(
    "No verified browser-engine cache was found. Pass --engine-cache=<chromium-directory>.",
  );
}

/**
 * Read the engine name out of the copied cache instead of trusting a default. A cache directory is
 * only usable if it holds `<engine>/current.json`; anything else means the local install has not
 * provisioned a runtime yet, and the gate must say so rather than silently fall back to CFT.
 */
async function detectCachedEngine(cacheRoot: string): Promise<SmokeEngine> {
  const entries = await readdir(cacheRoot, { withFileTypes: true });
  const provisioned: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await exists(path.join(cacheRoot, entry.name, "current.json"))) provisioned.push(entry.name);
  }
  if (provisioned.length !== 1) {
    throw new Error(
      `The engine cache must hold exactly one provisioned runtime; found ${provisioned.length}.`,
    );
  }
  const engine = provisioned[0];
  if (engine !== "cft" && engine !== "cloakbrowser") {
    throw new Error(`The engine cache holds an unknown runtime "${engine}".`);
  }
  return engine;
}

/** Close only the browser this run started; an installed root may hold other work. */
/**
 * A single-instance app hands a second launch over to the one already running, which would leave
 * the gate talking to a process it did not configure - on a port it did not set.
 */
async function countRunningBrowsers(browserExe: string): Promise<number> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const { stdout } = await run("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference='Stop'; @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension(" +
      "$env:MKT_GATE_BROWSER_EXE)) -ErrorAction SilentlyContinue).Count",
  ], {
    encoding: "utf8", windowsHide: true, timeout: 20_000,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH,
      PSModulePath: process.env.PSModulePath, MKT_GATE_BROWSER_EXE: browserExe,
    },
  });
  return Number(stdout.trim());
}

async function stopStartedBrowser(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function allocateLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not allocate a disposable MKT Browser loopback port.");
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForToken(tokenPath: string, child: ChildProcess): Promise<string> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("The disposable MKT Browser process exited before its MCP token was ready.");
    }
    try {
      const token = (await readFile(tokenPath, "utf8")).trim();
      if (token) return token;
    } catch {
      // Startup has not created the token file yet.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the disposable MKT Browser MCP token.");
}

async function waitForProfileInventory(
  adapter: AntidetectAdapter,
  child: ChildProcess,
): Promise<AntidetectProfileSummary[]> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("The disposable MKT Browser process exited before MCP became ready.");
    }
    try {
      return await adapter.listProfiles();
    } catch {
      await delay(300);
    }
  }
  throw new Error("Timed out waiting for the disposable MKT Browser MCP endpoint.");
}

async function waitForRunningState(
  adapter: AntidetectAdapter,
  profileId: string,
  expected: boolean,
): Promise<void> {
  const deadline = Date.now() + RUNNING_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const profile = (await adapter.listProfiles()).find((candidate) => candidate.id === profileId);
    if (profile?.isRunning === expected) return;
    await delay(250);
  }
  throw new Error(`The disposable profile did not reach running=${expected}.`);
}

function createEphemeralTicketHarness(baseUrl: string, token: string) {
  const signingSeed = randomBytes(32);
  const deviceKeys = generateRelayDeviceKeyPair();
  const vaultKeyOperator = randomBytes(32).toString("hex");
  const deviceId = `p0-proxy-smoke-${randomUUID()}`;
  const previousSigningSeed = process.env[SERVER_SIGNING_KEY_ENV];

  addSensitive(signingSeed.toString("hex"), deviceKeys.privateKeyHex, vaultKeyOperator, token);
  process.env[SERVER_SIGNING_KEY_ENV] = signingSeed.toString("hex");
  resetServerSigningKeysCache();

  const config = {
    deviceId,
    serverPublicKey: publicKeyToHex(signingKeysFromSeed(signingSeed).publicKey),
    vaultKeyOperator,
    webOrigin: "http://127.0.0.1",
    mktBrowserToken: token,
    mktBrowserUrl: baseUrl,
  };

  return {
    identity: buildRelayIdentity(config, relayPrivateKeyToKeyObject(deviceKeys.privateKeyHex)),
    recipient: { deviceId, publicKey: deviceKeys.publicKeyHex },
    antidetect: new RelayAntidetect(config),
    restoreSigningEnvironment(): void {
      if (previousSigningSeed === undefined) delete process.env[SERVER_SIGNING_KEY_ENV];
      else process.env[SERVER_SIGNING_KEY_ENV] = previousSigningSeed;
      resetServerSigningKeysCache();
    },
  };
}

async function removeDisposableRoot(root: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === 3) throw new Error("Could not remove the disposable MKT Browser data root.");
      await delay(500);
    }
  }
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("The MKB-00 correct-proxy smoke test runs only on Windows x64.");
  }

  const options = parseOptions();
  assertInstalledRootOptions(options);
  // Before anything is consumed: the handoff file is single-use and the probes touch the network,
  // so a machine that must not be driven this way has to be turned away first.
  if (options.installedRoot && !options.acceptRealMachine) await assertThrowawayVirtualBoxGuest();
  if (options.acceptRealMachine) {
    // The guest guard exists to stop this happening by accident. An operator who names the
    // consequence in the command line is not an accident - but they still get told what stays
    // behind, because the adapter has no delete and only the app's own dialog can remove it.
    console.log(
      "Running against the real installed root on this machine, by explicit request. A profile " +
        "named \"P0 proxy smoke ...\" will be created and will REMAIN; remove it in MKT Browser's " +
        "own Delete Profile dialog when the run finishes.",
    );
    const running = await countRunningBrowsers(options.browserExe);
    if (running !== 0) {
      throw new Error(
        `MKT Browser is already running (${running} process(es)). Close it first: a second instance ` +
          "hands over to the running one, which is not the process this gate configured.",
      );
    }
  }
  const envPath = path.resolve(process.cwd(), ".env");
  if (!options.useProxyFile && (await exists(envPath))) loadEnvFile(envPath);

  let proxy: AntidetectProxyConfig;
  if (options.useProxyFile) {
    proxy = await consumeProxyHandoff();
    console.log("Local proxy handoff file was consumed and removed; format validation passed.");
    if (options.inspectOnly) return;
  } else {
    const database = options.database as DatabaseSource;
    const databaseUrl =
      database === "production"
        ? process.env.PRODUCTION_DATABASE_URL?.trim()
        : process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error(
        database === "production"
          ? "PRODUCTION_DATABASE_URL is not configured."
          : "DATABASE_URL is not configured.",
      );
    }

    addSensitive(
      databaseUrl,
      process.env.DATABASE_URL,
      process.env.PRODUCTION_DATABASE_URL,
      process.env.VAULT_KEY_SERVER,
    );

    // Proxy-file mode can be bundled for a clean guest without Prisma or a database.
    const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
      import("@prisma/client"), import("@prisma/adapter-pg"),
    ]);
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      log: [],
    });

    const proxyRecord = await (async () => {
      try {
        return await prisma.proxy.findUnique({
          where: { label: options.label },
          include: { account: { select: { id: true } } },
        });
      } finally {
        await prisma.$disconnect();
      }
    })();

    if (!proxyRecord) {
      console.log(`Proxy label "${options.label}" was not found in the ${database} database.`);
      return;
    }
    if (proxyRecord.account) {
      throw new Error(`Proxy "${options.label}" is assigned to an account; use a dedicated test proxy.`);
    }

    proxy = buildProxyConfig(proxyRecord);
    addSensitive(
      proxyRecord.host,
      proxyRecord.username,
      proxyRecord.passwordEnc,
      proxy.host,
      proxy.username,
      proxy.password,
    );

    console.log(
      `Found unassigned proxy "${options.label}" in the ${database} vault; credential decryption passed.`,
    );
    if (options.inspectOnly) return;
  }

  const independent = await probeExitIpThroughProxy({
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username ?? "",
    password: proxy.password ?? "",
  });
  if (independent.kind !== "ok") {
    // Carry the probe detail: "unreachable" alone cannot separate a dead proxy from a rejected
    // credential, and the outer handler redacts host/user/password before printing.
    throw new Error(`The independent proxy probe failed (${independent.kind}): ${independent.detail}`);
  }
  addSensitive(independent.ip);

  const direct = await probeDirectExitIp();
  if (direct.kind !== "ok") {
    throw new Error(
      `The direct-IP baseline probe failed (${direct.kind}): ${direct.detail}; distinct egress is unverified.`,
    );
  }
  addSensitive(direct.ip);
  if (direct.ip.toLowerCase() === independent.ip.toLowerCase()) {
    throw new Error("The proxy probe returned the same exit IP as the direct connection.");
  }
  console.log("Independent proxy probe passed and produced a distinct expected exit IP.");

  await access(options.browserExe);
  const dataRoot = options.installedRoot
    ? installedUserDataRoot()
    : await mkdtemp(path.join(tmpdir(), "mktbrowser-mkb00-"));
  let child: ChildProcess | null = null;
  let adapter: AntidetectAdapter | null = null;
  let profileId: string | null = null;
  let restoreSigningEnvironment: (() => void) | null = null;
  let removeFirewall: (() => Promise<void>) | null = null;
  let originalFailure: unknown;
  let relayHome: string | null = null;
  let relayCompanionsBefore: number[] = [];

  try {
    const port = await allocateLoopbackPort();
    if (options.installedRoot) {
      // Nothing is staged: the installed engine, its settings and the installer's containment rule
      // are the subject of this run, not something the gate arranges around it.
      // The app starts its own Relay companion. Note which ones predate this run so cleanup can
      // stop exactly the one it caused and leave anything the operator was already running.
      relayCompanionsBefore = await listRelayCompanionPids();
      console.log("Driving the installed MKT Browser root; nothing is staged around it.");
    } else if (options.cft) {
      const executable = await stageCftRuntime(dataRoot, options.cft);
      removeFirewall = await provisionDisposableWebRtcFirewall({
        enabled: options.disposableVmFirewall, root: dataRoot, executable, engine: "cft",
      });
      console.log(`Pinned CFT ${options.cft.version} verified before and after disposable staging.`);
    } else {
      const engineCache = await resolveEngineCache(options.engineCache);
      await cp(engineCache, path.join(dataRoot, "chromium"), { recursive: true });
      // The copied cache decides which engine the disposable root can serve, but the app defaults
      // to "cft" and would go looking for a runtime this root does not hold. Declare the engine the
      // cache actually carries, exactly as the pinned-CFT branch declares its own.
      const engine = await detectCachedEngine(path.join(dataRoot, "chromium"));
      const settings: Record<string, unknown> = { browserEngine: engine, mcpHttpEnabled: true };
      if (engine === "cloakbrowser") {
        // A licensed engine reaches its seat pool through settings, never through the environment —
        // the child environment strips CLOAKBROWSER_*. An unstocked pool refuses the launch with a
        // seat-wait message, which reads as "the engine is still starting" and is not.
        const licenseKey = process.env.CLOAKBROWSER_LICENSE_KEY?.trim();
        if (!licenseKey) {
          throw new Error(
            "The cloakbrowser engine cache needs a licence key; set CLOAKBROWSER_LICENSE_KEY first.",
          );
        }
        addSensitive(licenseKey);
        settings.cloakBrowserLicenseKey = licenseKey;
        settings.cloakBrowserLicenseKeys = [licenseKey];
      }
      await writeFile(path.join(dataRoot, "settings.json"), JSON.stringify(settings));
      // Same containment the pinned-CFT branch provisions, for the engine this root actually holds.
      // Without it a proxied launch is refused, correctly, because no rule names the staged binary.
      removeFirewall = await provisionDisposableWebRtcFirewall({
        enabled: options.disposableVmFirewall,
        root: dataRoot,
        executable: path.join(dataRoot, "chromium", engine, "runtime", "chrome.exe"),
        engine,
      });
      console.log(`Disposable root staged from the local ${engine} engine cache.`);
    }
    let browserEnvironment: NodeJS.ProcessEnv;
    let browserArgs: string[];
    if (options.installedRoot) {
      // Keep the real LOCALAPPDATA/APPDATA and pass no --user-data-dir: redirecting either would
      // move the engine away from the path the installer's rule names, which is the whole point.
      // Everything else is still scrubbed - an inherited ELECTRON_RUN_AS_NODE kills the app.
      browserEnvironment = buildInstalledRootEnvironment(port);
      browserArgs = [];
    } else {
      browserEnvironment = buildBrowserEnvironment(port, dataRoot);
      await mkdir(browserEnvironment.LOCALAPPDATA!, { recursive: true });
      await mkdir(browserEnvironment.APPDATA!, { recursive: true });
      browserArgs = [`--user-data-dir=${dataRoot}`];
    }
    child = spawn(options.browserExe, browserArgs, {
      env: browserEnvironment, stdio: "ignore", windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      child!.once("spawn", resolve);
      child!.once("error", () => reject(new Error("Could not spawn the disposable MKT Browser process.")));
    });
    const token = await waitForToken(path.join(dataRoot, "mcp-token"), child);
    addSensitive(token);
    const baseUrl = `http://127.0.0.1:${port}`;
    const harness = createEphemeralTicketHarness(baseUrl, token);
    restoreSigningEnvironment = harness.restoreSigningEnvironment;
    adapter = harness.antidetect.getAdapter();

    const initialProfiles = await waitForProfileInventory(adapter, child);
    if (!options.installedRoot && initialProfiles.length !== 0) {
      throw new Error("The disposable MKT Browser root was not empty at startup.");
    }
    if (options.installedRoot) {
      // Say what was already there. The gate adds one profile and cannot take it back, so the run
      // is only honest if the guest is discarded afterwards.
      console.log(
        `Installed root holds ${initialProfiles.length} profile(s) before this run; the gate adds ` +
          "one it cannot delete. Discard this guest when the run finishes.",
      );
    }

    relayHome = await mkdtemp(path.join(tmpdir(), "mktbrowser-mkb00-relay-"));
    const accountId = `p0-proxy-smoke-${randomUUID()}`;
    const requestId = `create-profile:${accountId}`;
    const profileName = `P0 proxy smoke ${Date.now()}`;
    const relayDeps = {
      identity: harness.identity,
      antidetect: harness.antidetect,
      home: relayHome,
      notConfiguredMessage: "The disposable Relay identity is not configured.",
    };
    const created = await handleTicketRequest(
      JSON.stringify({
        ticket: issueTicket(
          {
            kind: TICKET_KINDS.CREATE_PROFILE,
            accountId,
            requestId,
            profileName,
            proxy,
            fingerprint: {
              device: "windows-laptop-amd",
              localeId: "en-US",
              timezone: "America/Denver",
              screen: { width: 1680, height: 1050 },
            },
            seed: accountId,
          },
          harness.recipient,
        ),
      }),
      relayDeps,
    );
    if (!created.ok || typeof created.profileId !== "string" || !created.profileId) {
      throw new Error(`The signed create-profile ticket was rejected. ${created.message}`);
    }
    const createdProfileId = created.profileId;
    profileId = createdProfileId;

    const profileAdapter = adapter;
    await exerciseSignedProfileLifecycle({
      launch: async (unavailableProxy) => {
        const launchProxy: AntidetectProxyConfig = unavailableProxy
          ? { protocol: "http", host: "127.0.0.1", port: await allocateLoopbackPort() }
          : proxy;
        // A new ticket/jti is issued for every launch, including rejection and recovery.
        const ticket = issueTicket({
          kind: TICKET_KINDS.LAUNCH_PROFILE, accountId,
          antidetectProfileId: createdProfileId, proxyLabel: options.label, proxy: launchProxy,
        }, harness.recipient);
        const envelope = JSON.parse(Buffer.from(ticket.split(".")[0], "base64url").toString("utf8")) as { jti: string };
        const result = await handleTicketRequest(JSON.stringify({ ticket }), relayDeps);
        return { ...result, expectedOperationId: envelope.jti };
      },
      close: () => profileAdapter.closeProfile(createdProfileId),
      waitForRunning: (running) => waitForRunningState(profileAdapter, createdProfileId, running),
      report: (message) => console.log(message),
    });
    profileId = null;
    console.log(options.installedRoot
      ? "Profile closed. The installed root keeps it; remove it in MKT Browser, or discard the guest."
      : "Disposable profile closed; the entire isolated data root will now be removed.");
  } catch (error) {
    originalFailure = error;
    throw error;
  } finally {
    if (profileId && adapter) {
      try {
        await adapter.closeProfile(profileId);
      } catch {
        // Continue to process and isolated-root cleanup.
      }
    }
    restoreSigningEnvironment?.();
    try {
      // Never sweep processes by an installed root, and never remove it: `removeDisposableRoot`
      // would delete the product's own data. Installed-root runs close the browser they started
      // and stop there; the guest snapshot is what gets discarded.
      await cleanupContainedSmoke(options.installedRoot ? {
        stopAndVerify: async () => {
          await stopStartedBrowser(child);
          const stopped = await stopRelayCompanionsStartedSince(relayCompanionsBefore);
          if (stopped.length) console.log(`Stopped ${stopped.length} Relay companion(s) this run started.`);
        },
        removeFirewall: async () => {},
        removeRoot: async () => { if (relayHome) await removeDisposableRoot(relayHome); },
      } : {
        stopAndVerify: () => stopOwnedSmokeProcesses({ root: dataRoot, browserExe: options.browserExe }),
        removeFirewall: async () => { await removeFirewall?.(); },
        removeRoot: async () => {
          await removeDisposableRoot(dataRoot);
          if (relayHome) await removeDisposableRoot(relayHome);
        },
      });
    } catch (error) {
      const cleanupMessage = error instanceof Error ? error.message : "Contained cleanup failed.";
      const originalMessage = originalFailure instanceof Error ? ` Original smoke failure: ${originalFailure.message}` : "";
      throw new Error(`${cleanupMessage} Disposable root: ${dataRoot}.${originalMessage}`);
    }
  }

  console.log(options.installedRoot
    // Say what actually happened: this mode retains the profile it made, and saying otherwise would
    // turn a passing gate into a false claim about what it left behind.
    ? "MKB-00 real-proxy create/reopen/rejection/recovery passed with no account data. The gate " +
      "profile is retained in the installed root."
    : "MKB-00 real-proxy create/reopen/rejection/recovery passed with no account data or retained profile.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure.";
  console.error(`MKB-00 correct-proxy smoke failed: ${redact(message)}`);
  process.exitCode = 1;
});
