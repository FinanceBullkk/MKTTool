import { describe, expect, it } from "vitest";
import type { RelayHealth } from "@/lib/relay/relay-endpoints";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";
import { currentSetupUpdateState } from "./setup-update-state";

const HEALTHY: RelayHealth = {
  relayVersion: RELAY_VERSION,
  publicKey: "public-device-key",
  configured: true,
  deviceId: "device-current",
  antidetectReady: true,
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

describe("currentSetupUpdateState", () => {
  it("keeps unchecked and unreachable transport separate from update state", () => {
    expect(currentSetupUpdateState({ status: "unchecked" }).status).toBe("current");
    expect(currentSetupUpdateState({ status: "unreachable" }).status).toBe("current");
  });

  it("reports starting while the live update check is in progress", () => {
    expect(currentSetupUpdateState({ status: "checking" }).status).toBe("starting");
  });

  it("requires the current installer for an old Relay", () => {
    expect(currentSetupUpdateState({
      status: "responded",
      health: { ...HEALTHY, relayVersion: RELAY_VERSION - 1 },
    }).status).toBe("required");
  });

  it("fails when live Relay update metadata is invalid", () => {
    expect(currentSetupUpdateState({
      status: "responded",
      health: { ...HEALTHY, relayVersion: Number.NaN },
    }).status).toBe("failed");
  });

  it("reports current only for the live compatible set", () => {
    expect(currentSetupUpdateState({ status: "responded", health: HEALTHY }).status).toBe("current");
  });
});
