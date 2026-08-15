import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCompatibilityUpdateMarker,
  readCompatibilityUpdateMarker,
  writeCompatibilityUpdateMarker,
} from "./compatibility-update-marker";
import { InMemorySecureStore } from "./in-memory-secure-store";
import {
  readCompatibilityUpdateState,
  writeCompatibilityUpdateState,
  type CompatibilityUpdateState,
} from "./update-state";
import type { CompatibilityUpdateHelperOptions } from "./compatibility-update-helper";
import type { LocalUpdaterOptions } from "./local-updater";
import { handleWindowsCompatibilityStartup } from "./windows-compatibility-startup";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Windows compatibility startup", () => {
  it("initializes protected state before a clean install creates device identity", async () => {
    const fixture = createFixture(null);
    await expect(
      handleWindowsCompatibilityStartup(fixture.home, fixture.store, {
        installerFloorSequence: 4,
        localIdentityDataExists: () => false,
      }),
    ).resolves.toBe(false);
    expect(readCompatibilityUpdateState(fixture.store)).toMatchObject({
      highestAcceptedSequence: 3,
      rollbackFloorSequence: 4,
      current: null,
    });
  });

  it("leaves missing state for ADMIN repair when local identity data already exists", async () => {
    const fixture = createFixture(null);
    await expect(
      handleWindowsCompatibilityStartup(fixture.home, fixture.store, {
        installerFloorSequence: 4,
        localIdentityDataExists: () => true,
      }),
    ).resolves.toBe(false);
    expect(readCompatibilityUpdateState(fixture.store)).toBeNull();
  });

  it("continues normally when protected state exists without a pending transition", async () => {
    const fixture = createFixture({ pending: null });
    writeCompatibilityUpdateMarker(fixture.home, pending());
    await expect(handleWindowsCompatibilityStartup(fixture.home, fixture.store)).resolves.toBe(false);
    expect(readCompatibilityUpdateMarker(fixture.home)).toBeNull();
  });

  it("recreates the marker and hands pending convergence to the helper", async () => {
    const fixture = createFixture({ pending: pending() });
    clearCompatibilityUpdateMarker(fixture.home);
    let observedSmokeProfileId = "";
    const converge = vi.fn(async (options: LocalUpdaterOptions) => {
      observedSmokeProfileId = options.testProfileId;
    });
    const coordinate = vi.fn(async (options: CompatibilityUpdateHelperOptions) => {
      expect(readCompatibilityUpdateMarker(fixture.home)).toMatchObject({ sequence: 2, phase: "staged" });
      await options.converge();
      return "exit" as const;
    });
    await expect(
      handleWindowsCompatibilityStartup(fixture.home, fixture.store, {
        resolveInstallation: () => installation(),
        createPlatform: () => platform(),
        createSmoke: () => ({ run: async () => {} }),
        coordinate,
        converge,
        argv: [],
        executablePath: "MKTTool-Relay.exe",
      }),
    ).resolves.toBe(true);
    expect(observedSmokeProfileId).toBe("smoke-profile");
  });

  it("blocks an orphan marker when protected state is missing", async () => {
    const fixture = createFixture(null);
    writeCompatibilityUpdateMarker(fixture.home, pending());
    await expect(
      handleWindowsCompatibilityStartup(fixture.home, fixture.store, {
        localIdentityDataExists: () => false,
      }),
    ).rejects.toThrow("startup is blocked");
  });
});

function createFixture(overrides: Partial<CompatibilityUpdateState> | null) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-startup-"));
  roots.push(root);
  const home = path.join(root, "MKTTool-Relay");
  mkdirSync(home, { recursive: true });
  const store = new InMemorySecureStore();
  if (overrides) {
    writeCompatibilityUpdateState(store, {
      schemaVersion: 1,
      highestAcceptedSequence: 1,
      rollbackFloorSequence: 1,
      smokeProfileId: null,
      current: setRecord(1),
      retained: null,
      pending: null,
      usedRollbackAuthorizationIds: [],
      revokedDelegatedKeyIds: [],
      ...overrides,
    });
  }
  return { home, store };
}

function pending() {
  return {
    mode: "update" as const,
    target: setRecord(2),
    smokeProfileId: "smoke-profile",
    phase: "staged" as const,
    activatedArtifacts: [],
  };
}

function setRecord(sequence: number) {
  return {
    sequence,
    manifestDigest: String(sequence).repeat(64),
    versions: {
      installer: "1",
      relay: "1",
      browser: "1",
      controlContract: "1",
      engine: "1",
    },
  };
}

function installation() {
  return {
    browserDirectory: "browser",
    browserExecutable: "MKTBrowser.exe",
    browserPayload: "app.asar",
    packagedRelayArchive: "MKTTool-Relay.zip",
    relayExecutable: "MKTTool-Relay.exe",
  };
}

function platform() {
  return {
    hasOpenProfiles: async () => false,
    stopOwnedProcesses: async () => {},
    activateArtifact: async () => {},
    restoreArtifact: async () => {},
    startOwnedProcesses: async () => {},
  };
}
