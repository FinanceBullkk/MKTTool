"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { issueGrantAuthorization } from "@/lib/relay/enrollment/grant-authorization";
import { hashGrantCompletionProof } from "@/lib/relay/enrollment/grant-digests";
import { sealForDevice } from "@/lib/tickets/ticket-sealed-box";
import { loadServerSigningKeys } from "@/lib/tickets/server-signing-key";

const BOOTSTRAP_LIFETIME_MS = 300_000;
const deviceSchema = z.object({ deviceId: z.string().min(1) });

export interface BootstrapAuthorizationResult extends ActionResult {
  authorization?: string;
}

export const mintBootstrapAuthorization = adminAction(async function mintBootstrapAuthorization(
  _actor,
  _prev: BootstrapAuthorizationResult | null,
  formData: FormData,
): Promise<BootstrapAuthorizationResult> {
  const parsed = deviceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(40304)`;
    const device = await tx.relayDevice.findUnique({ where: { id: parsed.data.deviceId } });
    if (!device || device.revokedAt || device.retirementId) {
      return { ok: false, message: "This PC is unavailable for bootstrap." };
    }
    if (device.operatorKeyReadyAt) return { ok: false, message: "This PC is already ready." };
    const readyCount = await tx.relayDevice.count({ where: { operatorKeyReadyAt: { not: null }, revokedAt: null } });
    if (readyCount > 0) return { ok: false, message: "Bootstrap is only available before the first ready device." };
    const now = new Date();
    const selected = await tx.relayDevice.findFirst({
      where: {
        id: { not: device.id }, revokedAt: null, bootstrapAuthorizationId: { not: null },
        bootstrapAuthorizationExpiresAt: { gt: now }, bootstrapAuthorizationUsedAt: null,
      },
    });
    if (selected) return { ok: false, message: "Another PC is already selected for first-device bootstrap." };
    if (device.bootstrapAuthorization && device.bootstrapAuthorizationExpiresAt && device.bootstrapAuthorizationExpiresAt > now && !device.bootstrapAuthorizationUsedAt) {
      return { ok: true, message: "Existing bootstrap authorization is still active.", authorization: device.bootstrapAuthorization };
    }

    const proof = randomBytes(32).toString("base64url");
    const completion = sealForDevice({ proof }, device.publicKey);
    const generation = device.operatorKeyGrantGeneration + 1;
    const authorizationId = randomUUID();
    const grantHash = createHash("sha256").update(`bootstrap\n${authorizationId}`).digest("hex");
    const authorization = issueGrantAuthorization({
      kind: "bootstrap", authorizationId, deviceId: device.id, recipientPublicKey: device.publicKey,
      grantId: authorizationId, generation, grantHash, completionHash: hashGrantCompletionProof(proof),
      completionEphemeralPublicKey: completion.ephemeralPublicKey, completionSealed: completion.sealed,
    }, loadServerSigningKeys().privateKey, now.getTime(), BOOTSTRAP_LIFETIME_MS);
    const committed = await tx.relayDevice.updateMany({
      where: { id: device.id, revokedAt: null, retirementId: null },
      data: {
        operatorKeyGrantGeneration: generation, operatorKeyCompletionHash: hashGrantCompletionProof(proof),
        bootstrapAuthorizationId: authorizationId, bootstrapAuthorization: authorization,
        bootstrapAuthorizationExpiresAt: new Date(now.getTime() + BOOTSTRAP_LIFETIME_MS), bootstrapAuthorizationUsedAt: null,
      },
    });
    if (committed.count === 0) {
      return { ok: false, message: "This PC became unavailable before bootstrap was authorized." };
    }
    return { ok: true, message: "Bootstrap authorized for five minutes.", authorization };
  });
});

export const completeBootstrap = adminAction(async function completeBootstrap(
  _actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z.object({ deviceId: z.string(), grantId: z.string(), generation: z.coerce.number().int(), proof: z.string() }).safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const result = await prisma.$transaction(async (tx): Promise<ActionResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(40304)`;
    const device = await tx.relayDevice.findUnique({ where: { id: parsed.data.deviceId } });
    if (!device) return { ok: false, message: "This PC is unavailable." };
    if (
      device.operatorKeyCompletedGrantId === parsed.data.grantId &&
      device.operatorKeyCompletedGeneration === parsed.data.generation
    ) return { ok: true, message: "This PC is already ready." };
    if (
      device.bootstrapAuthorizationId !== parsed.data.grantId ||
      device.operatorKeyGrantGeneration !== parsed.data.generation ||
      device.revokedAt || device.bootstrapAuthorizationUsedAt || !device.operatorKeyCompletionHash ||
      hashGrantCompletionProof(parsed.data.proof) !== device.operatorKeyCompletionHash
    ) return { ok: false, message: "Bootstrap completion proof is invalid or no longer current." };

    const readyElsewhere = await tx.relayDevice.count({
      where: { id: { not: device.id }, operatorKeyReadyAt: { not: null }, revokedAt: null },
    });
    if (readyElsewhere > 0) {
      return { ok: false, message: "Bootstrap ended because another PC became ready first." };
    }

    const committed = await tx.relayDevice.updateMany({
      where: {
        id: device.id, revokedAt: null, operatorKeyReadyAt: null,
        bootstrapAuthorizationId: parsed.data.grantId,
        operatorKeyGrantGeneration: parsed.data.generation,
        bootstrapAuthorizationUsedAt: null,
        operatorKeyCompletionHash: device.operatorKeyCompletionHash,
      },
      data: {
        operatorKeyReadyAt: new Date(), bootstrapAuthorizationUsedAt: new Date(),
        bootstrapAuthorization: null,
        operatorKeyCompletedGrantId: parsed.data.grantId,
        operatorKeyCompletedGeneration: parsed.data.generation,
      },
    });
    if (committed.count === 0) {
      const current = await tx.relayDevice.findUnique({ where: { id: device.id } });
      if (
        current?.operatorKeyCompletedGrantId === parsed.data.grantId &&
        current.operatorKeyCompletedGeneration === parsed.data.generation
      ) return { ok: true, message: "This PC is already ready." };
      return { ok: false, message: "Bootstrap completion proof is no longer current." };
    }
    return { ok: true, message: "This PC is ready." };
  });
  if (!result.ok) return result;
  revalidatePath("/setup");
  revalidatePath("/relay-devices");
  return result;
});
