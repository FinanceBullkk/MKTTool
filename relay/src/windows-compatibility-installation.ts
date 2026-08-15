import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

export interface WindowsCompatibilityInstallation {
  browserDirectory: string;
  browserExecutable: string;
  browserPayload: string;
  packagedRelayArchive: string;
  relayExecutable: string;
}

export function resolveWindowsCompatibilityInstallation(
  env: NodeJS.ProcessEnv = process.env,
): WindowsCompatibilityInstallation {
  const localAppData = env.LOCALAPPDATA?.trim();
  if (!localAppData || !path.win32.isAbsolute(localAppData)) {
    throw new Error("LOCALAPPDATA is required to resolve the Windows compatibility installation.");
  }
  const configuredDirectory = env.MKT_BROWSER_INSTALL_DIR?.trim();
  const browserDirectory = configuredDirectory
    ? path.win32.resolve(configuredDirectory)
    : readInstalledBrowserDirectory() ?? path.win32.join(localAppData, "Programs", "MKTBrowser");
  const installation = {
    browserDirectory,
    browserExecutable: path.win32.join(browserDirectory, "MKTBrowser.exe"),
    browserPayload: path.win32.join(browserDirectory, "resources", "app.asar"),
    packagedRelayArchive: path.win32.join(
      browserDirectory,
      "resources",
      "relay",
      "MKTTool-Relay.zip",
    ),
    relayExecutable: path.win32.join(localAppData, "MKTTool-Relay", "MKTTool-Relay.exe"),
  };
  if (!existsSync(installation.browserExecutable)) {
    throw new Error("The installed MKT Browser executable could not be found; installer repair is required.");
  }
  if (!existsSync(installation.relayExecutable)) {
    throw new Error("The installed MKTTool Relay executable could not be found; installer repair is required.");
  }
  return installation;
}

export function browserDirectoryFromUninstallString(value: string): string | null {
  const match = /^\s*"([^"]+\.exe)"/i.exec(value) ?? /^\s*([^\s]+\.exe)/i.exec(value);
  return match ? path.win32.dirname(match[1]) : null;
}

function readInstalledBrowserDirectory(): string | null {
  if (process.platform !== "win32") return null;
  const script = [
    "$items = Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue",
    "$value = $items | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -eq 'MKT Browser' } | Select-Object -First 1 -ExpandProperty UninstallString",
    "if ($value) { [Console]::Out.Write($value) }",
  ].join("; ");
  try {
    const uninstall = execFileSync(
      POWERSHELL,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    return uninstall ? browserDirectoryFromUninstallString(uninstall) : null;
  } catch {
    return null;
  }
}
