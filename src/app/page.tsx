import Link from "next/link";
import { AccountHealthTable } from "@/components/health/account-health-table";
import { ManualPostReminders } from "@/components/queue/manual-post-reminders";
import { PostingLoopStrip } from "@/components/queue/posting-loop-strip";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { OverviewAlertStack } from "./overview-alert-stack";
import {
  ACCOUNT_STATUSES,
  coldStartDaysRemaining,
  getStatusPresentation,
} from "@/lib/accounts/account-status";
import { loadOverviewPageData } from "@/lib/dashboard/overview-page-data";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const {
    accounts,
    manualReminders,
    healthRows,
    loopSummary,
    byStatus,
    counters,
    brokenProxies,
    clusterWarnings,
    backupWarning,
    duplicatePostedUrls,
    suspectPostedUrls,
    tokenWarnings,
    healthWarning,
    blockedJobCount,
    needsAttention,
  } = await loadOverviewPageData();

  return (
    <>
      <PageHeading
        title="Hôm nay"
        description="Bài phải đăng tay trong 24 tiếng tới, nick cần xử lý, và sức khỏe cả đàn."
      />

      {/* Thứ tự mười khối cảnh báo là một quyết định nghiệp vụ, không phải chuyện trình bày —
          xem đầu overview-alert-stack.tsx. */}
      <OverviewAlertStack
        brokenProxies={brokenProxies}
        clusterWarnings={clusterWarnings}
        backupWarning={backupWarning}
        duplicatePostedUrls={duplicatePostedUrls}
        suspectPostedUrls={suspectPostedUrls}
        tokenWarnings={tokenWarnings}
        healthWarning={healthWarning}
        blockedJobCount={blockedJobCount}
        needsAttention={needsAttention}
      />

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
            Chưa có nick nào. Thứ tự làm: thêm proxy → thêm nick.
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
