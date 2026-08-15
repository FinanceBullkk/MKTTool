import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CompatibilityManifest } from "../../src/lib/release/compatibility-manifest";
import { updateRoot } from "./compatibility-update-marker";

export const ACTIVE_ENGINE_PIN_FILE = "active-engine.json";

export interface ActiveEnginePin {
  schemaVersion: 1;
  sequence: number;
  engineKind: string;
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

export function enginePinFromManifest(manifest: CompatibilityManifest): ActiveEnginePin {
  const engine = manifest.artifacts.engine;
  return {
    schemaVersion: 1,
    sequence: manifest.sequence,
    engineKind: engine.engineKind,
    version: engine.version,
    url: engine.url,
    sha256: engine.sha256,
    sizeBytes: engine.sizeBytes,
  };
}

export function activateEnginePin(home: string, setDirectory: string): void {
  const source = path.join(setDirectory, ACTIVE_ENGINE_PIN_FILE);
  const pin = parseEnginePin(readFileSync(source, "utf8"));
  const destination = path.join(updateRoot(home), ACTIVE_ENGINE_PIN_FILE);
  const temporary = `${destination}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(pin, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, destination);
}

export function parseEnginePin(raw: string): ActiveEnginePin {
  const pin = JSON.parse(raw) as Partial<ActiveEnginePin>;
  if (
    pin.schemaVersion !== 1 ||
    !Number.isSafeInteger(pin.sequence) ||
    Number(pin.sequence) <= 0 ||
    (pin.engineKind !== "cft" && pin.engineKind !== "cloakbrowser") ||
    typeof pin.version !== "string" ||
    !pin.version ||
    typeof pin.url !== "string" ||
    new URL(pin.url).protocol !== "https:" ||
    typeof pin.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(pin.sha256) ||
    !Number.isSafeInteger(pin.sizeBytes) ||
    Number(pin.sizeBytes) <= 0
  ) {
    throw new Error("The compatibility engine pin is invalid.");
  }
  return pin as ActiveEnginePin;
}
