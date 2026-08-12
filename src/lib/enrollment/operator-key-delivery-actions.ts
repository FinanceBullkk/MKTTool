"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { issueGrantAuthorization } from "@/lib/relay/enrollment/grant-authorization";
import { hashGrantCompletionProof, hashOperatorKeyGrant } from "@/lib/relay/enrollment/grant-digests";
import type { OperatorKeyDeliveryRequest, SealedOperatorKeyGrant } from "@/lib/relay/relay-endpoints";
import { sealForDevice } from "@/lib/tickets/ticket-sealed-box";
import { loadServerSigningKeys } from "@/lib/tickets/server-signing-key";
import { decideOperatorKeyCompletion } from "./operator-key-completion";

const DELIVERY_LIFETIME_MS = 30_000;
const deviceSchema = z.object({ deviceId: z.string().min(1, "Device is required.") });
const completionSchema = deviceSchema.extend({
  grantId: z.string().min(1),
  generation: z.coerce.number().int().positive(),
  proof: z.string().min(1).max(500),
});

export interface OperatorKeyDeliveryResult extends ActionResult {
  state?: "ready" | "waiting" | "already";
  delivery?: OperatorKeyDeliveryRequest;
}


export const readOperatorKeyDelivery = guardedAction(async function readOperatorKeyDelivery(
  actor,
  _prev: OperatorKeyDeliveryResult | null,
  formData: FormData,
): Promise<OperatorKeyDeliveryResult> {
  const parsed = deviceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  let device = await readDevice(parsed.data.deviceId);
  if (!device) return { ok: false, message: "This PC is not registered." };
  if (device.userId !== actor.userId) {
    return { ok: false, message: "This PC belongs to a different signed-in user." };
  }
  if (device.revokedAt) return { ok: false, message: "This PC has been revoked." };
  if (device.operatorKeyReadyAt) return { ok: true, message: "This PC is ready.", state: "already" };
  if (device.operatorKeyGrant && !hasGrant(device)) {
    return { ok: false, message: "This pending grant is from an older server version. Ask an administrator to issue a new grant." };
  }
  if (!hasGrant(device)) return { ok: true, message: "Waiting for administrator approval.", state: "waiting" };

  const now = new Date();
  if (!device.operatorKeyDeliveryAuthorization || !device.operatorKeyDeliveryExpiresAt || device.operatorKeyDeliveryExpiresAt <= now) {
    const existingCompletion = parseCompletionGrant(device.operatorKeyCompletionGrant);
    const hasCompletionGrant = device.operatorKeyCompletionGrant !== null;
    const hasCompletionHash = device.operatorKeyCompletionHash !== null;
    if (hasCompletionGrant !== hasCompletionHash || (hasCompletionGrant && !existingCompletion)) {
      return { ok: false, message: "Stored completion state is incomplete. Ask an administrator to issue a new grant." };
    }
    const completion = existingCompletion && device.operatorKeyCompletionHash
      ? { grant: existingCompletion, hash: device.operatorKeyCompletionHash }
      : createCompletion(device.publicKey);
    const expiresAt = new Date(now.getTime() + DELIVERY_LIFETIME_MS);
    const authorization = issueGrantAuthorization(
      {
        kind: "delivery",
        authorizationId: randomUUID(),
        deviceId: device.id,
        recipientPublicKey: device.publicKey,
        grantId: device.operatorKeyGrantId,
        generation: device.operatorKeyGrantGeneration,
        grantHash: device.operatorKeyGrantHash,
        completionHash: completion.hash,
        completionEphemeralPublicKey: completion.grant.ephemeralPublicKey,
        completionSealed: completion.grant.sealed,
      },
      loadServerSigningKeys().privateKey,
      now.getTime(),
      DELIVERY_LIFETIME_MS,
    );
    await prisma.relayDevice.updateMany({
      where: {
        id: device.id,
        userId: actor.userId,
        revokedAt: null,
        operatorKeyReadyAt: null,
        operatorKeyGrantId: device.operatorKeyGrantId,
        operatorKeyGrantGeneration: device.operatorKeyGrantGeneration,
        operatorKeyGrantHash: device.operatorKeyGrantHash,
        operatorKeyCompletionHash: device.operatorKeyCompletionHash,
        operatorKeyCompletionGrant: device.operatorKeyCompletionGrant,
        operatorKeyDeliveryAuthorization: device.operatorKeyDeliveryAuthorization,
        operatorKeyDeliveryExpiresAt: device.operatorKeyDeliveryExpiresAt,
      },
      data: {
        operatorKeyCompletionHash: completion.hash,
        operatorKeyCompletionGrant: JSON.stringify(completion.grant),
        operatorKeyDeliveryAuthorization: authorization,
        operatorKeyDeliveryExpiresAt: expiresAt,
      },
    });
    device = await readDevice(device.id);
  }
  if (!device) return { ok: false, message: "This PC is not registered." };
  if (device.userId !== actor.userId) return { ok: false, message: "This PC belongs to a different signed-in user." };
  if (device.revokedAt) return { ok: false, message: "This PC has been revoked." };
  if (device.operatorKeyReadyAt) return { ok: true, message: "This PC is ready.", state: "already" };
  if (!device || !hasAuthorizedGrant(device)) return { ok: false, message: "Grant authorization could not be prepared." };
  return {
    ok: true,
    message: "An authorized key grant is ready for this PC.",
    state: "ready",
    delivery: { grant: parseGrant(device.operatorKeyGrant), authorization: device.operatorKeyDeliveryAuthorization },
  };
});

