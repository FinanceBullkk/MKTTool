import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

const STOP_EXACT_PROCESSES = [
  "$ErrorActionPreference = 'Stop'",
  "$expected = @($env:MKT_UPDATE_BROWSER_PATH, $env:MKT_UPDATE_RELAY_PATH)",
  "$names = @('MKTBrowser', 'MKTTool-Relay')",
  "foreach ($name in $names) {",
  "  foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {",
  "    $processPath = $process.Path",
  "    if (-not $processPath) { throw \"Cannot verify the executable path for process $($process.Id).\" }",
  "    $owned = $expected | Where-Object { [string]::Equals([IO.Path]::GetFullPath($_), [IO.Path]::GetFullPath($processPath), [StringComparison]::OrdinalIgnoreCase) }",
  "    if ($owned) { Stop-Process -Id $process.Id -Force -ErrorAction Stop }",
  "  }",
  "}",
].join("; ");

export async function stopExactOwnedWindowsProcesses(paths: {
  browserExecutable: string;
  relayExecutable: string;
}): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Windows compatibility activation cannot run on this platform.");
  }
  await execFileAsync(
    POWERSHELL,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", STOP_EXACT_PROCESSES],
    {
      windowsHide: true,
      env: {
        ...process.env,
        MKT_UPDATE_BROWSER_PATH: paths.browserExecutable,
        MKT_UPDATE_RELAY_PATH: paths.relayExecutable,
      },
    },
  );
}
