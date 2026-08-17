import type { RelayHealth } from "@/lib/relay/relay-endpoints";

export type SetupState =
  | "Starting"
  | "Sign in"
  | "Confirm this PC"
  | "Waiting for administrator approval"
  | "Ready"
  | "Needs repair";

export type SetupActionKind =
  | "WAIT"
  | "SIGN_IN"
  | "CONFIRM"
  | "ADMIN"
  | "RETRY"
  | "UPDATE"
  | "CONTINUE";

export interface SetupPrimaryAction {
  kind: SetupActionKind;
  label: string;
  href?: string;
}

export interface SetupSession {
  status: "loading" | "signed-out" | "signed-in";
  userId?: string;
  email?: string;
}

export type DeviceConflict =
  | "wrong-signed-in-user"
  | "previous-owner"
  | "device-id-mismatch"
  | "revoked-key"
  | "shared-windows-account";

export interface SetupDeviceRegistry {
  status:
    | "unknown"
    | "not-enrolled"
    | "enrolled"
    | "retirement-pending"
    | "inspection-failed";
  ownerUserId?: string;
  revoked?: boolean;
  operatorKeyReady?: boolean;
  operatorKeyGrantNeedsReissue?: boolean;
  conflict?: DeviceConflict;
}

export type SetupRelayHealth =
  | { status: "unchecked" | "checking" | "unreachable" | "permission-denied" }
  | { status: "responded"; health: RelayHealth };

export interface SetupUpdateState {
  status: "current" | "starting" | "required" | "failed";
}

export interface SetupStateMachineInput {
  session: SetupSession;
  device: SetupDeviceRegistry;
  relay: SetupRelayHealth;
  update: SetupUpdateState;
}

export interface SetupStateResult {
  state: SetupState;
  action: SetupPrimaryAction;
  message: string;
}
