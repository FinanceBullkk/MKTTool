/**
 * Answers whether the browser PC is the PC represented by a device row.
 *
 * Retirement removes Relay credentials from that machine's disk. Previously, an administrator
 * could confirm a row before learning that the browser was on another PC. This pure comparison
 * lets the UI remove that misleading action before confirmation.
 *
 * The public key is the reliable identity signal. A server-issued `deviceId` is unavailable until
 * setup finishes, while an unconfigured Relay still reports its public key in a `rejected` reply.
 * Hiding the action on a missing device ID would remove the cleanup path from exactly the PC that
 * needs it.
 *
 * Only a definite public-key mismatch becomes `elsewhere`. Ambiguous states keep the action so its
 * click-time handler can perform the authoritative, user-activated check.
 */
import type { RelayOutcome } from "./relay-browser-client";
import type { RelayHealth, RelayReply } from "./relay-endpoints";

export type RelayDeviceLocality =
  /** The local Relay lookup has not finished. */
  | { state: "checking" }
  /** Locality is unknown; a user click is still allowed to retry with permission activation. */
  | { state: "unverified"; note: string }
  /** The browser is on the selected PC. */
  | { state: "match" }
  /** The browser is definitely on another PC because its public key differs. */
  | { state: "elsewhere"; note: string };

export interface RelayDeviceTarget {
  deviceId: string;
  publicKey: string;
  deviceName: string;
}

const RELAY_OFFLINE_NOTE =
  "No Relay was found on the PC showing this page, so it cannot be matched to a record yet.";

const RELAY_BLOCKED_NOTE =
  "This page has not been allowed to reach Relay on the PC showing it, so it cannot be matched " +
  "to a record yet.";

const RELAY_TIMEOUT_NOTE =
  "Relay did not report this PC before the request deadline, so it cannot be matched to a record yet.";

const RELAY_SILENT_NOTE = "Relay answered without reporting which PC it belongs to.";

const RELAY_UNCONFIGURED_NOTE =
  "This is the right PC, but its Relay has not finished setup. Open Setup here first.";

export function relayDeviceLocality(
  outcome: RelayOutcome<RelayHealth & RelayReply> | null,
  target: RelayDeviceTarget,
): RelayDeviceLocality {
  if (!outcome) return { state: "checking" };

  // An unconfigured Relay returns `rejected` while still carrying its identity body.
  const local = outcome.status === "ok" || outcome.status === "rejected" ? outcome.data : undefined;
  if (!local) {
    return {
      state: "unverified",
      note:
        outcome.status === "no-permission"
          ? RELAY_BLOCKED_NOTE
          : outcome.status === "timeout"
            ? RELAY_TIMEOUT_NOTE
            : RELAY_OFFLINE_NOTE,
    };
  }
  if (!local.publicKey) return { state: "unverified", note: RELAY_SILENT_NOTE };

  if (local.publicKey !== target.publicKey) {
    return {
      state: "elsewhere",
      note:
        `This page is open on a different PC. This action runs on ${target.deviceName} itself — ` +
        "open MKTTool there to use it.",
    };
  }
  if (local.deviceId !== target.deviceId) {
    return { state: "unverified", note: RELAY_UNCONFIGURED_NOTE };
  }
  return { state: "match" };
}
