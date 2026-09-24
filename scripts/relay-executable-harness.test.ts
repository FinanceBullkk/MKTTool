import type { ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isRelayInitializationComplete,
  stopRelayProcess,
  stopRelayAndRemoveTempHomes,
} from "./relay-executable-harness";

const PUBLIC_KEY = "a".repeat(64);
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "mkttool-relay-harness-test-"));
  temporaryDirectories.push(directory);
  writeFileSync(path.join(directory, "fixture.txt"), "fixture", "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Relay executable harness health gate", () => {
  it("rejects the bootstrap listener even though it answers HTTP", () => {
    expect(isRelayInitializationComplete({
      ok: false,
      code: "RELAY_STARTUP_PENDING",
      startupState: "pending",
      relayVersion: 20,
    })).toBe(false);
  });

  it("accepts an initialized but not-yet-configured Relay", () => {
    expect(isRelayInitializationComplete({
      ok: false,
      message: "Relay still needs configuration.",
      publicKey: PUBLIC_KEY,
      relayVersion: 20,
    })).toBe(true);
  });

  it("rejects a failed or malformed health reply", () => {
    expect(isRelayInitializationComplete({
      ok: false,
      code: "RELAY_STARTUP_FAILED",
      startupState: "failed",
      relayVersion: 20,
    })).toBe(false);
    expect(isRelayInitializationComplete({ publicKey: PUBLIC_KEY, relayVersion: "20" })).toBe(false);
  });

  it("waits for the Relay process to exit before deleting its owned directories", async () => {
    const home = makeTemporaryDirectory();
    const stagingDir = makeTemporaryDirectory();
    const events: string[] = [];
    const relay = {
      output: () => "",
      stop: () => events.push("stop"),
      forceStop: () => events.push("force-stop"),
      waitForExit: async () => {
        events.push("wait-for-exit");
        expect(existsSync(home)).toBe(true);
        expect(existsSync(stagingDir)).toBe(true);
        return 0;
      },
    };

    await stopRelayAndRemoveTempHomes(relay, [home, stagingDir]);

    expect(events).toEqual(["stop", "wait-for-exit"]);
    expect(existsSync(home)).toBe(false);
    expect(existsSync(stagingDir)).toBe(false);
  });

  it("fails closed when the Relay process cannot be confirmed stopped", async () => {
    const home = makeTemporaryDirectory();
    const relay = {
      output: () => "",
      stop: () => undefined,
      forceStop: () => undefined,
      waitForExit: async () => null,
    };

    await expect(stopRelayAndRemoveTempHomes(relay, [home])).rejects.toThrow(
      "could not confirm process exit",
    );
    expect(existsSync(home)).toBe(true);
  });

  it("escalates to a forced stop before deleting owned directories", async () => {
    const home = makeTemporaryDirectory();
    const events: string[] = [];
    let waits = 0;
    const relay = {
      output: () => "",
      stop: () => events.push("stop"),
      forceStop: () => events.push("force-stop"),
      waitForExit: async () => {
        waits++;
        events.push(`wait-${waits}`);
        expect(existsSync(home)).toBe(true);
        return waits === 1 ? null : 0;
      },
    };

    await stopRelayAndRemoveTempHomes(relay, [home]);

    expect(events).toEqual(["stop", "wait-1", "force-stop", "wait-2"]);
    expect(existsSync(home)).toBe(false);
  });

  it("does not mistake a previously sent signal for process exit", () => {
    const signals: NodeJS.Signals[] = [];
    const child = {
      exitCode: null,
      signalCode: null,
      killed: true,
      pid: undefined,
      kill: (signal: NodeJS.Signals) => {
        signals.push(signal);
        return true;
      },
    } as unknown as ChildProcess;

    stopRelayProcess(child, "SIGKILL");

    expect(signals).toEqual(["SIGKILL"]);
  });

  it("does not target a PID after a signal-confirmed exit", () => {
    const signals: NodeJS.Signals[] = [];
    const child = {
      exitCode: null,
      signalCode: "SIGTERM",
      killed: true,
      pid: 12345,
      kill: (signal: NodeJS.Signals) => {
        signals.push(signal);
        return true;
      },
    } as unknown as ChildProcess;

    stopRelayProcess(child, "SIGKILL");

    expect(signals).toEqual([]);
  });
});
