import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_PATHS } from "../../src/lib/relay/relay-endpoints";

const FIXTURE = path.join(process.cwd(), "relay", "src", "relay-startup-process-fixture.ts");
const TSX = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

interface FixtureProcess {
  root: string;
  port: number;
  blockedPath: string;
  releasePath: string;
  activationPath: string;
  continuePath: string;
  childPidPath: string;
  readyPidPath: string;
  parent: ChildProcess;
}

const fixtures: FixtureProcess[] = [];
type FixtureMode = "ready" | "fail-late" | "fail-after-activation" | "handoff" | "port-conflict";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForFile(filePath: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for fixture file ${path.basename(filePath)}.`);
}

async function launchFixture(
  mode: FixtureMode = "ready",
  startupTimeoutMs?: number,
): Promise<FixtureProcess> {
  const root = await mkdtemp(path.join(tmpdir(), "mkttool-relay-startup-"));
  const port = await reservePort();
  const blockedPath = path.join(root, "blocked");
  const releasePath = path.join(root, "release");
  const activationPath = path.join(root, "activated");
  const continuePath = path.join(root, "continue");
  const childPidPath = path.join(root, "child-pid");
  const readyPidPath = path.join(root, "ready-pid");
  const parent = spawn(process.execPath, [TSX, FIXTURE], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELAY_HOME: root,
      RELAY_STARTUP_FIXTURE_PORT: String(port),
      RELAY_STARTUP_FIXTURE_BLOCKED_PATH: blockedPath,
      RELAY_STARTUP_FIXTURE_RELEASE_PATH: releasePath,
      RELAY_STARTUP_FIXTURE_ACTIVATION_PATH: activationPath,
      RELAY_STARTUP_FIXTURE_CONTINUE_PATH: continuePath,
      RELAY_STARTUP_FIXTURE_CHILD_PID_PATH: childPidPath,
      RELAY_STARTUP_FIXTURE_READY_PID_PATH: readyPidPath,
      RELAY_STARTUP_FIXTURE_MODE: mode,
      ...(startupTimeoutMs ? { RELAY_STARTUP_FIXTURE_TIMEOUT_MS: String(startupTimeoutMs) } : {}),
    },
    stdio: "ignore",
    windowsHide: true,
  });
  const fixture: FixtureProcess = {
    root,
    port,
    blockedPath,
    releasePath,
    activationPath,
    continuePath,
    childPidPath,
    readyPidPath,
    parent,
  };
  fixtures.push(fixture);
  await waitForFile(fixture.blockedPath);
  return fixture;
}

async function waitForStartupState(
  fixture: FixtureProcess,
  startupState: "pending" | "failed",
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${fixture.port}${RELAY_PATHS.health}`);
      const body = await response.json() as Record<string, unknown>;
      if (body.startupState === startupState) return body;
    } catch {
      // The bootstrap may be handing its port to the child; keep polling the bounded fixture.
    }
    await sleep(20);
  }
  throw new Error(`Relay startup state did not become ${startupState}.`);
}

async function stopFixture(fixture: FixtureProcess): Promise<void> {
  for (const pidPath of [fixture.readyPidPath, fixture.childPidPath]) {
    if (existsSync(pidPath)) {
      const pid = Number((await readFile(pidPath, "utf8")).trim());
      if (Number.isSafeInteger(pid) && pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // The child may already have exited after the parent handoff.
        }
      }
    }
  }
  if (fixture.parent.exitCode === null && !fixture.parent.killed) fixture.parent.kill("SIGTERM");
  await sleep(100);
  await rm(fixture.root, { recursive: true, force: true });
}

async function waitForProcessExit(pid: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await sleep(20);
  }
  throw new Error(`Fixture child ${pid} did not exit.`);
}

async function waitForChildProcessExit(child: ChildProcess, timeoutMs = 5_000): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture parent did not exit.")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function startConflictingServer(port: number) {
  const server = createServer((_request, response) => {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("third-party");
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  while (fixtures.length > 0) await stopFixture(fixtures.pop()!);
});

