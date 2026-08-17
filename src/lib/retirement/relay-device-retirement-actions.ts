"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import {
  hashDeviceRetirementProof,
  issueDeviceRetirementAuthorization,
} from "@/lib/relay/retirement/device-retirement-authorization";
import {
  createDeviceRetirementFinalizationKey,
  loadDeviceRetirementFinalizationKeys,
} from "@/lib/relay/retirement/device-retirement-finalization-key";
import { issueDeviceRetirementFinalization } from "@/lib/relay/retirement/device-retirement-finalization";
import type { SealedPayload } from "@/lib/tickets/ticket-sealed-box";
import { sealForDevice } from "@/lib/tickets/ticket-sealed-box";
import { loadServerSigningKeys } from "@/lib/tickets/server-signing-key";

const RETIREMENT_LIFETIME_MS = 30_000;
const deviceSchema = z.object({ deviceId: z.string().min(1, "Device is required.") });
const completionSchema = deviceSchema.extend({
  retirementId: z.string().min(1),
  proof: z.string().min(1).max(500),
});

export interface RelayDeviceRetirementResult extends ActionResult {
  state?: "ready" | "completed";
  retirementId?: string;
  authorization?: string;
  finalizationAuthorization?: string;
}

export const beginRelayDeviceRetirement = adminAction(async function beginRelayDeviceRetirement(
  actor,
  _previous: RelayDeviceRetirementResult | null,
  formData: FormData,
): Promise<RelayDeviceRetirementResult> {
  const parsed = deviceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const result = await prisma.$transaction(async (tx): Promise<RelayDeviceRetirementResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(40306)`;
    let device = await tx.relayDevice.findUnique({
      where: { id: parsed.data.deviceId },
      include: { user: { select: { email: true } } },
    });
    if (!device) return { ok: false, message: "This PC is not registered." };
    if (device.retirementCompletedAt || device.retirementFinalizationAuthorization) {
      if (
        !device.retirementCompletedAt ||
        !device.retirementId ||
        !device.retirementFinalizationAuthorization
      ) {
        return { ok: false, message: "Stored device retirement completion state is incomplete." };
      }
      return {
        ok: true,
        message: "Server revocation and local Relay cleanup are already confirmed.",
        state: "completed",
        retirementId: device.retirementId,
        finalizationAuthorization: device.retirementFinalizationAuthorization,
      };
    }

    const now = new Date();
    let retirementId = device.retirementId;
    let completionHash = device.retirementCompletionHash;
    let completionGrant = parseCompletionGrant(device.retirementCompletionGrant);
    let finalizationKeyEnc = device.retirementFinalizationKeyEnc;
    const firstStart = !retirementId;

    if (retirementId && (!completionHash || !completionGrant || !finalizationKeyEnc)) {
      return {
        ok: false,
        message: "Stored device retirement state is incomplete. Inspect this PC record before retrying.",
      };
    }
    if (!retirementId) {
      retirementId = randomUUID();
      const proof = randomBytes(32).toString("base64url");
      completionHash = hashDeviceRetirementProof(proof);
      completionGrant = sealForDevice({ proof }, device.publicKey);
      finalizationKeyEnc = createDeviceRetirementFinalizationKey().encryptedSeed;
    }
    if (!retirementId || !completionHash || !completionGrant || !finalizationKeyEnc) {
      return { ok: false, message: "Device retirement state could not be prepared safely." };
    }
    const finalizationKeys = loadDeviceRetirementFinalizationKeys(finalizationKeyEnc);

    const currentAuthorizationIsActive =
      device.retirementAuthorization &&
      device.retirementAuthorizationExpiresAt &&
      device.retirementAuthorizationExpiresAt > now;
    const authorization = currentAuthorizationIsActive
      ? device.retirementAuthorization!
      : issueDeviceRetirementAuthorization(
          {
            authorizationId: randomUUID(),
            retirementId,
            deviceId: device.id,
            recipientPublicKey: device.publicKey,
            completionHash,
            completionEphemeralPublicKey: completionGrant.ephemeralPublicKey,
            completionSealed: completionGrant.sealed,
            finalizationPublicKey: finalizationKeys.publicKeyHex,
          },
          loadServerSigningKeys().privateKey,
          now.getTime(),
          RETIREMENT_LIFETIME_MS,
        );
    const expiresAt = currentAuthorizationIsActive
      ? device.retirementAuthorizationExpiresAt
      : new Date(now.getTime() + RETIREMENT_LIFETIME_MS);

    await tx.relayDevice.update({
      where: { id: device.id },
      data: {
        revokedAt: device.revokedAt ?? now,
        operatorKeyGrant: null,
        operatorKeyCompletionGrant: null,
        operatorKeyDeliveryAuthorization: null,
        operatorKeyDeliveryExpiresAt: null,
        bootstrapAuthorization: null,
        bootstrapAuthorizationExpiresAt: null,
        retirementId,
        retirementCompletionHash: completionHash,
        retirementCompletionGrant: JSON.stringify(completionGrant),
        retirementAuthorization: authorization,
        retirementAuthorizationExpiresAt: expiresAt,
        retirementFinalizationKeyEnc: finalizationKeyEnc,
      },
    });
    const unpinned = await tx.account.updateMany({
      where: { deviceId: device.id },
      data: { deviceId: null },
    });
    if (firstStart) {
      await tx.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.RELAY_DEVICE_RETIREMENT_STARTED,
          detail:
            `${actor.email} started retirement for "${device.name}" owned by ${device.user.email} ` +
            `(${device.id}); ${unpinned.count} account assignments cleared`,
          actorId: actor.userId,
        },
      });
    }
    device = await tx.relayDevice.findUniqueOrThrow({
      where: { id: device.id },
      include: { user: { select: { email: true } } },
    });
    return {
      ok: true,
      message: "Server access is revoked. This PC can now remove its local Relay identity.",
      state: "ready",
      retirementId,
      authorization: device.retirementAuthorization!,
    };
  });

  if (result.ok) {
    revalidatePath("/relay-devices");
    revalidatePath("/accounts");
  }
  return result;
});

export const completeRelayDeviceRetirement = adminAction(
  async function completeRelayDeviceRetirement(
    actor,
    _previous: ActionResult | null,
    formData: FormData,
  ): Promise<ActionResult> {
    const parsed = completionSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

    const result = await prisma.$transaction(async (tx): Promise<ActionResult> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(40306)`;
      const device = await tx.relayDevice.findUnique({ where: { id: parsed.data.deviceId } });
      if (!device) return { ok: false, message: "This PC is not registered." };
      if (
        device.retirementCompletedAt &&
        device.retirementId === parsed.data.retirementId
      ) {
        if (!device.retirementFinalizationAuthorization) {
          return { ok: false, message: "Stored device retirement completion state is incomplete." };
        }
        return { ok: true, message: "Local Relay cleanup is already confirmed." };
      }
      if (
        !device.revokedAt ||
        device.retirementId !== parsed.data.retirementId ||
        !device.retirementCompletionHash ||
        hashDeviceRetirementProof(parsed.data.proof) !== device.retirementCompletionHash
      ) {
        return { ok: false, message: "Relay retirement completion proof is invalid or no longer current." };
      }

      const completedAt = new Date();
      if (!device.retirementFinalizationKeyEnc) {
        return { ok: false, message: "Stored device retirement finalization state is incomplete." };
      }
      const finalizationAuthorization = issueFinalizationAuthorization(device, completedAt);
      const committed = await tx.relayDevice.updateMany({
        where: {
          id: device.id,
          revokedAt: { not: null },
          retirementId: parsed.data.retirementId,
          retirementCompletionHash: device.retirementCompletionHash,
          retirementCompletedAt: null,
        },
        data: {
          retirementCompletedAt: completedAt,
          retirementAuthorization: null,
          retirementAuthorizationExpiresAt: null,
          retirementCompletionGrant: null,
          retirementFinalizationKeyEnc: null,
          retirementFinalizationAuthorization: finalizationAuthorization,
        },
      });
      if (committed.count === 0) {
        const current = await tx.relayDevice.findUnique({ where: { id: device.id } });
        if (current?.retirementCompletedAt && current.retirementId === parsed.data.retirementId) {
          return { ok: true, message: "Local Relay cleanup is already confirmed." };
        }
        return { ok: false, message: "Relay retirement completion proof is no longer current." };
      }
      await tx.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.RELAY_DEVICE_RETIREMENT_COMPLETED,
          detail: `${actor.email} confirmed local Relay cleanup for device ${device.id}`,
          actorId: actor.userId,
        },
      });
      return { ok: true, message: "Server revocation and local Relay cleanup are confirmed." };
    });

    if (result.ok) revalidatePath("/relay-devices");
    return result;
  },
);

