import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openWindowsInstaller, readWindowsInstallerFile } from "./windows-installer-file";

const originalInstallerPath = process.env.MKT_BROWSER_INSTALLER_PATH;
const fixtureDirectories: string[] = [];

afterEach(() => {
  if (originalInstallerPath === undefined) delete process.env.MKT_BROWSER_INSTALLER_PATH;
  else process.env.MKT_BROWSER_INSTALLER_PATH = originalInstallerPath;
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe("readWindowsInstallerFile", () => {
  it("reports a missing configured artifact instead of falling back silently", () => {
    process.env.MKT_BROWSER_INSTALLER_PATH = path.join(os.tmpdir(), "missing-mktbrowser.exe");
    expect(readWindowsInstallerFile().available).toBe(false);
  });

  it("opens and measures the configured installer from one file handle", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mkt-installer-"));
    fixtureDirectories.push(dir);
    const file = path.join(dir, "MKTBrowser-win-x64.exe");
    writeFileSync(file, Buffer.from("installer"));
    process.env.MKT_BROWSER_INSTALLER_PATH = file;

    const installer = readWindowsInstallerFile();
    const opened = await openWindowsInstaller(installer);

    expect(installer).toMatchObject({ available: true, path: file });
    expect(opened.sizeBytes).toBe(9);
    const chunks = [];
    for await (const chunk of opened.stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe("installer");
  });
});
