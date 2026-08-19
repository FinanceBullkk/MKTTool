import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { ProxyConsole } from "@/components/proxies/proxy-console";

export const dynamic = "force-dynamic";

export default async function ProxiesPage() {
  const [proxies, viewer] = await Promise.all([
    prisma.proxy.findMany({
      orderBy: { label: "asc" },
      include: { account: { select: { username: true, platform: true } } },
    }),
    readActor(),
  ]);

  const isAdmin = viewer?.role === "ADMIN";

  return <ProxyConsole proxies={proxies} isAdmin={isAdmin} />;
}
