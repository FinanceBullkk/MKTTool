import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { CONFIG_FILE, DEVICE_KEY_FILE } from "./relay-home";
import {
  SECURE_STORE_SCHEMA_VERSION,
  assertRelayVersionAllowed,
  readRelaySecurityState,
  writeRelaySecurityState,
  type RelaySecurityState,
  type SecretMigrationStage,
} from "./relay-security-state";
import { RELAY_SECRET_NAMES, type RelaySecretName, type SecureStore } from "./secure-store";
import { writeLegacyDeviceKeyTombstone } from "./legacy-device-key-tombstone";

export type MigrationFaultPoint =
  | "before-import"
  | "after-import"
  | "after-read-back"
  | "before-source-deletion"
  | "after-source-deletion"
  | "after-marker-commit"
  | "after-activation";

interface MigrationOptions {
  faultAt?: MigrationFaultPoint;
}

interface LegacySecrets {
  operatorDomainKey: string | null;
  devicePrivateKey: string | null;
}

export function migrateRelaySecrets(
  home: string,
  store: SecureStore,
  relayVersion: number,
  options: MigrationOptions = {},
): RelaySecurityState {
  assertRelayVersionAllowed(home, relayVersion);
  let state = readRelaySecurityState(home);
  const legacy = readLegacySecrets(home);
  const hasLegacy = legacy.operatorDomainKey !== null || legacy.devicePrivateKey !== null;

  if (!hasLegacy && state.migrationStage === "not-started") {
    if (store.read(RELAY_SECRET_NAMES.devicePrivateKey) === null) return state;
    // Ghi sổ đúng thứ kho đang giữ. Cứng hoá mỗi khóa máy thì một kho vốn đã có cả khóa operator
    // sẽ không được `requireTrackedSecrets` canh ở những lượt sau — mất một lớp kiểm mà không ai
    // thấy. Khóa máy đọc trước để lượt cài mới thoát sớm, khỏi tốn thêm một tiến trình PowerShell.
    const protectedSecrets: RelaySecretName[] = [];
    if (store.read(RELAY_SECRET_NAMES.operatorDomainKey) !== null) {
      protectedSecrets.push(RELAY_SECRET_NAMES.operatorDomainKey);
    }
    protectedSecrets.push(RELAY_SECRET_NAMES.devicePrivateKey);

    state = {
      schemaVersion: SECURE_STORE_SCHEMA_VERSION,
      migrationStage: "activated",
      protectedSecrets,
      rollbackFloor: relayVersion,
      activeRelayVersion: relayVersion,
    };
    writeRelaySecurityState(home, state);
    return state;
  }
  if (!hasLegacy && stageBefore(state.migrationStage, "verified")) {
    throw new Error("Legacy Relay secrets disappeared before protected-store verification completed.");
  }
  if (!hasLegacy) requireTrackedSecrets(store, state);

  if (state.migrationStage === "not-started") {
    state = {
      ...state,
      migrationStage: "legacy-detected",
      protectedSecrets: legacySecretNames(legacy),
    };
    writeRelaySecurityState(home, state);
  }
  inject(options, "before-import");

  importSecret(store, RELAY_SECRET_NAMES.operatorDomainKey, legacy.operatorDomainKey);
  importSecret(store, RELAY_SECRET_NAMES.devicePrivateKey, legacy.devicePrivateKey);
  if (stageBefore(state.migrationStage, "imported")) state = mark(home, state, "imported");
  inject(options, "after-import");

  verifySecret(store, RELAY_SECRET_NAMES.operatorDomainKey, legacy.operatorDomainKey);
  verifySecret(store, RELAY_SECRET_NAMES.devicePrivateKey, legacy.devicePrivateKey);
  // `after-read-back` phải tiêm TRƯỚC khi mốc "verified" kịp xuống đĩa. Đặt cả hai sau mốc thì
  // chúng đo đúng cùng một trạng thái, tức bảy điểm tiêm thật ra chỉ có sáu. Tách ra thì điểm này
  // phủ được lần chết giữa "đọc lại xong" và "đã ghi mốc" — một trạng thái trước đây không ai đo.
  inject(options, "after-read-back");
  if (stageBefore(state.migrationStage, "verified")) state = mark(home, state, "verified");
  inject(options, "before-source-deletion");

  deleteLegacySources(home, legacy);
  inject(options, "after-source-deletion");
  if (stageBefore(state.migrationStage, "plaintext-deleted")) {
    state = mark(home, state, "plaintext-deleted");
  }

  requireTrackedSecrets(store, state);

  if (stageBefore(state.migrationStage, "schema-committed")) {
    state = {
      ...state,
      schemaVersion: SECURE_STORE_SCHEMA_VERSION,
      migrationStage: "schema-committed",
      rollbackFloor: relayVersion,
    };
    writeRelaySecurityState(home, state);
  }
  inject(options, "after-marker-commit");

  if (stageBefore(state.migrationStage, "activated") || state.activeRelayVersion !== relayVersion) {
    state = { ...state, migrationStage: "activated", activeRelayVersion: relayVersion };
    writeRelaySecurityState(home, state);
  }
  inject(options, "after-activation");
  return state;
}

