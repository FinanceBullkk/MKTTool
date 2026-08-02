import Link from "next/link";
import { GroupPostReminders } from "@/components/queue/group-post-reminders";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  coldStartDaysRemaining,
  getStatusPresentation,
} from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";
import { loadDueGroupReminders } from "@/lib/facebook/facebook-group-reminder";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [
    accounts,
    personaCount,
    proxyCount,
    targetCount,
    contentCount,
    pendingJobCount,
    blockedJobCount,
    groupReminders,
  ] = await Promise.all([
      prisma.account.findMany({
        select: { id: true, username: true, status: true, coldStartUntil: true },
      }),
      prisma.persona.count(),
      prisma.proxy.count(),
      prisma.platformTarget.count(),
      prisma.contentItem.count(),
      prisma.postJob.count({ where: { status: "PENDING" } }),
      prisma.postJob.count({ where: { status: "BLOCKED" } }),
      loadDueGroupReminders(),
    ]);

  const byStatus = new Map<AccountStatus, number>();
  for (const status of ACCOUNT_STATUSES) byStatus.set(status, 0);
  for (const account of accounts) {
    const status = account.status as AccountStatus;
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }

  const needsAttention = accounts.filter((account) =>
    ["CHECKPOINT", "SHADOWBANNED"].includes(account.status),
  );

  const counters = [
    { label: "Chờ đăng", value: pendingJobCount, href: "/queue?status=PENDING" },
    { label: "Content", value: contentCount, href: "/content" },
    { label: "Tài khoản", value: accounts.length, href: "/accounts" },
    { label: "Nhân vật", value: personaCount, href: "/personas" },
    { label: "Proxy", value: proxyCount, href: "/proxies" },
    { label: "Đích đăng", value: targetCount, href: "/targets" },
  ];

  return (
    <>
      <PageHeading
        title="Tổng quan"
        description="Kho danh tính và bộ luật an toàn. Bộ dò shadowban + theo dõi karma thuộc Phase 03."
      />

      {blockedJobCount > 0 ? (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm text-amber-900 dark:text-amber-300">
            {blockedJobCount} job bị bộ luật chặn khi kiểm tra lại —{" "}
            <Link href="/queue?status=BLOCKED" className="underline">
              xem lý do
            </Link>
            .
          </p>
        </div>
      ) : null}

      {needsAttention.length > 0 ? (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            {needsAttention.length} nick cần xử lý tay:
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {needsAttention.map((account) => (
              <li key={account.id}>
                <Link href={`/accounts/${account.id}`} className="underline">
                  {account.username}
                </Link>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — {getStatusPresentation(account.status).label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {counters.map((counter) => (
          <Link
            key={counter.label}
            href={counter.href}
            className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
          >
            <div className="text-2xl font-semibold">{counter.value}</div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">{counter.label}</div>
          </Link>
        ))}
      </div>

      {groupReminders.length > 0 ? (
        <Card title={`Đăng tay vào Facebook Group — ${groupReminders.length} bài`}>
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Group không tự đăng được (Meta gỡ quyền từ 04/2024). Bấm mở profile, copy nội dung, dán
            và đăng — xong nhớ quay lại hàng đợi bấm &quot;Đã đăng&quot;.
          </p>
          <GroupPostReminders reminders={groupReminders} />
        </Card>
      ) : null}

      <Card title="Sức khỏe đàn nick">
        {accounts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Chưa có nick nào. Thứ tự làm: tạo nhân vật → thêm proxy → thêm nick.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {ACCOUNT_STATUSES.map((status) => {
              const presentation = getStatusPresentation(status);
              return (
                <div key={status} className="flex items-center gap-2">
                  <StatusBadge label={presentation.label} className={presentation.className} />
                  <span className="text-sm font-medium">{byStatus.get(status) ?? 0}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {accounts.some((account) => coldStartDaysRemaining(account.coldStartUntil) > 0) ? (
        <Card title="Đang cold-start">
          <ul className="space-y-1 text-sm">
            {accounts
              .filter((account) => coldStartDaysRemaining(account.coldStartUntil) > 0)
              .sort(
                (a, b) =>
                  coldStartDaysRemaining(a.coldStartUntil) - coldStartDaysRemaining(b.coldStartUntil),
              )
              .map((account) => (
                <li key={account.id}>
                  <Link href={`/accounts/${account.id}`} className="hover:underline">
                    {account.username}
                  </Link>
                  <span className="text-neutral-500">
                    {" "}
                    — còn {coldStartDaysRemaining(account.coldStartUntil)} ngày, chỉ đọc, cấm đăng
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
