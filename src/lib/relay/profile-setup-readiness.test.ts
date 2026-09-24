import { describe, expect, it } from "vitest";
import type { RelayOutcome } from "./relay-browser-client";
import type { RelayBrowserHealth, RelayHealth, RelayProfilesReply, RelayReply } from "./relay-endpoints";
import { effectiveMinRelayVersion, TICKET_KINDS } from "../tickets/ticket-types";
import { describeProfileCreateRejection, profileSetupReadiness } from "./profile-setup-readiness";

const PROFILE_ACTION_RELAY_VERSION = effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE);

const BROWSER: RelayBrowserHealth = {
  ready: true, provider: "mkt-browser", appVersion: "0.3.13", contractVersion: 6,
  contractCompatible: true, contractProblem: "", engine: { kind: "cft", version: "148", status: "ready" },
  capabilities: [
    "idempotent-create-v1", "atomic-launch-v1", "managed-profile-v1", "operation-diagnostics-v1",
    "install-readiness-v1", "local-install-ready-v1",
  ],
  localInstallReadiness: "ready",
};
const HEALTH: RelayHealth & RelayReply = {
  ok: true, relayVersion: PROFILE_ACTION_RELAY_VERSION, message: "Ready", publicKey: "public-key", configured: true,
  deviceId: "device-a", antidetectReady: true, browser: BROWSER,
};
const PROFILES: RelayProfilesReply = {
  ok: true, relayVersion: PROFILE_ACTION_RELAY_VERSION, message: "Ready", profiles: [{ id: "p1", name: "Existing profile" }],
  fingerprintOptions: {
    devices: [{ family: "windows-laptop", label: "Laptop", screens: [{ width: 1280, height: 720 }] }],
    locales: [{ id: "en-US", label: "English", country: "us", timezones: ["America/Denver"] }],
  },
};
const health = (patch: Partial<RelayHealth & RelayReply> = {}): RelayOutcome<RelayHealth & RelayReply> => ({
  status: "ok", data: { ...HEALTH, ...patch }, relayVersion: patch.relayVersion ?? PROFILE_ACTION_RELAY_VERSION,
});
const profiles = (patch: Partial<RelayProfilesReply> = {}): RelayOutcome<RelayProfilesReply> => ({
  status: "ok", data: { ...PROFILES, ...patch }, relayVersion: patch.relayVersion ?? PROFILE_ACTION_RELAY_VERSION,
});
const rejected: RelayOutcome<RelayProfilesReply> = {
  status: "rejected", message: "connect using cb_live_fixture_secret at 203.0.113.10:1080",
  relayVersion: PROFILE_ACTION_RELAY_VERSION,
  data: { ok: false, relayVersion: PROFILE_ACTION_RELAY_VERSION, message: "internal runtime failure" },
};

