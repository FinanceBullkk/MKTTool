import { effectiveMinRelayVersion, TICKET_KINDS } from "../tickets/ticket-types";
import {
  currentDeviceBrowserReadiness,
  REQUIRED_SETUP_BROWSER_CAPABILITIES,
  type CurrentDeviceBrowserState,
} from "./current-device-browser-health";
import type { RelayOutcome } from "./relay-browser-client";
import {
  relayFailureCode,
  relayFailureStage,
  relayProfileFailureStage,
  type RelayRejection,
} from "./relay-failure-code";
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
  deviceId: string;
};

const BROWSER_TITLES: Record<Exclude<CurrentDeviceBrowserState, "ready">, string> = {
  "runtime-timeout": "MKT Browser readiness timed out",
  "browser-offline": "MKT Browser is not connected",
  "contract-mismatch": "MKT Browser needs a matching release",
  "engine-not-ready": "MKT Browser is not ready yet",
  "capability-missing": "MKT Browser needs attention",
  "install-readiness-unknown": "MKT Browser local installation is not verified",
  "install-readiness-unavailable": "MKT Browser local installation could not be verified",
  "install-readiness-checking": "MKT Browser is checking its local installation",
  "install-readiness-failed": "MKT Browser local installation needs repair",
  "capacity-unknown": "Browser capacity could not be checked",
  "recovery-pending": "MKT Browser is recovering a session",
  "no-capacity": "Browser capacity is unavailable",
};

const PROFILE_BROWSER_FAILURES: Record<string, Omit<ProfileSetupBlocked, "kind">> = {
  RUNTIME_TIMEOUT: {
    state: "runtime-timeout",
    title: BROWSER_TITLES["runtime-timeout"],
    message: "MKT Browser did not finish its readiness check in time. Keep it open, then check again.",
  },
  BROWSER_OFFLINE: {
    state: "browser-offline",
    title: BROWSER_TITLES["browser-offline"],
    message: "Open MKT Browser on this PC, then check again.",
  },
  CONTRACT_MISMATCH: {
    state: "contract-mismatch",
    title: BROWSER_TITLES["contract-mismatch"],
    message: "Install the matching MKT Browser release on this PC before managing browser profiles.",
  },
  ENGINE_NOT_READY: {
    state: "engine-not-ready",
    title: BROWSER_TITLES["engine-not-ready"],
    message: "Open MKT Browser and wait for its browser engine to become ready.",
  },
  CAPABILITY_MISSING: {
    state: "capability-missing",
    title: BROWSER_TITLES["capability-missing"],
    message: "Update MKT Browser on this PC before continuing.",
  },
  INSTALL_READINESS_UNKNOWN: {
    state: "install-readiness-unknown",
    title: BROWSER_TITLES["install-readiness-unknown"],
    message: "MKT Browser has not reported local installation readiness. Keep it open, then check again.",
  },
  INSTALL_READINESS_UNAVAILABLE: {
    state: "install-readiness-unavailable",
    title: BROWSER_TITLES["install-readiness-unavailable"],
    message: "MKT Browser could not verify its local installation. Keep it open, then check again.",
  },
  INSTALL_READINESS_CHECKING: {
    state: "install-readiness-checking",
    title: BROWSER_TITLES["install-readiness-checking"],
    message: "MKT Browser is checking its local installation. Wait for the check to finish, then check again.",
  },
  INSTALL_READINESS_FAILED: {
    state: "install-readiness-failed",
    title: BROWSER_TITLES["install-readiness-failed"],
    message: "MKT Browser found a local installation problem. Repair the current installation, then check again.",
  },
  CAPACITY_UNKNOWN: {
    state: "capacity-unknown",
    title: BROWSER_TITLES["capacity-unknown"],
    message: "MKT Browser could not verify available browser capacity. Open it and check its licence and recovery state before continuing.",
  },
  RECOVERY_PENDING: {
    state: "recovery-pending",
    title: BROWSER_TITLES["recovery-pending"],
    message: "MKT Browser is recovering a prior browser session. Wait for recovery to finish, then check again.",
  },
  NO_CAPACITY: {
    state: "no-capacity",
    title: BROWSER_TITLES["no-capacity"],
    message: "No browser capacity is available. Check the licence and wait state in MKT Browser before trying once manually.",
  },
};

