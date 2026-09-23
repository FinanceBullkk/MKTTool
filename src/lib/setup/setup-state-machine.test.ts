import { describe, expect, it } from "vitest";
import type { RelayHealth } from "@/lib/relay/relay-endpoints";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";
import { setupStateMachine, type SetupStateMachineInput } from "./setup-state-machine";

const HEALTHY: RelayHealth = {
  relayVersion: RELAY_VERSION,
  publicKey: "public-device-key",
  antidetectReady: true,
  configured: true,
  deviceId: "device-current",
  browser: {
    ready: true,
    provider: "mkt-browser",
    appVersion: "0.3.1",
    contractVersion: 3,
    contractCompatible: true,
    contractProblem: "",
    engine: { kind: "cft", version: "148.0.0.0", status: "ready" },
    capabilities: [
      "idempotent-create-v1",
      "atomic-launch-v1",
      "managed-profile-v1",
      "operation-diagnostics-v1",
    ],
  },
};

const BASE: SetupStateMachineInput = {
  session: { status: "signed-in", userId: "user-current", email: "operator@example.com" },
  device: {
    status: "enrolled",
    ownerUserId: "user-current",
    operatorKeyReady: true,
  },
  relay: { status: "responded", health: HEALTHY },
  update: { status: "current" },
};

const derive = (overrides: Partial<SetupStateMachineInput> = {}) =>
  setupStateMachine({ ...BASE, ...overrides });

