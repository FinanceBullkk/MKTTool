import type { RelayBrowserHealth } from "./relay-endpoints";

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
  | "ready";

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

  const missing = requiredCapabilities.filter(
    (capability) => !browser.capabilities.includes(capability),
  );
  if (missing.length > 0) {
    if (missing.includes("local-install-ready-v1")) {
      return {
        ready: false,
        state: "capability-missing",
        message:
          "Run the current MKT Browser installer repair on this PC. MKTTool could not verify the installed Browser, Relay, fixed ports, and startup entries.",
      };
    }
    return {
      ready: false,
      state: "capability-missing",
      message: `Update MKT Browser on this PC. Missing capabilities: ${missing.join(", ")}.`,
    };
  }

  return { ready: true, state: "ready", message: "MKT Browser is ready on this PC." };
}
