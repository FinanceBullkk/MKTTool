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

  if (device.status === "retirement-pending") {
    return savedDeviceId ? { storage: "clear" } : { storage: "unchanged" };
  }

  if (device.status !== "enrolled") return { storage: "unchanged" };

  const unsafeAuthority =
    device.revoked ||
    Boolean(device.conflict) ||
    (Boolean(device.ownerUserId) && device.ownerUserId !== viewerUserId);
  if (unsafeAuthority) {
    return savedDeviceId ? { storage: "clear" } : { storage: "unchanged" };
  }

  if (!liveDeviceId || device.ownerUserId !== viewerUserId || liveDeviceId === savedDeviceId) {
    return { storage: "unchanged" };
  }

  return { storage: "replace", deviceId: liveDeviceId };
}
