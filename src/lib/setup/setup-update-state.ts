import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";
import type { SetupRelayHealth, SetupUpdateState } from "./setup-state-types";

export function currentSetupUpdateState(relay: SetupRelayHealth): SetupUpdateState {
  if (relay.status === "checking" || relay.status === "starting") return { status: "starting" };
  if (relay.status !== "responded") return { status: "current" };

  const { health } = relay;
  if (!Number.isInteger(health.relayVersion) || health.relayVersion <= 0) {
    return { status: "failed" };
  }
  if (health.relayVersion < RELAY_VERSION) return { status: "required" };
  return { status: "current" };
}
