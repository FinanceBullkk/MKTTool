import type { RelayBrowserHealth } from "./relay-endpoints";

export const REQUIRED_MANAGED_BROWSER_CAPABILITIES = [
  "idempotent-create-v1",
  "atomic-launch-v1",
  "managed-profile-v1",
  "operation-diagnostics-v1",
] as const;

export type CurrentDeviceBrowserState =
  | "browser-offline"
  | "contract-mismatch"
  | "engine-not-ready"
  | "capability-missing"
  | "ready";

export interface CurrentDeviceBrowserReadiness {
  ready: boolean;
  state: CurrentDeviceBrowserState;
  message: string;
}

export function currentDeviceBrowserReadiness(
  browser: RelayBrowserHealth | null | undefined,
): CurrentDeviceBrowserReadiness {
  if (!browser?.ready || !browser.provider) {
    return {
      ready: false,
      state: "browser-offline",
      message: "Open MKT Browser on this PC and make sure MCP is enabled.",
    };
  }

  if (!browser.contractCompatible) {
    return {
      ready: false,
      state: "contract-mismatch",
      message: browser.contractProblem || "Install the matching MKT Browser release on this PC.",
    };
  }

  if (!browser.engine || !["ready", "dev-system"].includes(browser.engine.status)) {
    return {
      ready: false,
      state: "engine-not-ready",
      message: "Open MKT Browser and wait for its browser engine to become ready.",
    };
  }

  const missing = REQUIRED_MANAGED_BROWSER_CAPABILITIES.filter(
    (capability) => !browser.capabilities.includes(capability),
  );
  if (missing.length > 0) {
    return {
      ready: false,
      state: "capability-missing",
      message: `Update MKT Browser on this PC. Missing capabilities: ${missing.join(", ")}.`,
    };
  }

  return { ready: true, state: "ready", message: "MKT Browser is ready on this PC." };
}
