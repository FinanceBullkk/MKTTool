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
  if (outcome.status === "unreachable" || outcome.status === "no-permission") {
    return {
      relay: { status: outcome.status === "unreachable" ? "unreachable" : "permission-denied" },
      health: null,
      detail: outcome.message,
    };
  }
  if (!outcome.data?.publicKey) {
    return {
      relay: { status: "unreachable" },
      health: null,
      detail: "A local process answered, but it was not a compatible MKTTool Relay.",
    };
  }

  const health = outcome.data;
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
