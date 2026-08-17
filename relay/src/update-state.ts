import type { CompatibilityManifest } from "../../src/lib/release/compatibility-manifest";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";

export const UPDATE_STATE_SCHEMA_VERSION = 1;

export type UpdatePhase = "staged" | "stopping" | "activating" | "smoke" | "rollback";
export type CompatibilityArtifactKind = keyof CompatibilityManifest["artifacts"];

export interface CompatibilitySetRecord {
  sequence: number;
  manifestDigest: string;
  versions: Record<CompatibilityArtifactKind, string>;
}

export interface PendingCompatibilityUpdate {
  mode: "update" | "rollback";
  target: CompatibilitySetRecord;
  smokeProfileId: string;
  phase: UpdatePhase;
  activatedArtifacts: CompatibilityArtifactKind[];
  authorizationId?: string;
}

export interface CompatibilityUpdateState {
  schemaVersion: 1;
  highestAcceptedSequence: number;
  rollbackFloorSequence: number;
  smokeProfileId: string | null;
  current: CompatibilitySetRecord | null;
  retained: CompatibilitySetRecord | null;
  pending: PendingCompatibilityUpdate | null;
  usedRollbackAuthorizationIds: string[];
  /**
   * Delegated release key ids proven revoked by a root-signed statement this device has seen.
   *
   * Grows only. The revocation statements themselves live in the update payload, so whoever
   * serves an update chooses which ones to include — remembering them locally is what stops a
   * revoked key from being restored by simply leaving its statement out of the next payload.
   */
  revokedDelegatedKeyIds: string[];
}

export function initializeCompatibilityUpdateState(options: {
  installerFloorSequence: number;
  localIdentityDataExists: boolean;
}): CompatibilityUpdateState {
  if (!Number.isSafeInteger(options.installerFloorSequence) || options.installerFloorSequence <= 0) {
    throw new Error("The installer compatibility floor must be a positive integer.");
  }
  if (options.localIdentityDataExists) {
    throw new Error(
      "Compatibility anti-downgrade state is missing while local identity data exists; ADMIN repair is required.",
    );
  }
  return {
    schemaVersion: UPDATE_STATE_SCHEMA_VERSION,
    highestAcceptedSequence: options.installerFloorSequence - 1,
    rollbackFloorSequence: options.installerFloorSequence,
    smokeProfileId: null,
    current: null,
    retained: null,
    pending: null,
    usedRollbackAuthorizationIds: [],
    revokedDelegatedKeyIds: [],
  };
}

export function readCompatibilityUpdateState(store: SecureStore): CompatibilityUpdateState | null {
  const raw = store.read(RELAY_SECRET_NAMES.compatibilityUpdateState);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Protected compatibility update state is not valid JSON; ADMIN repair is required.");
  }
  // State written before revocation memory existed is missing the field rather than wrong. Reading
  // it as an empty set keeps a device that already updated once from failing into ADMIN repair; the
  // set is monotonic, so starting empty only means it has nothing to remember yet.
  const normalized =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { revokedDelegatedKeyIds: [], ...(parsed as Record<string, unknown>) }
      : parsed;
  if (!isCompatibilityUpdateState(normalized)) {
    throw new Error("Protected compatibility update state is invalid; ADMIN repair is required.");
  }
  return normalized;
}

/**
 * Merge newly proven revocations into the remembered set. Never removes: a key that was revoked
 * does not become trustworthy again, and a payload that stops mentioning it is not evidence.
 */
export function rememberRevokedDelegatedKeyIds(
  state: CompatibilityUpdateState,
  observed: string[],
): CompatibilityUpdateState {
  const merged = [...state.revokedDelegatedKeyIds];
  for (const keyId of observed) {
    if (!merged.includes(keyId)) merged.push(keyId);
  }
  return merged.length === state.revokedDelegatedKeyIds.length
    ? state
    : { ...state, revokedDelegatedKeyIds: merged };
}

export function writeCompatibilityUpdateState(
  store: SecureStore,
  state: CompatibilityUpdateState,
): void {
  if (!isCompatibilityUpdateState(state)) throw new Error("Refusing to persist invalid update state.");
  const serialized = JSON.stringify(state);
  store.write(RELAY_SECRET_NAMES.compatibilityUpdateState, serialized);
  if (store.read(RELAY_SECRET_NAMES.compatibilityUpdateState) !== serialized) {
    throw new Error("Protected compatibility update state failed read-back verification.");
  }
}

export function compatibilitySetRecord(
  manifest: CompatibilityManifest,
  manifestDigest: string,
): CompatibilitySetRecord {
  return {
    sequence: manifest.sequence,
    manifestDigest,
    versions: Object.fromEntries(
      Object.entries(manifest.artifacts).map(([kind, artifact]) => [kind, artifact.version]),
    ) as Record<CompatibilityArtifactKind, string>,
  };
}

