import type { RelayCompatibilityUpdateHealth } from "../../src/lib/relay/relay-endpoints";
import type { CompatibilityUpdateState } from "./update-state";

export function describeCompatibilityUpdateHealth(
  state: CompatibilityUpdateState | null,
): RelayCompatibilityUpdateHealth {
  if (!state) {
    return {
      initialized: false,
      highestAcceptedSequence: null,
      rollbackFloorSequence: null,
      currentSequence: null,
      retainedSequence: null,
      rollbackAvailable: false,
      pending: null,
    };
  }

  const currentSequence = state.current?.sequence ?? null;
  const retainedSequence = state.retained?.sequence ?? null;
  return {
    initialized: true,
    highestAcceptedSequence: state.highestAcceptedSequence,
    rollbackFloorSequence: state.rollbackFloorSequence,
    currentSequence,
    retainedSequence,
    rollbackAvailable:
      state.pending === null &&
      state.smokeProfileId !== null &&
      currentSequence !== null &&
      retainedSequence !== null &&
      retainedSequence < currentSequence &&
      retainedSequence >= state.rollbackFloorSequence,
    pending: state.pending
      ? {
          mode: state.pending.mode,
          phase: state.pending.phase,
          targetSequence: state.pending.target.sequence,
        }
      : null,
  };
}
