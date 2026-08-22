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
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, cp, lstat, mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);
const DEFAULT_LABEL = "MKB-00 TEST";
const STARTUP_TIMEOUT_MS = 45_000;
const RUNNING_TIMEOUT_MS = 30_000;
const SENSITIVE_ENV_MARKERS = [
  "ACCESS_KEY",
  "API_KEY",
  "CREDENTIAL",
  "DATABASE_URL",
  "PASSWORD",
  "PRIVATE_KEY",
  "PROXY_",
  "_PROXY",
  "SECRET",
  "SIGNING_KEY",
  "TOKEN",
  "TOTP",
  "VAULT_KEY",
] as const;

type DatabaseSource = "local" | "production";

interface Options {
  database?: DatabaseSource;
  useProxyFile: boolean;
  inspectOnly: boolean;
  label: string;
  browserExe: string;
  engineCache?: string;
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
  };
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

function buildBrowserEnvironment(port: number): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const [key, value] of Object.entries(process.env)) {
    const normalizedKey = key.toUpperCase();
    if (SENSITIVE_ENV_MARKERS.some((marker) => normalizedKey.includes(marker))) continue;
    environment[key] = value;
  }
  environment.MKT_BROWSER_MCP_PORT = String(port);
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
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

async function stopProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || !child.pid) return;
  child.kill();
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    delay(5_000).then(() => false),
  ]);
  if (exited || child.exitCode !== null) return;
  await execFileAsync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
    windowsHide: true,
  }).catch(() => undefined);
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
    throw new Error(`The independent proxy probe failed (${independent.kind}).`);
  }
  addSensitive(independent.ip);

  const direct = await probeDirectExitIp();
  if (direct.kind === "ok") {
    addSensitive(direct.ip);
    if (direct.ip.toLowerCase() === independent.ip.toLowerCase()) {
      throw new Error("The proxy probe returned the same exit IP as the direct connection.");
    }
  }
  console.log("Independent proxy probe passed and produced a distinct expected exit IP.");

  await access(options.browserExe);
  const engineCache = await resolveEngineCache(options.engineCache);
  const dataRoot = await mkdtemp(path.join(tmpdir(), "mktbrowser-mkb00-"));
  const port = await allocateLoopbackPort();
  await cp(engineCache, path.join(dataRoot, "chromium"), { recursive: true });

  const browserEnvironment = buildBrowserEnvironment(port);

  const child = spawn(options.browserExe, [`--user-data-dir=${dataRoot}`], {
    env: browserEnvironment,
    stdio: "ignore",
    windowsHide: true,
  });

  let adapter: AntidetectAdapter | null = null;
  let profileId: string | null = null;
  let cleanupError: Error | null = null;
  let restoreSigningEnvironment: (() => void) | null = null;

  try {
    const token = await waitForToken(path.join(dataRoot, "mcp-token"), child);
    addSensitive(token);
    const baseUrl = `http://127.0.0.1:${port}`;
    const harness = createEphemeralTicketHarness(baseUrl, token);
    restoreSigningEnvironment = harness.restoreSigningEnvironment;
    adapter = harness.antidetect.getAdapter();

    const initialProfiles = await waitForProfileInventory(adapter, child);
    if (initialProfiles.length !== 0) {
      throw new Error("The disposable MKT Browser root was not empty at startup.");
    }

    const accountId = `p0-proxy-smoke-${randomUUID()}`;
    const requestId = `create-profile:${accountId}`;
    const profileName = `P0 proxy smoke ${Date.now()}`;
    const relayDeps = {
      identity: harness.identity,
      antidetect: harness.antidetect,
      home: path.join(dataRoot, "relay-smoke"),
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

    const launched = await handleTicketRequest(
      JSON.stringify({
        ticket: issueTicket(
          {
            kind: TICKET_KINDS.LAUNCH_PROFILE,
            accountId,
            antidetectProfileId: createdProfileId,
            proxyLabel: options.label,
            proxy,
          },
          harness.recipient,
        ),
      }),
      relayDeps,
    );
    if (!launched.ok) {
      throw new Error(`The signed launch-profile ticket was rejected. ${launched.message}`);
    }
    await waitForRunningState(adapter, createdProfileId, true);

    console.log(
      "Signed Relay launch passed after MKT Browser verified proxy egress and started its contained bridge.",
    );

    await adapter.closeProfile(createdProfileId);
    await waitForRunningState(adapter, createdProfileId, false);
    profileId = null;
    console.log("Disposable profile closed; the entire isolated data root will now be removed.");
  } finally {
    if (profileId && adapter) {
      try {
        await adapter.closeProfile(profileId);
      } catch {
        // Continue to process and isolated-root cleanup.
      }
    }
    restoreSigningEnvironment?.();
    await stopProcessTree(child);
    try {
      await removeDisposableRoot(dataRoot);
    } catch (error) {
      cleanupError = error instanceof Error ? error : new Error("Disposable root cleanup failed.");
    }
  }

  if (cleanupError) throw cleanupError;
  console.log("MKB-00 correct-proxy positive path passed with no account data and no retained profile.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure.";
  console.error(`MKB-00 correct-proxy smoke failed: ${redact(message)}`);
  process.exitCode = 1;
});
