/**
 * Locality controls whether an administrator can see a retirement action. A false match restores
 * the misleading cross-PC button; a false mismatch removes the only cleanup path from the correct
 * PC. Ambiguous outcomes therefore remain `unverified` instead of becoming `elsewhere`.
 */
import { describe, expect, it } from "vitest";
import type { RelayOutcome } from "./relay-browser-client";
import { relayDeviceLocality } from "./relay-device-locality";
import { RELAY_VERSION, type RelayHealth, type RelayReply } from "./relay-endpoints";

const TARGET = { deviceId: "device-a", publicKey: "public-key-a", deviceName: "PC Hao" };

const HEALTH: RelayHealth & RelayReply = {
  ok: true,
  message: "Ready.",
  relayVersion: RELAY_VERSION,
  publicKey: "public-key-a",
  antidetectReady: true,
  configured: true,
  deviceId: "device-a",
  browser: {
    ready: true,
    provider: "mkt-browser",
    appVersion: "0.3.1",
    contractVersion: 4,
    contractCompatible: true,
    contractProblem: "",
    engine: { kind: "cft", version: "148.0.0.0", status: "ready" },
    capabilities: [],
  },
};

const ok = (health: RelayHealth & RelayReply): RelayOutcome<RelayHealth & RelayReply> => ({
  status: "ok",
  data: health,
});

describe("relayDeviceLocality", () => {
  it("keeps the action pending until the local lookup finishes", () => {
    expect(relayDeviceLocality(null, TARGET)).toEqual({ state: "checking" });
  });

  it("matches when both the public key and device ID identify the selected PC", () => {
    expect(relayDeviceLocality(ok(HEALTH), TARGET)).toEqual({ state: "match" });
  });

  it("treats a public-key mismatch as the only definite other-PC result", () => {
    const elsewhere = relayDeviceLocality(ok({ ...HEALTH, publicKey: "public-key-b" }), TARGET);
    expect(elsewhere.state).toBe("elsewhere");
    // The guidance names the PC that the operator needs to open.
    expect(elsewhere.state === "elsewhere" && elsewhere.note).toContain("PC Hao");
  });

  it("keeps the action for an incompletely configured PC with a matching public key", () => {
    // An unconfigured Relay returns `rejected` but still reports the machine public key.
    const rejected: RelayOutcome<RelayHealth & RelayReply> = {
      status: "rejected",
      message: "Setup is not finished.",
      data: { ...HEALTH, ok: false, configured: false, deviceId: null },
    };
    expect(relayDeviceLocality(rejected, TARGET).state).toBe("unverified");
  });

  it("keeps the action when Relay is offline so a user click can retry", () => {
    const unreachable: RelayOutcome<RelayHealth & RelayReply> = {
      status: "unreachable",
      message: "no relay",
    };
    expect(relayDeviceLocality(unreachable, TARGET).state).toBe("unverified");
  });

  it("keeps the action and explains missing local-network permission", () => {
    const blocked: RelayOutcome<RelayHealth & RelayReply> = {
      status: "no-permission",
      message: "blocked",
    };
    const locality = relayDeviceLocality(blocked, TARGET);
    expect(locality.state).toBe("unverified");
    expect(locality.state === "unverified" && locality.note).toContain("allowed");
  });

  it("keeps the action when a rejected response has no readable body", () => {
    const rejected: RelayOutcome<RelayHealth & RelayReply> = {
      status: "rejected",
      message: "unreadable",
    };
    expect(relayDeviceLocality(rejected, TARGET).state).toBe("unverified");
  });

  it("keeps the action when the response omits its public key", () => {
    expect(relayDeviceLocality(ok({ ...HEALTH, publicKey: "" }), TARGET).state).toBe("unverified");
  });
});