/**
 * Câu báo hỏng khi cầu nối TỪ CHỐI lượt tạo profile.
 *
 * ## Vì sao không dùng chung bảng của luồng mở
 *
 * Tạo profile lệch luồng mở đúng một chỗ, và chỗ đó là cố ý: `INVALID_INPUT` phải đi thẳng ra
 * người đọc, vì MKT Browser liệt kê đúng những giá trị hợp lệ ngay trong câu của nó — viết lại là
 * vứt mất thứ duy nhất giúp sửa được lỗi đó. Quyết định này ghi ở đầu `relay/src/create-profile.ts`.
 *
 * Mọi câu còn lại của chặng `create-profile` thì KHÔNG chuyển tiếp: chúng ghép bằng
 * `${describe(error)}`, tức nguyên văn lỗi engine, kèm chuỗi kết nối proxy và đường dẫn máy.
 *
 * The `browser-health` stage carries operator-safe readiness guidance, including any earliest
 * permitted retry time, so preserve that wording when no stable error code is present.
 */
const CREATE_FAILURE_MESSAGE_BY_CODE: Record<string, string> = {
  RUNTIME_TIMEOUT: "MKT Browser did not finish its readiness check in time. Keep it open, then check again.",
  NO_CAPACITY: "No local browser capacity is available. Check the wait shown in MKT Browser before trying once manually; repeated attempts may extend it.",
  CAPACITY_UNKNOWN: "The local browser could not verify available capacity. Open MKT Browser and check its licence and recovery state before continuing.",
  RECOVERY_PENDING: "The local browser is recovering a prior session. Wait for recovery to finish, then check capacity before trying once manually.",
  PROXY_REJECTED: "The assigned proxy could not be applied, so the browser profile was not created. Check the proxy and retry.",
  ENGINE_UNAVAILABLE: "The local browser could not start. Check the engine, licence and wait state in MKT Browser before trying once manually; repeated attempts may extend a licence wait.",
  UNKNOWN_TOOL: "Update MKT Browser on this PC, then retry.",
  MANAGED_PROFILE_LOCKED: "Another operation is using this browser profile. Wait for it to finish, then retry.",
  PROFILE_DELETION_PENDING: "A browser profile is still being removed on this PC. Wait for the cleanup to finish, then retry.",
  FORBIDDEN: "MKT Browser refused this request on this PC. Open Setup and check this PC's registration.",
};

export function describeProfileCreateRejection(outcome: RelayRejection): string {
  const body = outcome.data;
  const message =
    body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : "";
  const code = relayFailureCode(outcome);

  if (code === "INVALID_INPUT" && message) return message;
  if (!code && relayFailureStage(outcome) === "browser-health" && message) return message;
  if (code && CREATE_FAILURE_MESSAGE_BY_CODE[code]) return CREATE_FAILURE_MESSAGE_BY_CODE[code];

  return "MKT Browser could not create the browser profile. Review Setup and the engine, licence and wait state in MKT Browser before another manual attempt.";
}

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
  if (outcome.status === "indeterminate") return {
    kind: "blocked", state: "relay-unknown", title: "Local Relay status could not be verified",
    message: "Keep MKT Browser and Relay open on this PC, then check again. If this continues, review Setup.",
    setupHref: "/setup",
  };
  if (outcome.status === "no-permission") return {
    kind: "blocked", state: "relay-permission", title: "Local PC access needs checking",
    message: "Check again and allow local network access if prompted. If access is already allowed, keep MKT Browser and Relay open and retry.",
  };
  if (outcome.status === "timeout") return {
    kind: "blocked", state: "relay-timeout", title: "Local Relay request timed out",
    message: "Relay did not report local browser status in time. Keep Relay open, then check again.",
  };
  return null;
}

