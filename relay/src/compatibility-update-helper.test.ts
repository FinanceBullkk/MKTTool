import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateRoot } from "./compatibility-update-marker";
import { coordinateCompatibilityUpdateHelper } from "./compatibility-update-helper";

const roots: string[] = [];
const helperId = "741d4377-4c55-4fb0-8c41-133aaa15057a";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("compatibility update helper", () => {
  it("hands a pending update to one detached helper", async () => {
    const home = createHome();
    const launchHelper = vi.fn(async () => {});
    await expect(
      coordinateCompatibilityUpdateHelper({
        home,
        argv: [],
        executablePath: "MKTTool-Relay.exe",
        converge: async () => {},
        launchHelper,
        now: () => new Date("2026-08-15T00:00:00.000Z"),
        newHelperId: () => helperId,
      }),
    ).resolves.toBe("exit");
    expect(launchHelper).toHaveBeenCalledWith(helperId);
    expect(JSON.parse(readFileSync(lockPath(home), "utf8"))).toMatchObject({ helperId });
  });

  it("does not recurse when the installer starts the newly installed Relay", async () => {
    const home = createHome();
    writeLock(home, "2026-08-15T00:00:00.000Z");
    const launchHelper = vi.fn();
    await expect(
      coordinateCompatibilityUpdateHelper({
        home,
        argv: [],
        executablePath: "MKTTool-Relay.exe",
        converge: async () => {},
        launchHelper,
        now: () => new Date("2026-08-15T00:01:00.000Z"),
      }),
    ).resolves.toBe("exit");
    expect(launchHelper).not.toHaveBeenCalled();
  });

  it("lets only the matching helper converge and clears its lock", async () => {
    const home = createHome();
    writeLock(home, "2026-08-15T00:00:00.000Z");
    const converge = vi.fn(async () => {});
    await expect(
      coordinateCompatibilityUpdateHelper({
        home,
        argv: [`--mkt-compatibility-helper=${helperId}`],
        executablePath: "helper.exe",
        converge,
      }),
    ).resolves.toBe("exit");
    expect(converge).toHaveBeenCalledOnce();
    expect(existsSync(lockPath(home))).toBe(false);
  });

  it("clears the lock after failed convergence so startup can retry", async () => {
    const home = createHome();
    writeLock(home, "2026-08-15T00:00:00.000Z");
    await expect(
      coordinateCompatibilityUpdateHelper({
        home,
        argv: [`--mkt-compatibility-helper=${helperId}`],
        executablePath: "helper.exe",
        converge: async () => {
          throw new Error("injected convergence failure");
        },
      }),
    ).rejects.toThrow("injected convergence failure");
    expect(existsSync(lockPath(home))).toBe(false);
  });

  it("replaces a stale helper lock", async () => {
    const home = createHome();
    writeLock(home, "2026-08-15T00:00:00.000Z");
    const launchHelper = vi.fn(async () => {});
    await coordinateCompatibilityUpdateHelper({
      home,
      argv: [],
      executablePath: "MKTTool-Relay.exe",
      converge: async () => {},
      launchHelper,
      now: () => new Date("2026-08-15T00:06:00.000Z"),
      newHelperId: () => "6ed2fc0c-ce26-4a86-a8db-211501d6eff1",
    });
    expect(launchHelper).toHaveBeenCalledWith("6ed2fc0c-ce26-4a86-a8db-211501d6eff1");
  });

  it("keeps an old helper lock while the claimed process is still running", async () => {
    const home = createHome();
    writeLock(home, "2026-08-15T00:00:00.000Z", 4242);
    const launchHelper = vi.fn(async () => {});
    await coordinateCompatibilityUpdateHelper({
      home,
      argv: [],
      executablePath: "MKTTool-Relay.exe",
      converge: async () => {},
      launchHelper,
      isProcessRunning: (pid) => pid === 4242,
      now: () => new Date("2026-08-15T00:06:00.000Z"),
    });
    expect(launchHelper).not.toHaveBeenCalled();
  });
});

function createHome(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-helper-"));
  roots.push(root);
  const home = path.join(root, "MKTTool-Relay");
  mkdirSync(home, { recursive: true });
  return home;
}

function writeLock(home: string, createdAt: string, pid?: number): void {
  mkdirSync(updateRoot(home), { recursive: true });
  writeFileSync(lockPath(home), JSON.stringify({ schemaVersion: 1, helperId, createdAt, pid }));
}

function lockPath(home: string): string {
  return path.join(updateRoot(home), "compatibility-helper.lock.json");
}
