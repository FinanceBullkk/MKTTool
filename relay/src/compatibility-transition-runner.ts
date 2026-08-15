import { mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import type { StagedCompatibilitySet } from "./compatibility-artifact-staging";
import { completeCompatibilityTransition } from "./compatibility-transition-preparation-lock";
import { verifyCompatibilitySetDirectory } from "./compatibility-set-integrity";
import {
  clearCompatibilityUpdateMarker,
  updateRoot,
  writeCompatibilityUpdateMarker,
} from "./compatibility-update-marker";
import { activateEnginePin } from "./active-engine-pin";
import type { LocalUpdaterOptions } from "./local-updater";
import { runPostActivationSmoke } from "./post-activation-smoke";
import type { SecureStore } from "./secure-store";
import {
  readCompatibilityUpdateState,
  writeCompatibilityUpdateState,
  type CompatibilityArtifactKind,
  type CompatibilityUpdateState,
  type UpdatePhase,
} from "./update-state";

const ACTIVATION_ORDER: CompatibilityArtifactKind[] = ["engine", "installer", "browser", "relay", "controlContract"];

// The installer owns the Browser and Relay payloads, so retained verification must follow it.
const RESTORE_ORDER: CompatibilityArtifactKind[] = ["installer", "browser", "relay", "controlContract", "engine"];

export async function activateUpdate(
  initialState: CompatibilityUpdateState,
  staged: StagedCompatibilitySet,
  options: LocalUpdaterOptions,
): Promise<void> {
  if (initialState.current) {
    await verifyCompatibilitySetDirectory(
      setDirectory(options.home, initialState.current.sequence),
      initialState.current,
    );
  }
  let state = markPhase(initialState, "stopping", options);
  await options.platform.stopOwnedProcesses();
  options.injectFault?.("after-stop");
  try {
    state = markPhase(state, "activating", options);
    for (const kind of ACTIVATION_ORDER) {
      state = markActivated(state, kind, options);
      await options.platform.activateArtifact(kind, staged.artifacts[kind]);
      options.injectFault?.(`after-activate-${kind}`);
    }
    activateEnginePin(options.home, staged.directory);
    state = markPhase(state, "smoke", options);
    await runPostActivationSmoke(options.smoke, state.pending!.smokeProfileId);
    promoteStagedSet(options.home, staged.directory, state);
    completeUpdate(state, options);
    await options.platform.startOwnedProcesses();
    completeCompatibilityTransition(options.home);
  } catch (error) {
    await rollbackActivatedArtifacts(state, options);
    throw error;
  }
}

export async function activateRollback(
  initialState: CompatibilityUpdateState,
  retainedSet: StagedCompatibilitySet,
  options: LocalUpdaterOptions,
): Promise<void> {
  if (initialState.current) {
    await verifyCompatibilitySetDirectory(
      setDirectory(options.home, initialState.current.sequence),
      initialState.current,
    );
  }
  let state = markPhase(initialState, "stopping", options);
  await options.platform.stopOwnedProcesses();
  state = markPhase(state, "rollback", options);
  for (const kind of RESTORE_ORDER) {
    state = markActivated(state, kind, options);
    await options.platform.restoreArtifact(kind, retainedSet.artifacts[kind]);
  }
  activateEnginePin(options.home, retainedSet.directory);
  state = markPhase(state, "smoke", options);
  await runPostActivationSmoke(options.smoke, state.pending!.smokeProfileId);
  const current = initialState.current;
  const retained = initialState.retained;
  if (!current || !retained) throw new Error("Rollback state lost its current or retained set.");
  writeCompatibilityUpdateState(options.store, {
    ...state,
    current: retained,
    retained: current,
    pending: null,
    usedRollbackAuthorizationIds: state.pending?.authorizationId
      ? [...state.usedRollbackAuthorizationIds, state.pending.authorizationId]
      : state.usedRollbackAuthorizationIds,
  });
  clearCompatibilityUpdateMarker(options.home);
  await options.platform.startOwnedProcesses();
  completeCompatibilityTransition(options.home);
}

export async function rollbackActivatedArtifacts(
  state: CompatibilityUpdateState,
  options: LocalUpdaterOptions,
): Promise<void> {
  const retained = state.current;
  if (!retained) throw new Error("Initial compatibility activation failed and requires installer repair.");
  const directory = setDirectory(options.home, retained.sequence);
  const retainedSet = await verifyCompatibilitySetDirectory(directory, retained);
  const rollbackState = markPhase(state, "rollback", options);
  for (const kind of RESTORE_ORDER.filter((candidate) =>
    rollbackState.pending!.activatedArtifacts.includes(candidate),
  )) {
    await options.platform.restoreArtifact(kind, retainedSet.artifacts[kind]);
  }
  activateEnginePin(options.home, directory);
  writeCompatibilityUpdateState(options.store, { ...rollbackState, pending: null });
  clearCompatibilityUpdateMarker(options.home);
  await options.platform.startOwnedProcesses();
  completeCompatibilityTransition(options.home);
}

export function requireState(store: SecureStore): CompatibilityUpdateState {
  const state = readCompatibilityUpdateState(store);
  if (!state) throw new Error("Compatibility update state is missing; ADMIN repair is required.");
  return state;
}

export function setDirectory(home: string, sequence: number): string {
  return path.join(updateRoot(home), "sets", String(sequence));
}

export function assertSmokeProfileId(profileId: string): void {
  if (!profileId || profileId.length > 256) {
    throw new Error("A dedicated compatibility smoke profile id is required.");
  }
}

function completeUpdate(state: CompatibilityUpdateState, options: LocalUpdaterOptions): void {
  const pending = state.pending;
  if (!pending) throw new Error("Pending update state disappeared before completion.");
  writeCompatibilityUpdateState(options.store, {
    ...state,
    highestAcceptedSequence: Math.max(state.highestAcceptedSequence, pending.target.sequence),
    smokeProfileId: pending.smokeProfileId,
    retained: state.current,
    current: pending.target,
    pending: null,
  });
  clearCompatibilityUpdateMarker(options.home);
}

function markPhase(
  state: CompatibilityUpdateState,
  phase: UpdatePhase,
  options: LocalUpdaterOptions,
): CompatibilityUpdateState {
  if (!state.pending) throw new Error("Pending update state is missing.");
  const next = { ...state, pending: { ...state.pending, phase } };
  writeCompatibilityUpdateState(options.store, next);
  writeCompatibilityUpdateMarker(options.home, next.pending);
  return next;
}

function markActivated(
  state: CompatibilityUpdateState,
  kind: CompatibilityArtifactKind,
  options: LocalUpdaterOptions,
): CompatibilityUpdateState {
  if (!state.pending) throw new Error("Pending update state is missing.");
  const activatedArtifacts = state.pending.activatedArtifacts.includes(kind)
    ? state.pending.activatedArtifacts
    : [...state.pending.activatedArtifacts, kind];
  const next = { ...state, pending: { ...state.pending, activatedArtifacts } };
  writeCompatibilityUpdateState(options.store, next);
  writeCompatibilityUpdateMarker(options.home, next.pending);
  return next;
}

function promoteStagedSet(home: string, stagedDirectory: string, state: CompatibilityUpdateState): void {
  if (!state.pending) throw new Error("Pending update state is missing.");
  const setsRoot = path.join(updateRoot(home), "sets");
  mkdirSync(setsRoot, { recursive: true });
  const destination = setDirectory(home, state.pending.target.sequence);
  rmSync(destination, { recursive: true, force: true });
  renameSync(stagedDirectory, destination);
  if (state.retained && state.retained.sequence !== state.current?.sequence) {
    rmSync(setDirectory(home, state.retained.sequence), { recursive: true, force: true });
  }
}
