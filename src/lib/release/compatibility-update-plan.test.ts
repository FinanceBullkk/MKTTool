import { describe, expect, it } from "vitest";
import type { RelayCompatibilityUpdateHealth } from "@/lib/relay/relay-endpoints";
import { planCompatibilityUpdate } from "./compatibility-update-plan";

const TARGET = { sequence: 3, relayVersion: "16", browserVersion: "0.3.13" };

describe("planCompatibilityUpdate", () => {
  it("does not ask for confirmation when the active sequence already matches", () => {
    expect(plan(currentState({ currentSequence: 3 }))).toEqual({
      status: "current",
      message: "This PC already uses compatibility sequence 3. Nothing changed.",
    });
  });

  it("describes a real before and after transition", () => {
    expect(plan(currentState({ currentSequence: 2 }))).toMatchObject({
      status: "confirm",
      beforeLabel: "Sequence 2 (Relay v15, MKT Browser 0.3.12)",
      afterLabel: "Sequence 3 (Relay v16, MKT Browser 0.3.13)",
      repairMissingState: false,
    });
  });

  it("confirms missing-state repair and blocks an implicit downgrade", () => {
    expect(plan(undefined)).toMatchObject({
      status: "confirm",
      beforeLabel: "Compatibility state not initialized",
      repairMissingState: true,
    });
    expect(plan(currentState({ currentSequence: 4 }))).toMatchObject({
      status: "blocked",
      message: expect.stringContaining("No downgrade was authorized"),
    });
  });
});

function plan(update: RelayCompatibilityUpdateHealth | undefined) {
  return planCompatibilityUpdate({
    update,
    currentRelayVersion: 15,
    currentBrowserVersion: "0.3.12",
    target: TARGET,
  });
}

function currentState(
  overrides: Partial<RelayCompatibilityUpdateHealth>,
): RelayCompatibilityUpdateHealth {
  return {
    initialized: true,
    highestAcceptedSequence: 2,
    rollbackFloorSequence: 1,
    currentSequence: 2,
    retainedSequence: 1,
    rollbackAvailable: true,
    pending: null,
    ...overrides,
  };
}
