import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(path.join(process.cwd(), "relay", "install-relay.ps1"), "utf8");
const INSTALLER = SOURCE.replace(/<#[\s\S]*?#>/g, "").replace(/^\s*#.*$/gm, "");
const BUILD_SCRIPT = readFileSync(path.join(process.cwd(), "scripts", "build-relay-executable.ts"), "utf8");
const LAUNCHER = readFileSync(
  path.join(process.cwd(), "relay", "start-mkttool-relay.cmd"),
  "ascii",
);

describe("Relay installer shortcut contract", () => {
  it("creates the stable ASCII shortcut directly instead of renaming a shared staging file", () => {
    expect(INSTALLER).toContain('"MKTTool Relay.lnk"');
    expect(INSTALLER).toMatch(/CreateShortcut\(\$linkPath\)/);
    expect(INSTALLER).not.toMatch(/MKTTool-Relay-staging\.lnk|Move-Item[^\r\n]*\$stagingPath/);
  });

  it("retries only Windows sharing and lock violations with a bounded attempt count", () => {
    expect(INSTALLER).toMatch(/32\s*,\s*33/);
    expect(INSTALLER).toMatch(/\$shortcutSaveMaxAttempts\s*=\s*[2-9]/);
    expect(INSTALLER).toMatch(/if\s*\(\s*-not\s*\(Test-RetryableShortcutError/);
  });

  it("does not rewrite an existing shortcut that already has the exact safe launcher target", () => {
    expect(INSTALLER).toMatch(/function Test-RelayShortcut/);
    expect(INSTALLER).toMatch(/if\s*\(Test-RelayShortcut\s+\$linkPath\)\s*\{\s*return\s*\}/);
    expect(INSTALLER).toMatch(/TargetPath[\s\S]*\$targetLauncher/);
    expect(INSTALLER).toMatch(/IsNullOrWhiteSpace\(\$shortcut\.Arguments\)/);
    expect(INSTALLER).toMatch(/\$shortcut\.Arguments\s*=\s*""/);
    expect(INSTALLER).toMatch(/function Test-RegularFile/);
    expect(INSTALLER).toMatch(/FileAttributes\]::ReparsePoint/);
  });

  it("keeps the legacy Unicode shortcut cleanup target-bound and non-fatal", () => {
    expect(INSTALLER).toContain('"Cầu nối MKTTool.lnk"');
    expect(INSTALLER).toMatch(/\$legacyTarget[\s\S]*\$targetExe/);
    expect(INSTALLER).toMatch(/\$legacyTarget[\s\S]*\$targetLauncher/);
    expect(INSTALLER).toMatch(/Write-Warning[\s\S]*legacy shortcut/i);
  });

  it("keeps user-facing installer output ASCII-only", () => {
    const outputStatements = INSTALLER.match(/^\s*(?:Write-Host|Write-Step|Fail)\b.*$/gm) ?? [];
    expect(outputStatements.length).toBeGreaterThan(0);
    expect(outputStatements.join("\n")).not.toMatch(/[^\x00-\x7f]/);
  });

  it("scrubs Node TLS overrides before first launch and every owned shortcut launch", () => {
    expect(INSTALLER).toMatch(/function Start-RelayProcess\(\)/);
    expect(INSTALLER).toMatch(/UseShellExecute\s*=\s*\$false/);
    expect(INSTALLER).toMatch(/EnvironmentVariables\.Remove\(\$nodeTlsVariable\)/);
    expect(INSTALLER).not.toMatch(/Start-Process\s+-FilePath\s+\$targetExe/);
    expect(INSTALLER).toMatch(/Install-RelayLauncherAndShortcuts/);
    expect(LAUNCHER).toMatch(/^@echo off\r?\n/m);
    expect(LAUNCHER).toContain("setlocal DisableDelayedExpansion");
    expect(LAUNCHER).toContain('start "" /b "%~dp0MKTTool-Relay.exe"');
    expect(LAUNCHER).not.toContain("%*");
    expect(LAUNCHER).not.toMatch(/[^\x00-\x7f]/);
    for (const key of [
      "NODE_OPTIONS",
      "NODE_EXTRA_CA_CERTS",
      "NODE_USE_SYSTEM_CA",
      "NODE_TLS_REJECT_UNAUTHORIZED",
    ]) {
      expect(INSTALLER).toContain(`"${key}"`);
      expect(LAUNCHER).toContain(`set "${key}="`);
    }
    expect(BUILD_SCRIPT).toMatch(
      /\["setup\.bat", "install-relay\.ps1", "start-mkttool-relay\.cmd"\]/,
    );
    expect(BUILD_SCRIPT).toMatch(/Compress-Archive[\s\S]*start-mkttool-relay\.cmd/);
  });

  it.runIf(process.platform === "win32")(
    "clears mixed-case Node overrides before the startup wrapper reaches Node",
    () => {
      const root = mkdtempSync(path.join(tmpdir(), "mkttool-relay-launcher-"));
      const wrapperPath = path.join(root, "start-mkttool-relay.cmd");
      const relayPath = path.join(root, "MKTTool-Relay.exe");
      const preloadPath = path.join(root, "unsafe-preload.cjs");
      const preloadMarker = path.join(root, "unsafe-preload-ran.txt");

      try {
        copyFileSync(process.execPath, relayPath);
        writeFileSync(
          preloadPath,
          `require("node:fs").writeFileSync(${JSON.stringify(preloadMarker)}, "unsafe");`,
        );
        writeFileSync(
          wrapperPath,
          LAUNCHER.replace('start "" /b', 'start "" /wait /b'),
          "ascii",
        );

        execFileSync("cmd.exe", ["/d", "/c", wrapperPath], {
          env: {
            ...process.env,
            node_options: `--require=${preloadPath}`,
            Node_Extra_Ca_Certs: "C:\\fixture-ca.pem",
            node_use_system_ca: "1",
            node_tls_reject_unauthorized: "0",
          },
          timeout: 5_000,
          windowsHide: true,
        });

        expect(existsSync(preloadMarker)).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    10_000,
  );

  it.runIf(process.platform === "win32")(
    "installs successfully when the owned legacy shortcut is locked",
    async () => {
      const root = mkdtempSync(path.join(tmpdir(), "mkttool-relay-installer-"));
      const packageDir = path.join(root, "package");
      const relayDir = path.join(root, "relay");
      const startupDir = path.join(root, "startup");
      const desktopDir = path.join(root, "desktop");
      const scriptPath = path.join(packageDir, "install-relay.ps1");

      try {
        for (const directory of [packageDir, relayDir, startupDir, desktopDir]) {
          mkdirSync(directory, { recursive: true });
        }
        writeFileSync(path.join(packageDir, "MKTTool-Relay.exe"), "fixture");
        writeFileSync(path.join(packageDir, "start-mkttool-relay.cmd"), LAUNCHER, "ascii");
        writeFileSync(path.join(relayDir, "relay-config.json"), '{"preserved":true}');
        writeFileSync(
          scriptPath,
          SOURCE.replace("$shortcutSaveMaxAttempts = 5", "$shortcutSaveMaxAttempts = 2")
            .replace("Start-Sleep -Seconds 3", "Start-Sleep -Milliseconds 1"),
          "utf8",
        );

        const createShortcut = [
          "$shell = New-Object -ComObject WScript.Shell",
          `foreach ($path in @(${JSON.stringify(path.join(startupDir, "MKTTool Relay.lnk"))}, ${JSON.stringify(path.join(desktopDir, "MKTTool Relay.lnk"))}, ${JSON.stringify(path.join(startupDir, "legacy-staging.lnk"))})) {`,
          "  $shortcut = $shell.CreateShortcut($path)",
          `  $shortcut.TargetPath = ${JSON.stringify(path.join(relayDir, "MKTTool-Relay.exe"))}`,
          `  $shortcut.WorkingDirectory = ${JSON.stringify(relayDir)}`,
          "  $shortcut.WindowStyle = 7",
          "  $shortcut.Save()",
          "}",
        ].join("; ");
        execFileSync("powershell.exe", ["-NoProfile", "-Command", createShortcut]);

        const lockedShortcut = path.join(startupDir, "Cầu nối MKTTool.lnk");
        renameSync(path.join(startupDir, "legacy-staging.lnk"), lockedShortcut);
        const lockProcess = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `$stream=[IO.File]::Open(${JSON.stringify(lockedShortcut)},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); Write-Output ready; [Console]::ReadLine() | Out-Null; $stream.Dispose()`,
          ],
          { stdio: ["pipe", "pipe", "inherit"] },
        );

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Timed out waiting for shortcut lock.")), 5_000);
          lockProcess.once("error", reject);
          lockProcess.stdout.once("data", () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        try {
          execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
            env: {
              ...process.env,
              RELAY_DIR: relayDir,
              RELAY_STARTUP_DIR: startupDir,
              RELAY_DESKTOP_DIR: desktopDir,
              RELAY_SKIP_BROWSER: "1",
            },
            timeout: 15_000,
          });
        } finally {
          lockProcess.stdin.write("\n");
          lockProcess.stdin.end();
          await new Promise<void>((resolve) => lockProcess.once("exit", () => resolve()));
        }

        expect(readFileSync(path.join(relayDir, "relay-config.json"), "utf8")).toBe(
          '{"preserved":true}',
        );
        expect(readFileSync(path.join(relayDir, "start-mkttool-relay.cmd"), "ascii")).toBe(
          LAUNCHER,
        );
        const shortcut = JSON.parse(execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `$shell=New-Object -ComObject WScript.Shell; try { $shortcut=$shell.CreateShortcut(${JSON.stringify(path.join(startupDir, "MKTTool Relay.lnk"))}); @{ TargetPath=$shortcut.TargetPath; Arguments=$shortcut.Arguments } | ConvertTo-Json -Compress } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }`,
          ],
          { encoding: "utf8" },
        ).trim());
        expect(shortcut).toEqual({
          TargetPath: path.join(relayDir, "start-mkttool-relay.cmd"),
          Arguments: "",
        });
        expect(readFileSync(lockedShortcut).length).toBeGreaterThan(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
