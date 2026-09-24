import { afterEach, describe, expect, it, vi } from "vitest";
import { MktBrowserAdapter } from "../../src/lib/antidetect/mkt-browser-adapter";
import { RELAY_READINESS_BUDGET_MS, RelayAntidetect } from "./relay-antidetect";
import { createCompatibilityUpdateHealthSnapshot, createRelayHealthRoute } from "./relay-health-route";
import type { RelayConfig } from "./relay-config";

const CONFIG: RelayConfig = {
  deviceId: "device-abc",
  serverPublicKey: "a".repeat(64),
  vaultKeyOperator: "b".repeat(64),
  webOrigin: "https://mkttool.example.com",
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Relay health route", () => {
  it("keeps protected compatibility state out of a bounded slow-MCP health request", async () => {
    vi.useFakeTimers();
    const readProtectedState = vi.fn(() => null);
    const compatibilityUpdate = createCompatibilityUpdateHealthSnapshot(readProtectedState);
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockImplementation(async () => new Promise<never>(() => {}));
    const antidetect = new RelayAntidetect(CONFIG, () => ({
      value: "c".repeat(64),
      source: "mkt-browser-data",
    }));
    const health = createRelayHealthRoute({
      currentState: () => ({
        problems: [],
        webOrigin: CONFIG.webOrigin,
        deviceId: CONFIG.deviceId,
      }),
      describeRuntime: () => antidetect.describeRuntime(),
      publicKey: "public-key",
      notConfiguredMessage: () => "Relay needs setup.",
      pendingRetirement: () => null,
      retirementHealth: () => ({ ok: false, message: "Retirement is pending." }),
      compatibilityUpdate,
      machineName: () => "test-pc",
    });

    const result = health({} as never, "");
    await vi.advanceTimersByTimeAsync(RELAY_READINESS_BUDGET_MS);

    await expect(result).resolves.toMatchObject({
      ok: true,
      machineName: "test-pc",
      browser: { ready: false, runtimeObservation: "timeout" },
      compatibilityUpdate: { initialized: false },
    });
    // The snapshot is loaded before the route is created, not while the request is waiting.
    expect(readProtectedState).toHaveBeenCalledTimes(1);
  });
});
