import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { CompatibilityUpdatePlatform } from "./local-updater";
import type { CompatibilityArtifactKind } from "./update-state";
import {
  resolveWindowsCompatibilityInstallation,
  type WindowsCompatibilityInstallation,
} from "./windows-compatibility-installation";
import { activateWindowsEngineArtifact } from "./windows-engine-artifact-activation";
import { stopExactOwnedWindowsProcesses } from "./windows-owned-process-control";
import { ACTIVE_ENGINE_PIN_FILE } from "./active-engine-pin";
import { relayChildEnvironment } from "./relay-child-environment";

const execFileAsync = promisify(execFile);

export interface WindowsCompatibilityUpdatePlatformOptions {
  hasOpenProfiles: () => Promise<boolean>;
  installation?: WindowsCompatibilityInstallation;
  localAppData?: string;
  stopOwnedProcesses?: typeof stopExactOwnedWindowsProcesses;
  activateEngine?: typeof activateWindowsEngineArtifact;
  runInstaller?: (installerPath: string, installDirectory: string) => Promise<void>;
  startBrowser?: (browserExecutable: string) => Promise<void>;
  startRelay?: (relayExecutable: string) => Promise<void>;
}

export class WindowsCompatibilityUpdatePlatform implements CompatibilityUpdatePlatform {
  private readonly installation: WindowsCompatibilityInstallation;
  private readonly localAppData: string;

  constructor(private readonly options: WindowsCompatibilityUpdatePlatformOptions) {
    this.installation = options.installation ?? resolveWindowsCompatibilityInstallation();
    this.localAppData = options.localAppData ?? requireLocalAppData();
  }

  hasOpenProfiles(): Promise<boolean> {
    return this.options.hasOpenProfiles();
  }

  async stopOwnedProcesses(): Promise<void> {
    await (this.options.stopOwnedProcesses ?? stopExactOwnedWindowsProcesses)(this.installation);
  }

  async activateArtifact(kind: CompatibilityArtifactKind, artifactPath: string): Promise<void> {
    await this.applyArtifact(kind, artifactPath);
  }

  async restoreArtifact(kind: CompatibilityArtifactKind, artifactPath: string): Promise<void> {
    await this.applyArtifact(kind, artifactPath);
  }

  async startOwnedProcesses(): Promise<void> {
    await (this.options.startRelay ?? startDetached)(this.installation.relayExecutable);
    await (this.options.startBrowser ?? startDetached)(this.installation.browserExecutable);
  }

  private async applyArtifact(kind: CompatibilityArtifactKind, artifactPath: string): Promise<void> {
    if (!existsSync(artifactPath) || statSync(artifactPath).size <= 0) {
      throw new Error(`The staged ${kind} artifact is missing.`);
    }
    if (kind === "engine") {
      await (this.options.activateEngine ?? activateWindowsEngineArtifact)({
        archivePath: artifactPath,
        pinPath: path.join(path.dirname(artifactPath), ACTIVE_ENGINE_PIN_FILE),
        localAppData: this.localAppData,
      });
      return;
    }
    if (kind === "installer") {
      await (this.options.runInstaller ?? runSilentInstaller)(
        artifactPath,
        this.installation.browserDirectory,
      );
      return;
    }
    if (kind === "browser") {
      await assertSameFile(artifactPath, this.installation.browserPayload, "Browser payload");
      return;
    }
    if (kind === "relay") {
      await assertSameFile(artifactPath, this.installation.packagedRelayArchive, "Relay payload");
    }
  }
}

async function runSilentInstaller(installerPath: string, installDirectory: string): Promise<void> {
  await execFileAsync(installerPath, ["/S", `/D=${installDirectory}`], {
    env: relayChildEnvironment(),
    windowsHide: true,
  });
}

async function startDetached(executable: string): Promise<void> {
  const child = spawn(executable, [], {
    detached: true,
    env: relayChildEnvironment(),
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function assertSameFile(expected: string, actual: string, label: string): Promise<void> {
  if (!existsSync(actual) || statSync(actual).size !== statSync(expected).size) {
    throw new Error(`${label} does not match the signed compatibility artifact.`);
  }
  if ((await sha256File(actual)) !== (await sha256File(expected))) {
    throw new Error(`${label} does not match the signed compatibility artifact.`);
  }
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function requireLocalAppData(): string {
  const value = process.env.LOCALAPPDATA?.trim();
  if (!value) throw new Error("LOCALAPPDATA is required for Windows compatibility activation.");
  return value;
}
