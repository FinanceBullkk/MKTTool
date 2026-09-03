import { coldStartDaysRemaining } from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";
import { Constellation } from "@/components/mktbrowser-ui/Constellation";
import { TeamScopeNotice } from "@/components/layout/team-scope-notice";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const accounts = await prisma.account.findMany({
    include: {
      proxy: true,
      owner: { select: { email: true } },
      device: { select: { id: true, name: true, userId: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

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
    owner: acc.owner ? { email: acc.owner.email } : null,
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
      <Constellation profiles={profiles} />
    </>
  );
}

