import { describe, expect, it } from "vitest";
import { RELAY_VERSION, type RelayHealth, type RelayReply } from "./relay-endpoints";
import type { RelayOutcome } from "./relay-browser-client";
import {
  currentRelayLaunchReadiness,
  describeProfileLaunchFailure,
  describeProfileTicketFailure,
  localProfileInventorySnapshot,
  profileLaunchReadiness,
  safeProxyPresentation,
} from "./profile-launch-readiness";

const HEALTH: RelayHealth & RelayReply = {
  ok: true,
  message: "Ready.",
  relayVersion: RELAY_VERSION,
  publicKey: "public-key",
  antidetectReady: true,
  configured: true,
  deviceId: "device-a",
  browser: {
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
  },
};

const PROFILE = {
  status: "ALIVE",
  antidetectProfileId: "profile-a",
  device: { id: "device-a" },
  proxy: {
    country: "US",
    lastCheckVerdict: "ALIVE",
    host: "203.0.113.10",
    port: 1080,
    lastExitIp: "198.51.100.20",
  },
  isRunning: false,
};

function outcome(
  health: RelayHealth & RelayReply = HEALTH,
): RelayOutcome<RelayHealth & RelayReply> {
  return { status: "ok", data: health, relayVersion: health.relayVersion };
}

describe("currentRelayLaunchReadiness", () => {
  it("fails closed until local readiness is known", () => {
    expect(currentRelayLaunchReadiness(null)).toMatchObject({
      ready: false,
      state: "checking",
    });
    expect(
      currentRelayLaunchReadiness({ status: "unreachable", message: "internal" }),
    ).toMatchObject({ ready: false, state: "relay-offline" });
    expect(
      currentRelayLaunchReadiness({ status: "indeterminate", message: "internal" }),
    ).toMatchObject({ ready: false, state: "relay-unknown" });
    expect(
      currentRelayLaunchReadiness({ status: "no-permission", message: "internal" }),
    ).toMatchObject({ ready: false, state: "relay-permission" });
    expect(
      currentRelayLaunchReadiness({ status: "timeout", message: "internal" }),
    ).toMatchObject({ ready: false, state: "relay-timeout" });
  });

  it("keeps rejected health data but blocks unconfigured and outdated Relay builds", () => {
    expect(
      currentRelayLaunchReadiness({
        status: "rejected",
        message: "internal",
        data: { ...HEALTH, ok: false, configured: false },
        relayVersion: RELAY_VERSION,
      }),
    ).toMatchObject({ ready: false, state: "relay-unconfigured" });

    expect(
      currentRelayLaunchReadiness(
        outcome({ ...HEALTH, relayVersion: RELAY_VERSION - 1 }),
      ),
    ).toMatchObject({ ready: false, state: "relay-outdated" });
  });

  it.each([
    ["pending", "RELAY_STARTUP_PENDING", "relay-starting"],
    ["failed", "RELAY_STARTUP_FAILED", "relay-startup-failed"],
  ] as const)("keeps Relay startup %s fail-closed before launch", (startupState, code, state) => {
    const readiness = currentRelayLaunchReadiness({
      status: "rejected",
      message: "private startup detail",
      data: {
        ...HEALTH,
        ok: false,
        startupState,
        code,
        configured: false,
        antidetectReady: false,
      },
      relayVersion: RELAY_VERSION,
    });

    expect(readiness).toMatchObject({ ready: false, state });
    expect(readiness.message).not.toContain("private startup detail");
  });

  it("surfaces measured recovery and capacity blockers before launch", () => {
    const licensed: RelayHealth & RelayReply = {
      ...HEALTH,
      browser: {
        ...HEALTH.browser,
        engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
        capabilities: HEALTH.browser.capabilities,
        licenseCapacity: {
          total: 2,
          free: 0,
          active: 1,
          pendingRecovery: 1,
          cooling: 0,
          availability: "recovering",
          reason: "RECOVERY_PENDING",
        },
      },
    };

    expect(currentRelayLaunchReadiness(outcome(licensed))).toMatchObject({
      ready: false,
      state: "recovery-pending",
    });
    expect(
      currentRelayLaunchReadiness(
        outcome({
          ...licensed,
          browser: {
            ...licensed.browser,
            licenseCapacity: {
              total: 2,
              free: 0,
              active: 2,
              pendingRecovery: 0,
              cooling: 0,
              availability: "in-use",
              reason: "CAPACITY_OCCUPIED",
            },
          },
        }),
      ),
    ).toMatchObject({ ready: false, state: "no-capacity" });
  });

  it("blocks a cooling seat before launch and carries the permitted manual retry time", () => {
    const retryAt = "2026-09-21T04:45:00.000Z";
    const readiness = currentRelayLaunchReadiness(outcome({
      ...HEALTH,
      browser: {
        ...HEALTH.browser,
        engine: { kind: "cloakbrowser", version: "151", status: "ready" },
        licenseCapacity: {
          total: 1, free: 0, active: 0, pendingRecovery: 0, cooling: 1, retryAt,
          availability: "cooling", reason: "CAPACITY_COOLING",
        },
      },
    }));
    expect(profileLaunchReadiness(PROFILE, readiness)).toMatchObject({
      ready: false, state: "no-capacity", deviceId: "device-a",
    });
    expect(readiness.message).toContain(retryAt);
    expect(readiness.message).not.toMatch(/close|frees in/i);
  });

  it("blocks launch when Relay cannot provide a current profile inventory", () => {
    const local = currentRelayLaunchReadiness(outcome());
    const unavailable = localProfileInventorySnapshot(local, {
      status: "rejected",
      message: "internal profile list failure",
      data: { ok: false, message: "internal", relayVersion: RELAY_VERSION },
      relayVersion: RELAY_VERSION,
    });
    const known = localProfileInventorySnapshot(local, {
      status: "ok",
      data: {
        ok: true,
        message: "Ready.",
        relayVersion: RELAY_VERSION,
        profiles: [
          null as never,
          { id: 123 as never, name: "Malformed", isRunning: true },
          { id: "profile-a", name: "A", isRunning: true },
          { id: "profile-b", name: "B", isRunning: false },
        ],
      },
      relayVersion: RELAY_VERSION,
    });

    expect(unavailable.readiness).toMatchObject({
      ready: false,
      state: "profile-state-unknown",
    });
    expect(unavailable.runningProfileIds).toBeNull();
    expect(known.readiness.ready).toBe(true);
    expect(known.runningProfileIds).toEqual(new Set(["profile-a"]));
  });
});

