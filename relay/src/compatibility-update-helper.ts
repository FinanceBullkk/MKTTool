import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { updateRoot } from "./compatibility-update-marker";
import { relayChildEnvironment } from "./relay-child-environment";

const HELPER_SWITCH = "mkt-compatibility-helper";
const HELPER_LOCK = "compatibility-helper.lock.json";
const HELPER_EXECUTABLE = "MKTTool-Compatibility-Helper.exe";
const HELPER_STALE_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CompatibilityStartupDisposition = "continue" | "exit";

export interface CompatibilityUpdateHelperOptions {
  home: string;
  argv: string[];
  executablePath: string;
  converge(): Promise<void>;
  launchHelper?: (helperId: string) => Promise<void>;
  isProcessRunning?: (pid: number) => boolean;
  now?: () => Date;
  newHelperId?: () => string;
}

export async function coordinateCompatibilityUpdateHelper(
  options: CompatibilityUpdateHelperOptions,
): Promise<CompatibilityStartupDisposition> {
  const helperId = readHelperId(options.argv);
  if (helperId) {
    claimMatchingHelperLock(options.home, helperId);
    try {
      await options.converge();
    } finally {
      rmSync(helperLockPath(options.home), { force: true });
    }
    return "exit";
  }

  const now = (options.now ?? (() => new Date()))();
  if (hasFreshHelperLock(options.home, now, options.isProcessRunning ?? isProcessRunning)) return "exit";
  const nextHelperId = (options.newHelperId ?? randomUUID)();
  if (!UUID.test(nextHelperId)) throw new Error("Cannot create a valid compatibility helper id.");
  writeHelperLock(options.home, nextHelperId, now);
  try {
    await (options.launchHelper ?? ((id) => launchHelperProcess(options, id)))(nextHelperId);
  } catch (error) {
    rmSync(helperLockPath(options.home), { force: true });
    throw error;
  }
  return "exit";
}

function readHelperId(argv: string[]): string | null {
  const prefix = `--${HELPER_SWITCH}=`;
  const value = argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
  if (value !== null && !UUID.test(value)) {
    throw new Error("The compatibility helper invocation is invalid.");
  }
  return value;
}

function hasFreshHelperLock(
  home: string,
  now: Date,
  processRunning: (pid: number) => boolean,
): boolean {
  let lock: { schemaVersion?: unknown; helperId?: unknown; createdAt?: unknown; pid?: unknown };
  try {
    lock = JSON.parse(readFileSync(helperLockPath(home), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(`Compatibility helper lock is invalid: ${(error as Error).message}`);
  }
  const createdAt = Date.parse(typeof lock.createdAt === "string" ? lock.createdAt : "");
  if (
    lock.schemaVersion !== 1 ||
    typeof lock.helperId !== "string" ||
    !UUID.test(lock.helperId) ||
    (lock.pid !== undefined && (!Number.isSafeInteger(lock.pid) || Number(lock.pid) <= 0))
  ) {
    throw new Error("Compatibility helper lock is invalid; installer repair is required.");
  }
  if (typeof lock.pid === "number" && processRunning(lock.pid)) return true;
  if (Number.isFinite(createdAt) && now.getTime() - createdAt <= HELPER_STALE_MS) return true;
  rmSync(helperLockPath(home), { force: true });
  return false;
}

function claimMatchingHelperLock(home: string, helperId: string): void {
  const lock = JSON.parse(readFileSync(helperLockPath(home), "utf8")) as {
    schemaVersion?: unknown;
    helperId?: unknown;
    createdAt?: unknown;
  };
  if (
    lock.schemaVersion !== 1 ||
    lock.helperId !== helperId ||
    typeof lock.createdAt !== "string" ||
    !Number.isFinite(Date.parse(lock.createdAt))
  ) {
    throw new Error("The compatibility helper does not own the active convergence lock.");
  }
  replaceHelperLock(home, {
    schemaVersion: 1,
    helperId,
    createdAt: lock.createdAt,
    pid: process.pid,
  });
}

function writeHelperLock(home: string, helperId: string, now: Date): void {
  const root = updateRoot(home);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    helperLockPath(home),
    `${JSON.stringify({ schemaVersion: 1, helperId, createdAt: now.toISOString() }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

function replaceHelperLock(
  home: string,
  lock: { schemaVersion: 1; helperId: string; createdAt: string; pid: number },
): void {
  const destination = helperLockPath(home);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, destination);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw new Error(`Cannot claim compatibility helper lock: ${(error as Error).message}`);
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function launchHelperProcess(
  options: CompatibilityUpdateHelperOptions,
  helperId: string,
): Promise<void> {
  if (path.basename(options.executablePath).toLowerCase() !== "mkttool-relay.exe") {
    throw new Error("Compatibility convergence requires the installed MKTTool Relay executable.");
  }
  const root = updateRoot(options.home);
  mkdirSync(root, { recursive: true });
  const helperPath = path.join(root, HELPER_EXECUTABLE);
  const temporary = `${helperPath}.${process.pid}.tmp`;
  copyFileSync(options.executablePath, temporary);
  rmSync(helperPath, { force: true });
  renameSync(temporary, helperPath);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(helperPath, [`--${HELPER_SWITCH}=${helperId}`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: relayChildEnvironment({ RELAY_HOME: options.home }),
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function helperLockPath(home: string): string {
  return path.join(updateRoot(home), HELPER_LOCK);
}
