import { describe, expect, it } from "vitest";
import { currentDeviceBrowserReadiness } from "./current-device-browser-health";
import type { RelayBrowserHealth } from "./relay-endpoints";

const READY: RelayBrowserHealth = {
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
};

describe("currentDeviceBrowserReadiness", () => {
  it("requires live Browser, contract, engine, and managed capabilities on this PC", () => {
    expect(currentDeviceBrowserReadiness(READY).ready).toBe(true);
    expect(currentDeviceBrowserReadiness({ ...READY, ready: false }).state).toBe("browser-offline");
    expect(
      currentDeviceBrowserReadiness({ ...READY, contractCompatible: false }).state,
    ).toBe("contract-mismatch");
    expect(
      currentDeviceBrowserReadiness({ ...READY, engine: { ...READY.engine!, status: "missing" } })
        .state,
    ).toBe("engine-not-ready");
    expect(currentDeviceBrowserReadiness({ ...READY, capabilities: [] }).state).toBe(
      "capability-missing",
    );
  });
});
