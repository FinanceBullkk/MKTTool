import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CompatibilityUpdateState, PendingCompatibilityUpdate } from "./update-state";

export const COMPATIBILITY_UPDATE_DIRECTORY = "compatibility-updater";
export const COMPATIBILITY_UPDATE_MARKER = "activation-marker.json";

export interface CompatibilityUpdateMarker {
  schemaVersion: 1;
  sequence: number;
  manifestDigest: string;
  phase: PendingCompatibilityUpdate["phase"];
}

export function updateRoot(home: string): string {
  return path.join(path.dirname(home), "MKTTool", COMPATIBILITY_UPDATE_DIRECTORY);
}

export function markerPath(home: string): string {
  return path.join(updateRoot(home), COMPATIBILITY_UPDATE_MARKER);
}

export function writeCompatibilityUpdateMarker(
  home: string,
  pending: PendingCompatibilityUpdate,
): void {
  const directory = updateRoot(home);
  mkdirSync(directory, { recursive: true });
  const destination = markerPath(home);
  const temporary = `${destination}.${process.pid}.tmp`;
  const marker: CompatibilityUpdateMarker = {
    schemaVersion: 1,
    sequence: pending.target.sequence,
    manifestDigest: pending.target.manifestDigest,
    phase: pending.phase,
  };
  try {
    writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, destination);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw new Error(`Cannot persist compatibility activation marker: ${(error as Error).message}`);
  }
}

export function readCompatibilityUpdateMarker(home: string): CompatibilityUpdateMarker | null {
  try {
    const marker = JSON.parse(readFileSync(markerPath(home), "utf8")) as CompatibilityUpdateMarker;
    if (
      marker.schemaVersion !== 1 ||
      !Number.isSafeInteger(marker.sequence) ||
      !/^[0-9a-f]{64}$/.test(marker.manifestDigest)
    ) {
      throw new Error("invalid marker shape");
    }
    return marker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Compatibility activation marker is invalid: ${(error as Error).message}`);
  }
}

export function clearCompatibilityUpdateMarker(home: string): void {
  rmSync(markerPath(home), { force: true });
}

export function reconcileCompatibilityUpdateMarker(
  home: string,
  state: CompatibilityUpdateState,
): void {
  if (state.pending) {
    writeCompatibilityUpdateMarker(home, state.pending);
    return;
  }
  clearCompatibilityUpdateMarker(home);
}

export function assertNoCompatibilityActivationInProgress(home: string): void {
  const marker = readCompatibilityUpdateMarker(home);
  if (marker) {
    throw new Error(
      `Compatibility set ${marker.sequence} is still converging (${marker.phase}); startup is blocked to prevent a mixed tuple.`,
    );
  }
}
