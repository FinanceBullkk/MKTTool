import { describe, expect, it } from "vitest";
import type { RelayOutcome } from "./relay-browser-client";
import type { RelayBrowserHealth, RelayHealth, RelayProfilesReply, RelayReply } from "./relay-endpoints";
import { effectiveMinRelayVersion, TICKET_KINDS } from "../tickets/ticket-types";
import { profileSetupReadiness } from "./profile-setup-readiness";

const BROWSER: RelayBrowserHealth = {
  ready: true, provider: "mkt-browser", appVersion: "0.3.13", contractVersion: 4,
  contractCompatible: true, contractProblem: "", engine: { kind: "cft", version: "148", status: "ready" },
  capabilities: ["idempotent-create-v1", "atomic-launch-v1", "managed-profile-v1", "operation-diagnostics-v1"],
};
const HEALTH: RelayHealth & RelayReply = {
  ok: true, relayVersion: 16, message: "Ready", publicKey: "public-key", configured: true,
  deviceId: "device-a", antidetectReady: true, browser: BROWSER,
};
const PROFILES: RelayProfilesReply = {
  ok: true, relayVersion: 16, message: "Ready", profiles: [{ id: "p1", name: "Existing profile" }],
  fingerprintOptions: {
    devices: [{ family: "windows-laptop", label: "Laptop", screens: [{ width: 1280, height: 720 }] }],
    locales: [{ id: "en-US", label: "English", country: "us", timezones: ["America/Denver"] }],
  },
};
const health = (patch: Partial<RelayHealth & RelayReply> = {}): RelayOutcome<RelayHealth & RelayReply> => ({
  status: "ok", data: { ...HEALTH, ...patch }, relayVersion: patch.relayVersion ?? 16,
});
const profiles = (patch: Partial<RelayProfilesReply> = {}): RelayOutcome<RelayProfilesReply> => ({
  status: "ok", data: { ...PROFILES, ...patch }, relayVersion: patch.relayVersion ?? 16,
});
const rejected: RelayOutcome<RelayProfilesReply> = {
  status: "rejected", message: "connect using cb_live_fixture_secret at 203.0.113.10:1080",
  relayVersion: 16, data: { ok: false, relayVersion: 16, message: "internal runtime failure" },
};

describe("profileSetupReadiness", () => {
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
    for (const version of [floor, 14, 15, 16, 17]) {
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

  it.each(["unreachable", "no-permission"] as const)("keeps %s separate and retryable", (status) => {
    expect(profileSetupReadiness({ status, message: "raw failure" }, { status, message: "raw failure" }))
      .toMatchObject({ kind: "blocked", state: status === "unreachable" ? "relay-offline" : "relay-permission" });
  });

  it.each([{ configured: false }, { retirementPending: true }])("directs an unfinished Relay to Setup", (patch) => {
    const result = profileSetupReadiness(rejected, { ...health(patch), status: "rejected", message: "not ready" });
    expect(result).toMatchObject({ kind: "blocked", state: "relay-setup", setupHref: "/setup" });
  });

  it("keeps measured recovery and capacity blockers", () => {
    const licensed = {
      ...BROWSER, engine: { kind: "cloakbrowser", version: "145", status: "ready" },
      capabilities: [...BROWSER.capabilities, "license-capacity-v1"],
      licenseCapacity: { total: 2, free: 0, active: 1, pendingRecovery: 1, cooling: 0 },
    };
    expect(profileSetupReadiness(rejected, health({ browser: licensed })))
      .toMatchObject({ kind: "blocked", state: "recovery-pending" });
    expect(profileSetupReadiness(rejected, health({ browser: { ...licensed, licenseCapacity: null } })))
      .toMatchObject({ kind: "blocked", state: "capacity-unknown" });
    expect(profileSetupReadiness(rejected, health({ browser: { ...licensed,
      licenseCapacity: { ...licensed.licenseCapacity, pendingRecovery: 0 },
    } }))).toMatchObject({ kind: "blocked", state: "no-capacity" });
  });
});
