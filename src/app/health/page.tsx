import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
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
      <ParkedScopeBanner what="Reddit shadowban checks" />
      <PageHeading
        title="Nick health"
        description="Check each nick from a public viewer's perspective through an observer proxy. Shadowbans are silent; without checks, the whole group can fail before anyone notices."
      />

      <Card title="Nick health checks">
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
          The &quot;Check again now&quot; button checks only that nick. Use &quot;Check all
          nicks&quot; for a full run equivalent to <code>npm run health</code>, without opening a
          terminal.
        </p>
      </Card>

      <Card title="Daily health-check schedule">
        <DailyScheduleSummary schedule={schedule} />
      </Card>

      {withTrend.length > 0 ? (
        <Card title={`Karma trend - ${KARMA_TREND_DAYS} days`}>
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

      <Card title="Health-check history">
        {recent.length === 0 ? (
          <EmptyState>
            No health checks yet. Add an observer proxy on the{" "}
            <Link href="/proxies" className="underline">
              Proxy page
            </Link>{" "}
            and run <code>npm run health</code>.
          </EmptyState>
        ) : (
          <DataTable headers={["Time", "Nick", "Verdict", "Karma", "Visible / posted", "Reason"]}>
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
                        image: {check.screenshotPath}
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
