import { effectiveMinRelayVersion, TICKET_KINDS } from "../tickets/ticket-types";
import { currentDeviceBrowserReadiness, type CurrentDeviceBrowserState } from "./current-device-browser-health";
import type { RelayOutcome } from "./relay-browser-client";
import type {
  RelayFingerprintOptions, RelayHealth, RelayProfilesReply, RelayProfileSummary, RelayReply,
} from "./relay-endpoints";

export interface ProfileSetupBlocked {
  kind: "blocked";
  state: string;
  title: string;
  message: string;
  setupHref?: string;
}

export type ProfileSetupReadiness = ProfileSetupBlocked | {
  kind: "ready";
  profiles: RelayProfileSummary[];
  options: RelayFingerprintOptions;
};

const BROWSER_TITLES: Record<Exclude<CurrentDeviceBrowserState, "ready">, string> = {
  "browser-offline": "MKT Browser is not connected",
  "contract-mismatch": "MKT Browser needs a matching release",
  "engine-not-ready": "MKT Browser is not ready yet",
  "capability-missing": "MKT Browser needs attention",
  "capacity-unknown": "Browser capacity could not be checked",
  "recovery-pending": "MKT Browser is recovering a session",
  "no-capacity": "Browser capacity is in use",
};

export function profileSetupUnknown(): ProfileSetupBlocked {
  return {
    kind: "blocked", state: "relay-unknown", title: "Local browser status could not be verified",
    message: "Open MKT Browser and Relay on this PC, then check again. If this continues, review Setup.",
    setupHref: "/setup",
  };
}

function measuredVersion(outcome: RelayOutcome<RelayReply>): number | undefined {
  if (outcome.status !== "ok" && outcome.status !== "rejected") return undefined;
  const version = outcome.relayVersion ?? outcome.data?.relayVersion;
  if (!Number.isSafeInteger(version) || version! <= 0) return undefined;
  if (outcome.data?.relayVersion !== undefined && outcome.data.relayVersion !== version) return undefined;
  return version;
}

function transportFailure(outcome: RelayOutcome<unknown>): ProfileSetupBlocked | null {
  if (outcome.status === "unreachable") return {
    kind: "blocked", state: "relay-offline", title: "Relay is not reachable on this PC",
    message: "Open MKT Browser and Relay on this PC, then check again. The nick edit form remains available.",
  };
  if (outcome.status === "no-permission") return {
    kind: "blocked", state: "relay-permission", title: "Local PC access needs checking",
    message: "Check again and allow local network access if prompted. If access is already allowed, keep MKT Browser and Relay open and retry.",
  };
  return null;
}

/** Only a measured version below the ticket floor proves that a Relay update is required. */
export function profileSetupReadiness(
  profiles: RelayOutcome<RelayProfilesReply>,
  health: RelayOutcome<RelayHealth & RelayReply>,
): ProfileSetupReadiness {
  const transport = transportFailure(profiles) ?? transportFailure(health);
  if (transport) return transport;
  const profileVersion = measuredVersion(profiles);
  const healthVersion = measuredVersion(health);
  if (profileVersion && healthVersion && profileVersion !== healthVersion) return profileSetupUnknown();
  const version = profileVersion ?? healthVersion;
  if (!version) return profileSetupUnknown();
  if (version < effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE)) return {
    kind: "blocked", state: "relay-outdated", title: "Relay update required",
    message: "This Relay version cannot create browser profiles. Update Relay from Setup, then check again.",
    setupHref: "/setup#download",
  };
  if (health.status !== "ok" && health.status !== "rejected") return profileSetupUnknown();
  const local = health.data;
  if (!local || !healthVersion) return profileSetupUnknown();
  if (local.configured === false || local.retirementPending) return {
    kind: "blocked", state: "relay-setup", title: "Finish setting up this Relay PC",
    message: "Complete Relay setup or local cleanup on this PC, then check again.",
    setupHref: "/setup",
  };
  if (health.status === "rejected" || !local.browser || typeof local.browser.ready !== "boolean") {
    return profileSetupUnknown();
  }
  const browser = currentDeviceBrowserReadiness(local.browser);
  if (browser.state !== "ready") return {
    kind: "blocked", state: browser.state, title: BROWSER_TITLES[browser.state], message: browser.message,
  };
  if (profiles.status === "ok" && profileVersion && validInventory(profiles.data)) return {
    kind: "ready", profiles: profiles.data.profiles!, options: profiles.data.fingerprintOptions!,
  };
  return {
    kind: "blocked", state: "profiles-unavailable", title: "Browser profiles could not be read",
    message: "Keep MKT Browser open on this PC, then check again. If this continues, review Setup. You can still paste an existing browser profile ID into the nick edit form.",
    setupHref: "/setup",
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validInventory(data: RelayProfilesReply): boolean {
  const options = data.fingerprintOptions;
  return Array.isArray(data.profiles) && data.profiles.every((profile) =>
    profile && nonEmptyString(profile.id) && typeof profile.name === "string" &&
    (profile.proxyCountry == null || typeof profile.proxyCountry === "string") &&
    (profile.timezone == null || typeof profile.timezone === "string"),
  ) && !!options && Array.isArray(options.devices) &&
    options.devices.every((device) => device && nonEmptyString(device.family) &&
      Array.isArray(device.screens) && device.screens.length > 0 && device.screens.every((screen) =>
        screen && Number.isSafeInteger(screen.width) && screen.width > 0 &&
        Number.isSafeInteger(screen.height) && screen.height > 0,
      ),
    ) && Array.isArray(options.locales) &&
    options.locales.every((locale) => locale && nonEmptyString(locale.id) &&
      nonEmptyString(locale.country) && Array.isArray(locale.timezones) &&
      locale.timezones.length > 0 && locale.timezones.every(nonEmptyString),
    );
}
