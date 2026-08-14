import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RelaySecretName } from "./secure-store";

export const RELAY_SECURITY_STATE_FILE = "relay-security-state.json";
export const SECURE_STORE_SCHEMA_VERSION = 1;

export type SecretMigrationStage =
  | "not-started"
  | "legacy-detected"
  | "imported"
  | "verified"
  | "plaintext-deleted"
  | "schema-committed"
  | "activated";

export interface RelaySecurityState {
  schemaVersion: number;
  migrationStage: SecretMigrationStage;
  protectedSecrets?: RelaySecretName[];
  rollbackFloor?: number;
  activeRelayVersion?: number;
}

const DEFAULT_STATE: RelaySecurityState = { schemaVersion: 0, migrationStage: "not-started" };

export function readRelaySecurityState(home: string): RelaySecurityState {
  const filePath = path.join(home, RELAY_SECURITY_STATE_FILE);
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<RelaySecurityState>;
    if (!Number.isSafeInteger(parsed.schemaVersion) || typeof parsed.migrationStage !== "string") {
      throw new Error("invalid state shape");
    }
    return parsed as RelaySecurityState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_STATE };
    throw new Error(`Cannot read Relay security state ${filePath}: ${(error as Error).message}`);
  }
}

export function writeRelaySecurityState(home: string, state: RelaySecurityState): void {
  mkdirSync(home, { recursive: true });
  const destination = path.join(home, RELAY_SECURITY_STATE_FILE);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, destination);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // No cleanup is needed when the temporary marker was never created.
    }
    throw new Error(`Cannot persist Relay security state: ${(error as Error).message}`);
  }
}

/**
 * Preserve a non-secret rollback floor while retirement removes every identity-bearing secret.
 * `not-started` lets the current Relay track a fresh protected key after finalization.
 */
export function writeRelayRetirementSecurityGuard(home: string, relayVersion: number): void {
  writeRelaySecurityState(home, {
    schemaVersion: SECURE_STORE_SCHEMA_VERSION,
    migrationStage: "not-started",
    protectedSecrets: [],
    rollbackFloor: relayVersion,
    activeRelayVersion: relayVersion,
  });
}

export function assertRelayVersionAllowed(home: string, version: number): void {
  const floor = readRelaySecurityState(home).rollbackFloor;
  if (floor !== undefined && version < floor) {
    throw new Error(
      `Relay version ${version} is below the protected-store rollback floor ${floor}; activation refused.`,
    );
  }
}
