"use server";

import type { ActionResult } from "@/lib/actions/action-result";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import type { SetupDeviceRegistry } from "./setup-state-machine";
import {
  RelayDeviceKeyError,
  assertRelayPublicKeyUsable,
  relayPublicKeyToHex,
  relayPublicKeyToKeyObject,
} from "@/lib/tickets/relay-device-key";

const deviceSelection = {
  id: true,
  userId: true,
  publicKey: true,
  revokedAt: true,
  operatorKeyReadyAt: true,
  operatorKeyGrant: true,
  operatorKeyGrantId: true,
  operatorKeyGrantHash: true,
  operatorKeyGrantGeneration: true,
} as const;

export interface SetupDeviceInspection extends ActionResult {
  device?: SetupDeviceRegistry;
}

function normalizePublicKey(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const key = relayPublicKeyToKeyObject(value);
  assertRelayPublicKeyUsable(key);
  return relayPublicKeyToHex(key);
}

export const inspectSetupDevice = guardedAction(async function inspectSetupDevice(
  actor,
  _previous: SetupDeviceInspection | null,
  formData: FormData,
): Promise<SetupDeviceInspection> {
  let publicKey: string | undefined;
  try {
    publicKey = normalizePublicKey(formData.get("publicKey"));
  } catch (error) {
    if (error instanceof RelayDeviceKeyError) return { ok: false, message: error.message };
    throw error;
  }

  const deviceId = formData.get("deviceId");
  const localDeviceId = typeof deviceId === "string" && deviceId ? deviceId : undefined;
  if (!publicKey && !localDeviceId) {
    return { ok: true, message: "This PC is not registered yet.", device: { status: "not-enrolled" } };
  }

  const [byKey, byId] = await Promise.all([
    publicKey
      ? prisma.relayDevice.findUnique({
          where: { publicKey },
          select: deviceSelection,
        })
      : null,
    localDeviceId
      ? prisma.relayDevice.findUnique({
          where: { id: localDeviceId },
          select: deviceSelection,
        })
      : null,
  ]);

  if (byKey?.revokedAt || byId?.revokedAt) {
    // Recovery guidance requires both local identifiers to resolve to the same owned record.
    const exactOwnedDevice = byKey && byId && byKey.id === byId.id && byKey.userId === actor.userId;
    return {
      ok: true,
      message: "This PC uses a revoked device key.",
      device: {
        status: "enrolled", revoked: true, conflict: "revoked-key",
        ...(exactOwnedDevice ? { ownerUserId: actor.userId } : {}),
      },
    };
  }
  if (byKey && byId && byKey.id !== byId.id) {
    return {
      ok: true,
      message: "The local Windows account contains conflicting device identities.",
      device: { status: "enrolled", conflict: "shared-windows-account" },
    };
  }
  if (localDeviceId && byKey && !byId) {
    return {
      ok: true,
      message: "Relay contains a device ID that does not match its registered device key.",
      device: { status: "enrolled", conflict: "device-id-mismatch" },
    };
  }

  const device = byKey ?? byId;
  if (!device) {
    return { ok: true, message: "This PC is not registered yet.", device: { status: "not-enrolled" } };
  }
  if (publicKey && device.publicKey !== publicKey) {
    return {
      ok: true,
      message: "This PC still points at a previous device owner.",
      device: { status: "enrolled", conflict: "previous-owner" },
    };
  }
  if (device.userId !== actor.userId) {
    return {
      ok: true,
      message: "This PC is registered to a different signed-in user.",
      device: { status: "enrolled", conflict: "wrong-signed-in-user" },
    };
  }

  return {
    ok: true,
    message: "This PC is registered to the signed-in owner.",
    device: {
      status: "enrolled",
      ownerUserId: actor.userId,
      operatorKeyReady: Boolean(device.operatorKeyReadyAt),
      operatorKeyGrantNeedsReissue: Boolean(
        !device.operatorKeyReadyAt &&
        device.operatorKeyGrant &&
        (device.operatorKeyGrantGeneration < 1 || !device.operatorKeyGrantId || !device.operatorKeyGrantHash),
      ),
    },
  };
});