/**
 * The rollback floor is deliberately fixed at first initialization and never moves.
 *
 * A moving floor was considered and rejected. Rollback can only reach the single retained set, so
 * the target is always one step back and always recent — a raised floor would almost never be the
 * binding constraint. The case it would cover, an ADMIN rolling into a hole a later set fixed, is
 * an owner overruling their own audited one-use authorization, which this threat model (solo owner,
 * six internal operators, key loss as the realistic danger) does not spend a signed-format change
 * on. If that changes, the fix is a minimum-floor field in the manifest so every device learns it
 * on the normal update path — not the installer's embedded value, which only reaches a device that
 * happens to reinstall.
 */

function isCompatibilityUpdateState(value: unknown): value is CompatibilityUpdateState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<CompatibilityUpdateState>;
  const currentSequence = state.current?.sequence ?? 0;
  const retainedSequence = state.retained?.sequence ?? 0;
  return (
    state.schemaVersion === UPDATE_STATE_SCHEMA_VERSION &&
    Number.isSafeInteger(state.highestAcceptedSequence) &&
    Number(state.highestAcceptedSequence) >= 0 &&
    Number.isSafeInteger(state.rollbackFloorSequence) &&
    Number(state.rollbackFloorSequence) > 0 &&
    (state.smokeProfileId === null || isSmokeProfileId(state.smokeProfileId)) &&
    isSetRecord(state.current) &&
    isSetRecord(state.retained) &&
    isPending(state.pending) &&
    Array.isArray(state.usedRollbackAuthorizationIds) &&
    state.usedRollbackAuthorizationIds.every((id) => isAuthorizationId(id)) &&
    new Set(state.usedRollbackAuthorizationIds).size === state.usedRollbackAuthorizationIds.length &&
    Array.isArray(state.revokedDelegatedKeyIds) &&
    state.revokedDelegatedKeyIds.every((id) => isReleaseKeyId(id)) &&
    new Set(state.revokedDelegatedKeyIds).size === state.revokedDelegatedKeyIds.length &&
    Number(state.highestAcceptedSequence) >= currentSequence &&
    Number(state.highestAcceptedSequence) >= retainedSequence &&
    (state.current === null || Number(state.rollbackFloorSequence) <= currentSequence) &&
    (state.current !== null || state.retained === null) &&
    (state.current === null || state.retained === null || state.current.sequence !== state.retained.sequence) &&
    hasValidPendingRelationship(state as CompatibilityUpdateState)
  );
}

function isSetRecord(value: unknown): value is CompatibilitySetRecord | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CompatibilitySetRecord>;
  const versions = record.versions ?? {};
  const versionKeys = Object.keys(versions);
  return (
    Number.isSafeInteger(record.sequence) &&
    Number(record.sequence) > 0 &&
    typeof record.manifestDigest === "string" &&
    /^[0-9a-f]{64}$/.test(record.manifestDigest) &&
    Boolean(record.versions) &&
    versionKeys.length === 5 &&
    ["installer", "relay", "browser", "controlContract", "engine"].every((kind) =>
      Object.prototype.hasOwnProperty.call(versions, kind),
    ) &&
    Object.values(versions).every((version) => typeof version === "string" && version.length > 0)
  );
}

function isPending(value: unknown): value is PendingCompatibilityUpdate | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const pending = value as Partial<PendingCompatibilityUpdate>;
  return (
    (pending.mode === "update" || pending.mode === "rollback") &&
    isSetRecord(pending.target) &&
    pending.target !== null &&
    isSmokeProfileId(pending.smokeProfileId) &&
    ["staged", "stopping", "activating", "smoke", "rollback"].includes(pending.phase ?? "") &&
    Array.isArray(pending.activatedArtifacts) &&
    pending.activatedArtifacts.every((kind) =>
      ["installer", "relay", "browser", "controlContract", "engine"].includes(kind),
    ) &&
    new Set(pending.activatedArtifacts).size === pending.activatedArtifacts.length &&
    (pending.authorizationId === undefined || isAuthorizationId(pending.authorizationId))
  );
}

function hasValidPendingRelationship(state: CompatibilityUpdateState): boolean {
  const pending = state.pending;
  if (!pending) return true;
  if (pending.mode === "update") {
    return (
      pending.authorizationId === undefined &&
      pending.target.sequence > state.highestAcceptedSequence &&
      pending.target.sequence !== state.current?.sequence &&
      pending.target.sequence !== state.retained?.sequence &&
      (state.smokeProfileId === null || pending.smokeProfileId === state.smokeProfileId)
    );
  }
  return (
    pending.authorizationId !== undefined &&
    state.current !== null &&
    state.retained !== null &&
    pending.target.sequence >= state.rollbackFloorSequence &&
    sameSetRecord(pending.target, state.retained) &&
    pending.smokeProfileId === state.smokeProfileId
  );
}

function sameSetRecord(left: CompatibilitySetRecord, right: CompatibilitySetRecord): boolean {
  return (
    left.sequence === right.sequence &&
    left.manifestDigest === right.manifestDigest &&
    Object.keys(left.versions).every(
      (kind) =>
        left.versions[kind as CompatibilityArtifactKind] ===
        right.versions[kind as CompatibilityArtifactKind],
    )
  );
}

function isAuthorizationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isSmokeProfileId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

/** Release key ids are SHA-256 fingerprints, the same shape the manifest schema enforces. */
function isReleaseKeyId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
