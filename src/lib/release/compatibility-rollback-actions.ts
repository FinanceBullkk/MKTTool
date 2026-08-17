"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { signRollbackAuthorization, type RollbackAuthorization } from "./rollback-authorization";
import { loadServerSigningKeys } from "@/lib/tickets/server-signing-key";

const AUTHORIZATION_LIFETIME_MS = 60_000;
const requestSchema = z
  .object({
    deviceId: z.string().min(1, "Device is required."),
    currentSequence: z.coerce.number().int().positive(),
    retainedSequence: z.coerce.number().int().positive(),
  })
  .refine((value) => value.retainedSequence < value.currentSequence, {
    message: "The retained compatibility set must be older than the active set.",
  });

export interface CompatibilityRollbackAuthorizationResult extends ActionResult {
  authorization?: RollbackAuthorization;
}

export const issueCompatibilityRollbackAuthorization = adminAction(
  async function issueCompatibilityRollbackAuthorization(
    actor,
    _previous: CompatibilityRollbackAuthorizationResult | null,
    formData: FormData,
  ): Promise<CompatibilityRollbackAuthorizationResult> {
    const parsed = requestSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

    const device = await prisma.relayDevice.findUnique({
      where: { id: parsed.data.deviceId },
      select: { id: true, name: true, revokedAt: true },
    });
    if (!device) return { ok: false, message: "This PC is not registered." };
    if (device.revokedAt) {
      return { ok: false, message: "A revoked PC cannot receive a compatibility rollback authorization." };
    }

    const issuedAt = new Date();
    const authorization = signRollbackAuthorization(loadServerSigningKeys().privateKey, {
      schemaVersion: 1,
      type: "mkttool.compatibility-rollback-authorization",
      authorizationId: randomUUID(),
      adminUserId: actor.userId,
      authorizedRole: "ADMIN",
      deviceId: device.id,
      currentSequence: parsed.data.currentSequence,
      retainedSequence: parsed.data.retainedSequence,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + AUTHORIZATION_LIFETIME_MS).toISOString(),
    });

    await prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.COMPATIBILITY_ROLLBACK_AUTHORIZED,
        detail:
          `${actor.email} authorized compatibility rollback for "${device.name}" (${device.id}) ` +
          `from sequence ${authorization.currentSequence} to ${authorization.retainedSequence}; ` +
          `authorization ${authorization.authorizationId}`,
        actorId: actor.userId,
      },
    });

    return {
      ok: true,
      message: "Compatibility rollback is authorized for this PC for 60 seconds.",
      authorization,
    };
  },
);
