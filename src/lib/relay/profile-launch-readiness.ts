import { getStatusPresentation } from "@/lib/accounts/account-status";
import { PROBLEM_VERDICTS } from "@/lib/proxies/proxy-liveness-verdict";
import { currentDeviceBrowserReadiness } from "./current-device-browser-health";
import type { RelayOutcome } from "./relay-browser-client";
import {
  RELAY_VERSION,
  type RelayHealth,
  type RelayProfilesReply,
  type RelayReply,
} from "./relay-endpoints";

export interface LocalLaunchReadiness {
  ready: boolean;
  state: string;
  message: string;
  deviceId: string | null;
}

export interface ProfileLaunchFacts {
  status: string;
  antidetectProfileId: string | null;
  device: { id: string } | null;
  proxy: { country: string; lastCheckVerdict: string | null } | null;
  isRunning: boolean;
}

export interface LocalProfileInventorySnapshot {
  readiness: LocalLaunchReadiness;
  runningProfileIds: Set<string> | null;
}

export function currentRelayLaunchReadiness(
  outcome: RelayOutcome<RelayHealth & RelayReply> | null,
): LocalLaunchReadiness {
  if (!outcome) return blocked("checking", "Checking local browser profile conditions...");
  if (outcome.status === "unreachable") {
    return blocked("relay-offline", "Start Relay on this PC, then check again.");
  }
  if (outcome.status === "no-permission") {
    return blocked(
      "relay-permission",
      "Allow local network access for this site, then check again.",
    );
  }

  const health = outcome.data;
  if (!health) {
    return blocked("relay-rejected", "Relay could not report local readiness. Open Setup and retry.");
  }
  if (!Number.isSafeInteger(health.relayVersion) || health.relayVersion < RELAY_VERSION) {
    return blocked("relay-outdated", "Update Relay on this PC before opening a browser profile.");
  }
  if (health.retirementPending || health.configured === false) {
    return blocked("relay-unconfigured", "Finish Relay setup on this PC before opening a browser profile.");
  }
  if (outcome.status === "rejected") {
    return blocked("relay-rejected", "Relay is not ready to open a browser profile. Open Setup and retry.");
  }

  const browser = currentDeviceBrowserReadiness(health.browser);
  if (!browser.ready) return blocked(browser.state, browser.message, health.deviceId ?? null);
  return {
    ready: true,
    state: "ready",
    message: "Local browser technical checks passed; identity isolation is not proven.",
    deviceId: health.deviceId ?? null,
  };
}

export function localProfileInventorySnapshot(
  local: LocalLaunchReadiness,
  outcome: RelayOutcome<RelayProfilesReply>,
): LocalProfileInventorySnapshot {
  if (outcome.status !== "ok" || !Array.isArray(outcome.data.profiles)) {
    return {
      readiness: local.ready
        ? blocked(
            "profile-state-unknown",
            "The local browser profile state could not be verified. Keep Relay open, then check again.",
            local.deviceId,
          )
        : local,
      runningProfileIds: null,
    };
  }

  return {
    readiness: local,
    runningProfileIds: new Set(
      outcome.data.profiles
        .filter(
          (profile) =>
            profile !== null &&
            typeof profile === "object" &&
            profile.isRunning === true &&
            typeof profile.id === "string",
        )
        .map((profile) => profile.id),
    ),
  };
}