export const completeOperatorKeyDelivery = guardedAction(async function completeOperatorKeyDelivery(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = completionSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const result = await prisma.$transaction(async (tx): Promise<ActionResult> => {
    // Serialize every transition to Ready with first-device bootstrap's global invariant.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(40304)`;
    const device = await tx.relayDevice.findUnique({ where: { id: parsed.data.deviceId } });
    if (!device) return { ok: false, message: "This PC is not registered." };
    if (device.userId !== actor.userId) return { ok: false, message: "This PC belongs to another user." };
    const decision = decideOperatorKeyCompletion(device, parsed.data);
    if (!decision.ok) return decision;
    if (decision.already) return { ok: true, message: "This PC is already ready." };

    const committed = await tx.relayDevice.updateMany({
      where: {
        id: device.id,
        userId: actor.userId,
        operatorKeyGrantId: parsed.data.grantId,
        operatorKeyGrantGeneration: parsed.data.generation,
        operatorKeyCompletionHash: device.operatorKeyCompletionHash,
        operatorKeyReadyAt: null,
        revokedAt: null,
      },
      data: {
        operatorKeyGrant: null,
        operatorKeyReadyAt: new Date(),
        operatorKeyCompletedGrantId: parsed.data.grantId,
        operatorKeyCompletedGeneration: parsed.data.generation,
        operatorKeyDeliveryAuthorization: null,
        operatorKeyDeliveryExpiresAt: null,
      },
    });
    if (committed.count === 0) {
      const current = await tx.relayDevice.findUnique({ where: { id: device.id } });
      if (
        current?.operatorKeyCompletedGrantId === parsed.data.grantId &&
        current.operatorKeyCompletedGeneration === parsed.data.generation
      ) return { ok: true, message: "This PC is already ready." };
      return { ok: false, message: "Relay completion proof is no longer current." };
    }
    return { ok: true, message: "This PC is ready." };
  });
  if (!result.ok) return result;
  revalidatePath("/relay-devices");
  return result;
});

async function readDevice(id: string) {
  return prisma.relayDevice.findUnique({ where: { id } });
}

function hasGrant(device: NonNullable<Awaited<ReturnType<typeof readDevice>>>): device is typeof device & {
  operatorKeyGrant: string; operatorKeyGrantId: string; operatorKeyGrantHash: string;
} {
  if (!device.operatorKeyGrant || !device.operatorKeyGrantId || !device.operatorKeyGrantHash || device.operatorKeyGrantGeneration < 1) return false;
  try { return hashOperatorKeyGrant(parseGrant(device.operatorKeyGrant)) === device.operatorKeyGrantHash; } catch { return false; }
}

function hasAuthorizedGrant(device: NonNullable<Awaited<ReturnType<typeof readDevice>>>): device is typeof device & {
  operatorKeyGrant: string; operatorKeyDeliveryAuthorization: string;
} {
  return hasGrant(device) && Boolean(device.operatorKeyCompletionHash && device.operatorKeyCompletionGrant && device.operatorKeyDeliveryAuthorization);
}

function parseGrant(value: string): SealedOperatorKeyGrant {
  const raw = JSON.parse(value) as Partial<SealedOperatorKeyGrant>;
  if (typeof raw.ephemeralPublicKey !== "string" || typeof raw.sealed !== "string") throw new Error("Invalid grant");
  return { ephemeralPublicKey: raw.ephemeralPublicKey, sealed: raw.sealed };
}

function parseCompletionGrant(value: string | null): SealedOperatorKeyGrant | null {
  if (!value) return null;
  try { return parseGrant(value); } catch { return null; }
}

function createCompletion(publicKey: string): { grant: SealedOperatorKeyGrant; hash: string } {
  const proof = randomBytes(32).toString("base64url");
  return { grant: sealForDevice({ proof }, publicKey), hash: hashGrantCompletionProof(proof) };
}
