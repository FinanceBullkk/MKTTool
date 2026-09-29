import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import type { Actor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { lockRelayDeviceThenAccount } from "@/lib/db/account-ticket-row-locks";
import { issueTicket } from "./ticket-issuer";
import type { ResolvedRecipient } from "./ticket-recipient-lookup";
import { TICKET_KINDS, type CredentialField, type SignedTicket } from "./ticket-types";

export interface SecretTicketAccountSnapshot {
  id: string;
  ownerId: string | null;
  deviceId: string | null;
  updatedAt: Date;
}

export interface LockedSecretTicket {
  ticket: SignedTicket;
  deviceName: string;
}

type SecretRequest =
  | { kind: "credential"; field: CredentialField }
  | { kind: "otp" };

export async function issueLockedAccountSecretTicket(input: {
  actor: Actor;
  account: SecretTicketAccountSnapshot;
  recipient: ResolvedRecipient;
  request: SecretRequest;
}): Promise<LockedSecretTicket | ActionResult> {
  const { actor, account, recipient, request } = input;

  return prisma.$transaction(async (tx): Promise<LockedSecretTicket | ActionResult> => {
    await lockRelayDeviceThenAccount(tx, recipient.deviceId, account.id);

    const currentDevice = await tx.relayDevice.findUnique({
      where: { id: recipient.deviceId },
      select: { id: true, name: true, publicKey: true, userId: true, revokedAt: true },
    });
    const currentAccount = await tx.account.findUnique({
      where: { id: account.id },
      select: {
        ownerId: true,
        deviceId: true,
        updatedAt: true,
        passwordEnc: true,
        emailPasswordEnc: true,
        totpSecretEnc: true,
      },
    });

    if (!currentAccount || !currentDevice) {
      return {
        ok: false,
        message:
          "The nick or Relay PC assignment changed while the ticket was being prepared. Reload the page and try again.",
      };
    }

    const accountChanged =
      currentAccount.updatedAt.getTime() !== account.updatedAt.getTime() ||
      currentAccount.ownerId !== account.ownerId ||
      currentAccount.deviceId !== account.deviceId;
    const actorStillAuthorized =
      actor.role === "ADMIN" || currentAccount.ownerId === actor.userId;
    const routeStillValid =
      currentAccount.deviceId === null || currentAccount.deviceId === recipient.deviceId;
    const deviceStillValid =
      currentDevice.userId === actor.userId &&
      currentDevice.revokedAt === null &&
      currentDevice.publicKey === recipient.publicKey;

    if (accountChanged || !actorStillAuthorized || !routeStillValid || !deviceStillValid) {
      return {
        ok: false,
        message:
          "The nick or Relay PC assignment changed while the ticket was being prepared. Reload the page and try again.",
      };
    }

    const ciphertext =
      request.kind === "otp"
        ? currentAccount.totpSecretEnc
        : request.field === "password"
          ? currentAccount.passwordEnc
          : currentAccount.emailPasswordEnc;
    if (!ciphertext) {
      return {
        ok: false,
        message: "The requested secret changed while the ticket was being prepared. Reload the page and try again.",
      };
    }

    const ticket = issueTicket(
      request.kind === "otp"
        ? {
            kind: TICKET_KINDS.OTP,
            accountId: account.id,
            totpSecretCiphertext: ciphertext,
          }
        : {
            kind: TICKET_KINDS.CREDENTIAL,
            accountId: account.id,
            field: request.field,
            credentialCiphertext: ciphertext,
          },
      { deviceId: currentDevice.id, publicKey: currentDevice.publicKey },
    );

    await tx.auditLog.create({
      data: {
        accountId: account.id,
        action:
          request.kind === "otp"
            ? AUDIT_ACTIONS.OTP_GENERATED
            : AUDIT_ACTIONS.CREDENTIAL_REVEALED,
        detail:
          request.kind === "otp"
            ? `Relay PC "${currentDevice.name}"`
            : `${request.field} -> Relay PC "${currentDevice.name}"`,
        actorId: actor.userId,
      },
    });

    return { ticket, deviceName: currentDevice.name };
  });
}