function importSecret(store: SecureStore, name: RelaySecretName, legacy: string | null): void {
  if (legacy === null) return;
  const existing = store.read(name);
  if (existing !== null && existing !== legacy) {
    throw new Error(`Protected Relay secret ${name} conflicts with its plaintext source.`);
  }
  if (existing === null) store.write(name, legacy);
}

function verifySecret(store: SecureStore, name: RelaySecretName, legacy: string | null): void {
  if (legacy === null) return;
  if (store.read(name) !== legacy) {
    throw new Error(`Protected Relay secret ${name} failed read-back verification.`);
  }
}

function requireProtectedSecret(store: SecureStore, name: RelaySecretName): void {
  if (store.read(name) === null) {
    throw new Error(`Protected Relay secret ${name} is missing after the plaintext deletion boundary.`);
  }
}

function requireTrackedSecrets(store: SecureStore, state: RelaySecurityState): void {
  for (const name of state.protectedSecrets ?? []) requireProtectedSecret(store, name);
}

function legacySecretNames(legacy: LegacySecrets): RelaySecretName[] {
  const names: RelaySecretName[] = [];
  if (legacy.operatorDomainKey !== null) names.push(RELAY_SECRET_NAMES.operatorDomainKey);
  if (legacy.devicePrivateKey !== null) names.push(RELAY_SECRET_NAMES.devicePrivateKey);
  return names;
}

function readLegacySecrets(home: string): LegacySecrets {
  return {
    operatorDomainKey: readJsonSecret(path.join(home, CONFIG_FILE), "vaultKeyOperator"),
    devicePrivateKey: readJsonSecret(path.join(home, DEVICE_KEY_FILE), "privateKey"),
  };
}

function readJsonSecret(filePath: string, field: string): string | null {
  if (!existsSync(filePath)) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Cannot parse legacy Relay secret source ${filePath}: ${(error as Error).message}`);
  }
  if (filePath.endsWith(DEVICE_KEY_FILE) && "privateKeyLocation" in parsed) return null;
  return typeof parsed[field] === "string" && parsed[field].trim() !== ""
    ? parsed[field].trim()
    : null;
}

function deleteLegacySources(home: string, legacy: LegacySecrets): void {
  if (legacy.operatorDomainKey !== null) removeConfigSecret(path.join(home, CONFIG_FILE));
  if (legacy.devicePrivateKey !== null && existsSync(path.join(home, DEVICE_KEY_FILE))) {
    writeLegacyDeviceKeyTombstone(home);
  }
}

function removeConfigSecret(filePath: string): void {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  delete parsed.vaultKeyOperator;
  // The suffix is unique per attempt, and the failure path clears it. A `wx` write against a
  // leftover temporary — a crash between write and rename, then a recycled PID — would otherwise
  // fail EEXIST on every later attempt. This runs after read-back already succeeded, so the Relay
  // would never start again until someone deleted that file by hand.
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(parsed, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporary, filePath);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may not have been created. It never holds the plaintext key.
    }
    throw new Error(
      `Cannot remove the plaintext operator key from ${filePath}: ${(error as Error).message}`,
    );
  }
}

function mark(home: string, state: RelaySecurityState, stage: SecretMigrationStage): RelaySecurityState {
  const next = { ...state, migrationStage: stage };
  writeRelaySecurityState(home, next);
  return next;
}

const STAGES: SecretMigrationStage[] = [
  "not-started",
  "legacy-detected",
  "imported",
  "verified",
  "plaintext-deleted",
  "schema-committed",
  "activated",
];

function stageBefore(current: SecretMigrationStage, target: SecretMigrationStage): boolean {
  return STAGES.indexOf(current) < STAGES.indexOf(target);
}

function inject(options: MigrationOptions, point: MigrationFaultPoint): void {
  if (options.faultAt === point) throw new Error(`Injected migration fault at ${point}.`);
}
