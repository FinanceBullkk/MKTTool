import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ACTIVE_ENGINE_PIN_FILE } from "./active-engine-pin";
import { activateWindowsEngineArtifact } from "./windows-engine-artifact-activation";
import {
  browserDirectoryFromUninstallString,
  type WindowsCompatibilityInstallation,
} from "./windows-compatibility-installation";
import { WindowsCompatibilityUpdatePlatform } from "./windows-compatibility-update-platform";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Windows compatibility update platform", () => {
  it("resolves a custom Browser install directory from the uninstall command", () => {
    expect(
      browserDirectoryFromUninstallString(
        '"D:\\Internal Apps\\MKTBrowser\\Uninstall MKTBrowser.exe" /currentuser',
      ),
    ).toBe("D:\\Internal Apps\\MKTBrowser");
  });

  /**
   * Windows-only, for the same reason `windows-secure-store.test.ts` is: the subject *is* the
   * Windows-specific behaviour, not logic that happens to run there.
   *
   * `windows-engine-artifact-activation.ts` lays the runtime out with `path.win32` and moves it into
   * place with directory renames. On Linux a backslash is an ordinary filename character, so every
   * one of those paths collapses into a single flat name in one directory and the parent/child
   * relationships the activation depends on stop existing. A version of this test rewritten to pass
   * there would be asserting an arrangement that never occurs in production.
   *
   * The cross-platform route was taken where it was available — see `compatibility-local-identity.test.ts`,
   * which tests business logic and now runs everywhere. This one has no such route.
   */
  it.skipIf(process.platform !== "win32")("atomically installs the signed engine archive into the stable runtime", async () => {
    const root = tempRoot();
    const localAppData = path.join(root, "LocalAppData");
    const staged = path.join(root, "staged");
    mkdirSync(staged, { recursive: true });
    const archivePath = path.join(staged, "engine.artifact");
    const pinPath = path.join(staged, ACTIVE_ENGINE_PIN_FILE);
    writeFileSync(archivePath, "archive");
    writeFileSync(
      pinPath,
      JSON.stringify({
        schemaVersion: 1,
        sequence: 2,
        engineKind: "cloakbrowser",
        version: "146.0.7680.177.5",
        url: "https://releases.example/engine.zip",
        sha256: "a".repeat(64),
        sizeBytes: 7,
      }),
    );

    await activateWindowsEngineArtifact({
      archivePath,
      pinPath,
      localAppData,
      extractArchive: async (_archive, destination) => {
        const bundle = path.join(destination, "cloakbrowser-windows-x64");
        mkdirSync(bundle, { recursive: true });
        writeFileSync(path.join(bundle, "chrome.exe"), "chrome");
        writeFileSync(path.join(bundle, "resources.pak"), "resources");
      },
    });

    const runtime = path.win32.join(
      localAppData,
      "MKTTool",
      "MKTBrowser",
      "chromium",
      "cloakbrowser",
      "runtime",
    );
    expect(readFileSync(path.win32.join(runtime, "chrome.exe"), "utf8")).toBe("chrome");
    expect(JSON.parse(readFileSync(path.win32.join(runtime, ".mkt-runtime.json"), "utf8"))).toEqual({
      version: "146.0.7680.177.5",
    });
  });

  it("runs the installer then verifies the installed Browser and Relay payloads", async () => {
    const root = tempRoot();
    const staged = path.join(root, "staged");
    const installed = path.join(root, "installed");
    const relayDirectory = path.join(root, "relay");
    mkdirSync(staged, { recursive: true });
    mkdirSync(path.join(installed, "resources", "relay"), { recursive: true });
    mkdirSync(relayDirectory, { recursive: true });
    const artifacts = {
      engine: writeArtifact(staged, "engine", "engine"),
      installer: writeArtifact(staged, "installer", "installer"),
      browser: writeArtifact(staged, "browser", "browser"),
      relay: writeArtifact(staged, "relay", "relay"),
      controlContract: writeArtifact(staged, "controlContract", "contract"),
    };
    writeFileSync(path.join(staged, ACTIVE_ENGINE_PIN_FILE), "{}");
    const installation: WindowsCompatibilityInstallation = {
      browserDirectory: installed,
      browserExecutable: writeArtifact(installed, "MKTBrowser", "exe", ".exe"),
      browserPayload: path.join(installed, "resources", "app.asar"),
      packagedRelayArchive: path.join(installed, "resources", "relay", "MKTTool-Relay.zip"),
      relayExecutable: writeArtifact(relayDirectory, "MKTTool-Relay", "exe", ".exe"),
    };
    const calls: string[] = [];
    const platform = new WindowsCompatibilityUpdatePlatform({
      installation,
      localAppData: path.join(root, "local"),
      hasOpenProfiles: async () => false,
      stopOwnedProcesses: async () => void calls.push("stop"),
      activateEngine: async () => void calls.push("engine"),
      runInstaller: async () => {
        calls.push("installer");
        writeFileSync(installation.browserPayload, "browser");
        writeFileSync(installation.packagedRelayArchive, "relay");
      },
      startBrowser: async () => void calls.push("start-browser"),
      startRelay: async () => void calls.push("start-relay"),
    });

    await platform.stopOwnedProcesses();
    for (const kind of ["engine", "installer", "browser", "relay", "controlContract"] as const) {
      await platform.activateArtifact(kind, artifacts[kind]);
    }
    await platform.startOwnedProcesses();
    expect(calls).toEqual(["stop", "engine", "installer", "start-relay", "start-browser"]);
  });
});

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkt-windows-update-"));
  roots.push(root);
  return root;
}

function writeArtifact(
  directory: string,
  name: string,
  contents: string,
  extension = ".artifact",
): string {
  const file = path.join(directory, `${name}${extension}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
  return file;
}
