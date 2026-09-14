import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
/**
 * Engines a disposable root can stage. The product refuses a proxied launch unless a WebRTC
 * containment rule names the exact binary it is about to start, and the rule is per engine — so a
 * gate that only ever provisioned the CFT rule could only ever test CFT, which is the compatibility
 * engine rather than the one an operator runs.
 */
export type SmokeEngine = "cft" | "cloakbrowser";

/** Must match `firewallRuleNameForEngine` in the desktop; the product matches on this exact text. */
export function webRtcRuleDisplayName(engine: SmokeEngine): string {
  return `MKT Browser WebRTC UDP Block (${engine === "cft" ? "Chrome for Testing" : "CloakBrowser"})`;
}

export const CFT_RULE_DISPLAY_NAME = webRtcRuleDisplayName("cft");
type RunPowerShell = (script: string, env: NodeJS.ProcessEnv) => Promise<string>;
const runPowerShell: RunPowerShell = async (script, env) => {
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env, encoding: "utf8", windowsHide: true, timeout: 30_000,
  });
  return stdout.trim();
};

export function assertDisposableVmFirewallHost(platform: NodeJS.Platform, state: {
  manufacturer?: string; model?: string; existingRuleCount?: number; firewallEnabled?: boolean;
}): void {
  if (platform !== "win32" || state.model !== "VirtualBox" ||
    !["Oracle Corporation", "innotek GmbH"].includes(state.manufacturer ?? "")) {
    throw new Error("Disposable firewall provisioning requires a positively identified Windows VirtualBox guest.");
  }
  if (state.existingRuleCount !== 0) throw new Error("An existing WebRTC firewall display-name rule prevents disposable provisioning.");
  if (state.firewallEnabled !== true) throw new Error("All Windows firewall profiles must already be enabled.");
}

/**
 * Refuse to continue unless this really is a throwaway VirtualBox guest.
 *
 * The installed-root gate drives the product at its own data root: it creates a profile there and
 * cannot delete it again, because the adapter exposes no delete. That is harmless on a guest whose
 * snapshot is about to be discarded and unacceptable anywhere else, so the identity check is the
 * only thing standing between the two - and it fails closed on any reading it cannot make.
 */
export async function assertThrowawayVirtualBoxGuest(options: {
  platform?: NodeJS.Platform; run?: RunPowerShell;
} = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") throw new Error("The installed-root gate requires Windows.");
  const run = options.run ?? runPowerShell;
  const env = {
    NODE_ENV: process.env.NODE_ENV, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    PATH: process.env.PATH, PSModulePath: process.env.PSModulePath,
  };
  const state = JSON.parse(await run(
    "$ErrorActionPreference='Stop'; $m=Get-CimInstance Win32_ComputerSystem; " +
      "@{manufacturer=$m.Manufacturer;model=$m.Model} | ConvertTo-Json -Compress",
    env,
  )) as { manufacturer?: string; model?: string };
  if (state.model !== "VirtualBox" ||
    !["Oracle Corporation", "innotek GmbH"].includes(state.manufacturer ?? "")) {
    throw new Error(
      "The installed-root gate runs only on a positively identified throwaway VirtualBox guest; " +
        "it creates a profile in the real product root and cannot remove it.",
    );
  }
}

export async function provisionDisposableWebRtcFirewall(options: {
  enabled: boolean; root: string; executable: string; engine?: SmokeEngine;
  platform?: NodeJS.Platform; run?: RunPowerShell;
}): Promise<() => Promise<void>> {
  if (!options.enabled) return async () => {};
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") throw new Error("Disposable firewall provisioning requires Windows.");
  const engine = options.engine ?? "cft";
  const expected = path.resolve(options.root, "chromium", engine, "runtime", "chrome.exe");
  if (path.resolve(options.executable).toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Disposable firewall executable must be the owned staged engine runtime.");
  }
  const run = options.run ?? runPowerShell;
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH,
    PSModulePath: process.env.PSModulePath, ProgramFiles: process.env.ProgramFiles,
    MKT_CFT_RULE_NAME: `mkt-cft-smoke-${randomUUID()}`,
    MKT_CFT_RULE_DISPLAY: webRtcRuleDisplayName(engine), MKT_CFT_RULE_EXE: expected,
  };
  const guard = [
    "$ErrorActionPreference='Stop'",
    "$machine=Get-CimInstance Win32_ComputerSystem",
    "if($machine.Model -ne 'VirtualBox' -or $machine.Manufacturer -notin @('Oracle Corporation','innotek GmbH')){throw 'not-disposable-vm'}",
    "$policy=New-Object -ComObject HNetCfg.FwPolicy2",
    "$existing=@($policy.Rules | Where-Object { $_.Name -eq $env:MKT_CFT_RULE_DISPLAY })",
    "if($existing.Count -ne 0){throw 'existing-cft-rule'}",
    "$enabled=@(1,2,4 | Where-Object { -not $policy.FirewallEnabled($_) }).Count -eq 0",
    "if(-not $enabled){throw 'firewall-disabled'}",
  ].join(";");
  const state = JSON.parse(await run(`${guard}; @{manufacturer=$machine.Manufacturer;model=$machine.Model;existingRuleCount=$existing.Count;firewallEnabled=$enabled} | ConvertTo-Json -Compress`, env));
  assertDisposableVmFirewallHost(platform, state);

  const cleanup = async () => {
    await run([
      "$ErrorActionPreference='Stop'",
      "$rule=Get-NetFirewallRule -PolicyStore PersistentStore | Where-Object { $_.Name -eq $env:MKT_CFT_RULE_NAME }",
      "if($rule){",
      "$program=($rule | Get-NetFirewallApplicationFilter).Program",
      "if($rule.DisplayName -ne $env:MKT_CFT_RULE_DISPLAY -or $program -ne $env:MKT_CFT_RULE_EXE){throw 'owned-rule-changed'}",
      "$rule | Remove-NetFirewallRule -ErrorAction Stop",
      "}",
    ].join(";"), env);
  };
  try {
    // Repeat identity/state guards in the mutating process; never replace installer rules.
    await run(`${guard}; New-NetFirewallRule -PolicyStore PersistentStore -Name $env:MKT_CFT_RULE_NAME -DisplayName $env:MKT_CFT_RULE_DISPLAY -Program $env:MKT_CFT_RULE_EXE -Protocol UDP -Direction Outbound -Action Block -Profile Any -Enabled True -ErrorAction Stop | Out-Null`, env);
  } catch (error) {
    try { await cleanup(); } catch { throw new Error("Firewall provisioning failed and owned-rule cleanup also failed."); }
    throw error;
  }
  return cleanup;
}

