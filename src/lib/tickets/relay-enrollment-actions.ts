"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { guardedAction } from "@/lib/auth/guarded-action";
import { isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";
import { prisma } from "@/lib/db/prisma-client";
import {
  RelayDeviceKeyError,
  assertRelayPublicKeyUsable,
  relayPublicKeyToHex,
  relayPublicKeyToKeyObject,
} from "./relay-device-key";
import { loadServerSigningKeys } from "./server-signing-key";

export interface RelayEnrollment {
  deviceId: string;
  serverPublicKey: string;
}

export interface EnrollmentResult extends ActionResult {
  enrollment?: RelayEnrollment;
}

const enrollmentSchema = z.object({
  name: z.string().trim().min(1, "Name this PC.").max(80, "PC name is too long."),
  userId: z.string().optional(),
  publicKey: z.string().min(1, "Relay public key is missing."),
});

export const enrollThisMachine = guardedAction(async function enrollThisMachine(
  actor,
  _prev: EnrollmentResult | null,
  formData: FormData,
): Promise<EnrollmentResult> {
  const parsed = enrollmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const userId = actor.role === "ADMIN" ? (parsed.data.userId ?? actor.userId) : actor.userId;

  let publicKey: string;
  try {
    const key = relayPublicKeyToKeyObject(parsed.data.publicKey);
    assertRelayPublicKeyUsable(key);
    publicKey = relayPublicKeyToHex(key);
  } catch (error) {
    if (error instanceof RelayDeviceKeyError) return { ok: false, message: error.message };
    throw error;
  }

  const existing = await prisma.relayDevice.findUnique({
    where: { publicKey },
    select: { id: true, name: true, userId: true, revokedAt: true, user: { select: { email: true } } },
  });
  if (existing?.revokedAt) {
    return {
      ok: false,
      message:
        `The key for "${existing.name}" has been revoked. Stop Relay, delete relay-device-key.json ` +
        "from its data directory, restart Relay, and confirm this PC again.",
    };
  }
  if (existing) {
    if (existing.userId !== userId) {
      return { ok: false, message: `This PC is already registered to ${existing.user.email}. An administrator must repair it.` };
    }
    return {
      ok: true,
      message: `This PC is already registered as "${existing.name}". Restoring local configuration.`,
      enrollment: { deviceId: existing.id, serverPublicKey: loadServerSigningKeys().publicKeyHex },
    };
  }

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!owner) return { ok: false, message: "The selected user does not exist." };
  if (!isEmailAllowed(owner.email, readEmailAccessList())) {
    return { ok: false, message: `${owner.email} is not currently allowed to sign in.` };
  }

  let device: { id: string };
  try {
    device = await prisma.relayDevice.create({
      data: { name: parsed.data.name, userId, publicKey },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const concurrent = await prisma.relayDevice.findUnique({
      where: { publicKey },
      select: { id: true, name: true, userId: true, revokedAt: true, user: { select: { email: true } } },
    });
    if (!concurrent || concurrent.revokedAt || concurrent.userId !== userId) {
      return { ok: false, message: "This PC was registered concurrently and now requires administrator review." };
    }
    return {
      ok: true,
      message: `This PC was already registered as "${concurrent.name}". Restoring local configuration.`,
      enrollment: { deviceId: concurrent.id, serverPublicKey: loadServerSigningKeys().publicKeyHex },
    };
  }
  await prisma.auditLog.create({
    data: {
      action: AUDIT_ACTIONS.RELAY_DEVICE_REGISTERED,
      detail: `${actor.email} registered "${parsed.data.name}" for ${owner.email} (${device.id}) from setup`,
      actorId: actor.userId,
    },
  });
  revalidatePath("/relay-devices");
  return {
    ok: true,
    message: `Registered "${parsed.data.name}" for ${owner.email}.`,
    enrollment: { deviceId: device.id, serverPublicKey: loadServerSigningKeys().publicKeyHex },
  };
});
