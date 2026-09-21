import type { RelayBrowserHealth } from "./relay-endpoints";
import { parseMktBrowserLicenseCapacity, type MktBrowserLicenseCapacity } from "../antidetect/mkt-browser-contract";

export const REQUIRED_MANAGED_BROWSER_CAPABILITIES = [
  "idempotent-create-v1",
  "atomic-launch-v1",
  "managed-profile-v1",
  "operation-diagnostics-v1",
] as const;

export const REQUIRED_SETUP_BROWSER_CAPABILITIES = [
  ...REQUIRED_MANAGED_BROWSER_CAPABILITIES,
  "local-install-ready-v1",
] as const;

export type CurrentDeviceBrowserState =
  | "browser-offline"
  | "contract-mismatch"
  | "engine-not-ready"
  | "capability-missing"
  | "capacity-unknown"
  | "recovery-pending"
  | "no-capacity"
  | "ready";

export type CurrentDeviceBrowserFailureCode =
  | "BROWSER_OFFLINE"
  | "CONTRACT_MISMATCH"
  | "ENGINE_NOT_READY"
  | "CAPABILITY_MISSING"
  | "CAPACITY_UNKNOWN"
  | "RECOVERY_PENDING"
  | "NO_CAPACITY";

const FAILURE_CODE_BY_STATE: Record<
  Exclude<CurrentDeviceBrowserState, "ready">,
  CurrentDeviceBrowserFailureCode
> = {
  "browser-offline": "BROWSER_OFFLINE",
  "contract-mismatch": "CONTRACT_MISMATCH",
  "engine-not-ready": "ENGINE_NOT_READY",
  "capability-missing": "CAPABILITY_MISSING",
  "capacity-unknown": "CAPACITY_UNKNOWN",
  "recovery-pending": "RECOVERY_PENDING",
  "no-capacity": "NO_CAPACITY",
};

export function currentDeviceBrowserFailureCode(
  state: CurrentDeviceBrowserState,
): CurrentDeviceBrowserFailureCode | null {
  return state === "ready" ? null : FAILURE_CODE_BY_STATE[state];
}

export interface CurrentDeviceBrowserReadiness {
  ready: boolean;
  state: CurrentDeviceBrowserState;
  message: string;
}

export function currentDeviceBrowserReadiness(
  browser: RelayBrowserHealth | null | undefined,
  requiredCapabilities: readonly string[] = REQUIRED_MANAGED_BROWSER_CAPABILITIES,
): CurrentDeviceBrowserReadiness {
  if (!browser?.ready || !browser.provider) {
    return {
      ready: false,
      state: "browser-offline",
      message: "Open MKT Browser on this PC, then check again.",
    };
  }

  if (!browser.contractCompatible) {
    return {
      ready: false,
      state: "contract-mismatch",
      message: "Install the matching MKT Browser release on this PC.",
    };
  }

  if (!browser.engine || !["ready", "dev-system"].includes(browser.engine.status)) {
    return {
      ready: false,
      state: "engine-not-ready",
      message: "Open MKT Browser and wait for its browser engine to become ready.",
    };
  }

  const capabilities = Array.isArray(browser.capabilities)
    ? browser.capabilities.filter((capability): capability is string => typeof capability === "string")
    : [];
  const missing = requiredCapabilities.filter((capability) => !capabilities.includes(capability));
  if (missing.length > 0) {
    if (missing.includes("local-install-ready-v1")) {
      return {
        ready: false,
        state: "capability-missing",
        message: "Repair the current MKT Browser installation on this PC, then check again.",
      };
    }
    return {
      ready: false,
      state: "capability-missing",
      message: "Update MKT Browser on this PC before continuing.",
    };
  }

  // Capacity is still a safety input while its rollout capability remains unadvertised.
  if (browser.engine.kind === "cloakbrowser") {
    const capacity = parseMktBrowserLicenseCapacity(browser.licenseCapacity);
    if (!capacity) {
      return {
        ready: false,
        state: "capacity-unknown",
        message: "MKT Browser could not verify available browser capacity. Open it and check its licence and recovery state before continuing.",
      };
    }
    if (capacity.free === 0 && capacity.pendingRecovery > 0) {
      return {
        ready: false,
        state: "recovery-pending",
        message: capacity.retryAt
          ? capacityWaitMessage(capacity)
          : "MKT Browser is recovering a prior browser session. Wait for recovery to finish, then check capacity before trying once manually.",
      };
    }
    if (capacity.free === 0) {
      return {
        ready: false,
        state: "no-capacity",
        message: capacityWaitMessage(capacity),
      };
    }
  }

  return {
    ready: true,
    state: "ready",
    message: "MKT Browser technical checks passed on this PC; identity isolation is not proven.",
  };
}

function capacityWaitMessage(capacity: MktBrowserLicenseCapacity): string {
  if (capacity.retryAt) {
    return `Browser capacity is waiting. Earliest permitted manual retry: ${capacity.retryAt} (UTC). ` +
      "Do not retry before this time; repeated attempts may extend the wait. This time does not guarantee that a seat is available.";
  }
  if (capacity.cooling > 0) {
    return "Browser capacity is waiting after a session ended or was refused. Check the wait shown in MKT Browser before trying once manually; repeated attempts may extend it.";
  }
  if (capacity.active > 0) {
    return "All browser capacity is in use. Closing a profile starts a waiting period; check MKT Browser for the next permitted retry.";
  }
  return "No browser capacity is available. Check the licence and wait state in MKT Browser before trying once manually.";
}