export async function stopOwnedSmokeProcesses(options: {
  root: string; browserExe: string; run?: RunPowerShell;
}): Promise<void> {
  const run = options.run ?? runPowerShell;
  const root = path.resolve(options.root);
  if (!path.basename(root).startsWith("mktbrowser-mkb00-") || root === path.parse(root).root) {
    throw new Error("Process cleanup requires the specific owned smoke root.");
  }
  const script = [
    "$ErrorActionPreference='Stop'",
    "$root=[IO.Path]::GetFullPath($env:MKT_SMOKE_ROOT)",
    "$prefix=$root.TrimEnd([char]92)+[char]92",
    "$browser=[IO.Path]::GetFullPath($env:MKT_SMOKE_BROWSER_EXE)",
    "$knownNames=@([IO.Path]::GetFileName($browser))+@(Get-ChildItem -LiteralPath $root -Filter '*.exe' -Recurse -File -ErrorAction Stop | Select-Object -ExpandProperty Name)",
    "$argument=[regex]::Escape('--user-data-dir='+$root)+'(?=[\"\\s]|$)'",
    "function Find-OwnedProcesses {",
    "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {",
    "$exe=$_.ExecutablePath",
    "$mentionsRoot=-not [string]::IsNullOrWhiteSpace($_.CommandLine) -and $_.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0",
    "if([string]::IsNullOrWhiteSpace($exe)){if($mentionsRoot -or $knownNames -contains $_.Name){throw 'owned-process-path-unreadable'};return $false}",
    "$full=[IO.Path]::GetFullPath($exe)",
    "if($full.Equals($browser,[StringComparison]::OrdinalIgnoreCase) -and [string]::IsNullOrWhiteSpace($_.CommandLine)){throw 'browser-process-scope-unreadable'}",
    "$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or ($full.Equals($browser,[StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine -match $argument)",
    "})",
    "}",
    "for($attempt=0;$attempt -lt 3;$attempt++){",
    "$owned=@(Find-OwnedProcesses)",
    "foreach($candidate in $owned){",
    "$process=Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue",
    "if($null -eq $process){continue}",
    "try{",
    "if($process.HasExited -eq $true){continue}",
    // Keep the process handle, compare path and creation time before killing it; never kill by name.
    "if(-not [IO.Path]::GetFullPath($process.Path).Equals([IO.Path]::GetFullPath($candidate.ExecutablePath),[StringComparison]::OrdinalIgnoreCase)){throw 'process-identity-changed'}",
    "if([Math]::Abs(($process.StartTime.ToUniversalTime()-$candidate.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 1){throw 'process-start-time-changed'}",
    "$process.Kill()",
    "if(-not $process.WaitForExit(3000)){throw 'owned-process-still-running'}",
    "}catch{",
    // Exit can invalidate Path/StartTime between reads; the final inventory still must be empty.
    "if($process.HasExited -eq $true){continue}",
    "throw",
    "}",
    "}",
    "Start-Sleep -Milliseconds 250",
    "}",
    "$remaining=@(Find-OwnedProcesses).Count",
    "if($remaining -ne 0){throw 'owned-processes-remain'}",
    "[Console]::Out.Write('{\"confirmedStopped\":true,\"remaining\":0}')",
  ].join(";");
  const evidence = JSON.parse(await run(script, {
    NODE_ENV: process.env.NODE_ENV, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    PATH: process.env.PATH, PSModulePath: process.env.PSModulePath,
    MKT_SMOKE_ROOT: root, MKT_SMOKE_BROWSER_EXE: path.resolve(options.browserExe),
  }));
  if (evidence.confirmedStopped !== true || evidence.remaining !== 0) {
    throw new Error("Owned process shutdown was not positively verified.");
  }
}

export async function cleanupContainedSmoke(options: {
  stopAndVerify: () => Promise<void>;
  removeFirewall: () => Promise<void>;
  removeRoot: () => Promise<void>;
}): Promise<void> {
  try {
    await options.stopAndVerify();
  } catch {
    throw new Error("Owned process shutdown is unverified; firewall rule and disposable root were preserved.");
  }
  // A failed firewall removal also preserves its executable and evidence for recovery.
  await options.removeFirewall();
  await options.removeRoot();
}
