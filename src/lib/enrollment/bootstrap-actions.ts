"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import { guardedAction } from "@/lib/auth/guarded-action";
import {
  operatorKeyFingerprintMatches,
  readExpectedOperatorKeyFingerprint,
} from "@/lib/crypto/operator-key-fingerprint";
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

function configuredFingerprintResult():
  | { ok: true; fingerprint: string }
  | { ok: false; message: string } {
  try {
    return { ok: true, fingerprint: readExpectedOperatorKeyFingerprint() };
  } catch {
    return {
      ok: false,
      message:
        "Operator-key verification is not configured on MKTTool. Contact an administrator before entering the key.",
    };
  }
}

export const mintBootstrapAuthorization = guardedAction(async function mintBootstrapAuthorization(
  actor,
  _prev: BootstrapAuthorizationResult | null,
  formData: FormData,
): Promise<BootstrapAuthorizationResult> {
  const configured = configuredFingerprintResult();
  if (!configured.ok) return configured;
  const parsed = deviceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(40304)`;
    const device = await tx.relayDevice.findUnique({ where: { id: parsed.data.deviceId } });
    if (!device || device.revokedAt || device.retirementId) {
      return { ok: false, message: "This PC is unavailable for operator-key setup." };
    }
    if (device.userId !== actor.userId) {
      return { ok: false, message: "You can enter the operator key only for your own Relay PC." };
    }
    if (device.operatorKeyReadyAt) return { ok: false, message: "This PC is already ready." };
    const now = new Date();

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
      return { ok: false, message: "This PC became unavailable before key entry was authorized." };
    }
    return { ok: true, message: "Operator-key entry authorized for five minutes.", authorization };
  });
});

export const completeBootstrap = guardedAction(async function completeBootstrap(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const configured = configuredFingerprintResult();
  if (!configured.ok) return configured;
  const parsed = z.object({
    deviceId: z.string(),
    grantId: z.string(),
    generation: z.coerce.number().int(),
    proof: z.string(),
    keyFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  }).safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const result = await prisma.$transaction(async (tx): Promise<ActionResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(40304)`;
    const device = await tx.relayDevice.findUnique({ where: { id: parsed.data.deviceId } });
    if (!device) return { ok: false, message: "This PC is unavailable." };
    if (device.userId !== actor.userId) {
      return { ok: false, message: "You can complete operator-key setup only for your own Relay PC." };
    }
    if (
      device.operatorKeyCompletedGrantId === parsed.data.grantId &&
      device.operatorKeyCompletedGeneration === parsed.data.generation
    ) return { ok: true, message: "This PC is already ready." };
    if (
      device.bootstrapAuthorizationId !== parsed.data.grantId ||
      device.operatorKeyGrantGeneration !== parsed.data.generation ||
      device.revokedAt || device.retirementId || device.bootstrapAuthorizationUsedAt ||
      !device.bootstrapAuthorizationExpiresAt || device.bootstrapAuthorizationExpiresAt <= new Date() ||
      !device.operatorKeyCompletionHash ||
      hashGrantCompletionProof(parsed.data.proof) !== device.operatorKeyCompletionHash
    ) return { ok: false, message: "Operator-key completion proof is invalid or no longer current." };
    if (!operatorKeyFingerprintMatches(parsed.data.keyFingerprint, configured.fingerprint)) {
      return {
        ok: false,
        message:
          "The entered key does not match the current team operator key. Copy it again from Vaultwarden and retry.",
      };
    }

    const committed = await tx.relayDevice.updateMany({
      where: {
        id: device.id, revokedAt: null, retirementId: null, operatorKeyReadyAt: null,
        bootstrapAuthorizationId: parsed.data.grantId,
        operatorKeyGrantGeneration: parsed.data.generation,
        bootstrapAuthorizationUsedAt: null,
        bootstrapAuthorizationExpiresAt: { gt: new Date() },
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
      return { ok: false, message: "Operator-key completion proof is no longer current." };
    }
    return { ok: true, message: "This PC is ready." };
  });
  if (!result.ok) return result;
  revalidatePath("/setup");
  revalidatePath("/relay-devices");
  return result;
});
