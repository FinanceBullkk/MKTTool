import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCftEvidence, buildBrowserEnvironment, exerciseSignedProfileLifecycle, parseCftSmokeOptions, stageCftRuntime,
} from "./mkt-browser-cft-smoke-runtime";
import {
  assertDisposableVmFirewallHost, CFT_RULE_DISPLAY_NAME, cleanupContainedSmoke,
  provisionDisposableCftFirewall, stopOwnedSmokeProcesses,
} from "./mkt-browser-cft-smoke-firewall";

const source = readFileSync(
  new URL("./smoke-test-mkt-browser-correct-proxy.ts", import.meta.url),
  "utf8",
);

describe("correct-proxy smoke authorization path", () => {
  it("launches only through a signed ticket handled by Relay", () => {
    expect(source).toContain("issueTicket(");
    expect(source).toContain("handleTicketRequest(");
    expect(source).toContain("TICKET_KINDS.LAUNCH_PROFILE");
    expect(source).toContain("new RelayAntidetect(");
    expect(source).toContain("await waitForProfileInventory(adapter, child)");

    expect(source).not.toContain('callTool("navigate"');
    expect(source).not.toContain('callTool("evaluate_js"');
    expect(source).not.toContain("adapter.applyProxy(");
    expect(source).not.toContain("adapter.launchProfile(");
  });

  it("keeps proxy-file mode independent of environment loading and Prisma initialization", () => {
    expect(source).not.toMatch(/^import.*from "@prisma\//m);
    expect(source).toContain('import("@prisma/client")');
    expect(source).toContain('if (!options.useProxyFile && (await exists(envPath))) loadEnvFile(envPath)');
    expect(source).toContain("await unlink(handoffPath)");
    expect(source.indexOf("await unlink(handoffPath)")).toBeLessThan(source.indexOf("await probeExitIpThroughProxy("));
    expect(source).toContain("distinct egress is unverified");
  });

  it("covers staging and spawn failures with the same cleanup and issues fresh signed launch tickets", () => {
    expect(source).toMatch(/try \{\s+const port = await allocateLoopbackPort\(\)/);
    expect(source).toContain('child!.once("error"');
    expect(source).toContain("await cleanupContainedSmoke({");
    expect(source).toContain("stopOwnedSmokeProcesses({ root: dataRoot, browserExe: options.browserExe })");
    expect(source).toContain("removeRoot: () => removeDisposableRoot(dataRoot)");
    expect(source).toMatch(/launch: async \(unavailableProxy\) =>[\s\S]*const ticket = issueTicket\(/);
    expect(source).toContain("expectedOperationId: envelope.jti");
    expect(source).toContain("Original smoke failure: ${originalFailure.message}");
    expect(source).toContain("antidetectProfileId: createdProfileId");
    expect(source).toContain('host: "127.0.0.1", port: await allocateLoopbackPort()');
    expect(source).not.toContain("MKT_BROWSER_ALLOW_UNPINNED_ENGINE");
  });
});

const version = "152.0.7977.64";
const sha256 = "a".repeat(64);
const cftArgs = ["--cft-runtime=C:/fixture", `--expected-cft-version=${version}`, `--expected-cft-sha256=${sha256}`];

describe("explicit CFT smoke runtime", () => {
  it("preserves default mode and requires all three valid, non-conflicting pin options", () => {
    expect(parseCftSmokeOptions([])).toBeUndefined();
    expect(parseCftSmokeOptions(cftArgs)).toMatchObject({ version, sha256 });
    for (const args of [
      cftArgs.slice(0, 1), cftArgs.slice(1), ["--cft-runtime"], ["--disposable-vm-firewall"],
      [...cftArgs, "--engine-cache=C:/cache"], [...cftArgs, "--expected-cft-version=1.2.3.4"],
      [cftArgs[0], "--expected-cft-version=latest", cftArgs[2]],
      [cftArgs[0], cftArgs[1], "--expected-cft-sha256=bad"],
    ]) expect(() => parseCftSmokeOptions(args)).toThrow();
  });

  it("rejects actual version or executable hash mismatches", () => {
    const expected = { runtime: "fixture", version, sha256 };
    expect(() => assertCftEvidence({ version, sha256 }, expected)).not.toThrow();
    expect(() => assertCftEvidence({ version: "1.2.3.4", sha256 }, expected)).toThrow(/does not match/);
    expect(() => assertCftEvidence({ version, sha256: "b".repeat(64) }, expected)).toThrow(/does not match/);
  });

  it("isolates Windows state case-insensitively and scrubs secrets and inherited verifier/TLS flags", () => {
    const inherited = {
      NODE_ENV: "test" as const,
      Path: "synthetic-path", LOCALAPPDATA: "operational-local", AppData: "operational-roaming",
      DATABASE_URL: "synthetic-secret", HTTPS_PROXY: "synthetic-secret", PROXY_PASSWORD: "synthetic-secret",
      SERVER_SIGNING_KEY: "synthetic-secret", CLOAKBROWSER_LICENSE_KEY: "synthetic-secret",
      MKT_BROWSER_ALLOW_UNPINNED_ENGINE: "1", MKT_BROWSER_PACKAGED_CONTRACT_VERIFY: "1",
      NODE_TLS_REJECT_UNAUTHORIZED: "0", NODE_OPTIONS: "--require=unsafe", ELECTRON_RUN_AS_NODE: "1",
    };
    expect(buildBrowserEnvironment(12345, "fixture", inherited)).toEqual({
      NODE_ENV: "test",
      Path: "synthetic-path", LOCALAPPDATA: path.join("fixture", "local-app-data"),
      APPDATA: path.join("fixture", "roaming-app-data"), MKT_BROWSER_MCP_PORT: "12345",
    });
    expect(inherited.LOCALAPPDATA).toBe("operational-local");
  });
});

describe("CFT disposable physical staging", () => {
  let fixture: string | undefined;
  afterEach(async () => {
    if (fixture) await rm(fixture, { recursive: true, force: true });
    fixture = undefined;
  });

  async function setup() {
    fixture = await mkdtemp(path.join(tmpdir(), "mkt-cft-smoke-unit-"));
    const runtime = path.join(fixture, "source");
    const root = path.join(fixture, "owned");
    await mkdir(runtime);
    await writeFile(path.join(runtime, "chrome.exe"), "synthetic non-executable fixture");
    return { root, options: { runtime, version, sha256 } };
  }

  it("inspects both copies and writes consistent settings, cache and runtime metadata", async () => {
    const { root, options } = await setup();
    const inspect = vi.fn(async () => ({ version, sha256 }));
    const executable = await stageCftRuntime(root, options, inspect);
    expect(inspect.mock.calls).toEqual([[path.join(options.runtime, "chrome.exe")], [executable]]);
    expect(await readFile(executable, "utf8")).toBe("synthetic non-executable fixture");
    const json = async (file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"));
    expect(await json("settings.json")).toEqual({ browserEngine: "cft", mcpHttpEnabled: true });
    expect(await json("chromium/cft/current.json")).toMatchObject({ version, executableSha256: sha256, binaryRelative: path.join("runtime", "chrome.exe") });
    expect(await json("chromium/cft/runtime/.mkt-runtime.json")).toEqual({ version });
    await writeFile(executable, "changed copy");
    expect(await readFile(path.join(options.runtime, "chrome.exe"), "utf8")).toBe("synthetic non-executable fixture");
  });

  it.each([1, 2])("rejects mismatched inspection %s without making ready settings", async (mismatch) => {
    const { root, options } = await setup();
    let calls = 0;
    const inspect = vi.fn(async () => ({ version, sha256: ++calls === mismatch ? "b".repeat(64) : sha256 }));
    await expect(stageCftRuntime(root, options, inspect)).rejects.toThrow(/does not match/);
    expect(calls).toBe(mismatch);
    await expect(readFile(path.join(root, "settings.json"))).rejects.toThrow();
  });
});

const vmState = { model: "VirtualBox", manufacturer: "Oracle Corporation", existingRuleCount: 0, firewallEnabled: true };
const firewallRoot = path.resolve("synthetic-owned-root");
const firewallExe = path.join(firewallRoot, "chromium", "cft", "runtime", "chrome.exe");

describe("disposable VM firewall safety", () => {
  it("does not inspect or mutate firewall state without explicit opt-in", async () => {
    const run = vi.fn();
    const cleanup = await provisionDisposableCftFirewall({ enabled: false, root: firewallRoot, executable: firewallExe, run });
    await cleanup();
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses non-Windows, non-VirtualBox, existing rules and disabled profiles", () => {
    expect(() => assertDisposableVmFirewallHost("win32", vmState)).not.toThrow();
    for (const state of [{ ...vmState, model: "PC" }, { ...vmState, manufacturer: "Unknown" }, { ...vmState, existingRuleCount: 1 }, { ...vmState, firewallEnabled: false }]) {
      expect(() => assertDisposableVmFirewallHost("win32", state)).toThrow();
    }
    expect(() => assertDisposableVmFirewallHost("linux", vmState)).toThrow();
  });

  it("refuses a runtime outside the owned root before executing commands", async () => {
    const run = vi.fn();
    await expect(provisionDisposableCftFirewall({ enabled: true, root: firewallRoot, executable: "C:/operational/chrome.exe", platform: "win32", run })).rejects.toThrow(/owned staged/);
    expect(run).not.toHaveBeenCalled();
  });

  it("creates one exact-program UDP block and removes only its unique identity", async () => {
    const run = vi.fn(async () => JSON.stringify(vmState));
    const cleanup = await provisionDisposableCftFirewall({ enabled: true, root: firewallRoot, executable: firewallExe, platform: "win32", run });
    await cleanup();
    const calls = run.mock.calls as unknown as [string, NodeJS.ProcessEnv][];
    expect(calls).toHaveLength(3);
    expect(calls[1][0]).toContain("-Protocol UDP -Direction Outbound -Action Block -Profile Any -Enabled True");
    expect(calls[1][0]).toContain("existing-cft-rule");
    expect(calls[1][1]).toMatchObject({ MKT_CFT_RULE_DISPLAY: CFT_RULE_DISPLAY_NAME, MKT_CFT_RULE_EXE: firewallExe });
    expect(calls[1][1].MKT_CFT_RULE_NAME).toMatch(/^mkt-cft-smoke-[a-f0-9-]+$/);
    expect(calls[2][0]).toContain("$_.Name -eq $env:MKT_CFT_RULE_NAME");
    expect(calls[2][0]).toContain("owned-rule-changed");
    expect(calls[2][0]).not.toContain("-DisplayName $env:MKT_CFT_RULE_DISPLAY | Remove");
    expect(calls[2][1]).toEqual(calls[1][1]);
  });

  it("refuses an existing rule without issuing creation or deletion", async () => {
    const run = vi.fn(async () => JSON.stringify({ ...vmState, existingRuleCount: 1 }));
    await expect(provisionDisposableCftFirewall({ enabled: true, root: firewallRoot, executable: firewallExe, platform: "win32", run })).rejects.toThrow(/existing CFT/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cleans its unique rule if creation partially fails", async () => {
    const run = vi.fn(async () => JSON.stringify(vmState)).mockResolvedValueOnce(JSON.stringify(vmState)).mockRejectedValueOnce(new Error("partial create"));
    await expect(provisionDisposableCftFirewall({ enabled: true, root: firewallRoot, executable: firewallExe, platform: "win32", run })).rejects.toThrow("partial create");
    expect(run).toHaveBeenCalledTimes(3);
  });
});

describe("signed profile lifecycle orchestration", () => {
  const proxyRejected = {
    ok: false, code: "PROXY_REJECTED", expectedOperationId: "fresh-ticket-jti",
    diagnostic: { code: "PROXY_REJECTED", stage: "apply-or-verify-proxy", operationId: "fresh-ticket-jti" },
  };

  it("requires close/reopen, unavailable-proxy rejection/stopped, and restored-proxy recovery", async () => {
    const events: string[] = [];
    await exerciseSignedProfileLifecycle({
      launch: async (unavailable) => { events.push(unavailable ? "bad-proxy" : "fresh-open"); return unavailable ? proxyRejected : { ok: true }; },
      close: async () => { events.push("close"); },
      waitForRunning: async (running) => { events.push(`running=${running}`); },
      report: () => {},
    });
    expect(events).toEqual([
      "fresh-open", "running=true", "close", "running=false",
      "fresh-open", "running=true", "close", "running=false", "bad-proxy", "running=false",
      "fresh-open", "running=true", "close", "running=false",
    ]);
  });

  it("does not accept a dead proxy launch or a failed recovery as passing evidence", async () => {
    const launch = vi.fn(async () => ({ ok: true }));
    const options = { launch, close: async () => {}, waitForRunning: async () => {}, report: () => {} };
    await expect(exerciseSignedProfileLifecycle(options)).rejects.toThrow(/incorrectly accepted/);
    expect(launch).toHaveBeenCalledTimes(3);
    launch.mockReset().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(proxyRejected).mockResolvedValueOnce({ ok: false });
    await expect(exerciseSignedProfileLifecycle(options)).rejects.toThrow(/proxy-recovery.*rejected/);
  });

  it.each([
    { ok: false, rejectionCode: "REPLAY" },
    { ok: false, code: "ENGINE_UNAVAILABLE", diagnostic: { stage: "browser-health" } },
    { ok: false, code: "FORBIDDEN" },
    { ...proxyRejected, diagnostic: undefined },
    { ...proxyRejected, diagnostic: { ...proxyRejected.diagnostic, stage: "launch-profile" } },
    { ...proxyRejected, diagnostic: { ...proxyRejected.diagnostic, operationId: "another-ticket" } },
    { ...proxyRejected, rejectionCode: "EXPIRED" },
  ])("does not mistake auth/runtime/missing or uncorrelated diagnostics for proxy rejection %#", async (rejected) => {
    const launch = vi.fn(async (unavailable: boolean) => unavailable ? rejected : { ok: true });
    await expect(exerciseSignedProfileLifecycle({ launch, close: async () => {}, waitForRunning: async () => {}, report: () => {} })).rejects.toThrow(/correlated proxy-specific/);
    expect(launch).toHaveBeenCalledTimes(3);
  });
});

describe("contained process teardown", () => {
  const root = path.resolve("mktbrowser-mkb00-synthetic");
  const browserExe = path.resolve("synthetic-package", "MKTBrowser.exe");

  it("verifies exact owned paths independently of parent exit with bounded handle-based termination", async () => {
    const run = vi.fn(async () => JSON.stringify({ confirmedStopped: true, remaining: 0 }));
    await stopOwnedSmokeProcesses({ root, browserExe, run });
    const calls = run.mock.calls as unknown as [string, NodeJS.ProcessEnv][];
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ MKT_SMOKE_ROOT: root, MKT_SMOKE_BROWSER_EXE: browserExe });
    expect(calls[0][0]).toContain("Get-CimInstance Win32_Process -ErrorAction Stop");
    expect(calls[0][0]).toContain("$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)");
    expect(calls[0][0]).toContain("process-identity-changed");
    expect(calls[0][0]).toContain("process-start-time-changed");
    expect(calls[0][0]).toContain("owned-process-path-unreadable");
    expect(calls[0][0]).toContain("$knownNames -contains $_.Name");
    expect(calls[0][0]).toContain("browser-process-scope-unreadable");
    expect(calls[0][0]).toContain("$attempt -lt 3");
    expect(calls[0][0]).toContain("$process.Kill()");
    expect(calls[0][0]).not.toMatch(/taskkill|Stop-Process|Get-Process -Name/);
  });

  it.each([{}, { confirmedStopped: false, remaining: 0 }, { confirmedStopped: true, remaining: 1 }])("rejects missing or non-stopped query evidence %#", async (evidence) => {
    await expect(stopOwnedSmokeProcesses({ root, browserExe, run: async () => JSON.stringify(evidence) })).rejects.toThrow(/not positively verified/);
  });

  it("does not query or kill against a broad/non-owned root", async () => {
    const run = vi.fn();
    await expect(stopOwnedSmokeProcesses({ root: path.parse(root).root, browserExe, run })).rejects.toThrow(/specific owned/);
    expect(run).not.toHaveBeenCalled();
  });

  it("preserves firewall and root when shutdown fails or cannot be queried", async () => {
    const removeFirewall = vi.fn();
    const removeRoot = vi.fn();
    await expect(cleanupContainedSmoke({
      stopAndVerify: () => stopOwnedSmokeProcesses({ root, browserExe, run: async () => { throw new Error("query unavailable"); } }),
      removeFirewall, removeRoot,
    })).rejects.toThrow(/firewall rule and disposable root were preserved/);
    expect(removeFirewall).not.toHaveBeenCalled();
    expect(removeRoot).not.toHaveBeenCalled();
  });

  it("removes protection/data only after positively verified shutdown", async () => {
    const order: string[] = [];
    await cleanupContainedSmoke({
      stopAndVerify: async () => { order.push("verified-stopped"); },
      removeFirewall: async () => { order.push("firewall"); },
      removeRoot: async () => { order.push("root"); },
    });
    expect(order).toEqual(["verified-stopped", "firewall", "root"]);
  });

  it("preserves the executable/root if owned-rule removal fails", async () => {
    const removeRoot = vi.fn();
    await expect(cleanupContainedSmoke({ stopAndVerify: async () => {}, removeFirewall: async () => { throw new Error("rule retained"); }, removeRoot })).rejects.toThrow("rule retained");
    expect(removeRoot).not.toHaveBeenCalled();
  });
});

describe.skipIf(process.platform !== "win32")("Windows process-exit race regression", () => {
  const execFileAsync = promisify(execFile);

  async function runSyntheticShutdown(mode: string): Promise<void> {
    const root = await mkdtemp(path.join(tmpdir(), "mktbrowser-mkb00-exit-race-"));
    try {
      await stopOwnedSmokeProcesses({
        root, browserExe: path.join(root, "never-created-browser.exe"),
        run: async (script, env) => {
          // Override both process cmdlets: execute the generated control flow, never inspect or kill host processes.
          const fixtures = [
            "$script:queryCount=0;$script:hasExitedReads=0",
            "function Get-CimInstance {",
            "$script:queryCount++",
            "if($script:queryCount -eq 1 -or $env:MKT_SMOKE_TEST_MODE -eq 'still-listed'){",
            "[pscustomobject]@{ProcessId=4242;ExecutablePath=(Join-Path $env:MKT_SMOKE_ROOT 'chrome.exe');Name='chrome.exe';CommandLine='synthetic';CreationDate=[DateTime]::UtcNow}",
            "}",
            "}",
            "function Get-Process {",
            "$fake=[pscustomobject]@{Path=$null;StartTime=[DateTime]::UtcNow}",
            "if($env:MKT_SMOKE_TEST_MODE -eq 'live-mismatch'){$fake.Path=Join-Path ([IO.Path]::GetPathRoot($env:MKT_SMOKE_ROOT)) 'non-owned-runtime.exe'}",
            "$fake | Add-Member ScriptProperty HasExited {",
            "$script:hasExitedReads++",
            "switch($env:MKT_SMOKE_TEST_MODE){'already-exited'{$true};'still-listed'{$true};'exit-during-read'{$script:hasExitedReads -gt 1};'exit-state-unreadable'{throw 'exit-state-unreadable'};default{$false}}",
            "}",
            "$fake | Add-Member ScriptMethod Kill {throw 'unexpected-kill'}",
            "$fake",
            "}",
          ].join(";");
          try {
            const result = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${fixtures};${script}`], {
              env: { ...env, MKT_SMOKE_TEST_MODE: mode }, windowsHide: true, timeout: 10_000,
            });
            return result.stdout.trim();
          } catch (error) {
            // Match actual PowerShell failure, not a marker merely present in the echoed command.
            const stderr = (error as { stderr?: unknown }).stderr;
            throw typeof stderr === "string" ? new Error(stderr) : error;
          }
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  it.each(["already-exited", "exit-during-read"])("accepts %s only after the final owned inventory is empty", async (mode) => {
    await expect(runSyntheticShutdown(mode)).resolves.toBeUndefined();
  }, 15_000);

  it.each([
    ["live-path-unreadable", /GetFullPath/],
    ["live-mismatch", /process-identity-changed/],
    ["exit-state-unreadable", /GetFullPath|exit-state-unreadable/],
  ] as const)("fails closed for %s", async (mode, expectedFailure) => {
    const removeFirewall = vi.fn();
    const removeRoot = vi.fn();
    let observedFailure = "";
    await expect(cleanupContainedSmoke({
      stopAndVerify: async () => {
        try { await runSyntheticShutdown(mode); } catch (error) {
          observedFailure = (error as Error).message;
          throw error;
        }
      }, removeFirewall, removeRoot,
    })).rejects.toThrow(/were preserved/);
    expect(observedFailure).toMatch(expectedFailure);
    expect(observedFailure).not.toContain("unexpected-kill");
    expect(removeFirewall).not.toHaveBeenCalled();
    expect(removeRoot).not.toHaveBeenCalled();
  }, 15_000);

  it("does not accept exited handles when the final owned inventory still contains a process", async () => {
    await expect(runSyntheticShutdown("still-listed")).rejects.toThrow(/owned-processes-remain/);
  }, 15_000);
});
