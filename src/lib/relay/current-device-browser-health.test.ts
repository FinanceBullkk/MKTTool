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
  contractVersion: 6,
  contractCompatible: true,
  contractProblem: "",
  engine: { kind: "cft", version: "148.0.0.0", status: "ready" },
  capabilities: [
    "idempotent-create-v1",
    "atomic-launch-v1",
    "managed-profile-v1",
    "operation-diagnostics-v1",
    "install-readiness-v1",
    "local-install-ready-v1",
  ],
  localInstallReadiness: "ready",
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

  it("requires a v6 local-install verdict for setup readiness", () => {
    expect(currentDeviceBrowserReadiness(READY).ready).toBe(true);

    const setupReadiness = currentDeviceBrowserReadiness(
      { ...READY, contractVersion: 5 },
      REQUIRED_SETUP_BROWSER_CAPABILITIES,
    );
    expect(setupReadiness.state).toBe("contract-mismatch");

    expect(
      currentDeviceBrowserReadiness(
        { ...READY, localInstallReadiness: undefined },
        REQUIRED_SETUP_BROWSER_CAPABILITIES,
      ).state,
    ).toBe("install-readiness-unknown");

    expect(
      currentDeviceBrowserReadiness(
        {
          ...READY,
          capabilities: READY.capabilities.filter((capability) => capability !== "local-install-ready-v1"),
        },
        REQUIRED_SETUP_BROWSER_CAPABILITIES,
      ).state,
    ).toBe("capability-missing");
  });

  it.each([
    ["checking", "install-readiness-checking", "Wait for the check to finish"],
    ["unavailable", "install-readiness-unavailable", "could not verify"],
    ["failed", "install-readiness-failed", "Repair"],
  ] as const)("blocks a v6 local-install state of %s without guessing readiness", (value, state, copy) => {
    const result = currentDeviceBrowserReadiness(
      { ...READY, localInstallReadiness: value },
      REQUIRED_SETUP_BROWSER_CAPABILITIES,
    );

    expect(result).toMatchObject({ ready: false, state });
    expect(result.message).toContain(copy);
  });

  it("reports checking before a missing capability so an incomplete observation is not called a repair", () => {
    const result = currentDeviceBrowserReadiness(
      { ...READY, capabilities: [], localInstallReadiness: "checking" },
      REQUIRED_SETUP_BROWSER_CAPABILITIES,
    );

    expect(result).toMatchObject({ ready: false, state: "install-readiness-checking" });
  });

  it("fails closed on measured licensed-engine capacity without guessing a cooldown", () => {
    const licensed: RelayBrowserHealth = {
      ...READY,
      engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
      capabilities: READY.capabilities,
      licenseCapacity: {
        total: 2, free: 0, active: 1, pendingRecovery: 1, cooling: 0,
        availability: "recovering", reason: "RECOVERY_PENDING",
      },
    };

    expect(currentDeviceBrowserReadiness(licensed).state).toBe("recovery-pending");
    expect(currentDeviceBrowserReadiness(licensed).message).toContain("recovery");
    expect(
      currentDeviceBrowserReadiness({
        ...licensed,
        licenseCapacity: {
          total: 2, free: 0, active: 2, pendingRecovery: 0, cooling: 0,
          availability: "in-use", reason: "CAPACITY_OCCUPIED",
        },
      }).state,
    ).toBe("no-capacity");
    expect(currentDeviceBrowserReadiness({ ...licensed, licenseCapacity: null }).state).toBe(
      "capacity-unknown",
    );
    expect(
      currentDeviceBrowserReadiness({
        ...licensed,
        licenseCapacity: {
          total: 2, free: 1, active: 1, pendingRecovery: 0, cooling: 0,
          availability: "ready", reason: "CAPACITY_AVAILABLE",
        },
      }).ready,
    ).toBe(true);
    expect(currentDeviceBrowserReadiness({ ...READY, licenseCapacity: null }).ready).toBe(true);
  });

  it.each([false, true])("blocks a cooling seat and reports only the permitted manual retry when advertised=%s", (advertised) => {
    const result = currentDeviceBrowserReadiness({
      ...READY,
      capabilities: [...READY.capabilities, ...(advertised ? ["license-capacity-v1"] : [])],
      engine: { kind: "cloakbrowser", version: "151", status: "ready" },
      licenseCapacity: {
        total: 1, free: 0, active: 0, pendingRecovery: 0, cooling: 1,
        retryAt: "2026-09-21T04:45:00.000Z",
        availability: "cooling", reason: "CAPACITY_COOLING",
      },
    });

    expect(result).toMatchObject({ ready: false, state: "no-capacity" });
    expect(result.message).toContain("Earliest permitted manual retry: 2026-09-21T04:45:00.000Z (UTC)");
    expect(result.message).toContain("Do not retry before");
    expect(result.message).toContain("does not guarantee");
    expect(result.message).not.toMatch(/close|frees in|will be available/i);
  });

  it("allows a distinct free slot while another slot cools", () => {
    expect(currentDeviceBrowserReadiness({
      ...READY,
      engine: { kind: "cloakbrowser", version: "151", status: "ready" },
      licenseCapacity: {
        total: 2, free: 1, active: 0, pendingRecovery: 0, cooling: 1,
        availability: "ready", reason: "CAPACITY_AVAILABLE",
      },
    })).toMatchObject({ ready: true, state: "ready" });
  });

  it("requires and honors the contract-5 availability verdict", () => {
    const contract5 = {
      ...READY,
      contractVersion: 5,
      engine: { kind: "cloakbrowser", version: "151", status: "ready" },
      licenseCapacity: { total: 1, free: 1, active: 0, pendingRecovery: 0, cooling: 0 },
    };

    expect(currentDeviceBrowserReadiness(contract5).state).toBe("capacity-unknown");
    expect(currentDeviceBrowserReadiness({
      ...contract5,
      licenseCapacity: {
        ...contract5.licenseCapacity,
        availability: "unable-to-verify",
        reason: "REQUEST_TIMEOUT",
      },
    }).state).toBe("capacity-unknown");
    expect(currentDeviceBrowserReadiness({
      ...contract5,
      licenseCapacity: {
        ...contract5.licenseCapacity,
        availability: "in-use",
        reason: "CAPACITY_OCCUPIED",
      },
    }).state).toBe("no-capacity");
    expect(currentDeviceBrowserReadiness({
      ...contract5,
      licenseCapacity: {
        ...contract5.licenseCapacity,
        availability: "ready",
        reason: "CAPACITY_AVAILABLE",
      },
    })).toMatchObject({ ready: true, state: "ready" });
  });

  it.each([
    undefined,
    null,
    { total: 1, free: 1, active: 0, pendingRecovery: 0, cooling: 1 },
    { total: 1, free: "1", active: 0, pendingRecovery: 0, cooling: 0 },
    { total: 1, free: 2, active: -1, pendingRecovery: 0, cooling: 0 },
    { total: 1, free: 0, active: 0, pendingRecovery: 0, cooling: 1, retryAt: "cb_live_private" },
  ])("fails closed on missing or invalid licensed capacity without the flag: %j", (licenseCapacity) => {
    const result = currentDeviceBrowserReadiness({
      ...READY,
      engine: { kind: "cloakbrowser", version: "151", status: "ready" },
      licenseCapacity: licenseCapacity as never,
    });
    expect(result).toMatchObject({ ready: false, state: "capacity-unknown" });
    expect(result.message).not.toContain("cb_live_private");
  });

  it("does not invite closing a profile when no profile is active or infer capacity from an elapsed deadline", () => {
    for (const retryAt of [undefined, "2020-01-01T00:00:00.000Z"]) {
      const result = currentDeviceBrowserReadiness({
        ...READY,
        engine: { kind: "cloakbrowser", version: "151", status: "ready" },
        licenseCapacity: {
          total: 1, free: 0, active: 0, pendingRecovery: 0, cooling: 1,
          ...(retryAt ? { retryAt } : {}),
          availability: "cooling", reason: "CAPACITY_COOLING",
        },
      });
      expect(result).toMatchObject({ ready: false, state: "no-capacity" });
      expect(result.message).not.toMatch(/close|frees in/i);
    }
  });
});
