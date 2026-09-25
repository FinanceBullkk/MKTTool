import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateRoot } from "./compatibility-update-marker";
import { handoffPreparedCompatibilityUpdate } from "./compatibility-update-handoff";

const roots: string[] = [];
const startupId = "741d4377-4c55-4fb0-8c41-133aaa15057a";
const helperId = "6ed2fc0c-ce26-4a86-a8db-211501d6eff1";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("prepared compatibility update handoff", () => {
  it("closes, coordinates, acknowledges the parent, then exits in order", async () => {
    const calls: string[] = [];
    const coordinate = vi.fn(async () => {
      calls.push("coordinate");
      return "exit" as const;
    });

    await handoffPreparedCompatibilityUpdate({
      server: server(calls),
      home: "C:\\Relay",
      executablePath: "C:\\Relay\\MKTTool-Relay.exe",
      startupChildId: startupId,
      coordinate,
      notifyHandoff: async (id) => {
        calls.push(`handoff:${id}`);
      },
      exit: (code) => {
        calls.push(`exit:${code}`);
      },
    });

    expect(calls).toEqual(["close", "coordinate", `handoff:${startupId}`, "exit:0"]);
    expect(coordinate).toHaveBeenCalledWith({
      home: "C:\\Relay",
      argv: [],
      executablePath: "C:\\Relay\\MKTTool-Relay.exe",
      converge: expect.any(Function),
    });
  });

  it("bounds a held loopback connection before coordinating the helper", async () => {
    const calls: string[] = [];
    let close: (() => void) | undefined;

    await handoffPreparedCompatibilityUpdate({
      server: {
        listening: true,
        close(callback) {
          calls.push("close");
          close = () => callback();
        },
        closeAllConnections() {
          calls.push("force-close");
          close?.();
        },
      },
      home: "C:\\Relay",
      executablePath: "C:\\Relay\\MKTTool-Relay.exe",
      startupChildId: null,
      coordinate: async () => {
        calls.push("coordinate");
        return "exit";
      },
      exit: (code) => {
        calls.push(`exit:${code}`);
      },
      drainTimeoutMs: 0,
    });

    expect(calls).toEqual(["close", "force-close", "coordinate", "exit:0"]);
  });

  it("exits after a fresh helper lock confirms active convergence", async () => {
    const home = createHome();
    const lockPath = path.join(updateRoot(home), "compatibility-helper.lock.json");
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(
      lockPath,
      `${JSON.stringify({ schemaVersion: 1, helperId, createdAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    const exit = vi.fn();
    const notifyHandoff = vi.fn(async () => {});

    await handoffPreparedCompatibilityUpdate({
      server: server([]),
      home,
      executablePath: "MKTTool-Relay.exe",
      startupChildId: startupId,
      notifyHandoff,
      exit,
    });

    expect(notifyHandoff).toHaveBeenCalledWith(startupId);
    expect(exit).toHaveBeenCalledWith(0);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("notifies startup failure and exits fail-closed when coordination fails", async () => {
    const calls: string[] = [];

    await handoffPreparedCompatibilityUpdate({
      server: server(calls),
      home: "C:\\Relay",
      executablePath: "C:\\Relay\\MKTTool-Relay.exe",
      startupChildId: startupId,
      coordinate: async () => {
        calls.push("coordinate");
        throw new Error("fixture coordination failure at C:\\sensitive-path");
      },
      notifyFailure: async (id) => {
        calls.push(`failed:${id}`);
      },
      reportError: (message) => {
        calls.push(`error:${message}`);
      },
      exit: (code) => {
        calls.push(`exit:${code}`);
      },
    });

    expect(calls).toEqual([
      "close",
      "coordinate",
      `failed:${startupId}`,
      "error:Compatibility helper could not start; Relay remains unavailable until repair.",
      "exit:1",
    ]);
  });
});

function createHome(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-update-handoff-"));
  roots.push(root);
  const home = path.join(root, "MKTTool-Relay");
  mkdirSync(home, { recursive: true });
  return home;
}

function server(calls: string[]) {
  return {
    listening: true,
    close(callback: (error?: Error) => void): void {
      calls.push("close");
      callback();
    },
  };
}