/** Only a measured version below the ticket floor proves that a Relay update is required. */
export function profileSetupReadiness(
  profiles: RelayOutcome<RelayProfilesReply>,
  health: RelayOutcome<RelayHealth & RelayReply>,
): ProfileSetupReadiness {
  const profileVersion = measuredVersion(profiles);
  const healthVersion = measuredVersion(health);
  if (profileVersion && healthVersion && profileVersion !== healthVersion) return profileSetupUnknown();
  const version = profileVersion ?? healthVersion;
  if (version && version < effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE)) return {
    kind: "blocked", state: "relay-outdated", title: "Relay update required",
    message: "This Relay version cannot create browser profiles. Update Relay from Setup, then check again.",
    setupHref: "/setup#download",
  };

  const profileTransport = transportFailure(profiles);
  const healthTransport = profiles.status === "rejected" && health.status === "timeout"
    ? null
    : transportFailure(health);
  if (healthTransport) return healthTransport;
  if (!version) return profileSetupUnknown();
  if (profiles.status === "rejected" && health.status === "timeout") {
    return profileInventoryUnavailable(profiles);
  }
  if (health.status !== "ok" && health.status !== "rejected") return profileSetupUnknown();
  const local = health.data;
  if (!local || !healthVersion) return profileSetupUnknown();
  if (local.configured === false || local.retirementPending) return {
    kind: "blocked", state: "relay-setup", title: "Finish setting up this Relay PC",
    message: "Complete Relay setup or local cleanup on this PC, then check again.",
    setupHref: "/setup",
  };
  // A completed health reply is authoritative for this PC's Relay version and local Browser
  // readiness. Do not hide an actionable update or repair behind a parallel inventory timeout.
  if (health.status === "rejected" || !local.browser || typeof local.browser.ready !== "boolean") {
    return profileSetupUnknown();
  }
  if (!nonEmptyString(local.deviceId)) return profileSetupUnknown();
  const browser = currentDeviceBrowserReadiness(local.browser, REQUIRED_SETUP_BROWSER_CAPABILITIES);
  if (browser.state !== "ready") return {
    kind: "blocked", state: browser.state, title: BROWSER_TITLES[browser.state], message: browser.message,
  };
  if (profileTransport) return profileTransport;
  if (profiles.status === "ok" && profileVersion && validInventory(profiles.data)) return {
    kind: "ready", profiles: profiles.data.profiles!, options: profiles.data.fingerprintOptions!,
    deviceId: local.deviceId,
  };
  return profileInventoryUnavailable(profiles);
}

function profileInventoryUnavailable(
  profiles?: RelayOutcome<RelayProfilesReply>,
): ProfileSetupBlocked {
  const rejection = profiles?.status === "rejected" ? profiles : null;
  const code = rejection ? relayFailureCode(rejection) : null;
  const stage = rejection ? relayProfileFailureStage(rejection) : null;

  if (stage === "not-configured" || code === "BROWSER_NOT_CONFIGURED") {
    return {
      kind: "blocked", state: "browser-not-configured", title: "MKT Browser needs configuration",
      message: "Open MKT Browser, enable MCP, then check again.", setupHref: "/setup",
    };
  }

  if (code === "PROFILE_READ_TIMEOUT") {
    return {
      kind: "blocked", state: "profiles-timeout", title: "MKT Browser profile read timed out",
      message: "MKT Browser did not finish reading browser profiles in time. Keep it open, then check again.",
    };
  }

  if (stage === "browser-health") {
    const browserFailure = code ? PROFILE_BROWSER_FAILURES[code] : undefined;
    if (browserFailure) return { kind: "blocked", ...browserFailure };
    return {
      kind: "blocked", state: "browser-health-unavailable", title: "MKT Browser readiness could not be verified",
      message: "Keep MKT Browser open on this PC, then check again. If this continues, review Setup.",
      setupHref: "/setup",
    };
  }

  if (stage === "fingerprint-options") {
    return {
      kind: "blocked", state: "fingerprint-options-unavailable", title: "Browser profile options could not be read",
      message: "Keep MKT Browser open on this PC, then check again. If this continues, review Setup.",
      setupHref: "/setup",
    };
  }

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