export function profileLaunchReadiness(
  profile: ProfileLaunchFacts,
  local: LocalLaunchReadiness,
): LocalLaunchReadiness {
  if (profile.isRunning) {
    return blocked("running", "This browser profile is already open on this Relay PC.", local.deviceId);
  }
  if (!getStatusPresentation(profile.status).canLaunch) {
    return blocked(
      "account-blocked",
      "This nick status does not allow the browser profile to open.",
      local.deviceId,
    );
  }
  if (!profile.proxy) {
    return blocked("proxy-missing", "Assign a static proxy before launch.", local.deviceId);
  }
  if (PROBLEM_VERDICTS.includes(profile.proxy.lastCheckVerdict as never)) {
    return blocked(
      "proxy-unhealthy",
      "The assigned proxy needs attention before launch.",
      local.deviceId,
    );
  }
  if (!profile.antidetectProfileId) {
    return blocked("profile-missing", "Create the browser profile before opening it.", local.deviceId);
  }
  if (!profile.device) {
    return blocked("device-missing", "Assign this nick to a Relay PC before opening its browser profile.");
  }
  if (!local.ready) return local;
  if (!local.deviceId) {
    return blocked(
      "device-unverified",
      "Relay could not verify this PC assignment. Open Setup and retry.",
    );
  }
  if (profile.device.id !== local.deviceId) {
    return blocked(
      "wrong-device",
      "Open this page on the Relay PC assigned to this nick.",
      local.deviceId,
    );
  }
  return local;
}

export function safeProxyPresentation(proxy: {
  country: string;
  lastCheckVerdict: string | null;
}): { label: string; status: string; healthy: boolean } {
  const country = proxy.country.trim().toUpperCase();
  const unhealthy = PROBLEM_VERDICTS.includes(proxy.lastCheckVerdict as never);
  return {
    label: country === "VN" ? "Vietnam" : country || "Assigned proxy",
    status: unhealthy
      ? "Needs attention"
      : proxy.lastCheckVerdict
        ? "Verified"
        : "Check required",
    healthy: !unhealthy && proxy.lastCheckVerdict !== null,
  };
}

const LAUNCH_FAILURE_MESSAGE_BY_CODE: Record<string, string> = {
  RECOVERY_PENDING: "The local browser is recovering a prior session. Retry after recovery finishes.",
  NO_CAPACITY: "All local browser capacity is in use or cooling. Close an open browser profile, then retry.",
  CAPACITY_UNKNOWN: "The local browser could not verify available capacity. Keep it open and retry.",
  BROWSER_OFFLINE: "Open MKT Browser on this PC, then retry.",
  ENGINE_NOT_READY: "The local browser is not ready. Open it and retry.",
  ENGINE_UNAVAILABLE: "The local browser is not ready. Open it and retry.",
  CONTRACT_MISMATCH: "Install the matching MKT Browser release on this PC, then retry.",
  CAPABILITY_MISSING: "Update MKT Browser on this PC, then retry.",
  UNKNOWN_TOOL: "Update MKT Browser on this PC, then retry.",
  PROXY_REJECTED: "The assigned proxy could not start. Check the proxy and retry.",
  PROFILE_ALREADY_RUNNING: "This browser profile is already open on this Relay PC.",
};

export function describeProfileLaunchFailure(outcome: RelayOutcome<unknown>): string {
  if (outcome.status === "ok") return "";
  if (outcome.status === "unreachable") return "Start Relay on this PC, then retry.";
  if (outcome.status === "no-permission") {
    return (
      "The launch did not return in time. Check whether the browser opened; if not, allow " +
      "local network access and retry."
    );
  }

  const data = outcome.data;
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const diagnostic =
    body?.diagnostic && typeof body.diagnostic === "object"
      ? (body.diagnostic as Record<string, unknown>)
      : null;
  const code =
    typeof body?.code === "string"
      ? body.code
      : typeof diagnostic?.code === "string"
        ? diagnostic.code
        : null;
  return code && LAUNCH_FAILURE_MESSAGE_BY_CODE[code]
    ? LAUNCH_FAILURE_MESSAGE_BY_CODE[code]
    : "Relay rejected the browser profile launch. Open Setup and retry.";
}

export function describeProfileTicketFailure(status: number): string {
  if (status === 404) return "This nick is no longer available. Refresh the page.";
  if (status === 403) return "This launch request is no longer authorized. Refresh and retry.";
  if (status === 409) {
    return (
      "The nick, assigned proxy, or Relay PC is not ready. Review the nick setup and retry."
    );
  }
  return "MKTTool could not prepare a safe launch ticket. Retry or contact an administrator.";
}

function blocked(
  state: string,
  message: string,
  deviceId: string | null = null,
): LocalLaunchReadiness {
  return { ready: false, state, message, deviceId };
}
