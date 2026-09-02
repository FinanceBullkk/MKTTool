import { coldStartDaysRemaining } from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";
import { Constellation } from "@/components/mktbrowser-ui/Constellation";
import { TeamScopeNotice } from "@/components/layout/team-scope-notice";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [accounts, freeProxies, devices] = await Promise.all([
    prisma.account.findMany({
      include: {
        proxy: true,
        device: { select: { id: true, name: true, userId: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.proxy.findMany({
      where: { account: null },
      orderBy: { label: "asc" },
      select: {
        id: true,
        label: true,
        host: true,
        port: true,
        country: true,
        type: true,
      },
    }),
    prisma.relayDevice.findMany({
      where: { revokedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const profiles = accounts.map((acc) => ({
    id: acc.id,
    username: acc.username,
    platform: acc.platform,
    status: acc.status,
    coldStartUntil: acc.coldStartUntil ? acc.coldStartUntil.toISOString() : null,
    coldStartDaysRemaining: coldStartDaysRemaining(acc.coldStartUntil),
    voice: acc.voice,
    contentAngle: acc.contentAngle,
    notes: acc.purchaseNote,
    firstLoginAt: acc.firstLoginAt ? acc.firstLoginAt.toISOString() : null,
    antidetectProfileId: acc.antidetectProfileId,
    device: acc.device
      ? {
          id: acc.device.id,
          name: acc.device.name,
          userId: acc.device.userId,
        }
      : null,
    proxy: acc.proxy
      ? {
          id: acc.proxy.id,
          label: acc.proxy.label,
          host: acc.proxy.host,
          port: acc.proxy.port,
          country: acc.proxy.country,
          type: acc.proxy.type,
          lastExitIp: acc.proxy.lastExitIp,
          lastCheckVerdict: acc.proxy.lastCheckVerdict,
        }
      : null,
  }));

  return (
    <>
      <TeamScopeNotice />
      <Constellation
        profiles={profiles}
        freeProxies={freeProxies}
        devices={devices}
      />
    </>
  );
}

