import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import {
  accountAgeInDays,
  coldStartDaysRemaining,
  getStatusPresentation,
} from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";
import { AccountVaultActionsPanel } from "./account-vault-actions-panel";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  return value ? value.toLocaleDateString("vi-VN") : "—";
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { persona: true, proxy: true },
  });

  if (!account) notFound();

  const presentation = getStatusPresentation(account.status);
  const coldDays = coldStartDaysRemaining(account.coldStartUntil);
  const age = accountAgeInDays(account.platformCreatedAt);

  const auditLogs = await prisma.auditLog.findMany({
    where: { accountId: id },
    orderBy: { at: "desc" },
    take: 20,
  });

  const facts: [string, string][] = [
    ["Nền tảng", account.platform],
    ["Nhân vật", `${account.persona.name} — ${account.persona.voice}`],
    ["Mảng nội dung", account.persona.contentAngle],
    [
      "Proxy",
      `${account.proxy.label} — ${account.proxy.protocol}://${account.proxy.host}:${account.proxy.port} ` +
        `(${account.proxy.country})`,
    ],
    ["Profile antidetect", account.antidetectProfileId],
    ["Email gốc", account.emailAddress],
    ["Karma", String(account.karma)],
    ["Tuổi nick", age === null ? "—" : `${age} ngày`],
    ["Ngày tạo trên nền tảng", formatDate(account.platformCreatedAt)],
    ["Ngày mua", formatDate(account.purchasedAt)],
    ["Cold-start tới", account.coldStartUntil ? formatDate(account.coldStartUntil) : "—"],
    ["Hoạt động gần nhất", account.lastActionAt ? account.lastActionAt.toLocaleString("vi-VN") : "—"],
  ];

  return (
    <>
      <Link href="/accounts" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Về danh sách
      </Link>

      <PageHeading title={account.username} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge label={presentation.label} className={presentation.className} />
        {coldDays > 0 ? (
          <span className="text-sm text-neutral-500">cold-start còn {coldDays} ngày</span>
        ) : null}
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{presentation.hint}</span>
      </div>

      {account.quarantineReason ? (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <strong>Lý do cách ly:</strong> {account.quarantineReason}
        </div>
      ) : null}

      <Card title="Thao tác">
        <AccountVaultActionsPanel
          accountId={account.id}
          hasTotp={account.totpSecretEnc !== null}
          canLaunch={presentation.canLaunch}
          launchBlockedReason={presentation.hint}
        />
      </Card>

      <Card title="Thông tin">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
              <dd className="mt-0.5 break-words text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {account.purchaseNote ? (
          <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Ghi chú mua: </span>
            {account.purchaseNote}
          </p>
        ) : null}
      </Card>

      <Card title="Nhật ký gần đây">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-neutral-500">Chưa có thao tác nào được ghi nhận.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex gap-3">
                <span className="shrink-0 font-mono text-xs text-neutral-500">
                  {log.at.toLocaleString("vi-VN")}
                </span>
                <span>
                  {log.action}
                  {log.detail ? (
                    <span className="text-neutral-500"> — {log.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
