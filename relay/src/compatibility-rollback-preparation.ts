import type { RollbackAuthorization } from "../../src/lib/release/rollback-authorization";
import { verifyRollbackAuthorization } from "../../src/lib/release/rollback-authorization";
import { assertCompatibilitySetFilesPresent } from "./compatibility-set-integrity";
import { withCompatibilityTransitionPreparationLock } from "./compatibility-transition-preparation-lock";
import {
  writeCompatibilityUpdateMarker,
} from "./compatibility-update-marker";
import type { LocalUpdaterOptions } from "./local-updater";
import { requireState, setDirectory } from "./compatibility-transition-runner";
import { writeCompatibilityUpdateState } from "./update-state";

export async function prepareCompatibilityRollback(
  input: unknown,
  authority: {
    serverPublicKeyHex: string;
    deviceId: string;
    now?: Date;
  },
  options: Pick<LocalUpdaterOptions, "home" | "store" | "platform">,
): Promise<RollbackAuthorization> {
  return withCompatibilityTransitionPreparationLock(options.home, async () => {
    const state = requireState(options.store);
    if (state.pending) throw new Error("A compatibility transition is already pending.");
    if (!state.current || !state.retained) throw new Error("No retained compatibility set is available.");
    if (!state.smokeProfileId) {
      throw new Error(
        "The active compatibility set has no protected smoke profile binding; ADMIN repair is required.",
      );
    }
    if (await options.platform.hasOpenProfiles()) {
      throw new Error("Close every MKT Browser profile before starting rollback.");
    }
    const authorization = verifyRollbackAuthorization(input, {
      ...authority,
      currentSequence: state.current.sequence,
      retainedSequence: state.retained.sequence,
      rollbackFloorSequence: state.rollbackFloorSequence,
      usedAuthorizationIds: state.usedRollbackAuthorizationIds,
    });
    assertCompatibilitySetFilesPresent(
      setDirectory(options.home, state.retained.sequence),
      "The retained",
    );
    const pending = {
      mode: "rollback" as const,
      target: state.retained,
      smokeProfileId: state.smokeProfileId,
      phase: "staged" as const,
      activatedArtifacts: [],
      authorizationId: authorization.authorizationId,
    };
    const next = { ...state, pending };
    writeCompatibilityUpdateState(options.store, next);
    writeCompatibilityUpdateMarker(options.home, pending);
    return authorization;
  });
}