describe("setupStateMachine", () => {
  it.each([
    ["Starting", { relay: { status: "checking" } }],
    ["Sign in", { session: { status: "signed-out" } }],
    ["Confirm this PC", { relay: { status: "unchecked" } }],
    [
      "Waiting for administrator approval",
      { device: { ...BASE.device, operatorKeyReady: false } },
    ],
    ["Ready", {}],
    ["Needs repair", { relay: { status: "permission-denied" } }],
    ["Unable to verify", { relay: { status: "timeout" } }],
  ] as const)("derives %s with exactly one primary action", (state, overrides) => {
    const output = derive(overrides as Partial<SetupStateMachineInput>);

    expect(output.state).toBe(state);
    expect(output.action).toEqual(expect.objectContaining({ kind: expect.any(String), label: expect.any(String) }));
  });

  it.each([
    "wrong-signed-in-user",
    "previous-owner",
    "revoked-key",
    "shared-windows-account",
  ] as const)("fails closed for %s", (conflict) => {
    const output = derive({ device: { ...BASE.device, conflict } });

    expect(output.state).toBe("Needs repair");
    expect(output.action.kind).toBe("ADMIN");
  });

  it("fails closed when the registry owner differs even without a classified conflict", () => {
    const output = derive({
      device: { ...BASE.device, ownerUserId: "user-previous" },
    });

    expect(output.state).toBe("Needs repair");
    expect(output.action.kind).toBe("ADMIN");
  });

  it("routes an exactly matched owner of a revoked PC to self-service cleanup", () => {
    const output = derive({
      device: { ...BASE.device, revoked: true, conflict: "revoked-key" },
    });

    expect(output.state).toBe("Needs repair");
    expect(output.action).toEqual({
      kind: "RECOVER", label: "Finish local cleanup", href: "/relay-devices",
    });
    expect(output.message).toContain("register a new Relay identity");
  });

  it.each([
    { status: "enrolled", revoked: true, conflict: "revoked-key" },
    { ...BASE.device, ownerUserId: "another-owner", revoked: true, conflict: "revoked-key" },
    { ...BASE.device, revoked: true, conflict: "device-id-mismatch" },
    { ...BASE.device, revoked: true, conflict: "shared-windows-account" },
  ] as const)("does not offer owner cleanup for an unverified or conflicting identity: %j", (device) => {
    const output = derive({ device });
    expect(output.state).toBe("Needs repair");
    expect(output.action.kind).toBe("ADMIN");
  });

  it("fails closed without inventing a conflict when registry inspection fails", () => {
    const output = derive({ device: { status: "inspection-failed" } });

    expect(output.state).toBe("Needs repair");
    expect(output.action.kind).toBe("ADMIN");
  });

  it.each([
    ["starting", "Starting", "WAIT"],
    ["required", "Needs repair", "UPDATE"],
    ["failed", "Needs repair", "ADMIN"],
  ] as const)("routes update state %s to %s", (status, expectedState, expectedAction) => {
    const output = derive({ update: { status } });

    expect(output.state).toBe(expectedState);
    expect(output.action.kind).toBe(expectedAction);
  });

  it("never treats a historical enrollment as Ready without current local health", () => {
    expect(derive({ relay: { status: "unreachable" } }).state).toBe("Needs repair");
    expect(derive({ relay: { status: "unchecked" } }).state).toBe("Confirm this PC");
  });

  it.each([
    ["unchecked", "Confirm this PC", "CONFIRM"],
    ["permission-denied", "Needs repair", "RETRY"],
    ["timeout", "Unable to verify", "RETRY"],
    ["unreachable", "Needs repair", "UPDATE"],
  ] as const)("does not hide live Relay state %s behind pending approval", (status, state, action) => {
    const output = derive({
      device: { ...BASE.device, operatorKeyReady: false },
      relay: { status },
    });

    expect(output.state).toBe(state);
    expect(output.action.kind).toBe(action);
  });

  it("shows the detected PC for a second confirmation before creating enrollment", () => {
    const output = derive({ device: { status: "not-enrolled" } });

    expect(output.state).toBe("Confirm this PC");
    expect(output.action.kind).toBe("CONFIRM");
  });

  it("keeps Browser readiness outside Relay PC registration", () => {
    const output = derive({
      relay: {
        status: "responded",
        health: {
          ...HEALTHY,
          antidetectReady: false,
          browser: {
            ...HEALTHY.browser,
            ready: false,
            contractCompatible: false,
            engine: { ...HEALTHY.browser.engine!, status: "missing" },
            capabilities: [],
          },
        },
      },
    });

    expect(output.state).toBe("Ready");
    expect(output.action).toEqual({ kind: "CONTINUE", label: "Relay PC is ready" });
    expect(output.message).toContain("Browser readiness remains a separate rollout boundary");
  });

  it("routes an old Relay to the existing Relay download section", () => {
    const output = derive({ update: { status: "required" } });

    expect(output.state).toBe("Needs repair");
    expect(output.action).toEqual({
      kind: "UPDATE",
      label: "Download the current Relay",
      href: "/setup#download",
    });
    expect(output.message).toContain("Relay on this PC is older");
  });

  it("keeps waiting as a durable success when registration exists but approval does not", () => {
    const output = derive({
      device: { ...BASE.device, operatorKeyReady: false },
      relay: { status: "responded", health: { ...HEALTHY, configured: false } },
    });

    expect(output.state).toBe("Waiting for administrator approval");
    expect(output.action.kind).toBe("WAIT");
  });

  it("routes a legacy pending grant to explicit administrator recovery", () => {
    const output = derive({
      device: {
        ...BASE.device,
        operatorKeyReady: false,
        operatorKeyGrantNeedsReissue: true,
      },
      relay: { status: "responded", health: { ...HEALTHY, configured: false } },
    });

    expect(output.state).toBe("Needs repair");
    expect(output.action.kind).toBe("ADMIN");
    expect(output.message).toContain("older server version");
  });

  it("does not call a historically ready device healthy when local Relay lost configuration", () => {
    const output = derive({
      relay: { status: "responded", health: { ...HEALTHY, configured: false } },
    });

    expect(output.state).toBe("Needs repair");
    expect(output.action.kind).toBe("ADMIN");
  });

  it("fails closed explicitly while a protected retirement receipt remains", () => {
    const output = derive({
      device: { status: "retirement-pending" },
      relay: {
        status: "responded",
        health: { ...HEALTHY, configured: false, retirementPending: true },
      },
    });

    expect(output.state).toBe("Needs repair");
    expect(output.action).toEqual({
      kind: "RECOVER",
      label: "Finish device retirement",
      href: "/relay-devices",
    });
    expect(output.message).toContain("retirement receipt");
  });
});
