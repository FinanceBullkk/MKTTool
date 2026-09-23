import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayHealth } from "@/lib/relay/relay-endpoints";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";

const mocks = vi.hoisted(() => ({
  pingRelay: vi.fn(),
  inspectSetupDevice: vi.fn(),
}));

vi.mock("@/lib/relay/relay-browser-client", () => ({ pingRelay: mocks.pingRelay }));
vi.mock("./setup-device-actions", () => ({ inspectSetupDevice: mocks.inspectSetupDevice }));

const { probeSetupRelay } = await import("./setup-relay-probe");

const HEALTH: RelayHealth = {
  relayVersion: RELAY_VERSION,
  publicKey: "public-device-key",
  antidetectReady: false,
  browser: {
    ready: false,
    provider: null,
    appVersion: null,
    contractVersion: null,
    contractCompatible: false,
    contractProblem: "",
    engine: null,
    capabilities: [],
  },
};

beforeEach(() => vi.clearAllMocks());

describe("probeSetupRelay", () => {
  it("keeps Local Network Access denial distinct from registry failure", async () => {
    mocks.pingRelay.mockResolvedValue({ status: "no-permission", message: "Permission denied" });

    await expect(probeSetupRelay()).resolves.toEqual({
      relay: { status: "permission-denied" },
      health: null,
      detail: "Permission denied",
    });
    expect(mocks.inspectSetupDevice).not.toHaveBeenCalled();
  });

  it("keeps a Relay timeout distinct from local-network permission denial", async () => {
    mocks.pingRelay.mockResolvedValue({ status: "timeout", message: "private timeout" });

    await expect(probeSetupRelay()).resolves.toEqual({
      relay: { status: "timeout" },
      health: null,
      detail: "Relay did not report local setup status in time. Keep it open, then check this PC again.",
    });
    expect(mocks.inspectSetupDevice).not.toHaveBeenCalled();
  });

  it("uses a neutral repair state when registry inspection rejects", async () => {
    mocks.pingRelay.mockResolvedValue({ status: "ok", data: HEALTH });
    mocks.inspectSetupDevice.mockResolvedValue({ ok: false, message: "Database detail" });

    const result = await probeSetupRelay();

    expect(result.device).toEqual({ status: "inspection-failed" });
    expect(result.detail).toBe("MKTTool could not verify this PC safely.");
  });

  it("uses the same neutral repair state when registry inspection throws", async () => {
    mocks.pingRelay.mockResolvedValue({ status: "ok", data: HEALTH });
    mocks.inspectSetupDevice.mockRejectedValue(new Error("Database unavailable"));

    const result = await probeSetupRelay();

    expect(result.device).toEqual({ status: "inspection-failed" });
    expect(result.detail).toBe("MKTTool could not verify this PC safely.");
  });

  it("fails closed before registry inspection when local retirement is pending", async () => {
    mocks.pingRelay.mockResolvedValue({
      status: "rejected",
      message: "Relay identity is retired.",
      data: { ...HEALTH, retirementPending: true, deviceId: "retired-device" },
    });

    const result = await probeSetupRelay();

    expect(result.device).toEqual({ status: "retirement-pending" });
    expect(result.relay).toEqual({
      status: "responded",
      health: { ...HEALTH, retirementPending: true, deviceId: "retired-device" },
    });
    expect(mocks.inspectSetupDevice).not.toHaveBeenCalled();
  });
});
