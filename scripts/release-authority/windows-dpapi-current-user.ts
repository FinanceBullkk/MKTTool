import { execFileSync } from "node:child_process";
import path from "node:path";

const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

const PROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$plain = [Convert]::FromBase64String([Console]::In.ReadToEnd())",
  "$cipher = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($cipher))",
].join("; ");

const UNPROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$cipher = [Convert]::FromBase64String([Console]::In.ReadToEnd())",
  "$plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($plain))",
].join("; ");

/**
 * The delegated release key has a different owner and lifecycle from Relay secrets, so it uses a
 * dedicated store while retaining the same DPAPI CurrentUser boundary.
 */
export function protectForCurrentWindowsUser(value: Buffer): string {
  return runDpapi(PROTECT_SCRIPT, value.toString("base64"), "protect the delegated release key");
}

export function unprotectForCurrentWindowsUser(encoded: string): Buffer {
  return Buffer.from(
    runDpapi(UNPROTECT_SCRIPT, encoded.trim(), "decrypt the delegated release key"),
    "base64",
  );
}

function runDpapi(script: string, input: string, operation: string): string {
  if (process.platform !== "win32") throw new Error(`Windows DPAPI cannot ${operation} on this host.`);
  try {
    return execFileSync(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      input,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch (error) {
    throw new Error(`Windows DPAPI could not ${operation}: ${(error as Error).message}`);
  }
}
