import {
  pingRelay,
  type RelayOutcome,
} from "@/lib/relay/relay-browser-client";
import type { RelayHealth, RelayReply } from "@/lib/relay/relay-endpoints";
import { inspectSetupDevice } from "./setup-device-actions";
import type { SetupDeviceRegistry, SetupRelayHealth } from "./setup-state-machine";

export interface SetupRelayProbeResult {
  relay: SetupRelayHealth;
  health: RelayHealth | null;
  device?: SetupDeviceRegistry;
  detail?: string;
}

export async function probeSetupRelay(): Promise<SetupRelayProbeResult> {
  const outcome: RelayOutcome<RelayHealth & RelayReply> = await pingRelay();
  if (
    outcome.status === "unreachable" ||
    outcome.status === "indeterminate" ||
    outcome.status === "no-permission" ||
    outcome.status === "timeout"
  ) {
    return {
      relay: {
        status:
          outcome.status === "unreachable"
            ? "unreachable"
            : outcome.status === "indeterminate"
              ? "indeterminate"
            : outcome.status === "no-permission"
              ? "permission-denied"
              : "timeout",
      },
      health: null,
      detail:
        outcome.status === "timeout"
          ? "Relay did not report local setup status in time. Keep it open, then check this PC again."
      : outcome.message,
    };
  }
  if (outcome.data?.startupState === "pending") {
    return {
      relay: { status: "starting" },
      health: null,
      detail: "Relay is still starting on this PC. Keep it open, then check again automatically.",
    };
  }
  if (outcome.data?.startupState === "failed") {
    return {
      relay: { status: "startup-failed" },
      health: null,
      detail: "Relay could not finish starting on this PC. Open its status page, then check this PC again.",
    };
  }
  const health = outcome.data;
  if (!health?.publicKey) {
    return {
      relay: { status: "unreachable" },
      health: null,
      detail: "A local process answered, but it was not a compatible MKTTool Relay.",
    };
  }

  if (health.retirementPending) {
    return {
      relay: { status: "responded", health },
      health,
      device: { status: "retirement-pending" },
      detail: "This PC has retired its Relay identity and cannot be enrolled again until retirement confirmation finishes.",
    };
  }

  const form = new FormData();
  form.set("publicKey", health.publicKey);
  if (health.deviceId) form.set("deviceId", health.deviceId);
  try {
    const inspected = await inspectSetupDevice(null, form);
    const device = "device" in inspected ? inspected.device : undefined;
    return {
      relay: { status: "responded", health },
      health,
      device: inspected.ok && device ? device : { status: "inspection-failed" },
      detail: inspected.ok && device ? undefined : "MKTTool could not verify this PC safely.",
    };
  } catch {
    return {
      relay: { status: "responded", health },
      health,
      device: { status: "inspection-failed" },
      detail: "MKTTool could not verify this PC safely.",
    };
  }
}
