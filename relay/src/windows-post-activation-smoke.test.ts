import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  updateRoot,
  writeCompatibilityUpdateMarker,
} from "./compatibility-update-marker";
import { WindowsPostActivationSmoke } from "./windows-post-activation-smoke";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(path.dirname(home), { recursive: true, force: true });
});

describe("Windows post-activation smoke", () => {
  it("issues one short-lived authorization bound to the smoke marker", async () => {
    const home = createHome("smoke");
    const runBrowser = vi.fn(async (_executable: string, args: string[]) => {
      const authorizationId = args[0].split("=")[1];
      const file = path.join(
        updateRoot(home),
        "smoke-authorizations",
        `${authorizationId}.json`,
      );
      const authorization = JSON.parse(readFileSync(file, "utf8"));
      expect(authorization).toMatchObject({
        schemaVersion: 1,
        type: "mkttool.compatibility-smoke-authorization",
        authorizationId,
        sequence: 7,
        manifestDigest: "a".repeat(64),
        profileId: "smoke-profile",
        issuedAt: "2026-08-15T00:00:00.000Z",
        expiresAt: "2026-08-15T00:01:00.000Z",
      });
    });
    await new WindowsPostActivationSmoke({
      home,
      browserExecutable: "C:\\Program Files\\MKTBrowser\\MKTBrowser.exe",
      runBrowser,
      now: () => new Date("2026-08-15T00:00:00.000Z"),
      newAuthorizationId: () => "741d4377-4c55-4fb0-8c41-133aaa15057a",
    }).run("smoke-profile");
    expect(runBrowser).toHaveBeenCalledWith(
      "C:\\Program Files\\MKTBrowser\\MKTBrowser.exe",
      ["--mkt-compatibility-smoke=741d4377-4c55-4fb0-8c41-133aaa15057a"],
    );
    expect(
      existsSync(
        path.join(
          updateRoot(home),
          "smoke-authorizations",
          "741d4377-4c55-4fb0-8c41-133aaa15057a.json",
        ),
      ),
    ).toBe(false);
  });

  it("cleans the authorization when Browser smoke fails", async () => {
    const home = createHome("smoke");
    const smoke = new WindowsPostActivationSmoke({
      home,
      browserExecutable: "MKTBrowser.exe",
      runBrowser: async () => {
        throw new Error("browser failed");
      },
      newAuthorizationId: () => "741d4377-4c55-4fb0-8c41-133aaa15057a",
    });
    await expect(smoke.run("smoke-profile")).rejects.toThrow("browser failed");
    expect(
      existsSync(
        path.join(
          updateRoot(home),
          "smoke-authorizations",
          "741d4377-4c55-4fb0-8c41-133aaa15057a.json",
        ),
      ),
    ).toBe(false);
  });

  it("refuses to issue Browser authorization outside the smoke phase", async () => {
    const home = createHome("activating");
    const runBrowser = vi.fn();
    await expect(
      new WindowsPostActivationSmoke({ home, browserExecutable: "MKTBrowser.exe", runBrowser }).run(
        "smoke-profile",
      ),
    ).rejects.toThrow("marker must authorize");
    expect(runBrowser).not.toHaveBeenCalled();
  });
});

function createHome(phase: "smoke" | "activating"): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-windows-smoke-"));
  const home = path.join(root, "MKTTool-Relay");
  homes.push(home);
  mkdirSync(home, { recursive: true });
  writeCompatibilityUpdateMarker(home, {
    mode: "update",
    target: {
      sequence: 7,
      manifestDigest: "a".repeat(64),
      versions: {
        installer: "1",
        relay: "1",
        browser: "1",
        controlContract: "1",
        engine: "1",
      },
    },
    smokeProfileId: "smoke-profile",
    phase,
    activatedArtifacts: [],
  });
  return home;
}
