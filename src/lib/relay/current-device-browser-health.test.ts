import { describe, expect, it } from "vitest";
import {
  currentDeviceBrowserReadiness,
  REQUIRED_SETUP_BROWSER_CAPABILITIES,
} from "./current-device-browser-health";
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

  it("keeps contract and capability internals out of operator-facing readiness copy", () => {
    const contract = currentDeviceBrowserReadiness({
      ...READY,
      contractCompatible: false,
      contractProblem:
        'The local MCP endpoint on 47822 answered as "cloakbrowser" with contract version 99.',
    });
    const capability = currentDeviceBrowserReadiness({
      ...READY,
      capabilities: [],
    });
    const copy = `${contract.message}\n${capability.message}`;

    expect(contract.state).toBe("contract-mismatch");
    expect(capability.state).toBe("capability-missing");
    expect(copy).not.toMatch(/cloakbrowser|\bMCP\b|47822|contract version|capabilit/i);

    expect(
      currentDeviceBrowserReadiness({ ...READY, capabilities: undefined as never }).state,
    ).toBe("capability-missing");
  });

  it("requires the shared local-install verdict only for setup readiness", () => {
    expect(currentDeviceBrowserReadiness(READY).ready).toBe(true);

    const setupReadiness = currentDeviceBrowserReadiness(
      READY,
      REQUIRED_SETUP_BROWSER_CAPABILITIES,
    );
    expect(setupReadiness.state).toBe("capability-missing");
    expect(setupReadiness.message).toContain("Repair");

    expect(
      currentDeviceBrowserReadiness(
        { ...READY, capabilities: [...READY.capabilities, "local-install-ready-v1"] },
        REQUIRED_SETUP_BROWSER_CAPABILITIES,
      ).ready,
    ).toBe(true);
  });

  it("fails closed on measured licensed-engine capacity without guessing a cooldown", () => {
    const licensed = {
      ...READY,
      engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
      capabilities: [...READY.capabilities, "license-capacity-v1"],
      licenseCapacity: { total: 2, free: 0, active: 1, pendingRecovery: 1, cooling: 0 },
    };

    expect(currentDeviceBrowserReadiness(licensed).state).toBe("recovery-pending");
    expect(currentDeviceBrowserReadiness(licensed).message).toContain("recovery");
    expect(
      currentDeviceBrowserReadiness({
        ...licensed,
        licenseCapacity: { total: 2, free: 0, active: 2, pendingRecovery: 0, cooling: 0 },
      }).state,
    ).toBe("no-capacity");
    expect(currentDeviceBrowserReadiness({ ...licensed, licenseCapacity: null }).state).toBe(
      "capacity-unknown",
    );
    expect(
      currentDeviceBrowserReadiness({
        ...licensed,
        licenseCapacity: { total: 2, free: 1, active: 1, pendingRecovery: 0, cooling: 0 },
      }).ready,
    ).toBe(true);
    expect(currentDeviceBrowserReadiness({ ...READY, licenseCapacity: null }).ready).toBe(true);
  });
});
