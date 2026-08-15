import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import {
  validateCompatibilityManifest,
  type ValidateCompatibilityManifestOptions,
  type VerifiedCompatibilityManifest,
} from "../../src/lib/release/compatibility-manifest";
import type { RollbackAuthorization } from "../../src/lib/release/rollback-authorization";
import {
  stageCompatibilitySet,
  type CompatibilityArtifactHeadersResolver,
} from "./compatibility-artifact-staging";
import {
  assertCompatibilitySetFilesPresent,
  verifyCompatibilitySetDirectory,
} from "./compatibility-set-integrity";
import {
  reconcileCompatibilityUpdateMarker,
  updateRoot,
  writeCompatibilityUpdateMarker,
} from "./compatibility-update-marker";
import type { PostActivationSmoke } from "./post-activation-smoke";
import type { SecureStore } from "./secure-store";
import {
  compatibilitySetRecord,
  rememberRevokedDelegatedKeyIds,
  writeCompatibilityUpdateState,
  type CompatibilityArtifactKind,
} from "./update-state";
import {
  activateRollback,
  activateUpdate,
  assertSmokeProfileId,
  requireState,
  rollbackActivatedArtifacts,
  setDirectory,
} from "./compatibility-transition-runner";
import { withCompatibilityTransitionPreparationLock } from "./compatibility-transition-preparation-lock";
import { prepareCompatibilityRollback } from "./compatibility-rollback-preparation";

export interface CompatibilityUpdatePlatform {
  hasOpenProfiles(): Promise<boolean>;
  stopOwnedProcesses(): Promise<void>;
  activateArtifact(kind: CompatibilityArtifactKind, artifactPath: string): Promise<void>;
  restoreArtifact(kind: CompatibilityArtifactKind, artifactPath: string): Promise<void>;
  startOwnedProcesses(): Promise<void>;
}

export interface LocalUpdaterOptions {
  home: string;
  store: SecureStore;
  platform: CompatibilityUpdatePlatform;
  smoke: PostActivationSmoke;
  testProfileId: string;
  downloadHeadersForUrl?: CompatibilityArtifactHeadersResolver;
  injectFault?: (point: string) => void;
}

export type CompatibilityUpdatePreparationOptions = Pick<
  LocalUpdaterOptions,
  "home" | "store" | "platform" | "testProfileId" | "downloadHeadersForUrl" | "injectFault"
>;

export async function prepareCompatibilityUpdate(
  input: unknown,
  validation: Omit<ValidateCompatibilityManifestOptions, "state">,
  options: CompatibilityUpdatePreparationOptions,
): Promise<VerifiedCompatibilityManifest> {
  return withCompatibilityTransitionPreparationLock(options.home, async () => {
    assertSmokeProfileId(options.testProfileId);
    let state = requireState(options.store);
    if (state.pending) throw new Error("A compatibility update is already pending convergence.");
    if (await options.platform.hasOpenProfiles()) {
      throw new Error("Close every MKT Browser profile before starting the compatibility update.");
    }
    const verified = validateCompatibilityManifest(input, {
      ...validation,
      // After the spread: what this device already proved outranks whatever the caller supplied.
      knownRevokedDelegatedKeyIds: state.revokedDelegatedKeyIds,
      state: {
        highestAcceptedSequence: state.highestAcceptedSequence,
        currentSequence: state.current?.sequence ?? null,
        installerFloorSequence: state.rollbackFloorSequence,
      },
    });
    // Record proven revocations before staging, which downloads artifacts and can fail or be
    // interrupted. A revocation learned and then forgotten because a download broke would leave
    // the device accepting that key again on the next attempt.
    const remembered = rememberRevokedDelegatedKeyIds(state, verified.observedRevokedDelegatedKeyIds);
    if (remembered !== state) {
      writeCompatibilityUpdateState(options.store, remembered);
      state = remembered;
    }
    if (state.current) {
      assertCompatibilitySetFilesPresent(
        setDirectory(options.home, state.current.sequence),
        "The active",
      );
    }
    const staged = await stageCompatibilitySet(
      options.home,
      verified,
      options.downloadHeadersForUrl,
    );
    try {
      if (await options.platform.hasOpenProfiles()) {
        throw new Error("Close every MKT Browser profile before starting the compatibility update.");
      }
    } catch (error) {
      rmSync(staged.directory, { recursive: true, force: true });
      throw error;
    }
    const pending = {
      mode: "update" as const,
      target: compatibilitySetRecord(verified.manifest, verified.manifestDigest),
      smokeProfileId: options.testProfileId,
      phase: "staged" as const,
      activatedArtifacts: [],
    };
    const next = { ...state, pending };
    writeCompatibilityUpdateState(options.store, next);
    writeCompatibilityUpdateMarker(options.home, pending);
    options.injectFault?.("after-staged");
    return verified;
  });
}

export async function activatePreparedCompatibilityUpdate(options: LocalUpdaterOptions): Promise<void> {
  const state = requireState(options.store);
  if (!state.pending || state.pending.mode !== "update") throw new Error("No prepared update exists.");
  const staged = await verifyCompatibilitySetDirectory(
    path.join(updateRoot(options.home), "staging", String(state.pending.target.sequence)),
    state.pending.target,
  );
  await activateUpdate(state, staged, options);
}

export async function convergeCompatibilityUpdate(options: LocalUpdaterOptions): Promise<void> {
  const state = requireState(options.store);
  reconcileCompatibilityUpdateMarker(options.home, state);
  options.injectFault?.("after-marker-reconciled");
  if (!state.pending) {
    return;
  }
  if (state.pending.mode === "rollback") {
    const retained = await verifyCompatibilitySetDirectory(
      setDirectory(options.home, state.pending.target.sequence),
      state.pending.target,
    );
    await activateRollback(state, retained, options);
    return;
  }
  const stagingDirectory = path.join(updateRoot(options.home), "staging", String(state.pending.target.sequence));
  if (!existsSync(stagingDirectory)) {
    await rollbackActivatedArtifacts(state, options);
    return;
  }
  const staged = await verifyCompatibilitySetDirectory(stagingDirectory, state.pending.target);
  await activateUpdate(state, staged, options);
}

export async function rollbackCompatibilitySet(
  input: unknown,
  authority: {
    serverPublicKeyHex: string;
    deviceId: string;
    now?: Date;
  },
  options: LocalUpdaterOptions,
): Promise<RollbackAuthorization> {
  const authorization = await prepareCompatibilityRollback(input, authority, options);
  const state = requireState(options.store);
  const retained = await verifyCompatibilitySetDirectory(
    setDirectory(options.home, state.pending!.target.sequence),
    state.pending!.target,
  );
  await activateRollback(state, retained, options);
  return authorization;
}

export { prepareCompatibilityRollback } from "./compatibility-rollback-preparation";
