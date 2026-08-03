import Link from "next/link";
import { AccountHealthTable } from "@/components/health/account-health-table";
import { ManualPostReminders } from "@/components/queue/manual-post-reminders";
import { PostingLoopStrip } from "@/components/queue/posting-loop-strip";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  coldStartDaysRemaining,
  getStatusPresentation,
} from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";
import { loadFacebookTokenWarnings } from "@/lib/facebook/facebook-token-warnings";
import { loadDueManualPostReminders } from "@/lib/queue/manual-post-reminders";
import { loadPostingLoopSummary } from "@/lib/queue/posting-loop-summary";
import { loadAccountHealthRows } from "@/lib/health/health-dashboard-queries";
import { evaluateHealthSetup } from "@/lib/health/health-setup-warning";
import { PROBLEM_VERDICTS, PROXY_CHECK_LABEL } from "@/lib/proxies/proxy-liveness-verdict";

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
    manualReminders,
    healthRows,
    loopSummary,
    brokenProxies,
    tokenWarnings,
    activeObserverProxyCount,
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
      loadDueManualPostReminders(),
      loadAccountHealthRows(),
      loadPostingLoopSummary(),
      // Chỉ đọc kết quả lần kiểm gần nhất — trang này không gọi mạng.
      prisma.proxy.findMany({
        where: { lastCheckVerdict: { in: PROBLEM_VERDICTS } },
        select: { id: true, label: true, lastCheckVerdict: true, lastCheckDetail: true },
        orderBy: { label: "asc" },
      }),
      loadFacebookTokenWarnings(),
      prisma.observerProxy.count({ where: { active: true } }),
    ]);

  // "Chưa dò" và "dò lâu rồi" đều là KHÔNG BIẾT — nhưng là hai kiểu không biết khác nhau, cần
  // hai câu khác nhau và hai việc phải làm khác nhau. Xem health-setup-warning.ts.
  const healthWarning = evaluateHealthSetup({
    redditAccountCount: healthRows.length,
    activeObserverProxyCount,
    neverCheckedCount: healthRows.filter((row) => row.latest === null).length,
    staleCount: healthRows.filter((row) => row.latest !== null && row.stale).length,
  });

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
        title="Hôm nay"
        description="Bài phải đăng tay trong 24 tiếng tới, nick cần xử lý, và sức khỏe cả đàn."
      />

      {/* Proxy đứng trước mọi cảnh báo khác: nick chạy bằng IP sai là hỏng không gỡ lại được,
          còn job bị chặn hay token hết hạn thì chỉ là chưa đăng được. */}
      {brokenProxies.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">{brokenProxies.length} proxy không dùng được:</p>
          <ul className="mt-2 space-y-1">
            {brokenProxies.map((proxy) => (
              <li key={proxy.id}>
                <Link href={`/proxies/${proxy.id}`} className="underline">
                  {proxy.label}
                </Link>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — {PROXY_CHECK_LABEL[proxy.lastCheckVerdict as "DEAD"] ?? proxy.lastCheckVerdict}
                  {proxy.lastCheckDetail ? `: ${proxy.lastCheckDetail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </AlertBanner>
      ) : null}

      {tokenWarnings.broken.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">
            {tokenWarnings.broken.length} Fanpage không đăng được vì token hỏng:
          </p>
          <ul className="mt-2 space-y-1">
            {tokenWarnings.broken.map((warning) => (
              <li key={warning.pageId}>
                {warning.pageName}{" "}
                <span className="text-neutral-600 dark:text-neutral-400">— {warning.message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <Link href="/facebook" className="underline">
              kết nối lại ở trang Facebook
            </Link>
          </p>
        </AlertBanner>
      ) : null}

      {tokenWarnings.expiringSoon.length > 0 ? (
        <AlertBanner tone="amber">
          {tokenWarnings.expiringSoon.length} Fanpage có token sắp hết hạn — hết giữa chừng là mọi
          Page dưới cùng một nick ngừng đăng được cùng lúc.{" "}
          <Link href="/facebook" className="underline">
            kết nối lại
          </Link>
          .
        </AlertBanner>
      ) : null}

      {healthWarning ? (
        <AlertBanner tone={healthWarning.tone}>
          {healthWarning.message}{" "}
          <Link href={healthWarning.href} className="underline">
            {healthWarning.linkLabel}
          </Link>
          .
        </AlertBanner>
      ) : null}

      {blockedJobCount > 0 ? (
        <AlertBanner tone="amber">
          {blockedJobCount} job bị bộ luật chặn khi kiểm tra lại —{" "}
          <Link href="/queue?status=BLOCKED" className="underline">
            xem lý do
          </Link>
          .
        </AlertBanner>
      ) : null}

      {needsAttention.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">{needsAttention.length} nick cần xử lý tay:</p>
          <ul className="mt-2 space-y-1">
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
        </AlertBanner>
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

      <Card title="Vòng đăng bài">
        <PostingLoopStrip summary={loopSummary} />
        <p className="mt-3 text-xs text-neutral-500">
          Bấm &quot;Đã đăng&quot; là thứ khép vòng này lại: nó ghi một Interaction, và chính dữ
          liệu đó nuôi luật chặn đụng độ thread, giãn cách và tỷ lệ 9:1 cho những bài sau.
        </p>
      </Card>

      {manualReminders.length > 0 ? (
        <Card title={`Đăng tay — ${manualReminders.length} bài`}>
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Reddit chưa có bộ tự đăng, còn Group thì Meta gỡ quyền từ 04/2024. Bấm mở profile, copy
            nội dung, dán và đăng — xong bấm &quot;Đã đăng&quot; kèm link ngay tại đây, vì bộ luật
            chỉ biết những gì được ghi lại.
          </p>
          <ManualPostReminders reminders={manualReminders} />
        </Card>
      ) : null}

      <Card title="Sức khỏe đàn nick">
        {accounts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Chưa có nick nào. Thứ tự làm: tạo nhân vật → thêm proxy → thêm nick.
          </p>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-3">
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

            <AccountHealthTable rows={healthRows} />

            <p className="mt-3 text-xs text-neutral-500">
              Trạng thái ở trên là thứ mình tự đặt; bảng dưới là thứ người ngoài thật sự nhìn
              thấy. Hai cái lệch nhau chính là lúc cần xem kỹ —{" "}
              <Link href="/health" className="underline">
                lịch sử dò và xu hướng karma
              </Link>
              .
            </p>
          </>
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
