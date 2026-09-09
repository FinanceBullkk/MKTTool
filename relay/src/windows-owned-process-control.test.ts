import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stopExactOwnedWindowsProcesses } from "./windows-owned-process-control";

const roots: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  await Promise.all(children.splice(0).map(async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill();
    await exited;
  }));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function installation() {
  const root = mkdtempSync(path.join(tmpdir(), "mkt-owned-process-"));
  roots.push(root);
  return { root, browserExecutable: path.join(root, "MKTBrowser.exe"),
    relayExecutable: path.join(root, "MKTTool-Relay.exe") };
}

async function launch(executable: string) {
  mkdirSync(path.dirname(executable), { recursive: true });
  copyFileSync(process.execPath, executable);
  const child = spawn(executable, ["-e", "setInterval(() => {}, 1000)"], {
    windowsHide: true, stdio: "ignore",
  });
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  return child;
}

describe.skipIf(process.platform !== "win32")("exact Windows process shutdown", () => {
  it("succeeds when both owned runtimes are already absent", async () => {
    await expect(stopExactOwnedWindowsProcesses(installation())).resolves.toBeUndefined();
  });

  it("stops owned executables, retains foreign same-name processes, and is repeatable", async () => {
    const paths = installation();
    const browser = await launch(paths.browserExecutable);
    const relay = await launch(paths.relayExecutable);
    const foreign = await launch(path.join(paths.root, "foreign", "MKTBrowser.exe"));
    await stopExactOwnedWindowsProcesses(paths);
    expect(browser.exitCode !== null || browser.signalCode !== null).toBe(true);
    expect(relay.exitCode !== null || relay.signalCode !== null).toBe(true);
    expect(foreign.exitCode).toBeNull();
    expect(foreign.signalCode).toBeNull();
    await expect(stopExactOwnedWindowsProcesses(paths)).resolves.toBeUndefined();
    expect(foreign.exitCode).toBeNull();
  }, 30000);
});
