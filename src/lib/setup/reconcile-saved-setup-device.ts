import type { SetupDeviceRegistry } from "./setup-state-machine";

export type SavedSetupDeviceReconciliation =
  | { storage: "unchanged" }
  | { storage: "clear" }
  | { storage: "replace"; deviceId: string };

export function reconcileSavedSetupDevice(input: {
  savedDeviceId: string | null;
  liveDeviceId: string | null;
  device: SetupDeviceRegistry;
  viewerUserId: string;
}): SavedSetupDeviceReconciliation {
  const { savedDeviceId, liveDeviceId, device, viewerUserId } = input;

  if (device.status === "not-enrolled") {
    return savedDeviceId ? { storage: "clear" } : { storage: "unchanged" };
  }

  const safeSameOwnerDevice =
    device.status === "enrolled" &&
    !device.revoked &&
    !device.conflict &&
    device.ownerUserId === viewerUserId &&
    Boolean(liveDeviceId);
  if (!safeSameOwnerDevice || !liveDeviceId || liveDeviceId === savedDeviceId) {
    return { storage: "unchanged" };
  }

  return { storage: "replace", deviceId: liveDeviceId };
}
