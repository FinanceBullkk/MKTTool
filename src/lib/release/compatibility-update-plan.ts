import type { RelayCompatibilityUpdateHealth } from "@/lib/relay/relay-endpoints";

export interface CompatibilityUpdateTarget {
  sequence: number;
  relayVersion: string;
  browserVersion: string;
}

export type CompatibilityUpdatePlan =
  | { status: "current"; message: string }
  | { status: "blocked"; message: string }
  | {
      status: "confirm";
      beforeLabel: string;
      afterLabel: string;
      repairMissingState: boolean;
      signature: string;
      targetSequence: number;
    };

export function planCompatibilityUpdate({
  update,
  currentRelayVersion,
  currentBrowserVersion,
  target,
}: {
  update: RelayCompatibilityUpdateHealth | undefined;
  currentRelayVersion: number;
  currentBrowserVersion: string | null;
  target: CompatibilityUpdateTarget;
}): CompatibilityUpdatePlan {
  if (update?.pending) {
    return {
      status: "blocked",
      message: "This PC already has a compatibility transition pending. Let Relay converge it first.",
    };
  }

  const repairMissingState = update?.initialized !== true;
  if (!repairMissingState && update.currentSequence === target.sequence) {
    return {
      status: "current",
      message: `This PC already uses compatibility sequence ${target.sequence}. Nothing changed.`,
    };
  }
  if (
    !repairMissingState &&
    update.currentSequence !== null &&
    update.currentSequence > target.sequence
  ) {
    return {
      status: "blocked",
      message:
        `This PC uses newer compatibility sequence ${update.currentSequence}; ` +
        `the update target is ${target.sequence}. No downgrade was authorized.`,
    };
  }

  const beforeLabel = repairMissingState
    ? "Compatibility state not initialized"
    : `Sequence ${update.currentSequence ?? "none"} ` +
      `(Relay v${currentRelayVersion}, MKT Browser ${currentBrowserVersion ?? "not reported"})`;
  return {
    status: "confirm",
    beforeLabel,
    afterLabel:
      `Sequence ${target.sequence} ` +
      `(Relay v${target.relayVersion}, MKT Browser ${target.browserVersion})`,
    repairMissingState,
    signature: `${repairMissingState}:${update?.currentSequence ?? "none"}:${target.sequence}`,
    targetSequence: target.sequence,
  };
}
