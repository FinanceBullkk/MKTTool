import { execFileSync, spawn } from "node:child_process";
import {
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

  it("does not rewrite an existing shortcut that already has the exact Relay target", () => {
    expect(INSTALLER).toMatch(/function Test-RelayShortcut/);
    expect(INSTALLER).toMatch(/if\s*\(Test-RelayShortcut\s+\$linkPath\)\s*\{\s*return\s*\}/);
    expect(INSTALLER).toMatch(/TargetPath[\s\S]*\$targetExe/);
  });

  it("keeps the legacy Unicode shortcut cleanup target-bound and non-fatal", () => {
    expect(INSTALLER).toContain('"Cầu nối MKTTool.lnk"');
    expect(INSTALLER).toMatch(/TargetPath[\s\S]*\$targetExe/);
    expect(INSTALLER).toMatch(/Write-Warning[\s\S]*legacy shortcut/i);
  });

  it("keeps user-facing installer output ASCII-only", () => {
    const outputStatements = INSTALLER.match(/^\s*(?:Write-Host|Write-Step|Fail)\b.*$/gm) ?? [];
    expect(outputStatements.length).toBeGreaterThan(0);
    expect(outputStatements.join("\n")).not.toMatch(/[^\x00-\x7f]/);
  });

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
        expect(readFileSync(lockedShortcut).length).toBeGreaterThan(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