describe("Relay bootstrap process", () => {
  it("serves pending health within 500 ms while child startup is synchronously blocked", async () => {
    const fixture = await launchFixture();
    const startedAt = performance.now();
    const response = await fetch(`http://127.0.0.1:${fixture.port}${RELAY_PATHS.health}`);
    const body = await response.json();

    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(body).toMatchObject({ ok: false, code: "RELAY_STARTUP_PENDING", startupState: "pending" });

    await writeFile(fixture.releasePath, "release\n", "utf8");
    await waitForFile(fixture.readyPidPath);
    const ready = await (await fetch(`http://127.0.0.1:${fixture.port}${RELAY_PATHS.health}`)).json();
    expect(ready).toMatchObject({ ok: true, message: "Relay is ready." });
  });

  it("stops the runtime child when only the bootstrap supervisor stops", async () => {
    const fixture = await launchFixture();
    await writeFile(fixture.releasePath, "release\n", "utf8");
    await waitForFile(fixture.readyPidPath);
    const childPid = Number((await readFile(fixture.readyPidPath, "utf8")).trim());
    expect(childPid).toBeGreaterThan(0);

    fixture.parent.kill("SIGTERM");
    await expect(waitForProcessExit(childPid)).resolves.toBeUndefined();
  });

  it("restores the failed bootstrap after a child fails during port handoff", async () => {
    const fixture = await launchFixture("fail-after-activation");
    await writeFile(fixture.releasePath, "release\n", "utf8");

    await expect(waitForStartupState(fixture, "failed")).resolves.toMatchObject({
      ok: false,
      code: "RELAY_STARTUP_FAILED",
      startupState: "failed",
    });
  });

  it("keeps a failed startup fail-closed when a late child result arrives", async () => {
    const fixture = await launchFixture("fail-late");
    await writeFile(fixture.releasePath, "release\n", "utf8");
    await expect(waitForStartupState(fixture, "failed")).resolves.toMatchObject({
      ok: false,
      code: "RELAY_STARTUP_FAILED",
      startupState: "failed",
    });

    await sleep(100);
    await expect(waitForStartupState(fixture, "failed")).resolves.toMatchObject({
      code: "RELAY_STARTUP_FAILED",
    });
  });

  it("accepts a compatibility handoff when the child exits immediately after its acknowledgement", async () => {
    const fixture = await launchFixture("handoff");
    await writeFile(fixture.releasePath, "release\n", "utf8");

    await expect(waitForChildProcessExit(fixture.parent)).resolves.toBe(0);
  });

  it("fails closed when another local process seizes the port during handoff", async () => {
    const fixture = await launchFixture("port-conflict");
    await writeFile(fixture.releasePath, "release\n", "utf8");
    await waitForFile(fixture.activationPath);
    const conflicting = await startConflictingServer(fixture.port);

    try {
      await writeFile(fixture.continuePath, "continue\n", "utf8");
      await expect(waitForChildProcessExit(fixture.parent)).resolves.toBe(1);

      const response = await fetch(`http://127.0.0.1:${fixture.port}${RELAY_PATHS.health}`);
      expect(response.status).toBe(503);
      await expect(response.text()).resolves.toBe("third-party");
    } finally {
      await closeServer(conflicting);
    }
  });

  it("terminates a protected-state child that exceeds the startup window", async () => {
    const fixture = await launchFixture("ready", 2_000);
    const childPid = Number((await readFile(fixture.childPidPath, "utf8")).trim());
    expect(childPid).toBeGreaterThan(0);

    await expect(waitForStartupState(fixture, "failed")).resolves.toMatchObject({
      code: "RELAY_STARTUP_FAILED",
      startupState: "failed",
    });
    await expect(waitForProcessExit(childPid)).resolves.toBeUndefined();
  });
});
