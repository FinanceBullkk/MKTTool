import Link from "next/link";
import { AccountHealthTable } from "@/components/health/account-health-table";
import { DailyScheduleSummary } from "@/components/health/daily-schedule-summary";
import { HerdHealthCheckControls } from "@/components/health/herd-health-check-controls";
import { KarmaTrendChart } from "@/components/health/karma-trend-chart";
import { Card, DataTable, EmptyState, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import { readDailyHealthCheckSchedule } from "@/lib/health/daily-health-check-scheduler";
import { readHealthCheckLockStatus } from "@/lib/health/health-check-lock";
import {
  KARMA_TREND_DAYS,
  loadAccountHealthRows,
  loadKarmaTrend,
  loadRecentChecks,
} from "@/lib/health/health-dashboard-queries";
import { getVerdictPresentation } from "@/lib/health/health-verdict";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const rows = await loadAccountHealthRows();
  const recent = await loadRecentChecks(60);
  const lockStatus = await readHealthCheckLockStatus();
  const schedule = await readDailyHealthCheckSchedule();

  // Biểu đồ karma cho từng nick — chỉ vẽ nick nào đã có số liệu.
  const trends = await Promise.all(
    rows.map(async (row) => ({ row, points: await loadKarmaTrend(row.id) })),
  );
  const withTrend = trends.filter((entry) => entry.points.length > 0);

  return (
    <>
      <PageHeading
        title="Sức khỏe nick"
        description="Dò từ góc nhìn người ngoài, qua proxy quan sát viên. Shadowban im lặng — không đo thì ba tháng sau mới biết cả cụm đã chết."
      />

      <Card title="Đàn nick">
        <div className="mb-4">
          <HerdHealthCheckControls
            running={lockStatus.running}
            host={lockStatus.host}
            minutesElapsed={lockStatus.minutesElapsed}
            accountCount={rows.length}
          />
        </div>

        <AccountHealthTable rows={rows} />

        <p className="mt-4 text-xs text-neutral-500">
          Nút &quot;Dò lại ngay&quot; ở từng dòng chỉ dò một nick, dùng khi đang soi một nick đáng
          ngờ. Nút &quot;Dò cả đàn&quot; chạy đúng lệnh <code>npm run health</code>, chỉ khác là
          không phải mở terminal.
        </p>
      </Card>

      <Card title="Lịch dò hằng ngày">
        <DailyScheduleSummary schedule={schedule} />
      </Card>

      {withTrend.length > 0 ? (
        <Card title={`Xu hướng karma ${KARMA_TREND_DAYS} ngày`}>
          <div className="space-y-6">
            {withTrend.map(({ row, points }) => (
              <div key={row.id}>
                <h3 className="mb-1 text-sm font-medium">
                  <Link href={`/accounts/${row.id}`} className="hover:underline">
                    {row.username}
                  </Link>
                </h3>
                <KarmaTrendChart points={points} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Lịch sử dò">
        {recent.length === 0 ? (
          <EmptyState>
            Chưa có lần dò nào. Thêm proxy quan sát viên ở <Link href="/proxies" className="underline">trang Proxy</Link>{" "}
            rồi chạy <code>npm run health</code>.
          </EmptyState>
        ) : (
          <DataTable headers={["Lúc", "Nick", "Kết luận", "Karma", "Thấy / đã đăng", "Lý do"]}>
            {recent.map((check) => {
              const presentation = getVerdictPresentation(check.verdict);
              return (
                <tr key={check.id}>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs text-neutral-600 dark:text-neutral-400">
                    {formatDayMonthTime(check.checkedAt)}
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/accounts/${check.account.id}`} className="hover:underline">
                      {check.account.username}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge label={presentation.label} className={presentation.className} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{check.karma ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums text-neutral-600 dark:text-neutral-400">
                    {check.visiblePosts !== null && check.expectedPosts !== null
                      ? `${check.visiblePosts} / ${check.expectedPosts}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4 text-xs text-neutral-600 dark:text-neutral-400">
                    {check.detail}
                    {check.screenshotPath ? (
                      <span className="mt-1 block font-mono text-[11px] text-neutral-500">
                        ảnh: {check.screenshotPath}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>
    </>
  );
}