describe("profileLaunchReadiness", () => {
  const local = currentRelayLaunchReadiness(outcome());

  it("enables only a healthy profile assigned to the current PC", () => {
    expect(profileLaunchReadiness(PROFILE, local)).toMatchObject({
      ready: true,
      state: "ready",
    });
    expect(
      profileLaunchReadiness(
        { ...PROFILE, device: { id: "device-b" } },
        local,
      ),
    ).toMatchObject({ ready: false, state: "wrong-device" });
  });

  it("blocks known account, proxy, profile, and running states", () => {
    expect(profileLaunchReadiness({ ...PROFILE, status: "DEAD" }, local).state).toBe(
      "account-blocked",
    );
    expect(profileLaunchReadiness({ ...PROFILE, proxy: null }, local).state).toBe(
      "proxy-missing",
    );
    expect(
      profileLaunchReadiness(
        { ...PROFILE, proxy: { ...PROFILE.proxy, lastCheckVerdict: "DEAD" } },
        local,
      ).state,
    ).toBe("proxy-unhealthy");
    expect(
      profileLaunchReadiness({ ...PROFILE, antidetectProfileId: null }, local).state,
    ).toBe("profile-missing");
    expect(profileLaunchReadiness({ ...PROFILE, isRunning: true }, local).state).toBe(
      "running",
    );
  });

  it("never includes proxy endpoints or internal engine details in operator copy", () => {
    const proxy = safeProxyPresentation(PROFILE.proxy);
    const messages = [
      proxy.label,
      proxy.status,
      currentRelayLaunchReadiness(null).message,
      currentRelayLaunchReadiness({ status: "unreachable", message: "internal" }).message,
      currentRelayLaunchReadiness({ status: "indeterminate", message: "internal" }).message,
      currentRelayLaunchReadiness({ status: "no-permission", message: "internal" }).message,
      currentRelayLaunchReadiness(
        outcome({
          ...HEALTH,
          browser: {
            ...HEALTH.browser,
            ready: false,
            provider: null,
          },
        }),
      ).message,
      profileLaunchReadiness(PROFILE, local).message,
    ];
    const joined = messages.join("\n");

    expect(joined).not.toContain(PROFILE.proxy.host);
    expect(joined).not.toContain(PROFILE.proxy.lastExitIp);
    expect(joined).not.toContain(String(PROFILE.proxy.port));
    expect(joined).not.toMatch(/cloakbrowser|chromium|\bMCP\b|47821|47822|[A-Z]:\\/i);
  });

  it("maps launch failures by stable code without forwarding internal messages", () => {
    const internal = "connect 203.0.113.10:1080 using cb_live_secret_key";
    const recovery = describeProfileLaunchFailure({
      status: "rejected",
      message: internal,
      data: {
        ok: false,
        message: internal,
        relayVersion: RELAY_VERSION,
        code: "RECOVERY_PENDING",
      },
      relayVersion: RELAY_VERSION,
    });
    const unknown = describeProfileLaunchFailure({
      status: "rejected",
      message: internal,
      data: {
        ok: false,
        message: internal,
        relayVersion: RELAY_VERSION,
        code: "FUTURE_INTERNAL_FAILURE",
      },
      relayVersion: RELAY_VERSION,
    });

    expect(recovery).toContain("recovering");
    expect(unknown).toContain("Relay rejected");
    expect(unknown).toContain("before another manual attempt");
    expect(`${recovery}\n${unknown}`).not.toContain("203.0.113.10");
    expect(`${recovery}\n${unknown}`).not.toContain("1080");
    expect(`${recovery}\n${unknown}`).not.toContain("cb_live_secret_key");
  });

  it("treats a timed-out launch as ambiguous completion instead of permission denial", () => {
    const message = describeProfileLaunchFailure({
      status: "timeout",
      message: "private timeout detail",
    });

    expect(message).toContain("Check whether the browser opened");
    expect(message).not.toMatch(/permission|private timeout detail/i);
  });

  it("treats an indeterminate launch response as ambiguous completion", () => {
    const message = describeProfileLaunchFailure({
      status: "indeterminate",
      message: "private transport detail",
    });

    expect(message).toContain("Check whether the browser opened");
    expect(message).not.toMatch(/private transport detail|start relay/i);
  });

  it.each(["NO_CAPACITY", "ENGINE_UNAVAILABLE"])("does not invite an immediate launch repeat for %s", (code) => {
    const message = describeProfileLaunchFailure({
      status: "rejected", message: "private engine output",
      data: { ok: false, message: "private engine output", code, relayVersion: RELAY_VERSION },
      relayVersion: RELAY_VERSION,
    });
    expect(message).toContain("before trying once manually");
    expect(message).toContain("repeated attempts may extend");
    expect(message).not.toMatch(/close|open it and retry|then retry|private engine output/i);
  });

  it("preserves the server-cleaned ticket failure reason and keeps status fallbacks", () => {
    const ownershipMessage =
      'Nick "anna" is assigned to Relay PC "Operator PC" owned by operator@example.test.';

    expect(describeProfileTicketFailure(409, ownershipMessage)).toBe(ownershipMessage);
    expect(describeProfileTicketFailure(409, "   ")).toContain("assigned proxy");
    expect(describeProfileTicketFailure(409)).toContain("assigned proxy");
    expect(describeProfileTicketFailure(404)).toContain("no longer available");
    expect(describeProfileTicketFailure(502)).toContain("could not prepare");
  });
});
