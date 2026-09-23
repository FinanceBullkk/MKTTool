import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { relayChildEnvironment } from "./relay-child-environment";
import {
  readCompatibilityUpdateMarker,
  updateRoot,
} from "./compatibility-update-marker";
import type { PostActivationSmoke } from "./post-activation-smoke";

const AUTHORIZATION_DIRECTORY = "smoke-authorizations";
const AUTHORIZATION_LIFETIME_MS = 60_000;
const BROWSER_TIMEOUT_MS = 120_000;
const SMOKE_SWITCH = "mkt-compatibility-smoke";

interface SmokeAuthorizationPaths {
  pending: string;
  consumed: string;
}

export interface WindowsPostActivationSmokeOptions {
  home: string;
  browserExecutable: string;
  runBrowser?: (executable: string, args: string[]) => Promise<void>;
  now?: () => Date;
  newAuthorizationId?: () => string;
}

export class WindowsPostActivationSmoke implements PostActivationSmoke {
  constructor(private readonly options: WindowsPostActivationSmokeOptions) {}

  async run(testProfileId: string): Promise<void> {
    const marker = readCompatibilityUpdateMarker(this.options.home);
    if (!marker || marker.phase !== "smoke") {
      throw new Error("The compatibility marker must authorize post-activation smoke.");
    }
    const now = (this.options.now ?? (() => new Date()))();
    const authorizationId = (this.options.newAuthorizationId ?? randomUUID)();
    const paths = writeSmokeAuthorization({
      home: this.options.home,
      authorizationId,
      sequence: marker.sequence,
      manifestDigest: marker.manifestDigest,
      profileId: testProfileId,
      issuedAt: now,
    });
    try {
      await (this.options.runBrowser ?? runBrowser)(this.options.browserExecutable, [
        `--${SMOKE_SWITCH}=${authorizationId}`,
      ]);
    } finally {
      rmSync(paths.pending, { force: true });
      rmSync(paths.consumed, { force: true });
    }
  }
}

function writeSmokeAuthorization(options: {
  home: string;
  authorizationId: string;
  sequence: number;
  manifestDigest: string;
  profileId: string;
  issuedAt: Date;
}): SmokeAuthorizationPaths {
  const directory = path.join(updateRoot(options.home), AUTHORIZATION_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const pending = path.join(directory, `${options.authorizationId}.json`);
  const consumed = path.join(directory, `${options.authorizationId}.consumed.json`);
  const temporary = `${pending}.${process.pid}.tmp`;
  const authorization = {
    schemaVersion: 1,
    type: "mkttool.compatibility-smoke-authorization",
    authorizationId: options.authorizationId,
    sequence: options.sequence,
    manifestDigest: options.manifestDigest,
    profileId: options.profileId,
    issuedAt: options.issuedAt.toISOString(),
    expiresAt: new Date(options.issuedAt.getTime() + AUTHORIZATION_LIFETIME_MS).toISOString(),
  };
  try {
    writeFileSync(temporary, `${JSON.stringify(authorization, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, pending);
    return { pending, consumed };
  } catch (error) {
    rmSync(temporary, { force: true });
    throw new Error(`Cannot issue compatibility smoke authorization: ${(error as Error).message}`);
  }
}

async function runBrowser(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env: relayChildEnvironment(),
      stdio: "ignore",
      windowsHide: true,
    });
    let settled = false;
    const finish = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      operation();
    };
    const timer = setTimeout(() => {
      void terminateProcessTree(child).finally(() => {
        finish(() => reject(new Error("MKT Browser compatibility smoke timed out.")));
      });
    }, BROWSER_TIMEOUT_MS);
    child.once("error", (error) => {
      finish(() =>
        reject(new Error(`MKT Browser compatibility smoke could not start: ${error.message}`)),
      );
    });
    child.once("exit", (code, signal) => {
      finish(() => {
        if (code === 0) resolve();
        else reject(new Error(`MKT Browser compatibility smoke failed (${code ?? signal ?? "exit"}).`));
      });
    });
  });
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform !== "win32") {
    child.kill();
    return;
  }
  await new Promise<void>((resolve) => {
    const taskkill = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, "System32", "taskkill.exe")
      : "taskkill.exe";
    execFile(
      taskkill,
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true },
      () => resolve(),
    );
  });
}
