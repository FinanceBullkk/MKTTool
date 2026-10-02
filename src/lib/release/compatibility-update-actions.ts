"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { buildProxyConfig } from "@/lib/antidetect/proxy-config-builder";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import {
  compatibilitySequenceForFrom,
  readRelayCompatibilityRelease,
  relayVersionForCompatibilitySequence,
} from "@/lib/relay/relay-compatibility-manifest-file";
import { issueTicket } from "@/lib/tickets/ticket-issuer";
import { loadServerSigningKeys } from "@/lib/tickets/server-signing-key";
import { TICKET_KINDS, type SignedTicket } from "@/lib/tickets/ticket-types";
import { managedCompatibilityArtifactPaths } from "./compatibility-artifact-paths";
import { COMPATIBILITY_SMOKE_OBSERVER_PROXY_LABEL_ENV } from "./compatibility-update-configuration";
import {
  COMPATIBILITY_ARTIFACT_LIFETIME_MS,
  COMPATIBILITY_UPDATE_COMMAND_LIFETIME_MS,
  signCompatibilityUpdateAuthorization,
} from "./compatibility-update-authorization";
import { signedManifestDigest } from "./compatibility-manifest-crypto";

const requestSchema = z.object({
  deviceId: z.string().min(1, "Device is required."),
  currentSequence: z.coerce.number().int().nonnegative().default(0),
  repairMissingState: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  expectedTargetSequence: z.coerce.number().int().positive("Target sequence is required."),
});

export interface CompatibilityUpdateTicketResult extends ActionResult {
  ticket?: SignedTicket;
  targetSequence?: number;
  repairMissingState?: boolean;
}

export const issueCompatibilityUpdateTicket = adminAction(
  async function issueCompatibilityUpdateTicket(
    actor,
    _previous: CompatibilityUpdateTicketResult | null,
    formData: FormData,
  ): Promise<CompatibilityUpdateTicketResult> {
    const parsed = requestSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

    try {
      const label = process.env[COMPATIBILITY_SMOKE_OBSERVER_PROXY_LABEL_ENV]?.trim();
      if (!label) {
        return {
          ok: false,
          message: `Set ${COMPATIBILITY_SMOKE_OBSERVER_PROXY_LABEL_ENV} to the dedicated no-login ObserverProxy label.`,
        };
      }
      const targetSequence = compatibilitySequenceForFrom(parsed.data.currentSequence);
      const [device, observerProxy, release] = await Promise.all([
        prisma.relayDevice.findUnique({
          where: { id: parsed.data.deviceId },
          select: { id: true, name: true, publicKey: true, revokedAt: true },
        }),
        prisma.observerProxy.findUnique({ where: { label } }),
        readRelayCompatibilityRelease(
          relayVersionForCompatibilitySequence(targetSequence),
          targetSequence,
        ),
      ]);
      if (!device) return { ok: false, message: "This PC is not registered." };
      if (device.revokedAt) {
        return { ok: false, message: "A revoked PC cannot receive a compatibility update ticket." };
      }
      if (!observerProxy?.active) {
        return {
          ok: false,
          message: `The configured compatibility smoke ObserverProxy "${label}" is missing or inactive.`,
        };
      }
      if (release.manifest.manifest.sequence !== parsed.data.expectedTargetSequence) {
        return {
          ok: false,
          message: "The signed compatibility target changed. Review the new target before retrying.",
        };
      }

      let smokeProxy;
      try {
        smokeProxy = buildProxyConfig(observerProxy);
      } catch {
        return {
          ok: false,
          message: `The configured compatibility smoke ObserverProxy "${label}" is invalid or cannot be decrypted.`,
        };
      }
      const webOrigin = configuredWebOrigin();
      const authenticatedArtifactPaths = managedCompatibilityArtifactPaths(
        release.manifest.manifest.artifacts,
        webOrigin,
      );
      const issuedAt = new Date();
      const authorization = signCompatibilityUpdateAuthorization(
        loadServerSigningKeys().privateKey,
        {
          schemaVersion: 1,
          type: "mkttool.compatibility-update-authorization",
          authorizationId: randomUUID(),
          actorUserId: actor.userId,
          authorizedRole: "ADMIN",
          deviceId: device.id,
          sequence: release.manifest.manifest.sequence,
          manifestDigest: signedManifestDigest(release.manifest),
          repairMissingState: parsed.data.repairMissingState,
          authenticatedArtifactPaths,
          issuedAt: issuedAt.toISOString(),
          commandExpiresAt: new Date(
            issuedAt.getTime() + COMPATIBILITY_UPDATE_COMMAND_LIFETIME_MS,
          ).toISOString(),
          artifactExpiresAt: new Date(
            issuedAt.getTime() + COMPATIBILITY_ARTIFACT_LIFETIME_MS,
          ).toISOString(),
        },
      );
      const ticket = issueTicket(
        {
          kind: TICKET_KINDS.COMPATIBILITY_UPDATE,
          manifest: release.manifest,
          revocations: release.revocations,
          authorization,
          smokeProfile: {
            proxyLabel: observerProxy.label,
            proxyCountry: observerProxy.country,
            proxy: smokeProxy,
          },
        },
        { deviceId: device.id, publicKey: device.publicKey },
      );

      await prisma.auditLog.create({
        data: {
          action: AUDIT_ACTIONS.COMPATIBILITY_UPDATE_AUTHORIZED,
          detail:
            `${actor.email} authorized compatibility sequence ${authorization.sequence} for ` +
            `"${device.name}" (${device.id}); authorization ${authorization.authorizationId}; ` +
            `repairMissingState=${authorization.repairMissingState}; smoke proxy "${observerProxy.label}"`,
          actorId: actor.userId,
        },
      });
      return {
        ok: true,
        message: `Compatibility sequence ${authorization.sequence} is authorized for this PC for 60 seconds.`,
        ticket,
        targetSequence: authorization.sequence,
        repairMissingState: authorization.repairMissingState,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Compatibility update authorization failed: ${(error as Error).message}`,
      };
    }
  },
);

function configuredWebOrigin(): string {
  const value = process.env.RELAY_WEB_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (!value) throw new Error("RELAY_WEB_ORIGIN or BETTER_AUTH_URL must identify the artifact host.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("The compatibility artifact host must use HTTPS outside local development.");
  }
  return url.origin;
}
