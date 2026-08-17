import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { parseEnginePin } from "./active-engine-pin";

const execFileAsync = promisify(execFile);

export interface ActivateWindowsEngineOptions {
  archivePath: string;
  pinPath: string;
  localAppData: string;
  extractArchive?: (archivePath: string, destination: string) => Promise<void>;
}

export async function activateWindowsEngineArtifact(
  options: ActivateWindowsEngineOptions,
): Promise<void> {
  const pin = parseEnginePin(readFileSync(options.pinPath, "utf8"));
  const cacheRoot = path.win32.join(
    options.localAppData,
    "MKTTool",
    "MKTBrowser",
    "chromium",
    pin.engineKind,
  );
  const extraction = path.win32.join(cacheRoot, "compatibility-extract.partial");
  const staging = path.win32.join(cacheRoot, "runtime.partial");
  const runtime = path.win32.join(cacheRoot, "runtime");
  const rollback = path.win32.join(cacheRoot, "runtime.rollback");
  mkdirSync(cacheRoot, { recursive: true });
  rmSync(extraction, { recursive: true, force: true });
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(extraction, { recursive: true });
  await (options.extractArchive ?? extractWithWindowsTar)(options.archivePath, extraction);
  const chrome = findFile(extraction, "chrome.exe");
  if (!chrome) throw new Error("The signed engine artifact does not contain chrome.exe.");
  renameSync(path.win32.dirname(chrome), staging);
  writeFileSync(path.win32.join(staging, ".mkt-runtime.json"), JSON.stringify({ version: pin.version }));
  rmSync(extraction, { recursive: true, force: true });
  rmSync(rollback, { recursive: true, force: true });
  let previousMoved = false;
  try {
    if (existsSync(runtime)) {
      renameSync(runtime, rollback);
      previousMoved = true;
    }
    renameSync(staging, runtime);
  } catch (error) {
    if (previousMoved && !existsSync(runtime)) renameSync(rollback, runtime);
    throw new Error("The signed engine runtime could not be activated atomically.", { cause: error });
  }
  rmSync(rollback, { recursive: true, force: true });
}

async function extractWithWindowsTar(archivePath: string, destination: string): Promise<void> {
  await execFileAsync("tar.exe", ["-xf", archivePath, "-C", destination], { windowsHide: true });
}

function findFile(root: string, name: string): string | null {
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.win32.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(candidate, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return candidate;
    }
  }
  return null;
}
