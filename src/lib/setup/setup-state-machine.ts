import {
  currentDeviceBrowserReadiness,
  REQUIRED_SETUP_BROWSER_CAPABILITIES,
} from "@/lib/relay/current-device-browser-health";
import type {
  SetupPrimaryAction,
  SetupState,
  SetupStateMachineInput,
  SetupStateResult,
} from "./setup-state-types";

export type * from "./setup-state-types";

const result = (
  state: SetupState,
  action: SetupPrimaryAction,
  message: string,
): SetupStateResult => ({ state, action, message });

export function setupStateMachine(input: SetupStateMachineInput): SetupStateResult {
  if (input.session.status === "loading") {
    return result("Starting", { kind: "WAIT", label: "Checking setup" }, "Checking your session.");
  }

  if (input.session.status === "signed-out") {
    return result(
      "Sign in",
      { kind: "SIGN_IN", label: "Sign in with Google", href: "/login?callbackURL=/setup" },
      "Sign in with your approved team account to continue.",
    );
  }

  if (
    input.device.status === "retirement-pending" ||
    (input.relay.status === "responded" && input.relay.health.retirementPending)
  ) {
    return result(
      "Needs repair",
      { kind: "ADMIN", label: "Finish device retirement", href: "/relay-devices" },
      "This PC has removed its Relay identity. Finish the protected retirement receipt before installing or enrolling Relay again.",
    );
  }

  if (input.device.conflict || input.device.revoked) {
    return result(
      "Needs repair",
      { kind: "ADMIN", label: "Contact an administrator", href: "/relay-devices" },
      "This PC cannot be safely matched to the signed-in owner. An administrator must repair the binding.",
    );
  }

  if (input.device.status === "inspection-failed") {
    return result(
      "Needs repair",
      { kind: "ADMIN", label: "Contact an administrator", href: "/relay-devices" },
      "MKTTool could not verify this PC against the device registry.",
    );
  }

  if (
    input.device.status === "enrolled" &&
    (!input.device.ownerUserId || input.device.ownerUserId !== input.session.userId)
  ) {
    return result(
      "Needs repair",
      { kind: "ADMIN", label: "Contact an administrator", href: "/relay-devices" },
      "This PC is registered to a different owner.",
    );
  }

  if (input.update.status === "failed") {
    return result(
      "Needs repair",
      { kind: "ADMIN", label: "Contact an administrator", href: "/relay-devices" },
      "The installed compatibility set could not be verified.",
    );
  }

  if (input.update.status === "required") {
    return result(
      "Needs repair",
      { kind: "UPDATE", label: "Download the current installer", href: "/setup#download" },
      "This PC needs the current MKTTool for Windows release.",
    );
  }

  if (input.update.status === "starting" || input.relay.status === "checking") {
    return result(
      "Starting",
      { kind: "WAIT", label: "Checking again automatically" },
      "MKTTool on this PC is still starting.",
    );
  }

  if (input.relay.status === "unchecked") {
    return result(
      "Confirm this PC",
      { kind: "CONFIRM", label: "Confirm this PC" },
      "Confirm the detected PC and signed-in email before this page checks the local apps.",
    );
  }

  if (input.relay.status === "permission-denied") {
    return result(
      "Needs repair",
      { kind: "RETRY", label: "Allow local access and retry" },
      "The browser blocked access to MKTTool running on this PC.",
    );
  }

  if (input.relay.status === "unreachable") {
    return result(
      "Needs repair",
      { kind: "UPDATE", label: "Download the Windows installer", href: "/setup#download" },
      "MKTTool is not running on this PC.",
    );
  }

  if (input.device.status === "not-enrolled" && input.relay.status === "responded") {
    return result(
      "Confirm this PC",
      { kind: "CONFIRM", label: "Confirm this PC" },
      "Review the detected PC and signed-in email, then confirm the binding.",
    );
  }

  if (input.relay.status !== "responded") {
    return result(
      "Needs repair",
      { kind: "RETRY", label: "Check this PC again" },
      "The local setup state could not be determined.",
    );
  }

  const { health } = input.relay;
  if (input.device.status !== "enrolled" || !health.deviceId) {
    return result(
      "Needs repair",
      { kind: "RETRY", label: "Confirm this PC again" },
      "This PC did not finish registration. Retry without creating another enrollment.",
    );
  }

  if (input.device.operatorKeyGrantNeedsReissue) {
    return result(
      "Needs repair",
      { kind: "ADMIN", label: "Ask an administrator to issue a new grant", href: "/relay-devices" },
      "A pending grant was created by an older server version and cannot be delivered safely.",
    );
  }

  if (!input.device.operatorKeyReady) {
    return result(
      "Waiting for administrator approval",
      { kind: "WAIT", label: "Waiting for administrator approval" },
      "Setup is saved. You can close this page; there is nothing else to do.",
    );
  }

  if (!health.configured) {
    return result(
      "Needs repair",
      { kind: "ADMIN", label: "Ask an administrator to reissue this PC's grant", href: "/relay-devices" },
      "The registry says this PC is ready, but its local Relay no longer has a complete configuration.",
    );
  }

  const browser = currentDeviceBrowserReadiness(
    health.browser,
    REQUIRED_SETUP_BROWSER_CAPABILITIES,
  );
  if (!browser.ready) {
    const becomingReady = ["browser-offline", "engine-not-ready"].includes(browser.state);
    return becomingReady
      ? result(
          "Starting",
          { kind: "WAIT", label: "Checking again automatically" },
          browser.message,
        )
      : result(
          "Needs repair",
          { kind: "UPDATE", label: "Download the current installer", href: "/setup#download" },
          browser.message,
        );
  }

  return result(
    "Ready",
    { kind: "CONTINUE", label: "Continue to MKTTool", href: "/" },
    "MKTTool is ready on this PC.",
  );
}
