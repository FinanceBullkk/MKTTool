import { ProxyConfigError, buildProxyConfig } from "@/lib/antidetect/proxy-config-builder";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import type { Actor } from "@/lib/auth/require-actor";
import {
  lockProxyForTicket,
  lockRelayDeviceThenAccount,
} from "@/lib/db/account-ticket-row-locks";
import { prisma } from "@/lib/db/prisma-client";
import type { ProxyRecordForCheck } from "@/lib/proxies/proxy-liveness-check";
import { issueTicket } from "@/lib/tickets/ticket-issuer";
import type { ResolvedRecipient } from "@/lib/tickets/ticket-recipient-lookup";
import { TICKET_KINDS } from "@/lib/tickets/ticket-types";

export interface ProfileLaunchSnapshot {
  id: string;
  ownerId: string | null;
  deviceId: string | null;
  proxyId: string | null;
  antidetectProfileId: string | null;
  status: string;
  updatedAt: Date;
}

export type ProfileLaunchTicketResult =
  | {
      ok: true;
      ticket: string;
      deviceName: string;
      proxyLabel: string;
      proxyCountry: string;
      proxyProtocol: string;
    }
  | { ok: false; status: 409 | 502; message: string };

export async function issueLockedProfileLaunchTicket(input: {
  actor: Actor;
  account: ProfileLaunchSnapshot;
  proxy: ProxyRecordForCheck;
  recipient: ResolvedRecipient;
}): Promise<ProfileLaunchTicketResult> {
  const { actor, account, proxy, recipient } = input;

  return prisma.$transaction(async (tx): Promise<ProfileLaunchTicketResult> => {
    await lockRelayDeviceThenAccount(tx, recipient.deviceId, account.id);
    await lockProxyForTicket(tx, proxy.id);

    const currentDevice = await tx.relayDevice.findUnique({
      where: { id: recipient.deviceId },
      select: { id: true, name: true, publicKey: true, userId: true, revokedAt: true },
    });
    const currentAccount = await tx.account.findUnique({
      where: { id: account.id },
      select: {
        ownerId: true,
        deviceId: true,
        proxyId: true,
        antidetectProfileId: true,
        status: true,
        updatedAt: true,
      },
    });
    const currentProxy = await tx.proxy.findUnique({
      where: { id: proxy.id },
      select: {
        id: true,
        label: true,
        host: true,
        port: true,
        username: true,
        passwordEnc: true,
        country: true,
        protocol: true,
      },
    });

    if (!currentDevice || !currentAccount || !currentProxy || !currentAccount.antidetectProfileId) {
      return {
        ok: false,
        status: 409,
        message:
          "The nick, browser profile, proxy, or Relay PC assignment changed during the proxy check. Reload the page and try again.",
      };
    }

    const accountUnchanged =
      currentAccount.updatedAt.getTime() === account.updatedAt.getTime() &&
      currentAccount.ownerId === account.ownerId &&
      currentAccount.deviceId === account.deviceId &&
      currentAccount.proxyId === account.proxyId &&
      currentAccount.antidetectProfileId === account.antidetectProfileId &&
      currentAccount.status === account.status;
    const deviceAuthorized =
      currentDevice.userId === actor.userId &&
      currentDevice.revokedAt === null &&
      currentDevice.publicKey === recipient.publicKey &&
      currentAccount.ownerId === actor.userId &&
      currentAccount.deviceId === currentDevice.id;
    const proxyUnchanged = sameProxyTicketFields(currentProxy, proxy);

    if (!accountUnchanged || !deviceAuthorized || !proxyUnchanged) {
      return {
        ok: false,
        status: 409,
        message:
          "The nick, browser profile, proxy, or Relay PC assignment changed during the proxy check. Reload the page and try again.",
      };
    }

    let ticket: string;
    try {
      ticket = issueTicket(
        {
          kind: TICKET_KINDS.LAUNCH_PROFILE,
          accountId: account.id,
          antidetectProfileId: currentAccount.antidetectProfileId,
          proxyLabel: currentProxy.label,
          proxy: buildProxyConfig(currentProxy),
        },
        { deviceId: currentDevice.id, publicKey: currentDevice.publicKey },
      );
    } catch (error) {
      return {
        ok: false,
        status: 502,
        message:
          error instanceof ProxyConfigError
            ? error.message
            : "Could not create the browser-profile launch ticket. Check the server logs.",
      };
    }

    const updated = await tx.account.updateMany({
      where: { id: account.id, updatedAt: account.updatedAt },
      data: { lastActionAt: new Date() },
    });
    if (updated.count !== 1) {
      return {
        ok: false,
        status: 409,
        message:
          "The nick changed while the launch ticket was being committed. Reload the page and try again.",
      };
    }
    await tx.auditLog.create({
      data: {
        accountId: account.id,
        action: AUDIT_ACTIONS.PROFILE_LAUNCH_TICKET_ISSUED,
        detail: `proxy ${currentProxy.label} (${currentProxy.protocol}) -> Relay PC "${currentDevice.name}"`,
        actorId: actor.userId,
      },
    });

    return {
      ok: true,
      ticket,
      deviceName: currentDevice.name,
      proxyLabel: currentProxy.label,
      proxyCountry: currentProxy.country,
      proxyProtocol: currentProxy.protocol,
    };
  });
}

function sameProxyTicketFields(
  current: ProxyRecordForCheck,
  checked: ProxyRecordForCheck,
): boolean {
  return (
    current.id === checked.id &&
    current.label === checked.label &&
    current.host === checked.host &&
    current.port === checked.port &&
    current.username === checked.username &&
    current.passwordEnc === checked.passwordEnc &&
    current.country === checked.country &&
    current.protocol === checked.protocol
  );
}