describe("profileSetupReadiness", () => {
  it("carries the measured local PC identity into a ready setup", () => {
    expect(profileSetupReadiness(profiles(), health({ deviceId: "device-b" })))
      .toMatchObject({ kind: "ready", deviceId: "device-b" });
  });

  it.each([undefined, "", "   "])("blocks creation without a local PC identity: %s", (deviceId) => {
    expect(profileSetupReadiness(profiles(), health({ deviceId })))
      .toMatchObject({ kind: "blocked", state: "relay-unknown" });
  });

  it("distinguishes current Relay with offline Browser from an old Relay", () => {
    const state = profileSetupReadiness(rejected, health({ browser: { ...BROWSER, ready: false, provider: null } }));
    expect(state).toMatchObject({ kind: "blocked", state: "browser-offline", title: "MKT Browser is not connected" });
    expect(JSON.stringify(state)).not.toMatch(/Relay update required|cb_live|203\.0\.113|1080/);
  });

  it.each([
    ["contract-mismatch", { contractCompatible: false }],
    ["engine-not-ready", { engine: { kind: "cft", version: "148", status: "missing" } }],
    ["capability-missing", { capabilities: [] }],
  ] as const)("keeps %s distinct from Relay updates", (state, patch) => {
    const result = profileSetupReadiness(rejected, health({ browser: { ...BROWSER, ...patch } as RelayBrowserHealth }));
    expect(result).toMatchObject({ kind: "blocked", state });
    expect(JSON.stringify(result)).not.toContain("Relay update required");
  });

  it("uses the actual create-ticket floor, not the latest published Relay version", () => {
    const floor = effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE);
    expect(profileSetupReadiness(profiles({ relayVersion: floor - 1 }), health({ relayVersion: floor - 1 })))
      .toMatchObject({ kind: "blocked", state: "relay-outdated", title: "Relay update required" });
    for (const version of [floor, floor + 1]) {
      expect(profileSetupReadiness(profiles({ relayVersion: version }), health({ relayVersion: version })))
        .toMatchObject({ kind: "ready", profiles: PROFILES.profiles, options: PROFILES.fingerprintOptions });
    }
  });

  it.each([undefined, null, 0, -1, 1.5, "12", NaN, Infinity])("never calls invalid version %s old or ready", (version) => {
    const result = profileSetupReadiness(
      { status: "ok", data: { ...PROFILES, relayVersion: version as number }, relayVersion: version as number },
      { status: "ok", data: { ...HEALTH, relayVersion: version as number }, relayVersion: version as number },
    );
    expect(result).toMatchObject({ kind: "blocked", state: "relay-unknown" });
    expect(JSON.stringify(result)).not.toContain("Relay update required");
  });

  it("does not combine conflicting versions or silently trust a malformed success", () => {
    expect(profileSetupReadiness(profiles({ relayVersion: 13 }), health()))
      .toMatchObject({ kind: "blocked", state: "relay-unknown" });
    expect(profileSetupReadiness(profiles({ profiles: undefined }), health()))
      .toMatchObject({ kind: "blocked", state: "profiles-unavailable" });
    expect(profileSetupReadiness(profiles({ profiles: [null as never] }), health()))
      .toMatchObject({ kind: "blocked", state: "profiles-unavailable" });
  });

  it("preserves a valid profile inventory when the creation catalog is empty", () => {
    expect(profileSetupReadiness(profiles({ fingerprintOptions: { devices: [], locales: [] } }), health()))
      .toMatchObject({ kind: "ready", profiles: PROFILES.profiles, options: { devices: [], locales: [] } });
  });

  it("accepts omitted or null optional profile metadata without inventing a list failure", () => {
    expect(profileSetupReadiness(profiles({ profiles: [
      { id: "p1", name: "" },
      { id: "p2", name: "Legacy", proxyCountry: null, timezone: null } as never,
    ] }), health())).toMatchObject({ kind: "ready" });
  });

  it("requires current Browser health without inferring offline from missing metadata", () => {
    expect(profileSetupReadiness(rejected, health({ browser: undefined as never })))
      .toMatchObject({ kind: "blocked", state: "relay-unknown" });
    expect(profileSetupReadiness(rejected, { status: "rejected", message: "unreadable" }))
      .toMatchObject({ kind: "blocked", state: "relay-unknown" });
  });

  it("reports profile-list failure safely when Browser health is ready", () => {
    const state = profileSetupReadiness(rejected, health());
    expect(state).toMatchObject({ kind: "blocked", state: "profiles-unavailable" });
    expect(JSON.stringify(state)).not.toMatch(/cb_live|203\.0\.113|1080|Relay update required/);
  });

  it("keeps an internal profile-read deadline distinct from an ordinary inventory failure", () => {
    const profileTimeout: RelayOutcome<RelayProfilesReply> = {
      status: "rejected",
      message: "private timing detail",
      relayVersion: PROFILE_ACTION_RELAY_VERSION,
      data: {
        ok: false,
        relayVersion: PROFILE_ACTION_RELAY_VERSION,
        message: "private timing detail",
        code: "PROFILE_READ_TIMEOUT",
        stage: "profile-read",
      },
    };

    const state = profileSetupReadiness(profileTimeout, health());
    expect(state).toMatchObject({ kind: "blocked", state: "profiles-timeout" });
    expect(JSON.stringify(state)).not.toContain("private timing detail");
  });

  it.each([
    ["checking", "install-readiness-checking"],
    ["unavailable", "install-readiness-unavailable"],
    ["failed", "install-readiness-failed"],
  ] as const)("blocks setup while v6 local installation is %s", (localInstallReadiness, state) => {
    const result = profileSetupReadiness(
      profiles(),
      health({ browser: { ...BROWSER, localInstallReadiness } }),
    );

    expect(result).toMatchObject({ kind: "blocked", state });
  });

  it("keeps a timed-out profile read distinct from permission denial", () => {
    const result = profileSetupReadiness(
      { status: "timeout", message: "private timeout" },
      health(),
    );

    expect(result).toMatchObject({ kind: "blocked", state: "relay-timeout" });
    expect(JSON.stringify(result)).not.toContain("private timeout");
  });

  it.each([{ configured: false }, { retirementPending: true }])(
    "keeps a completed Relay setup block ahead of a parallel profile timeout",
    (patch) => {
      const result = profileSetupReadiness(
        { status: "timeout", message: "private timeout" },
        health(patch),
      );

      expect(result).toMatchObject({ kind: "blocked", state: "relay-setup", setupHref: "/setup" });
      expect(JSON.stringify(result)).not.toContain("private timeout");
    },
  );

  it("keeps a measured outdated Relay ahead of a parallel profile timeout", () => {
    const floor = effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE);
    const result = profileSetupReadiness(
      { status: "timeout", message: "private timeout" },
      health({ relayVersion: floor - 1 }),
    );

    expect(result).toMatchObject({ kind: "blocked", state: "relay-outdated", setupHref: "/setup#download" });
    expect(JSON.stringify(result)).not.toContain("private timeout");
  });

  it("keeps a completed outdated profile response ahead of a parallel health timeout", () => {
    const floor = effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE);
    const result = profileSetupReadiness(
      profiles({ relayVersion: floor - 1 }),
      { status: "timeout", message: "private health timeout" },
    );

    expect(result).toMatchObject({ kind: "blocked", state: "relay-outdated", setupHref: "/setup#download" });
    expect(JSON.stringify(result)).not.toContain("private health timeout");
  });

  it("keeps a completed local installation failure ahead of a parallel profile timeout", () => {
    const result = profileSetupReadiness(
      { status: "timeout", message: "private timeout" },
      health({ browser: { ...BROWSER, localInstallReadiness: "failed" } }),
    );

    expect(result).toMatchObject({ kind: "blocked", state: "install-readiness-failed" });
    expect(JSON.stringify(result)).not.toContain("private timeout");
  });

  it("keeps a concrete profile rejection ahead of a concurrent health timeout", () => {
    const profileFailure: RelayOutcome<RelayProfilesReply> = {
      status: "rejected",
      relayVersion: PROFILE_ACTION_RELAY_VERSION,
      message: "token=private-value",
      data: {
        ok: false,
        relayVersion: PROFILE_ACTION_RELAY_VERSION,
        message: "token=private-value",
        code: "INSTALL_READINESS_UNAVAILABLE",
        stage: "browser-health",
      },
    };
    const result = profileSetupReadiness(
      profileFailure,
      { status: "timeout", message: "private health timeout" },
    );

    expect(result).toMatchObject({ kind: "blocked", state: "install-readiness-unavailable" });
    expect(JSON.stringify(result)).not.toMatch(/private-value|private health timeout/);
  });

  it("keeps a bounded Browser runtime timeout distinct from offline guidance", () => {
    const profileFailure: RelayOutcome<RelayProfilesReply> = {
      status: "rejected",
      relayVersion: PROFILE_ACTION_RELAY_VERSION,
      message: "private runtime timing",
      data: {
        ok: false,
        relayVersion: PROFILE_ACTION_RELAY_VERSION,
        message: "private runtime timing",
        code: "RUNTIME_TIMEOUT",
        stage: "browser-health",
      },
    };

    const result = profileSetupReadiness(profileFailure, health());

    expect(result).toMatchObject({ kind: "blocked", state: "runtime-timeout" });
    if (result.kind !== "blocked") throw new Error("Runtime timeout unexpectedly allowed profile setup.");
    expect(result.message).toContain("did not finish");
    expect(JSON.stringify(result)).not.toMatch(/not connected|private runtime timing/i);
  });

  it("uses only allowlisted profile stages for safe operator guidance", () => {
    const optionsFailure: RelayOutcome<RelayProfilesReply> = {
      status: "rejected",
      relayVersion: PROFILE_ACTION_RELAY_VERSION,
      message: "private provider output",
      data: {
        ok: false,
        relayVersion: PROFILE_ACTION_RELAY_VERSION,
        message: "private provider output",
        code: "FINGERPRINT_OPTIONS_UNAVAILABLE",
        stage: "fingerprint-options",
      },
    };
    const unknownStage: RelayOutcome<RelayProfilesReply> = {
      status: "rejected",
      relayVersion: PROFILE_ACTION_RELAY_VERSION,
      message: "https://relay.example/?token=private-value",
      data: {
        ok: false,
        relayVersion: PROFILE_ACTION_RELAY_VERSION,
        message: "https://relay.example/?token=private-value",
        stage: "future-stage" as never,
      },
    };

    expect(profileSetupReadiness(optionsFailure, health())).toMatchObject({
      kind: "blocked",
      state: "fingerprint-options-unavailable",
    });
    const fallback = profileSetupReadiness(unknownStage, health());
    expect(fallback).toMatchObject({ kind: "blocked", state: "profiles-unavailable" });
    expect(JSON.stringify(fallback)).not.toContain("private-value");
  });

  it.each(["unreachable", "indeterminate", "no-permission"] as const)("keeps %s separate and retryable", (status) => {
    expect(profileSetupReadiness({ status, message: "raw failure" }, { status, message: "raw failure" }))
      .toMatchObject({
        kind: "blocked",
        state: status === "unreachable" ? "relay-offline" : status === "indeterminate" ? "relay-unknown" : "relay-permission",
      });
  });

  it.each([{ configured: false }, { retirementPending: true }])("directs an unfinished Relay to Setup", (patch) => {
    const result = profileSetupReadiness(rejected, { ...health(patch), status: "rejected", message: "not ready" });
    expect(result).toMatchObject({ kind: "blocked", state: "relay-setup", setupHref: "/setup" });
  });

  it("keeps measured recovery and capacity blockers", () => {
    const licensed: RelayBrowserHealth = {
      ...BROWSER, engine: { kind: "cloakbrowser", version: "145", status: "ready" },
      capabilities: BROWSER.capabilities,
      licenseCapacity: {
        total: 2, free: 0, active: 1, pendingRecovery: 1, cooling: 0,
        availability: "recovering", reason: "RECOVERY_PENDING",
      },
    };
    expect(profileSetupReadiness(rejected, health({ browser: licensed })))
      .toMatchObject({ kind: "blocked", state: "recovery-pending" });
    expect(profileSetupReadiness(rejected, health({ browser: { ...licensed, licenseCapacity: null } })))
      .toMatchObject({ kind: "blocked", state: "capacity-unknown" });
    expect(profileSetupReadiness(rejected, health({ browser: { ...licensed,
      licenseCapacity: {
        total: 2, free: 0, active: 2, pendingRecovery: 0, cooling: 0,
        availability: "in-use", reason: "CAPACITY_OCCUPIED",
      },
    } }))).toMatchObject({ kind: "blocked", state: "no-capacity" });
  });

  it("blocks setup on a cooling seat and shows the earliest permitted manual retry", () => {
    const retryAt = "2026-09-21T04:45:00.000Z";
    const result = profileSetupReadiness(profiles(), health({ browser: {
      ...BROWSER, engine: { kind: "cloakbrowser", version: "151", status: "ready" },
      licenseCapacity: {
        total: 1, free: 0, active: 0, pendingRecovery: 0, cooling: 1, retryAt,
        availability: "cooling", reason: "CAPACITY_COOLING",
      },
    } }));
    expect(result).toMatchObject({ kind: "blocked", state: "no-capacity", title: "Browser capacity is unavailable" });
    if (result.kind !== "blocked") throw new Error("Expected cooling capacity to block setup");
    expect(result.message).toContain(retryAt);
    expect(result.message).not.toMatch(/close|frees in/i);
  });
});