export const issueRelayDeviceRetirementFinalization = adminAction(
  async function issueRelayDeviceRetirementFinalization(
    _actor,
    _previous: RelayDeviceRetirementResult | null,
    formData: FormData,
  ): Promise<RelayDeviceRetirementResult> {
    const parsed = deviceSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    const device = await prisma.relayDevice.findUnique({ where: { id: parsed.data.deviceId } });
    if (
      !device ||
      !device.retirementCompletedAt ||
      !device.retirementId ||
      !device.retirementFinalizationAuthorization
    ) {
      return { ok: false, message: "Server retirement completion is not confirmed for this PC." };
    }
    return {
      ok: true,
      message: "Server retirement completion is confirmed.",
      state: "completed",
      retirementId: device.retirementId,
      finalizationAuthorization: device.retirementFinalizationAuthorization,
    };
  },
);

function issueFinalizationAuthorization(
  device: {
    id: string;
    publicKey: string;
    retirementId: string | null;
    retirementCompletionHash: string | null;
    retirementFinalizationKeyEnc: string | null;
  },
  completedAt: Date,
): string {
  if (
    !device.retirementId ||
    !device.retirementCompletionHash ||
    !device.retirementFinalizationKeyEnc
  ) {
    throw new Error("Stored device retirement completion state is incomplete.");
  }
  const finalizationKeys = loadDeviceRetirementFinalizationKeys(
    device.retirementFinalizationKeyEnc,
  );
  return issueDeviceRetirementFinalization(
    {
      authorizationId: randomUUID(),
      retirementId: device.retirementId,
      deviceId: device.id,
      recipientPublicKey: device.publicKey,
      completionHash: device.retirementCompletionHash,
    },
    finalizationKeys.privateKey,
    completedAt.getTime(),
  );
}

function parseCompletionGrant(value: string | null): SealedPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SealedPayload>;
    if (typeof parsed.ephemeralPublicKey !== "string" || typeof parsed.sealed !== "string") {
      return null;
    }
    return { ephemeralPublicKey: parsed.ephemeralPublicKey, sealed: parsed.sealed };
  } catch {
    return null;
  }
}
