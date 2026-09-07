import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SENSITIVE_ENV_MARKERS = [
  "ACCESS_KEY", "API_KEY", "CREDENTIAL", "DATABASE_URL", "PASSWORD", "PRIVATE_KEY",
  "PROXY_", "_PROXY", "SECRET", "SIGNING_KEY", "TOKEN", "TOTP", "VAULT_KEY", "LICENSE_KEY",
];

export interface CftSmokeOptions {
  runtime: string;
  version: string;
  sha256: string;
}

export function parseCftSmokeOptions(args: string[]): CftSmokeOptions | undefined {
  const names = ["cft-runtime", "expected-cft-version", "expected-cft-sha256"];
  const values = names.map((name) => {
    const matches = args.filter((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
    if (matches.length > 1) throw new Error(`Duplicate --${name} option.`);
    if (!matches.length) return undefined;
    const value = matches[0].slice(name.length + 3).trim();
    if (!value) throw new Error(`--${name} requires a value.`);
    return value;
  });
  if (values.every((value) => value === undefined)) {
    if (args.includes("--disposable-vm-firewall")) {
      throw new Error("--disposable-vm-firewall requires an explicitly pinned CFT runtime.");
    }
    return undefined;
  }
  const [runtime, version, sha256] = values;
  if (!runtime || !version || !sha256) throw new Error("All three CFT runtime/pin options are required.");
  if (args.some((arg) => arg === "--engine-cache" || arg.startsWith("--engine-cache="))) {
    throw new Error("--engine-cache cannot be combined with --cft-runtime.");
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error("The expected CFT version must have four numeric parts.");
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("The expected CFT SHA-256 must contain 64 hexadecimal characters.");
  return { runtime: path.resolve(runtime), version, sha256: sha256.toLowerCase() };
}

export function buildBrowserEnvironment(
  port: number,
  root: string,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: inherited.NODE_ENV };
  for (const [key, value] of Object.entries(inherited)) {
    const normalized = key.toUpperCase();
    if (SENSITIVE_ENV_MARKERS.some((marker) => normalized.includes(marker))) continue;
    if (/^(MKT_BROWSER_|CLOAKBROWSER_)/.test(normalized)) continue;
    if (["NODE_OPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "ELECTRON_RUN_AS_NODE", "LOCALAPPDATA", "APPDATA"].includes(normalized)) continue;
    environment[key] = value;
  }
  environment.LOCALAPPDATA = path.join(root, "local-app-data");
  environment.APPDATA = path.join(root, "roaming-app-data");
  environment.MKT_BROWSER_MCP_PORT = String(port);
  return environment;
}

export async function inspectCftExecutable(executable: string): Promise<{ version: string; sha256: string }> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(executable)) hash.update(chunk);
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference='Stop'; [Console]::Out.Write((Get-Item -LiteralPath $env:MKT_CFT_INSPECT_EXE).VersionInfo.ProductVersion)",
  ], {
    encoding: "utf8", timeout: 10_000, windowsHide: true,
    env: { NODE_ENV: process.env.NODE_ENV, SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, MKT_CFT_INSPECT_EXE: executable },
  });
  return { version: stdout.trim(), sha256: hash.digest("hex") };
}

export function assertCftEvidence(observed: { version: string; sha256: string }, expected: CftSmokeOptions): void {
  if (observed.version !== expected.version || observed.sha256.toLowerCase() !== expected.sha256) {
    throw new Error("The CFT executable does not match the explicitly supplied version and SHA-256.");
  }
}

async function assertRegularTree(directory: string): Promise<void> {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("CFT runtime must be a regular directory.");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("CFT runtime must not contain links.");
    if (entry.isDirectory()) await assertRegularTree(path.join(directory, entry.name));
    else if (!entry.isFile()) throw new Error("CFT runtime must contain only regular files and directories.");
  }
}

export async function stageCftRuntime(
  root: string,
  options: CftSmokeOptions,
  inspect = inspectCftExecutable,
): Promise<string> {
  await assertRegularTree(options.runtime);
  assertCftEvidence(await inspect(path.join(options.runtime, "chrome.exe")), options);
  const cache = path.join(root, "chromium", "cft");
  const runtime = path.join(cache, "runtime");
  await mkdir(cache, { recursive: true });
  // Never link the external runtime into a recursively removed disposable root.
  await cp(options.runtime, runtime, { recursive: true, errorOnExist: true, force: false });
  const executable = path.join(runtime, "chrome.exe");
  assertCftEvidence(await inspect(executable), options);
  await writeFile(path.join(runtime, ".mkt-runtime.json"), JSON.stringify({ version: options.version }));
  await writeFile(path.join(cache, "current.json"), JSON.stringify({
    version: options.version, binaryRelative: path.join("runtime", "chrome.exe"),
    executableSha256: options.sha256, installedAt: new Date().toISOString(), channel: "Stable",
  }));
  await writeFile(path.join(root, "settings.json"), JSON.stringify({ browserEngine: "cft", mcpHttpEnabled: true }));
  return executable;
}

export interface SmokeLaunchResult {
  ok: boolean;
  message?: string;
  code?: unknown;
  rejectionCode?: unknown;
  diagnostic?: unknown;
  expectedOperationId?: string;
}

export async function exerciseSignedProfileLifecycle(options: {
  launch: (unavailableProxy: boolean) => Promise<SmokeLaunchResult>;
  close: () => Promise<void>;
  waitForRunning: (running: boolean) => Promise<void>;
  report: (message: string) => void;
}): Promise<void> {
  const openAndClose = async (label: string) => {
    const result = await options.launch(false);
    if (!result.ok) throw new Error(`The signed ${label} ticket was rejected. ${result.message ?? ""}`);
    await options.waitForRunning(true);
    await options.close();
    await options.waitForRunning(false);
    options.report(`Signed ${label} and close passed on the same disposable profile.`);
  };
  await openAndClose("launch-profile");
  await openAndClose("reopen-profile");
  const rejected = await options.launch(true);
  if (rejected.ok) throw new Error("The closed-port proxy was incorrectly accepted.");
  const diagnostic = rejected.diagnostic as { code?: unknown; stage?: unknown; operationId?: unknown } | undefined;
  if (rejected.rejectionCode !== undefined || rejected.code !== "PROXY_REJECTED" ||
    diagnostic?.code !== "PROXY_REJECTED" || diagnostic.stage !== "apply-or-verify-proxy" ||
    !rejected.expectedOperationId || diagnostic.operationId !== rejected.expectedOperationId) {
    throw new Error("The failed launch did not prove a correlated proxy-specific rejection.");
  }
  await options.waitForRunning(false);
  options.report("Closed-port proxy launch was rejected and the profile remained stopped.");
  await openAndClose("proxy-recovery");
}