describe("describeProfileCreateRejection", () => {
  /** Nguyên văn lỗi engine: chuỗi kết nối proxy kèm mật khẩu. Không câu nào được chứa nó. */
  const INTERNAL = "Could not create the profile. connect 203.0.113.10:1080 using cb_live_secret_key";

  const rejection = (message: string, diagnostic?: Record<string, unknown>, code?: string) =>
    ({
      status: "rejected" as const,
      message,
      data: { ok: false, relayVersion: PROFILE_ACTION_RELAY_VERSION, message, ...(code ? { code } : {}), ...(diagnostic ? { diagnostic } : {}) },
      relayVersion: PROFILE_ACTION_RELAY_VERSION,
    });

  it("passes INVALID_INPUT through, because MKT Browser lists the valid values in it", () => {
    const valid = "Could not create the profile. timezone must be one of: Europe/London, Europe/Paris.";
    expect(
      describeProfileCreateRejection(rejection(valid, { stage: "create-profile", code: "INVALID_INPUT" })),
    ).toBe(valid);
  });

  it("maps a known engine failure by code instead of repeating the engine", () => {
    const result = describeProfileCreateRejection(
      rejection(INTERNAL, { stage: "create-profile", code: "PROXY_REJECTED" }),
    );
    expect(result).toMatch(/proxy/i);
    expect(result).not.toContain("cb_live_secret_key");
    expect(result).not.toContain("203.0.113.10");
  });

  it("keeps a bounded Browser runtime timeout distinct from an engine or offline failure", () => {
    const result = describeProfileCreateRejection(
      rejection(INTERNAL, { stage: "browser-health", code: "RUNTIME_TIMEOUT" }),
    );

    expect(result).toContain("did not finish");
    expect(result).not.toMatch(/offline|engine|cb_live_secret_key|203\.0\.113/i);
  });

  it("stays generic when the failure carries no code the contract knows", () => {
    const unknown = describeProfileCreateRejection(
      rejection(INTERNAL, { stage: "create-profile", code: "FUTURE_INTERNAL_FAILURE" }),
    );
    const uncoded = describeProfileCreateRejection(rejection(INTERNAL, { stage: "create-profile" }));

    for (const result of [unknown, uncoded]) {
      expect(result).not.toContain("cb_live_secret_key");
      expect(result).not.toContain("203.0.113.10");
      expect(result).toMatch(/could not create the browser profile/i);
      expect(result).toContain("before another manual attempt");
    }
  });

  it("keeps the Relay's own readiness wording, which arrives without a code", () => {
    const readiness = "Browser capacity is waiting. Earliest permitted manual retry: 2026-09-21T04:45:00.000Z (UTC).";
    expect(describeProfileCreateRejection(rejection(readiness, { stage: "browser-health" }))).toBe(readiness);
  });

  it.each(["NO_CAPACITY", "ENGINE_UNAVAILABLE"])("directs %s to its wait before another manual attempt", (code) => {
    const message = describeProfileCreateRejection(rejection(INTERNAL, { stage: "create-profile", code }));
    expect(message).toContain("before trying once manually");
    expect(message).toContain("repeated attempts may extend");
    expect(message).not.toMatch(/open.*and retry|cb_live_secret_key|203\.0\.113/);
  });

  it("reads the code from the body as well as from the diagnostic", () => {
    expect(describeProfileCreateRejection(rejection(INTERNAL, undefined, "MANAGED_PROFILE_LOCKED")))
      .toMatch(/another operation/i);
  });

  it("never names the engine, a port, or a path in a message it wrote itself", () => {
    const written = [
      describeProfileCreateRejection(rejection(INTERNAL, { stage: "create-profile", code: "PROXY_REJECTED" })),
      describeProfileCreateRejection(rejection(INTERNAL, { stage: "create-profile", code: "ENGINE_UNAVAILABLE" })),
      describeProfileCreateRejection(rejection(INTERNAL, { stage: "create-profile", code: "FORBIDDEN" })),
      describeProfileCreateRejection(rejection(INTERNAL, { stage: "create-profile" })),
    ].join(" ");

    expect(written).not.toMatch(/cloakbrowser|chromium|\bMCP\b|47821|47822|[A-Z]:\\/i);
  });
});
