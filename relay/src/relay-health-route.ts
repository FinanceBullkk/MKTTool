import os from "node:os";
import type {
  RelayBrowserHealth,
  RelayCompatibilityUpdateHealth,
  RelayStartupState,
} from "../../src/lib/relay/relay-endpoints";
import type { ConfigProblem } from "./relay-config";
import type { DeviceRetirementReceipt } from "./device-retirement-receipt";
import type { RelayResponseBody, RelayRoute } from "./relay-http-server";
import type { CompatibilityUpdateState } from "./update-state";
import { describeCompatibilityUpdateHealth } from "./compatibility-update-health";

interface CurrentRelayState {
  problems: ConfigProblem[];
  webOrigin: string;
  deviceId: string | null;
}

export interface CompatibilityUpdateHealthSnapshot {
  value: RelayCompatibilityUpdateHealth | undefined;
}

/**
 * Compatibility state is protected by DPAPI and can require a PowerShell child process. Read it
 * during isolated startup initialization; the operational health route only consults this snapshot.
 */
export function createCompatibilityUpdateHealthSnapshot(
  readState: () => CompatibilityUpdateState | null,
): CompatibilityUpdateHealthSnapshot {
  try {
    return { value: describeCompatibilityUpdateHealth(readState()) };
  } catch {
    // Update and rollback handlers still re-read their protected state and fail closed.
    return { value: undefined };
  }
}

export function createRelayStartupHealth(startupState: RelayStartupState): RelayResponseBody {
  const pending = startupState === "pending";
  return {
    ok: false,
    code: pending ? "RELAY_STARTUP_PENDING" : "RELAY_STARTUP_FAILED",
    startupState,
    message: pending
      ? "Relay is starting. Keep it open, then check again."
      : "Relay could not finish starting. Open its status page and repair the local installation.",
    configured: false,
    antidetectReady: false,
    browser: {
      ready: false,
      provider: null,
      appVersion: null,
      contractVersion: null,
      contractCompatible: false,
      contractProblem: "Relay startup is not complete.",
      engine: null,
      capabilities: [],
    },
  };
}

export function createRelayHealthRoute(options: {
  currentState(): CurrentRelayState;
  describeRuntime(): Promise<RelayBrowserHealth>;
  publicKey: string;
  notConfiguredMessage(): string;
  pendingRetirement(): DeviceRetirementReceipt | null;
  retirementHealth(receipt: DeviceRetirementReceipt): RelayResponseBody;
  compatibilityUpdate: CompatibilityUpdateHealthSnapshot;
  startupState?: () => RelayStartupState | null;
  machineName?: () => string;
}): RelayRoute {
  return async () => {
    const startupState = options.startupState?.();
    if (startupState) return createRelayStartupHealth(startupState);

    const pendingRetirement = options.pendingRetirement();
    if (pendingRetirement) return options.retirementHealth(pendingRetirement);

    const state = options.currentState();
    const browser = await options.describeRuntime();
    return {
      ok: state.problems.length === 0,
      message: state.problems.length === 0 ? "Relay is ready." : options.notConfiguredMessage(),
      publicKey: options.publicKey,
      machineName: (options.machineName ?? os.hostname)(),
      configured: state.problems.length === 0,
      deviceId: state.deviceId,
      webOrigin: state.webOrigin,
      antidetectReady: browser.ready,
      browser,
      ...(options.compatibilityUpdate.value
        ? { compatibilityUpdate: options.compatibilityUpdate.value }
        : {}),
    };
  };
}
