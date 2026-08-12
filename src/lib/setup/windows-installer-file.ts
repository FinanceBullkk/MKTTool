import { existsSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";

export const WINDOWS_INSTALLER_FILE_NAME = "MKTBrowser-win-x64.exe";

export interface WindowsInstallerFile {
  available: boolean;
  path: string;
}

export function readWindowsInstallerFile(): WindowsInstallerFile {
  const configured = process.env.MKT_BROWSER_INSTALLER_PATH?.trim();
  const installerPath = configured || path.join(process.cwd(), "release", WINDOWS_INSTALLER_FILE_NAME);
  if (!existsSync(/* turbopackIgnore: true */ installerPath)) return { available: false, path: installerPath };
  return { available: true, path: installerPath };
}

export async function openWindowsInstaller(installer: WindowsInstallerFile) {
  if (!installer.available) throw new Error("Windows installer is not available.");
  const handle = await open(installer.path, "r");
  const stat = await handle.stat();
  return { stream: handle.createReadStream(), sizeBytes: stat.size };
}
